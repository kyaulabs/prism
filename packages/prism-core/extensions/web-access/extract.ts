// $KYAULabs: extract.ts kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

import {Readability} from '@mozilla/readability';
import {parseHTML} from 'linkedom';
import TurndownService from 'turndown';
import {WebAccessError} from './errors.ts';
import type {TextResponse} from './http.ts';

export interface ReadableContent {
    title?: string;
    content: string;
}

function normalizeLinks(document: Document, finalUrl: string): void {
    for (const element of document.querySelectorAll('[href]')) {
        const value = element.getAttribute('href');
        if (!value) continue;
        try {
            const url = new URL(value, finalUrl);
            if (!['http:', 'https:'].includes(url.protocol)) element.removeAttribute('href');
            else element.setAttribute('href', url.href);
        } catch {
            element.removeAttribute('href');
        }
    }
    for (const element of document.querySelectorAll('[src]')) {
        const value = element.getAttribute('src');
        if (!value) continue;
        try {
            const url = new URL(value, finalUrl);
            if (!['http:', 'https:'].includes(url.protocol)) element.removeAttribute('src');
            else element.setAttribute('src', url.href);
        } catch {
            element.removeAttribute('src');
        }
    }
}

export function extractReadable(response: TextResponse): ReadableContent {
    const mediaType = response.contentType.split(';', 1)[0].trim().toLowerCase();
    if (!['text/html', 'application/xhtml+xml'].includes(mediaType) ||
        response.body.includes('\u0000')) {
        throw new WebAccessError('WEB_ACCESS_EXTRACTION_FAILED', 'readable extraction failed');
    }
    try {
        const {document} = parseHTML(response.body);
        const title = document.title.trim();
        for (const element of document.querySelectorAll('script, style, noscript, template')) {
            element.remove();
        }
        normalizeLinks(document as unknown as Document, response.finalUrl);
        const article = new Readability(document as unknown as Document, {charThreshold: 1}).parse();
        if (!article?.content || !article.textContent?.trim()) throw new Error();
        const turndown = new TurndownService({
            bulletListMarker: '-',
            codeBlockStyle: 'fenced',
            headingStyle: 'atx',
        });
        const content = turndown.turndown(article.content).trim();
        if (content.length === 0) throw new Error();
        return {title: title || article.title?.trim() || undefined, content};
    } catch (error) {
        if (error instanceof WebAccessError) throw error;
        throw new WebAccessError('WEB_ACCESS_EXTRACTION_FAILED', 'readable extraction failed');
    }
}

// vim: ft=typescript sts=4 sw=4 ts=4 et :
