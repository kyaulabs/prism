// $KYAULabs: searxng.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

import {WebAccessError} from './errors.ts';
import {
    requestLoopbackJson as defaultRequestLoopbackJson,
    type RequestTextOptions,
} from './http.ts';
import {
    filterResults,
    searchQuery,
    validateSearchParams,
} from './search-filters.ts';
import type {SearchParams, SearchResult} from './search-types.ts';

const SEARCH_BODY_LIMIT = 1024 * 1024;
const MAX_SOURCE_RESULTS = 100;

export interface SearxngDependencies {
    requestLoopbackJson?: (
        url: string | URL,
        options?: RequestTextOptions,
    ) => Promise<unknown>;
    signal?: AbortSignal;
}

function backendInvalid(): never {
    throw new WebAccessError('WEB_ACCESS_BACKEND_INVALID', 'search backend response is invalid', true);
}

function parseResults(value: unknown): SearchResult[] {
    if (value === null || Array.isArray(value) || typeof value !== 'object') backendInvalid();
    const results = (value as {results?: unknown}).results;
    if (!Array.isArray(results) || results.length > MAX_SOURCE_RESULTS) backendInvalid();
    return results.map((entry) => {
        if (entry === null || Array.isArray(entry) || typeof entry !== 'object') backendInvalid();
        const result = entry as {title?: unknown; url?: unknown; content?: unknown};
        if (typeof result.title !== 'string' || typeof result.url !== 'string' ||
            typeof result.content !== 'string') backendInvalid();
        return {title: result.title, url: result.url, snippet: result.content};
    });
}

export async function searchSearxng(
    baseUrl: string,
    input: SearchParams,
    deps: SearxngDependencies = {},
): Promise<SearchResult[]> {
    const params = validateSearchParams(input);
    let url: URL;
    try {
        const base = new URL(baseUrl);
        const pathname = base.pathname.replace(/\/+$/, '');
        base.pathname = `${pathname}/search`;
        base.search = '';
        base.hash = '';
        url = base;
    } catch {
        throw new WebAccessError('WEB_ACCESS_INVALID_INPUT', 'invalid search input');
    }
    url.searchParams.set('q', searchQuery(params));
    url.searchParams.set('format', 'json');
    url.searchParams.set('language', 'en');
    url.searchParams.set('safesearch', '1');
    if (params.recency) url.searchParams.set('time_range', params.recency);
    const request = deps.requestLoopbackJson ?? defaultRequestLoopbackJson;
    const value = await request(url, {
        signal: deps.signal,
        maxCompressedBytes: SEARCH_BODY_LIMIT,
        maxDecodedBytes: SEARCH_BODY_LIMIT,
    });
    return filterResults(parseResults(value), params.domains, params.limit);
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
