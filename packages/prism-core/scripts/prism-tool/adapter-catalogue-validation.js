// $KYAULabs: adapter-catalogue-validation.js kyau@aura.kyaulabs 2026/08/27 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {TextDecoder} = require('node:util');

const MAX_ENVELOPE_BYTES = 1398104;
const MAX_PAYLOAD_BYTES = 1048576;
const MAX_TRUST_BYTES = 16384;
const SHA256 = /^[0-9a-f]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

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

module.exports = {CatalogueError, loadCatalogueTrust, verifyCatalogueEnvelope};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
