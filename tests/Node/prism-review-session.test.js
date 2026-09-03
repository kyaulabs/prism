// $KYAULabs: prism-review-session.test.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    buildSessionPrompt,
    calculateContextBudget,
    inspectIsolatedRuntime,
    resolveActiveModel,
    runIsolatedSession,
} = require('../../packages/prism-core/scripts/prism-review/session-runner');
const {deepFreezeJson, validateClosedJsonSchema} = require('../../packages/prism-core/scripts/prism-review/schema');

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const TEMP_ROOT = path.join(REPOSITORY_ROOT, '.pi/prism-review/work/session-tests');
const ENV = {
    PI_PROVIDER: 'fixture-provider',
    PI_MODEL: 'fixture-model',
    PI_REASONING_LEVEL: 'high',
};
const MODEL = Object.freeze({
    provider: ENV.PI_PROVIDER,
    id: ENV.PI_MODEL,
    reasoning: true,
    contextWindow: 200000,
    maxTokens: 32768,
});
const SUBMIT_SCHEMA = Object.freeze({
    type: 'object',
    additionalProperties: false,
    properties: {answer: {type: 'string'}},
    required: ['answer'],
});

function fakeSdk(behavior, overrides = {}) {
    const calls = [];
    let registeredTools = [];
    const runtime = {
        getModel(provider, id) {
            calls.push({name: 'getModel', provider, id});
            return overrides.model === undefined ? MODEL : overrides.model;
        },
    };
    class DefaultResourceLoader {
        constructor(options) {
            calls.push({name: 'DefaultResourceLoader', options});
            this.options = options;
            this.extensions = [];
        }
        async reload() {
            calls.push({name: 'resourceLoader.reload'});
            registeredTools = [];
            for (const factory of this.options.extensionFactories ?? []) {
                factory({
                    registerTool(tool) { registeredTools.push(tool); },
                    on() {},
                });
                this.extensions.push({source: 'inline'});
            }
        }
        getExtensions() {
            return overrides.extensions ?? {extensions: this.extensions, errors: [], runtime: {}};
        }
        getSkills() { return overrides.skills ?? {skills: [], diagnostics: []}; }
        getPrompts() { return overrides.prompts ?? {prompts: [], diagnostics: []}; }
        getThemes() { return overrides.themes ?? {themes: [], diagnostics: []}; }
        getAgentsFiles() { return overrides.agents ?? {agentsFiles: []}; }
        getSystemPrompt() { return this.options.systemPrompt; }
        getSystemPromptSource() { return undefined; }
        getAppendSystemPrompt() { return this.options.appendSystemPrompt ?? []; }
        getAppendSystemPromptSources() { return []; }
    }
    const sdk = {
        ModelRuntime: {
            async create(options) {
                calls.push({name: 'ModelRuntime.create', options});
                if (overrides.runtimeError) throw overrides.runtimeError;
                return runtime;
            },
        },
        SettingsManager: {
            inMemory(settings) {
                calls.push({name: 'SettingsManager.inMemory', settings});
                return {settings};
            },
        },
        SessionManager: {
            inMemory(cwd) {
                calls.push({name: 'SessionManager.inMemory', cwd});
                return {cwd};
            },
        },
        DefaultResourceLoader,
        async createAgentSession(options) {
            calls.push({name: 'createAgentSession', options});
            const tools = new Map(registeredTools.map((tool) => [tool.name, tool]));
            const session = {
                async prompt(prompt, promptOptions) {
                    calls.push({name: 'session.prompt', prompt, options: promptOptions});
                    if (behavior) await behavior({tools, calls, options, prompt});
                },
                async abort() { calls.push({name: 'session.abort'}); },
                dispose() {
                    calls.push({name: 'session.dispose'});
                    if (overrides.disposeError) throw overrides.disposeError;
                },
            };
            return {session, extensionsResult: {extensions: [{source: 'inline'}], errors: [], runtime: {}}};
        },
    };
    return {calls, loadSdk: async () => sdk};
}

function request(fixture, overrides = {}) {
    return {
        repositoryRoot: REPOSITORY_ROOT,
        tempRoot: TEMP_ROOT,
        env: ENV,
        loadSdk: fixture.loadSdk,
        resources: [
            {id: 'session-control', text: 'SESSION CONTROL\n'},
            {id: 'selected-lens', text: 'SELECTED LENS\n'},
        ],
        evidence: {schemaVersion: 1, axis: 'tooling-style', entries: [{digest: 'a'.repeat(64)}]},
        outputSchema: SUBMIT_SCHEMA,
        tools: [{
            name: 'read_file',
            description: 'Read immutable bytes.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {offset: {type: 'integer'}},
                required: ['offset'],
            },
            async execute(_callId, args) { return {offset: args.offset}; },
        }],
        submitToolName: 'submit_review',
        validateSubmission(value) {
            if (value === null || typeof value !== 'object' || Array.isArray(value) ||
                Object.keys(value).length !== 1 || typeof value.answer !== 'string') {
                throw new Error('submission invalid');
            }
        },
        validateSubmissionPrerequisites() {},
        timeoutMs: 1000,
        ...overrides,
    };
}

test.before(() => {
    fs.rmSync(TEMP_ROOT, {recursive: true, force: true});
    fs.mkdirSync(TEMP_ROOT, {recursive: true});
});
test.after(() => fs.rmSync(TEMP_ROOT, {recursive: true, force: true}));

test('resolves the exact active Pi model without auth readiness checks', async () => {
    const fixture = fakeSdk();
    const active = await resolveActiveModel({env: ENV, loadSdk: fixture.loadSdk});

    assert.deepEqual(active.metadata, {
        provider: ENV.PI_PROVIDER,
        id: ENV.PI_MODEL,
        reasoningLevel: 'high',
        contextWindow: 200000,
        authentication: 'UNKNOWN',
    });
    assert.equal(active.model, MODEL);
    assert.deepEqual(fixture.calls.slice(0, 2), [
        {name: 'ModelRuntime.create', options: {refreshOnCreate: false}},
        {name: 'getModel', provider: ENV.PI_PROVIDER, id: ENV.PI_MODEL},
    ]);
    assert.equal(fixture.calls.some(({name}) => /Auth/.test(name)), false);
});

test('rejects invalid model controls, unknown models, and unsupported reasoning', async () => {
    for (const env of [
        {},
        {...ENV, PI_PROVIDER: 'bad\nprovider'},
        {...ENV, PI_MODEL: 'bad model'},
        {...ENV, PI_REASONING_LEVEL: 'extreme'},
    ]) {
        await assert.rejects(() => resolveActiveModel({env, loadSdk: fakeSdk().loadSdk}), /active model/i);
    }
    await assert.rejects(() => resolveActiveModel({
        env: ENV, loadSdk: fakeSdk(null, {model: null}).loadSdk,
    }), /unavailable/i);
    await assert.rejects(() => resolveActiveModel({
        env: ENV,
        loadSdk: fakeSdk(null, {model: {...MODEL, reasoning: false}}).loadSdk,
    }), /reasoning/i);
    await assert.rejects(() => resolveActiveModel({
        env: {...ENV, PI_REASONING_LEVEL: 'max'},
        loadSdk: fakeSdk(null, {model: {...MODEL, thinkingLevelMap: {max: null}}}).loadSdk,
    }), /reasoning/i);
});

test('calculates a conservative bounded source allowance', () => {
    assert.deepEqual(calculateContextBudget({
        contextWindow: 200000,
        policyBytes: 10000,
        evidenceBytes: 5000,
        toolFramingBytes: 2000,
    }), {
        contextWindow: 200000,
        outputTokens: 32768,
        safetyTokens: 40000,
        inputTokenUpperBound: 17000,
        reservedTokens: 89768,
        sourceBytes: 110232,
    });
    assert.throws(() => calculateContextBudget({
        contextWindow: 40000,
        policyBytes: 10000,
        evidenceBytes: 5000,
        toolFramingBytes: 2000,
    }), /context budget/i);
    assert.throws(() => calculateContextBudget({
        contextWindow: 200000,
        policyBytes: 1048577,
        evidenceBytes: 1,
        toolFramingBytes: 1,
    }), /policy/i);
});

test('builds a length-labelled hostile-data prompt without local paths or inherited text', () => {
    const prompt = buildSessionPrompt({
        resources: [
            {id: 'one', text: 'FIRST BYTES'},
            {id: 'two', text: 'SECOND BYTES'},
        ],
        evidence: {axis: 'tooling-style', manifestDigest: 'a'.repeat(64)},
        outputSchema: SUBMIT_SCHEMA,
    });

    assert.match(prompt, /HOSTILE POLICY DATA one BYTES=11\nFIRST BYTES/);
    assert.match(prompt, /HOSTILE POLICY DATA two BYTES=12\nSECOND BYTES/);
    assert.match(prompt, /HOSTILE EVIDENCE DATA BYTES=/);
    assert.match(prompt, /HOSTILE OUTPUT SCHEMA DATA BYTES=/);
    assert.ok(prompt.indexOf('FIRST BYTES') < prompt.indexOf('SECOND BYTES'));
    assert.doesNotMatch(prompt, new RegExp(REPOSITORY_ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(prompt, /parent message|arbitrary project|NON_SELECTED_CANARY|settings\.json/i);
    assert.match(prompt, /use every selected lens/i);
    assert.match(prompt, /submit exactly once/i);
    assert.match(prompt, /tool failure/i);
});

test('creates one isolated custom-tool-only session and freezes one submission', async () => {
    let submitted;
    const fixture = fakeSdk(async ({tools, options}) => {
        assert.equal(options.noTools, 'builtin');
        assert.deepEqual(fs.readdirSync(options.cwd), []);
        assert.deepEqual([...tools.keys()], ['read_file', 'submit_review']);
        const read = await tools.get('read_file').execute('read', {offset: 7});
        assert.match(read.content[0].text, /"offset":7/);
        const result = await tools.get('submit_review').execute('submit', {answer: 'complete'});
        assert.equal(result.terminate, true);
    });
    const result = await runIsolatedSession(request(fixture, {
        validateSubmissionPrerequisites(value) { submitted = value; },
    }));

    assert.equal(result.ok, true);
    assert.deepEqual(result.submission, {answer: 'complete'});
    assert.deepEqual(submitted, {answer: 'complete'});
    assert.equal(Object.isFrozen(result.submission), true);
    const create = fixture.calls.find(({name}) => name === 'createAgentSession');
    assert.equal(create.options.model, MODEL);
    assert.equal(create.options.thinkingLevel, 'high');
    assert.equal(create.options.noTools, 'builtin');
    assert.equal(Object.hasOwn(create.options, 'tools'), false);
    assert.equal(create.options.cwd.startsWith(TEMP_ROOT), true);
    assert.notEqual(create.options.cwd, REPOSITORY_ROOT);
    assert.deepEqual(fixture.calls.find(({name}) => name === 'SettingsManager.inMemory').settings, {
        compaction: {enabled: false},
        retry: {enabled: false, maxRetries: 0},
    });
    const loader = fixture.calls.find(({name}) => name === 'DefaultResourceLoader').options;
    assert.equal(loader.noExtensions, true);
    assert.equal(loader.noSkills, true);
    assert.equal(loader.noPromptTemplates, true);
    assert.equal(loader.noThemes, true);
    assert.equal(loader.noContextFiles, true);
    assert.deepEqual(loader.appendSystemPrompt, []);
    assert.equal(fixture.calls.find(({name}) => name === 'session.prompt').options.expandPromptTemplates, false);
    assert.equal(fixture.calls.some(({name}) => name === 'session.dispose'), true);
    assert.deepEqual(fs.readdirSync(TEMP_ROOT), []);
});

test('rejects premature, duplicate, and post-termination activity', async () => {
    let ready = false;
    const premature = fakeSdk(async ({tools}) => {
        await assert.rejects(() => tools.get('submit_review').execute('early', {answer: 'early'}));
        ready = true;
        await tools.get('submit_review').execute('done', {answer: 'done'});
    });
    const recovered = await runIsolatedSession(request(premature, {
        validateSubmissionPrerequisites() {
            if (!ready) throw new Error('not ready');
        },
    }));
    assert.equal(recovered.ok, true);

    for (const behavior of [
        async ({tools}) => {
            await tools.get('submit_review').execute('one', {answer: 'one'});
            await tools.get('submit_review').execute('two', {answer: 'two'});
        },
        async ({tools}) => {
            await tools.get('submit_review').execute('one', {answer: 'one'});
            await tools.get('read_file').execute('late', {offset: 0});
        },
    ]) {
        const fixture = fakeSdk(behavior);
        const result = await runIsolatedSession(request(fixture));
        assert.deepEqual(result, {ok: false, outcome: 'INCONCLUSIVE', reason: 'INVALID_SESSION_ACTIVITY'});
    }
});

test('rejects a tool call that completes after the terminating submission', async () => {
    let releaseRead;
    const readGate = new Promise((resolve) => { releaseRead = resolve; });
    const fixture = fakeSdk(async ({tools}) => {
        const pendingRead = tools.get('read_file').execute('read', {offset: 0});
        await Promise.resolve();
        await tools.get('submit_review').execute('done', {answer: 'done'});
        releaseRead();
        await pendingRead;
    });
    const result = await runIsolatedSession(request(fixture, {
        tools: [{
            name: 'read_file',
            description: 'Read immutable bytes.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {offset: {type: 'integer'}},
                required: ['offset'],
            },
            async execute(_callId, args) {
                await readGate;
                return {offset: args.offset};
            },
        }],
    }));

    assert.deepEqual(result, {ok: false, outcome: 'INCONCLUSIVE', reason: 'INVALID_SESSION_ACTIVITY'});
});

test('rejects nested schema nodes without a supported type', () => {
    assert.throws(() => validateClosedJsonSchema({
        type: 'object',
        additionalProperties: false,
        properties: {answer: {}},
        required: ['answer'],
    }), /schema/i);
});

test('rejects unsupported nested schema keywords', () => {
    assert.throws(() => validateClosedJsonSchema({
        type: 'object',
        additionalProperties: false,
        properties: {answer: {type: 'string', invented: true}},
        required: ['answer'],
    }), /schema/i);
});

test('freezes an own __proto__ field without changing the object prototype', () => {
    const frozen = deepFreezeJson(JSON.parse('{"__proto__":{"polluted":true},"answer":"ok"}'));

    assert.equal(Object.getPrototypeOf(frozen), Object.prototype);
    assert.equal(Object.hasOwn(frozen, '__proto__'), true);
    assert.equal(Object.getPrototypeOf(frozen).polluted, undefined);
    assert.deepEqual(frozen.__proto__, {polluted: true});
});

test('fails closed on malformed or missing submissions and inherited resources', async () => {
    const cases = [
        {fixture: fakeSdk(async () => {}), reason: 'SUBMISSION_MISSING'},
        {
            fixture: fakeSdk(async ({tools}) => {
                await tools.get('submit_review').execute('bad', {answer: 7});
            }),
            reason: 'SESSION_FAILED',
        },
        {
            fixture: fakeSdk(null, {skills: {skills: [{name: 'leak'}], diagnostics: []}}),
            reason: 'RESOURCE_ISOLATION_FAILED',
        },
        {
            fixture: fakeSdk(null, {prompts: {prompts: [], diagnostics: [{message: 'private canary'}]}}),
            reason: 'RESOURCE_ISOLATION_FAILED',
        },
        {
            fixture: fakeSdk(null, {agents: {agentsFiles: [{path: '/private/canary', content: 'leak'}]}}),
            reason: 'RESOURCE_ISOLATION_FAILED',
        },
    ];
    for (const {fixture, reason} of cases) {
        const result = await runIsolatedSession(request(fixture));
        assert.equal(result.ok, false);
        assert.equal(result.outcome, 'INCONCLUSIVE');
        assert.equal(result.reason, reason);
        assert.doesNotMatch(JSON.stringify(result), /private canary|\/private\/canary/);
    }
});

test('rejects built-in tool names, open schemas, and oversized source before inference', async () => {
    const builtIn = fakeSdk();
    const builtInResult = await runIsolatedSession(request(builtIn, {
        tools: [{
            name: 'bash',
            description: 'not allowed',
            parameters: {type: 'object', additionalProperties: false, properties: {}, required: []},
            async execute() {},
        }],
    }));
    assert.equal(builtInResult.ok, false);
    assert.equal(builtIn.calls.some(({name}) => name === 'createAgentSession'), false);

    const openSchema = fakeSdk();
    const openResult = await runIsolatedSession(request(openSchema, {
        outputSchema: {type: 'object', properties: {}, required: []},
    }));
    assert.equal(openResult.ok, false);
    assert.equal(openSchema.calls.some(({name}) => name === 'createAgentSession'), false);

    const oversized = fakeSdk();
    assert.deepEqual(await runIsolatedSession(request(oversized, {sourceBytes: 1048576})), {
        ok: false, outcome: 'INCONCLUSIVE', reason: 'CONTEXT_BUDGET_EXCEEDED',
    });
    assert.equal(oversized.calls.some(({name}) => name === 'createAgentSession'), false);
});

test('normalizes provider, cancellation, timeout, and cleanup failures', async () => {
    const provider = fakeSdk(async () => { throw new Error('401 missing API key secret-canary'); });
    assert.deepEqual(await runIsolatedSession(request(provider)), {
        ok: false, outcome: 'INCONCLUSIVE', reason: 'PROVIDER_AUTH_FAILED',
    });

    const rejected = fakeSdk(async () => { throw new Error('provider unavailable secret-canary'); });
    assert.deepEqual(await runIsolatedSession(request(rejected)), {
        ok: false, outcome: 'INCONCLUSIVE', reason: 'SESSION_FAILED',
    });

    const cancelled = fakeSdk(async () => {
        const error = new Error('cancelled');
        error.name = 'AbortError';
        throw error;
    });
    assert.deepEqual(await runIsolatedSession(request(cancelled)), {
        ok: false, outcome: 'INCONCLUSIVE', reason: 'SESSION_CANCELLED',
    });

    const hanging = fakeSdk(async () => new Promise(() => {}));
    assert.deepEqual(await runIsolatedSession(request(hanging, {timeoutMs: 10})), {
        ok: false, outcome: 'INCONCLUSIVE', reason: 'SESSION_TIMEOUT',
    });
    assert.equal(hanging.calls.some(({name}) => name === 'session.abort'), true);

    const cleanup = fakeSdk(async ({tools}) => {
        await tools.get('submit_review').execute('submit', {answer: 'done'});
    });
    assert.deepEqual(await runIsolatedSession(request(cleanup, {
        removeTemp(target) {
            fs.rmSync(target, {recursive: true, force: true});
            throw new Error('cleanup private path canary');
        },
    })), {ok: false, outcome: 'INCONCLUSIVE', reason: 'CLEANUP_FAILED'});
});

test('inspects isolated SDK construction without inference', async () => {
    const fixture = fakeSdk();
    const metadata = await inspectIsolatedRuntime({
        repositoryRoot: REPOSITORY_ROOT,
        tempRoot: TEMP_ROOT,
        env: ENV,
        loadSdk: fixture.loadSdk,
    });

    assert.deepEqual(metadata, {
        provider: ENV.PI_PROVIDER,
        id: ENV.PI_MODEL,
        reasoningLevel: 'high',
        contextWindow: 200000,
        authentication: 'UNKNOWN',
    });
    assert.equal(fixture.calls.some(({name}) => name === 'session.prompt'), false);
    assert.equal(fixture.calls.some(({name}) => name === 'session.dispose'), true);
    assert.deepEqual(fs.readdirSync(TEMP_ROOT), []);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
