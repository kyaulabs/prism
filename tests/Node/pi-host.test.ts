import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {VERSION, createReadToolDefinition, createBashToolDefinition, createPowerShellToolDefinition} from '@earendil-works/pi-coding-agent';
import {Value} from 'typebox/value';
import {hostFixture, resultText} from './pi-host-fixture.ts';
import {createWebAccessTools} from '../../packages/prism-core/extensions/web-access/index.ts';
import {WebAccessError} from '../../packages/prism-core/extensions/web-access/errors.ts';

test('Pi 1.4 validates web inputs and Codemode receives schema-conforming data, not UI details', async t => {
    assert.equal(VERSION, '1.4.0');
    let searches = 0;
    let fetches = 0;
    const target = await hostFixture(t, {
        searchWeb: async () => { searches++; return {backend: 'direct', results: [{title: 'Result', url: 'https://example.com/', snippet: 'Snippet'}]}; },
        fetchContent: async params => { fetches++; return {finalUrl: params.url, status: 200, contentType: 'text/plain', content: 'Fixture text', offset: params.offset, truncated: false}; },
    });
    const direct = await target.run('web_search', {query: 'fixture'});
    assert.equal(direct.isError, false);
    assert.match(resultText(direct), /Untrusted web_search evidence/);
    for (const [name, args] of [['web_search', {query: 'x', limit: 11}], ['fetch_content', {url: 'file:///tmp/fixture'}]] as const) {
        const invalid = await target.run(name, args);
        assert.equal(invalid.isError, true);
    }
    assert.equal(searches, 1);
    assert.equal(fetches, 0);
    const result = await target.script(`
        const search = await tools.web_search({query: "fixture"});
        const fetch = await tools.fetch_content({url: "https://example.com/"});
        if (search.results[0].snippet !== "Snippet" || fetch.text !== "Fixture text") throw Error("not structured");
        return {search, fetch};
    `);
    assert.equal(result.isError, false, resultText(result));
    assert.match(resultText(result), /"snippet":"Snippet"/);
    const schemas = createWebAccessTools();
    for (const event of target.results.filter(event => event.parentToolCallId === result.toolCallId)) {
        assert.ok(Value.Check(event.toolName === 'web_search' ? schemas.search.outputSchema : schemas.fetch.outputSchema, event.structuredContent));
    }
    const invalidNested = await target.script('return await tools.web_search({query:"fixture", limit: 99});');
    assert.equal(invalidNested.isError, true);
    assert.equal(searches, 2);
    assert.equal(fetches, 1);
    const discovery = await target.script('return (await searchTools("web_search fetch_content")).map(t => t.name);');
    assert.match(resultText(discovery), /web_search/);
    assert.match(resultText(discovery), /fetch_content/);
});

test('Codemode receives the same bounded sanitized web page as direct callers', async t => {
    const target = await hostFixture(t, {
        searchWeb: async () => ({backend: 'direct', results: [{title: 'Title', url: 'https://example.com/', snippet: 'x'.repeat(20000)}]}),
        fetchContent: async () => ({finalUrl: 'https://example.com/', status: 200, contentType: 'text/plain',
            content: '🙂\x1b\n'.repeat(15000), offset: 0, nextOffset: 45000, truncated: true}),
    });
    const result = await target.script(`
        const [search, page] = await Promise.all([tools.web_search({query:"bounded"}), tools.fetch_content({url:"https://example.com/"})]);
        if(search.results[0].snippet.length > 2000 || page.nextOffset >= 45000 || page.text.includes(String.fromCharCode(27))) throw Error("unbounded page");
        return {count:search.resultCount, nextOffset:page.nextOffset};
    `);
    assert.equal(result.isError, false, resultText(result));
    const nested = target.results.filter(event => event.parentToolCallId === result.toolCallId);
    assert.equal(nested.length, 2);
    for (const event of nested) {
        assert.ok(Buffer.byteLength(JSON.stringify(event.structuredContent)) <= 50 * 1024);
        assert.ok(Buffer.byteLength(resultText(event)) <= 50 * 1024);
        assert.ok(resultText(event).split('\n').length <= 2000);
    }
});

test('schema-backed web failures still reject in native Codemode and recover for a later call', async t => {
    const target = await hostFixture(t, {
        searchWeb: async params => {
            if (params.query === 'fail') throw new WebAccessError('WEB_ACCESS_SEARCH_FAILED', 'web search failed: direct');
            return {backend: 'direct', results: []};
        },
        fetchContent: async () => { throw new WebAccessError('WEB_ACCESS_TARGET_BLOCKED', 'web target is not public'); },
    });
    assert.equal((await target.run('web_search', {query: 'fail'})).isError, true);
    const result = await target.script(`
        const values = await Promise.allSettled([tools.web_search({query:"fail"}), tools.fetch_content({url:"https://example.com/"})]);
        if (values.some(v => v.status !== "rejected")) throw Error("failure resolved as data");
        return values.map(v => v.reason.message);
    `);
    assert.equal(result.isError, false, resultText(result));
    assert.match(resultText(result), /web search failed: direct/);
    assert.match(resultText(result), /web target is not public/);
    assert.equal((await target.script('return await tools.web_search({query:"recover"});')).isError, false);
});

test('direct and native nested calls are guarded before read/bash/PowerShell execution; a block does not latch', async t => {
    const executed: string[] = [];
    const target = await hostFixture(t, {}, {extensions: [pi => {
        // Only system operations are replaced; real built-in definitions, argument
        // validation and dispatch still run. No credential contents are opened.
        pi.registerTool(createReadToolDefinition(process.cwd(), {operations: {
            access: async file => { executed.push(file); }, readFile: async () => Buffer.from('ordinary fixture'),
            detectImageMimeType: async () => null,
        }}));
        pi.registerTool(createBashToolDefinition(process.cwd(), {operations: {
            exec: async command => { executed.push(command); return {exitCode: 0}; },
        }}));
        pi.registerTool(createPowerShellToolDefinition(process.cwd(), {operations: {
            exec: async command => { executed.push(command); return {exitCode: 0}; },
        }}));
    }]});
    fs.writeFileSync(path.join(target.cwd, 'auth.json'), 'synthetic credential fixture');
    target.session.setActiveToolsByName([...target.session.getActiveToolNames(), 'powershell']);
    for (const [name, args] of [
        ['read', {path: 'auth.json'}], ['bash', {command: 'cat .env'}], ['powershell', {command: 'Get-Content .env'}],
    ] as const) {
        assert.equal((await target.run(name, args)).isError, true, name);
        const nested = await target.script(`return await tools.${name}(${JSON.stringify(args)});`);
        assert.equal(nested.isError, true, resultText(nested));
        assert.ok(target.calls.some(event => event.toolName === name && event.parentToolCallId === nested.toolCallId &&
            event.toolCallId.startsWith(`${nested.toolCallId}/`)));
    }
    assert.deepEqual(executed, []);
    const recovered = await target.script('return await tools.bash({command:"gh issue list"});');
    assert.equal(recovered.isError, false, resultText(recovered));
    assert.deepEqual(executed, ['gh issue list']);
});
