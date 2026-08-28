# Signed Compatible Adapter Discovery Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Replace the Core-version lockstep bootstrap adapter catalogue with a
signed, cached catalogue that selects and pins the highest compatible exact npm
release while preserving strict-empty setup, rollback, and recovery boundaries.

**Architecture:** Core verifies one Ed25519-signed catalogue envelope from a
fixed raw GitHub path, stores recent verified envelopes in a bounded managed
global cache, and exposes digest-bound adapter choices through `prism-tool`.
The selected exact release enters receipt schema 2 and propagates as nullable
`adapterEvidence` through planning, journaling, recovery, and root-seed
attestation without becoming an adapter-provider input.

**Tech Stack:** Node.js 22+, CommonJS, `node:test`, built-in `node:crypto`, exact
`semver` 7.8.5, Pi package management, managed-record atomic persistence.

**Originating issue:** #443

## Global constraints

- Catalogue origin is exactly `https://raw.githubusercontent.com/kyaulabs/prism-adapters/main/catalogue.json`.
- Production key ID is exactly `kyaulabs-prism-adapters-2026-01`.
- Production Ed25519 SPKI base64 is exactly `MCowBQYDK2VwAyEA+DVF3+MsLiezlKiBQeWFO1N7Q23ZhdevEfZoWJrtww4=`.
- Production public-key SHA-256 is exactly `74679d283825c4e6048efdfd1c96cdcd688ce5e12915fcc13a8547c3443c1e34`.
- The private signing key never enters this repository, tool output, fixtures, logs, or CI.
- Signed catalogue validity is at most seven days; future clock skew is at most five minutes.
- The cache retains at most four verified digest-addressable envelopes.
- Only stable `ACTIVE` releases matching Core SemVer and bootstrap protocol are selectable.
- Strict-empty setup always acquires an exact npm release; checkout-local adapter acquisition is removed.
- Both lowercase and uppercase npm exact-save and ignore-scripts controls are mandatory.
- ADR-0079 remains authoritative for packages managed in this repository.
- Registry access for the exact `semver` dependency lockfile refresh requires explicit authorization when Task 2 executes.
- Every new or modified JavaScript source retains the hook-managed RCS header and final JavaScript vim modeline.

---

### Task 1: Verify Signed Catalogue Envelopes

**Files:**

- Create: `packages/prism-core/config/adapter-catalogue-trust.json`
- Create: `packages/prism-core/scripts/prism-tool/adapter-catalogue-validation.js`
- Create: `tests/Node/prism-tool-adapter-catalogue.test.js`

**Interfaces:**

- Consumes: raw envelope `Buffer`, Core root, injected current time.
- Produces: `CatalogueError`, `loadCatalogueTrust({coreRoot})`, and `verifyCatalogueEnvelope({bytes, coreRoot, now})` returning `{envelopeBytes, envelopeDigest, payloadBytes, payloadDigest, keyId, catalogue}`.

- [x] **Step 1: Write the failing envelope and trust-root tests**

```javascript
const assert = require('node:assert/strict');
const {generateKeyPairSync, sign} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {
    CatalogueError,
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
            }],
        },
    };
}

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
```

- [x] **Step 2: Run the focused test and verify Red**

Run: `node --test tests/Node/prism-tool-adapter-catalogue.test.js`

Expected: FAIL because `adapter-catalogue-validation.js` does not exist.

- [x] **Step 3: Implement strict envelope verification and the production trust root**

```json
{
  "schemaVersion": 1,
  "keys": [
    {
      "id": "kyaulabs-prism-adapters-2026-01",
      "algorithm": "Ed25519",
      "publicKeySpki": "MCowBQYDK2VwAyEA+DVF3+MsLiezlKiBQeWFO1N7Q23ZhdevEfZoWJrtww4=",
      "sha256": "74679d283825c4e6048efdfd1c96cdcd688ce5e12915fcc13a8547c3443c1e34"
    }
  ]
}
```

Implement `adapter-catalogue-validation.js` with these exact rules:

```javascript
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {TextDecoder} = require('node:util');

const MAX_ENVELOPE_BYTES = 1398104;
const MAX_PAYLOAD_BYTES = 1048576;
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
    if (typeof value !== 'string' || !BASE64.test(value)) throw new CatalogueError('ENVELOPE_INVALID');
    const bytes = Buffer.from(value, 'base64');
    if (bytes.length > maximum || bytes.toString('base64') !== value) {
        throw new CatalogueError('ENVELOPE_INVALID');
    }
    return bytes;
}

function loadCatalogueTrust({coreRoot}) {
    const file = path.join(fs.realpathSync(coreRoot), 'config', 'adapter-catalogue-trust.json');
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!exactKeys(value, ['schemaVersion', 'keys']) || value.schemaVersion !== 1 ||
        !Array.isArray(value.keys) || value.keys.length === 0) {
        throw new CatalogueError('TRUST_INVALID');
    }
    return value;
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
    const trusted = trust ?? loadCatalogueTrust({coreRoot});
    const key = trusted.keys.find((candidate) => candidate.id === envelope.keyId);
    if (!key || key.algorithm !== 'Ed25519') throw new CatalogueError('SIGNING_KEY_UNKNOWN');
    const publicBytes = decodeBase64(key.publicKeySpki, 128);
    const fingerprint = crypto.createHash('sha256').update(publicBytes).digest('hex');
    if ((key.sha256 !== undefined && key.sha256 !== fingerprint) ||
        (key.sha256 !== undefined && !SHA256.test(key.sha256))) {
        throw new CatalogueError('TRUST_INVALID');
    }
    const payloadBytes = decodeBase64(envelope.payload, MAX_PAYLOAD_BYTES);
    const signature = decodeBase64(envelope.signature, 128);
    const publicKey = crypto.createPublicKey({key: publicBytes, type: 'spki', format: 'der'});
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
```

Add exact-key, canonical-base64, strict-UTF-8, trust fingerprint, size-bound,
and malformed-signature cases to the same test file before Green.

- [x] **Step 4: Run the focused test and verify Green**

Run: `node --test tests/Node/prism-tool-adapter-catalogue.test.js`

Expected: PASS for every envelope and trust-root case.

- [x] **Step 5: Commit the trust boundary**

```bash
git add packages/prism-core/config/adapter-catalogue-trust.json packages/prism-core/scripts/prism-tool/adapter-catalogue-validation.js tests/Node/prism-tool-adapter-catalogue.test.js
prism-tool commit create --type fix --scope setup --subject "verify signed adapter catalogue envelopes" --refs 443
```

---

### Task 2: Validate Catalogue Payloads and Select Compatible Releases

**Files:**

- Modify: `packages/prism-core/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/prism-core/scripts/prism-tool/adapter-catalogue-validation.js`
- Modify: `tests/Node/prism-tool-adapter-catalogue.test.js`

**Interfaces:**

- Consumes: verified payload JSON, running Core version, supported bootstrap protocol.
- Produces: `validateCataloguePayload({verified, now})` and `selectCompatibleAdapters({catalogue, coreVersion, bootstrapProtocol})` returning normalized exact adapter selections.

- [x] **Step 1: Write failing schema, freshness, rollback-input, and SemVer selection tests**

```javascript
const {
    selectCompatibleAdapters,
    validateCataloguePayload,
} = require('../../packages/prism-core/scripts/prism-tool/adapter-catalogue-validation');

const catalogue = {
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
            {version: '1.8.3', coreRange: '^1.3.0', bootstrapProtocol: 1, integrity: 'sha512-DDDD', publishedAt: '2026-08-27T00:00:00Z', status: 'REVOKED'}
        ]
    }]
};

test('selects the highest stable active Core-compatible release', () => {
    const normalized = validateCataloguePayload({catalogue, now: new Date('2026-08-27T12:00:00Z')});
    assert.deepEqual(selectCompatibleAdapters({
        catalogue: normalized,
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

test('rejects expired, overlong, duplicate, and malformed catalogues', () => {
    const cases = [
        {...catalogue, expiresAt: '2026-08-26T00:00:00Z'},
        {...catalogue, expiresAt: '2026-09-04T00:00:01Z'},
        {...catalogue, adapters: [catalogue.adapters[0], catalogue.adapters[0]]},
        {...catalogue, sequence: -1},
    ];
    for (const value of cases) {
        assert.throws(
            () => validateCataloguePayload({catalogue: value, now: new Date('2026-08-27T12:00:00Z')}),
            CatalogueError
        );
    }
});
```

- [x] **Step 2: Run the focused test and verify Red**

Run: `node --test tests/Node/prism-tool-adapter-catalogue.test.js`

Expected: FAIL because payload and compatible-release functions are not exported.

- [x] **Step 3: Add exact `semver` and implement normalized selection**

After explicit registry authorization, add `"semver": "7.8.5"` to Core
runtime dependencies and root development dependencies. Regenerate both root
lockfiles with these exact commands:

```bash
npm install --package-lock-only --ignore-scripts
pnpm install --lockfile-only --ignore-scripts
```

Implement selection with these exact predicates:

```javascript
const semver = require('semver');

function selectableRelease(release, coreVersion, bootstrapProtocol) {
    return release.status === 'ACTIVE' &&
        semver.valid(release.version) === release.version &&
        semver.prerelease(release.version) === null &&
        semver.validRange(release.coreRange) !== null &&
        semver.satisfies(coreVersion, release.coreRange) &&
        release.bootstrapProtocol === bootstrapProtocol;
}

function selectCompatibleAdapters({catalogue, coreVersion, bootstrapProtocol}) {
    if (semver.valid(coreVersion) !== coreVersion) throw new CatalogueError('CORE_VERSION_INVALID');
    return catalogue.adapters.flatMap((adapter) => {
        const releases = adapter.releases
            .filter((release) => selectableRelease(release, coreVersion, bootstrapProtocol))
            .sort((left, right) => semver.rcompare(left.version, right.version));
        if (releases.length === 0) return [];
        const selected = releases[0];
        return [{
            id: adapter.id,
            displayName: adapter.displayName,
            packageName: adapter.packageName,
            packageVersion: selected.version,
            bootstrapProtocol: selected.bootstrapProtocol,
            integrity: selected.integrity,
        }];
    }).sort((left, right) => left.id.localeCompare(right.id));
}
```

Use strict exact-key validators for catalogue, adapter, and release records;
unique adapter IDs/package names/release versions; `@kyaulabs/` package names;
positive safe sequence; RFC 3339 UTC timestamps; five-minute issue skew; seven-
day maximum validity; bounded counts; and `ACTIVE|REVOKED` status.

- [x] **Step 4: Run focused tests and dependency audit**

Run: `node --test tests/Node/prism-tool-adapter-catalogue.test.js`

Run: `npm run test:node`

Expected: PASS, with lockfiles containing exact `semver` 7.8.5 and no test regressions.

- [x] **Step 5: Commit selection and dependency state**

```bash
git add packages/prism-core/package.json package.json package-lock.json pnpm-lock.yaml packages/prism-core/scripts/prism-tool/adapter-catalogue-validation.js tests/Node/prism-tool-adapter-catalogue.test.js
prism-tool commit create --type fix --scope setup --subject "select compatible adapter releases" --refs 443
```

---

### Task 3: Fetch and Cache Verified Catalogues

**Files:**

- Create: `packages/prism-core/scripts/prism-tool/adapter-catalogue-http.js`
- Create: `packages/prism-core/scripts/prism-tool/adapter-catalogue-cache.js`
- Modify: `tests/Node/prism-tool-adapter-catalogue.test.js`
- Test: `tests/Node/prism-tool-consent.test.js`

**Interfaces:**

- Consumes: fixed fetch implementation, managed-record context, Core root, clock.
- Produces: `requestCatalogueEnvelope({fetchImpl})`, `inspectCatalogueCache(context)`, `publishCatalogueCache({context, detail, verified})`, `acquireVerifiedCatalogue({fetchImpl, context, coreRoot, now})`.

- [x] **Step 1: Write failing fixed-origin, fallback, rollback, and cache-safety tests**

```javascript
const {
    acquireVerifiedCatalogue,
    CATALOGUE_URL,
} = require('../../packages/prism-core/scripts/prism-tool/adapter-catalogue-cache');

function response(bytes, status = 200) {
    return new Response(bytes, {
        status,
        headers: {'content-type': 'application/json'},
    });
}

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
    const fixture = signedEnvelope(catalogue);
    const context = {catalogueCachePath: path.join(root, 'cache.json')};

    await acquireVerifiedCatalogue({
        fetchImpl: async () => response(fixture.bytes),
        context,
        trust: fixture.trust,
        now: new Date('2026-08-27T12:00:00Z'),
    });
    const result = await acquireVerifiedCatalogue({
        fetchImpl: async () => { throw new Error('offline'); },
        context,
        trust: fixture.trust,
        now: new Date('2026-08-27T12:00:00Z'),
    });
    assert.equal(result.source, 'CACHE');

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
```

- [x] **Step 2: Run the focused test and verify Red**

Run: `node --test tests/Node/prism-tool-adapter-catalogue.test.js`

Expected: FAIL because HTTP and cache modules do not exist.

- [x] **Step 3: Implement bounded transport and four-entry managed cache**

Use this public constant and request contract:

```javascript
const CATALOGUE_URL = 'https://raw.githubusercontent.com/kyaulabs/prism-adapters/main/catalogue.json';

const response = await fetchImpl(CATALOGUE_URL, {
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
```

Add the injected `catalogueCachePath`, `catalogueTrust`, and `now` context
properties used by the test helper above. The managed cache record is exactly:

```text
{
  schemaVersion: 1,
  entries: [
    {
      digest: <64 lowercase hex>,
      sequence: <positive safe integer>,
      envelope: <canonical base64 exact response bytes>,
      cachedAt: <UTC RFC 3339>
    }
  ]
}
```

Resolve the default path as `PI_CODING_AGENT_DIR/prism-adapter-catalogue-cache.json`,
use `inspectManagedRecord`/`publishManagedRecord` with a 6 MiB limit, reverify
every entry on read, keep at most four entries sorted by sequence descending,
reject lower sequence and equal-sequence/different-digest responses, and use
cache fallback only for timeout/network/HTTP 500–599 unavailability.

- [x] **Step 4: Run focused and managed-record tests**

Run: `node --test tests/Node/prism-tool-adapter-catalogue.test.js tests/Node/prism-tool-consent.test.js`

Expected: PASS for fixed-origin, fallback, atomic mode, unsafe state, eviction,
expiry, rollback, and equivocation.

- [x] **Step 5: Commit the retrieval boundary**

```bash
git add packages/prism-core/scripts/prism-tool/adapter-catalogue-http.js packages/prism-core/scripts/prism-tool/adapter-catalogue-cache.js tests/Node/prism-tool-adapter-catalogue.test.js tests/Node/prism-tool-consent.test.js
prism-tool commit create --type fix --scope setup --subject "cache verified adapter catalogues" --refs 443
```

---

### Task 4: Expose Digest-Bound Adapter Choices

**Files:**

- Modify: `packages/prism-core/scripts/prism-tool/supported-adapters.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-bootstrap-adapter.test.js`
- Modify: `tests/Node/prism-tool-adapter-catalogue.test.js`

**Interfaces:**

- Consumes: verified catalogue acquisition, Core manifest version, protocol 1.
- Produces: asynchronous `inspectSupportedAdapters(...)` report containing `catalogueEvidence`, Core-only, and normalized selected releases; `loadSelectedAdapter({digest, adapterId, ...})` for later installation.

- [x] **Step 1: Write failing CLI catalogue and digest-binding tests**

```javascript
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

function signedCatalogueContext(t, {projectRoot = makeTempDir(), coreVersion = '1.4.0'} = {}) {
    const coreRoot = makeTempDir();
    const cacheRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(cacheRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot, coreVersion);
    const fixture = signedEnvelope(catalogue);
    return {
        projectRoot,
        coreRoot,
        fetch: async () => response(fixture.bytes),
        catalogueCachePath: path.join(cacheRoot, 'cache.json'),
        catalogueTrust: fixture.trust,
        now: new Date('2026-08-27T12:00:00Z'),
    };
}

test('reports signed compatible choices and immutable catalogue evidence', async (t) => {
    const projectRoot = makeTempDir();
    const result = await captureAsyncWrites(() => main([
        'setup', 'adapter', 'catalogue', '--network-approved=yes', '--json',
    ], signedCatalogueContext(t, {projectRoot, coreVersion: '1.4.0'})));
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(report.disposition, 'ADAPTER_SELECTION_REQUIRED');
    assert.equal(report.data.catalogueEvidence.source, 'NETWORK');
    assert.match(report.data.catalogueEvidence.digest, /^[0-9a-f]{64}$/);
    assert.equal(report.data.adapters[0].packageVersion, '1.8.2');
    assert.equal(report.data.adapters[0].integrity, 'sha512-BBBB');
});

test('accepts no caller package, version, integrity, or URL authority', async (t) => {
    for (const control of ['--package=x', '--version=1.0.0', '--integrity=x', '--url=https://example.com']) {
        const result = await captureAsyncWrites(() => main([
            'setup', 'adapter', 'catalogue', '--network-approved=yes', control, '--json',
        ], signedCatalogueContext(t)));
        assert.equal(result.status, 2);
    }
});
```

- [x] **Step 2: Run focused tests and verify Red**

Run: `node --test tests/Node/prism-tool-adapter-catalogue.test.js tests/Node/prism-tool-bootstrap-adapter.test.js`

Expected: FAIL because the catalogue command is synchronous and has no network or digest contract.

- [x] **Step 3: Replace the static lockstep catalogue orchestration**

Keep Core-only static, remove `defaultCatalogue(coreRoot)`, and make
`inspectSupportedAdapters` acquire/verify/cache the signed envelope, normalize
payload, and select compatible releases. Return this exact evidence shape:

```text
catalogueEvidence: {
  source: 'NETWORK' | 'CACHE',
  catalogueId: 'kyaulabs/prism-adapters',
  sequence: <integer>,
  digest: <envelope SHA-256>,
  payloadDigest: <payload SHA-256>,
  keyId: 'kyaulabs-prism-adapters-2026-01',
  issuedAt: <timestamp>,
  expiresAt: <timestamp>
}
```

`loadSelectedAdapter` must load the digest-addressed verified cache entry,
recheck current expiry, rerun compatible selection, and return the adapter by
ID. Unknown/missing/expired digests return a stable catalogue error.

Update CLI parsing so catalogue discovery requires exactly
`--network-approved=yes --json`, passes injected `fetch`, cache, trust, and
clock context, and safely awaits the promise through the existing async main
boundary.

- [x] **Step 4: Run focused and full Node tests**

Run: `node --test tests/Node/prism-tool-adapter-catalogue.test.js tests/Node/prism-tool-bootstrap-adapter.test.js`

Run: `npm run test:node`

Expected: PASS with no static Core-version adapter assumption remaining.

- [x] **Step 5: Commit signed choice discovery**

```bash
git add packages/prism-core/scripts/prism-tool/supported-adapters.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-adapter-catalogue.test.js
prism-tool commit create --type fix --scope setup --subject "expose signed adapter catalogue choices" --refs 443
```

---

### Task 5: Install the Exact Signed Npm Release

**Files:**

- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-adapter.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-bootstrap-adapter.test.js`

**Interfaces:**

- Consumes: source mode, adapter ID, retained catalogue digest, verified cache entry, Pi executable.
- Produces: receipt schema 2 with embedded envelope and normalized `catalogueEvidence`; exact NPM-only acquisition.

- [x] **Step 1: Write failing NPM-only, exact-save, integrity, and receipt tests**

Add a local `provisionContext(t, options = {})` fixture to the existing adapter
test. It must create a strict-empty root, Core manifest, signed catalogue cache,
exact selected adapter package tree, schema-2 attempt ID, and fake Pi runner;
it exposes `{args, context, digest, projectRoot, childEnv}` and accepts
`installedIntegrity` to vary only the lockfile integrity.

```javascript
test('installs the digest-bound signed npm release and records schema 2', async (t) => {
    const fixture = provisionContext(t);
    const result = await captureAsyncWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        `--catalogue-digest=${fixture.digest}`,
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], fixture.context));
    const report = JSON.parse(result.stdout);
    const receipt = JSON.parse(fs.readFileSync(report.data.attempt.receiptPath, 'utf8'));

    assert.equal(report.data.acquisition.kind, 'NPM');
    assert.equal(report.data.acquisition.installSource, 'npm:@kyaulabs/prism-php-web@1.8.2');
    assert.equal(fixture.childEnv.npm_config_save_exact, 'true');
    assert.equal(fixture.childEnv.NPM_CONFIG_SAVE_EXACT, 'true');
    assert.equal(receipt.schemaVersion, 2);
    assert.equal(receipt.catalogueEvidence.integrity, 'sha512-BBBB');
});

test('rejects an installed lockfile integrity mismatch and restores strict emptiness', async (t) => {
    const fixture = provisionContext(t, {installedIntegrity: 'sha512-WRONG'});
    const result = await captureAsyncWrites(() => main(fixture.args, fixture.context));
    assert.equal(JSON.parse(result.stdout).reason, 'POSTINSTALL_VALIDATION_FAILED');
    assert.deepEqual(fs.readdirSync(fixture.projectRoot), []);
});
```

- [x] **Step 2: Run the adapter tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-adapter.test.js`

Expected: FAIL because selection accepts no digest and receipt schema 1 has no signed evidence.

- [x] **Step 3: Remove LOCAL acquisition and implement schema-2 validation**

Make `resolveBootstrapAcquisition({adapter})` return only:

```javascript
{
    kind: 'NPM',
    installSource: `npm:${adapter.packageName}@${adapter.packageVersion}`,
    packageRoot: null,
}
```

Add both exact-save variables beside both ignore-scripts variables. Require
`.pi/npm/package-lock.json` root dependency and installed package entry to have
the exact selected version and require installed `integrity` to equal the
signed selection. Receipt schema 2 adds:

```text
catalogueEnvelope: <canonical base64 exact signed envelope>,
catalogueEvidence: {
  catalogueId, sequence, keyId, issuedAt, expiresAt,
  envelopeDigest, payloadDigest, selectedAt, integrity
}
```

Verify `selectedAt` lies within signed validity. On later inspection reverify
the embedded envelope and adapter selection, but compare expiry against
`selectedAt`, not the current clock. Remove local settings and local package
branches from production code and update cleanup allowlists to NPM state only.

- [x] **Step 4: Run adapter tests and the original sandbox reproduction**

Run: `node --test tests/Node/prism-tool-bootstrap-adapter.test.js`

Run the Phase-1 Bubblewrap command from the diagnostic report against the
updated launcher and a fixture cache containing a valid signed catalogue.

Expected: focused tests PASS; post-install validation reaches
`ADAPTER_PROVISIONED`; exact package/settings state remains when successful.

The focused reproduction passes. The referenced diagnostic report and its exact
Bubblewrap command are not present in this checkout; the specification classifies
that sandboxed real-Pi reproduction as optional manual diagnostic evidence.

- [x] **Step 5: Commit exact signed acquisition**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-adapter.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-adapter.test.js
prism-tool commit create --type fix --scope setup --subject "install digest-bound adapter releases" --refs 443
```

---

### Task 6: Bind Adapter Evidence to Plans and Journals

**Files:**

- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-plan.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-journal.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-composer.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-providers.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`

**Interfaces:**

- Consumes: inspected schema-2 receipt and existing four-field adapter identity.
- Produces: nullable `adapterEvidence` on plan and journal; provider requests remain unchanged.

- [x] **Step 1: Write failing plan, journal, Core-only, and tamper tests**

```javascript
test('carries immutable adapter evidence without exposing it to providers', async (t) => {
    const prepared = await prepareSignedAdapterPlan(t);
    assert.deepEqual(prepared.plan.adapterEvidence, prepared.expectedEvidence);
    assert.deepEqual(prepared.journal.adapterEvidence, prepared.expectedEvidence);
    assert.equal('adapterEvidence' in prepared.adapterProviderRequest, false);
});

test('uses null adapter evidence for Core-only and rejects changed evidence', async (t) => {
    const coreOnly = await prepareCoreOnlyPlan(t);
    assert.equal(coreOnly.plan.adapterEvidence, null);
    assert.equal(coreOnly.journal.adapterEvidence, null);

    const selected = await prepareSignedAdapterPlan(t);
    selected.journal.adapterEvidence.envelopeDigest = '0'.repeat(64);
    rewriteJournal(selected.journalPath, selected.journal);
    assert.throws(() => validateBootstrapProjectPlan(selected.validation), /journal|evidence/);
});
```

- [x] **Step 2: Run plan tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: FAIL because plan and journal schemas do not contain `adapterEvidence`.

- [x] **Step 3: Add one closed evidence validator and propagate it**

Define one shared exact-key validator for:

```text
{
  catalogueId, sequence, keyId, issuedAt, expiresAt,
  envelopeDigest, payloadDigest, selectedAt, integrity
}
```

Require valid digests, positive sequence, exact timestamps, supported key ID,
and non-empty npm integrity. Add `adapterEvidence` to plan digest inputs,
journal schema, journal transitions, retained-plan validation, and composed
report. Require `(adapter === null) === (adapterEvidence === null)`.

Do not add catalogue fields to adapter provider requests, trusted provider
identity, or adapter handler inputs. Providers continue receiving only ID,
package name, exact package version, and bootstrap protocol.

- [x] **Step 4: Run plan and provider tests**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-adapter.test.js`

Expected: PASS for selected adapter, Core-only, digest binding, and provider isolation.

The Task 6 evidence cases and all adapter tests pass. The complete plan file is
90/93; the remaining three pre-durable selected-adapter cleanup failures require
the schema-2 cleanup context assigned to Task 7 and are retained as the planned
transition baseline.

- [x] **Step 5: Commit durable plan evidence**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-plan.js packages/prism-core/scripts/prism-tool/bootstrap-journal.js packages/prism-core/scripts/prism-tool/bootstrap-composer.js packages/prism-core/scripts/prism-tool/bootstrap-providers.js tests/Node/prism-tool-bootstrap-plan.test.js
prism-tool commit create --type fix --scope setup --subject "bind adapter evidence to project plans" --refs 443
```

---

### Task 7: Preserve Evidence Through Status, Cleanup, and Legacy Recovery

**Files:**

- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-adapter.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-status.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-transaction.js`
- Modify: `tests/Node/prism-tool-bootstrap-orchestration.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`

**Interfaces:**

- Consumes: schema-2 receipts, schema-1 legacy receipts, current journal phase.
- Produces: resumable signed attempts, safe legacy pre-durable cleanup guidance, manual preservation for durable/ambiguous legacy state.

- [x] **Step 1: Write failing status and legacy recovery tests**

```javascript
test('resumes a signed adapter attempt after the global cache expires', async (t) => {
    const attempt = provisionSignedAttempt(t, {catalogueExpiresAt: '2026-08-28T00:00:00Z'});
    const report = inspectBootstrapStatus({
        projectRoot: attempt.projectRoot,
        coreRoot: attempt.coreRoot,
        now: new Date('2026-09-01T00:00:00Z'),
    });
    assert.equal(report.disposition, 'ADAPTER_PROVISIONED');
    assert.equal(report.data.adapterEvidence.envelopeDigest, attempt.envelopeDigest);
});

test('reports legacy unsigned pre-durable state without treating it as signed', (t) => {
    const attempt = provisionSchemaOneAttempt(t);
    const report = inspectBootstrapStatus(attempt.context);
    assert.equal(report.status, 'NO-GO');
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(report.reason, 'LEGACY_UNSIGNED_ADAPTER_EVIDENCE');
    assert.match(report.data.nextAction, /cleanup/);
});

test('preserves durable or ambiguous legacy state for manual recovery', (t) => {
    const attempt = provisionLegacyDurableAttempt(t);
    const report = inspectBootstrapStatus(attempt.context);
    assert.equal(report.data.resumePhase, 'MANUAL_RECOVERY');
    assert.equal(fs.existsSync(attempt.attemptRoot), true);
});
```

- [x] **Step 2: Run orchestration tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-orchestration.test.js tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: FAIL because status has no adapter evidence or legacy classification.

- [x] **Step 3: Add explicit schema dispatch and recovery rules**

Parse receipt schema 2 through signed validation. Recognize schema 1 only as
legacy evidence. For an adapter-only pre-durable schema-1 attempt, return
`RECOVERY_REQUIRED` with reason `LEGACY_UNSIGNED_ADAPTER_EVIDENCE`, retained
source/adapter identity, and the exact existing cleanup command as next action.
Allow cleanup to validate and remove ownership-proven schema-1 package/settings
state without consulting the signed catalogue.

If a journal exists or state is durable/ambiguous, never remove or normalize it
automatically. Return manual recovery and preserve every artifact. Signed
schema-2 attempts include `adapterEvidence` in status reports and resume from
embedded receipt evidence even when the global cache is absent or expired.

- [x] **Step 4: Run status, transaction, and plan tests**

Run: `node --test tests/Node/prism-tool-bootstrap-orchestration.test.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-adapter.test.js`

Expected: PASS with safe legacy cleanup and no automatic durable deletion.

- [x] **Step 5: Commit recovery behavior**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-adapter.js packages/prism-core/scripts/prism-tool/bootstrap-status.js packages/prism-core/scripts/prism-tool/bootstrap-transaction.js tests/Node/prism-tool-bootstrap-orchestration.test.js tests/Node/prism-tool-bootstrap-plan.test.js
prism-tool commit create --type fix --scope setup --subject "preserve signed evidence through recovery" --refs 443
```

---

### Task 8: Attest Adapter Evidence in Repository Bootstrap

**Files:**

- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-repository.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-seed.js`
- Modify: `tests/Node/prism-tool-bootstrap-seed.test.js`

**Interfaces:**

- Consumes: durable journal with nullable adapter and adapter evidence.
- Produces: seed attestation that binds matching nullable adapter evidence; hook dispatch remains identity-only.

- [x] **Step 1: Write failing seed and hook-isolation tests**

```javascript
test('binds selected adapter evidence into the root seed attestation', async (t) => {
    const prepared = await prepareSignedSeed(t);
    const attestation = JSON.parse(fs.readFileSync(prepared.attestationPath, 'utf8'));
    assert.deepEqual(attestation.adapterEvidence, prepared.journal.adapterEvidence);
});

test('uses null evidence for Core-only and keeps hook identity unchanged', async (t) => {
    const prepared = await prepareCoreOnlySeed(t);
    const attestation = JSON.parse(fs.readFileSync(prepared.attestationPath, 'utf8'));
    assert.equal(attestation.adapter, null);
    assert.equal(attestation.adapterEvidence, null);
    assert.deepEqual(Object.keys(prepared.hookAdapterIdentity).sort(), [
        'bootstrapProtocol', 'id', 'packageName', 'packageVersion',
    ]);
});
```

- [x] **Step 2: Run seed tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-seed.test.js`

Expected: FAIL because the seed attestation does not include adapter evidence.

- [x] **Step 3: Extend repository and seed attestation schemas**

Add nullable `adapterEvidence` beside nullable `adapter` in repository creation
and seed preparation evidence. Validate equality against the journal and plan,
include it in attestation digests, reject substitution, and require null parity.
Do not alter hook adapter identity or pass signed catalogue data to adapter
commands.

- [x] **Step 4: Run seed and orchestration tests**

Run: `node --test tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-bootstrap-orchestration.test.js`

Expected: PASS for selected adapters, Core-only, tampering, and hook isolation.

- [x] **Step 5: Commit root-seed evidence**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-repository.js packages/prism-core/scripts/prism-tool/bootstrap-seed.js tests/Node/prism-tool-bootstrap-seed.test.js
prism-tool commit create --type fix --scope setup --subject "attest adapter evidence in repository seeds" --refs 443
```

---

### Task 9: Orchestrate Setup, Package the Trust Boundary, and Verify End to End

**Files:**

- Modify: `packages/prism-core/prompts/setup.md`
- Modify: `tests/Shell/toolchain_entrypoints_test.sh`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Create: `packages/prism-core/docs/adapter-catalogue.md`
- Modify: `CONTEXT.md`
- Modify: `docs/specs/2026-08-27-signed-compatible-adapter-discovery-spec.md`

**Interfaces:**

- Consumes: completed catalogue and selection launcher reports.
- Produces: one strict-empty setup protocol, packaged public trust root, publisher-facing public contract, and full verification evidence.

- [x] **Step 1: Write failing prompt and package contract assertions**

Add exact shell assertions for:

```bash
assert_file_contains "$CORE_PROMPTS/setup.md" 'setup adapter catalogue --network-approved=yes --json' 'strict-empty setup authorizes signed catalogue retrieval'
assert_file_contains "$CORE_PROMPTS/setup.md" 'catalogue-digest=' 'strict-empty adapter selection binds the displayed catalogue'
assert_file_contains "$CORE_PROMPTS/setup.md" 'raw.githubusercontent.com/kyaulabs/prism-adapters/main/catalogue.json' 'setup discloses the fixed catalogue origin'
assert_file_not_contains "$CORE_PROMPTS/setup.md" 'setup adapter select.*--package=|setup adapter select.*--version=|setup adapter select.*--integrity=|setup adapter select.*--url=' 'setup accepts no caller release authority'
assert_file_contains "$CORE_PROMPTS/setup.md" 'verified global cache' 'setup discloses its persistent cache effect'
```

Add a package archive test that requires the trust-root JSON and all three new
catalogue modules in the packed Core tarball.

- [x] **Step 2: Run shell and packaging tests and verify Red**

Run: `bash tests/Shell/toolchain_entrypoints_test.sh`

Run: `node --test tests/Node/toolchain-packaging.test.js`

Expected: FAIL because setup prose and archive expectations still describe the static lockstep catalogue.

- [x] **Step 3: Update the public setup and catalogue contracts**

Rewrite strict-empty adapter discovery to:

1. disclose the fixed raw GitHub read and managed global cache write;
2. invoke `prism-tool setup adapter catalogue --network-approved=yes --json`;
3. require signed catalogue evidence, digest, source, and normalized choices;
4. display Core-only and all exact compatible releases;
5. ask one adapter question;
6. retain adapter ID and digest as inert values; and
7. invoke `prism-tool setup adapter select --adapter=<id> --catalogue-digest=<digest> --source=<source> --network-approved=yes --json`.

Document the signed envelope, payload schema, fixed origin, public key ID and
fingerprint, cache rules, publisher boundary, and private-key prohibition in
`packages/prism-core/docs/adapter-catalogue.md`. Update the spec status to
`Implemented` only after all verification below passes. Keep CONTEXT.md aligned
with final field names.

- [x] **Step 4: Run complete verification and repair only causal failures**

Run: `prism-tool doctor --local-only`

Run: `npm run test:node`

Run: `bash packages/prism-core/scripts/validate-harness.sh`

Stage all changed Markdown and run: `prism-tool markdown lint --cached`

Run the active repository `/check` workflow after task verification and confirm
no debug artifacts, temporary catalogue fixtures, private keys, focused-test
flags, or `.pi/tmp` files remain.

Expected: every command PASS; package archive contains the public trust root but
no private key; the original setup reproduction reaches a signed selection or a
deterministic catalogue-unavailable NO-GO rather than post-install validation
failure.

- [x] **Step 5: Create the terminal implementation commit**

```bash
git add packages/prism-core/prompts/setup.md tests/Shell/toolchain_entrypoints_test.sh tests/Node/toolchain-packaging.test.js packages/prism-core/docs/adapter-catalogue.md CONTEXT.md docs/specs/2026-08-27-signed-compatible-adapter-discovery-spec.md
prism-tool commit create --type fix --scope setup --subject "orchestrate signed compatible adapter discovery" --fixes 443
```

---

## Plan Self-Review

- Spec coverage: every problem, solution, implementation decision, testing
  decision, acceptance criterion, rollout boundary, and out-of-scope rule maps
  to Tasks 1–9.
- Placeholder scan: no deferred implementation markers or unspecified
  interfaces remain.
- Type consistency: `catalogueEvidence` is receipt-local signed evidence;
  `adapterEvidence` is the normalized durable subset; adapter provider identity
  remains the existing four fields.
- Issue references: Tasks 1–8 use `--refs 443`; Task 9 alone uses `--fixes 443`.
- Dependency note: exact `semver` 7.8.5 is disclosed and requires explicit
  registry authorization before lockfile mutation.
- Adapter command audit: this is Core Node work; PHP/Pest/browser commands are
  inapplicable. Full verification uses the repository Node and harness gates.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
