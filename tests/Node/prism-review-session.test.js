// $KYAULabs: prism-review-session.test.js kyau@aura.kyaulabs 2026/09/09 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    buildSessionPrompt,
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
            const listeners = new Set();
            const session = {
                async prompt(prompt, promptOptions) {
                    calls.push({name: 'session.prompt', prompt, options: promptOptions});
                    if (behavior) {
                        await behavior({
                            tools,
                            calls,
                            options,
                            prompt,
                            emit: (event) => listeners.forEach((listener) => listener(event)),
                        });
                    }
                },
                subscribe(listener) {
                    listeners.add(listener);
                    return () => listeners.delete(listener);
                },
                async abort() {
                    calls.push({name: 'session.abort'});
                    if (overrides.abortBehavior) await overrides.abortBehavior({calls});
                },
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
        {name: 'ModelRuntime.create', options: {refreshOnCreate: false, allowModelNetwork: false}},
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
        await assert.rejects(() => resolveActiveModel({env, loadSdk: fakeSdk().loadSdk}), {message: 'MODEL_CONTROLS_INVALID'});
    }
    await assert.rejects(() => resolveActiveModel({
        env: ENV, loadSdk: fakeSdk(null, {model: null}).loadSdk,
    }), {message: 'MODEL_UNAVAILABLE'});
    await assert.rejects(() => resolveActiveModel({
        env: ENV,
        loadSdk: fakeSdk(null, {model: {...MODEL, reasoning: false}}).loadSdk,
    }), {message: 'MODEL_REASONING_UNSUPPORTED'});
    await assert.rejects(() => resolveActiveModel({
        env: {...ENV, PI_REASONING_LEVEL: 'max'},
        loadSdk: fakeSdk(null, {model: {...MODEL, thinkingLevelMap: {max: null}}}).loadSdk,
    }), {message: 'MODEL_REASONING_UNSUPPORTED'});
});

test('runs the selected model without estimating a context budget', async () => {
    const model = {...MODEL, contextWindow: 128};
    const fixture = fakeSdk(async ({tools, options}) => {
        assert.equal(options.model, model);
        await tools.get('submit_review').execute('submit', {answer: 'complete'});
    }, {model});
    const result = await runIsolatedSession(request(fixture, {
        sourceBytes: 1048576,
        resources: [{id: 'session-control', text: 'policy '.repeat(1000)}],
    }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.submission, {answer: 'complete'});
    assert.equal(Object.hasOwn(result, 'budget'), false);
    assert.equal(fixture.calls.filter(({name}) => name === 'session.prompt').length, 1);
    assert.deepEqual(fs.readdirSync(TEMP_ROOT), []);
});

test('retains fixed byte limits independently of model context estimates', async () => {
    const large = 'x'.repeat(1048577);
    for (const overrides of [
        {resources: [{id: 'policy', text: large}]},
        {evidence: {data: large}},
        {tools: [{...request(fakeSdk()).tools[0], description: large}]},
        {sourceBytes: -1},
        {sourceBytes: NaN},
    ]) {
        const fixture = fakeSdk();
        const result = await runIsolatedSession(request(fixture, overrides));
        assert.equal(result.ok, false);
        assert.equal(fixture.calls.some(({name}) => name === 'session.prompt'), false);
    }
});

test('reports actual provider context failures without retrying or switching models', async () => {
    const fixture = fakeSdk(async () => {
        throw new Error('context length exceeded PRIVATE_CANARY');
    }, {model: {...MODEL, contextWindow: 128}});
    const result = await runIsolatedSession(request(fixture, {sourceBytes: 1048576}));
    assert.deepEqual(result, {ok: false, outcome: 'INCONCLUSIVE', reason: 'SESSION_FAILED'});
    assert.equal(fixture.calls.filter(({name}) => name === 'session.prompt').length, 1);
    assert.equal(fixture.calls.filter(({name}) => name === 'ModelRuntime.create').length, 1);
    assert.deepEqual(fs.readdirSync(TEMP_ROOT), []);
});

test('builds a length-labelled hostile-data prompt without local paths or inherited text', () => {
    const prompt = buildSessionPrompt({
        resources: [
            {id: 'one', text: 'FIRST BYTES'},
            {id: 'two', text: 'SECOND BYTES'},
        ],
        evidence: {
            axis: 'requirement-coverage',
            manifestDigest: 'a'.repeat(64),
            criteria: {
                disposition: 'DECLARED',
                sources: [{
                    role: 'SPEC',
                    commit: 'b'.repeat(40),
                    path: 'docs/specs/example.md',
                    blobOid: 'c'.repeat(40),
                    byteCount: 11,
                    sha256: 'd'.repeat(64),
                }],
            },
        },
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
    assert.match(prompt, /criteria interval/i);
    assert.match(prompt, /docs\/specs\/example\.md/);
    assert.doesNotMatch(prompt, /CRITERIA_SOURCE_BYTES_CANARY/);
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

test('validates direct submit-tool arguments against the closed schema', async () => {
    const fixture = fakeSdk(async ({tools}) => {
        await tools.get('submit_review').execute('submit', {answer: 'complete', invented: true});
    });

    const result = await runIsolatedSession(request(fixture, {
        validateSubmission() {},
    }));

    assert.deepEqual(result, {ok: false, outcome: 'INCONCLUSIVE', reason: 'SESSION_FAILED'});
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

test('accepts the SDK tool-result message for the terminating submission', async () => {
    const fixture = fakeSdk(async ({tools, emit}) => {
        const result = await tools.get('submit_review').execute('submission-1', {answer: 'done'});
        const message = {role: 'toolResult', toolCallId: 'submission-1', toolName: 'submit_review',
            content: result.content, details: result.details, isError: false};
        emit({type: 'tool_execution_end', toolCallId: 'submission-1', toolName: 'submit_review', result, isError: false});
        emit({type: 'message_start', message});
        emit({type: 'message_end', message});
        emit({type: 'turn_end'});
        emit({type: 'agent_end'});
    });
    const result = await runIsolatedSession(request(fixture));
    assert.equal(result.ok, true);
    assert.deepEqual(result.submission, {answer: 'done'});
    assert.deepEqual(fs.readdirSync(TEMP_ROOT), []);
});

test('completes through the real Pi agent event loop with an offline model transport', async () => {
    const {Agent} = await import('@earendil-works/pi-agent-core');
    let modelCalls = 0;
    let acknowledged = false;
    const fixture = fakeSdk(async ({tools, emit}) => {
        const message = {role: 'assistant', api: 'fixture-api', provider: MODEL.provider, model: MODEL.id,
            content: [{type: 'toolCall', id: 'sdk-submit', name: 'submit_review', arguments: {answer: 'done'}}],
            stopReason: 'toolUse', timestamp: 0,
            usage: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
                cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0}}};
        const agent = new Agent({
            initialState: {model: {...MODEL, api: 'fixture-api'}, tools: [...tools.values()]},
            streamFn() {
                modelCalls += 1;
                assert.equal(modelCalls, 1);
                return {
                    async *[Symbol.asyncIterator]() { yield {type: 'done', reason: 'toolUse', message}; },
                    async result() { return message; },
                };
            },
        });
        agent.subscribe(event => {
            if (event.type === 'message_start' && event.message.role === 'toolResult') acknowledged = true;
            emit(event);
        });
        await agent.prompt('Submit the fixture result.');
    });
    const result = await runIsolatedSession(request(fixture));
    assert.equal(result.ok, true);
    assert.equal(acknowledged, true);
    assert.equal(modelCalls, 1);
});

test('rejects unrelated, failed, or repeated tool-result messages after submission', async () => {
    for (const changed of [
        {toolCallId: 'different-call'}, {toolName: 'read_file'}, {role: 'assistant'}, {isError: true}, {},
    ]) {
        const fixture = fakeSdk(async ({tools, emit}) => {
            await tools.get('submit_review').execute('submission-1', {answer: 'done'});
            const message = {role: 'toolResult', toolCallId: 'submission-1', toolName: 'submit_review', isError: false};
            emit({type: 'message_start', message: {...message, ...changed}});
            if (Object.keys(changed).length === 0) emit({type: 'message_start', message});
        });
        assert.deepEqual(await runIsolatedSession(request(fixture)),
            {ok: false, outcome: 'INCONCLUSIVE', reason: 'INVALID_SESSION_ACTIVITY'});
    }
});

test('rejects model output emitted after the terminating submission', async () => {
    const fixture = fakeSdk(async ({tools, emit}) => {
        await tools.get('submit_review').execute('done', {answer: 'done'});
        emit({type: 'message_update'});
    });

    const result = await runIsolatedSession(request(fixture));

    assert.deepEqual(result, {ok: false, outcome: 'INCONCLUSIVE', reason: 'INVALID_SESSION_ACTIVITY'});
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
    assert.deepEqual(await runIsolatedSession(request(oversized, {sourceBytes: 1048577})), {
        ok: false, outcome: 'INCONCLUSIVE', reason: 'SESSION_FAILED',
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

    let releasePrompt;
    const hanging = fakeSdk(async ({calls}) => {
        await new Promise((resolve) => { releasePrompt = resolve; });
        calls.push({name: 'session.prompt.settled'});
    }, {
        abortBehavior() { globalThis.setTimeout(releasePrompt, 10); },
    });
    assert.deepEqual(await runIsolatedSession(request(hanging, {timeoutMs: 10})), {
        ok: false, outcome: 'INCONCLUSIVE', reason: 'SESSION_TIMEOUT',
    });
    assert.equal(hanging.calls.some(({name}) => name === 'session.abort'), true);
    const settledIndex = hanging.calls.findIndex(({name}) => name === 'session.prompt.settled');
    const disposeIndex = hanging.calls.findIndex(({name}) => name === 'session.dispose');
    assert.ok(settledIndex >= 0);
    assert.ok(disposeIndex > settledIndex);

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

test('doctor initializes a credential-free local model runtime', async () => {
    const fixture = fakeSdk();
    await inspectIsolatedRuntime({repositoryRoot: REPOSITORY_ROOT, tempRoot: TEMP_ROOT,
        env: ENV, loadSdk: fixture.loadSdk});
    const options = fixture.calls.find(call => call.name === 'ModelRuntime.create').options;
    assert.equal(options.refreshOnCreate, false);
    assert.equal(options.allowModelNetwork, false);
    assert.equal(await options.credentials.read('fixture'), undefined);
    assert.deepEqual(await options.credentials.list(), []);
    await assert.rejects(() => options.credentials.modify('fixture', async () => undefined));
    await assert.rejects(() => options.credentials.delete('fixture'));
});

test('review model resolution retains SDK-owned credential delegation', async () => {
    const fixture = fakeSdk();
    await resolveActiveModel({env: ENV, loadSdk: fixture.loadSdk});
    const options = fixture.calls.find(call => call.name === 'ModelRuntime.create').options;
    assert.equal(Object.hasOwn(options, 'credentials'), false);
    assert.equal(options.allowModelNetwork, false);
});

test('doctor rejects unsupported SDK exports before runtime initialization', async () => {
    const fixture = fakeSdk();
    const sdk = await fixture.loadSdk();
    delete sdk.createAgentSession;
    await assert.rejects(() => inspectIsolatedRuntime({repositoryRoot: REPOSITORY_ROOT,
        tempRoot: TEMP_ROOT, env: ENV, loadSdk: async () => sdk}), {message: 'SDK_API_UNSUPPORTED'});
    assert.equal(fixture.calls.length, 0);
});

test('doctor validates returned SDK methods and disposes rejected sessions', async () => {
    for (const target of ['runtime', 'loader', 'session']) {
        const fixture = fakeSdk();
        const sdk = await fixture.loadSdk();
        if (target === 'runtime') sdk.ModelRuntime.create = async () => ({});
        if (target === 'loader') sdk.DefaultResourceLoader.prototype.getSystemPromptSource = undefined;
        if (target === 'session') {
            const create = sdk.createAgentSession;
            sdk.createAgentSession = async options => {
                const created = await create(options);
                created.session.abort = undefined;
                return created;
            };
        }
        await assert.rejects(() => inspectIsolatedRuntime({repositoryRoot: REPOSITORY_ROOT,
            tempRoot: TEMP_ROOT, env: ENV, loadSdk: async () => sdk}), {message: 'SDK_API_UNSUPPORTED'});
        if (target === 'session') assert.equal(fixture.calls.some(call => call.name === 'session.dispose'), true);
        assert.deepEqual(fs.readdirSync(TEMP_ROOT), []);
    }
});

test('doctor redacts local model failures without changing live provider classification', async () => {
    for (const stage of ['create', 'getModel']) {
        const fixture = fakeSdk(null, {runtimeError: new Error('401 PRIVATE_CANARY')});
        const sdk = await fixture.loadSdk();
        if (stage === 'getModel') sdk.ModelRuntime.create = async () => ({
            getModel() { throw new Error('401 PRIVATE_CANARY'); },
        });
        await assert.rejects(() => inspectIsolatedRuntime({repositoryRoot: REPOSITORY_ROOT,
            tempRoot: TEMP_ROOT, env: ENV, loadSdk: async () => sdk}), {message: 'MODEL_RUNTIME_FAILED'});
        assert.deepEqual(await runIsolatedSession(request(fixture, {loadSdk: async () => sdk})), {
            ok: false, outcome: 'INCONCLUSIVE', reason: 'PROVIDER_AUTH_FAILED',
        });
    }
});

test('resource failures have bounded isolation diagnostics rather than provider errors', async () => {
    for (const stage of ['construct', 'reload', 'state']) {
        const fixture = fakeSdk();
        const sdk = await fixture.loadSdk();
        const Loader = sdk.DefaultResourceLoader;
        sdk.DefaultResourceLoader = class extends Loader {
            constructor(options) {
                super(options);
                if (stage === 'construct') throw new Error('401 PRIVATE_CANARY');
            }
            async reload() {
                if (stage === 'reload') throw new Error('401 PRIVATE_CANARY');
                return super.reload();
            }
            getSkills() {
                if (stage === 'state') throw new Error('401 PRIVATE_CANARY');
                return super.getSkills();
            }
        };
        await assert.rejects(() => inspectIsolatedRuntime({repositoryRoot: REPOSITORY_ROOT,
            tempRoot: TEMP_ROOT, env: ENV, loadSdk: async () => sdk}), {message: 'RESOURCE_ISOLATION_FAILED'});
        assert.deepEqual(await runIsolatedSession(request(fixture, {loadSdk: async () => sdk})), {
            ok: false, outcome: 'INCONCLUSIVE', reason: 'RESOURCE_ISOLATION_FAILED',
        });
        assert.deepEqual(fs.readdirSync(TEMP_ROOT), []);
    }
});

test('doctor bounds session preparation failures while live review preserves provider errors', async () => {
    const fixture = fakeSdk();
    const sdk = await fixture.loadSdk();
    sdk.createAgentSession = async () => { throw new Error('401 PRIVATE_CANARY'); };
    await assert.rejects(() => inspectIsolatedRuntime({repositoryRoot: REPOSITORY_ROOT,
        tempRoot: TEMP_ROOT, env: ENV, loadSdk: async () => sdk}), {message: 'RESOURCE_ISOLATION_FAILED'});
    assert.deepEqual(await runIsolatedSession(request(fixture, {loadSdk: async () => sdk})), {
        ok: false, outcome: 'INCONCLUSIVE', reason: 'PROVIDER_AUTH_FAILED',
    });
    assert.deepEqual(fs.readdirSync(TEMP_ROOT), []);
});

test('doctor attempts all cleanup and reports bounded cleanup failures', async () => {
    for (const stage of ['dispose', 'remove']) {
        const fixture = fakeSdk(null, stage === 'dispose' ? {disposeError: new Error('PRIVATE_CANARY')} : {});
        let removed = false;
        await assert.rejects(() => inspectIsolatedRuntime({repositoryRoot: REPOSITORY_ROOT,
            tempRoot: TEMP_ROOT, env: ENV, loadSdk: fixture.loadSdk,
            removeTemp(target) {
                fs.rmSync(target, {recursive: true, force: true});
                removed = true;
                if (stage === 'remove') throw new Error('PRIVATE_CANARY');
            },
        }), {message: 'CLEANUP_FAILED'});
        assert.equal(removed, true);
        assert.deepEqual(fs.readdirSync(TEMP_ROOT), []);
    }
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
