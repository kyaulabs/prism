import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import {createMcpExtension, SessionManager} from '@earendil-works/pi-coding-agent';
import {hostFixture, resultText} from './pi-host-fixture.ts';

const root = path.resolve(import.meta.dirname, '../..');

const mcp = () => createMcpExtension({loadConfig: ctx => ({
    servers: [{name: 'fixture', source: path.join(ctx.cwd, 'mcp-fixture.json'), scope: 'global',
        config: {command: process.execPath, args: [path.join(root, 'tests/Node/fixtures/mcp.js')], exposure: 'deferred'}}],
    errors: [],
})});

test('native MCP discovery and selected tools coexist with Prism through reload, tree navigation and resume', {timeout: 20000}, async t => {
    const target = await hostFixture(t, {}, {extensions: [mcp()]});
    const discovery = await target.run('tool_search', {query: 'fixture echo'});
    assert.equal(discovery.isError, false, resultText(discovery));
    assert.ok(target.session.getActiveToolNames().includes('mcp__fixture__echo'));
    assert.equal((await target.script('return (await tools.mcp__fixture__echo({value:"synthetic"})).structuredContent.value;')).isError, false);
    const firstLeaf = target.session.sessionManager.getLeafId();
    assert.ok(firstLeaf);
    target.session.setActiveToolsByName(target.session.getActiveToolNames().filter(name => name !== 'fetch_content'));
    await target.script('return "record user selection";');
    assert.ok(!target.session.getActiveToolNames().includes('fetch_content'));
    await target.session.reload();
    assert.ok(target.session.getActiveToolNames().includes('web_search'));
    // Native 1.4 reload re-registers default-active extension tools. Durable
    // CLI exclusions are tested separately; Prism must not override this host.
    assert.ok(target.session.getActiveToolNames().includes('fetch_content'));
    const afterReload = await target.script('return (await tools.mcp__fixture__echo({value:"reloaded"})).structuredContent.value;');
    assert.equal(afterReload.isError, false, resultText(afterReload));
    assert.match(resultText(afterReload), /reloaded/);
    await target.session.navigateTree(firstLeaf, {summarize: false});
    assert.ok(target.session.getActiveToolNames().includes('fetch_content'));
    assert.ok(target.session.getActiveToolNames().includes('mcp__fixture__echo'));
    const header = target.session.sessionManager.getHeader();
    assert.ok(header);
    const restored = SessionManager.inMemory(target.cwd, {id: header.id}, [header, ...target.session.sessionManager.getBranch()]);
    assert.ok(restored.getBranch().some(entry => entry.type === 'message' && entry.message.role === 'system' &&
        entry.message.toolsAdded?.some(tool => tool.name === 'mcp__fixture__echo')), 'fixture transcript records the deferred tool');
    const resumed = await hostFixture(t, {}, {extensions: [mcp()], manager: restored, tools: ['+codemode', '-write']});
    assert.ok(resumed.session.getActiveToolNames().includes('web_search'));
    assert.ok(resumed.session.getActiveToolNames().includes('fetch_content'));
    assert.ok(!resumed.session.getActiveToolNames().includes('write'));
    // Deferred MCP connects in the background. Allow it to register before the
    // next prompt records a new loadout (the native restoration boundary).
    for (let attempt = 0; attempt < 100 && !resumed.session.getAllTools().some(tool => tool.name === 'mcp__fixture__echo'); attempt++) await delay(20);
    assert.ok(resumed.session.getActiveToolNames().includes('mcp__fixture__echo'));
    const afterResume = await resumed.script('return (await tools.mcp__fixture__echo({value:"resumed"})).structuredContent.value;');
    assert.equal(afterResume.isError, false, resultText(afterResume));
    assert.ok(resumed.session.getActiveToolNames().includes('mcp__fixture__echo'));
    assert.deepEqual(target.extensionErrors, []);
    assert.deepEqual(resumed.extensionErrors, []);
});

test('native wildcard tool selection is not overwritten by Core registration or reload', async t => {
    const target = await hostFixture(t, {}, {tools: ['web_*', 'codemode'], excludeTools: ['fetch_*']});
    assert.deepEqual(new Set(target.session.getActiveToolNames()), new Set(['web_search', 'codemode']));
    await target.session.reload();
    assert.deepEqual(new Set(target.session.getActiveToolNames()), new Set(['web_search', 'codemode']));
});

test('packed Core resources load in the real Pi 1.4 host without an appended system prompt', {timeout: 20000}, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-packed-host-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const report = JSON.parse(execFileSync('npm', ['pack', path.join(root, 'packages/prism-core'), '--json', '--ignore-scripts', '--pack-destination', directory], {encoding: 'utf8'}));
    const packed = Array.isArray(report) ? report[0] : Object.values(report)[0] as {filename: string; files: {path: string}[]};
    assert.ok(!packed.files.some((file: {path: string}) => file.path === 'APPEND_SYSTEM.md'));
    execFileSync('tar', ['-xzf', path.join(directory, packed.filename), '-C', directory]);
    const extracted = path.join(directory, 'package');
    // Supply already-installed extraction dependencies offline. Host SDK/TypeBox
    // imports are resolved by Pi's real extension loader, not a fake module.
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(extracted, 'node_modules'), 'dir');
    const target = await hostFixture(t, {}, {packages: [extracted]});
    assert.equal(target.loader.getExtensions().extensions.filter(extension => extension.path.startsWith(extracted)).length, 2);
    assert.ok(target.loader.getSkills().skills.some(skill => skill.name === 'setup'));
    assert.ok(target.loader.getPrompts().prompts.some(prompt => prompt.name === 'setup'));
    assert.deepEqual(target.loader.getAppendSystemPrompt(), []);
    const declaration = await target.script('return await describeTool("fetch_content");');
    assert.equal(declaration.isError, false, resultText(declaration));
    assert.match(resultText(declaration), /nextOffset/);
    assert.equal((await target.run('read', {path: 'auth.json'})).isError, true);
});
