# Immutable Template Capability Data Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Add a fixed Core-owned Template source reader that resolves public `kyaulabs/template` data to an immutable, validated capability catalogue without importing or executing remote project content.

**Architecture:** Add one public asynchronous `prism-tool setup source` operation. `template-source-http.js` owns the bounded unauthenticated fetch boundary, `template-source-validation.js` owns positive closed validation and digests, and `template-source.js` owns the fixed GitHub object sequence plus structured GO/NO-GO reports. Tests exercise the public CLI with an injected fetch boundary and immutable synthetic responses; existing launcher operations remain synchronous and unchanged.

**Tech Stack:** Node.js 22.19+ CommonJS, built-in Fetch/Web Streams, `node:crypto`, `node:test`, existing `prism-tool` CLI and package tests.

## Global constraints

- Prism Core remains language-agnostic; add no adapter-specific paths, dependencies, commands, or rendering behavior.
- Add no dependency, extension, safe directory, Git transport, archive parser, template engine, package discovery, or project mutation.
- The only remote source is unauthenticated public `https://api.github.com/repos/kyaulabs/template` through fixed launcher-owned URLs.
- Callers may select only `template` or `blank`; they cannot supply a host, repository, URL, branch, ref, commit, tree, blob, header, credential, transport, output path, or package coordinate.
- Template requires the existing invocation-scoped `--network-approved=yes` control. Blank rejects network controls and performs zero fetch calls.
- Revalidate the canonical strict-empty route before source acquisition. Established, containing-worktree, unsafe, and indeterminate roots perform zero fetch calls.
- Redirects, authentication responses, non-success responses, timeouts, malformed JSON, invalid UTF-8, oversized bodies, and unavailable streams fail closed.
- Resolve repository metadata to one validated default branch, one immutable commit SHA, one immutable tree SHA, one complete recursive tree, and one manifest blob SHA.
- Tree bounds: at most 1,024 entries, 4,096 UTF-8 bytes per path, 4 MiB response body, 4 MiB per declared non-manifest blob, and 64 MiB aggregate declared blob bytes.
- The fixed manifest path is `.prism/template-manifest.json`; its decoded size is at most 256 KiB.
- Accept only regular non-executable blobs (`100644`) and directory trees (`040000`). Reject symlinks, submodules, executable blobs, unknown modes/types, traversal, backslashes, control characters, non-NFC or ill-formed Unicode, duplicates, incoherent parents, blob-prefix collisions, `.git`, and `.pi/prism-tool` collisions.
- Manifest schema version 1 is closed and permits only classification/capability/provider data. It permits no copy instruction, command, script, package, URL, renderer path, output path, metadata, default selection, mode, or executable policy.
- Every non-manifest blob is classified exactly once and must match the immutable tree path, Git blob SHA, and size.
- Remote bytes never enter a provider workspace, candidate tree, project root, seed, executable loader, shell, or package-manager operation.
- Template failure returns `NO-GO` with source `TEMPLATE`; it never changes to Blank or performs an automatic retry.
- Preserve every established-project setup operation and test unchanged.
- Every new `.js` file carries the required RCS header and final JavaScript vim modeline.
- ADR-0082 and ADR-0083 own the architecture. `ADR-required: none`.

## Architect review

**Verdict:** GO-WITH-CONDITIONS

**ADR-required:** none

- Core owns this fixed source boundary under ADR-0082; no adapter may acquire or interpret Template data.
- ADR-0083 authorizes only the fixed unauthenticated object sequence for the active setup attempt.
- ADR-0070 requires the mechanics behind the public launcher rather than prompt prose.
- ADR-0058 forbids stack-specific behavior in these modules.
- The operation must use built-in Node surfaces and preserve the existing launcher contract for all unrelated commands.

## Security boundary

- **Asset:** project-root integrity, trusted Prism provider policy, bounded setup-network authority, and immutable source evidence.
- **Trust boundary:** every repository, commit, tree, and blob response is attacker-controlled network data.
- **Abuse case:** source substitution, redirect/auth broadening, branch races, path traversal, executable/symlink/submodule import, resource exhaustion, manifest policy injection, or remote bytes reaching project state.
- **Fail-closed behavior:** fixed typed URLs, no credentials, response/time/count/size bounds, positive path/mode/schema allowlists, immutable SHA binding, complete tree/manifest equality, sanitized reason enums, zero writes, and no fallback.

---

### Task 1: Expose Blank and immutable Template source reports through the public CLI

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/template-source-http.js`
- Create: `packages/prism-core/scripts/prism-tool/template-source-validation.js`
- Create: `packages/prism-core/scripts/prism-tool/template-source.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js:6-10,269-306`
- Create: `tests/Node/fixtures/template-source.js`
- Create: `tests/Node/prism-tool-template-source.test.js`

**Interfaces:**
- Consumes: `context.projectRoot ?? context.cwd ?? process.cwd()`.
- Consumes: `context.fetch ?? globalThis.fetch` only at the true HTTPS system boundary.
- Produces: `requestTemplateJson({fetchImpl, url, maxBytes}) -> Promise<object>`.
- Produces: `inspectTemplateSource({projectRoot, source, fetchImpl}) -> Promise<SourceReport>`.
- Produces: public `prism-tool setup source --source=template --network-approved=yes [--json]`.
- Produces: public `prism-tool setup source --source=blank [--json]`.
- `SourceReport` is `{schemaVersion: 1, command: 'setup source', status, disposition, source, reason, projectRoot, checks, data}`.
- Closed dispositions: `SOURCE_READY`, `SOURCE_UNAVAILABLE`, `STOP`.
- Closed sources: `TEMPLATE`, `BLANK`.

- [x] **Step 1: Write the failing public CLI happy-path tests**

Create `tests/Node/prism-tool-template-source.test.js` with an asynchronous output-capture helper and these complete first tests:

```javascript
// $KYAULabs: prism-tool-template-source.test.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {createTemplateFixture} = require('./fixtures/template-source');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');

async function captureWrites(action) {
    let stdout = '';
    let stderr = '';
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    process.stdout.write = (chunk) => {
        stdout += chunk;
        return true;
    };
    process.stderr.write = (chunk) => {
        stderr += chunk;
        return true;
    };
    try {
        return {status: await action(), stdout, stderr};
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    }
}

function source(projectRoot, fetchImpl, ...controls) {
    return captureWrites(() => main(
        ['setup', 'source', '--json', ...controls],
        {projectRoot, fetch: fetchImpl}
    ));
}

test('resolves Template to immutable source evidence through fixed public URLs', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = await source(
        projectRoot,
        fixture.fetch,
        '--source=template',
        '--network-approved=yes'
    );
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.command, 'setup source');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'SOURCE_READY');
    assert.equal(report.source, 'TEMPLATE');
    assert.equal(report.reason, 'TEMPLATE_VALID');
    assert.equal(report.projectRoot, fs.realpathSync(projectRoot));
    assert.equal(report.data.attestation.templateId, 'kyaulabs/template');
    assert.equal(report.data.attestation.defaultBranch, 'develop');
    assert.equal(report.data.attestation.commitSha, fixture.commitSha);
    assert.equal(report.data.attestation.treeSha, fixture.treeSha);
    assert.equal(report.data.attestation.manifest.path, '.prism/template-manifest.json');
    assert.equal(report.data.catalogue.schemaVersion, 1);
    assert.equal(report.data.catalogue.bootstrapProtocol, 1);
    assert.deepEqual(fixture.calls.map(({url}) => url), fixture.urls);
    assert.equal(fixture.calls.every(({options}) => options.method === 'GET'), true);
    assert.equal(fixture.calls.every(({options}) => options.redirect === 'manual'), true);
    assert.equal(fixture.calls.every(({options}) => options.credentials === 'omit'), true);
    assert.equal(
        fixture.calls.every(({options}) => !Object.keys(options.headers).some((name) => /authorization|cookie/i.test(name))),
        true
    );
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('returns Blank source evidence without a template network call', async (t) => {
    const projectRoot = makeTempDir();
    let calls = 0;
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = await source(projectRoot, async () => {
        calls += 1;
        throw new Error('Blank must not fetch');
    }, '--source=blank');
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'SOURCE_READY');
    assert.equal(report.source, 'BLANK');
    assert.equal(report.reason, 'BLANK_SELECTED');
    assert.equal(report.data.attestation.source, 'BLANK');
    assert.equal(report.data.attestation.template, null);
    assert.equal(report.data.catalogue, null);
    assert.equal(calls, 0);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('rejects caller-selected source authority and invalid network controls', async (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    for (const controls of [
        ['--source=template'],
        ['--source=blank', '--network-approved=yes'],
        ['--source=other', '--network-approved=yes'],
        ['--source=template', '--repository=other/repository', '--network-approved=yes'],
        ['--source=template', '--branch=main', '--network-approved=yes'],
        ['--source=template', '--url=https://example.invalid', '--network-approved=yes'],
    ]) {
        const result = await source(projectRoot, async () => {
            throw new Error('invalid controls must not fetch');
        }, ...controls);

        assert.equal(result.status, 2);
        assert.equal(result.stdout, '');
        assert.match(result.stderr, /usage: prism-tool setup source/);
    }
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
```

Create `tests/Node/fixtures/template-source.js` as an immutable fixture factory. It must export `createTemplateFixture(overrides = {})`, compute the manifest Git blob SHA from `blob <size>\0<bytes>`, create the four fixed API responses, record `{url, options}` calls, and expose `urls`, `commitSha`, `treeSha`, `manifest`, `tree`, and `calls`. The canonical fixture contains:

```javascript
const sourceEntries = [
    {
        path: 'README.md',
        blobSha: '1111111111111111111111111111111111111111',
        size: 128,
        class: 'core-baseline',
        capability: 'project-readme',
        provider: {scope: 'core', id: 'project-readme'},
        disposition: 'render',
    },
    {
        path: '.gitignore',
        blobSha: '2222222222222222222222222222222222222222',
        size: 64,
        class: 'adapter-owned',
        capability: 'adapter-scaffold',
        provider: {scope: 'adapter', id: 'adapter-scaffold'},
        disposition: 'render',
    },
    {
        path: 'LICENSE',
        blobSha: '3333333333333333333333333333333333333333',
        size: 256,
        class: 'optional-profile',
        capability: 'licensing',
        provider: {scope: 'core', id: 'licensing'},
        disposition: 'render',
    },
    {
        path: '.github/media/git-flow.svg',
        blobSha: '4444444444444444444444444444444444444444',
        size: 512,
        class: 'template-maintenance-only',
        capability: 'template-maintenance',
        provider: null,
        disposition: 'exclude',
    },
];
```

The tree includes coherent `040000` entries for `.prism`, `.github`, and `.github/media`, the four `100644` source blobs, and `.prism/template-manifest.json`. Use a Web `ReadableStream` response body so production byte-bound logic is exercised rather than bypassed by a JSON stub.

- [x] **Step 2: Run the focused test to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-template-source.test.js
```

Expected: FAIL because `setup source` and its modules do not exist.

- [x] **Step 3: Implement the fixed source operation minimally**

Create `template-source-http.js` with:

```javascript
// $KYAULabs: template-source-http.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

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
            signal: AbortSignal.timeout(RESPONSE_TIMEOUT_MS),
        });
    } catch {
        throw new TemplateSourceError('NETWORK_FAILED');
    }
    if (response.status !== 200 || response.redirected === true) {
        throw new TemplateSourceError('RESPONSE_REJECTED');
    }
    const bytes = await readBoundedBody(response, maxBytes);
    let text;
    try {
        text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
        return JSON.parse(text);
    } catch {
        throw new TemplateSourceError('RESPONSE_INVALID');
    }
}

module.exports = {TemplateSourceError, requestTemplateJson};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
```

Create `template-source-validation.js` with the fixed constants, SHA helpers, positive object/key helpers, initial repository/commit/tree/blob/manifest validators, and the exact exported interface below. Task 3 and Task 4 harden the validators without changing these signatures:

```javascript
module.exports = {
    LIMITS,
    MANIFEST_PATH,
    digestJson,
    validateCommit,
    validateManifest,
    validateManifestBlob,
    validateRepository,
    validateTree,
};
```

Create `template-source.js` with fixed URL construction and no caller authority:

```javascript
const API_ROOT = new URL('https://api.github.com/');
const REPOSITORY_PATH = 'repos/kyaulabs/template';

function apiUrl(suffix = '') {
    return new URL(`${REPOSITORY_PATH}${suffix}`, API_ROOT).href;
}
```

`inspectTemplateSource` must:

1. call `inspectSetupRoute({projectRoot, source})` before any fetch;
2. return `STOP` without fetching unless the route is the matching strict-empty bootstrap route;
3. return the closed Blank report immediately for `BLANK`;
4. fetch repository metadata;
5. validate and encode the default branch as one path component;
6. fetch `/commits/<encoded-default-branch>`;
7. fetch `/git/trees/<tree-sha>?recursive=1`;
8. locate the fixed manifest entry;
9. fetch `/git/blobs/<manifest-blob-sha>`;
10. return immutable attestation and normalized catalogue data;
11. catch only `TemplateSourceError` into a sanitized `SOURCE_UNAVAILABLE` report;
12. never write to `projectRoot`.

Modify `cli.js` so `setup(args, context)` dispatches `source` before established adapter operations. Parse only one source control, at most one JSON control, and at most one exact network control. Template requires `--network-approved=yes`; Blank forbids any network control. `setup` may return a Promise only for this operation. Existing `main()` and `scripts/prism-tool.js` already accept that because the executable wraps the result with `Promise.resolve(...)`.

- [x] **Step 4: Run the focused tests to verify Green**

Run:

```bash
node --test tests/Node/prism-tool-template-source.test.js tests/Node/prism-tool-setup-route.test.js
```

Expected: PASS; Template uses exactly four fixed calls, Blank uses zero, and route behavior remains green.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/cli.js packages/prism-core/scripts/prism-tool/template-source-http.js packages/prism-core/scripts/prism-tool/template-source-validation.js packages/prism-core/scripts/prism-tool/template-source.js tests/Node/fixtures/template-source.js tests/Node/prism-tool-template-source.test.js
prism-tool commit create --type feat --scope setup --subject "resolve immutable template source evidence" --refs 382
```

---

### Task 2: Fail closed at the fixed HTTPS and route boundary

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/template-source-http.js`
- Modify: `packages/prism-core/scripts/prism-tool/template-source-validation.js`
- Modify: `packages/prism-core/scripts/prism-tool/template-source.js`
- Modify: `tests/Node/fixtures/template-source.js`
- Modify: `tests/Node/prism-tool-template-source.test.js`

**Interfaces:**
- Preserves every Task 1 signature.
- Adds only closed reason enums: `NETWORK_FAILED`, `RESPONSE_REJECTED`, `RESPONSE_TOO_LARGE`, `RESPONSE_INVALID`, `SOURCE_IDENTITY_INVALID`, `DEFAULT_BRANCH_INVALID`, and `COMMIT_INVALID`.
- Every failure returns exit `5`, status `NO-GO`, disposition `SOURCE_UNAVAILABLE` or `STOP`, source `TEMPLATE`, `data: null`, and one sanitized failed check.

- [x] **Step 1: Add failing hostile transport and authority tests**

Append table-driven public CLI tests covering:

```javascript
const transportCases = [
    ['redirect', {responseIndex: 0, status: 302, redirected: true}, 'RESPONSE_REJECTED'],
    ['authentication', {responseIndex: 0, status: 401}, 'RESPONSE_REJECTED'],
    ['rate limit', {responseIndex: 0, status: 429}, 'RESPONSE_REJECTED'],
    ['malformed JSON', {responseIndex: 0, rawBody: Buffer.from('{')}, 'RESPONSE_INVALID'],
    ['invalid UTF-8', {responseIndex: 0, rawBody: Buffer.from([0xc3, 0x28])}, 'RESPONSE_INVALID'],
    ['oversized metadata', {responseIndex: 0, rawBody: Buffer.alloc(65537, 0x20)}, 'RESPONSE_TOO_LARGE'],
    ['network failure', {rejectIndex: 0}, 'NETWORK_FAILED'],
];
```

For every case, assert:

```javascript
assert.equal(result.status, 5);
assert.equal(report.status, 'NO-GO');
assert.equal(report.disposition, 'SOURCE_UNAVAILABLE');
assert.equal(report.source, 'TEMPLATE');
assert.equal(report.reason, expectedReason);
assert.equal(report.data, null);
assert.deepEqual(fs.readdirSync(projectRoot), []);
```

Add metadata/commit validation cases for wrong repository identity, private visibility, invalid default branches (`main/other`, `.hidden`, `bad..name`, `name.lock`, trailing dot, control character, 129-byte name), malformed commit SHA, mismatched response SHA, missing tree SHA, and uppercase SHA.

Add a root-gate test that creates an established file before invoking Template and asserts `fixture.calls.length === 0`, disposition `STOP`, and no change to the file.

Add a branch-race test that returns `develop` from repository metadata, records the immutable commit/tree responses, and proves no later call references `develop`; calls three and four must contain only tree/blob object IDs.

- [x] **Step 2: Run the focused test to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-template-source.test.js
```

Expected: FAIL on one or more hostile cases that Task 1 does not yet reject precisely.

- [x] **Step 3: Harden transport and authority validation**

Set per-response bounds in `template-source.js`:

```javascript
const RESPONSE_LIMITS = Object.freeze({
    repository: 65536,
    commit: 262144,
    tree: 4194304,
    manifestBlob: 524288,
});
```

Implement repository validation with these exact positive rules:

```javascript
const BRANCH_PATTERN = /^(?!\.)(?!.*\.\.)(?!.*\.lock$)[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9_-])?$/;

function validateRepository(value) {
    if (!isRecord(value)) fail('SOURCE_IDENTITY_INVALID');
    if (value.full_name !== 'kyaulabs/template') fail('SOURCE_IDENTITY_INVALID');
    if (value.private !== false || value.visibility !== 'public') fail('SOURCE_IDENTITY_INVALID');
    if (typeof value.default_branch !== 'string') fail('DEFAULT_BRANCH_INVALID');
    if (!value.default_branch.isWellFormed()) fail('DEFAULT_BRANCH_INVALID');
    if (Buffer.byteLength(value.default_branch) > 128) fail('DEFAULT_BRANCH_INVALID');
    if (!BRANCH_PATTERN.test(value.default_branch)) fail('DEFAULT_BRANCH_INVALID');
    return {defaultBranch: value.default_branch};
}
```

Implement commit validation with exact lowercase 40-hex SHA checks and require `response.sha` plus `response.commit.tree.sha`. Return only `{commitSha, treeSha}`.

Map route rejection separately from network/source rejection so established roots return `STOP` without creating a source attempt. Do not include raw status text, response bodies, URLs, branch values, exceptions, or attacker-controlled fields in diagnostics.

- [x] **Step 4: Run the focused tests to verify Green**

Run:

```bash
node --test tests/Node/prism-tool-template-source.test.js tests/Node/prism-tool-setup-route.test.js
```

Expected: PASS with no retries, no fallback, no writes, and zero fetches outside the strict-empty Template route.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/template-source-http.js packages/prism-core/scripts/prism-tool/template-source-validation.js packages/prism-core/scripts/prism-tool/template-source.js tests/Node/fixtures/template-source.js tests/Node/prism-tool-template-source.test.js
prism-tool commit create --type feat --scope setup --subject "bound template source acquisition" --refs 382
```

---

### Task 3: Validate the complete immutable tree and manifest blob

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/template-source-validation.js`
- Modify: `packages/prism-core/scripts/prism-tool/template-source.js`
- Modify: `tests/Node/fixtures/template-source.js`
- Modify: `tests/Node/prism-tool-template-source.test.js`

**Interfaces:**
- `validateTree(value, expectedTreeSha) -> {entries, blobs, manifest}`.
- `validateManifestBlob(value, manifestTreeEntry) -> {bytes, sha256}`.
- Adds closed reasons `TREE_INVALID`, `TREE_TRUNCATED`, `TREE_TOO_LARGE`, `PATH_INVALID`, `MODE_INVALID`, `MANIFEST_BLOB_INVALID`, and `MANIFEST_BLOB_TOO_LARGE`.

- [x] **Step 1: Add failing table-driven tree and blob tests**

Add one mutation helper to the fixture module that deep-clones canonical response data before applying a test mutation. Add public CLI cases for:

- `truncated: true`;
- tree response SHA mismatch;
- 1,025 entries;
- aggregate declared size above 64 MiB;
- individual declared blob above 4 MiB;
- path above 4,096 UTF-8 bytes;
- absolute path, empty segment, `.`, `..`, traversal, backslash, NUL/control, non-NFC text, ill-formed surrogate text;
- duplicate path;
- missing parent directory tree;
- blob path used as another entry's parent;
- `.git`, `.git/config`, `.pi/prism-tool`, and `.pi/prism-tool/work`;
- symlink `120000`, submodule `160000`, executable blob `100755`, unknown mode, tree with non-`040000`, blob with non-`blob` type, and tree with non-`tree` type;
- missing, duplicate, directory, executable, or oversized `.prism/template-manifest.json`;
- manifest blob response SHA mismatch, declared-size mismatch, non-base64 encoding, malformed base64, decoded-size mismatch, Git blob SHA mismatch, and decoded body above 256 KiB.

Each case asserts exact NO-GO reason, exact root emptiness, and that no later fetch occurs after the failing phase.

- [x] **Step 2: Run the focused test to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-template-source.test.js
```

Expected: FAIL because Task 2 does not yet enforce every tree/path/mode/blob invariant.

- [x] **Step 3: Implement complete tree and blob validation**

In `template-source-validation.js`, define:

```javascript
const LIMITS = Object.freeze({
    treeEntries: 1024,
    pathBytes: 4096,
    blobBytes: 4194304,
    aggregateBlobBytes: 67108864,
    manifestBytes: 262144,
});
const MANIFEST_PATH = '.prism/template-manifest.json';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
```

Path validation must require:

```javascript
function validatePath(value) {
    if (typeof value !== 'string' || value.length === 0) fail('PATH_INVALID');
    if (!value.isWellFormed() || value.normalize('NFC') !== value) fail('PATH_INVALID');
    if (Buffer.byteLength(value) > LIMITS.pathBytes) fail('PATH_INVALID');
    if (value.startsWith('/') || value.includes('\\')) fail('PATH_INVALID');
    if (/[/](?:[.]|[.][.])(?:[/]|$)/.test(`/${value}`)) fail('PATH_INVALID');
    if (/[\u0000-\u001f\u007f-\u009f]/u.test(value)) fail('PATH_INVALID');
    if (value === '.git' || value.startsWith('.git/')) fail('PATH_INVALID');
    if (value === '.pi/prism-tool' || value.startsWith('.pi/prism-tool/')) fail('PATH_INVALID');
    if (path.posix.normalize(value) !== value) fail('PATH_INVALID');
    return value;
}
```

`validateTree` must:

1. require an object, exact expected lowercase tree SHA, `truncated === false`, and an array;
2. enforce count before iterating;
3. normalize each path once and reject duplicates;
4. accept only `040000/tree` or `100644/blob` records;
5. require lowercase SHA for every entry;
6. require integer non-negative blob size and all byte limits;
7. require each parent segment to exist as a tree entry;
8. reject a blob that prefixes another path;
9. require exactly one `100644/blob` manifest entry at the fixed path;
10. return normalized sorted records without API URLs or unknown fields.

`validateManifestBlob` must require the response SHA and size to equal the tree entry, require encoding `base64`, allow only GitHub's canonical base64 line breaks, decode to the exact declared size, enforce 256 KiB, validate fatal UTF-8 later, and recompute the Git blob SHA:

```javascript
function gitBlobSha(bytes) {
    return crypto.createHash('sha1')
        .update(Buffer.from(`blob ${bytes.length}\0`, 'utf8'))
        .update(bytes)
        .digest('hex');
}
```

Return the decoded bytes and SHA-256 digest only. Do not write the bytes anywhere.

- [x] **Step 4: Run the focused tests to verify Green**

Run:

```bash
node --test tests/Node/prism-tool-template-source.test.js
```

Expected: PASS for every hostile tree/path/mode/blob case and the immutable valid fixture.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/template-source-validation.js packages/prism-core/scripts/prism-tool/template-source.js tests/Node/fixtures/template-source.js tests/Node/prism-tool-template-source.test.js
prism-tool commit create --type feat --scope setup --subject "validate immutable template trees" --refs 382
```

---

### Task 4: Enforce the closed capability manifest and package regression contract

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/template-source-validation.js`
- Modify: `packages/prism-core/scripts/prism-tool/template-source.js`
- Modify: `tests/Node/fixtures/template-source.js`
- Modify: `tests/Node/prism-tool-template-source.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js:104-112`

**Interfaces:**
- `validateManifest(bytes, tree) -> {catalogue, manifestSha256, classificationSha256}`.
- Capability/provider allowlist is fixed Core-owned data, not manifest-provided policy.
- Adds closed reasons `MANIFEST_INVALID`, `MANIFEST_SCHEMA_UNSUPPORTED`, `MANIFEST_TREE_MISMATCH`, and `CAPABILITY_UNSUPPORTED`.
- Final Template `data` contains only normalized catalogue records and immutable attestation digests; it contains no raw response, remote project blob, API URL, command, script, output path, package coordinate, or default selection.

- [x] **Step 1: Add failing closed-schema and non-materialization tests**

Add manifest variants for:

- malformed JSON and invalid UTF-8;
- top-level array/null;
- missing or unknown top-level keys;
- unsupported `schemaVersion`, `bootstrapProtocol`, or `templateId`;
- non-array entries or more entries than non-manifest blobs;
- missing tree blob, duplicate manifest path, extra manifest path, path/SHA/size mismatch;
- missing or unknown entry keys;
- unknown class, capability, provider scope, provider ID, or disposition;
- Core baseline with adapter provider;
- adapter-owned with Core provider;
- optional profile with adapter provider;
- maintenance entry with a provider or `render` disposition;
- render entry with null provider or `exclude` disposition;
- prohibited `copy`, `script`, `command`, `package`, `url`, `renderer`, `outputPath`, `metadata`, `default`, or `mode` keys;
- reordered valid entries producing the same classification digest;
- remote source blobs containing shell text while the project root remains empty and no command boundary is invoked.

Assert the valid report catalogue is path-sorted, contains exact normalized fields, and contains no manifest blob body. Assert `JSON.stringify(report)` does not include fixture-only canary project content.

- [x] **Step 2: Run the focused test to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-template-source.test.js tests/Node/toolchain-packaging.test.js
```

Expected: FAIL because the manifest validator and package inventory are incomplete.

- [x] **Step 3: Implement the closed manifest contract**

Define the exact Core allowlist:

```javascript
const CAPABILITIES = Object.freeze({
    'project-readme': ['core-baseline', 'core', 'project-readme'],
    'core-hooks': ['core-baseline', 'core', 'core-hooks'],
    'commit-policy': ['core-baseline', 'core', 'commit-policy'],
    'adapter-scaffold': ['adapter-owned', 'adapter', 'adapter-scaffold'],
    licensing: ['optional-profile', 'core', 'licensing'],
    'community-governance': ['optional-profile', 'core', 'community-governance'],
    'github-collaboration': ['optional-profile', 'core', 'github-collaboration'],
    'security-disclosure': ['optional-profile', 'core', 'security-disclosure'],
    'repository-ownership': ['optional-profile', 'core', 'repository-ownership'],
    'support-routing': ['optional-profile', 'core', 'support-routing'],
    funding: ['optional-profile', 'core', 'funding'],
    'release-management': ['optional-profile', 'core', 'release-management'],
    'template-maintenance': ['template-maintenance-only', null, null],
});
```

Require exact top-level keys `schemaVersion`, `templateId`, `bootstrapProtocol`, and `entries`. Require exact entry keys `path`, `blobSha`, `size`, `class`, `capability`, `provider`, and `disposition`. Provider objects require exact keys `scope` and `id`.

For every normalized non-manifest tree blob:

1. find exactly one manifest entry;
2. require exact path/SHA/size equality;
3. resolve the capability only through `CAPABILITIES`;
4. require its exact class;
5. require `render` plus exact provider for Core/adapter/optional records;
6. require `exclude` plus null provider for maintenance records.

Reject any extra manifest entry. Sort normalized entries by path before returning them. Compute:

```javascript
function digestJson(value) {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
```

`manifestSha256` hashes the decoded manifest bytes. `classificationSha256` hashes the normalized sorted catalogue object, so harmless source ordering cannot change the digest.

Return final Template data in this exact shape:

```javascript
{
    attestation: {
        schemaVersion: 1,
        source: 'TEMPLATE',
        templateId: 'kyaulabs/template',
        defaultBranch,
        commitSha,
        treeSha,
        manifest: {
            path: '.prism/template-manifest.json',
            blobSha: manifest.sha,
            size: manifest.size,
            sha256: manifestSha256,
        },
        classificationSha256,
    },
    catalogue: {
        schemaVersion: 1,
        bootstrapProtocol: 1,
        entries: normalizedEntries,
    },
}
```

Update `tests/Node/toolchain-packaging.test.js` so the packaged launcher-module list contains:

```javascript
        'preflight', 'process', 'review-chain', 'setup-entry', 'setup-route',
        'template-source', 'template-source-http', 'template-source-validation',
```

- [x] **Step 4: Run focused and full Node verification**

Run:

```bash
node --test tests/Node/prism-tool-template-source.test.js tests/Node/prism-tool-setup-route.test.js tests/Node/toolchain-packaging.test.js
```

Expected: PASS.

Run:

```bash
npm run test:node
```

Expected: PASS with established-project setup, package release, commit, review, consent, and toolchain behavior unchanged.

Run:

```bash
npm exec eslint -- packages/prism-core/scripts/prism-tool/cli.js packages/prism-core/scripts/prism-tool/template-source-http.js packages/prism-core/scripts/prism-tool/template-source-validation.js packages/prism-core/scripts/prism-tool/template-source.js tests/Node/fixtures/template-source.js tests/Node/prism-tool-template-source.test.js tests/Node/toolchain-packaging.test.js
```

Expected: PASS.

- [x] **Step 5: Self-review the issue acceptance criteria**

Confirm mechanically:

- only fixed public `kyaulabs/template` URLs are reachable;
- default branch resolves once to immutable commit/tree/blob identities;
- redirects/authentication/truncation/size/JSON/UTF-8/path/mode/schema failures are covered;
- no remote blob is written or executed;
- Blank makes zero calls;
- Template NO-GO never becomes Blank;
- every source report uses a closed schema and reason enum;
- all existing Node tests remain green;
- no dependency or lockfile changed.

- [x] **Step 6: Create the final issue-closing commit**

```bash
git add packages/prism-core/scripts/prism-tool/template-source-validation.js packages/prism-core/scripts/prism-tool/template-source.js tests/Node/fixtures/template-source.js tests/Node/prism-tool-template-source.test.js tests/Node/toolchain-packaging.test.js
prism-tool commit create --type feat --scope setup --subject "validate template capability catalogues" --fixes 382
```

---

## Plan self-review

- **Spec coverage:** Task 1 establishes public Template/Blank source reports; Task 2 closes network/authority failures; Task 3 closes complete tree/path/mode/blob failures; Task 4 closes manifest/provider policy injection and package regression coverage.
- **Placeholder scan:** no implementation placeholder remains; each task names exact files, interfaces, commands, failure reasons, bounds, and validation rules.
- **Type consistency:** all tasks retain `inspectTemplateSource`, `requestTemplateJson`, `validateRepository`, `validateCommit`, `validateTree`, `validateManifestBlob`, `validateManifest`, `SourceReport`, and the same report/data field names.
- **Scope boundary:** this plan does not provision adapters, compose providers, apply projects, initialize Git, change prompts, or cover subsequent Epic slices.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
