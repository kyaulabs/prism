// $KYAULabs: template-source-http.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const {TextDecoder} = require('node:util');

const RESPONSE_TIMEOUT_MS = 10000;

class TemplateSourceError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

async function readBoundedBody(response, maxBytes) {
    if (!response.body || typeof response.body.getReader !== 'function') {
        throw new TemplateSourceError('RESPONSE_INVALID');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            throw new TemplateSourceError('RESPONSE_TOO_LARGE');
        }
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
}

async function requestTemplateJson({fetchImpl, url, maxBytes}) {
    let response;
    try {
        response = await fetchImpl(url, {
            method: 'GET',
            redirect: 'manual',
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            headers: {
                accept: 'application/vnd.github+json',
                'user-agent': '@kyaulabs/prism-core',
                'x-github-api-version': '2022-11-28',
            },
            signal: globalThis.AbortSignal.timeout(RESPONSE_TIMEOUT_MS),
        });
    } catch {
        throw new TemplateSourceError('NETWORK_FAILED');
    }
    if (response.status !== 200 || response.redirected === true) {
        throw new TemplateSourceError('RESPONSE_REJECTED');
    }
    const bytes = await readBoundedBody(response, maxBytes);
    try {
        const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
        return JSON.parse(text);
    } catch {
        throw new TemplateSourceError('RESPONSE_INVALID');
    }
}

module.exports = {TemplateSourceError, requestTemplateJson};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
