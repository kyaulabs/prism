// $KYAULabs: adapter-catalogue-http.js kyau@aura.kyaulabs 2026/08/27 -0700 Exp $

'use strict';

const {CatalogueError} = require('./adapter-catalogue-validation');

const CATALOGUE_URL = 'https://raw.githubusercontent.com/kyaulabs/prism-adapters/main/catalogue.json';
const MAX_ENVELOPE_BYTES = 1398104;

function unavailable() {
    return new CatalogueError('CATALOGUE_UNAVAILABLE');
}

async function readResponseBytes(response) {
    const declaredLength = response.headers?.get?.('content-length');
    if (declaredLength !== null && declaredLength !== undefined) {
        if (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_ENVELOPE_BYTES) {
            throw new CatalogueError('CATALOGUE_RESPONSE_INVALID');
        }
    }
    if (!response.body || typeof response.body.getReader !== 'function') {
        throw new CatalogueError('CATALOGUE_RESPONSE_INVALID');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
        while (true) {
            const result = await reader.read();
            if (result.done) break;
            const chunk = Buffer.from(result.value);
            length += chunk.length;
            if (length > MAX_ENVELOPE_BYTES) {
                reader.cancel().catch(() => {});
                throw new CatalogueError('CATALOGUE_RESPONSE_INVALID');
            }
            chunks.push(chunk);
        }
    } catch (error) {
        if (error instanceof CatalogueError) throw error;
        throw unavailable();
    }
    return Buffer.concat(chunks, length);
}

async function requestCatalogueEnvelope({fetchImpl = globalThis.fetch} = {}) {
    if (typeof fetchImpl !== 'function') throw unavailable();
    let response;
    try {
        response = await fetchImpl(CATALOGUE_URL, {
            method: 'GET',
            redirect: 'manual',
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            headers: {
                accept: 'application/json',
                'user-agent': '@kyaulabs/prism-core',
            },
            signal: AbortSignal.timeout(10000),
        });
    } catch {
        throw unavailable();
    }
    if (!response || !Number.isInteger(response.status) || response.redirected === true) {
        throw new CatalogueError('CATALOGUE_RESPONSE_INVALID');
    }
    if (response.status >= 500 && response.status <= 599) throw unavailable();
    if (response.status !== 200) throw new CatalogueError('CATALOGUE_RESPONSE_INVALID');
    return readResponseBytes(response);
}

module.exports = {CATALOGUE_URL, requestCatalogueEnvelope};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
