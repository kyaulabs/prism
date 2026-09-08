# Installed Reviewer SDK Readiness Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Make installed Core supply and validate its reviewer SDK, report actionable readiness failures, and remove Prism's session-handoff capability.

**Architecture:** Core owns its standalone SDK as a runtime dependency while extension imports retain their host-peer contract. A package-relative ESM loader validates version and capabilities; a closed diagnostic boundary serves model-independent installation checks and consumer doctor. Pi owns compaction and human model selection; OCR remains current authority.

**Tech Stack:** Node.js 24, CommonJS plus a small ESM import boundary, existing semver 7.8.5, Node test runner, Bash contract tests, npm/pnpm lockfiles, Pi SDK 0.84.1 and 0.85.1 baselines.

**Originating issue:** #535

## Global constraints

- Specification: `docs/specs/2026-09-07-installed-review-sdk-readiness-spec.md`.
- Architectural verdict: GO-WITH-CONDITIONS. ADR-required: 0110,0111.
- Approval ratifies `adr/0110-core-owned-review-sdk-dependency.md` and `adr/0111-native-pi-session-continuity.md`; accept them before implementation.
- Compatibility metadata is exactly `>=0.84.1 <=5.0.0`. Include 5.0.0; reject prereleases, malformed versions, below-minimum and above-maximum versions.
- Core adds `@earendil-works/pi-coding-agent` as a runtime dependency. This is an explicitly disclosed dependency change; retain its extension peer with the same range. Add no other production dependency.
- Resolve SDK code from Core's package-relative ESM boundary. Never use inherited `NODE_PATH`, CLI discovery, checkout fallback, or consumer-supplied executable configuration.
- Readiness remains local-only. Never read credential files, run inference, authenticate, select a human model, mutate global Pi settings, or change review authority during tests or installation verification.
- In-memory credential stores are used for doctor and tests. Authorized review sessions retain Pi's own authentication delegation; this plan does not execute them as readiness probes.
- Reports contain classifier-owned codes and static remediation, not raw exceptions, paths, configuration, provider transcripts, or credentials.
- Preserve external Core/adapter and protected-base checks, OCR consent, attribution, and version-one finalization.
- Remove `/handoff` and active session-handoff guidance, not ordinary skill transitions, isolated review sessions, historical ADR bodies, changelog entries, or user-authored documents.
- No branch or source implementation before approval. After approval, create a `fix` branch through the resolved helper and commit approved spec/plan/ADRs before source changes.
- New source files use the repository's RCS header and vim modeline conventions. Source snippets below omit only hook-owned attribution values; copy an existing valid header and let the hook normalize it.
- Stage and commit in separate tool calls. Every `prism-tool commit create` is an exclusive standalone call. Never push.
- Approval authorizes package-registry reads and task-private installation of the named SDK versions, the newest stable in-range version, their dependency graphs, and lockfile/audit operations needed by this plan. Disable lifecycle scripts, use private HOME/cache/config state, and do not mutate user installations. No unrelated dependency upgrades.
- Plan approval retains normal automatic finalization: cleanup, target synchronization, unlimited local `/check`, one four-axis review under existing OCR consent, and preparation-only `/pr`. Additional review attempts need fresh approval.
- Released-consumer doctor `GO` remains a human post-publication/install checkpoint. Report it as pending, never substitute a local fixture PASS.

## Evidence and file responsibilities

The installed Core 0.6.0 SDK lookup failed. A guarded isolated doctor probe twice returned external trust eligibility followed by `NO-GO`, `RUNTIME_READINESS_FAILED`, exit 3. Clean Core installation with `--legacy-peer-deps` failed actual ESM import. Explicit 0.84.1 and 0.85.1 SDK installations passed real isolated-session initialization with in-memory credentials and no inference. CommonJS `require.resolve` returned `ERR_PACKAGE_PATH_NOT_EXPORTED` for available SDKs, so it cannot serve as the positive SDK probe.

| Surface | Responsibility |
| --- | --- |
| Core manifest and root lockfiles | Supply the SDK and pin reproducible development evidence |
| `check-peer-deps.js` | Distinguish extension peers from standalone runtime dependencies |
| New `readiness.js` | Closed branded failures and static diagnostic serialization |
| New `sdk-import.mjs` and `sdk.js` | ESM resolution, bounded package metadata, version/API verification |
| `session-runner.js` | Model resolution, credential-free doctor preparation, returned-object API checks |
| `cli.js` | `sdk --json`, stage-specific doctor diagnostics, unchanged authority grammar |
| `install-global.sh` | SDK check before successful deployment claims |
| Node/package and shell tests | Missing dependency regression, real SDK compatibility, installer and removal contracts |
| CI and maintained docs | Reproducible baselines, newer drift detection, documented remediation |
| Context guidance and prompt inventory | Native compaction without `/handoff` |

## Preparation after approval

- [x] Read the approved spec and both proposed ADRs. Recheck that 0110 and 0111 remain unique numbers.
- [x] Run `prism-tool resolve scripts`; retain the result. In a later call invoke the literal resolved `new-branch.sh` with arguments `fix installed-review-sdk-readiness`.
- [x] Change each new ADR status from `Proposed` to `Accepted`. Under ADR-0102 Status add `Partially superseded by ADR-0110 for the host-peer SDK dependency consequence only.` Under ADR-0055 Status add `Partially superseded by ADR-0111 for session-handoff context management only.` Preserve their bodies.
- [x] Add these exact entries under current Architectural Decisions in `CONTEXT.md`:

```markdown
- `adr/0110-core-owned-review-sdk-dependency.md` — make the standalone reviewer SDK a Core runtime dependency, with broad declared compatibility and independent capability checks.
- `adr/0111-native-pi-session-continuity.md` — remove session-handoff capability and use native Pi compaction without weakening workflow or safety gates.
```

- [x] Stage the two new ADRs, status-only edits to ADR-0055/0102, `CONTEXT.md`, the approved specification, and this plan. Commit before source changes:

```bash
prism-tool commit create --type docs --scope review --subject "record sdk readiness and native session continuity design" --refs 535
```

## Task 1: Supply the standalone SDK through package metadata

**Files:**

- Modify: `packages/prism-core/package.json`, `package.json`, `package-lock.json`, `pnpm-lock.yaml`
- Modify: `packages/prism-core/scripts/check-peer-deps.js`
- Test: `tests/Node/toolchain-packaging.test.js`, `tests/Node/check-peer-deps.test.js`
- Document: `NPM.md`

**Interfaces:**

- Consumes: npm package dependencies/peers and existing import scanner stdout contract.
- Produces: SDK runtime and peer declarations with the same range; extension imports require peers, standalone review imports require dependencies. Scanner still exits zero and reports violations through stdout.

- [x] **Red: replace the old peer-only packaging expectation with this complete behavior test.**

```javascript
test('Core supplies its standalone SDK even when peer installation is disabled', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(CORE_PKG, 'package.json'), 'utf8'));
    const sdk = '@earendil-works/pi-coding-agent';
    assert.equal(manifest.dependencies[sdk], '>=0.84.1 <=5.0.0');
    assert.equal(manifest.peerDependencies[sdk], '>=0.84.1 <=5.0.0');
    assert.deepEqual(manifest.bin, {
        'prism-review': 'scripts/prism-review.js',
        'prism-tool': 'scripts/prism-tool.js',
    });
});
```

Add these scanner cases to `tests/Node/check-peer-deps.test.js` using its existing `tmpdir(t)` and `run()` helpers:

```javascript
for (const [surface, declarations, accepted] of [
    ['extensions', {dependencies: {'@earendil-works/pi-coding-agent': '*'}}, false],
    ['extensions', {peerDependencies: {'@earendil-works/pi-coding-agent': '*'}}, true],
    ['scripts/prism-review', {peerDependencies: {'@earendil-works/pi-coding-agent': '*'}}, false],
    ['scripts/prism-review', {dependencies: {'@earendil-works/pi-coding-agent': '*'}}, true],
]) {
    test(`${surface} checks its own dependency scope: ${accepted}`, t => {
        const dir = tmpdir(t);
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: 'fixture', ...declarations}));
        fs.mkdirSync(path.join(dir, surface), {recursive: true});
        fs.writeFileSync(path.join(dir, surface, 'sdk.mjs'),
            'export const load = () => import("@earendil-works/pi-coding-agent");\n');
        assert.equal(run(path.join(dir, 'package.json')) === '', accepted);
    });
}
```

- [x] Run `node --test tests/Node/check-peer-deps.test.js tests/Node/toolchain-packaging.test.js`. Expect the runtime dependency and standalone scanner tests to fail meaningfully.
- [x] **Green: add the SDK runtime dependency with the exact range above; retain the peer with that range.** Change root development SDK pin to `0.85.1`.
- [x] In `check-peer-deps.js`, give each scan root its own declaration field:

```javascript
const scanRoots = [
    {label: 'extensions/', path: path.join(packageRootDir, 'extensions'), field: 'peerDependencies'},
    {label: 'scripts/prism-review/', path: path.join(packageRootDir, 'scripts', 'prism-review'), field: 'dependencies'},
];
```

Remove the global `peers` set. Keep the existing walker and import recognition. At the start of each scan-root iteration clear `imported`; after its successful `walk(root.path)` validate that root's set, inside the same iteration:

```javascript
const declared = new Set(Object.keys(pkg[root.field] || {}));
for (const core of imported) {
    if (!declared.has(core)) {
        console.log(`${rel}: ${root.label} imports pi core '${core}' but package.json does not list it in ${root.field}`);
    }
}
```

Remove the old final global peer loop. Rename the existing standalone test and assert `/dependencies/` instead of `/peerDependencies/`. Retain all malformed-input, scan-error and extension-peer tests. Update the header explanation to describe the two scopes.

- [x] Update `NPM.md`'s peer explanation and missing-import troubleshooting with this text:

```markdown
Core's extensions declare Pi as a host peer. The standalone reviewer also
requires the Pi SDK as a runtime dependency: Pi-managed installation omits
peers, and extension-loader aliases do not apply to a separate Node process.
Both declarations use `>=0.84.1 <=5.0.0`. The PHP/web adapter imports no host
API and needs no Pi peer.

For an installed reviewer import failure, run `prism-review sdk --json`.
Reinstall a verified Core release through the supported installer rather than
adding checkout paths or `NODE_PATH` to the process.
```

- [x] Regenerate only affected lockfile graph entries with lifecycle scripts disabled. Run root `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`, then `pnpm import`; compare both locks against the root manifest, then populate the approved graph with `npm ci --ignore-scripts --no-audit --no-fund`. Use task-private package-manager HOME/config/cache; no user credential/config inheritance. If `pnpm` or a dependency is unavailable, report the prerequisite rather than install an unapproved tool.
- [x] Rerun both focused test files; inspect lockfile diffs for unrelated upgrades. Revert only task-caused unrelated resolution changes by regenerating from the original lock, not by editing integrity records manually.
- [x] Stage this task's files and commit:

```bash
prism-tool commit create --type fix --scope review --subject "supply the standalone pi sdk as a runtime dependency" --refs 535
```

### Task 1 execution evidence

Preparation committed as `59bce780c66c131885ca323b30f4cdfa1eb61983` on
`fix/kyau-a116-installed-review-sdk-readiness`. Metadata, scanner, and root-pin
regressions each failed meaningfully before their changes. The focused Node
files now pass 32 tests. npm lock generation, pnpm import, and root npm ci
completed with lifecycle scripts disabled and private package-manager state.
Existing non-SDK npm versions stayed unchanged; SDK dependencies were updated
and hoisted from the former nested graph.

The first full Node run reported 1517 tests: 1280 pass, 237 fail. The
checkout's `packages/prism-core/config/automation/back-merge.yml` and
`packages/prism-core/config/release.yml` had mode `0600`; packaged-resource
validation requires exact `0644`. An isolated fixture confirmed the mismatch.
The human approved restoring only these two local modes without content
changes. This local-permission repair is an approved addition to Task 1's
paths, not a validation-policy change.

After that repair, the focused managed-hooks reproduction and all 1517 Node
tests pass. The changed npm lock audits clean at every severity. Harness
validation, source syntax, and whitespace checks pass; no PHP coverage gate
applies to this task's changed files. Task 1 is verified; its commit follows.

## Task 2: Add a bounded SDK readiness boundary

**Files:**

- Create: `packages/prism-core/scripts/prism-review/readiness.js`
- Create: `packages/prism-core/scripts/prism-review/sdk-import.mjs`
- Create: `packages/prism-core/scripts/prism-review/sdk.js`
- Test: `tests/Node/prism-review-sdk.test.js`

**Interfaces:**

- `readinessError(code): Error`, `diagnostic(error, fallback?): {reason, remediation}`; only module-created errors carry trusted codes.
- `atStage(code, action): value`, `atStageAsync(code, action): Promise<value>` preserve branded failures and normalize other exceptions.
- `validateSdkVersion(version): string`, `requireMethods(value, names): void`, `validateSdkApi(sdk): sdk`.
- `loadSdk({repositoryRoot?, resolveEntry?, importSdk?} = {}): Promise<{sdk, version}>`; injections are JavaScript test seams, never CLI or environment controls. When a repository is supplied, reject SDK code inside it before import.

- [x] **Red: create the test module with normal Node test imports and this version/API matrix.**

```javascript
const {loadSdk, validateSdkVersion, validateSdkApi, requireMethods} =
    require('../../packages/prism-core/scripts/prism-review/sdk');
const {diagnostic} = require('../../packages/prism-core/scripts/prism-review/readiness');

for (const version of ['0.84.1', '0.85.1', '0.86.0', '1.0.0', '5.0.0']) {
    test(`admits ${version} by version policy`, () => assert.equal(validateSdkVersion(version), version));
}
for (const version of ['0.84.0', '5.0.1', '6.0.0', '0.85.1-beta.1', 'garbage', null]) {
    test(`rejects unsupported version ${version}`, () => {
        assert.throws(() => validateSdkVersion(version), error =>
            diagnostic(error).reason === 'SDK_VERSION_UNSUPPORTED');
    });
}
test('an in-range version does not excuse missing SDK APIs', () => {
    validateSdkVersion('5.0.0');
    assert.throws(() => validateSdkApi({}), error => diagnostic(error).reason === 'SDK_API_UNSUPPORTED');
});
test('returned objects must provide the methods Core calls', () => {
    assert.throws(() => requireMethods({getModel: true}, ['getModel']), error =>
        diagnostic(error).reason === 'SDK_API_UNSUPPORTED');
});
test('an arbitrary exception cannot inject a trusted diagnostic or raw content', () => {
    const error = Object.assign(new Error('PRIVATE_CANARY'), {code: 'SDK_MISSING'});
    const result = diagnostic(error);
    assert.equal(result.reason, 'RUNTIME_READINESS_FAILED');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_CANARY/);
});
```

- [x] Run `node --test tests/Node/prism-review-sdk.test.js`; establish the missing module once, then use the version and API assertions as meaningful Reds while implementing incrementally.
- [x] **Green: implement `readiness.js`.**

```javascript
'use strict';
const CODES = Object.freeze({
    SDK_MISSING: 'Reinstall Core with its declared runtime dependencies using the supported installer.',
    SDK_METADATA_INVALID: 'Restore the verified Core dependency graph; SDK metadata could not be validated.',
    SDK_PROVENANCE_INVALID: 'Restore an SDK dependency outside the repository being reviewed.',
    SDK_VERSION_UNSUPPORTED: 'Install a Pi SDK version within >=0.84.1 <=5.0.0 through the supported Core dependency graph.',
    SDK_API_UNSUPPORTED: 'Use a Core release tested with this SDK or restore its verified dependency graph.',
    SDK_LOAD_FAILED: 'Restore the verified Core dependency graph; an SDK import or transitive dependency failed.',
    AUTHORITY_INELIGIBLE: 'Use an installed Core package outside the repository being reviewed.',
    MODEL_CONTROLS_INVALID: 'Select the provider, model, and reasoning level in Pi, then retry.',
    MODEL_UNAVAILABLE: 'Verify the selected model exists in the active Pi model catalogue.',
    MODEL_REASONING_UNSUPPORTED: 'Select a reasoning level supported by the active model in Pi.',
    MODEL_RUNTIME_FAILED: 'Verify local Pi model configuration using Pi; no authentication probe was performed.',
    RESOURCE_ISOLATION_FAILED: 'Use a compatible verified Core and Pi SDK pair; isolated resources could not be validated.',
    PROFILE_INVALID: 'Restore the matching package-owned review profile and policy resources.',
    ADAPTER_PROVIDER_INVALID: 'Install the matching external adapter quality provider and verify its protected-base identity.',
    RECEIPT_STATE_UNSAFE: 'Inspect existing authority receipts with the supported read-only commands before recovery.',
    CLEANUP_FAILED: 'Inspect task-owned temporary state before retrying; cleanup did not complete.',
    RUNTIME_READINESS_FAILED: 'Verify local reviewer prerequisites; no review attempt was started.',
});
const trusted = new WeakMap();
function readinessError(code) {
    if (!Object.hasOwn(CODES, code)) throw new TypeError('unknown readiness code');
    const error = new Error(code);
    trusted.set(error, code);
    return error;
}
function diagnostic(error, fallback = 'RUNTIME_READINESS_FAILED') {
    const reason = trusted.get(error) ?? (Object.hasOwn(CODES, fallback) ? fallback : 'RUNTIME_READINESS_FAILED');
    return Object.freeze({reason, remediation: CODES[reason]});
}
function atStage(code, action) {
    try { return action(); }
    catch (error) { throw trusted.has(error) ? error : readinessError(code); }
}
async function atStageAsync(code, action) {
    try { return await action(); }
    catch (error) { throw trusted.has(error) ? error : readinessError(code); }
}
module.exports = {readinessError, diagnostic, atStage, atStageAsync};
```

Use the same source header/modeline convention as neighboring files. No raw exception becomes a report field or cause chain.

- [x] **Green: implement the complete ESM bridge `sdk-import.mjs`.**

```javascript
export function resolveEntry() {
    return import.meta.resolve('@earendil-works/pi-coding-agent');
}
export function importSdk() {
    return import('@earendil-works/pi-coding-agent');
}
```

- [x] **Green: implement `sdk.js`.**

```javascript
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {fileURLToPath} = require('node:url');
const {TextDecoder} = require('node:util');
const semver = require('semver');
const {readinessError, atStage, atStageAsync} = require('./readiness');
const PACKAGE = '@earendil-works/pi-coding-agent';
const RANGE = '>=0.84.1 <=5.0.0';
const MAX_BYTES = 65536;
function validateSdkVersion(version) {
    if (typeof version !== 'string' ||
        !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version) ||
        semver.valid(version) === null || !semver.satisfies(version, RANGE)) {
        throw readinessError('SDK_VERSION_UNSUPPORTED');
    }
    return version;
}
function requireMethods(value, names) {
    if (value === null || value === undefined || names.some(name => typeof value[name] !== 'function')) {
        throw readinessError('SDK_API_UNSUPPORTED');
    }
}
function validateSdkApi(sdk) {
    return atStage('SDK_API_UNSUPPORTED', () => {
        requireMethods(sdk, ['DefaultResourceLoader', 'createAgentSession']);
        requireMethods(sdk.ModelRuntime, ['create']);
        requireMethods(sdk.SettingsManager, ['inMemory']);
        requireMethods(sdk.SessionManager, ['inMemory']);
        Reflect.construct(Object, [], sdk.DefaultResourceLoader);
        return sdk;
    });
}
function readManifest(file) {
    const before = fs.lstatSync(file);
    if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > MAX_BYTES) {
        throw readinessError('SDK_METADATA_INVALID');
    }
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(fd);
        const bytes = Buffer.alloc(MAX_BYTES + 1);
        let length = 0;
        while (length < bytes.length) {
            const count = fs.readSync(fd, bytes, length, bytes.length - length, length);
            if (count === 0) break;
            length += count;
        }
        const after = fs.fstatSync(fd);
        if (!held.isFile() || held.dev !== before.dev || held.ino !== before.ino ||
            length !== held.size || length > MAX_BYTES || after.dev !== held.dev ||
            after.ino !== held.ino || after.size !== held.size) {
            throw readinessError('SDK_METADATA_INVALID');
        }
        return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(0, length)));
    } finally { fs.closeSync(fd); }
}
function sdkMetadata(entry, repositoryRoot) {
    const requested = fileURLToPath(entry);
    const canonical = fs.realpathSync(requested);
    if (repositoryRoot !== undefined) {
        const repository = fs.realpathSync(repositoryRoot);
        const relative = path.relative(repository, canonical);
        if (relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
            throw readinessError('SDK_PROVENANCE_INVALID');
        }
    }
    if (!fs.statSync(canonical).isFile()) throw readinessError('SDK_METADATA_INVALID');
    let directory = path.dirname(canonical);
    for (let depth = 0; depth < 16; depth += 1) {
        const manifest = path.join(directory, 'package.json');
        let present;
        try { fs.lstatSync(manifest); present = true; }
        catch (error) { if (error.code !== 'ENOENT') throw error; present = false; }
        if (present) {
            const value = readManifest(manifest);
            if (value?.name === PACKAGE) return {version: validateSdkVersion(value.version), manifest};
        }
        const parent = path.dirname(directory);
        if (parent === directory) break;
        directory = parent;
    }
    throw readinessError('SDK_METADATA_INVALID');
}
async function loadSdk(options = {}) {
    const bridge = await import('./sdk-import.mjs');
    let entry;
    try { entry = await (options.resolveEntry ?? bridge.resolveEntry)(); }
    catch (error) {
        throw readinessError(error?.code === 'ERR_MODULE_NOT_FOUND' ? 'SDK_MISSING' : 'SDK_LOAD_FAILED');
    }
    const metadata = atStage('SDK_METADATA_INVALID', () => sdkMetadata(entry, options.repositoryRoot));
    const sdk = await atStageAsync('SDK_LOAD_FAILED', () => (options.importSdk ?? bridge.importSdk)());
    validateSdkApi(sdk);
    const after = atStage('SDK_METADATA_INVALID', () => readManifest(metadata.manifest));
    if (after?.name !== PACKAGE || after.version !== metadata.version) throw readinessError('SDK_METADATA_INVALID');
    return Object.freeze({sdk, version: metadata.version});
}
module.exports = {loadSdk, validateSdkVersion, validateSdkApi, requireMethods};
```

- [x] Add these complete filesystem/import-boundary tests, one case per Red → Green cycle. Add `fs`, `path`, `os`, and `pathToFileURL` imports from their Node builtins to the test preamble.

```javascript
function sdkFixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-metadata-'));
    const manifest = path.join(root, 'package.json');
    const entry = path.join(root, 'dist/index.js');
    fs.mkdirSync(path.dirname(entry), {mode: 0o700});
    const write = version => fs.writeFileSync(manifest,
        JSON.stringify({name: '@earendil-works/pi-coding-agent', version}), {mode: 0o600});
    write('0.85.1');
    fs.writeFileSync(entry, 'export {};\n', {mode: 0o600});
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const namespace = {ModelRuntime: {create() {}}, DefaultResourceLoader: class {},
        SettingsManager: {inMemory() {}}, SessionManager: {inMemory() {}}, createAgentSession() {}};
    return {root, manifest, entry, write, namespace,
        options: {resolveEntry: () => pathToFileURL(entry).href, importSdk: async () => namespace}};
}
const cases = [
    ['missing package', 'SDK_MISSING', fixture => {
        fixture.options.resolveEntry = () => { throw Object.assign(new Error('PRIVATE_CANARY'), {code: 'ERR_MODULE_NOT_FOUND'}); };
    }],
    ['transitive failure', 'SDK_LOAD_FAILED', fixture => {
        fixture.options.importSdk = async () => { throw Object.assign(new Error('PRIVATE_CANARY'), {code: 'ERR_MODULE_NOT_FOUND'}); };
    }],
    ['unsupported version', 'SDK_VERSION_UNSUPPORTED', fixture => {
        fixture.write('5.0.1');
        fixture.options.importSdk = async () => { throw new Error('import must not run'); };
    }],
    ['malformed metadata', 'SDK_METADATA_INVALID', fixture => fs.writeFileSync(fixture.manifest, '{')],
    ['invalid utf8', 'SDK_METADATA_INVALID', fixture => fs.writeFileSync(fixture.manifest, Buffer.from([255]))],
    ['oversized metadata', 'SDK_METADATA_INVALID', fixture => fs.writeFileSync(fixture.manifest, 'x'.repeat(65537))],
    ['directory metadata', 'SDK_METADATA_INVALID', fixture => {
        fs.unlinkSync(fixture.manifest); fs.mkdirSync(fixture.manifest, {mode: 0o700});
    }],
    ['symlink metadata', 'SDK_METADATA_INVALID', fixture => {
        fs.renameSync(fixture.manifest, path.join(fixture.root, 'manifest-target.json'));
        fs.symlinkSync('manifest-target.json', fixture.manifest);
    }],
    ['missing APIs', 'SDK_API_UNSUPPORTED', fixture => { fixture.options.importSdk = async () => ({}); }],
    ['nonconstructible loader', 'SDK_API_UNSUPPORTED', fixture => {
        fixture.namespace.DefaultResourceLoader = () => ({});
    }],
    ['changed metadata', 'SDK_METADATA_INVALID', fixture => {
        fixture.options.importSdk = async () => { fixture.write('0.85.2'); return fixture.namespace; };
    }],
    ['reviewed SDK source', 'SDK_PROVENANCE_INVALID', fixture => {
        fixture.options.repositoryRoot = fixture.root;
        fixture.options.importSdk = async () => { throw new Error('import must not run'); };
    }],
];
for (const [name, expected, arrange] of cases) {
    test(name, async t => {
        const fixture = sdkFixture(t);
        arrange(fixture);
        await assert.rejects(() => loadSdk(fixture.options), error => {
            const report = diagnostic(error);
            assert.equal(report.reason, expected);
            assert.doesNotMatch(JSON.stringify(report), /PRIVATE_CANARY/);
            return true;
        });
    });
}
test('valid package metadata and API evidence returns the imported SDK', async t => {
    const fixture = sdkFixture(t);
    const result = await loadSdk(fixture.options);
    assert.equal(result.version, '0.85.1');
    assert.equal(result.sdk, fixture.namespace);
});
```

- [x] Rerun `node --test tests/Node/prism-review-sdk.test.js tests/Node/check-peer-deps.test.js`. Run syntax checks on the three new modules with `node --check`.
- [ ] Stage this task's files and commit:

```bash
prism-tool commit create --type fix --scope review --subject "validate package-relative sdk version and capabilities" --refs 535
```

### Task 2 execution evidence

Task 1 committed as `b7d8507a63f6b432f8c741c00e55fbc8d4bc4506`.
Task 2 passed 35 focused tests and all 1540 Node tests. Syntax checks on all
three new modules and harness validation passed. The version matrix includes
stable build metadata. Tests additionally cover throwing API getters, a
dangling nearest manifest, and metadata growth at the filesystem-open boundary.
The oversized and invalid-UTF-8 fixtures contain otherwise valid JSON so they
exercise those policies rather than accidentally passing on a JSON parse error.

Minor test-driven refinement: `requireMethods` also normalizes throwing getters
as `SDK_API_UNSUPPORTED`; its public signature is unchanged. This closes a
returned-object diagnostic gap within the approved API-validation scope.
Actual installed-package SDK import remains Task 6's separate proof.

## Task 3: Separate SDK and consumer doctor diagnostics

**Files:**

- Modify: `packages/prism-core/scripts/prism-review/session-runner.js`
- Modify: `packages/prism-core/scripts/prism-review/cli.js`, `packages/prism-core/scripts/prism-review/authority.js`
- Test: `tests/Node/prism-review-cli.test.js`, `tests/Node/prism-review-session.test.js`
- Document: `packages/prism-core/docs/review-runtime.md`, `packages/prism-core/README.md`, `README.md`

**Interfaces:**

- New exact grammar: `prism-review sdk --json`, no repository/model requirement, exit 0 or 3.
- SDK success: `{schemaVersion:1, command:'sdk', status:'GO', sdk:{packageName, version}}`.
- SDK/doctor failure: existing identity fields plus `{reason, remediation}` from `diagnostic()`.
- `resolveActiveModel(options)` accepts internal `readinessOnly: boolean`; `inspectIsolatedRuntime` always sets it true. Review execution leaves it false.

- [ ] **Red: add this CLI test and reject malformed SDK grammar through the existing invalid-argument table.**

```javascript
test('sdk readiness is independent of repository, model, and authentication', async () => {
    const output = capture();
    const status = await main(['sdk', '--json'], {
        ...output.context,
        inspectSdk: async () => ({version: '0.85.1'}),
        run() { throw new Error('Git must not run'); },
        inspectIsolatedRuntime() { throw new Error('model runtime must not run'); },
    });
    assert.equal(status, EXIT.OK);
    assert.deepEqual(JSON.parse(output.result().stdout), {
        schemaVersion: 1, command: 'sdk', status: 'GO',
        sdk: {packageName: '@earendil-works/pi-coding-agent', version: '0.85.1'},
    });
    assert.equal(output.result().stderr, '');
});
```

Add `['sdk']`, `['sdk','--json','--json']`, and `['sdk','--json','extra']` to invalid arguments.

- [ ] Run `node --test tests/Node/prism-review-cli.test.js`; expect the new SDK command test to fail.
- [ ] **Green: import `loadSdk` and diagnostics into `cli.js`; add `prism-review sdk --json` to HELP. Insert this exact branch before doctor.**

```javascript
if (argv.length === 2 && argv[0] === 'sdk' && argv[1] === '--json') {
    try {
        const inspected = await (context.inspectSdk ?? loadSdk)();
        writeJson(stdout, {schemaVersion: 1, command: 'sdk', status: 'GO',
            sdk: {packageName: '@earendil-works/pi-coding-agent', version: inspected.version}});
        return EXIT.OK;
    } catch (error) {
        writeJson(stdout, {schemaVersion: 1, command: 'sdk', status: 'NO-GO', ...diagnostic(error)});
        return EXIT.READINESS;
    }
}
```

The `inspectSdk` hook is accessible only through direct JavaScript calls in tests, never environment or user CLI input.

- [ ] **Red: add these complete runtime tests using the existing `fakeSdk`, `ENV`, `REPOSITORY_ROOT`, and `TEMP_ROOT` fixtures.**

```javascript
test('doctor initializes a credential-free local model runtime', async () => {
    const fixture = fakeSdk();
    await inspectIsolatedRuntime({repositoryRoot: REPOSITORY_ROOT, tempRoot: TEMP_ROOT,
        env: ENV, loadSdk: fixture.loadSdk});
    const options = fixture.calls.find(call => call.name === 'ModelRuntime.create').options;
    assert.equal(options.refreshOnCreate, false);
    assert.equal(options.allowModelNetwork, false);
    assert.equal(await options.credentials.read('fixture'), undefined);
    assert.deepEqual(await options.credentials.list(), []);
    await assert.rejects(() => options.credentials.modify('fixture', async () => undefined));
    await assert.rejects(() => options.credentials.delete('fixture'));
});
test('review model resolution retains SDK-owned credential delegation', async () => {
    const fixture = fakeSdk();
    await resolveActiveModel({env: ENV, loadSdk: fixture.loadSdk});
    const options = fixture.calls.find(call => call.name === 'ModelRuntime.create').options;
    assert.equal(Object.hasOwn(options, 'credentials'), false);
    assert.equal(options.allowModelNetwork, false);
});
```

Update the existing fake factory-call expectation to include `allowModelNetwork: false`. Update the existing invalid-controls assertion from `/active model/i` to a predicate checking `MODEL_CONTROLS_INVALID`; keep each unknown-model and reasoning assertion independently targeted.

- [ ] **Green: replace `loadPublicSdk` and annotate model failures in `session-runner.js`.**

```javascript
const {loadSdk, validateSdkApi, requireMethods} = require('./sdk');
const {readinessError, atStage, atStageAsync} = require('./readiness');
const READINESS_CREDENTIALS = Object.freeze({
    async read() { return undefined; },
    async list() { return []; },
    async modify() { throw readinessError('MODEL_RUNTIME_FAILED'); },
    async delete() { throw readinessError('MODEL_RUNTIME_FAILED'); },
});
async function loadPublicSdk(injected, repositoryRoot) {
    return injected === undefined ? (await loadSdk({repositoryRoot})).sdk : validateSdkApi(await injected());
}
```

Replace the factory call with:

```javascript
const runtimeOptions = {
    refreshOnCreate: false,
    allowModelNetwork: false,
    ...(options.readinessOnly ? {credentials: READINESS_CREDENTIALS} : {}),
};
const createRuntime = () => sdk.ModelRuntime.create(runtimeOptions);
const modelRuntime = options.readinessOnly
    ? await atStageAsync('MODEL_RUNTIME_FAILED', createRuntime)
    : await createRuntime();
requireMethods(modelRuntime, ['getModel']);
const getModel = () => modelRuntime.getModel(controls.provider, controls.id);
const model = options.readinessOnly ? atStage('MODEL_RUNTIME_FAILED', getModel) : getModel();
```

Pass `options.repositoryRoot` to `loadPublicSdk(options.loadSdk, options.repositoryRoot)`. Forward the existing canonical repository root into the `resolveActiveModel` calls in CLI `executeReview`, `authority.js`, and `runIsolatedSession`; `inspectIsolatedRuntime` already receives it. Add an SDK fixture whose entry is under its supplied repository root and assert `SDK_PROVENANCE_INVALID` before `importSdk` runs. Add `'5.0.0+build.1'` to the accepted version matrix.

Remove the old single `ModelRuntime.create` typeof guard; the loader now owns it. Replace existing model-control, unavailable-model and reasoning-level throws respectively with `readinessError('MODEL_CONTROLS_INVALID')`, `readinessError('MODEL_UNAVAILABLE')`, and `readinessError('MODEL_REASONING_UNSUPPORTED')`.

In `inspectIsolatedRuntime`, call `resolveActiveModel({...options, readinessOnly: true})`. Do not change model controls or fall back to another model. Preserve public custom-model discovery; do not set `modelsPath: null` in production merely to simplify fixtures.

- [ ] **Red: test missing methods on returned loader/session objects.** Use fake SDK overrides returning a loader without `getSystemPromptSource`, a runtime without `getModel`, and a created session without `abort`. Assert `SDK_API_UNSUPPORTED`, not a raw TypeError. Existing fake SDKs must provide all methods the real boundary uses.
- [ ] **Green: after constructing the resource loader, before `reload`, validate:**

```javascript
requireMethods(resourceLoader, ['reload', 'getExtensions', 'getSkills', 'getPrompts',
    'getThemes', 'getAgentsFiles', 'getSystemPrompt', 'getSystemPromptSource',
    'getAppendSystemPrompt', 'getAppendSystemPromptSources']);
```

After creating a session, validate `created?.session` methods `subscribe`, `prompt`, `abort`, `dispose`. On failure, dispose it if a callable dispose exists, then rethrow the branded failure. Wrap resource creation/reload and the existing `resourceState()` validation in `atStageAsync('RESOURCE_ISOLATION_FAILED', ...)` or `atStage('RESOURCE_ISOLATION_FAILED', ...)` as applicable, preserving branded SDK failures. Replace the existing isolation-specific message throws with the branded isolation code; update `runIsolatedSession` to use the branded reason for these cases rather than regex matching the old message. Keep timeout, cancellation, provider-auth, submission, and review-outcome behavior unchanged. Limit the isolation-stage wrapper to resource-loader construction/reload/state checks; do not blanket-wrap an authorized session's provider errors. Doctor may normalize its own final session-preparation failure because it makes no provider call. Retain the existing live-review provider-auth regression tests.

- [ ] **Red: add doctor cases for missing SDK, incompatible API, unavailable model, invalid profile, mismatched adapter provider, and unsafe receipt state.** At each existing injection boundary throw either `readinessError(code)` or a raw canary error. Assert the exact stage code and a nonempty static remediation, exit 3, and no canary in either output stream.
- [ ] **Green: normalize only at the owning boundary.** In doctor, replace the ineligible trust throw with `readinessError('AUTHORITY_INELIGIBLE')`. Use `atStage('PROFILE_INVALID', ...)` for Core profile loading, optional adapter discovery, adapter profile loading, and missing profile. Use `atStage('ADAPTER_PROVIDER_INVALID', ...)` for doctor repository identity, external provider resolution and adapter policy mismatch. Unsafe criteria/check states use `RECEIPT_STATE_UNSAFE`; unsafe receipt inspection is wrapped with that stage. Change doctor's catch to `catch (error)` and spread `diagnostic(error)` instead of the generic reason. For bridge and ad hoc catches, preserve their result shape and authority special case, but serialize any branded readiness failure through `diagnostic(error)`; unclassified failures remain `RUNTIME_READINESS_FAILED`.
- [ ] Keep cleanup in `finally`; if disposal/removal fails during doctor inspection, emit `CLEANUP_FAILED` without leaking temporary paths. Test cleanup failure through `removeTemp`, retaining the existing failure-over-success behavior.
- [ ] Update exact-output tests deliberately: trust failures now report `AUTHORITY_INELIGIBLE`; missing profile reports `PROFILE_INVALID`; model-control tests must inject eligible trust to reach that boundary; otherwise they correctly stop at trust. Add `remediation` to full failure expectations through independent literal expectations, not by calling production `diagnostic()` to construct the entire expected report.
- [ ] Append these maintained documentation sections to the runtime reference and link them from the two READMEs:

```markdown
## SDK prerequisite check

`prism-review sdk --json` checks package-relative SDK import, version, and
required public APIs without Git, model selection, credentials, or inference.
It returns exit 0 with `GO`, or exit 3 with `NO-GO`, a stable `reason`, and static
`remediation`. This does not establish review authority or authentication.

Core supplies the SDK as a runtime dependency. Its SDK and host-peer metadata
use `>=0.84.1 <=5.0.0`, including 5.0.0. An in-range version must also satisfy
required runtime APIs; version acceptance alone never establishes compatibility.

Doctor additionally checks external provenance, the selected model, isolated
resources, profiles, adapter providers, and receipt state. Authentication stays
`UNKNOWN`; doctor does not read credential files or probe a provider.

| Reason | Meaning |
| --- | --- |
| `SDK_MISSING` | Core cannot resolve its declared SDK |
| `SDK_METADATA_INVALID` | SDK package/version evidence is unsafe or malformed |
| `SDK_PROVENANCE_INVALID` | SDK code resolves inside the reviewed repository |
| `SDK_VERSION_UNSUPPORTED` | Version is outside the supported stable interval |
| `SDK_API_UNSUPPORTED` | A required public or returned-object API is missing |
| `SDK_LOAD_FAILED` | The resolved SDK or a transitive dependency cannot load |
| `MODEL_CONTROLS_INVALID` | Active Pi controls are absent or malformed |
| `MODEL_UNAVAILABLE` | The selected model is not in the local catalogue |
| `MODEL_REASONING_UNSUPPORTED` | The selected reasoning level is unsupported |
| `MODEL_RUNTIME_FAILED` | Local model runtime initialization failed |
| `RESOURCE_ISOLATION_FAILED` | Isolated session resources failed validation |
| `PROFILE_INVALID` | Expected package-owned review policy is invalid |
| `ADAPTER_PROVIDER_INVALID` | Matching external provider evidence is unavailable |
| `AUTHORITY_INELIGIBLE` | Core is not outside the reviewed repository |
| `RECEIPT_STATE_UNSAFE` | Existing authority state cannot safely be reused |
| `CLEANUP_FAILED` | Temporary runtime cleanup failed |
| `RUNTIME_READINESS_FAILED` | An unclassified prerequisite failed closed |

Restore a verified Core dependency graph or install a Core release tested with
the SDK when API compatibility fails. Do not point the reviewer at checkout
code or repair resolution with `NODE_PATH`. No readiness result authorizes OCR
removal or bypasses the human release, publication, and installation checkpoint.
```

- [ ] Run `node --test tests/Node/prism-review-sdk.test.js tests/Node/prism-review-cli.test.js tests/Node/prism-review-session.test.js`. Fix only regressions within these specified boundaries.
- [ ] Stage and commit:

```bash
prism-tool commit create --type fix --scope review --subject "report bounded sdk and consumer readiness diagnostics" --refs 535
```

## Task 4: Make installation verify SDK readiness

**Files:**

- Modify: `packages/prism-core/scripts/install-global.sh`
- Test: `tests/Shell/install_global_toolchain_test.sh`
- Document: `packages/prism-core/README.md`

**Interfaces:**

- Consumes: `prism-review sdk --json` from Task 3.
- Produces: installer failure before launcher deployment when SDK readiness fails; successful output explicitly distinguishes executable, SDK, and existing toolchain checks.

- [ ] **Red: extend the fake npm-installed review executable in the shell test to support exact SDK grammar and a controlled failure.**

```javascript
if (process.argv[2] === '--version') {
    process.stdout.write('0.4.3\n');
} else if (process.argv[2] === 'sdk' && process.argv[3] === '--json' && process.argv.length === 4) {
    const failed = process.env.PI_FIXTURE_SDK_MISSING === '1';
    process.stdout.write(JSON.stringify(failed
        ? {schemaVersion: 1, command: 'sdk', status: 'NO-GO', reason: 'SDK_MISSING', remediation: 'Reinstall Core.'}
        : {schemaVersion: 1, command: 'sdk', status: 'GO', sdk: {packageName: '@earendil-works/pi-coding-agent', version: '0.85.1'}}) + '\n');
    process.exitCode = failed ? 3 : 0;
} else {
    process.exitCode = 2;
}
```

Add an npm-source fixture with `PI_FIXTURE_SDK_MISSING=1`, fresh private agent/bin directories, and existing `write_fake_tools`. Invoke the installer with `--network-approved=yes` and the mocked `pi` on PATH. Assert nonzero status, `SDK_MISSING` output, and no new managed review launcher. No real network occurs in this shell test. Also test malformed JSON with exit zero, wrong command/status, and a canary field: installation must fail without echoing that raw canary.

- [ ] Resolve scripts in a separate call, then run the test via `bash tests/Shell/install_global_toolchain_test.sh`. Expect the new missing-SDK scenario to incorrectly succeed before the fix.
- [ ] **Green: add this complete `verify_review_sdk` shell function immediately before `verify_review_cli`; invoke `verify_review_sdk || return 1` after its existing version verification.** The child-process boundary bounds output during collection, not merely after writing an unbounded temporary file.

```bash
verify_review_sdk() {
    local result=""
    if ! result=$(env -u NODE_OPTIONS -u NODE_PATH node - "$REVIEW_CLI" 2>/dev/null <<'JSEOF'
const {spawnSync} = require('node:child_process');
const allowed = new Set(['SDK_MISSING', 'SDK_METADATA_INVALID', 'SDK_PROVENANCE_INVALID',
    'SDK_VERSION_UNSUPPORTED', 'SDK_API_UNSUPPORTED', 'SDK_LOAD_FAILED', 'RUNTIME_READINESS_FAILED']);
try {
    const child = spawnSync(process.execPath, [process.argv[2], 'sdk', '--json'], {
        encoding: 'utf8', timeout: 10000, maxBuffer: 65536,
    });
    if (child.error || ![0, 3].includes(child.status)) throw new Error();
    const report = JSON.parse(child.stdout);
    if (report.schemaVersion !== 1 || report.command !== 'sdk') throw new Error();
    if (report.status === 'GO' && child.status === 0 &&
        Object.keys(report).sort().join(',') === 'command,schemaVersion,sdk,status' &&
        report.sdk?.packageName === '@earendil-works/pi-coding-agent' &&
        Object.keys(report.sdk).sort().join(',') === 'packageName,version' &&
        typeof report.sdk.version === 'string' && /^[0-9]+\.[0-9]+\.[0-9]+(?:\+[0-9A-Za-z.-]+)?$/.test(report.sdk.version)) {
        process.exit(0);
    }
    if (report.status !== 'NO-GO' || child.status !== 3 ||
        Object.keys(report).sort().join(',') !== 'command,reason,remediation,schemaVersion,status') throw new Error();
    process.stdout.write(allowed.has(report.reason) ? report.reason : 'RUNTIME_READINESS_FAILED');
    process.exit(1);
} catch {
    process.stdout.write('RUNTIME_READINESS_FAILED');
    process.exit(1);
}
JSEOF
    ); then
        printf '✗ installed prism-review SDK readiness failed: %s\n' "${result:-RUNTIME_READINESS_FAILED}" >&2
        return 1
    fi
    printf '%s\n' '✓ prism review SDK readiness PASS'
}
```

The installer does not repair the dependency graph outside its already-approved package installation operation. Retain lifecycle-script disabling, source exclusivity, existing launcher ownership checks, consent behavior, and toolchain doctor.

- [ ] Update all installer fake-review fixtures that previously returned only `--version` to implement the exact new SDK result. Fixtures testing missing executables, bad versions, symlinks or ownership must still reach their intended rejection first. Add the success message assertion beside the existing executable PASS assertion.
- [ ] Document that an SDK failure before deployment cannot be reported as installation readiness success; an already-downloaded package may remain for remediation. Model/profile/authentication availability is not an installer prerequisite.
- [ ] Run `bash tests/Shell/install_global_toolchain_test.sh` and `node --test tests/Node/prism-review-cli.test.js`.
- [ ] Stage and commit:

```bash
prism-tool commit create --type fix --scope install --subject "verify reviewer sdk readiness before deployment" --refs 535
```

## Task 5: Remove session-handoff capability

**Files:**

- Delete: `packages/prism-core/prompts/handoff.md`
- Modify: `packages/prism-core/AGENTS.md`, `README.md`, `CODING_HARNESS.md`
- Modify: `packages/prism-core/docs/context-management.md`
- Modify: `packages/prism-core/skills/executing-plans/SKILL.md`, `packages/prism-core/skills/from-issue/SKILL.md`, `packages/prism-core/skills/wayfinder/SKILL.md`
- Test: `tests/Node/native-session-continuity.test.js`, `tests/Node/toolchain-packaging.test.js`

**Interfaces:**

- Consumes: Pi native automatic compaction and human `/compact` control.
- Produces: no packaged `/handoff` command; no active instruction to write session-handoff documents; unchanged pipeline transitions and blocker gates.

- [ ] **Red: create the complete contract test below with the usual source header/modeline.**

```javascript
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
const active = [
    'packages/prism-core/AGENTS.md', 'README.md', 'CODING_HARNESS.md',
    'packages/prism-core/docs/context-management.md',
    'packages/prism-core/skills/executing-plans/SKILL.md',
    'packages/prism-core/skills/from-issue/SKILL.md',
    'packages/prism-core/skills/wayfinder/SKILL.md',
];
test('the packaged session-handoff command is removed', () => {
    assert.equal(fs.existsSync(path.join(root, 'packages/prism-core/prompts/handoff.md')), false);
});
for (const file of active) {
    test(`${file} contains no active session-handoff capability`, () => {
        const text = fs.readFileSync(path.join(root, file), 'utf8');
        assert.doesNotMatch(text, /\/handoff\b|docs\/handoffs\//);
        assert.doesNotMatch(text, /(?:write|create|use|run) (?:a |the )?handoff/i);
    });
}
test('context guidance uses native compaction and preserves safety recovery', () => {
    const text = fs.readFileSync(path.join(root, active[3]), 'utf8');
    assert.match(text, /native compaction/i);
    assert.match(text, /fatal tool/i);
    assert.doesNotMatch(text, /(?:30|40|50|60)%/);
    const execution = fs.readFileSync(path.join(root, active[4]), 'utf8');
    assert.match(execution, /Never silently deviate from the plan/);
    assert.match(execution, /finishing-a-development-branch/);
});
```

Add `assert.equal(packed.files.has('prompts/handoff.md'), false)` in the existing Core archive test, which inspects the actual packed resource inventory.

- [ ] Run `node --test tests/Node/native-session-continuity.test.js tests/Node/toolchain-packaging.test.js`; expect the prompt and guidance assertions to fail.
- [ ] **Green: delete only the packaged handoff prompt and its three active command-table rows.** Do not delete a global installed copy or user documents.
- [ ] Replace `packages/prism-core/docs/context-management.md` with this complete maintained guide:

```markdown
# Context management

Continue well-defined work in the current Pi session. Use native compaction to
reduce conversation history; session length alone is not a reason to stop.

## Preserve current state

Keep the active task, approved scope, interfaces, latest verification result,
remaining blocker, and next unchecked step in the workflow's existing owned
artifacts. Update plan checkboxes after verified tasks. Do not introduce another
continuation document or persistence mechanism.

After compaction, reload the relevant skill and current plan task when needed.
Verify repository state before acting on old evidence. Compaction does not
renew approval, turn a failed check into a pass, or change review authority.

## Native compaction

Pi can compact during an active run and continue within the same session. The
human can also use `/compact` with instructions to preserve the active task,
approvals, exact paths, interfaces, verification evidence, and next action.

Prism sets no fixed context-percentage stop threshold and does not change Pi's
compaction settings. Do not claim to invoke `/compact` through Bash or an
unavailable tool. Keep reads focused and avoid repeating large completed-task
outputs merely to reconstruct history.

## Recovery and blockers

A fatal tool or safety state follows its existing reload/recovery contract.
Missing approval, an external blocker, or invalidated plan assumptions still
stop unsafe work. Report the specific blocker rather than treating a new
session as a repair. The human may explicitly choose another session.

Pi's `/tree` can revisit conversation branches, but it does not undo durable
Git commits, tracker mutations, or filesystem changes. Do not navigate across
such effects as though they had been rolled back.

## Rules

- Continue executable work across task and skill boundaries.
- Preserve current facts in existing workflow-owned records.
- Use native compaction rather than a session-length stop rule.
- Recheck stale evidence after compaction.
- Preserve all approval, verification, and fatal-state recovery gates.
```

Replace the executing-plans context-management section, excluding its following `## Rules`, with:

```markdown
## Context management across long plans

Continue through the approved plan in the current Pi session using native
compaction. Follow `packages/prism-core/docs/context-management.md`; session
length and fixed context percentages do not create a stop or approval gate.

Update the plan's checkbox status after each verified task. Preserve the active
task, interfaces, approval boundaries, latest test evidence, and next unchecked
step in existing workflow-owned artifacts. After compaction, reload the current
skill and task and verify repository state before relying on earlier evidence.

Actual halt/re-plan triggers and fatal tool-state recovery remain unchanged.
```

Delete its `/handoff` cross-reference. Replace its context-exhaustion Gotcha with:

```markdown
- *Stopping because a session is long* — keep current plan state accurate and
  continue with Pi's native compaction; only a defined blocker or approval gate
  stops execution.
```

In from-issue retain `continue in the current session when context remains reliable` for the existing contract, but replace the following new-session sentence with:

```markdown
Use Pi's native compaction for long sessions. A session change is the human's
choice; fatal tool states and unresolved external blockers retain their normal
recovery or stop behavior, not a session-handoff document requirement.
```

In Wayfinder replace the four-item new-session list with:

```markdown
Use Pi's native compaction for long-running maps. Keep decisions and the next
eligible frontier in the existing map records. The human may request another
session. Fatal tool or safety states retain their reload/recovery contract;
unresolved external blockers still stop unsafe progress.
```

Preserve the surrounding continuous-frontier and skill-transition rules.

- [ ] Search active package/docs surfaces for `/handoff`, `docs/handoffs`, and recommendations to write a handoff. Inspect each result rather than blanket-deleting the word. Historical ADRs/changelogs and normal skill transitions are excluded from removal. If another active reference is discovered, add its exact path to this task before editing and report that narrow plan correction.
- [ ] Run `node --test tests/Node/native-session-continuity.test.js tests/Node/toolchain-packaging.test.js`, `bash tests/Shell/wayfinder_workflow_contract_test.sh`, and the resolved harness validator. Preserve existing attribution and frontmatter.
- [ ] Stage and commit:

```bash
prism-tool commit create --type refactor --scope workflow --subject "remove handoff capability in favor of native pi compaction" --refs 535
```

## Task 6: Exercise installed SDKs in package smoke and compatibility CI

**Files:**

- Create: `tests/Package/prism-review-smoke.js`, `tests/Package/prism-review-model.mjs`, `tests/Package/prism-review-credential-guard.cjs`
- Test: `tests/Node/prism-review-package-contract.test.js`
- Modify: `.github/workflows/ci.yml`, `tests/Shell/pi_ci_contract_test.sh`
- Modify: `packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js`, `tests/Node/prism-tool-php-web-bootstrap.test.js`
- Document: `packages/prism-core/docs/review-runtime.md`

**Interfaces:**

- Smoke invocation: `node tests/Package/prism-review-smoke.js --sdk 0.84.1 --network-approved=yes` or `--sdk 0.85.1` or `--sdk newer`.
- It packs current Core and adapter, installs Core alone with peer omission and an exact SDK override, invokes real packaged commands, and replays the installation from the generated lock. No mock substitutes for SDK import, Core doctor, or profile validation.
- The model helper obtains test-only built-in model metadata from the installed SDK with an empty credential store, no model-file discovery, and no network. It does not select or configure a human model.

- [ ] **Red: add a contract test asserting the CI smoke calls this script, the script installs with `--legacy-peer-deps`, it checks doctor and SDK outcomes, and the old `unknown-command` smoke success predicate is absent.** Read only `.github/workflows/ci.yml` and the two new test scripts. Use these independent literal assertions:

```javascript
assert.match(ci, /tests\/Package\/prism-review-smoke\.js/);
assert.match(ci, /0\.84\.1/);
assert.match(ci, /0\.85\.1/);
assert.match(ci, /newer/);
assert.doesNotMatch(ci, /packaged CLI unexpectedly succeeded/);
assert.match(smoke, /--legacy-peer-deps/);
assert.match(smoke, /SDK_MISSING/);
assert.match(smoke, /SDK_API_UNSUPPORTED/);
assert.match(smoke, /SDK_VERSION_UNSUPPORTED/);
```

The behavior proof is the actual smoke run, not these wiring assertions.

- [ ] **Green: implement the model helper as this complete ESM program.** Copy it into the temporary install root before execution so its imports resolve there, not in the checkout.

```javascript
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
const credentials = {
    async read() { return undefined; }, async list() { return []; },
    async modify() { throw new Error('credential mutation forbidden'); },
    async delete() { throw new Error('credential mutation forbidden'); },
};
const runtime = await ModelRuntime.create({credentials, modelsPath: null,
    refreshOnCreate: false, allowModelNetwork: false});
const model = runtime.getModels().find(value => value.contextWindow > 0);
if (!model) throw new Error('no built-in fixture model available');
process.stdout.write(JSON.stringify({PI_PROVIDER: model.provider, PI_MODEL: model.id,
    PI_REASONING_LEVEL: 'off'}) + '\n');
```

- [ ] Implement the smoke harness around the following complete operations. Keep it under `tests/Package`, outside the normal offline Node-test glob. Require exact CLI arguments and explicit network approval before any install or version query. All child processes use an allowlisted environment containing only system PATH, private HOME/cache/temp paths, `PI_OFFLINE=1`, and task model controls; no inherited Node, npm, provider, SSH, cloud, or Git configuration. Use an owner-only temporary root and a `finally` cleanup. Child commands have bounded timeouts and output buffers.

```javascript
const childProcess = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
assert.equal(args.length, 3);
assert.equal(args[0], '--sdk');
assert.ok(['0.84.1', '0.85.1', 'newer'].includes(args[1]));
assert.equal(args[2], '--network-approved=yes');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-sdk-smoke-'));
fs.chmodSync(work, 0o700);
const home = path.join(work, 'home');
const install = path.join(work, 'install');
const consumer = path.join(work, 'consumer');
for (const dir of [home, install, consumer]) fs.mkdirSync(dir, {mode: 0o700});
const env = {PATH: process.env.PATH, HOME: home, TMPDIR: work, PI_OFFLINE: '1',
    npm_config_cache: path.join(work, 'npm-cache'), npm_config_globalconfig: '/dev/null',
    npm_config_userconfig: path.join(work, 'empty-npmrc'), GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null'};
fs.writeFileSync(env.npm_config_userconfig, '', {mode: 0o600});
const guard = path.join(work, 'credential-guard.cjs');
const guardLog = path.join(work, 'credential-guard-result.json');
fs.copyFileSync(path.join(__dirname, 'prism-review-credential-guard.cjs'), guard);
function run(command, argv, cwd = work, extra = {}) {
    const node = command === process.execPath;
    if (node) fs.rmSync(guardLog, {force: true});
    const actual = node ? ['--require', guard, ...argv] : argv;
    const result = childProcess.spawnSync(command, actual, {cwd,
        env: {...env, ...extra, ...(node ? {PRISM_TEST_GUARD_LOG: guardLog} : {})},
        encoding: 'utf8', timeout: 180000, maxBuffer: 1048576});
    if (result.error) throw result.error;
    if (node) {
        const evidence = JSON.parse(fs.readFileSync(guardLog, 'utf8'));
        assert.deepEqual(evidence, {loaded: true, denied: false}, 'credential guard must stay active without denied reads');
    }
    return result;
}
function ok(command, argv, cwd = work, extra = {}) {
    const result = run(command, argv, cwd, extra);
    assert.equal(result.status, 0, `${command} failed: ${result.stderr}`);
    return result.stdout;
}
function pack(packagePath) {
    const entries = JSON.parse(ok('npm', ['pack', packagePath, '--json', '--ignore-scripts',
        '--pack-destination', work], work));
    assert.equal(entries.length, 1);
    return {file: path.join(work, entries[0].filename), files: entries[0].files};
}
try {
    let version = args[1];
    if (version === 'newer') {
        const versions = JSON.parse(ok('npm', ['view',
            '@earendil-works/pi-coding-agent@>0.85.1 <=5.0.0', 'version', '--json']));
        const candidates = (Array.isArray(versions) ? versions : [versions])
            .filter(value => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value));
        candidates.sort((a, b) => {
            const x = a.split('.').map(Number), y = b.split('.').map(Number);
            return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
        });
        assert.ok(candidates.length > 0, 'no newer stable in-range SDK is available; compatibility lane is not verified');
        version = candidates.at(-1);
    }
    console.log(JSON.stringify({lane: args[1], sdkVersion: version}));
    const coreArchive = pack(path.join(root, 'packages/prism-core'));
    const adapterArchive = pack(path.join(root, 'packages/prism-php-web'));
    assert.ok(coreArchive.files.some(file => file.path === 'scripts/prism-review.js'));
    assert.ok(adapterArchive.files.some(file => file.path === 'scripts/prism-tool-adapter.js'));
    assert.equal(coreArchive.files.some(file => file.path === 'prompts/handoff.md'), false);
    fs.copyFileSync(coreArchive.file, path.join(install, 'core.tgz'));
    fs.writeFileSync(path.join(install, 'package.json'), JSON.stringify({private: true,
        dependencies: {'@kyaulabs/prism-core': 'file:./core.tgz'},
        overrides: {'@earendil-works/pi-coding-agent': version}}), {mode: 0o600});
    ok('npm', ['install', '--legacy-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund'], install);
    const lock = fs.readFileSync(path.join(install, 'package-lock.json'), 'utf8');
    assert.ok(lock.includes('node_modules/@earendil-works/pi-coding-agent'));
    ok('npm', ['ci', '--legacy-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund', '--offline'], install);
    assert.equal(fs.readFileSync(path.join(install, 'package-lock.json'), 'utf8'), lock);
    for (const directory of [path.join(root, '.pi'), path.join(root, '.pi/tmp')]) {
        if (!fs.existsSync(directory)) fs.mkdirSync(directory, {mode: 0o700});
        const identity = fs.lstatSync(directory);
        assert.ok(identity.isDirectory() && !identity.isSymbolicLink());
    }
    const artifacts = fs.mkdtempSync(path.join(root, '.pi/tmp/package-smoke-'));
    fs.chmodSync(artifacts, 0o700);
    for (const name of ['package.json', 'package-lock.json', 'core.tgz']) {
        fs.copyFileSync(path.join(install, name), path.join(artifacts, name));
        fs.chmodSync(path.join(artifacts, name), 0o600);
    }
    fs.writeFileSync(path.join(artifacts, 'version.json'), JSON.stringify({lane: args[1], sdkVersion: version}), {mode: 0o600});
    console.log(JSON.stringify({replayDirectory: artifacts}));
    ok('git', ['init', '--initial-branch=develop'], consumer);
    const core = path.join(install, 'node_modules/@kyaulabs/prism-core');
    const cli = path.join(core, 'scripts/prism-review.js');
    const sdkReport = JSON.parse(ok(process.execPath, [cli, 'sdk', '--json'], consumer));
    assert.equal(sdkReport.status, 'GO');
    assert.equal(sdkReport.sdk.version, version);
    fs.copyFileSync(path.join(__dirname, 'prism-review-model.mjs'), path.join(install, 'fixture-model.mjs'));
    const model = JSON.parse(ok(process.execPath, [path.join(install, 'fixture-model.mjs')], install));
    const doctor = JSON.parse(ok(process.execPath, [cli, 'doctor', '--json'], consumer, model));
    assert.equal(doctor.status, 'GO');
    assert.equal(doctor.sourceClass, 'INSTALLED_EXTERNAL');
    assert.equal(doctor.model.authentication, 'UNKNOWN');
    assert.equal(doctor.authority.adapter, null);
    assert.equal(doctor.checks.find(check => check.id === 'sdk-isolation').status, 'PASS');
    const sdkRoot = path.join(install, 'node_modules/@earendil-works/pi-coding-agent');
    const parked = path.join(work, 'parked-sdk');
    fs.renameSync(sdkRoot, parked);
    const missing = run(process.execPath, [cli, 'sdk', '--json'], consumer);
    assert.equal(missing.status, 3);
    assert.equal(JSON.parse(missing.stdout).reason, 'SDK_MISSING');
    fs.mkdirSync(path.join(sdkRoot, 'dist'), {recursive: true, mode: 0o700});
    const fakeManifest = {name: '@earendil-works/pi-coding-agent', version: '0.85.1',
        type: 'module', exports: {'.': {import: './dist/index.js'}}};
    fs.writeFileSync(path.join(sdkRoot, 'package.json'), JSON.stringify(fakeManifest), {mode: 0o600});
    fs.writeFileSync(path.join(sdkRoot, 'dist/index.js'), 'export const ModelRuntime = {};\n', {mode: 0o600});
    const incompatible = run(process.execPath, [cli, 'sdk', '--json'], consumer);
    assert.equal(incompatible.status, 3);
    assert.equal(JSON.parse(incompatible.stdout).reason, 'SDK_API_UNSUPPORTED');
    fakeManifest.version = '5.0.1';
    fs.writeFileSync(path.join(sdkRoot, 'package.json'), JSON.stringify(fakeManifest), {mode: 0o600});
    const unsupported = run(process.execPath, [cli, 'sdk', '--json'], consumer);
    assert.equal(unsupported.status, 3);
    assert.equal(JSON.parse(unsupported.stdout).reason, 'SDK_VERSION_UNSUPPORTED');
    console.log(JSON.stringify({lane: args[1], sdkVersion: version, packageSmoke: 'PASS'}));
} finally {
    fs.rmSync(work, {recursive: true, force: true});
}
```

The synthetic failures modify only the task's temporary installation, never the real installed SDK. Implement `tests/Package/prism-review-credential-guard.cjs` as the following complete test-only preload, with normal source header/modeline. It blocks before file access, records a denial even if the SDK catches the exception, and synchronizes Node's ESM builtin exports. Do not use inherited `NODE_OPTIONS` or modify the production executable's injection stripping.

```javascript
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {fileURLToPath} = require('node:url');
const {syncBuiltinESMExports} = require('node:module');
const write = fs.writeFileSync.bind(fs);
const destination = process.env.PRISM_TEST_GUARD_LOG;
if (typeof destination !== 'string' || !path.isAbsolute(destination)) throw new Error('missing guard log');
let denied = false;
function record() {
    write(destination, JSON.stringify({loaded: true, denied}), {mode: 0o600});
}
function check(value) {
    if (typeof value === 'number') return;
    const decoded = value instanceof URL ? fileURLToPath(value) : Buffer.isBuffer(value) ? value.toString('utf8') : value;
    if (typeof decoded !== 'string') throw new Error('unsupported guard path');
    const parts = path.resolve(decoded).split(path.sep);
    const basename = parts.at(-1);
    if (['auth.json', 'mcp-auth.json', '.netrc', '.git-credentials'].includes(basename) ||
        parts.includes('.ssh') || parts.includes('.aws') ||
        (basename === '.env' || (basename.startsWith('.env.') && basename !== '.env.example'))) {
        denied = true;
        record();
        throw new Error('credential access forbidden by package test');
    }
}
for (const name of ['openSync', 'readFileSync', 'open', 'readFile', 'createReadStream']) {
    const original = fs[name].bind(fs);
    fs[name] = (target, ...args) => { check(target); return original(target, ...args); };
}
for (const name of ['open', 'readFile']) {
    const original = fs.promises[name].bind(fs.promises);
    fs.promises[name] = (target, ...args) => { check(target); return original(target, ...args); };
}
syncBuiltinESMExports();
record();
```

Test the guard independently with a child program calling its wrapped reader on a nonexistent synthetic credential basename, and assert the child fails and the evidence has `denied: true`; never create or read a credential file. Guard scope here is SDK credential-file regression detection, not a new security sandbox. All other sensitive-path restrictions still apply.

- [ ] Preserve Task 1's dependency-declaration Red and the original missing-SDK reproduction as the causal baseline. Task 6's first Red is its CI wiring test; its negative runtime cases must explicitly assert `SDK_MISSING`, `SDK_API_UNSUPPORTED`, and `SDK_VERSION_UNSUPPORTED` on the task-owned installed copy. Do not run the new `sdk` grammar against the old executable and mistake its usage error for the original bug. Run both fixed baselines and require full positive and negative PASS.
- [ ] Update the main CI Pi CLI install and generated PHP/web scaffold pin from `0.84.1` to `0.85.1`; update their exact assertions. Keep root lockfiles at 0.85.1. Replace the current package-smoke job's body with a matrix over `os: [ubuntu-latest, macos-latest]` and `sdk: ['0.84.1', '0.85.1']`, preserving existing pinned checkout/setup-node actions and permissions. The smoke step is:

```yaml
      - name: Install and verify packed reviewer
        env:
          SDK_VERSION: ${{ matrix.sdk }}
        run: node tests/Package/prism-review-smoke.js --sdk "$SDK_VERSION" --network-approved=yes
```

Add an Ubuntu `sdk-compatibility` job with the same pinned checkout and Node 24 setup, 15-minute timeout, no persisted checkout credentials, and:

```yaml
      - name: Verify newer in-range SDK
        run: node tests/Package/prism-review-smoke.js --sdk newer --network-approved=yes
```

Add this artifact step to both SDK jobs after the smoke step; the discovered v4 tag resolved to this commit, which must remain pinned:

```yaml
      - name: Retain package installation replay evidence
        if: always()
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
        with:
          name: sdk-replay-${{ github.job }}-${{ strategy.job-index }}
          path: .pi/tmp/package-smoke-*/
          include-hidden-files: true
          if-no-files-found: warn
          retention-days: 7
```

The literal path includes only the four task-created replay files, not general `.pi` state. Local runs leave these ignored evidence directories for inspection; delete only the exact task-created directories after validation and report cleanup. Do not delete other `.pi/tmp` contents.

Do not mark a failed compatibility lane successful or skip it silently when no version qualifies. Record the exact resolved SDK version in its output. The pinned baseline lanes and root `npm ci` evidence remain release gates; the newer lane does not replace them. Retain the generated consumer lock and exact-version report as a CI artifact before task cleanup by copying only those noncredential files to the job's artifact directory; re-running `npm ci` from that lock is the replay path.

- [ ] Extend `tests/Shell/pi_ci_contract_test.sh` for both baselines, the newer lane, and no legacy unknown-command predicate. Preserve its existing Linux/macOS, `npm pack`, temporary-root, authentication, and managed-tool assertions, adjusting the `npm pack`/`mktemp` wiring checks to inspect the owned smoke script when logic has moved there.
- [ ] Document the distinction between locked root verification, fixed-SDK installed-package lanes with lock replay, and newer-version drift detection. Explicitly state that only a human's post-release installed-consumer doctor result satisfies the released-consumer acceptance criterion.
- [ ] Run:

```bash
node --test tests/Node/prism-review-package-contract.test.js tests/Node/prism-review-sdk.test.js tests/Node/prism-review-cli.test.js tests/Node/prism-review-session.test.js tests/Node/check-peer-deps.test.js tests/Node/toolchain-packaging.test.js tests/Node/native-session-continuity.test.js tests/Node/prism-tool-php-web-bootstrap.test.js
node tests/Package/prism-review-smoke.js --sdk 0.84.1 --network-approved=yes
node tests/Package/prism-review-smoke.js --sdk 0.85.1 --network-approved=yes
node tests/Package/prism-review-smoke.js --sdk newer --network-approved=yes
bash tests/Shell/pi_ci_contract_test.sh
bash tests/Shell/prism_review_foundation_contract_test.sh
bash tests/Shell/prism_review_architecture_contract_test.sh
bash tests/Shell/install_global_toolchain_test.sh
bash tests/Shell/wayfinder_workflow_contract_test.sh
```

If a newer SDK fails capability or isolation checks, retain the bounded diagnostic, record the exact version, and return to the specific compatibility assumption; never widen away the failure. No real inference is needed.

- [ ] Run the full Node suite with `npm run test:node` and the resolved harness validator. Inspect changed source for temporary probes, raw exception output, and unintended authority changes. Stage this task's files and create the sole terminal issue-closing implementation commit:

```bash
prism-tool commit create --type fix --scope review --subject "verify installed sdk readiness across supported pi baselines" --fixes 535
```

## Final verification and human checkpoint

- [ ] Load `verification-before-completion` and verify all task evidence freshly.
- [ ] Load `finishing-a-development-branch`; preserve the approved artifacts in Git history before normal cleanup. Do not recreate a session-handoff document.
- [ ] Run `/check` through its current prompt and the active PHP/web adapter. Mandatory exact commands include `prism-tool doctor --local-only`, `prism-tool automation health --json`, and adapter coverage `prism-tool server run @kyaulabs/prism-php-web:browser-fixture --tool pest -- --coverage`. Do not replace them with direct tools. Resolve every harness script in a separate call and invoke its retained literal path.
- [ ] Complete the current OCR-backed four-axis review under the existing consent boundary, not the new reviewer judging its own unreleased code. Follow review-chain and retry approvals exactly.
- [ ] Prepare `/pr` only. Disclose SDK runtime dependency growth, both ADR supersessions, `/handoff` removal, tested versions, remaining version-drift limitations, and the pending human checkpoint.
- [ ] Human release checkpoint, not agent execution: publish/install the reviewed successor, then run `prism-review sdk --json` and `prism-review doctor --json` from the independent consumer with the human's valid model/profile/provider prerequisites. Require external Core/adapter provenance and doctor `GO`; authentication remains unprobed. OCR cutover is still a separate approval.

## Plan self-review ledger

- Dependency ownership and exact range: Tasks 1–2.
- Missing/version/API diagnostics and credential-free doctor: Tasks 2–3.
- Installer SDK verification: Task 4.
- Actual package resolution, positive readiness and incompatible SDK failures: Task 6.
- Minimum/0.85.1/newer compatibility evidence and lock replay: Task 6.
- External trust, OCR and human release checkpoint: global constraints, Tasks 3/6 and final verification.
- Approved capability removal with history and safety preserved: Task 5 and ADR-0111.
- Issue provenance: all earlier logical commits use `--refs 535`; Task 6 is the sole `--fixes 535` recipe. Cleanup adds no second closing reference.
- Draft checks: 30 JavaScript/Bash code blocks passed syntax checks in their stated module/async context; seven structured commit recipes passed the exact issue-provenance check; no unfinished-content markers were found. These are plan checks, not implementation test results.
