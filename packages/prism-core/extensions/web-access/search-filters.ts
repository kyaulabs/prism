// $KYAULabs: search-filters.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

import net from 'node:net';
import {WebAccessError} from './errors.ts';
import {parsePublicUrl} from './network.ts';
import type {SearchParams, SearchRecency, SearchResult} from './search-types.ts';

const RECENCY = new Set<SearchRecency>(['day', 'week', 'month', 'year']);
const PARAM_KEYS = new Set(['query', 'limit', 'recency', 'domains']);

function invalidInput(): never {
    throw new WebAccessError('WEB_ACCESS_INVALID_INPUT', 'invalid search input');
}

function normalizeDomain(value: string): string {
    if (typeof value !== 'string' || value.length === 0 || value.length > 254) invalidInput();
    const excluded = value.startsWith('-');
    const raw = excluded ? value.slice(1) : value;
    if (raw.length === 0 || raw.includes('/') || raw.includes('@') || raw.includes(':')) invalidInput();
    let hostname: string;
    try {
        const url = new URL(`https://${raw}/`);
        hostname = url.hostname.toLowerCase();
        if (url.pathname !== '/' || url.search !== '' || url.hash !== '') invalidInput();
    } catch {
        invalidInput();
    }
    if (hostname === 'localhost' || net.isIP(hostname) !== 0 || !hostname.includes('.')) invalidInput();
    return `${excluded ? '-' : ''}${hostname}`;
}

export function validateSearchParams(input: SearchParams): SearchParams {
    if (input === null || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).some((key) => !PARAM_KEYS.has(key)) ||
        typeof input.query !== 'string' || input.query.trim().length === 0 ||
        input.query.length > 500 || !Number.isSafeInteger(input.limit) ||
        input.limit < 1 || input.limit > 10 || !Array.isArray(input.domains) ||
        input.domains.length > 10 ||
        (input.recency !== undefined && !RECENCY.has(input.recency))) {
        invalidInput();
    }
    const domains = input.domains.map(normalizeDomain);
    return {
        query: input.query.trim(),
        limit: input.limit,
        ...(input.recency === undefined ? {} : {recency: input.recency}),
        domains,
    };
}

function hostnameMatches(hostname: string, domain: string): boolean {
    return hostname === domain || hostname.endsWith(`.${domain}`);
}

function normalizeText(value: string): string {
    const whitespace = value.replace(/\s+/g, ' ').trim();
    return Array.from(whitespace)
        .filter((character) => {
            const code = character.codePointAt(0) ?? 0;
            return code >= 0x20 && !(code >= 0x7f && code <= 0x9f);
        })
        .join('');
}

export function filterResults(
    results: SearchResult[],
    domains: string[],
    limit: number,
): SearchResult[] {
    const normalizedDomains = domains.map(normalizeDomain);
    const includes = normalizedDomains.filter((domain) => !domain.startsWith('-'));
    const excludes = normalizedDomains
        .filter((domain) => domain.startsWith('-'))
        .map((domain) => domain.slice(1));
    const output: SearchResult[] = [];
    const seen = new Set<string>();
    for (const result of results) {
        if (output.length >= limit || !result || typeof result.title !== 'string' ||
            typeof result.url !== 'string' || typeof result.snippet !== 'string') continue;
        let url: URL;
        try { url = parsePublicUrl(result.url); } catch { continue; }
        const hostname = url.hostname.toLowerCase();
        if (includes.length > 0 && !includes.some((domain) => hostnameMatches(hostname, domain))) continue;
        if (excludes.some((domain) => hostnameMatches(hostname, domain))) continue;
        if (seen.has(url.href)) continue;
        const title = normalizeText(result.title);
        if (title.length === 0) continue;
        seen.add(url.href);
        output.push({title, url: url.href, snippet: normalizeText(result.snippet)});
    }
    return output;
}

export function searchQuery(params: SearchParams): string {
    return [
        params.query,
        ...params.domains.map((domain) => domain.startsWith('-')
            ? `-site:${domain.slice(1)}`
            : `site:${domain}`),
    ].join(' ');
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
