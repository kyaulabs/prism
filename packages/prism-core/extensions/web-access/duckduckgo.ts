// $KYAULabs: duckduckgo.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

import {parseHTML} from 'linkedom';
import {WebAccessError} from './errors.ts';
import {
    requestPublicText as defaultRequestPublicText,
    type RequestTextOptions,
    type TextResponse,
} from './http.ts';
import {
    filterResults,
    searchQuery,
    validateSearchParams,
} from './search-filters.ts';
import type {SearchParams, SearchResult} from './search-types.ts';

const SEARCH_ORIGIN = 'https://html.duckduckgo.com';
const RECENCY = Object.freeze({day: 'd', week: 'w', month: 'm', year: 'y'});
const SEARCH_BODY_LIMIT = 1024 * 1024;

export interface DuckDuckGoDependencies {
    requestPublicText?: (
        url: string | URL,
        options?: RequestTextOptions,
    ) => Promise<TextResponse>;
    signal?: AbortSignal;
}

function text(element: Element | null): string {
    return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function resultUrl(value: string): string {
    const url = new URL(value, SEARCH_ORIGIN);
    if ((url.hostname === 'duckduckgo.com' || url.hostname.endsWith('.duckduckgo.com')) &&
        url.pathname === '/l/') {
        const target = url.searchParams.get('uddg');
        if (!target) throw new Error();
        return new URL(target).href;
    }
    return url.href;
}

export function parseDuckDuckGoHtml(html: string, input: SearchParams): SearchResult[] {
    const params = validateSearchParams(input);
    try {
        const {document} = parseHTML(html);
        const parsed: SearchResult[] = [];
        for (const entry of document.querySelectorAll('.result')) {
            const anchor = entry.querySelector('.result__a');
            const href = anchor?.getAttribute('href');
            if (!href) continue;
            try {
                parsed.push({
                    title: text(anchor),
                    url: resultUrl(href),
                    snippet: text(entry.querySelector('.result__snippet')),
                });
            } catch {
                continue;
            }
        }
        if (parsed.length === 0 &&
            /(captcha|anomaly-modal|challenge|bots|human verification)/i.test(html)) {
            throw new WebAccessError(
                'WEB_ACCESS_BACKEND_BLOCKED',
                'search backend blocked the request',
                true,
            );
        }
        return filterResults(parsed, params.domains, params.limit);
    } catch (error) {
        if (error instanceof WebAccessError) throw error;
        throw new WebAccessError('WEB_ACCESS_BACKEND_INVALID', 'search backend response is invalid', true);
    }
}

export async function searchDuckDuckGoDirect(
    input: SearchParams,
    deps: DuckDuckGoDependencies = {},
): Promise<SearchResult[]> {
    const params = validateSearchParams(input);
    const url = new URL('/html/', SEARCH_ORIGIN);
    url.searchParams.set('q', searchQuery(params));
    if (params.recency) url.searchParams.set('df', RECENCY[params.recency]);
    const request = deps.requestPublicText ?? defaultRequestPublicText;
    const response = await request(url, {
        signal: deps.signal,
        maxCompressedBytes: SEARCH_BODY_LIMIT,
        maxDecodedBytes: SEARCH_BODY_LIMIT,
    });
    if (response.status < 200 || response.status >= 300 ||
        !response.contentType.toLowerCase().startsWith('text/html')) {
        throw new WebAccessError('WEB_ACCESS_BACKEND_INVALID', 'search backend response is invalid', true);
    }
    return parseDuckDuckGoHtml(response.body, params);
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
