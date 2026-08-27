// $KYAULabs: router.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

import {requireStandingWebAccess} from './authorization.ts';
import {
    BrowserCapabilityCache,
    searchWithBrowser,
} from './browser.ts';
import {
    loadWebAccessConfig,
    resolveBrowserCapability,
    type WebAccessConfig,
} from './config.ts';
import {searchDuckDuckGoDirect} from './duckduckgo.ts';
import {WebAccessError} from './errors.ts';
import {validateSearchParams} from './search-filters.ts';
import {searchSearxng} from './searxng.ts';
import type {SearchParams, SearchResult} from './search-types.ts';

export type SearchBackend = 'browser' | 'searxng' | 'direct';

export interface SearchBackendResult {
    backend: SearchBackend;
    results: SearchResult[];
}

export interface RouterDependencies {
    loadConfig?: () => WebAccessConfig;
    requireConsent?: () => void | Promise<void>;
    searchBrowser?: (params: SearchParams, signal?: AbortSignal) => Promise<SearchResult[]>;
    searchSearxng?: (
        baseUrl: string,
        params: SearchParams,
        signal?: AbortSignal,
    ) => Promise<SearchResult[]>;
    searchDirect?: (params: SearchParams, signal?: AbortSignal) => Promise<SearchResult[]>;
    signal?: AbortSignal;
}

const browserCache = new BrowserCapabilityCache(resolveBrowserCapability);

function defaultBrowser(params: SearchParams, signal?: AbortSignal): Promise<SearchResult[]> {
    return searchWithBrowser(params, {cache: browserCache, signal});
}

function defaultSearxng(
    baseUrl: string,
    params: SearchParams,
    signal?: AbortSignal,
): Promise<SearchResult[]> {
    return searchSearxng(baseUrl, params, {signal});
}

function defaultDirect(params: SearchParams, signal?: AbortSignal): Promise<SearchResult[]> {
    return searchDuckDuckGoDirect(params, {signal});
}

function terminalError(error: unknown): error is WebAccessError {
    return error instanceof WebAccessError && !error.fallbackEligible;
}

async function authorize(requireConsent: () => void | Promise<void>): Promise<void> {
    await requireConsent();
}

export async function searchWeb(
    input: SearchParams,
    deps: RouterDependencies = {},
): Promise<SearchBackendResult> {
    const params = validateSearchParams(input);
    const config = (deps.loadConfig ?? loadWebAccessConfig)();
    const requireConsent = deps.requireConsent ?? requireStandingWebAccess;
    const failed: SearchBackend[] = [];

    if (config.browser === 'auto') {
        await authorize(requireConsent);
        try {
            const results = await (deps.searchBrowser ?? defaultBrowser)(params, deps.signal);
            return {backend: 'browser', results};
        } catch (error) {
            if (terminalError(error)) throw error;
            failed.push('browser');
        }
    }

    if (config.searxngUrl !== null) {
        await authorize(requireConsent);
        try {
            const results = await (deps.searchSearxng ?? defaultSearxng)(
                config.searxngUrl,
                params,
                deps.signal,
            );
            return {backend: 'searxng', results};
        } catch (error) {
            if (terminalError(error)) throw error;
            failed.push('searxng');
        }
    }

    await authorize(requireConsent);
    try {
        const results = await (deps.searchDirect ?? defaultDirect)(params, deps.signal);
        return {backend: 'direct', results};
    } catch (error) {
        if (terminalError(error)) throw error;
        failed.push('direct');
    }
    throw new WebAccessError(
        'WEB_ACCESS_SEARCH_FAILED',
        `web search failed: ${failed.join(', ')}`,
    );
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
