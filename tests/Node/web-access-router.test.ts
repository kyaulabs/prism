// $KYAULabs: web-access-router.test.ts kyau@aura.kyaulabs 2026/09/09 -0700 Exp $

import assert from 'node:assert/strict';
import test from 'node:test';
import {loadWebAccessConfig, resolveBrowserCapability} from '../../packages/prism-core/extensions/web-access/config.ts';
import {searchWeb} from '../../packages/prism-core/extensions/web-access/router.ts';
import {WebAccessError} from '../../packages/prism-core/extensions/web-access/errors.ts';
import type {SearchParams, SearchResult} from '../../packages/prism-core/extensions/web-access/search-types.ts';

const PARAMS: SearchParams = {query: 'route search', limit: 3, domains: []};
const RESULTS: SearchResult[] = [{title: 'Result', url: 'https://example.com/result', snippet: 'Snippet'}];

function fallback(): WebAccessError {
    return new WebAccessError('WEB_ACCESS_BROWSER_FAILED', 'PRIVATE-CANARY', true);
}

test('configuration errors stay redacted and browser capability remains discoverable', () => {
    assert.deepEqual(loadWebAccessConfig({inspectWebAccessConfig: () => ({
        state: 'ABSENT', path: '/private/CANARY', config: {searxngUrl: null, browser: 'auto'},
    })}), {searxngUrl: null, browser: 'auto'});
    assert.throws(() => loadWebAccessConfig({inspectWebAccessConfig: () => ({
        state: 'UNSAFE', path: '/private/CANARY', config: {searxngUrl: null, browser: 'auto'},
    })}), (error: unknown) => {
        assert.ok(error instanceof WebAccessError);
        assert.equal(error.code, 'WEB_ACCESS_CONFIG_UNSAFE');
        assert.doesNotMatch(error.message, /CANARY|private/);
        return true;
    });
    assert.deepEqual(resolveBrowserCapability({resolveWebAccessBrowser: () => ({
        status: 'AVAILABLE', family: 'brave', executable: '/usr/bin/brave',
    })}), {status: 'AVAILABLE', family: 'brave', executable: '/usr/bin/brave'});
});

for (const [browser, searxngUrl, expected] of [
    ['auto', 'http://localhost:8080', ['browser', 'searxng']],
    ['auto', null, ['browser', 'direct']],
    ['disabled', null, ['direct']],
] as const) {
    test(`routing ${browser}/${searxngUrl} requires no consent dependency`, async () => {
        const order: string[] = [];
        const result = await searchWeb(PARAMS, {
            loadConfig: () => ({browser, searxngUrl}),
            searchBrowser: async () => { order.push('browser'); throw fallback(); },
            searchSearxng: async () => { order.push('searxng'); return RESULTS; },
            searchDirect: async () => { order.push('direct'); return RESULTS; },
        });
        assert.deepEqual(order, expected);
        assert.deepEqual(result, {backend: expected.at(-1), results: RESULTS});
    });
}

test('invalid input and terminal security/configuration/cancellation errors stop fallback', async () => {
    let calls = 0;
    await assert.rejects(() => searchWeb({...PARAMS, limit: 11}, {
        loadConfig: () => ({browser: 'auto', searxngUrl: null}),
        searchBrowser: async () => { calls += 1; return RESULTS; },
    }), (error: unknown) => error instanceof WebAccessError && error.code === 'WEB_ACCESS_INVALID_INPUT');
    assert.equal(calls, 0);
    for (const code of ['WEB_ACCESS_CANCELLED', 'WEB_ACCESS_TARGET_BLOCKED', 'WEB_ACCESS_CONFIG_UNSAFE']) {
        const terminal = new WebAccessError(code, 'stopped');
        await assert.rejects(() => searchWeb(PARAMS, {
            loadConfig: () => {
                if (code === 'WEB_ACCESS_CONFIG_UNSAFE') throw terminal;
                return {browser: 'auto', searxngUrl: 'http://localhost:8080'};
            },
            searchBrowser: async () => { throw terminal; },
            searchSearxng: async () => { calls += 1; return RESULTS; },
            searchDirect: async () => { calls += 1; return RESULTS; },
        }), (error: unknown) => error === terminal);
    }
    assert.equal(calls, 0);
});

test('all fallback failures expose backend categories only', async () => {
    const attempted: string[] = [];
    await assert.rejects(() => searchWeb(PARAMS, {
        loadConfig: () => ({browser: 'auto', searxngUrl: 'http://localhost:8080'}),
        searchBrowser: async () => { attempted.push('browser'); throw fallback(); },
        searchSearxng: async () => { attempted.push('searxng'); throw fallback(); },
        searchDirect: async () => { attempted.push('direct'); throw fallback(); },
    }), (error: unknown) => {
        assert.ok(error instanceof WebAccessError);
        assert.equal(error.code, 'WEB_ACCESS_SEARCH_FAILED');
        assert.equal(error.message, 'web search failed: browser, searxng, direct');
        assert.doesNotMatch(error.message, /PRIVATE|CANARY/);
        return true;
    });
    assert.deepEqual(attempted, ['browser', 'searxng', 'direct']);
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
