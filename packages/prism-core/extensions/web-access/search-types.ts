// $KYAULabs: search-types.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

export type SearchRecency = 'day' | 'week' | 'month' | 'year';

export interface SearchParams {
    query: string;
    limit: number;
    recency?: SearchRecency;
    domains: string[];
}

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
