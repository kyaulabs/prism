// $KYAULabs: adapter-catalogue-cache.js kyau@aura.kyaulabs 2026/08/27 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const {
    CatalogueError,
    validateCataloguePayload,
    verifyCatalogueEnvelope,
} = require('./adapter-catalogue-validation');
const {CATALOGUE_URL, requestCatalogueEnvelope} = require('./adapter-catalogue-http');
const {STATE, inspectManagedRecord, publishManagedRecord} = require('./managed-record');

const CACHE_FILE = 'prism-adapter-catalogue-cache.json';
const CACHE_LIMIT = 6 * 1024 * 1024;
const MAX_ENTRIES = 4;
const SHA256 = /^[0-9a-f]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const UTC_TIMESTAMP = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/;

function exactKeys(value, keys) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function parseTimestamp(value) {
    if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) throw new Error();
    const parsed = new Date(value);
    const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== canonical) throw new Error();
    return value;
}

function decodeEnvelope(value) {
    if (typeof value !== 'string' || !BASE64.test(value)) throw new Error();
    const bytes = Buffer.from(value, 'base64');
    if (bytes.toString('base64') !== value) throw new Error();
    return bytes;
}

function validationContext(context = {}) {
    return {
        coreRoot: context.coreRoot,
        trust: context.catalogueTrust ?? context.trust,
        now: context.now,
    };
}

function managedContext(context = {}) {
    if (context.catalogueCachePath === undefined) return context;
    return {...context, managedPath: path.resolve(context.catalogueCachePath)};
}

function parseCatalogueCacheRecord(record, context, verifiedEntries) {
    if (!exactKeys(record, ['schemaVersion', 'entries']) || record.schemaVersion !== 1 ||
        !Array.isArray(record.entries) || record.entries.length > MAX_ENTRIES) {
        throw new Error();
    }
    const digests = new Set();
    const sequences = new Set();
    const entries = record.entries.map((entry, index) => {
        if (!exactKeys(entry, ['digest', 'sequence', 'envelope', 'cachedAt']) ||
            !SHA256.test(entry.digest) || digests.has(entry.digest) ||
            !Number.isSafeInteger(entry.sequence) || entry.sequence <= 0 ||
            sequences.has(entry.sequence) ||
            (index > 0 && record.entries[index - 1].sequence <= entry.sequence)) {
            throw new Error();
        }
        const envelopeBytes = decodeEnvelope(entry.envelope);
        if (crypto.createHash('sha256').update(envelopeBytes).digest('hex') !== entry.digest) {
            throw new Error();
        }
        const verified = verifyCatalogueEnvelope({
            bytes: envelopeBytes,
            ...validationContext(context),
        });
        const catalogue = validateCataloguePayload({
            catalogue: verified.catalogue,
            now: new Date(verified.catalogue.issuedAt),
        });
        if (catalogue.sequence !== entry.sequence) throw new Error();
        parseTimestamp(entry.cachedAt);
        digests.add(entry.digest);
        sequences.add(entry.sequence);
        verifiedEntries.set(entry.digest, Object.freeze({...verified, catalogue}));
        return Object.freeze({...entry});
    });
    return Object.freeze({schemaVersion: 1, entries: Object.freeze(entries)});
}

function inspectCatalogueCache(context = {}) {
    const verifiedEntries = new Map();
    const managed = managedContext(context);
    const detail = inspectManagedRecord({
        context: managed,
        filename: CACHE_FILE,
        limit: CACHE_LIMIT,
        parse: (record) => parseCatalogueCacheRecord(record, context, verifiedEntries),
    });
    return {
        ...detail,
        verifiedEntries: detail.state === STATE.GRANTED ? verifiedEntries : new Map(),
    };
}

function currentTime(now) {
    const value = new Date(now ?? Date.now());
    if (!Number.isFinite(value.getTime())) throw new CatalogueError('CATALOGUE_CACHE_UNSAFE');
    return value;
}

function boundedRecord(entries) {
    const retained = entries.slice(0, MAX_ENTRIES);
    while (retained.length > 1) {
        const record = {schemaVersion: 1, entries: retained};
        if (Buffer.byteLength(`${JSON.stringify(record)}\n`, 'utf8') <= CACHE_LIMIT) return record;
        retained.pop();
    }
    return {schemaVersion: 1, entries: retained};
}

function publishCatalogueCache({context = {}, detail, verified}) {
    if (!detail || detail.state === STATE.UNSAFE) {
        throw new CatalogueError('CATALOGUE_CACHE_UNSAFE');
    }
    const existing = detail.record?.entries ?? [];
    const highest = existing[0];
    if (highest && verified.catalogue.sequence < highest.sequence) {
        throw new CatalogueError('CATALOGUE_ROLLBACK');
    }
    const equivalent = existing.find((entry) => entry.sequence === verified.catalogue.sequence);
    if (equivalent && equivalent.digest !== verified.envelopeDigest) {
        throw new CatalogueError('CATALOGUE_EQUIVOCATION');
    }
    const cachedAt = currentTime(context.now).toISOString();
    const current = {
        digest: verified.envelopeDigest,
        sequence: verified.catalogue.sequence,
        envelope: verified.envelopeBytes.toString('base64'),
        cachedAt,
    };
    const entries = [current, ...existing.filter((entry) => entry.digest !== current.digest)]
        .sort((left, right) => right.sequence - left.sequence);
    const record = boundedRecord(entries);
    try {
        publishManagedRecord({
            context: managedContext(context),
            detail,
            filename: CACHE_FILE,
            record,
            limit: CACHE_LIMIT,
            parse: (value) => parseCatalogueCacheRecord(value, context, new Map()),
        });
    } catch {
        throw new CatalogueError('CATALOGUE_CACHE_UNSAFE');
    }
    const published = inspectCatalogueCache(context);
    if (published.state !== STATE.GRANTED) {
        throw new CatalogueError('CATALOGUE_CACHE_UNSAFE');
    }
    return published;
}

function freshCachedCatalogue(detail, now) {
    const entry = detail.record?.entries[0];
    if (!entry) throw new CatalogueError('CATALOGUE_UNAVAILABLE');
    const verified = detail.verifiedEntries.get(entry.digest);
    const catalogue = validateCataloguePayload({catalogue: verified.catalogue, now});
    return Object.freeze({...verified, catalogue, source: 'CACHE'});
}

async function acquireVerifiedCatalogue({fetchImpl, context = {}, coreRoot, trust, now} = {}) {
    const effective = {
        ...context,
        coreRoot: coreRoot ?? context.coreRoot,
        catalogueTrust: trust ?? context.catalogueTrust ?? context.trust,
        now: now ?? context.now,
    };
    const detail = inspectCatalogueCache(effective);
    if (detail.state === STATE.UNSAFE) throw new CatalogueError('CATALOGUE_CACHE_UNSAFE');
    let bytes;
    try {
        bytes = await requestCatalogueEnvelope({fetchImpl});
    } catch (error) {
        if (!(error instanceof CatalogueError) || error.code !== 'CATALOGUE_UNAVAILABLE') throw error;
        if (detail.state !== STATE.GRANTED) throw error;
        return freshCachedCatalogue(detail, currentTime(effective.now));
    }
    const verified = verifyCatalogueEnvelope({
        bytes,
        coreRoot: effective.coreRoot,
        trust: effective.catalogueTrust,
        now: effective.now,
    });
    const catalogue = validateCataloguePayload({catalogue: verified.catalogue, now: effective.now});
    const normalized = Object.freeze({...verified, catalogue});
    publishCatalogueCache({context: effective, detail, verified: normalized});
    return Object.freeze({...normalized, source: 'NETWORK'});
}

module.exports = {
    acquireVerifiedCatalogue,
    CATALOGUE_URL,
    inspectCatalogueCache,
    publishCatalogueCache,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
