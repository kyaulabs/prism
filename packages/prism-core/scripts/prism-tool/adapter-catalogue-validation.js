// $KYAULabs: adapter-catalogue-validation.js kyau@aura.kyaulabs 2026/09/04 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const semver = require('semver');
const {TextDecoder} = require('node:util');

const MAX_ENVELOPE_BYTES = 1398104;
const MAX_PAYLOAD_BYTES = 1048576;
const MAX_TRUST_BYTES = 16384;
const MAX_ADAPTERS = 64;
const MAX_RELEASES = 256;
const MAX_VALIDITY_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MILLISECONDS = 5 * 60 * 1000;
const SHA256 = /^[0-9a-f]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ADAPTER_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const PACKAGE_NAME = /^@kyaulabs\/[a-z0-9](?:[a-z0-9._-]{0,212}[a-z0-9])?$/;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]+={0,2}$/;
const UTC_TIMESTAMP = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/;

class CatalogueError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

function exactKeys(value, keys) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function decodeBase64(value, maximum) {
    if (typeof value !== 'string' || !BASE64.test(value)) {
        throw new CatalogueError('ENVELOPE_INVALID');
    }
    const bytes = Buffer.from(value, 'base64');
    if (bytes.length > maximum || bytes.toString('base64') !== value) {
        throw new CatalogueError('ENVELOPE_INVALID');
    }
    return bytes;
}

function validateTrust(value) {
    if (!exactKeys(value, ['schemaVersion', 'keys']) || value.schemaVersion !== 1 ||
        !Array.isArray(value.keys) || value.keys.length === 0 || value.keys.length > 8) {
        throw new CatalogueError('TRUST_INVALID');
    }
    const identifiers = new Set();
    for (const key of value.keys) {
        if (!exactKeys(key, ['id', 'algorithm', 'publicKeySpki', 'sha256']) ||
            typeof key.id !== 'string' || key.id.length === 0 || key.id.length > 80 ||
            identifiers.has(key.id) || key.algorithm !== 'Ed25519' || !SHA256.test(key.sha256)) {
            throw new CatalogueError('TRUST_INVALID');
        }
        let publicBytes;
        let publicKey;
        try {
            publicBytes = decodeBase64(key.publicKeySpki, 128);
            publicKey = crypto.createPublicKey({key: publicBytes, type: 'spki', format: 'der'});
        } catch {
            throw new CatalogueError('TRUST_INVALID');
        }
        const fingerprint = crypto.createHash('sha256').update(publicBytes).digest('hex');
        if (fingerprint !== key.sha256 || publicKey.asymmetricKeyType !== 'ed25519') {
            throw new CatalogueError('TRUST_INVALID');
        }
        identifiers.add(key.id);
    }
    return value;
}

function loadCatalogueTrust({coreRoot}) {
    const root = fs.realpathSync(coreRoot);
    const file = path.join(root, 'config', 'adapter-catalogue-trust.json');
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_TRUST_BYTES) {
        throw new CatalogueError('TRUST_INVALID');
    }
    let value;
    try {
        value = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        throw new CatalogueError('TRUST_INVALID');
    }
    return validateTrust(value);
}

function parseUtcTimestamp(value) {
    if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) {
        throw new CatalogueError('PAYLOAD_INVALID');
    }
    const parsed = new Date(value);
    const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== canonical) {
        throw new CatalogueError('PAYLOAD_INVALID');
    }
    return parsed;
}

function boundedString(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
        value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

function validIntegrity(value) {
    if (!boundedString(value, 256) || !INTEGRITY.test(value)) return false;
    const encoded = value.slice('sha512-'.length);
    const digest = Buffer.from(encoded, 'base64');
    return digest.length === 64 && digest.toString('base64') === encoded;
}

function validateRelease(release, versions) {
    if (!exactKeys(release, [
        'version', 'bootstrapProtocol', 'integrity', 'publishedAt', 'status',
    ]) || !boundedString(release.version, 64) || semver.valid(release.version) !== release.version ||
        versions.has(release.version) ||
        !Number.isSafeInteger(release.bootstrapProtocol) || release.bootstrapProtocol <= 0 ||
        !validIntegrity(release.integrity) || !['ACTIVE', 'REVOKED'].includes(release.status)) {
        throw new CatalogueError('PAYLOAD_INVALID');
    }
    parseUtcTimestamp(release.publishedAt);
    versions.add(release.version);
    return Object.freeze({...release});
}

function validateAdapter(adapter, identifiers, packageNames) {
    if (!exactKeys(adapter, ['id', 'displayName', 'packageName', 'releases']) ||
        typeof adapter.id !== 'string' || !ADAPTER_ID.test(adapter.id) || identifiers.has(adapter.id) ||
        !boundedString(adapter.displayName, 120) || typeof adapter.packageName !== 'string' ||
        !PACKAGE_NAME.test(adapter.packageName) || packageNames.has(adapter.packageName) ||
        !Array.isArray(adapter.releases) || adapter.releases.length === 0 ||
        adapter.releases.length > MAX_RELEASES) {
        throw new CatalogueError('PAYLOAD_INVALID');
    }
    const versions = new Set();
    const releases = adapter.releases.map((release) => validateRelease(release, versions));
    identifiers.add(adapter.id);
    packageNames.add(adapter.packageName);
    return Object.freeze({
        id: adapter.id,
        displayName: adapter.displayName,
        packageName: adapter.packageName,
        releases: Object.freeze(releases),
    });
}

function validateCataloguePayload({catalogue, verified, now}) {
    const value = catalogue ?? verified?.catalogue;
    if (!exactKeys(value, [
        'schemaVersion', 'catalogueId', 'sequence', 'issuedAt', 'expiresAt', 'adapters',
    ]) || value.schemaVersion !== 2 || value.catalogueId !== 'kyaulabs/prism-adapters' ||
        !Number.isSafeInteger(value.sequence) || value.sequence <= 0 ||
        !Array.isArray(value.adapters) || value.adapters.length === 0 ||
        value.adapters.length > MAX_ADAPTERS) {
        throw new CatalogueError('PAYLOAD_INVALID');
    }
    const issuedAt = parseUtcTimestamp(value.issuedAt);
    const expiresAt = parseUtcTimestamp(value.expiresAt);
    const current = new Date(now ?? Date.now());
    if (!Number.isFinite(current.getTime())) {
        throw new CatalogueError('PAYLOAD_INVALID');
    }
    if (issuedAt.getTime() > current.getTime() + MAX_FUTURE_SKEW_MILLISECONDS) {
        throw new CatalogueError('CATALOGUE_NOT_YET_VALID');
    }
    if (expiresAt.getTime() <= issuedAt.getTime() ||
        expiresAt.getTime() - issuedAt.getTime() > MAX_VALIDITY_MILLISECONDS) {
        throw new CatalogueError('PAYLOAD_INVALID');
    }
    if (expiresAt.getTime() <= current.getTime()) {
        throw new CatalogueError('CATALOGUE_EXPIRED');
    }
    const identifiers = new Set();
    const packageNames = new Set();
    const adapters = value.adapters.map((adapter) =>
        validateAdapter(adapter, identifiers, packageNames));
    return Object.freeze({
        schemaVersion: 2,
        catalogueId: value.catalogueId,
        sequence: value.sequence,
        issuedAt: value.issuedAt,
        expiresAt: value.expiresAt,
        adapters: Object.freeze(adapters),
    });
}

function selectableRelease(release, bootstrapProtocol) {
    return release.status === 'ACTIVE' &&
        semver.valid(release.version) === release.version &&
        semver.prerelease(release.version) === null &&
        release.bootstrapProtocol === bootstrapProtocol;
}

function selectCompatibleAdapters({catalogue, bootstrapProtocol}) {
    if (!Number.isSafeInteger(bootstrapProtocol) || bootstrapProtocol <= 0) {
        throw new CatalogueError('BOOTSTRAP_PROTOCOL_INVALID');
    }
    return catalogue.adapters.flatMap((adapter) => {
        const releases = adapter.releases
            .filter((release) => selectableRelease(release, bootstrapProtocol))
            .sort((left, right) => semver.rcompare(left.version, right.version));
        if (releases.length === 0) return [];
        const selected = releases[0];
        return [Object.freeze({
            id: adapter.id,
            displayName: adapter.displayName,
            packageName: adapter.packageName,
            packageVersion: selected.version,
            bootstrapProtocol: selected.bootstrapProtocol,
            integrity: selected.integrity,
        })];
    }).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

function verifyCatalogueEnvelope({bytes, coreRoot, trust, now}) {
    if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_ENVELOPE_BYTES) {
        throw new CatalogueError('ENVELOPE_INVALID');
    }
    let envelope;
    try {
        envelope = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    } catch {
        throw new CatalogueError('ENVELOPE_INVALID');
    }
    if (!exactKeys(envelope, ['schemaVersion', 'keyId', 'algorithm', 'payload', 'signature']) ||
        envelope.schemaVersion !== 1 || envelope.algorithm !== 'Ed25519') {
        throw new CatalogueError('ENVELOPE_INVALID');
    }
    const trusted = trust === undefined ? loadCatalogueTrust({coreRoot}) : validateTrust(trust);
    const key = trusted.keys.find((candidate) => candidate.id === envelope.keyId);
    if (!key || key.algorithm !== 'Ed25519') {
        throw new CatalogueError('SIGNING_KEY_UNKNOWN');
    }
    const publicBytes = decodeBase64(key.publicKeySpki, 128);
    const payloadBytes = decodeBase64(envelope.payload, MAX_PAYLOAD_BYTES);
    const signature = decodeBase64(envelope.signature, 128);
    let publicKey;
    try {
        publicKey = crypto.createPublicKey({key: publicBytes, type: 'spki', format: 'der'});
    } catch {
        throw new CatalogueError('TRUST_INVALID');
    }
    if (!crypto.verify(null, payloadBytes, publicKey, signature)) {
        throw new CatalogueError('SIGNATURE_INVALID');
    }
    let catalogue;
    try {
        catalogue = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(payloadBytes));
    } catch {
        throw new CatalogueError('PAYLOAD_INVALID');
    }
    return Object.freeze({
        envelopeBytes: Buffer.from(bytes),
        envelopeDigest: crypto.createHash('sha256').update(bytes).digest('hex'),
        payloadBytes,
        payloadDigest: crypto.createHash('sha256').update(payloadBytes).digest('hex'),
        keyId: envelope.keyId,
        catalogue,
        verifiedAt: new Date(now ?? Date.now()).toISOString(),
    });
}

module.exports = {
    CatalogueError,
    loadCatalogueTrust,
    selectCompatibleAdapters,
    validIntegrity,
    validateCataloguePayload,
    verifyCatalogueEnvelope,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
