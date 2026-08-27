// $KYAULabs: web-access-router.test.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    requireStandingWebAccess,
} from '../../packages/prism-core/extensions/web-access/authorization.ts';
import {
    loadWebAccessConfig,
    resolveBrowserCapability,
} from '../../packages/prism-core/extensions/web-access/config.ts';
import {
    searchWeb,
    type SearchBackendResult,
} from '../../packages/prism-core/extensions/web-access/router.ts';
import {WebAccessError} from '../../packages/prism-core/extensions/web-access/errors.ts';
import type {SearchParams, SearchResult} from '../../packages/prism-core/extensions/web-access/search-types.ts';

const PARAMS: SearchParams = {query: 'route search', limit: 3, domains: []};
const RESULTS: SearchResult[] = [{
    title: 'Result',
    url: 'https://example.com/result',
    snippet: 'Snippet',
}];

function fallback(code: string, canary: string): WebAccessError {
    return new WebAccessError(code, `backend failed ${canary}`, true);
}

test('authorization and configuration adapters sanitize launcher failures and hide paths', () => {
    assert.doesNotThrow(() => requireStandingWebAccess({requireWebConsent: () => ({state: 'GRANTED'})}));
    assert.throws(
        () => requireStandingWebAccess({
            requireWebConsent: () => { throw new Error('/home/private/PRISM_CONSENT_CANARY'); },
        }),
        (error: unknown) => {
            assert.ok(error instanceof WebAccessError);
            assert.equal(error.code, 'WEB_ACCESS_CONSENT_REQUIRED');
            assert.doesNotMatch(error.message, /PRISM_CONSENT_CANARY|\/home\/private/);
            return true;
        },
    );
    assert.deepEqual(loadWebAccessConfig({inspectWebAccessConfig: () => ({
        state: 'ABSENT',
        path: '/home/private/PRISM_CONFIG_CANARY',
        config: {searxngUrl: null, browser: 'auto'},
    })}), {searxngUrl: null, browser: 'auto'});
    assert.throws(
        () => loadWebAccessConfig({inspectWebAccessConfig: () => ({
            state: 'UNSAFE',
            path: '/home/private/PRISM_CONFIG_CANARY',
            config: {searxngUrl: null, browser: 'auto'},
        })}),
        (error: unknown) => {
            assert.ok(error instanceof WebAccessError);
            assert.equal(error.code, 'WEB_ACCESS_CONFIG_UNSAFE');
            assert.doesNotMatch(error.message, /PRISM_CONFIG_CANARY|\/home\/private/);
            return true;
        },
    );
    assert.deepEqual(resolveBrowserCapability({resolveWebAccessBrowser: () => ({
        status: 'AVAILABLE', family: 'brave', executable: '/usr/bin/brave',
    })}), {status: 'AVAILABLE', family: 'brave', executable: '/usr/bin/brave'});
});

test('routing checks consent immediately before browser and configured SearXNG', async () => {
    const order: string[] = [];
    const result = await searchWeb(PARAMS, {
        loadConfig: () => ({searxngUrl: 'http://localhost:8080', browser: 'auto'}),
        requireConsent: () => { order.push('consent'); },
        searchBrowser: async () => {
            order.push('browser');
            throw fallback('WEB_ACCESS_BROWSER_UNAVAILABLE', 'PRIVATE_BROWSER_CANARY');
        },
        searchSearxng: async () => { order.push('searxng'); return RESULTS; },
        searchDirect: async () => { order.push('direct'); return []; },
    });

    assert.deepEqual(result, {backend: 'searxng', results: RESULTS});
    assert.deepEqual(order, ['consent', 'browser', 'consent', 'searxng']);
});

test('routing skips absent SearXNG and reaches direct search in fixed order', async () => {
    const order: string[] = [];
    const result = await searchWeb(PARAMS, {
        loadConfig: () => ({searxngUrl: null, browser: 'auto'}),
        requireConsent: () => { order.push('consent'); },
        searchBrowser: async () => {
            order.push('browser');
            throw new Error('PRIVATE_UNKNOWN_BROWSER_CANARY');
        },
        searchSearxng: async () => { order.push('searxng'); return []; },
        searchDirect: async () => { order.push('direct'); return RESULTS; },
    });

    assert.deepEqual(result, {backend: 'direct', results: RESULTS});
    assert.deepEqual(order, ['consent', 'browser', 'consent', 'direct']);
});

test('disabled browser mode proceeds directly without a browser consented effect', async () => {
    const order: string[] = [];
    const result = await searchWeb(PARAMS, {
        loadConfig: () => ({searxngUrl: null, browser: 'disabled'}),
        requireConsent: () => { order.push('consent'); },
        searchBrowser: async () => { order.push('browser'); return []; },
        searchSearxng: async () => { order.push('searxng'); return []; },
        searchDirect: async () => { order.push('direct'); return RESULTS; },
    });
    assert.deepEqual(result, {backend: 'direct', results: RESULTS});
    assert.deepEqual(order, ['consent', 'direct']);
});

test('consent revoked between fallback attempts stops before the next effect', async () => {
    let consentChecks = 0;
    let directCalls = 0;
    await assert.rejects(
        () => searchWeb(PARAMS, {
            loadConfig: () => ({searxngUrl: null, browser: 'auto'}),
            requireConsent: () => {
                consentChecks += 1;
                if (consentChecks === 2) {
                    throw new WebAccessError('WEB_ACCESS_CONSENT_REQUIRED', 'standing consent required');
                }
            },
            searchBrowser: async () => { throw fallback('WEB_ACCESS_BROWSER_FAILED', 'browser'); },
            searchSearxng: async () => [],
            searchDirect: async () => { directCalls += 1; return RESULTS; },
        }),
        (error: unknown) => error instanceof WebAccessError &&
            error.code === 'WEB_ACCESS_CONSENT_REQUIRED',
    );
    assert.equal(consentChecks, 2);
    assert.equal(directCalls, 0);
});

test('invalid input config cancellation and security failures are terminal', async () => {
    let backendCalls = 0;
    await assert.rejects(
        () => searchWeb({...PARAMS, limit: 11}, {
            loadConfig: () => ({searxngUrl: null, browser: 'auto'}),
            requireConsent: () => undefined,
            searchBrowser: async () => { backendCalls += 1; return RESULTS; },
            searchSearxng: async () => RESULTS,
            searchDirect: async () => RESULTS,
        }),
        (error: unknown) => error instanceof WebAccessError &&
            error.code === 'WEB_ACCESS_INVALID_INPUT',
    );
    assert.equal(backendCalls, 0);

    for (const terminal of [
        new WebAccessError('WEB_ACCESS_CANCELLED', 'cancelled'),
        new WebAccessError('WEB_ACCESS_TARGET_BLOCKED', 'blocked'),
        new WebAccessError('WEB_ACCESS_CONFIG_UNSAFE', 'unsafe'),
    ]) {
        let later = 0;
        await assert.rejects(
            () => searchWeb(PARAMS, {
                loadConfig: () => {
                    if (terminal.code === 'WEB_ACCESS_CONFIG_UNSAFE') throw terminal;
                    return {searxngUrl: null, browser: 'auto'};
                },
                requireConsent: () => undefined,
                searchBrowser: async () => { throw terminal; },
                searchSearxng: async () => { later += 1; return RESULTS; },
                searchDirect: async () => { later += 1; return RESULTS; },
            }),
            (error: unknown) => error === terminal,
        );
        assert.equal(later, 0);
    }
});

test('aggregate failures expose backend categories only', async () => {
    const attempted: string[] = [];
    await assert.rejects(
        () => searchWeb(PARAMS, {
            loadConfig: () => ({searxngUrl: 'http://localhost:8080', browser: 'auto'}),
            requireConsent: () => undefined,
            searchBrowser: async () => {
                attempted.push('browser');
                throw fallback('WEB_ACCESS_BROWSER_FAILED', 'PRIVATE_BROWSER_CANARY');
            },
            searchSearxng: async () => {
                attempted.push('searxng');
                throw fallback('WEB_ACCESS_BACKEND_INVALID', 'PRIVATE_SEARX_CANARY');
            },
            searchDirect: async () => {
                attempted.push('direct');
                throw fallback('WEB_ACCESS_BACKEND_BLOCKED', 'PRIVATE_DIRECT_CANARY');
            },
        }),
        (error: unknown) => {
            assert.ok(error instanceof WebAccessError);
            assert.equal(error.code, 'WEB_ACCESS_SEARCH_FAILED');
            assert.equal(error.message, 'web search failed: browser, searxng, direct');
            assert.doesNotMatch(error.message, /PRIVATE_|FAILED|INVALID|BLOCKED/);
            return true;
        },
    );
    assert.deepEqual(attempted, ['browser', 'searxng', 'direct']);
});

function assertBackend(result: SearchBackendResult): string {
    return result.backend;
}

test('router result type exposes only the backend category and results', () => {
    assert.equal(assertBackend({backend: 'direct', results: []}), 'direct');
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
