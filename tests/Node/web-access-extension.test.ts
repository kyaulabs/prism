import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import test from 'node:test';
import {Value} from 'typebox/value';
import {WebAccessError} from '../../packages/prism-core/extensions/web-access/errors.ts';
import type {WebAccessExtensionDependencies} from '../../packages/prism-core/extensions/web-access/index.ts';

let extension: typeof import('../../packages/prism-core/extensions/web-access/index.ts');

test('extension import performs no timer or process activity', async () => {
    const originalTimeout = globalThis.setTimeout;
    const originalSpawn = childProcess.spawn;
    let timers = 0;
    let spawns = 0;
    globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
        timers += 1;
        return originalTimeout(...args);
    }) as typeof setTimeout;
    childProcess.spawn = ((...args: Parameters<typeof childProcess.spawn>) => {
        spawns += 1;
        return originalSpawn(...args);
    }) as typeof childProcess.spawn;
    try {
        extension = await import('../../packages/prism-core/extensions/web-access/index.ts');
    } finally {
        globalThis.setTimeout = originalTimeout;
        childProcess.spawn = originalSpawn;
    }
    assert.equal(timers, 0);
    assert.equal(spawns, 0);
});

const signal = new AbortController().signal;
const tools = (deps: WebAccessExtensionDependencies = {}) => extension.createWebAccessTools(deps);

test('real TypeBox schemas bound inputs and outputs and retain direct exposure', () => {
    const {search, fetch} = tools();
    for (const tool of [search, fetch]) {
        assert.equal(tool.exposure, 'direct');
        assert.deepEqual(tool.annotations, {readOnlyHint: true, openWorldHint: true});
        assert.match(tool.description, /untrusted/i);
        assert.ok(tool.outputSchema);
    }
    assert.equal(Value.Check(search.parameters, {query: 'search', limit: 10}), true);
    for (const args of [{query: ''}, {query: 'x', limit: 11}, {query: 'x', extra: true}]) {
        assert.equal(Value.Check(search.parameters, args), false);
    }
    assert.equal(Value.Check(fetch.parameters, {url: 'https://example.com/', mode: 'raw'}), true);
    for (const args of [{url: 'file:///tmp/a'}, {url: 'https://example.com/', offset: -1}, {url: 'https://example.com/', limit: 40001}]) {
        assert.equal(Value.Check(fetch.parameters, args), false);
    }
});

test('search returns usable structured data, readable evidence, UI metadata and the original signal', async () => {
    let received: AbortSignal | undefined;
    const {search} = tools({searchWeb: async (_params, deps) => {
        received = deps.signal;
        return {backend: 'browser', results: [{title: 'Title', url: 'https://example.com/', snippet: 'Snippet'}]};
    }});
    let updates = 0;
    const result = await search.execute('search', {query: 'bounded search'}, signal, () => { updates++; });
    assert.equal(received, signal);
    assert.equal(updates, 1);
    assert.deepEqual(result.structuredContent, {
        backend: 'browser', results: [{title: 'Title', url: 'https://example.com/', snippet: 'Snippet'}],
        resultCount: 1, truncated: false,
    });
    assert.ok(Value.Check(search.outputSchema, result.structuredContent));
    assert.match(result.content[0].type === 'text' ? result.content[0].text : '', /Untrusted web_search evidence/);
    assert.deepEqual(result.details, {backend: 'browser', resultCount: 1, truncated: false});
});

test('both search representations are sanitized and bounded, not a hidden unbounded copy', async () => {
    const {search} = tools({searchWeb: async () => ({backend: 'direct', results: Array.from({length: 20}, (_, i) => ({
        title: 'Title\x1b' + 'x'.repeat(1000), url: `https://example.com/${i}`, snippet: '🙂\n'.repeat(20000),
    }))})});
    const result = await search.execute('search', {query: 'x', limit: 10}, signal, undefined);
    assert.ok(Value.Check(search.outputSchema, result.structuredContent));
    const json = JSON.stringify(result.structuredContent);
    assert.ok(Buffer.byteLength(json) <= 50 * 1024);
    assert.doesNotMatch(json, /\\u001b/);
    assert.equal(result.details.truncated, true);
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    assert.ok(Buffer.byteLength(text) <= 50 * 1024);
    assert.ok(text.split('\n').length <= 2000);
});

test('overlong result URLs are omitted, never silently changed into a different URL', async () => {
    const {search} = tools({searchWeb: async () => ({backend: 'direct', results: [
        {title: 'Too long', url: 'https://example.com/' + 'x'.repeat(9000), snippet: 'Excluded'},
        {title: 'Kept', url: 'https://example.com/kept', snippet: 'Kept'},
    ]})});
    const result = await search.execute('search', {query: 'x'}, signal, undefined);
    assert.deepEqual(result.structuredContent.results.map(record => record.url), ['https://example.com/kept']);
    assert.equal(result.structuredContent.truncated, true);
});

test('fetch bounds both outputs and advances pagination by consumed source characters, not the backend page end', async () => {
    const original = '🙂\x1b\n'.repeat(20000);
    const {fetch} = tools({fetchContent: async (params, deps) => {
        assert.equal(deps.signal, signal);
        return {finalUrl: 'https://example.com/final', status: 200, contentType: 'text/plain', title: 'Title\x1b',
            content: Array.from(original).slice(params.offset, params.offset + params.limit).join(''), offset: params.offset,
            nextOffset: params.offset + params.limit, truncated: true};
    }});
    const first = await fetch.execute('fetch', {url: 'https://example.com/', limit: 40000}, signal, undefined);
    assert.ok(Value.Check(fetch.outputSchema, first.structuredContent));
    const page = first.structuredContent;
    assert.ok(page && typeof page === 'object' && !Array.isArray(page) && typeof page.nextOffset === 'number');
    assert.ok(page.nextOffset < 40000);
    assert.equal(page.title, 'Title');
    assert.equal(page.text, Array.from(original).slice(0, page.nextOffset).join('').replaceAll('\x1b', ''));
    const second = await fetch.execute('fetch2', {url: 'https://example.com/', offset: page.nextOffset, limit: 40000}, signal, undefined);
    assert.ok(Value.Check(fetch.outputSchema, second.structuredContent));
    for (const result of [first, second]) {
        const text = result.content[0].type === 'text' ? result.content[0].text : '';
        assert.ok(Buffer.byteLength(text) <= 50 * 1024);
        assert.ok(Buffer.byteLength(JSON.stringify(result.structuredContent)) <= 50 * 1024);
        assert.ok(text.split('\n').length <= 2000);
        assert.equal('text' in result.details, false);
    }
});

test('tool failures stay sanitized thrown errors, never successful structured error objects', async () => {
    const {search, fetch} = tools({
        searchWeb: async () => { throw new WebAccessError('WEB_ACCESS_SEARCH_FAILED', 'web search failed: browser, direct'); },
        fetchContent: async () => { throw new WebAccessError('WEB_ACCESS_TARGET_BLOCKED', 'web target is not public'); },
    });
    await assert.rejects(search.execute('fail', {query: 'x'}, signal, undefined), {code: 'WEB_ACCESS_SEARCH_FAILED'});
    await assert.rejects(fetch.execute('fail', {url: 'https://example.com/'}, signal, undefined), {code: 'WEB_ACCESS_TARGET_BLOCKED'});
});
