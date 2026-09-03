# Prism Review Authority Bridge Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Add immutable criteria receipts, deterministic exact-HEAD check receipts, review-chain version two, trusted PHP/web quality execution, authoritative installed-package review orchestration, and dual-read PR preflight without switching the normal OCR workflow.

**Architecture:** Keep the existing ad hoc reviewer and OCR/version-one workflow intact. Add a separate authority layer beneath `prism-review`: project-private managed evidence, protected-base adapter identity resolution, an installed-adapter quality protocol, and engine-authored version-two chain receipts. Only an installed Core package outside the reviewed repository can run authority commands; ordinary `prism-review review staged|commit|branch|path` calls remain non-authoritative.

**Tech Stack:** Node.js 24 CommonJS, Pi SDK `>=0.84.1 <0.85.0`, Git object plumbing, Semgrep `>=1.173.0 <2.0.0`, PHP 8.5+, Pest 5, and the existing `prism-tool` launcher contracts.

**Originating issue:** none

## Global constraints

- This stage does not switch any normal workflow to the new authority and does not remove OCR.
- Authoritative commands must fail unless Core resolves from a stable installed package outside the reviewed repository.
- If the active adapter is inside the reviewed repository, policy and skill bytes come from the protected base; executable quality behavior comes from a separately installed adapter outside the repository whose package identity and exact version match protected-base declarations.
- Review profiles contain no commands; Core remains language-agnostic and the adapter owns stack tests, lint, coverage, build checks, browser checks, and locked-dependency audits.
- Starting a check must atomically publish `RUNNING` before any gate executes, immediately invalidating every older `PASS`.
- Criteria, checks, and chain records use bounded UTF-8, no-follow descriptor reads, inode checks, mode-0700 engine directories, mode-0600 files, atomic publication, and directory synchronization.
- Every eligible changed text blob and full diff reaches all four axes; byte exposure proves delivery, not comprehension.
- A complete initial segment covers the attested base through HEAD; repair segments are continuous from the prior reviewed HEAD and expose every repair-delta text blob on all four axes.
- Inconclusive attempts may write bounded diagnostics but never a valid chain segment.
- Exact same-HEAD reuse requires exact matching snapshot, criteria, check, Core, adapter, profile, policy, skill, provider, model, and reasoning identities.
- Version-one and recognized obsolete review state are `LEGACY`, never `ABSENT`; safe legacy replacement occurs only after a successful authorized `--new-initial` review, while unsafe state is never overwritten.
- Standalone `/pr` cannot select criteria, run checks, authorize repair, migrate state, or merge chain versions.
- Reports and receipts must not retain raw source, full diffs, prompts, model transcripts, credentials, package paths, temporary paths, or unbounded gate logs.
- Production exposes no fake runner, fixture provider, model override, module-path override, or test preload option and strips inherited `NODE_OPTIONS` and `NODE_PATH`.
- No new runtime dependency is permitted; the Pi peer range remains `>=0.84.1 <0.85.0`.
- Push, pull-request creation, merge, package publication, and package installation remain human-owned.
- Every new or modified `.js`, `.ts`, or `.sh` file must retain the project-managed RCS header and final vim modeline.

## Stable interfaces and record locations

The implementation uses these project-private paths beneath the reviewed repository:

```text
.pi/prism-tool/code-review/criteria.json
.pi/prism-tool/code-review/check.json
.pi/prism-tool/code-review/review-chain.json
.pi/prism-tool/code-review/review-attempt.json
```

`review-chain.json` is deliberately shared with version one so dual-read inspection can classify a valid schema-one record as `LEGACY` and atomically replace it only after a successful `--new-initial` attempt.

The authority modules expose these CommonJS interfaces:

```javascript
// review-state.js
const REVIEW_STATE = {ABSENT: 'ABSENT', VALID: 'VALID', LEGACY: 'LEGACY', UNSAFE: 'UNSAFE'};
function authorityPath(projectRoot, filename) {}
function inspectAuthorityRecord({projectRoot, filename, limit, parse}, context = {}) {}
function publishAuthorityRecord({projectRoot, filename, limit, record, parse}, context = {}) {}

// criteria.js
function inspectCriteria(context = {}) {}
function recordCriteria(input, context = {}) {}
function verifyCriteria(expected, context = {}) {}
function criteriaDigest(record) {}

// quality-provider.js
function protectedAdapterIdentity(options) {}
function resolveQualityProvider(options) {}
function validateQualityReport(value, expected) {}

// check.js
async function runDeterministicCheck(input, context = {}) {}
function inspectCheck(context = {}) {}
function verifyCheck(expected, context = {}) {}
function checkDigest(record) {}

// criteria-tools.js
function createCriteriaTools(criteria) {}

// review-chain-v2.js
function inspectReviewChainV2(context = {}) {}
function selectReviewOperation(expected, context = {}) {}
function recordReviewAttempt(input, context = {}) {}
function verifyReviewChainV2(expected, context = {}) {}
function reviewChainDigest(record) {}

// authority.js
async function runAuthoritativeReview(input, context = {}) {}
function inspectAuthorityReadiness(input, context = {}) {}
```

The PHP/web adapter handler adds exactly one operation:

```javascript
async function runQualityProvider(options) {}
```

Its closed result has this shape; Core rejects unknown keys, duplicate or missing gate IDs, invalid statuses, oversized values, unexpected commands, and mismatched package identity:

```json
{
  "schemaVersion": 1,
  "provider": {
    "id": "php-web-quality",
    "packageName": "@kyaulabs/prism-php-web",
    "packageVersion": "0.4.3",
    "protocolVersion": 1
  },
  "status": "PASS",
  "gates": [
    {
      "id": "php-web.php-syntax",
      "status": "PASS",
      "command": ["php", "-l", "backend/example.php"],
      "tools": [{"id": "php", "version": "8.5.0"}],
      "stdout": {"bytes": 31, "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
      "stderr": {"bytes": 0, "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},
      "artifacts": []
    }
  ]
}
```

The exact gate IDs are:

```text
Core:
core.repository-clean
core.diff-check
core.markdown
core.conflict-markers
core.harness-validation
core.semgrep

PHP/web adapter:
php-web.php-syntax
php-web.php-cs-fixer
php-web.stylelint
php-web.eslint
php-web.typescript
php-web.playwright-list
php-web.pest-coverage
php-web.changed-file-coverage
php-web.node-tests
php-web.shell-tests
php-web.composer-audit
php-web.npm-audit
```

Optional gates remain present with status `SKIPPED` and a fixed applicability code; they are never omitted. `PASS` and valid `SKIPPED` results satisfy completeness. Any `FAIL`, timeout, overflow, malformed result, missing gate, changed Git identity, or artifact mismatch makes the check non-reusable.

---

### Task 1: Project-private managed authority records

**Files:**

- Create: `docs/plans/2026-09-02-prism-review-authority-bridge.md`
- Create: `packages/prism-core/scripts/prism-review/review-state.js`
- Modify: `packages/prism-core/scripts/prism-tool/managed-record.js`
- Create: `tests/Node/prism-review-state.test.js`
- Create: `tests/Node/prism-tool-managed-record.test.js`

**Interfaces:**

- Consumes: `inspectManagedRecord()` and `publishManagedRecord()` from `scripts/prism-tool/managed-record.js`.
- Produces: `REVIEW_STATE`, `authorityPath()`, `inspectAuthorityRecord()`, and `publishAuthorityRecord()` for every later receipt task.

- [x] **Step 1: Write the failing managed-state tests**

Add tests that create a fixture repository and assert all of these observable behaviors through the exported functions: nested `.pi/prism-tool/code-review` directories are created as `0700`; records are `0600`; publication survives an existing valid record; a symlink at any engine-owned path is `UNSAFE`; oversized, invalid-UTF-8, malformed JSON, wrong-mode, swapped-inode, and interrupted-publication fixtures never become `VALID`; and a failed replacement restores the pinned prior record.

```javascript
const detail = inspectAuthorityRecord({
    projectRoot,
    filename: 'criteria.json',
    limit: 131072,
    parse: (value) => value,
});
assert.equal(detail.state, REVIEW_STATE.ABSENT);
publishAuthorityRecord({
    projectRoot,
    filename: 'criteria.json',
    limit: 131072,
    record: {schemaVersion: 1, disposition: 'NONE_DECLARED'},
    parse: (value) => value,
});
assert.equal(fs.statSync(path.join(projectRoot, '.pi/prism-tool/code-review')).mode & 0o777, 0o700);
assert.equal(fs.statSync(path.join(projectRoot, '.pi/prism-tool/code-review/criteria.json')).mode & 0o777, 0o600);
```

- [x] **Step 2: Run the focused tests to verify Red**

Run: `node --test tests/Node/prism-review-state.test.js tests/Node/prism-tool-managed-record.test.js`

Expected: FAIL because `review-state.js` and recursive contained-directory creation do not exist.

- [x] **Step 3: Implement the managed-state boundary**

Implement `ensureManagedDirectory(directory, trustedRoot, context)` in `managed-record.js`. Walk each relative component with `lstatSync`, reject symlinks/non-directories/escapes, create only absent descendants with `0700`, pin each opened directory with `O_DIRECTORY|O_NOFOLLOW`, apply `fchmodSync(0700)`, and `fsyncSync` before continuing. Export it without changing existing global consent semantics.

Implement `review-state.js` as a thin fixed-root wrapper. Canonicalize `projectRoot`, require `filename` to be one of `criteria.json`, `check.json`, `review-chain.json`, or `review-attempt.json`, establish `.pi/prism-tool/code-review` through `ensureManagedDirectory`, and call the existing managed-record functions with `context.managedPath`. Map a successful parsed record to `VALID`; preserve `ABSENT` and `UNSAFE` exactly. Never accept a caller-supplied absolute state path.

- [x] **Step 4: Run focused and neighboring tests to verify Green**

Run: `node --test tests/Node/prism-review-state.test.js tests/Node/prism-tool-managed-record.test.js tests/Node/prism-tool-consent.test.js`

Expected: PASS with the existing consent tests unchanged.

- [x] **Step 5: Create the commit**

```bash
git add docs/plans/2026-09-02-prism-review-authority-bridge.md packages/prism-core/scripts/prism-review/review-state.js packages/prism-core/scripts/prism-tool/managed-record.js tests/Node/prism-review-state.test.js tests/Node/prism-tool-managed-record.test.js
prism-tool commit create --type feat --scope review --subject "add private authority record boundary"
```

### Task 2: Immutable criteria-source receipts

**Files:**

- Create: `packages/prism-core/scripts/prism-review/criteria.js`
- Create: `tests/Node/prism-review-criteria.test.js`

**Interfaces:**

- Consumes: Task 1 authority records, `digestJson()`, and Git object plumbing.
- Produces: `inspectCriteria()`, `recordCriteria()`, `verifyCriteria()`, and `criteriaDigest()`.

- [ ] **Step 1: Write failing criteria behavior tests**

Exercise the public module against real temporary Git repositories. Cover a declared record with `SPEC` and `PLAN` sources, explicit `NONE_DECLARED`, a missing record, duplicate roles/paths, uncommitted and sensitive paths, merge/non-commit revisions, modified worktree bytes, missing blobs, invalid UTF-8, source files over 256 KiB, aggregate sources over 1 MiB, branch drift, malformed records, and a Git object whose bytes no longer match the stored SHA-256.

Use this exact declared input and assert that the record stores identities rather than summaries or source text:

```javascript
const recorded = recordCriteria({
    disposition: 'DECLARED',
    sources: [
        {role: 'SPEC', commit: head, path: 'docs/specs/change-spec.md'},
        {role: 'PLAN', commit: head, path: 'docs/plans/change.md'},
    ],
}, {projectRoot});
assert.deepEqual(Object.keys(recorded), [
    'schemaVersion', 'kind', 'branch', 'disposition', 'sources', 'path', 'digest',
]);
assert.deepEqual(Object.keys(recorded.sources[0]), [
    'role', 'commit', 'path', 'blobOid', 'byteCount', 'sha256',
]);
assert.doesNotMatch(JSON.stringify(recorded), /accepted criterion fixture/);
```

- [ ] **Step 2: Run the criteria tests to verify Red**

Run: `node --test tests/Node/prism-review-criteria.test.js`

Expected: FAIL because `criteria.js` does not exist.

- [ ] **Step 3: Implement criteria capture and replay**

Use a closed schema:

```javascript
{
    schemaVersion: 1,
    kind: 'criteria',
    branch,
    disposition: 'DECLARED' | 'NONE_DECLARED',
    sources: [{role: 'SPEC' | 'PLAN' | 'ISSUE' | 'CONTEXT', commit, path, blobOid, byteCount, sha256}],
}
```

Resolve every supplied revision with `git rev-parse --verify <sha>^{commit}`; resolve the exact path with `git ls-tree -z <commit> -- <path>`; require one regular blob; read with `git cat-file blob <oid>` under the existing 256-KiB per-source and 1-MiB aggregate limits; reject sensitive paths through `sensitivePathMatch`; and store only identity metadata. Sort by role then path, reject duplicates, require one or more sources for `DECLARED`, and require zero sources for `NONE_DECLARED`. `verifyCriteria()` must reread every immutable blob, recompute its digest and byte count, and require the current branch to match. Return `digestJson(record)` separately as `digest` rather than making a self-referential field.

- [ ] **Step 4: Run criteria and snapshot tests to verify Green**

Run: `node --test tests/Node/prism-review-criteria.test.js tests/Node/prism-review-snapshot.test.js`

Expected: PASS, including worktree edits that do not alter committed criteria authority.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-review/criteria.js tests/Node/prism-review-criteria.test.js
prism-tool commit create --type feat --scope review --subject "record immutable review criteria"
```

### Task 3: Protected-base adapter identity and external quality-provider discovery

**Files:**

- Create: `packages/prism-core/scripts/prism-review/quality-provider.js`
- Modify: `packages/prism-core/scripts/prism-review/profile.js`
- Modify: `packages/prism-core/scripts/prism-tool/discovery.js`
- Create: `tests/Node/prism-review-quality-provider.test.js`
- Modify: `tests/Node/prism-review-profile.test.js`
- Modify: `tests/Node/prism-tool-discovery.test.js`

**Interfaces:**

- Consumes: active adapter registration, protected-base Git blobs, package manifests, and handler loading.
- Produces: `protectedAdapterIdentity()`, `resolveQualityProvider()`, and `validateQualityReport()`.

- [ ] **Step 1: Write failing provider-boundary tests**

Build fixtures with one active adapter inside the reviewed repository and a second extracted package outside it. Assert that protected-base `package.json`, `toolchain.json`, review profile, and skills determine the expected package/version; the external package must have the same name and exact version; its canonical root must be outside the repository; its handler must export `runQualityProvider`; and its contract must validate before loading executable code. Reject checkout-only providers, current-HEAD version substitution, symlink escapes, mismatched package versions, multiple candidates, missing operations, altered handler paths, unknown report fields, duplicate/missing gates, raw output strings, and values above limits.

```javascript
const resolved = resolveQualityProvider({
    repositoryRoot,
    coreRoot: installedCore,
    protectedBase: baseSha,
    registration: activeRegistration,
    resolvePackage: () => externalAdapter,
});
assert.equal(resolved.identity.packageName, '@fixture/adapter');
assert.equal(resolved.identity.packageVersion, '1.2.3');
assert.equal(resolved.identity.sourceClass, 'INSTALLED_EXTERNAL');
assert.equal(typeof resolved.run, 'function');
```

- [ ] **Step 2: Run provider tests to verify Red**

Run: `node --test tests/Node/prism-review-quality-provider.test.js tests/Node/prism-review-profile.test.js tests/Node/prism-tool-discovery.test.js`

Expected: FAIL because the quality-provider operation and protected-base identity reader are absent.

- [ ] **Step 3: Implement closed provider discovery**

Read the active adapter's committed package manifest and toolchain declaration from `protectedBase` using the same bounded Git-blob rules as protected review profiles. Resolve the installed package from Node's package-resolution roots anchored at the installed Core package; permit a function injection only in the internal module options used by tests, never through CLI flags or environment variables. Canonicalize the resolved package directory, reject roots inside the reviewed repository, call `registrationFor()`, require exact package name/version/protocol parity with protected base, then load the handler and expose only its bound `runQualityProvider` method.

Validate quality reports as plain closed JSON. Require exactly the provider's declared gate-ID set, sorted and unique; permit only `PASS`, `FAIL`, and `SKIPPED`; require `status: PASS` only when all gates are valid `PASS`/`SKIPPED`; cap each stdout/stderr byte count at 1 MiB and every artifact at 256 KiB; require SHA-256 fields; and reject fields containing raw output, absolute paths, control characters, or credentials.

- [ ] **Step 4: Run provider and discovery tests to verify Green**

Run: `node --test tests/Node/prism-review-quality-provider.test.js tests/Node/prism-review-profile.test.js tests/Node/prism-tool-discovery.test.js`

Expected: PASS while existing bootstrap and automation handler discovery remains compatible.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-review/quality-provider.js packages/prism-core/scripts/prism-review/profile.js packages/prism-core/scripts/prism-tool/discovery.js tests/Node/prism-review-quality-provider.test.js tests/Node/prism-review-profile.test.js tests/Node/prism-tool-discovery.test.js
prism-tool commit create --type feat --scope review --subject "resolve trusted adapter quality providers"
```

### Task 4: PHP/web deterministic quality-provider operation

**Files:**

- Create: `packages/prism-php-web/scripts/toolchain/quality-provider.js`
- Modify: `packages/prism-php-web/scripts/prism-tool-adapter.js`
- Create: `tests/Node/prism-tool-php-web-quality.test.js`
- Modify: `tests/Node/toolchain-contract.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`

**Interfaces:**

- Consumes: the adapter's validated `toolchain.json`, `resolveTool()`, Core-supplied bounded command/tool/server callbacks, and immutable `baseSha`/`headSha`.
- Produces: `runQualityProvider(options)` and the exact twelve-gate report defined above.

- [ ] **Step 1: Write failing adapter operation tests**

Use a fixture project and callback spies; do not spawn real linters in unit tests. Assert exact command arrays and order, all twelve IDs, fixed `SKIPPED` applicability codes, `--coverage --min=80`, changed-file coverage input derived from `git diff --name-only <base>..<head> -- '*.php'`, browser supervision through the supplied server callback, Node tests only when `test:node` or `test:plugin` exists, every `tests/Shell/*_test.sh` invocation through `bash`, and locked Composer/npm audits. Add failures for nonzero status, timeout, output overflow, missing executable, malformed artifact, and changed base/head.

```javascript
const report = await runQualityProvider({
    projectRoot,
    baseSha,
    headSha,
    packageRoot: ADAPTER_ROOT,
    runCommand: fixtureRunCommand,
    runTool: fixtureRunTool,
    runServer: fixtureRunServer,
    readArtifact: fixtureReadArtifact,
});
assert.deepEqual(report.gates.map(({id}) => id), PHP_WEB_QUALITY_GATES);
assert.equal(report.gates.find(({id}) => id === 'php-web.pest-coverage').command.join(' '),
    'prism-tool server run @kyaulabs/prism-php-web:browser-fixture --tool pest -- --coverage --min=80');
```

- [ ] **Step 2: Run the adapter tests to verify Red**

Run: `node --test tests/Node/prism-tool-php-web-quality.test.js tests/Node/toolchain-contract.test.js tests/Node/toolchain-packaging.test.js`

Expected: FAIL because the adapter handler has no `runQualityProvider` operation.

- [ ] **Step 3: Implement the shared PHP/web gate operation**

Implement a data-driven gate list with the exact IDs from the stable interface section. The operation must invoke only supplied Core callbacks, hash bounded stdout/stderr immediately, hash `tests/coverage.xml` before returning coverage success, and return no raw logs. Discover applicable tracked files through bounded `git ls-files -z`, never shell glob expansion. Keep PHP syntax, formatter, lint, TypeScript, Playwright-list, Pest/server lifecycle, changed-file coverage, Node, shell, Composer audit, and npm audit behavior in this adapter module. Capture actual tool versions from the callback metadata. Re-read branch/base/HEAD through the callback before returning and force the report to `FAIL` on drift.

Export only `runQualityProvider` through `prism-tool-adapter.js`; do not put commands in `config/prism-review.json` or Core.

- [ ] **Step 4: Run adapter, contract, and package tests to verify Green**

Run: `node --test tests/Node/prism-tool-php-web-quality.test.js tests/Node/toolchain-contract.test.js tests/Node/toolchain-packaging.test.js`

Expected: PASS and the packed adapter inventory contains `scripts/toolchain/quality-provider.js`.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-php-web/scripts/toolchain/quality-provider.js packages/prism-php-web/scripts/prism-tool-adapter.js tests/Node/prism-tool-php-web-quality.test.js tests/Node/toolchain-contract.test.js tests/Node/toolchain-packaging.test.js
prism-tool commit create --type feat --scope php-web --subject "provide deterministic stack quality gates"
```

### Task 5: Exact-HEAD deterministic check receipts

**Files:**

- Create: `packages/prism-core/scripts/prism-review/check.js`
- Create: `packages/prism-core/scripts/prism-review/core-quality.js`
- Modify: `packages/prism-core/scripts/prism-tool/server.js`
- Create: `tests/Node/prism-review-check.test.js`
- Create: `tests/Node/prism-review-core-quality.test.js`
- Modify: `tests/Node/prism-tool-server.test.js`

**Interfaces:**

- Consumes: Task 1 managed records, Task 3 provider resolution, Task 4 adapter operation, Core tool resolution, and `superviseServer()`.
- Produces: `runDeterministicCheck()`, `inspectCheck()`, `verifyCheck()`, `checkDigest()`, and reusable bounded callbacks for trusted providers.

- [ ] **Step 1: Write failing RUNNING/PASS and Core-gate tests**

Assert that `RUNNING` is durably visible before the first callback; a prior `PASS` becomes unusable immediately; SIGINT-style rejection, timeout, failed Semgrep, failed dependency audit, partial provider output, malformed output, missing gates, output overflow, changed branch/base/HEAD, and dirty worktree all prevent reusable `PASS`; and a successful run binds the exact repository and provider identities. Assert that no persisted receipt contains the output canary.

```javascript
let observed;
const result = await runDeterministicCheck({baseRef: 'origin/develop'}, {
    projectRoot,
    runCoreQuality: async () => {
        observed = inspectCheck({projectRoot});
        return passingCoreReport;
    },
    resolveQualityProvider: () => passingProvider,
});
assert.equal(observed.record.status, 'RUNNING');
assert.equal(result.status, 'PASS');
assert.equal(verifyCheck({branch, baseRef: 'origin/develop', baseSha, headSha}, {projectRoot}).digest,
    result.digest);
```

- [ ] **Step 2: Run check tests to verify Red**

Run: `node --test tests/Node/prism-review-check.test.js tests/Node/prism-review-core-quality.test.js tests/Node/prism-tool-server.test.js`

Expected: FAIL because deterministic check orchestration is absent.

- [ ] **Step 3: Implement check orchestration and Core gates**

Before invoking any gate, derive branch, protected target, `baseSha`, and `HEAD`; require a clean worktree; create a 32-hex attempt ID; and publish this closed RUNNING record:

```javascript
{
    schemaVersion: 1,
    kind: 'check',
    attemptId,
    status: 'RUNNING',
    branch,
    baseRef,
    baseSha,
    headSha,
    core,
    adapter,
    gates: [],
}
```

Run the six fixed Core gates, then the trusted adapter provider. Core commands are exact argv arrays: clean repository inspection; `git diff --check <baseSha>..<headSha>`; packaged Markdown lint from `baseSha`; conflict-marker inspection excluding frozen ADR/plan examples; packaged `validate-harness.sh` when present; and Semgrep with `.semgrep/kyaulabs.yml`, `p/php`, `p/secrets`, `p/javascript`, `--error`, `--metrics off`, and `--disable-version-check`. Resolve Semgrep through the mandatory external-tool contract and capture its actual version. Use `SKIPPED` only for fixed documented applicability conditions.

After every gate, revalidate branch, base ref SHA, HEAD, and clean status. Publish `PASS` only after all IDs and artifacts validate; otherwise publish bounded `FAIL` diagnostic state. `verifyCheck()` accepts only `PASS`, exact expected identities, and a successful replay of the closed schema. Export a lower-level server runner from `server.js` that accepts an already validated stable contract/handler; keep the existing CLI behavior unchanged.

- [ ] **Step 4: Run check, provider, and server tests to verify Green**

Run: `node --test tests/Node/prism-review-check.test.js tests/Node/prism-review-core-quality.test.js tests/Node/prism-review-quality-provider.test.js tests/Node/prism-tool-php-web-quality.test.js tests/Node/prism-tool-server.test.js`

Expected: PASS with interrupted attempts retaining `RUNNING` or `FAIL`, never the older `PASS`.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-review/check.js packages/prism-core/scripts/prism-review/core-quality.js packages/prism-core/scripts/prism-tool/server.js tests/Node/prism-review-check.test.js tests/Node/prism-review-core-quality.test.js tests/Node/prism-tool-server.test.js
prism-tool commit create --type feat --scope review --subject "publish exact-head check receipts"
```

### Task 6: Immutable criteria exposure in the requirement axis

**Files:**

- Create: `packages/prism-core/scripts/prism-review/criteria-tools.js`
- Modify: `packages/prism-core/scripts/prism-review/orchestrator.js`
- Modify: `packages/prism-core/scripts/prism-review/session-runner.js`
- Modify: `packages/prism-core/scripts/prism-review/schema.js`
- Create: `tests/Node/prism-review-criteria-tools.test.js`
- Modify: `tests/Node/prism-review-orchestrator.test.js`
- Modify: `tests/Node/prism-review-session.test.js`

**Interfaces:**

- Consumes: a verified criteria record and immutable Git blobs from Task 2.
- Produces: `createCriteriaTools()` plus a criteria-exposure ledger included only in authoritative requirement-axis evidence.

- [ ] **Step 1: Write failing criteria-delivery tests**

Assert chunked `read_criteria` delivery by `{sourceDigest, offset, limit}`, exact interval union, UTF-8 byte offsets, refusal of unknown sources/ranges, and completeness only after every declared source byte is delivered. Assert `NONE_DECLARED` needs no source tool calls. Run an authoritative attempt fixture where the requirement axis submits early and require `INCONCLUSIVE`; prove other axes cannot call `read_criteria`; prove the requirement-axis prompt receives source identities but reports retain no source bytes.

```javascript
const set = createCriteriaTools(verifiedCriteria);
let offset = 0;
while (offset < verifiedCriteria.sources[0].byteCount) {
    const chunk = await set.tools.read_criteria.execute('read', {
        sourceDigest: verifiedCriteria.sources[0].sha256,
        offset,
        limit: 7,
    });
    offset = chunk.nextOffset;
}
assert.equal(set.ledger.isComplete(), true);
```

- [ ] **Step 2: Run criteria exposure tests to verify Red**

Run: `node --test tests/Node/prism-review-criteria-tools.test.js tests/Node/prism-review-orchestrator.test.js tests/Node/prism-review-session.test.js`

Expected: FAIL because criteria tools and authoritative prerequisites are absent.

- [ ] **Step 3: Implement requirement-authority delivery**

Create a tool and interval ledger parallel to `snapshot-tools.js`, with a 32-KiB maximum chunk and closed schema. Extend `runReviewAttempt()` with optional `criteria`; when present, mark the report authoritative only if requested by its trusted caller, add `read_criteria` only to the requirement-coverage session, add source identities and disposition to hostile evidence, and reject submission until both snapshot and criteria ledgers are complete. Add `criteriaExposure` containing role, commit, path, blob OID, byte count, digest, and `EXPOSED`/`NONE_DECLARED`, but never raw bytes. Keep every existing ad hoc call's report byte-for-byte schema-compatible with `authoritative: false`.

- [ ] **Step 4: Run exposure, orchestration, and session tests to verify Green**

Run: `node --test tests/Node/prism-review-criteria-tools.test.js tests/Node/prism-review-orchestrator.test.js tests/Node/prism-review-session.test.js tests/Node/prism-review-e2e.test.js`

Expected: PASS, including all existing ad hoc report assertions.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-review/criteria-tools.js packages/prism-core/scripts/prism-review/orchestrator.js packages/prism-core/scripts/prism-review/session-runner.js packages/prism-core/scripts/prism-review/schema.js tests/Node/prism-review-criteria-tools.test.js tests/Node/prism-review-orchestrator.test.js tests/Node/prism-review-session.test.js
prism-tool commit create --type feat --scope review --subject "expose immutable criteria to requirement review"
```

### Task 7: Engine-authored review-chain version two

**Files:**

- Create: `packages/prism-core/scripts/prism-review/review-chain-v2.js`
- Modify: `packages/prism-core/scripts/prism-tool/review-chain.js`
- Create: `tests/Node/prism-review-chain-v2.test.js`
- Modify: `tests/Node/prism-tool-review-chain.test.js`

**Interfaces:**

- Consumes: Task 1 managed state, normalized findings, validated review reports, criteria/check digests, package/profile/policy/resource identities, and existing version-one validation.
- Produces: version-two inspect/select/record/verify functions and explicit `ABSENT`, `VALID`, `LEGACY`, `UNSAFE` states.

- [ ] **Step 1: Write failing chain replay tests**

Cover one complete initial segment, a continuous repair, Advisory preservation, confirmed Blocking state, confirmed closure, duplicate findings, invalid closure targets, changed immutable identities, incomplete axes/lenses/exposure, malformed verifier decisions, stale base/head, and record-size limits. Write a valid schema-one fixture and assert `LEGACY`; malformed and symlinked state must be `UNSAFE`; missing state alone is `ABSENT`. Attempt safe legacy replacement and inject publication failure to prove schema one remains intact.

Assert this top-level closed shape:

```javascript
assert.deepEqual(Object.keys(record), [
    'schemaVersion', 'kind', 'branch', 'baseRef', 'baseSha', 'headSha',
    'criteriaDigest', 'segments', 'findings', 'openBlocking',
]);
assert.equal(record.schemaVersion, 2);
assert.deepEqual(record.segments[0].range, {from: baseSha, to: headSha});
assert.deepEqual(record.segments[0].axes.map(({id, status}) => ({id, status})), [
    {id: 'tooling-style', status: 'COMPLETE'},
    {id: 'structural-smells', status: 'COMPLETE'},
    {id: 'requirement-coverage', status: 'COMPLETE'},
    {id: 'static-security', status: 'COMPLETE'},
]);
```

- [ ] **Step 2: Run chain tests to verify Red**

Run: `node --test tests/Node/prism-review-chain-v2.test.js tests/Node/prism-tool-review-chain.test.js`

Expected: FAIL because version-two replay and legacy classification do not exist.

- [ ] **Step 3: Implement strict version-two validation and replay**

Export the existing version-one record validator without relaxing it. In `review-chain-v2.js`, parse the shared path as follows: no file is `ABSENT`; a strictly valid schema-one record is `LEGACY`; a strictly valid schema-two record is `VALID`; every other present state is `UNSAFE`.

Each engine-authored segment must bind range/base, snapshot/manifest/diff, criteria/check, Core/adapter package, plan/profile/policy/resource/skill, model provider/id/reasoning/context, axes, complete byte and criteria exposure, lenses, exemptions, findings, verifier decisions, closure decisions, and optional exact-reuse metadata. Recompute findings and open Blocking fingerprints by replay; do not trust duplicated aggregate arrays. Require initial `from === baseSha`; require each repair `from === prior.to`; require constant base and criteria authority; require each segment's check receipt at its exact `to`; and require Git ancestry. Record no source, diff, prompt, transcript, or raw gate output.

`recordReviewAttempt()` accepts only a validated in-memory report from the engine, never a path or model-authored segment file. Publish only complete PASS/BLOCKING reports; diagnostics go to `review-attempt.json`. For `--new-initial`, retain valid legacy bytes until the complete replacement record has been fully validated and the atomic publication succeeds.

- [ ] **Step 4: Run version-one and version-two chain tests to verify Green**

Run: `node --test tests/Node/prism-review-chain-v2.test.js tests/Node/prism-tool-review-chain.test.js tests/Node/prism-tool-code-review.test.js`

Expected: PASS and the OCR chain command continues to write and verify schema one.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-review/review-chain-v2.js packages/prism-core/scripts/prism-tool/review-chain.js tests/Node/prism-review-chain-v2.test.js tests/Node/prism-tool-review-chain.test.js
prism-tool commit create --type feat --scope review --subject "add replayable review chain version two"
```

### Task 8: Installed-package initial review and exact same-HEAD reuse

**Files:**

- Create: `packages/prism-core/scripts/prism-review/authority.js`
- Modify: `packages/prism-core/scripts/prism-review/orchestrator.js`
- Create: `tests/Node/prism-review-authority.test.js`
- Modify: `tests/Node/prism-review-orchestrator.test.js`

**Interfaces:**

- Consumes: Tasks 2, 3, 5, 6, and 7 plus `classifyTrustRoot()`, snapshot/profile/session orchestration.
- Produces: `runAuthoritativeReview()` and `inspectAuthorityReadiness()` for initial review and exact reuse.

- [ ] **Step 1: Write failing authority and reuse tests**

Use extracted Core/adapter fixtures outside a separate Git repository. Assert local Core rejection before model calls, missing/mismatched external adapter rejection, missing criteria, missing/stale/non-PASS check, dirty tree, changed target/base/HEAD, complete initial PASS, initial BLOCKING recorded and finalization-blocking, Inconclusive diagnostics without a segment, and exact same-HEAD reuse without calling the model. Change each identity independently—check, criteria, Core bytes/version, adapter bytes/version, profile, policy, skill, model, reasoning, base, HEAD, and snapshot—and assert no reuse.

```javascript
const first = await runAuthoritativeReview({
    operation: 'initial',
    baseRef: 'origin/develop',
    newInitial: false,
}, fixtureContext);
assert.equal(first.authoritative, true);
assert.equal(first.reused, false);
const calls = fixtureContext.sessionCalls;
const second = await runAuthoritativeReview({
    operation: 'initial',
    baseRef: 'origin/develop',
    newInitial: false,
}, fixtureContext);
assert.equal(second.reused, true);
assert.equal(fixtureContext.sessionCalls, calls);
```

- [ ] **Step 2: Run authority tests to verify Red**

Run: `node --test tests/Node/prism-review-authority.test.js tests/Node/prism-review-orchestrator.test.js`

Expected: FAIL because the authoritative coordinator is absent.

- [ ] **Step 3: Implement guarded initial orchestration**

Canonicalize Core and repository first and require `eligibleForAuthority === true`. Derive branch target, `baseRef`, exact base SHA, and HEAD from Git; require clean state; verify criteria and check receipts; load Core policy from installed Core; load active adapter policy from protected base when local; resolve the matching external adapter quality identity; and resolve the exact active Pi model. Build one branch snapshot from base SHA through HEAD.

Before spending a model attempt, inspect version-two state. Return exact reuse only when the current valid segment and every bound digest/identity exactly match. Otherwise require `ABSENT`, or `LEGACY` with explicit `newInitial: true`; then run all four axes and verifier work once. Write a bounded attempt diagnostic for Inconclusive. For complete PASS/BLOCKING, call Task 7 directly with the in-memory report and return the persisted receipt. Never accept an input JSON segment.

- [ ] **Step 4: Run authority, profile, snapshot, and trust tests to verify Green**

Run: `node --test tests/Node/prism-review-authority.test.js tests/Node/prism-review-orchestrator.test.js tests/Node/prism-review-profile.test.js tests/Node/prism-review-snapshot.test.js tests/Node/prism-review-cli.test.js`

Expected: PASS, with checkout Core unable to author a chain.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-review/authority.js packages/prism-core/scripts/prism-review/orchestrator.js tests/Node/prism-review-authority.test.js tests/Node/prism-review-orchestrator.test.js
prism-tool commit create --type feat --scope review --subject "guard installed-package review authority"
```

### Task 9: Continuous repair review and closure verification

**Files:**

- Modify: `packages/prism-core/scripts/prism-review/authority.js`
- Modify: `packages/prism-core/scripts/prism-review/orchestrator.js`
- Modify: `packages/prism-core/scripts/prism-review/schema.js`
- Modify: `packages/prism-core/scripts/prism-review/findings.js`
- Modify: `tests/Node/prism-review-authority.test.js`
- Modify: `tests/Node/prism-review-orchestrator.test.js`
- Modify: `tests/Node/prism-review-findings.test.js`

**Interfaces:**

- Consumes: a valid prior version-two chain, fresh exact-HEAD check, immutable criteria, and a bounded closure proposal.
- Produces: continuous repair segments with adversarial closure dispositions and directly affected test evidence.

- [ ] **Step 1: Write failing repair and closure tests**

Create a first segment with one confirmed Blocking finding, commit a repair, create a fresh check receipt, and propose this closed closure input:

```javascript
{
    schemaVersion: 1,
    closures: [{
        fingerprint: priorFingerprint,
        evidence: 'focused regression now passes',
        tests: [{path: 'tests/Node/example.test.js', gateId: 'php-web.node-tests'}],
    }],
}
```

Assert the repair snapshot starts at the prior reviewed HEAD; all four axes expose the entire delta; prior open Blocking findings, closure evidence, test identities, and current check evidence reach each axis and the closure verifier; only `CONFIRMED` closes a finding; `REJECTED`, `NEEDS_CONTEXT`, `INVALID_LOCATION`, missing tests, missing exposure, verifier failure, and uncertain Blocking become Inconclusive or keep the finding open as defined by the closed schema. Reject closure of Advisory findings, unknown/duplicate fingerprints, arbitrary absolute test paths, stale checks, changed criteria, and discontinuous Git history.

- [ ] **Step 2: Run repair tests to verify Red**

Run: `node --test tests/Node/prism-review-authority.test.js tests/Node/prism-review-orchestrator.test.js tests/Node/prism-review-findings.test.js tests/Node/prism-review-chain-v2.test.js`

Expected: FAIL because repair context and closure dispositions are not yet modeled.

- [ ] **Step 3: Implement repair and closure semantics**

Add a closed closure proposal validator and a terminating `submit_closures` schema with one disposition per proposed fingerprint: `CONFIRMED`, `REJECTED`, `NEEDS_CONTEXT`, or `INVALID_LOCATION`, each with bounded rationale. Use the existing false-positive/verifier policy resources in a fresh isolated session over the complete repair snapshot. Do not permit a closure model to raise severity or create findings. Require the named test path to be a safe tracked path and its gate ID to be present and successful in the current check receipt.

For repair operations, keep the original base and criteria digest, require `from === prior.headSha`, require a new exact-HEAD check, pass prior open Blocking findings and proposals as hostile evidence to every axis, and expose every repair entry on all axes. Append only after all axes, new-finding verification, and closure verification complete. Preserve unconfirmed open findings and all Advisory findings.

- [ ] **Step 4: Run repair and chain tests to verify Green**

Run: `node --test tests/Node/prism-review-authority.test.js tests/Node/prism-review-orchestrator.test.js tests/Node/prism-review-findings.test.js tests/Node/prism-review-chain-v2.test.js tests/Node/prism-review-session.test.js`

Expected: PASS with no incomplete repair able to advance the valid chain.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-review/authority.js packages/prism-core/scripts/prism-review/orchestrator.js packages/prism-core/scripts/prism-review/schema.js packages/prism-core/scripts/prism-review/findings.js tests/Node/prism-review-authority.test.js tests/Node/prism-review-orchestrator.test.js tests/Node/prism-review-findings.test.js
prism-tool commit create --type feat --scope review --subject "verify continuous review repairs"
```

### Task 10: Closed public bridge CLI

**Files:**

- Modify: `packages/prism-core/scripts/prism-review/cli.js`
- Modify: `packages/prism-core/scripts/prism-review/constants.js`
- Modify: `tests/Node/prism-review-cli.test.js`

**Interfaces:**

- Consumes: criteria, check, chain-v2, and authority modules.
- Produces: the deliberate dormant bridge commands without changing ad hoc command behavior.

- [ ] **Step 1: Write failing CLI grammar and dispatch tests**

Add tests for this exact grammar and reject reordered, duplicated, missing, relative-SHA, unknown, extra, or unsafe controls before dependencies run:

```text
prism-review criteria record --source ROLE:COMMIT:PATH [--source ROLE:COMMIT:PATH ...] --json
prism-review criteria none --json
prism-review criteria inspect --json
prism-review check --base-ref origin/develop|origin/main --json
prism-review chain inspect --json
prism-review chain verify --base-ref origin/develop|origin/main --json
prism-review review authoritative --base-ref origin/develop|origin/main --json
prism-review review authoritative --base-ref origin/develop|origin/main --new-initial --json
prism-review review repair --base-ref origin/develop|origin/main --closures RELATIVE_PATH --json
```

Assert checkout Core returns readiness failure for `criteria record`, `check`, and authoritative review, while read-only inspection reports explicit states. Assert closure files use bounded no-follow reads and cannot escape the repository. Existing ad hoc commands must retain their outputs and exit semantics.

- [ ] **Step 2: Run CLI tests to verify Red**

Run: `node --test tests/Node/prism-review-cli.test.js`

Expected: FAIL because the bridge grammar is not recognized.

- [ ] **Step 3: Implement the public CLI dispatch**

Extend `HELP` with the exact commands. Parse sources by splitting only the first two `:` separators, require uppercase closed roles, a full lowercase commit SHA, and a safe relative path. Require `--new-initial` only for authoritative initial replacement and `--closures` only for repair. Perform no inference or default requirement selection. Route authority mutations through `classifyTrustRoot()` before touching state. Render closed JSON with explicit command, status/outcome, authority eligibility, state/version, receipt digest, and bounded reason codes; do not render private paths or exception messages.

Keep internal callback injection available only through direct `main(argv, context)` tests. Do not add environment controls, fixture paths, model flags, retry flags, or public fake-provider switches.

- [ ] **Step 4: Run CLI and ad hoc e2e tests to verify Green**

Run: `node --test tests/Node/prism-review-cli.test.js tests/Node/prism-review-e2e.test.js`

Expected: PASS and every old ad hoc report remains non-authoritative.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-review/cli.js packages/prism-core/scripts/prism-review/constants.js tests/Node/prism-review-cli.test.js
prism-tool commit create --type feat --scope review --subject "expose closed authority bridge commands"
```

### Task 11: Dual-read pull-request preflight

**Files:**

- Modify: `packages/prism-core/scripts/prism-tool/pr.js`
- Modify: `packages/prism-core/scripts/prism-tool/code-review.js`
- Modify: `packages/prism-core/prompts/pr.md`
- Modify: `tests/Node/prism-tool-pr.test.js`
- Modify: `tests/Node/prism-tool-code-review.test.js`
- Modify: `tests/Shell/pr_command_test.sh`

**Interfaces:**

- Consumes: strict version-one verification and Task 7 strict version-two verification.
- Produces: one preflight result identifying version `1`, version `2`, or `ABSENT`, without combining evidence.

- [ ] **Step 1: Write failing dual-read preflight tests**

Exercise `pr preflight` and `pr review-preflight` with valid v1, valid v2, absent, stale v1, stale v2, open Blocking v1/v2, missing criteria/check for v2, valid schema-one state reported as legacy by v2 inspection, malformed state, and symlinked state. Assert one version is selected as a unit and fields never mix. Assert output includes `REVIEW_CHAIN_VERSION\t1|2` for valid state and `REVIEW_CHAIN\tABSENT` only for a missing file. `preflight` rejects absence; `review-preflight` may report absence but not legacy/unsafe/stale state.

Add prompt-contract cases for absent state with no v2 receipts, both exact valid v2 receipts, one partial receipt, stale receipts, and unsafe receipts. The no-receipt case must retain OCR/version-one recovery. Both exact receipts must select one installed `prism-review review authoritative` attempt. Partial, stale, or unsafe v2 evidence must stop rather than silently falling back. Valid v2 state must inspect Advisory findings with `prism-review chain inspect --json`; valid v1 state keeps `prism-tool code-review chain inspect --json`.

- [ ] **Step 2: Run PR and code-review tests to verify Red**

Run: `node --test tests/Node/prism-tool-pr.test.js tests/Node/prism-tool-code-review.test.js tests/Node/prism-tool-review-chain.test.js tests/Node/prism-review-chain-v2.test.js`

Run: `bash tests/Shell/pr_command_test.sh`

Expected: FAIL because PR preflight and the prompt understand only version one.

- [ ] **Step 3: Implement strict dual-read selection**

Inspect the shared chain path once through the v2 classifier. If it is `VALID`, verify only v2, including exact branch/base/head, criteria, check, continuity, complete axes/exposure/lenses, and zero open Blocking findings. If it is `LEGACY`, invoke only the existing strict v1 verifier. If it is `ABSENT`, preserve ADR-0093's narrow recovery and inspect criteria/check state. Report `V2_RECOVERY\tREADY` only when both receipts are valid at the exact preflight identities; report `V2_RECOVERY\tUNDECLARED` when both are absent; reject partial, stale, or unsafe receipt state. Treat `UNSAFE` and every validation error as blocking. Add version reporting without changing OCR's version-one record command.

Update `pr.md` so ordinary absent state with `V2_RECOVERY=UNDECLARED` follows the existing OCR/version-one recovery. When `V2_RECOVERY=READY`, consume the invocation's one attempt through the stable installed `prism-review review authoritative` command and require a v2 chain. Never create/select criteria or run a check there. Branch Advisory inspection by version. The `code-review chain record` subcommand remains schema-one-only and explicitly refuses a schema-two path; its read-only inspect may identify v2 without accepting model-authored v2 input.

- [ ] **Step 4: Run all preflight and chain tests to verify Green**

Run: `node --test tests/Node/prism-tool-pr.test.js tests/Node/prism-tool-code-review.test.js tests/Node/prism-tool-review-chain.test.js tests/Node/prism-review-chain-v2.test.js`

Run: `bash tests/Shell/pr_command_test.sh`

Expected: PASS with both coherent chain versions accepted, narrow absent-state recovery selected deterministically, and malformed state rejected.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/pr.js packages/prism-core/scripts/prism-tool/code-review.js packages/prism-core/prompts/pr.md tests/Node/prism-tool-pr.test.js tests/Node/prism-tool-code-review.test.js tests/Shell/pr_command_test.sh
prism-tool commit create --type feat --scope pr --subject "accept coherent review chain versions"
```

### Task 12: Stable-package readiness and packaged end-to-end authority proof

**Files:**

- Modify: `packages/prism-core/scripts/prism-review/cli.js`
- Modify: `packages/prism-core/scripts/install-global.sh`
- Modify: `tests/Node/prism-review-e2e.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `tests/Shell/install_global_toolchain_test.sh`
- Modify: `tests/Shell/prism_review_foundation_contract_test.sh`

**Interfaces:**

- Consumes: all bridge runtime modules and package extraction helpers.
- Produces: doctor evidence for external Core/provider readiness and a fake-session package proof of criteria → check → initial → repair → preflight.

- [ ] **Step 1: Write failing doctor, package, and compatibility tests**

Pack Core and adapter, extract them outside a fixture repository, configure the fixture's active adapter as a reviewed-worktree package, and resolve the external quality package independently. Assert `prism-review doctor --json` reports Core source class, authority eligibility, exact Core version/profile/policy, protected-base adapter identity/profile, matching external quality-provider identity/version/protocol, Pi SDK isolation, and no authentication probe. Add mismatch and local-source NO-GO cases.

Extend the fake-session preload to complete criteria exposure, all four axes, finding verification, and closure verification. Run the public executable through: criteria record; deterministic check with fixture provider callbacks; initial authoritative PASS; exact same-HEAD reuse with no added session calls; a Blocking initial in a second fixture; repair commit/check/review with confirmed closure; and `prism-tool pr preflight`. Assert private modes, no source/transcript/log canaries, and no retained temp directories.

Finally assert the normal finalization compatibility fixture still invokes OCR and records schema one.

- [ ] **Step 2: Run package and shell tests to verify Red**

Run: `node --test tests/Node/prism-review-e2e.test.js tests/Node/toolchain-packaging.test.js`

Run: `bash tests/Shell/install_global_toolchain_test.sh`

Run: `bash tests/Shell/prism_review_foundation_contract_test.sh`

Expected: FAIL because doctor lacks bridge readiness and packaged authority has no end-to-end proof.

- [ ] **Step 3: Complete readiness and packaged execution**

Extend doctor with fixed checks for `authority-trust-root`, `criteria-state`, `check-state`, and `adapter-quality-provider`. Readiness may report criteria/check as absent without claiming finalization readiness, but authority eligibility requires external Core and a matching external provider whenever an active protected-base adapter is present. Keep authentication `UNKNOWN` and make no inference call.

Update installer verification only enough to prove the packaged `prism-review` executable is external and strips Node injection; do not install the adapter, grant consent, mutate review state, or switch normal doctor/finalization authority. Ensure package inventories include every new module and adapter provider. Keep the source-checkout e2e preload test-owned; production receives no test hook.

- [ ] **Step 4: Run the package, installer, and compatibility tests to verify Green**

Run: `node --test tests/Node/prism-review-e2e.test.js tests/Node/toolchain-packaging.test.js tests/Node/prism-review-cli.test.js`

Run: `bash tests/Shell/install_global_toolchain_test.sh`

Run: `bash tests/Shell/prism_review_foundation_contract_test.sh`

Expected: PASS, including explicit proof that normal finalization still uses OCR/version one.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-review/cli.js packages/prism-core/scripts/install-global.sh tests/Node/prism-review-e2e.test.js tests/Node/toolchain-packaging.test.js tests/Shell/install_global_toolchain_test.sh tests/Shell/prism_review_foundation_contract_test.sh
prism-tool commit create --type test --scope review --subject "prove packaged authority bridge behavior"
```

### Task 13: Bridge documentation and maintained architecture contracts

**Files:**

- Modify: `packages/prism-core/docs/review-runtime.md`
- Modify: `packages/prism-core/README.md`
- Modify: `packages/prism-php-web/README.md`
- Modify: `tests/Shell/prism_review_architecture_contract_test.sh`
- Modify: `tests/Shell/prism_review_foundation_contract_test.sh`
- Modify: `packages/prism-core/scripts/validate-harness.sh`

**Interfaces:**

- Consumes: the completed public command grammar and record/provider contracts.
- Produces: maintained user guidance that distinguishes dormant bridge authority from the still-active OCR workflow.

- [ ] **Step 1: Write failing documentation contract tests**

Require maintained docs to state: criteria must be captured after approval and before implementation/cleanup; `NONE_DECLARED` is explicit; check RUNNING invalidates prior PASS; external Core and matching external adapter are mandatory; v2 initial/repair/reuse semantics; dual-read preflight; no source/transcript/log retention; each extra attempt needs approval; OCR/version one remain normal authority in this release; and human publication/install/push/PR/merge boundaries remain. Require every new source file in package inventory and prohibit authority claims for checkout Core.

- [ ] **Step 2: Run documentation contracts to verify Red**

Run: `bash tests/Shell/prism_review_architecture_contract_test.sh`

Run: `bash tests/Shell/prism_review_foundation_contract_test.sh`

Run: `bash packages/prism-core/scripts/validate-harness.sh`

Expected: FAIL because maintained documentation describes only the stage-one foundation.

- [ ] **Step 3: Update maintained documentation and validator inventory**

Document the exact bridge CLI, state classifications, record locations, failure semantics, package trust-root procedure, provider/model cost disclosure, and staged migration boundary. Label the new authority path dormant until humans release, publish, and install both packages. Keep current `/check`, code-review, finalization, `/pr` recovery, setup, doctor, release, consent, attribution, and OCR instructions unchanged except where they describe dual-read compatibility. Do not change ADR-0103 or the cutover specification unless implementation discovers a contradiction that requires returning to architecture review.

- [ ] **Step 4: Run docs, Markdown, and harness validation to verify Green**

Run: `bash tests/Shell/prism_review_architecture_contract_test.sh`

Run: `bash tests/Shell/prism_review_foundation_contract_test.sh`

Run: `bash packages/prism-core/scripts/validate-harness.sh`

Run: `prism-tool markdown lint --changed-from 651da45735a1d8b06a5a64271a09f23e123c96b7`

Expected: PASS with no claim that OCR has been removed or superseded in this release.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/docs/review-runtime.md packages/prism-core/README.md packages/prism-php-web/README.md tests/Shell/prism_review_architecture_contract_test.sh tests/Shell/prism_review_foundation_contract_test.sh packages/prism-core/scripts/validate-harness.sh
prism-tool commit create --type docs --scope review --subject "document the authority compatibility bridge"
```

### Task 14: Whole-branch verification and OCR compatibility gate

**Files:**

- Modify only if a failing verification reveals a defect covered by this approved specification.
- Test: all `tests/Node/*.test.js`, `tests/Node/*.test.ts`, `tests/Shell/*_test.sh`, and the PHP/Pest suite.

**Interfaces:**

- Consumes: the complete bridge implementation.
- Produces: current verification evidence before finalization; no new public interface.

- [ ] **Step 1: Run focused bridge suites as one regression set**

Run: `node --test tests/Node/prism-review-*.test.js tests/Node/prism-tool-{code-review,discovery,pr,review-chain,server,php-web-quality}.test.js tests/Node/toolchain-{contract,packaging}.test.js`

Expected: PASS with criteria, check, v2 chain, provider, authority, repair, package, and dual-read coverage.

- [ ] **Step 2: Run the complete Node and shell suites**

Run: `npm run test:node`

Run each file matched by `tests/Shell/*_test.sh` with `bash` in lexical order.

Expected: PASS with no regression to OCR/version-one normal finalization.

- [ ] **Step 3: Run the PHP/web adapter quality suite and coverage gate**

Run: `prism-tool server run @kyaulabs/prism-php-web:browser-fixture --tool pest -- --coverage`

Run: `git diff --name-only --diff-filter=AM -- '*.php' | php packages/prism-php-web/scripts/coverage-gate.php tests/coverage.xml`

Expected: PASS; every changed PHP file in the coverage source set is at least 80% covered, with zero changed PHP files expected for this plan.

- [ ] **Step 4: Run static, package, and repository checks**

Run: `prism-tool doctor --local-only`

Run: `bash packages/prism-core/scripts/validate-harness.sh`

Run: `prism-tool run php-cs-fixer -- fix --dry-run --diff`

Run: `prism-tool run stylelint -- "cdn/sass/**/*.scss" --allow-empty-input`

Run: `prism-tool run eslint -- "cdn/js/**/*.js" ".github/scripts/**/*.js" --ignore-pattern "*.min.js" --no-error-on-unmatched-pattern`

Run: `prism-tool run semgrep -- scan --config .semgrep/kyaulabs.yml --config p/php --config p/secrets --config p/javascript --error --metrics off --disable-version-check`

Run: `npm audit --audit-level=low`

Run: `pnpm audit --audit-level low`

Run: `composer audit --locked --format=json`

Run: `git diff --check`

Expected: PASS with no vulnerability, static-analysis, lint, formatting, validation, or whitespace findings.

- [ ] **Step 5: Hand off to automatic finalization**

Load `verification-before-completion` and record the fresh evidence. Then load `finishing-a-development-branch`: remove the completed bridge plan and bridge spec only at its prescribed cleanup point, synchronize `origin/develop`, rerun `/check` until green, consume the plan-authorized single OCR four-axis review, revalidate, and prepare `/pr`. Do not push, create the PR, publish packages, install packages, start cutover, or remove OCR.
