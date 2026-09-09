// $KYAULabs: safety-recovery.test.ts kyau@aura.kyaulabs 2026/09/09 -0700 Exp $

import {test} from 'node:test';
import assert from 'node:assert/strict';
import safetyExtension from '../../packages/prism-core/extensions/safety/index.ts';

async function fixture() {
    const handlers: Record<string, Function> = {};
    const branch: unknown[] = [];
    let aborts = 0;
    const ctx = {
        cwd: '/repo', hasUI: false,
        abort() { aborts += 1; },
        sessionManager: {getSessionFile: () => '/tmp/prism-recovery-session', getBranch: () => branch},
    };
    safetyExtension({on(name: string, handler: Function) { handlers[name] = handler; }} as never);
    await handlers.session_start?.({}, ctx);
    const call = async (toolName: string, input: unknown) => {
        branch.splice(0, branch.length, {type: 'message', message: {role: 'assistant', content: [
            {type: 'toolCall', id: 'call', name: toolName, arguments: input},
        ]}});
        return handlers.tool_call({toolName, input, toolCallId: 'call'}, ctx);
    };
    return {call, handlers, ctx, get aborts() { return aborts; }};
}

test('repeated credential denials leave ordinary tools available', async () => {
    const target = await fixture();
    for (let index = 0; index < 5; index += 1) {
        assert.equal((await target.call('bash', {command: 'cat ~/.ssh/id_rsa'}))?.block, true);
    }
    assert.equal(await target.call('read', {path: '/repo/README.md'}), undefined);
    assert.equal(target.aborts, 0);
});

test('a failed commit never aborts or locks subsequent tools', async () => {
    const target = await fixture();
    const command = 'prism-tool commit create --type feat --subject "example"';
    assert.equal(await target.call('bash', {command}), undefined);
    await target.handlers.tool_execution_end?.({toolName: 'bash', toolCallId: 'call', isError: true}, target.ctx);
    await target.handlers.agent_end?.({}, target.ctx);
    assert.equal(target.aborts, 0);
    assert.equal(await target.call('read', {path: '/repo/README.md'}), undefined);
});

test('ordinary Git and project cleanup commands are not workflow-gated', async () => {
    const target = await fixture();
    for (const command of ['git commit -m "feat: example"', 'git push origin feature', 'rm -rf /repo/build']) {
        assert.equal(await target.call('bash', {command}), undefined, command);
    }
});

test('edit and write cannot access credential paths while ordinary files remain editable', async () => {
    const target = await fixture();
    for (const tool of ['edit', 'write']) {
        assert.equal((await target.call(tool, {path: '/repo/.env', content: 'example', edits: []}))?.block, true);
        assert.equal(await target.call(tool, {path: '/repo/example.txt', content: 'example', edits: []}), undefined);
    }
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
