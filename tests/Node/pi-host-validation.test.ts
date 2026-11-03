import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {Type} from 'typebox';
import type {JsonObject} from '@earendil-works/pi-ai';
import {createMcpExtension} from '@earendil-works/pi-coding-agent';
import {hostFixture, resultText} from './pi-host-fixture.ts';

for (const nested of [false, true]) {
    test(`Pi 1.5 web coercion, defaults, rejection and recovery (${nested ? 'Codemode' : 'direct'})`, async t => {
        const searches: unknown[] = [];
        const fetches: unknown[] = [];
        const target = await hostFixture(t, {
            searchWeb: async params => { searches.push(params); return {backend: 'direct', results: []}; },
            fetchContent: async params => { fetches.push(params); return {finalUrl: params.url, status: 200, contentType: 'text/plain', content: '', offset: params.offset, truncated: false}; },
        });
        const run = (name: string, args: JsonObject) => nested
            ? target.script(`return await tools.${name}(${JSON.stringify(args)});`) : target.run(name, args);
        const raw = {query: 'coerce', limit: '3', domains: 'example.com'};
        assert.equal((await run('web_search', raw)).isError, false);
        assert.deepEqual(raw, {query: 'coerce', limit: '3', domains: 'example.com'});
        assert.deepEqual(searches.at(-1), {query: 'coerce', limit: 3, domains: ['example.com']});
        if (!nested) {
            const message = target.session.messages.find(m => m.role === 'assistant' && m.content.some(c => c.type === 'toolCall' && c.name === 'web_search'));
            assert.ok(message && message.role === 'assistant');
            assert.deepEqual(message.content.find(c => c.type === 'toolCall')?.arguments, raw);
        }
        for (const limit of ['3.5', 3.5]) {
            assert.equal((await run('web_search', {query: 'fraction', limit})).isError, false);
            assert.equal((searches.at(-1) as {limit: number}).limit, 3);
        }
        for (const query of [null, 42]) {
            assert.equal((await run('web_search', {query})).isError, false);
            assert.equal((searches.at(-1) as {query: string}).query, String(query));
        }
        assert.equal((await run('web_search', {query: 'defaults', limit: null, domains: null, recency: null})).isError, false);
        assert.deepEqual(searches.at(-1), {query: 'defaults', limit: 5, domains: []});
        assert.equal((await run('fetch_content', {url: 'https://example.com/', mode: null, offset: null, limit: null})).isError, false);
        assert.deepEqual(fetches.at(-1), {url: 'https://example.com/', mode: 'readable', offset: 0, limit: 20000});
        for (const [name, args] of [
            ['web_search', {query: 'x', limit: 11}], ['web_search', {query: 'x', limit: 'impossible'}],
            ['web_search', {query: 'x', extra: true}], ['web_search', {query: 'x'.repeat(501)}],
            ['web_search', {query: 'x', domains: ['x'.repeat(255)]}], ['web_search', {query: 'x', recency: 'century'}],
            ['fetch_content', {url: 'file:///tmp/x'}], ['fetch_content', {url: 'https://example.com/', mode: 'binary'}],
        ] as const) {
            const before = [searches.length, fetches.length];
            const result = await run(name, args);
            assert.equal(result.isError, true, resultText(result));
            assert.match(resultText(result), /web_search|fetch_content/);
            assert.deepEqual([searches.length, fetches.length], before);
        }
        assert.equal((await run('web_search', {query: 'recovered'})).isError, false);
    });
}

test('schema defaults are annotations; explicit execution defaults remain owned by the tool', async t => {
    const received: unknown[] = [];
    const target = await hostFixture(t, {}, {extensions: [pi => pi.registerTool({
        name: 'inspect_defaults', label: 'Inspect defaults', description: 'Synthetic defaults boundary',
        parameters: Type.Object({count: Type.Optional(Type.Integer({default: 7}))}),
        async execute(_id, params) { received.push(params); return {content: [{type: 'text', text: JSON.stringify(params)}], details: {}}; },
    })]});
    assert.equal((await target.run('inspect_defaults', {})).isError, false);
    assert.equal((await target.script('return await tools.inspect_defaults({});')).isError, false);
    assert.deepEqual(received, [{}, {}]);
});

test('plain JSON MCP arguments normalize before the stdio handler; invalid calls do not increment its counter', async t => {
    const target = await hostFixture(t, {}, {extensions: [createMcpExtension({loadConfig: ctx => ({servers: [{
        name: 'arguments', source: path.join(ctx.cwd, 'mcp.json'), scope: 'global',
        config: {command: process.execPath, args: [path.resolve('tests/Node/fixtures/mcp.js')], exposure: 'direct'},
    }], errors: []})})]});
    await target.run('tool_search', {query: 'inspect_arguments'});
    const name = 'mcp__arguments__inspect_arguments';
    for (const nested of [false, true]) {
        const invoke = (args: JsonObject) => nested ? target.script(`const r = await tools.${name}(${JSON.stringify(args)}); return JSON.parse(r.content[0].text);`) : target.run(name, args);
        const invalid = await invoke({count: 99, tags: 'a'});
        assert.equal(invalid.isError, true, resultText(invalid));
        const valid = await invoke({count: '3', tags: 'a', optional: null});
        assert.equal(valid.isError, false, resultText(valid));
        assert.match(resultText(valid), /"count":3/);
        assert.match(resultText(valid), /"tags":\["a"\]/);
        assert.match(resultText(valid), new RegExp(`"invocations":${nested ? 2 : 1}`));
    }
});
