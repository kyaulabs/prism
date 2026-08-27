// $KYAULabs: prism-tool-adapter-catalogue.test.js kyau@aura.kyaulabs 2026/08/27 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {createHash, generateKeyPairSync, sign} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    CatalogueError,
    loadCatalogueTrust,
    selectCompatibleAdapters,
    validateCataloguePayload,
    verifyCatalogueEnvelope,
} = require('../../packages/prism-core/scripts/prism-tool/adapter-catalogue-validation');
const {
    acquireVerifiedCatalogue,
    CATALOGUE_URL,
    inspectCatalogueCache,
} = require('../../packages/prism-core/scripts/prism-tool/adapter-catalogue-cache');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {loadSelectedAdapter} = require(
    '../../packages/prism-core/scripts/prism-tool/supported-adapters'
);
const {makeTempDir, writeJson} = require('./helpers');

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

async function captureAsyncWrites(action) {
    let stdout = '';
    let stderr = '';
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    process.stdout.write = (chunk) => { stdout += chunk; return true; };
    process.stderr.write = (chunk) => { stderr += chunk; return true; };
    try {
        return {status: await action(), stdout, stderr};
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    }
}

function response(bytes, status = 200) {
    return new Response(bytes, {
        status,
        headers: {'content-type': 'application/json'},
    });
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

test('reports signed compatible choices and immutable catalogue evidence', async (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    const cacheRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(cacheRoot, {recursive: true, force: true}));
    writeJson(path.join(coreRoot, 'package.json'), {
        name: '@kyaulabs/prism-core',
        version: '1.4.0',
    });
    const fixture = signedEnvelope(validCatalogue());
    const result = await captureAsyncWrites(() => main([
        'setup', 'adapter', 'catalogue', '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot,
        fetch: async () => response(fixture.bytes),
        catalogueCachePath: path.join(cacheRoot, 'cache.json'),
        catalogueTrust: fixture.trust,
        now: new Date('2026-08-27T12:00:00Z'),
    }));
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(report.disposition, 'ADAPTER_SELECTION_REQUIRED');
    assert.equal(report.data.catalogueEvidence.source, 'NETWORK');
    assert.match(report.data.catalogueEvidence.digest, /^[0-9a-f]{64}$/);
    assert.equal(report.data.adapters[0].packageVersion, '1.8.2');
    assert.equal(report.data.adapters[0].integrity, 'sha512-BBBB');
});

test('accepts no caller package, version, integrity, or URL authority', async (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeJson(path.join(coreRoot, 'package.json'), {
        name: '@kyaulabs/prism-core',
        version: '1.4.0',
    });

    for (const control of [
        '--package=x', '--version=1.0.0', '--integrity=x', '--url=https://example.com',
    ]) {
        const result = await captureAsyncWrites(() => main([
            'setup', 'adapter', 'catalogue', '--network-approved=yes', control, '--json',
        ], {projectRoot, coreRoot}));
        assert.equal(result.status, 2);
        assert.equal(result.stdout, '');
    }
});

test('reloads an exact still-valid digest-bound adapter selection', async (t) => {
    const coreRoot = makeTempDir();
    const cacheRoot = makeTempDir();
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(cacheRoot, {recursive: true, force: true}));
    writeJson(path.join(coreRoot, 'package.json'), {
        name: '@kyaulabs/prism-core',
        version: '1.4.0',
    });
    const fixture = signedEnvelope(validCatalogue());
    const context = {
        catalogueCachePath: path.join(cacheRoot, 'cache.json'),
        catalogueTrust: fixture.trust,
        now: new Date('2026-08-27T12:00:00Z'),
    };
    const verified = await acquireVerifiedCatalogue({
        fetchImpl: async () => response(fixture.bytes),
        context,
        coreRoot,
        trust: fixture.trust,
        now: context.now,
    });

    assert.deepEqual(loadSelectedAdapter({
        digest: verified.envelopeDigest,
        adapterId: 'php-web',
        coreRoot,
        context,
    }), {
        id: 'php-web',
        displayName: 'PHP/web',
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: '1.8.2',
        bootstrapProtocol: 1,
        integrity: 'sha512-BBBB',
    });
    assert.throws(() => loadSelectedAdapter({
        digest: '0'.repeat(64),
        adapterId: 'php-web',
        coreRoot,
        context,
    }), CatalogueError);
    assert.throws(() => loadSelectedAdapter({
        digest: verified.envelopeDigest,
        adapterId: 'php-web',
        coreRoot,
        context: {...context, now: new Date('2026-09-04T00:00:00Z')},
    }), CatalogueError);
});

test('fetches only the fixed catalogue URL and publishes verified evidence', async (t) => {
    const root = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const fixture = signedEnvelope(validCatalogue());
    const calls = [];
    const result = await acquireVerifiedCatalogue({
        fetchImpl: async (url, options) => {
            calls.push({url, options});
            return response(fixture.bytes);
        },
        context: {catalogueCachePath: path.join(root, 'cache.json')},
        trust: fixture.trust,
        now: new Date('2026-08-27T12:00:00Z'),
    });

    assert.equal(calls[0].url, CATALOGUE_URL);
    assert.equal(calls[0].options.redirect, 'manual');
    assert.equal(calls[0].options.credentials, 'omit');
    assert.equal(result.source, 'NETWORK');
    assert.equal(fs.statSync(path.join(root, 'cache.json')).mode & 0o777, 0o600);
});

test('uses an unexpired cache only for transport unavailability', async (t) => {
    const root = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const fixture = signedEnvelope(validCatalogue());
    const context = {catalogueCachePath: path.join(root, 'cache.json')};

    await acquireVerifiedCatalogue({
        fetchImpl: async () => response(fixture.bytes),
        context,
        trust: fixture.trust,
        now: new Date('2026-08-27T12:00:00Z'),
    });
    const cached = await acquireVerifiedCatalogue({
        fetchImpl: async () => { throw new Error('offline'); },
        context,
        trust: fixture.trust,
        now: new Date('2026-08-27T12:00:00Z'),
    });
    assert.equal(cached.source, 'CACHE');
    const unavailable = await acquireVerifiedCatalogue({
        fetchImpl: async () => response(Buffer.from('unavailable'), 503),
        context,
        trust: fixture.trust,
        now: new Date('2026-08-27T12:00:00Z'),
    });
    assert.equal(unavailable.source, 'CACHE');

    await assert.rejects(
        acquireVerifiedCatalogue({
            fetchImpl: async () => response(Buffer.from('{}')),
            context,
            trust: fixture.trust,
            now: new Date('2026-08-27T12:00:00Z'),
        }),
        CatalogueError
    );
});

test('never rolls cache fallback back after the highest sequence expires', async (t) => {
    const root = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const pair = generateKeyPairSync('ed25519');
    const context = {catalogueCachePath: path.join(root, 'cache.json')};
    const older = signedEnvelope({...validCatalogue(), sequence: 1}, {pair});
    const newer = signedEnvelope({
        ...validCatalogue(),
        sequence: 2,
        expiresAt: '2026-08-28T00:00:00Z',
    }, {pair});

    await acquireVerifiedCatalogue({
        fetchImpl: async () => response(older.bytes),
        context,
        trust: older.trust,
        now: new Date('2026-08-27T12:00:00Z'),
    });
    await acquireVerifiedCatalogue({
        fetchImpl: async () => response(newer.bytes),
        context,
        trust: older.trust,
        now: new Date('2026-08-27T12:00:00Z'),
    });

    await assert.rejects(
        acquireVerifiedCatalogue({
            fetchImpl: async () => { throw new Error('offline'); },
            context,
            trust: older.trust,
            now: new Date('2026-08-29T00:00:00Z'),
        }),
        CatalogueError
    );
});

test('rejects network rollback and equal-sequence equivocation', async (t) => {
    const root = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const pair = generateKeyPairSync('ed25519');
    const context = {catalogueCachePath: path.join(root, 'cache.json')};
    const accepted = signedEnvelope({...validCatalogue(), sequence: 7}, {pair});

    await acquireVerifiedCatalogue({
        fetchImpl: async () => response(accepted.bytes),
        context,
        trust: accepted.trust,
        now: new Date('2026-08-27T12:00:00Z'),
    });
    const rejected = [
        signedEnvelope({...validCatalogue(), sequence: 6}, {pair}),
        signedEnvelope({
            ...validCatalogue(),
            adapters: [{...validCatalogue().adapters[0], displayName: 'Changed'}],
        }, {pair}),
    ];

    for (const fixture of rejected) {
        await assert.rejects(
            acquireVerifiedCatalogue({
                fetchImpl: async () => response(fixture.bytes),
                context,
                trust: accepted.trust,
                now: new Date('2026-08-27T12:00:00Z'),
            }),
            CatalogueError
        );
    }
    assert.equal(inspectCatalogueCache({
        ...context,
        catalogueTrust: accepted.trust,
    }).record.entries[0].digest, createHash('sha256').update(accepted.bytes).digest('hex'));
});

test('retains the four highest verified catalogue sequences', async (t) => {
    const root = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const pair = generateKeyPairSync('ed25519');
    const context = {catalogueCachePath: path.join(root, 'cache.json')};
    let trust;

    for (let sequence = 1; sequence <= 5; sequence += 1) {
        const fixture = signedEnvelope({...validCatalogue(), sequence}, {pair});
        trust = fixture.trust;
        await acquireVerifiedCatalogue({
            fetchImpl: async () => response(fixture.bytes),
            context,
            trust,
            now: new Date('2026-08-27T12:00:00Z'),
        });
    }

    const detail = inspectCatalogueCache({...context, catalogueTrust: trust});
    assert.deepEqual(detail.record.entries.map((entry) => entry.sequence), [5, 4, 3, 2]);
});

test('preserves an unsafe cache without consulting the network', async (t) => {
    const root = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const cachePath = path.join(root, 'cache.json');
    const fixture = signedEnvelope(validCatalogue());
    const context = {catalogueCachePath: cachePath};
    await acquireVerifiedCatalogue({
        fetchImpl: async () => response(fixture.bytes),
        context,
        trust: fixture.trust,
        now: new Date('2026-08-27T12:00:00Z'),
    });
    const retained = fs.readFileSync(cachePath);
    fs.chmodSync(cachePath, 0o644);
    let fetched = false;

    await assert.rejects(
        acquireVerifiedCatalogue({
            fetchImpl: async () => { fetched = true; return response(fixture.bytes); },
            context,
            trust: fixture.trust,
            now: new Date('2026-08-27T12:00:00Z'),
        }),
        CatalogueError
    );
    assert.equal(fetched, false);
    assert.deepEqual(fs.readFileSync(cachePath), retained);
});

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
