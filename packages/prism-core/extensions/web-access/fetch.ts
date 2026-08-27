// $KYAULabs: fetch.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

import {WebAccessError} from './errors.ts';
import {extractReadable} from './extract.ts';
import {
    requestPublicText as defaultRequestPublicText,
    type RequestTextOptions,
    type TextResponse,
} from './http.ts';

const MAX_PAGE_CHARACTERS = 40_000;
const MAX_OFFSET = 10_000_000;

export interface FetchContentParams {
    url: string;
    mode: 'readable' | 'raw';
    offset: number;
    limit: number;
}

export interface FetchContentResult {
    finalUrl: string;
    status: number;
    contentType: string;
    title?: string;
    content: string;
    offset: number;
    nextOffset?: number;
    truncated: boolean;
}

export interface FetchDependencies {
    requestPublicText?: (
        url: string | URL,
        options?: RequestTextOptions,
    ) => Promise<TextResponse>;
    signal?: AbortSignal;
}

function validateParams(params: FetchContentParams): void {
    if (params === null || typeof params !== 'object' ||
        JSON.stringify(Object.keys(params).sort()) !==
            JSON.stringify(['limit', 'mode', 'offset', 'url']) ||
        typeof params.url !== 'string' || params.url.length === 0 || params.url.length > 8192 ||
        !['readable', 'raw'].includes(params.mode) ||
        !Number.isSafeInteger(params.offset) || params.offset < 0 || params.offset > MAX_OFFSET ||
        !Number.isSafeInteger(params.limit) || params.limit < 1 ||
        params.limit > MAX_PAGE_CHARACTERS) {
        throw new WebAccessError('WEB_ACCESS_INVALID_INPUT', 'invalid fetch input');
    }
}

export async function fetchContent(
    params: FetchContentParams,
    deps: FetchDependencies = {},
): Promise<FetchContentResult> {
    validateParams(params);
    const request = deps.requestPublicText ?? defaultRequestPublicText;
    const response = await request(params.url, {signal: deps.signal});
    const extracted = params.mode === 'readable'
        ? extractReadable(response)
        : {content: response.body};
    const characters = Array.from(extracted.content);
    const page = characters.slice(params.offset, params.offset + params.limit);
    const content = page.join('');
    const truncated = params.offset + page.length < characters.length;
    const result: FetchContentResult = {
        finalUrl: response.finalUrl,
        status: response.status,
        contentType: response.contentType,
        content,
        offset: params.offset,
        truncated,
    };
    if ('title' in extracted && extracted.title) result.title = extracted.title;
    if (truncated) result.nextOffset = params.offset + page.length;
    return result;
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
