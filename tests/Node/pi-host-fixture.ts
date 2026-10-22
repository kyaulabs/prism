import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {TestContext} from 'node:test';
import {createAssistantMessageEventStream, InMemoryCredentialStore, InMemoryModelsStore, type AssistantMessage, type JsonObject} from '@earendil-works/pi-ai';
import {
    createAgentSession, createCodemodeExtension, createToolSearchExtension, DefaultResourceLoader,
    ModelRuntime, SessionManager, SettingsManager,
    type ExtensionFactory, type ToolCallEvent, type ToolResultEvent,
} from '@earendil-works/pi-coding-agent';
import safety from '../../packages/prism-core/extensions/safety/index.ts';
import {registerWebAccessTools, type WebAccessExtensionDependencies} from '../../packages/prism-core/extensions/web-access/index.ts';

export async function hostFixture(t: TestContext, deps: WebAccessExtensionDependencies = {}, options: {
    extensions?: ExtensionFactory[];
    packages?: string[];
    tools?: string[];
    excludeTools?: string[];
    manager?: SessionManager;
} = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-pi-host-'));
    const agentDir = path.join(root, 'agent');
    const cwd = path.join(root, 'project');
    fs.mkdirSync(agentDir, {mode: 0o700});
    fs.mkdirSync(cwd, {mode: 0o700});
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    t.after(() => {
        if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
        else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    });
    const credentials = new InMemoryCredentialStore();
    const runtime = await ModelRuntime.create({credentials, modelsPath: null, modelsStore: new InMemoryModelsStore(), refreshOnCreate: false});
    // A synthetic provider plus a deterministic stream boundary: no auth files,
    // provider transport, model-catalog network, or paid calls are used.
    runtime.registerProvider('prism-fixture', {
        api: 'openai-completions', baseUrl: 'https://fixture.invalid/v1', apiKey: 'synthetic-fixture',
        models: [{id: 'fixture', name: 'Fixture', reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 4096,
            cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0}}],
    });
    const model = runtime.getModel('prism-fixture', 'fixture');
    assert.ok(model);
    const calls: ToolCallEvent[] = [];
    const results: ToolResultEvent[] = [];
    const settings = SettingsManager.inMemory({
        defaultProjectTrust: 'never', packages: options.packages ?? [], defaultTools: ['+codemode', '+tool_search'],
        compaction: {enabled: false}, retry: {enabled: false}, cacheWarming: 'off',
    });
    const loader = new DefaultResourceLoader({cwd, agentDir, settingsManager: settings, noContextFiles: true, noThemes: true,
        extensionFactories: [
            pi => {
                pi.on('tool_call', event => { calls.push(structuredClone(event)); });
                pi.on('tool_result', event => { results.push(structuredClone(event)); });
            },
            ...(options.packages?.length ? [] : [safety, pi => registerWebAccessTools(pi, deps)] satisfies ExtensionFactory[]),
            createCodemodeExtension({models: false}), createToolSearchExtension(), ...(options.extensions ?? []),
        ],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const {session} = await createAgentSession({cwd, agentDir, modelRuntime: runtime, model,
        settingsManager: settings, resourceLoader: loader, sessionManager: options.manager ?? SessionManager.inMemory(cwd),
        tools: options.tools, excludeTools: options.excludeTools});
    const extensionErrors: unknown[] = [];
    await session.bindExtensions({onError: error => { extensionErrors.push(error); }});
    t.after(async () => {
        await session.abort();
        await session.extensionRunner.emit({type: 'session_shutdown', reason: 'quit'});
        session.dispose();
        fs.rmSync(root, {recursive: true, force: true});
    });
    let serial = 0;
    const run = async (name: string, args: JsonObject) => {
        const id = `fixture-${++serial}`;
        let issued = false;
        session.agent.streamFunction = currentModel => {
            const stream = createAssistantMessageEventStream();
            const tool = !issued;
            issued = true;
            const message: AssistantMessage = {
                role: 'assistant', api: currentModel.api, provider: currentModel.provider, model: currentModel.id,
                content: tool ? [{type: 'toolCall', id, name, arguments: args}] : [{type: 'text', text: 'Done'}],
                stopReason: tool ? 'toolUse' : 'stop', timestamp: Date.now(),
                usage: {input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
                    cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0}},
            };
            queueMicrotask(() => { stream.push({type: 'done', reason: tool ? 'toolUse' : 'stop', message}); });
            return stream;
        };
        await session.prompt('Run the synthetic compatibility fixture.');
        const result = session.messages.find(message => message.role === 'toolResult' && message.toolCallId === id);
        assert.ok(result && result.role === 'toolResult', `Missing ${name} result`);
        return result;
    };
    return {root, agentDir, cwd, session, loader, calls, results, extensionErrors, run,
        script: (code: string) => run('codemode', {code})};
}

export function resultText(result: {content: readonly ({type: string; text?: string})[]}): string {
    return result.content.map(item => item.type === 'text' ? item.text : '').join('\n');
}
