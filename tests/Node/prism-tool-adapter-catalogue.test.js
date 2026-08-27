// $KYAULabs: prism-tool-adapter-catalogue.test.js kyau@aura.kyaulabs 2026/08/27 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {createHash, generateKeyPairSync, sign} = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const {
    CatalogueError,
    loadCatalogueTrust,
    selectCompatibleAdapters,
    validateCataloguePayload,
    verifyCatalogueEnvelope,
} = require('../../packages/prism-core/scripts/prism-tool/adapter-catalogue-validation');

function signedEnvelope(payload, options = {}) {
    const pair = options.pair ?? generateKeyPairSync('ed25519');
    const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
    const signature = sign(null, payloadBytes, pair.privateKey);
    const publicKeySpki = pair.publicKey.export({type: 'spki', format: 'der'}).toString('base64');
    return {
        bytes: Buffer.from(JSON.stringify({
            schemaVersion: 1,
            keyId: options.keyId ?? 'test-key',
            algorithm: 'Ed25519',
            payload: payloadBytes.toString('base64'),
            signature: signature.toString('base64'),
        }), 'utf8'),
        trust: {
            schemaVersion: 1,
            keys: [{
                id: options.keyId ?? 'test-key',
                algorithm: 'Ed25519',
                publicKeySpki,
                sha256: createHash('sha256').update(Buffer.from(publicKeySpki, 'base64')).digest('hex'),
            }],
        },
    };
}

function validCatalogue() {
    return {
        schemaVersion: 1,
        catalogueId: 'kyaulabs/prism-adapters',
        sequence: 7,
        issuedAt: '2026-08-27T00:00:00Z',
        expiresAt: '2026-09-03T00:00:00Z',
        adapters: [{
            id: 'php-web',
            displayName: 'PHP/web',
            packageName: '@kyaulabs/prism-php-web',
            releases: [
                {version: '2.0.0', coreRange: '>=2.0.0 <3.0.0', bootstrapProtocol: 1, integrity: 'sha512-AAAA', publishedAt: '2026-08-27T00:00:00Z', status: 'ACTIVE'},
                {version: '1.8.2', coreRange: '^1.3.0', bootstrapProtocol: 1, integrity: 'sha512-BBBB', publishedAt: '2026-08-26T00:00:00Z', status: 'ACTIVE'},
                {version: '1.9.0-beta.1', coreRange: '^1.3.0', bootstrapProtocol: 1, integrity: 'sha512-CCCC', publishedAt: '2026-08-27T00:00:00Z', status: 'ACTIVE'},
                {version: '1.8.3', coreRange: '^1.3.0', bootstrapProtocol: 1, integrity: 'sha512-DDDD', publishedAt: '2026-08-27T00:00:00Z', status: 'REVOKED'},
            ],
        }],
    };
}

test('selects the highest stable active Core-compatible release', () => {
    const catalogue = validateCataloguePayload({
        catalogue: validCatalogue(),
        now: new Date('2026-08-27T12:00:00Z'),
    });

    assert.deepEqual(selectCompatibleAdapters({
        catalogue,
        coreVersion: '1.4.0',
        bootstrapProtocol: 1,
    }), [{
        id: 'php-web',
        displayName: 'PHP/web',
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: '1.8.2',
        bootstrapProtocol: 1,
        integrity: 'sha512-BBBB',
    }]);
});

test('rejects expired, overlong, duplicate, and malformed catalogue payloads', () => {
    const catalogue = validCatalogue();
    const duplicateRelease = structuredClone(catalogue);
    duplicateRelease.adapters[0].releases.push(structuredClone(duplicateRelease.adapters[0].releases[0]));
    const invalidCases = [
        {...catalogue, expiresAt: '2026-08-26T00:00:00Z'},
        {...catalogue, expiresAt: '2026-09-03T00:00:01Z'},
        {...catalogue, issuedAt: '2026-08-27T12:05:01Z', expiresAt: '2026-09-03T12:05:01Z'},
        {...catalogue, adapters: [catalogue.adapters[0], catalogue.adapters[0]]},
        {...catalogue, sequence: -1},
        {...catalogue, unexpected: true},
        duplicateRelease,
        {...catalogue, adapters: [{...catalogue.adapters[0], packageName: '@example/prism-php-web'}]},
        {...catalogue, adapters: [{...catalogue.adapters[0], releases: [{
            ...catalogue.adapters[0].releases[0],
            coreRange: 'not-semver',
        }]}]},
    ];

    for (const value of invalidCases) {
        assert.throws(
            () => validateCataloguePayload({
                catalogue: value,
                now: new Date('2026-08-27T12:00:00Z'),
            }),
            CatalogueError
        );
    }
});

test('verifies an Ed25519 envelope before parsing its payload', () => {
    const fixture = signedEnvelope({schemaVersion: 1, catalogueId: 'test'});
    const result = verifyCatalogueEnvelope({
        bytes: fixture.bytes,
        trust: fixture.trust,
        now: new Date('2026-08-27T12:00:00Z'),
    });

    assert.equal(result.keyId, 'test-key');
    assert.equal(result.catalogue.catalogueId, 'test');
    assert.match(result.envelopeDigest, /^[0-9a-f]{64}$/);
    assert.match(result.payloadDigest, /^[0-9a-f]{64}$/);
});

test('loads the production Ed25519 trust root with its verified fingerprint', () => {
    const trust = loadCatalogueTrust({
        coreRoot: path.resolve(__dirname, '../../packages/prism-core'),
    });

    assert.deepEqual(trust, {
        schemaVersion: 1,
        keys: [{
            id: 'kyaulabs-prism-adapters-2026-01',
            algorithm: 'Ed25519',
            publicKeySpki: 'MCowBQYDK2VwAyEA+DVF3+MsLiezlKiBQeWFO1N7Q23ZhdevEfZoWJrtww4=',
            sha256: '74679d283825c4e6048efdfd1c96cdcd688ce5e12915fcc13a8547c3443c1e34',
        }],
    });
});

test('rejects a non-Ed25519 public key even when its fingerprint matches', () => {
    const fixture = signedEnvelope({schemaVersion: 1, catalogueId: 'test'});
    const rsa = generateKeyPairSync('rsa', {modulusLength: 2048});
    const publicBytes = rsa.publicKey.export({type: 'spki', format: 'der'});
    const trust = {
        schemaVersion: 1,
        keys: [{
            id: 'test-key',
            algorithm: 'Ed25519',
            publicKeySpki: publicBytes.toString('base64'),
            sha256: createHash('sha256').update(publicBytes).digest('hex'),
        }],
    };

    assert.throws(
        () => verifyCatalogueEnvelope({bytes: fixture.bytes, trust}),
        (error) => error instanceof CatalogueError && error.code === 'TRUST_INVALID'
    );
});

test('rejects malformed encodings, invalid UTF-8 payloads, bad fingerprints, and oversized envelopes', () => {
    const fixture = signedEnvelope({schemaVersion: 1, catalogueId: 'test'});
    const envelope = JSON.parse(fixture.bytes.toString('utf8'));
    const badFingerprint = structuredClone(fixture.trust);
    badFingerprint.keys[0].sha256 = '0'.repeat(64);
    const pair = generateKeyPairSync('ed25519');
    const invalidUtf8 = Buffer.from([0xff]);
    const invalidUtf8Public = pair.publicKey.export({type: 'spki', format: 'der'});
    const invalidUtf8Trust = {
        schemaVersion: 1,
        keys: [{
            id: 'invalid-utf8',
            algorithm: 'Ed25519',
            publicKeySpki: invalidUtf8Public.toString('base64'),
            sha256: createHash('sha256').update(invalidUtf8Public).digest('hex'),
        }],
    };
    const invalidUtf8Envelope = Buffer.from(JSON.stringify({
        schemaVersion: 1,
        keyId: 'invalid-utf8',
        algorithm: 'Ed25519',
        payload: invalidUtf8.toString('base64'),
        signature: sign(null, invalidUtf8, pair.privateKey).toString('base64'),
    }));
    const cases = [
        () => verifyCatalogueEnvelope({
            bytes: Buffer.from(JSON.stringify({...envelope, payload: '%%%'})),
            trust: fixture.trust,
        }),
        () => verifyCatalogueEnvelope({bytes: fixture.bytes, trust: badFingerprint}),
        () => verifyCatalogueEnvelope({bytes: invalidUtf8Envelope, trust: invalidUtf8Trust}),
        () => verifyCatalogueEnvelope({bytes: Buffer.alloc(1398105), trust: fixture.trust}),
    ];

    for (const action of cases) assert.throws(action, CatalogueError);
});

test('rejects unknown keys, changed payloads, and unsupported algorithms', () => {
    const fixture = signedEnvelope({schemaVersion: 1, catalogueId: 'test'});
    const envelope = JSON.parse(fixture.bytes.toString('utf8'));
    const cases = [
        {...envelope, keyId: 'unknown'},
        {...envelope, payload: Buffer.from('{}').toString('base64')},
        {...envelope, algorithm: 'RSA-PSS'},
    ];

    for (const value of cases) {
        assert.throws(
            () => verifyCatalogueEnvelope({
                bytes: Buffer.from(JSON.stringify(value)),
                trust: fixture.trust,
                now: new Date('2026-08-27T12:00:00Z'),
            }),
            CatalogueError
        );
    }
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
