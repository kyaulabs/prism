// $KYAULabs: web-access-extension.test.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import test from 'node:test';
import {WebAccessError} from '../../packages/prism-core/extensions/web-access/errors.ts';
import type {FetchContentResult} from '../../packages/prism-core/extensions/web-access/fetch.ts';
import type {SearchBackendResult} from '../../packages/prism-core/extensions/web-access/router.ts';

interface ToolResult {
    content: Array<{type: string; text: string}>;
    details?: Record<string, unknown>;
}

interface ToolDefinition {
    name: string;
    label: string;
    description: string;
    promptSnippet?: string;
    promptGuidelines?: string[];
    parameters: {
        properties: Record<string, Record<string, unknown>>;
        required?: string[];
    };
    execute(
        id: string,
        params: Record<string, unknown>,
        signal: AbortSignal,
        onUpdate?: (result: ToolResult) => void,
    ): Promise<ToolResult>;
}

interface ExtensionModule {
    registerWebAccessTools(
        pi: {registerTool(tool: ToolDefinition): void},
        deps: Record<string, unknown>,
    ): void;
}

let extension: ExtensionModule;

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
        extension = await import(
            '../../packages/prism-core/extensions/web-access/index.ts'
        ) as unknown as ExtensionModule;
    } finally {
        globalThis.setTimeout = originalTimeout;
        childProcess.spawn = originalSpawn;
    }
    assert.equal(timers, 0);
    assert.equal(spawns, 0);
});

function captureTools(deps: Record<string, unknown>): Map<string, ToolDefinition> {
    const tools = new Map<string, ToolDefinition>();
    extension.registerWebAccessTools({
        registerTool(tool) { tools.set(tool.name, tool); },
    }, deps);
    return tools;
}

test('registers only the bounded web_search and fetch_content schemas', () => {
    const tools = captureTools({});
    assert.deepEqual([...tools.keys()], ['web_search', 'fetch_content']);

    const search = tools.get('web_search') as ToolDefinition;
    assert.equal(search.label, 'Web search');
    assert.match(search.description, /web_search/);
    assert.match(search.description, /untrusted/i);
    assert.match(search.promptSnippet ?? '', /Search the public web/);
    assert.equal(search.promptGuidelines?.every((line) => line.includes('web_search')), true);
    assert.equal(search.parameters.properties.query.minLength, 1);
    assert.equal(search.parameters.properties.query.maxLength, 500);
    assert.equal(search.parameters.properties.limit.minimum, 1);
    assert.equal(search.parameters.properties.limit.maximum, 10);
    assert.deepEqual(search.parameters.properties.recency.enum, ['day', 'week', 'month', 'year']);
    assert.equal((search.parameters.properties.domains.items as {maxLength: number}).maxLength, 254);
    assert.equal(search.parameters.properties.domains.maxItems, 10);
    assert.deepEqual(search.parameters.required, ['query']);

    const fetch = tools.get('fetch_content') as ToolDefinition;
    assert.equal(fetch.label, 'Fetch content');
    assert.match(fetch.description, /fetch_content/);
    assert.match(fetch.description, /untrusted/i);
    assert.match(fetch.promptSnippet ?? '', /Fetch bounded/);
    assert.equal(fetch.promptGuidelines?.every((line) => line.includes('fetch_content')), true);
    assert.match(fetch.parameters.properties.url.pattern as string, /^\^https/);
    assert.deepEqual(fetch.parameters.properties.mode.enum, ['readable', 'raw']);
    assert.equal(fetch.parameters.properties.offset.minimum, 0);
    assert.equal(fetch.parameters.properties.limit.maximum, 40_000);
    assert.deepEqual(fetch.parameters.required, ['url']);
});

test('web_search reports progress, passes AbortSignal, and returns structured details', async () => {
    const controller = new AbortController();
    const updates: ToolResult[] = [];
    let receivedSignal: AbortSignal | undefined;
    const backend: SearchBackendResult = {
        backend: 'browser',
        results: [{title: 'Title', url: 'https://example.com/', snippet: 'Snippet'}],
    };
    const tools = captureTools({
        searchWeb: async (_params: unknown, deps: {signal?: AbortSignal}) => {
            receivedSignal = deps.signal;
            return backend;
        },
    });
    const result = await (tools.get('web_search') as ToolDefinition).execute(
        'call-1',
        {query: 'bounded search'},
        controller.signal,
        (update) => updates.push(update),
    );

    assert.equal(receivedSignal, controller.signal);
    assert.equal(updates.length > 0, true);
    assert.match(updates[0].content[0].text, /web_search/);
    assert.match(result.content[0].text, /Untrusted web_search evidence/);
    assert.match(result.content[0].text, /https:\/\/example\.com\//);
    assert.deepEqual(result.details, {
        backend: 'browser',
        resultCount: 1,
        truncated: false,
    });
});

test('fetch_content checks consent, passes AbortSignal, and truncates final output', async () => {
    const controller = new AbortController();
    const order: string[] = [];
    const lines = Array.from({length: 2500}, (_, index) => `line ${index}`).join('\n');
    const fetched: FetchContentResult = {
        finalUrl: 'https://example.com/final',
        status: 200,
        contentType: 'text/plain',
        content: `${lines}${'x'.repeat(60_000)}`,
        offset: 0,
        nextOffset: 100_000,
        truncated: true,
    };
    let receivedSignal: AbortSignal | undefined;
    const updates: ToolResult[] = [];
    const tools = captureTools({
        requireStandingWebAccess: () => { order.push('consent'); },
        fetchContent: async (_params: unknown, deps: {signal?: AbortSignal}) => {
            order.push('fetch');
            receivedSignal = deps.signal;
            return fetched;
        },
    });
    const result = await (tools.get('fetch_content') as ToolDefinition).execute(
        'call-2',
        {url: 'https://example.com/'},
        controller.signal,
        (update) => updates.push(update),
    );

    assert.deepEqual(order, ['consent', 'fetch']);
    assert.equal(receivedSignal, controller.signal);
    assert.match(updates[0].content[0].text, /fetch_content/);
    assert.equal(Buffer.byteLength(result.content[0].text) <= 50 * 1024, true);
    assert.equal(result.content[0].text.split('\n').length <= 2000, true);
    assert.equal(result.details?.truncated, true);
    assert.equal('content' in (result.details ?? {}), false);
});

test('tool failures remain thrown sanitized errors for Pi isError handling', async () => {
    const tools = captureTools({
        searchWeb: async () => {
            throw new WebAccessError('WEB_ACCESS_SEARCH_FAILED', 'web search failed: browser, direct');
        },
        requireStandingWebAccess: () => undefined,
        fetchContent: async () => {
            throw new WebAccessError('WEB_ACCESS_TARGET_BLOCKED', 'web target is not public');
        },
    });
    for (const [name, params, code] of [
        ['web_search', {query: 'failure'}, 'WEB_ACCESS_SEARCH_FAILED'],
        ['fetch_content', {url: 'https://example.com/'}, 'WEB_ACCESS_TARGET_BLOCKED'],
    ] as const) {
        await assert.rejects(
            () => (tools.get(name) as ToolDefinition).execute(
                'call-error', params, new AbortController().signal,
            ),
            (error: unknown) => error instanceof WebAccessError && error.code === code,
        );
    }
});

// vim: ft=typescript sts=4 sw=4 ts=4 et :
