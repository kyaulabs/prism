# Core-only Project Plans Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Produce a validated, deterministic, digest-bound Blank Core-only project plan from minimal approved metadata without applying project files.

**Architecture:** Add a Core-owned metadata broker, trusted-provider registry, Core baseline provider, and ownership composer beneath the public `prism-tool setup project` interface. Planning creates one private bootstrap attempt under `.pi/prism-tool/bootstrap/<uuid>/`, renders candidate bytes there, and returns a closed plan whose metadata, providers, outputs, effects, recovery semantics, and original filesystem state are digest-bound for Task #5 to apply.

**Tech Stack:** Node.js 22.19+ built-ins (`node:crypto`, `node:fs`, `node:path`), CommonJS, `node:test`, public `prism-tool` CLI integration tests.

## Global constraints

- Implement only Blank + Core-only planning; Template-backed and adapter-backed composition remain later epic slices.
- Use no new dependency, Pi extension, safe directory, remote access, registry access, subprocess, Git operation, credential access, or project-file mutation.
- The only planning mutation is transaction-owned operational state beneath `.pi/prism-tool/bootstrap/<uuid>/`.
- Accept exactly schema version `1`, source `BLANK`, adapter `null`, and an empty capability list.
- Minimal metadata contains only an editable display name and one-sentence summary.
- Persist the canonical future project manifest at `.prism/project.json`; generated documents are outputs, never metadata sources.
- Provider and plan schemas are closed; unknown fields, IDs, versions, protocols, states, paths, modes, digests, checks, and verification entries fail closed.
- Reject exact-path and prefix ownership overlap before returning a displayable plan.
- Bind the plan to the canonical project root, metadata digest, provider reports, output bytes, source evidence, and exact active-attempt filesystem state.
- Preserve established-project setup behavior and all existing setup commands unchanged.
- Every new `.js` or hook source file requires the RCS header and vim modeline from the `rcs-header` skill.

---

### Task 1: Broker and normalize minimal project metadata

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/bootstrap-metadata.js`
- Create: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`

**Interfaces:**
- Consumes: canonical `projectRoot`, source `BLANK`, adapter ID `core-only`, and bounded JSON input.
- Produces: `inspectMinimalMetadata({projectRoot})` and `normalizeProjectMetadata({projectRoot, input})`.
- Produces CLI: `prism-tool setup project metadata --source=blank --adapter=core-only [--json]`.
- Produces CLI: initial `prism-tool setup project plan --source=blank --adapter=core-only [--json]` validation seam.

- [x] **Step 1: Write the failing metadata-contract tests**

Add tests that call `main()` through the public CLI and assert:

```javascript
const suggestion = captureWrites(() => main([
    'setup', 'project', 'metadata', '--source=blank', '--adapter=core-only', '--json',
], {projectRoot}));
const report = JSON.parse(suggestion.stdout);
assert.equal(suggestion.status, 0);
assert.deepEqual(report.data.fields, [
    {
        id: 'displayName',
        required: true,
        suggestedValue: path.basename(projectRoot),
        maximumLength: 100,
    },
    {
        id: 'summary',
        required: true,
        suggestedValue: null,
        maximumLength: 240,
    },
]);
assert.deepEqual(fs.readdirSync(projectRoot), []);
```

Add a plan-input test proving the directory suggestion is editable:

```javascript
const result = captureWrites(() => main([
    'setup', 'project', 'plan', '--source=blank', '--adapter=core-only', '--json',
], {
    projectRoot,
    input: JSON.stringify({
        schemaVersion: 1,
        displayName: 'Editable Project Name',
        summary: 'A deterministic Core-only project.',
    }),
    randomUUID: () => ATTEMPT_ID,
}));
assert.notEqual(result.status, 0);
assert.match(result.stderr, /project planning is not implemented/);
```

Add table-driven rejection cases for unknown fields, wrong schema, blank values, leading/trailing whitespace, control characters, embedded newlines, overlong values, arrays/objects, duplicate JSON keys detected before parsing, and summaries containing more than one sentence boundary.

- [x] **Step 2: Run the focused test to verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: FAIL because `setup project metadata` and `bootstrap-metadata.js` do not exist.

- [x] **Step 3: Implement the closed metadata broker**

Implement these exports in `bootstrap-metadata.js`:

```javascript
const METADATA_SCHEMA_VERSION = 1;
const DISPLAY_NAME_MAXIMUM = 100;
const SUMMARY_MAXIMUM = 240;

function inspectMinimalMetadata({projectRoot}) {
    return {
        schemaVersion: 1,
        fields: [
            {
                id: 'displayName',
                required: true,
                suggestedValue: path.basename(fs.realpathSync(projectRoot)),
                maximumLength: DISPLAY_NAME_MAXIMUM,
            },
            {
                id: 'summary',
                required: true,
                suggestedValue: null,
                maximumLength: SUMMARY_MAXIMUM,
            },
        ],
    };
}

function normalizeProjectMetadata({projectRoot, input}) {
    const value = parseClosedJson(input, ['schemaVersion', 'displayName', 'summary']);
    if (value.schemaVersion !== METADATA_SCHEMA_VERSION) {
        throw new Error('project metadata schema is unsupported');
    }
    return Object.freeze({
        schemaVersion: METADATA_SCHEMA_VERSION,
        displayName: normalizeSingleLine(value.displayName, DISPLAY_NAME_MAXIMUM, 'display name'),
        summary: normalizeSentence(value.summary, SUMMARY_MAXIMUM),
        suggestedDisplayName: path.basename(fs.realpathSync(projectRoot)),
    });
}
```

`parseClosedJson()` must scan the raw UTF-8 JSON object for duplicate top-level keys before `JSON.parse`, reject a BOM, arrays, trailing bytes, and values above 16 KiB. `normalizeSingleLine()` must require normalized NFC text, exact trim equality, no C0/C1 controls, and no line separators. `normalizeSentence()` must additionally allow exactly one terminal `.`, `!`, or `?` only at the end.

Wire `setup project metadata` into `cli.js`. It must first call `inspectSetupRoute({projectRoot, source: 'BLANK'})`, require `STRICT_EMPTY`, accept only the exact controls above, and emit a closed `METADATA_REQUIRED` report. Add the initial `setup project plan` parser, read input through `readBoundedStdin(context)`, normalize it, then return the temporary deterministic failure `prism-tool: project planning is not implemented` until Task 4 replaces that branch.

- [x] **Step 4: Run the focused test to verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: PASS for metadata inspection and validation; the explicit unimplemented-plan assertion also passes.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-metadata.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-plan.test.js
prism-tool commit create --type feat --scope setup --subject "broker minimal bootstrap metadata" --refs 384
```

---

### Task 2: Render the trusted Core baseline provider report

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/bootstrap-providers.js`
- Create: `packages/prism-core/config/bootstrap/hooks/pre-commit`
- Create: `packages/prism-core/config/bootstrap/hooks/commit-msg`
- Create: `packages/prism-core/config/bootstrap/hooks/prepare-commit-msg`
- Create: `packages/prism-core/config/bootstrap/hooks/pre-push`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`

**Interfaces:**
- Consumes: normalized metadata, canonical Core package root/version, source `BLANK`, capabilities `[]`, adapter `null`, and launcher-designated candidate root.
- Produces: `loadTrustedProviderRegistry({coreRoot})`.
- Produces: `renderCoreBaseline({coreRoot, projectRoot, candidateRoot, request})`.
- Produces provider ID `core-baseline`, package `@kyaulabs/prism-core`, provider version equal to the exact Core package version, protocol version `1`.

- [x] **Step 1: Write failing Core provider tests**

Add a public plan test seam by injecting `context.bootstrapPlanStage = 'provider'`; the CLI calls the real metadata broker and provider but stops before composition. Assert the report contains exactly these future project paths:

```javascript
assert.deepEqual(provider.outputs.map(({path: outputPath}) => outputPath), [
    '.github/hooks/commit-msg',
    '.github/hooks/pre-commit',
    '.github/hooks/pre-push',
    '.github/hooks/prepare-commit-msg',
    '.prism/project.json',
    'README.md',
    'commitlint.config.cjs',
]);
```

Assert each output has exactly:

```javascript
{
    path: 'README.md',
    kind: 'file',
    mode: 0o644,
    sha256: /^[0-9a-f]{64}$/,
    candidatePath: path.join(candidateRoot, 'README.md'),
}
```

Assert `.prism/project.json` parses to:

```json
{
  "schemaVersion": 1,
  "source": {"mode": "BLANK", "evidence": null},
  "capabilities": [],
  "project": {
    "displayName": "Editable Project Name",
    "summary": "A deterministic Core-only project."
  },
  "adapter": null,
  "compatibility": {
    "corePackage": "@kyaulabs/prism-core",
    "coreVersion": "0.3.1",
    "providerProtocol": 1
  }
}
```

Assert `README.md` is deterministic and contains only the approved display name, approved summary, and a generic Prism development section. Assert the four wrappers are mode `0755`, contain no stack name or source-checkout path, and delegate only to their literal `prism-tool hook pre-commit`, `commit-msg`, `prepare-commit-msg`, or `pre-push` event with `"$@"`. Assert the provider invokes no subprocess and writes only beneath `candidateRoot`.

Add malicious provider-registry/package fixture cases for unknown keys, wrong package name/version, unsupported protocol, duplicate provider ID, symlinked resources, missing resource, modified mode, and candidate-root escape.

- [x] **Step 2: Run the focused tests to verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/toolchain-packaging.test.js`

Expected: FAIL because the provider module and packaged hook resources do not exist.

- [x] **Step 3: Implement the registry, provider, and bundled baseline resources**

Implement a closed in-code registry derived from the Core package manifest:

```javascript
{
    schemaVersion: 1,
    providers: [{
        id: 'core-baseline',
        displayName: 'Prism Core baseline',
        packageName: '@kyaulabs/prism-core',
        packageVersion: manifest.version,
        protocolVersion: 1,
        outputs: [
            '.github/hooks/commit-msg',
            '.github/hooks/pre-commit',
            '.github/hooks/pre-push',
            '.github/hooks/prepare-commit-msg',
            '.prism/project.json',
            'README.md',
            'commitlint.config.cjs',
        ],
    }],
}
```

`renderCoreBaseline()` must:

1. Validate the request has exact keys `schemaVersion`, `source`, `capabilities`, `metadata`, and `adapter`.
2. Require source `{mode: 'BLANK', evidence: null}`, capabilities `[]`, and adapter `null`.
3. Create only launcher-designated candidate parent directories with modes `0700` for operational directories.
4. Render `.prism/project.json` with stable two-space JSON plus a final newline.
5. Render `README.md` as ``# ${metadata.displayName}``, one blank line, ``${metadata.summary}``, and a fixed `## Development` section that points to `prism-tool doctor --local-only` and the Prism pipeline without project-specific identities.
6. Copy `packages/prism-core/config/commitlint.config.cjs` byte-for-byte to candidate `commitlint.config.cjs`.
7. Copy the four packaged thin hook resources byte-for-byte and preserve mode `0755`.
8. Return a frozen provider report with exact keys `schemaVersion`, `provider`, `status`, `outputs`, `effects`, `checks`, and `verification`; use `status: 'GO'`, `effects: []`, one passing render check, and one closed verification entry `{id: 'core-baseline-inventory', command: 'setup project validate'}`.

Each wrapper must use this complete shape with the event changed literally:

```bash
#!/usr/bin/env bash
# $KYAULabs: pre-commit kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

set -euo pipefail

if ! command -v prism-tool >/dev/null 2>&1; then
    echo "prism hook: prism-tool is unavailable" >&2
    exit 1
fi

exec prism-tool hook pre-commit "$@"

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

During execution, load `rcs-header`; use the same literal identity/date format for the other three wrapper filenames and let the pre-commit normalizer refresh dates if needed before staging.

Update package tests to require the four resources, exact executable modes, and `bootstrap-providers.js` in `npm pack` output.

- [x] **Step 4: Run the focused tests to verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/toolchain-packaging.test.js`

Expected: PASS.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-providers.js packages/prism-core/config/bootstrap/hooks tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/toolchain-packaging.test.js
prism-tool commit create --type feat --scope setup --subject "render the core bootstrap baseline" --refs 384
```

---

### Task 3: Validate provider reports and compose non-overlapping ownership

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/bootstrap-composer.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`

**Interfaces:**
- Consumes: closed trusted-provider registry records and provider reports from Task 2.
- Produces: `validateProviderReport({projectRoot, candidateRoot, registry, report})`.
- Produces: `composeProviderReports({projectRoot, candidateRoot, reports})`.
- Produces: stable sorted ownership entries for the candidate plan.

- [x] **Step 1: Write failing report-validation and ownership tests**

Add table-driven malicious report cases covering:

```javascript
[
    'unknown report field',
    'unknown provider ID',
    'package identity mismatch',
    'package version mismatch',
    'protocol mismatch',
    'unknown status',
    'unknown output field',
    'absolute target path',
    'backslash path',
    'dot or dot-dot path segment',
    'operational .pi/prism-tool target',
    'symlinked candidate file',
    'candidate path outside candidate root',
    'mode outside 0644 or 0755',
    'digest mismatch',
    'unknown effect',
    'unknown check',
    'unknown verification command',
]
```

Add exact overlap tests:

```javascript
assert.throws(
    () => composeProviderReports({reports: [reportFor('README.md'), reportFor('README.md')]}),
    /provider ownership overlaps/
);
assert.throws(
    () => composeProviderReports({reports: [reportFor('.github'), reportFor('.github/hooks/pre-commit')]}),
    /provider ownership overlaps/
);
```

Add the inverse prefix case and a sibling-path success case. Assert successful composition sorts by POSIX path and retains one owner per path without copying report fields the plan does not need.

- [x] **Step 2: Run the focused test to verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: FAIL because `bootstrap-composer.js` does not exist.

- [x] **Step 3: Implement closed report validation and ownership composition**

Implement exact-key helpers locally; do not create a generic validation framework. Validate every output against its held candidate file using `lstat`, `O_NOFOLLOW`, `fstat`, maximum file size 1 MiB, exact mode, and SHA-256. Normalize target paths with POSIX rules and reject `.git`, `.pi/prism-tool`, environment-file names, absolute paths, backslashes, empty segments, `.`/`..`, NUL/control characters, and paths exceeding 240 bytes.

Composition must use this prefix test after sorting paths:

```javascript
function overlaps(left, right) {
    return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}
```

Return frozen entries with exact keys:

```javascript
{
    path,
    kind: 'file',
    mode,
    sha256,
    provider: {
        id,
        packageName,
        packageVersion,
        protocolVersion,
    },
    candidatePath,
}
```

Only allow check ID `core-baseline-render` and verification `{id: 'core-baseline-inventory', command: 'setup project validate'}` in this slice. Unknown effects are rejected; the only accepted effects array is empty.

- [x] **Step 4: Run the focused test to verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: PASS.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-composer.js tests/Node/prism-tool-bootstrap-plan.test.js
prism-tool commit create --type feat --scope setup --subject "compose bootstrap provider ownership" --refs 384
```

---

### Task 4: Create and revalidate digest-bound Core-only candidate plans

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/bootstrap-plan.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `packages/prism-core/README.md`

**Interfaces:**
- Consumes: metadata normalization, provider rendering, and ownership composition from Tasks 1–3.
- Produces: `planCoreOnlyProject({projectRoot, coreRoot, input, randomUUID})`.
- Produces: `validateBootstrapProjectPlan({projectRoot, attemptId, planDigest})` for Task #5.
- Produces CLI: `prism-tool setup project plan --source=blank --adapter=core-only [--json]`.
- Produces CLI: `prism-tool setup project validate --attempt=UUID --digest=SHA256 [--json]`.

- [ ] **Step 1: Write failing end-to-end planning and stale-state tests**

Replace the temporary unimplemented assertion with a successful public CLI test. Assert:

```javascript
assert.equal(report.schemaVersion, 1);
assert.equal(report.command, 'setup project plan');
assert.equal(report.status, 'GO');
assert.equal(report.disposition, 'PLAN_READY');
assert.equal(report.source.mode, 'BLANK');
assert.equal(report.source.evidence, null);
assert.equal(report.adapter, null);
assert.deepEqual(report.capabilities, []);
assert.equal(report.metadata.displayName, 'Editable Project Name');
assert.match(report.metadataDigest, /^[0-9a-f]{64}$/);
assert.match(report.planDigest, /^[0-9a-f]{64}$/);
assert.equal(report.providers.length, 1);
assert.equal(report.outputs.length, 7);
assert.deepEqual(report.effects, []);
assert.deepEqual(report.recovery, {
    beforeDurable: 'REMOVE_OWNED_ATTEMPT_AND_PROVE_STRICT_EMPTY',
    afterDurable: 'RETAIN_PROJECT_AND_RESUME',
});
```

Assert the only project-root entry after planning is `.pi`, the plan and candidates are private regular files beneath the exact attempt directory, no target project file exists, no subprocess ran, and two equivalent roots/inputs/core versions produce byte-identical metadata, provider reports, output digests, and semantic plan digest while attempt IDs and absolute operational paths are excluded from the semantic digest.

Add `setup project validate` tests proving GO for unchanged state and `NO-GO` with `STALE_PROJECT_STATE` after each independent mutation: added root file, changed candidate byte, changed candidate mode, replaced candidate with symlink, changed metadata report, changed provider report, changed plan, wrong attempt UUID, wrong digest, or another active attempt.

Add a closed-schema plan test that inserts an unknown field and expects `INVALID_PLAN`, plus a test that a non-empty or established root cannot start planning.

- [ ] **Step 2: Run the focused tests to verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/toolchain-packaging.test.js`

Expected: FAIL because the plan coordinator and final CLI operations do not exist.

- [ ] **Step 3: Implement attempt creation, semantic digesting, and revalidation**

`planCoreOnlyProject()` must:

1. Canonicalize the root and require `inspectSetupRoute({source: 'BLANK'})` to return `STRICT_EMPTY` before writing.
2. Validate a UUIDv4 attempt ID and create `.pi/prism-tool/bootstrap/<uuid>/` with mode `0700` using exclusive creation.
3. Create `candidate/`, `reports/`, and `plan/` subdirectories with mode `0700`.
4. Normalize metadata, render the Core provider, validate and compose ownership.
5. Write `reports/core-baseline.json`, `metadata.json`, and `plan/project.json` as mode `0600`, using exclusive writes and stable key order.
6. Build the semantic plan with exact keys `schemaVersion`, `source`, `adapter`, `capabilities`, `metadata`, `metadataDigest`, `providers`, `outputs`, `effects`, `checks`, `verification`, `recovery`, and `filesystem`.
7. Set `filesystem` to `{original: 'STRICT_EMPTY', allowedRootEntries: ['.pi'], attemptInventoryDigest}` where the inventory digest binds every owned operational path, kind, mode, size, and SHA-256 except the final plan file's self-digest field.
8. Compute `planDigest` from canonical JSON of the semantic plan only; return absolute `planPath` and attempt ID outside that digest.
9. On caught failure before returning `PLAN_READY`, remove only the just-created attempt when its identity and inventory remain ownership-proven; remove empty parents; otherwise return `RECOVERY_REQUIRED` without deleting ambiguous state.

`validateBootstrapProjectPlan()` must re-open every parent and regular file without following symlinks, require exact closed schemas, recompute metadata/provider/output/plan/inventory digests, require the same canonical root and only the active attempt's allowed root state, then return the validated semantic plan. It performs no application.

Wire both final CLI commands with exact controls. `plan` reads at most 16 KiB from stdin. `validate` accepts one UUIDv4 and one lowercase 64-character SHA-256. Render bounded `GO`, `NO-GO`, or `RECOVERY_REQUIRED` reports; do not expose candidate bytes in stdout.

Update `toolchain-packaging.test.js` to require `bootstrap-metadata`, `bootstrap-providers`, `bootstrap-composer`, and `bootstrap-plan`. Update `packages/prism-core/README.md` with a short strict-empty planning section documenting that Blank Core-only planning uses only name/summary, creates private provisional state, and does not apply files, initialize Git, configure a remote, or invoke a network/subprocess.

- [ ] **Step 4: Run focused and regression tests to verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: PASS.

Run: `node --test tests/Node/prism-tool-setup-route.test.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-template-source.test.js tests/Node/toolchain-packaging.test.js`

Expected: PASS with established routing, adapter selection, and Template acquisition behavior unchanged.

Run: `npm run test:node`

Expected: PASS.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-plan.js packages/prism-core/scripts/prism-tool/cli.js packages/prism-core/README.md tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/toolchain-packaging.test.js
prism-tool commit create --type feat --scope setup --subject "bind core-only project plans" --refs 384
```

---

## Final verification

- [ ] Run `node --test tests/Node/prism-tool-bootstrap-plan.test.js`.
- [ ] Run `npm run test:node`.
- [ ] Run the repository `/check` gate.
- [ ] Confirm no debug instrumentation, unmanaged temporary files, network calls, subprocess calls, Git state, project target files, or new dependency/lockfile changes remain.
- [ ] Confirm `git diff --check` is clean.
- [ ] Confirm every new source file has one RCS header and one vim modeline.
- [ ] Confirm every acceptance criterion in issue #384 maps to at least one passing public CLI test.
