# Setup-Managed Lockstep Package Releases Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Install and maintain an opt-in Core-owned npm package-release capability whose configured package versions equal the repository release and whose GitHub Release is published before package tags are reconciled.

**Architecture:** Add a deep, dependency-free Core launcher module with discovery, configuration validation, ownership classification, plan, apply, and verify interfaces. `/setup` orchestrates those deterministic operations independently of adapter selection; `/release` consumes only the owned lockstep configuration; the installed workflow is byte-identical to a canonical Core template and separates validated back-merge preparation from publication success.

**Tech Stack:** Node.js 22.19+ CommonJS (`node:test`, `node:fs` including `globSync`), Bash, GitHub Actions YAML, `jq`, `gh`, npm manifests, existing Prism launcher/test helpers.

## Global constraints

- `ADR-required: 0079`; `adr/0079-setup-managed-lockstep-package-releases.md` is Accepted before implementation.
- No new npm, Composer, Action, or operating-system dependency.
- Core owns all package-release discovery, setup, authoring policy, canonical workflow, and launcher mechanics; the PHP/web adapter receives no package-release logic.
- Managed configuration schema is exactly `schemaVersion: 1`, `managedBy: "@kyaulabs/prism-core"`, `versionPolicy: "lockstep"`, and a non-empty unique normalized `packages` array.
- The publishable root package is represented by `.`; workspace packages use normalized POSIX relative directories.
- Discovery reads only the root `package.json` and root-declared `workspaces` array or `workspaces.packages` array, performs no network access, and rejects traversal, symlink, containment, duplicate-target, invalid-name, and invalid-version states.
- Ownership dispositions are exactly `CREATE`, `UNCHANGED`, `UPDATE`, `MIGRATE`, and `CONFLICT` for the two managed files considered together.
- Current legacy workflow SHA-256 is `dd4cd0fdf362e4243117e620c906a7bfe42b8b52c011759a2a6ea8f1850f0ef6`; arbitrary similar workflow content is never claimed.
- Current legacy configuration is accepted only as an exact object with the single key `packages` and a valid non-empty package path array.
- CI permissions remain exactly `contents: write` and `pull-requests: write`; CI never stores npm credentials and never runs `npm publish`.
- Humans push branches, create/merge pull requests, authenticate to npm, handle OTP, and run npm publication.
- Every new or modified `.js`/`.sh` source file receives the hook-managed RCS header and final vim modeline; do not hand-edit normalized header dates.
- Treat manifests, paths, refs, versions, package names, GitHub output, and workflow event data as untrusted data.

---

## File structure

- Create `packages/prism-core/scripts/prism-tool/package-release.js` — release configuration schema, root/workspace discovery, path/package validation, ownership classification, plan creation, locking, atomic application, legacy migration, and verification.
- Modify `packages/prism-core/scripts/prism-tool/cli.js` — public `prism-tool package-release inspect|plan|apply|verify` dispatcher and stable JSON/text reports.
- Create `packages/prism-core/config/release.yml` — canonical owned workflow template, byte-identical to the installed project workflow.
- Modify `.github/workflows/release.yml` — installed owned workflow with repository-first publication, package-tag reconciliation, and failure-independent back-merge preparation.
- Modify `.prism/release.json` — owned schema-v1 lockstep configuration for Prism's two packages.
- Create `tests/Node/prism-tool-package-release-discovery.test.js` — discovery and schema/path validation.
- Create `tests/Node/prism-tool-package-release-transaction.test.js` — ownership dispositions, plans, drift, atomic apply/rollback, CLI reports, and verification.
- Modify `tests/Node/toolchain-packaging.test.js` — canonical workflow and launcher module ship in the Core tarball.
- Modify `tests/Shell/release_workflow_test.sh` — prompt contracts, workflow execution simulations, YAML/parity, ordering, tag states, recovery, and back-merge reachability.
- Modify `packages/prism-core/prompts/setup.md` — package-release capability setup stage, independent of adapter selection.
- Modify `packages/prism-core/prompts/release.md` — `origin/main` ancestry gate and lockstep package authoring/handoff.
- Modify `packages/prism-core/README.md` and `NPM.md` — opt-in setup, lockstep semantics, tags, and human publication.

---

### Task 1: Discover and Validate Release-Managed Packages

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/package-release.js`
- Create: `tests/Node/prism-tool-package-release-discovery.test.js`
- Modify: `tests/Node/helpers.js`

**Interfaces:**
- Consumes: canonical project root and local root/workspace manifests.
- Produces: `discoverReleasePackages({projectRoot, glob}) -> Array<{name: string, path: string, version: string, tagPrefix: string}>`.
- Produces: `loadReleaseConfiguration({projectRoot, allowLegacy?: boolean}) -> {kind: 'ABSENT'|'MANAGED'|'LEGACY', packages: string[]}`.
- Produces: `validateConfiguredPackages({projectRoot, packagePaths}) -> Array<{name, path, version, tagPrefix}>`.

- [x] **Step 1: Write failing table-driven discovery tests**

Add fixture helpers that write manifests with regular-file modes, then cover root-first ordering, both workspace declaration shapes, lexical workspace ordering, private exclusion, undeclared-directory exclusion, invalid root JSON, unsupported workspace shape, invalid package name/version, duplicate canonical target, duplicate tag prefix, missing manifest, traversal pattern, and symlink package/escape rejection.

```js
const {discoverReleasePackages, loadReleaseConfiguration} = require(
    '../../packages/prism-core/scripts/prism-tool/package-release'
);

function writePackage(root, relative, manifest) {
    const directory = relative === '.' ? root : path.join(root, relative);
    fs.mkdirSync(directory, {recursive: true});
    writeJson(path.join(directory, 'package.json'), manifest);
}

test('discovers publishable root first and declared workspaces lexically', (t) => {
    const root = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    writePackage(root, '.', {
        name: '@fixture/root', version: '1.2.3', workspaces: ['packages/*'],
    });
    writePackage(root, 'packages/zeta', {name: '@fixture/zeta', version: '1.2.3'});
    writePackage(root, 'packages/alpha', {name: '@fixture/alpha', version: '1.2.3'});
    writePackage(root, 'outside/ignored', {name: '@fixture/ignored', version: '1.2.3'});

    assert.deepEqual(discoverReleasePackages({projectRoot: root}), [
        {name: '@fixture/root', path: '.', version: '1.2.3', tagPrefix: 'root'},
        {name: '@fixture/alpha', path: 'packages/alpha', version: '1.2.3', tagPrefix: 'alpha'},
        {name: '@fixture/zeta', path: 'packages/zeta', version: '1.2.3', tagPrefix: 'zeta'},
    ]);
});

test('excludes private packages but rejects a private configured package', (t) => {
    const root = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    writePackage(root, '.', {name: 'fixture-root', version: '1.0.0', private: true, workspaces: ['packages/*']});
    writePackage(root, 'packages/public', {name: '@fixture/public', version: '1.0.0'});
    writePackage(root, 'packages/private', {name: '@fixture/private', version: '1.0.0', private: true});

    assert.deepEqual(discoverReleasePackages({projectRoot: root}).map(({path}) => path), ['packages/public']);
    writeJson(path.join(root, '.prism', 'release.json'), {
        schemaVersion: 1,
        managedBy: '@kyaulabs/prism-core',
        versionPolicy: 'lockstep',
        packages: ['packages/private'],
    });
    assert.throws(() => loadReleaseConfiguration({projectRoot: root}), /private package/);
});
```

- [x] **Step 2: Run the focused test and confirm Red**

Run: `node --test tests/Node/prism-tool-package-release-discovery.test.js`

Expected: FAIL because `package-release.js` and its exports do not exist.

- [x] **Step 3: Implement bounded JSON, workspace, path, package, and configuration validation**

Implement with no dependency and these exact constants/exports:

```js
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MANAGED_BY = '@kyaulabs/prism-core';
const RELEASE_SCHEMA_VERSION = 1;
const RELEASE_VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const CONTROL = /[\0-\x1f\x7f]/;
const MAX_JSON_BYTES = 1048576;

function isInside(root, candidate) {
    const relation = path.relative(root, candidate);
    return relation === '' || (!relation.startsWith('..') && !path.isAbsolute(relation));
}

function packageTagPrefix(name) {
    return name.includes('/') ? name.slice(name.indexOf('/') + 1) : name;
}

function normalizePackageDirectory(projectRoot, value) {
    if (typeof value !== 'string' || value.length === 0 || value.includes('\\') || /\s/.test(value) || CONTROL.test(value)) {
        throw new Error('package path is invalid');
    }
    if (path.posix.isAbsolute(value) || value.split('/').includes('..')) throw new Error('package path is invalid');
    const normalized = path.posix.normalize(value);
    if (normalized !== value || (value !== '.' && value.startsWith('./'))) throw new Error('package path is invalid');
    const lexical = path.resolve(projectRoot, value);
    if (!isInside(projectRoot, lexical)) throw new Error('package path escapes project root');
    const canonical = fs.realpathSync(lexical);
    if (!isInside(projectRoot, canonical) || canonical !== lexical) throw new Error('package path is symlinked or escaping');
    return value;
}
```

Use `fs.globSync(`${pattern.replace(/\/$/, '')}/package.json`, {cwd: canonicalRoot})`, sort matches lexically, and accept only `workspaces: string[]` or `workspaces: {packages: string[]}`. Require regular non-symlink manifests no larger than `MAX_JSON_BYTES`. Deduplicate canonical directories, npm names, and scope-stripped tag prefixes. Managed configuration requires exact keys and values; legacy configuration requires the exact single key `packages` and is accepted only when `allowLegacy === true`.

Export the public functions plus `MANAGED_BY`, `RELEASE_SCHEMA_VERSION`, and a `sha256(value)` helper for the transaction tests.

- [x] **Step 4: Run discovery tests and refactor diagnostics**

Run: `node --test tests/Node/prism-tool-package-release-discovery.test.js`

Expected: PASS, with errors naming only the invalid package path/category and never manifest contents.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/package-release.js tests/Node/prism-tool-package-release-discovery.test.js tests/Node/helpers.js
```

```bash
prism-tool commit create --type feat --scope release --subject "discover release-managed npm packages"
```

---

### Task 2: Classify Ownership and Produce Bounded Setup Plans

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/package-release.js`
- Create: `tests/Node/prism-tool-package-release-transaction.test.js`

**Interfaces:**
- Consumes: Task 1 package records and a Core root containing `config/release.yml`.
- Produces: `inspectReleaseCapability({projectRoot, coreRoot}) -> {status, disposition, candidates, configuredPackages, checks}`.
- Produces: `planReleaseCapability({projectRoot, coreRoot}) -> {status, disposition, planPath, diff, candidates}`.
- Plan schema: `{schemaVersion: 1, managedBy, projectRoot, disposition, files: {'.prism/release.json': {before, after}, '.github/workflows/release.yml': {before, after}}}` where digests are 64 lowercase hex or `absent`.

- [x] **Step 1: Write failing disposition and plan tests**

Use a fixture Core root with `config/release.yml` containing the final ownership comments and a fixture project with publishable packages. Cover:

```js
const states = [
    ['both absent', 'CREATE'],
    ['owned canonical', 'UNCHANGED'],
    ['owned outdated', 'UPDATE'],
    ['legacy exact pair', 'MIGRATE'],
    ['config only', 'CONFLICT'],
    ['workflow only', 'CONFLICT'],
    ['unowned pair', 'CONFLICT'],
    ['owned config plus unowned workflow', 'CONFLICT'],
    ['unsupported managed schema', 'CONFLICT'],
];
```

Assert `CREATE`, `UPDATE`, and `MIGRATE` plans contain exact before/after digests and a unified diff for only the two managed paths; `UNCHANGED` produces no plan; `CONFLICT` produces no plan and preserves all bytes.

- [x] **Step 2: Run the focused transaction test and confirm Red**

Run: `node --test tests/Node/prism-tool-package-release-transaction.test.js`

Expected: FAIL because ownership inspection and planning exports are missing.

- [x] **Step 3: Implement ownership markers, classification, operational workspace, and plan creation**

Add exact ownership constants:

```js
const CONFIG_PATH = '.prism/release.json';
const WORKFLOW_PATH = '.github/workflows/release.yml';
const WORKFLOW_MARKER = '# prism-managed: @kyaulabs/prism-core';
const WORKFLOW_SCHEMA_MARKER = '# prism-release-schema: 1';
const LEGACY_WORKFLOW_SHA256 = 'dd4cd0fdf362e4243117e620c906a7bfe42b8b52c011759a2a6ea8f1850f0ef6';
const OPERATION_ROOT = path.join('.pi', 'prism-tool', 'package-release');
```

Render managed configuration deterministically with two-space JSON indentation and a trailing newline. Recognize owned workflow content only when the first five lines contain both exact markers; verify canonical status by byte equality with `coreRoot/config/release.yml`. Recognize legacy workflow content only by `LEGACY_WORKFLOW_SHA256`.

Create the operational directory as mode `0700` with `.prism-package-release.json` mode `0600` containing exact Core identity and canonical project root. Write `plan.json`, `before/`, and `after/` regular files with `wx`; use Node to render the diff from bounded line arrays rather than invoking shell. A fresh plan removes only a previously ownership-proven operation directory.

- [x] **Step 4: Run transaction tests and inspect plan contents**

Run: `node --test tests/Node/prism-tool-package-release-transaction.test.js`

Expected: PASS for all dispositions, exact digests, exact candidate ordering, and byte-preserving conflicts.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/package-release.js tests/Node/prism-tool-package-release-transaction.test.js
```

```bash
prism-tool commit create --type feat --scope setup --subject "plan managed package release files"
```

---

### Task 3: Apply, Roll Back, Verify, and Expose Launcher Operations

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/package-release.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-package-release-transaction.test.js`

**Interfaces:**
- Produces: `applyReleaseCapability({projectRoot, coreRoot, planPath, rename = fs.renameSync}) -> {status, checks, data}`.
- Produces: `verifyReleaseCapability({projectRoot, coreRoot, allowLegacy?: false}) -> {status, checks, data}`.
- Public CLI:
  - `prism-tool package-release inspect [--json]`
  - `prism-tool package-release plan [--json]`
  - `prism-tool package-release apply --plan=PATH --approval=yes [--json]`
  - `prism-tool package-release verify [--json]`

- [x] **Step 1: Extend failing tests for approval, drift, lock, rollback, apply, and verify**

Add assertions that:

```js
assert.equal(main(['package-release', 'apply', `--plan=${planPath}`, '--approval=no'], context), 2);
assert.equal(runCount, 0);
```

Cover non-literal approval, arbitrary plan path, marker substitution, plan digest drift, target drift, concurrent lock refusal, failure on first and second rename, rollback of absent/existing files and newly created empty parent directories, successful `CREATE`/`UPDATE`/`MIGRATE`, exact mode preservation (`0600` for new config and `0644` for new workflow), operation cleanup, and final verification rejecting schema/workflow parity drift.

- [x] **Step 2: Run transaction tests and confirm Red**

Run: `node --test tests/Node/prism-tool-package-release-transaction.test.js`

Expected: FAIL because apply/verify and CLI dispatch do not exist.

- [x] **Step 3: Implement the mutation boundary**

Acquire `.pi/prism-tool/package-release.lock` with `openSync(..., 'wx', 0o600)`. Re-read and validate the ownership marker, canonical project root, exact plan path, plan schema, before digests, and after digests before the first write. Prepare same-directory temporary files with `wx`, `fsyncSync`, canonical modes, and final `renameSync`.

Apply workflow first and configuration second; configuration publication is the durable commit point. If any operation before the second successful rename fails, restore exact backed-up bytes/modes or remove transaction-created files, then remove transaction-created empty `.prism`/`.github/workflows` directories only when still empty. Verification failure after both final files exist retains the complete owned desired state and returns deterministic `NO-GO` recovery guidance to rerun `package-release verify`; it never restores a partial legacy state.

Add CLI report construction with schema version 1 and exit codes `OK`, `USAGE`, `TOOL`, and `TRANSACTION`. Apply must reject any approval other than exact `--approval=yes` before reading an arbitrary plan path. These local operations perform no registry or GitHub access.

- [x] **Step 4: Run focused and existing launcher suites**

Run: `node --test tests/Node/prism-tool-package-release-transaction.test.js`

Expected: PASS.

Run: `node --test tests/Node/prism-tool-discovery.test.js tests/Node/prism-tool-apply.test.js`

Expected: PASS with no adapter setup regression.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/package-release.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-package-release-transaction.test.js
```

```bash
prism-tool commit create --type feat --scope setup --subject "apply package release capability atomically"
```

---

### Task 4: Publish the Repository Release Before Reconciling Package Tags

**Files:**
- Create: `packages/prism-core/config/release.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `.prism/release.json`
- Modify: `tests/Shell/release_workflow_test.sh`

**Interfaces:**
- Consumes: owned schema-v1 configuration or dispatch-only exact legacy packages object from the checked-out merge.
- Produces: `.prism-package-tags.tsv` containing validated `tag<TAB>name<TAB>path<TAB>version` records and a deterministic `Packages` release-note block.
- Preserves: existing validated event/version/merge-SHA gate, changelog extraction/body cap/full asset, repository publication state machine, least privileges, and dispatch inputs.

- [x] **Step 1: Rewrite shell assertions and simulations first**

Change the static guards to require both ownership comments near the top, schema-v1 configuration fields, and byte parity with `packages/prism-core/config/release.yml`. Add executable fake-`gh` simulations for:

- absent config repository-only release;
- schema-v1 and dispatch legacy configuration;
- package version mismatch before repository publication;
- repository `gh release create` before any `git/refs` POST;
- fresh, same-target, and wrong-target package tags;
- repository tag without Release recovery followed by package reconciliation;
- publication failure while the back-merge `gh api compare`/`gh pr create` path still executes;
- package-tag failure while back-merge still executes;
- malformed/unowned schema rejection;
- historical `0.1.0`, `0.2.0`, and `0.2.1` fixture shapes.

Use one fake `gh` executable that appends each argv array to a fixture log. Assert ordering by line number in that log, not by grepping workflow source alone.

- [x] **Step 2: Run the workflow test and confirm Red**

Run: `bash tests/Shell/release_workflow_test.sh`

Expected: FAIL on missing ownership markers/template parity, lockstep schema, repository-first ordering, and failure-independent back-merge simulations.

- [x] **Step 3: Implement the final owned workflow and migrate Prism's config**

Place these exact comments before `name: Release` in both workflow copies:

```yaml
# prism-managed: @kyaulabs/prism-core
# prism-release-schema: 1
```

Replace `.prism/release.json` with:

```json
{
  "schemaVersion": 1,
  "managedBy": "@kyaulabs/prism-core",
  "versionPolicy": "lockstep",
  "packages": [
    "packages/prism-core",
    "packages/prism-php-web"
  ]
}
```

Keep checkout, merge/version validation, and changelog extraction as separate steps. Rename package tagging to `Prepare package release metadata`; it validates the complete config and package manifests, requires each version to equal `$VERSION`, rejects private packages and duplicate tag prefixes, writes tag records, and appends every configured package to `body.md` without calling `gh` or mutating refs.

Keep `Publish release` immediately after metadata preparation. Add `Reconcile package tags` after publication; for each TSV record, resolve the local tag, accept same-target, reject wrong-target, and create an absent ref with `gh api -X POST`.

Give the merge/version validation step `id: validate`. Set the back-merge step to:

```yaml
      - name: Open back-merge PR
        if: ${{ always() && steps.validate.outcome == 'success' }}
        run: |
          set -euo pipefail
```

Do not add `continue-on-error`, `git push`, `gh pr merge`, npm commands, package permissions, or credentials. Copy the completed installed workflow byte-for-byte to `packages/prism-core/config/release.yml`.

- [x] **Step 4: Run YAML/parity and execution simulations**

Run: `bash tests/Shell/release_workflow_test.sh`

Expected: PASS, including release-before-package-tag ordering and back-merge calls after forced publication/tag failure.

- [x] **Step 5: Create the commit**

```bash
git add .github/workflows/release.yml .prism/release.json packages/prism-core/config/release.yml tests/Shell/release_workflow_test.sh
```

```bash
prism-tool commit create --type fix --scope release --subject "publish repository releases before package tags"
```

---

### Task 5: Author Every Configured Package at the Repository Version

**Files:**
- Modify: `packages/prism-core/prompts/release.md`
- Modify: `tests/Shell/release_workflow_test.sh`

**Interfaces:**
- Consumes: confirmed literal repository version `X.Y.Z` and validated managed configuration.
- Produces: one version update and inert publish command per configured package; no conversational `BUMPED_PKGS` state.

- [x] **Step 1: Change prompt contract tests to lockstep behavior**

Replace P23/P24 assertions and add checks requiring:

```text
git fetch origin develop main --tags
git merge-base --is-ancestor origin/main HEAD
npm --prefix PACKAGE_DIRECTORY version X.Y.Z --no-git-tag-version
git add PACKAGE_DIRECTORY/package.json
```

Assert absence of `--include-path`, `--tag-pattern`, `PACKAGE_PREFIX@.*`, `NEXT_VERSION`, `BUMPED_PKGS`, and “bumped packages”. Assert no-config prose explicitly says repository-only and no npm commands. Assert publish commands are emitted for every configured package and remain outside executable Bash fences.

- [x] **Step 2: Run the prompt contract and confirm Red**

Run: `bash tests/Shell/release_workflow_test.sh`

Expected: FAIL because `/release` still computes independent package versions and fetches no `main` ref.

- [x] **Step 3: Replace stale-main and per-package authoring sections**

Use this preflight sequence:

```bash
git fetch origin develop main --tags
git rev-parse HEAD
git rev-parse origin/develop
git merge-base --is-ancestor origin/main HEAD
```

The first two SHAs must match. Exit 1 from the ancestry command reports that `develop` does not contain the latest `main` and instructs the human to merge the `main` → `develop` back-merge PR; other Git errors remain fatal.

When `.prism/release.json` is absent, state explicitly that authoring is repository-only. When present, require the exact owned schema, validate all package paths/manifests before any `npm version`, and then run once per literal package directory:

```bash
npm --prefix PACKAGE_DIRECTORY version X.Y.Z --no-git-tag-version
```

Read each resulting manifest and require exact `X.Y.Z`. Stage `CHANGELOG.md`, then stage each literal `PACKAGE_DIRECTORY/package.json` in separate calls. Print one inert `cd PACKAGE_DIRECTORY && npm publish --access public` line for every configured package. State that CI tags every configured package, not only source-changed packages.

- [x] **Step 4: Run the prompt/workflow suite**

Run: `bash tests/Shell/release_workflow_test.sh`

Expected: PASS with no independent-version vocabulary or executable npm publication.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/prompts/release.md tests/Shell/release_workflow_test.sh
```

```bash
prism-tool commit create --type feat --scope release --subject "author package versions in lockstep"
```

---

### Task 6: Integrate Package Releases into `/setup` Independently of Adapters

**Files:**
- Modify: `packages/prism-core/prompts/setup.md`
- Modify: `tests/Shell/release_workflow_test.sh`
- Modify: `tests/Node/prism-tool-package-release-transaction.test.js`

**Interfaces:**
- Consumes: `package-release inspect|plan|apply|verify` JSON reports.
- Produces: one fresh-enable question and one displayed-diff mutation approval; adapter detection remains separate.

- [x] **Step 1: Add failing setup prompt and CLI report assertions**

Require `/setup` to run `prism-tool package-release inspect --json` before adapter detection and to handle:

- no candidates + no installed capability: no question and no write;
- `CREATE`: display exact `name`, `path`, `version`; ask `Enable lockstep npm package releases for these packages? (yes/no)`;
- `UNCHANGED`: report enabled/current without mutation question;
- `UPDATE`/`MIGRATE`: produce/display plan diff and ask one mutation question;
- `CONFLICT`: report both managed paths and stop without overwrite;
- apply only with literal `--approval=yes`, then verify;
- decline: no plan/apply mutation and no removal of an existing capability.

Assert the package-release section neither names the PHP adapter nor depends on adapter installation.

- [x] **Step 2: Run focused tests and confirm Red**

Run: `node --test tests/Node/prism-tool-package-release-transaction.test.js`

Run: `bash tests/Shell/release_workflow_test.sh`

Expected: FAIL because setup orchestration does not mention the new launcher operations.

- [x] **Step 3: Add the package-release setup stage**

Insert a Core capability stage after global readiness/model preferences and before adapter detection. Use these exact observable commands in separate Bash fences:

```bash
prism-tool package-release inspect --json
```

```bash
prism-tool package-release plan --json
```

```bash
prism-tool package-release apply --plan=/validated/project-local/plan.json --approval=yes --json
```

```bash
prism-tool package-release verify --json
```

Keep report values as validated inert conversation data. Only `CREATE` asks the enablement question. `UPDATE` and `MIGRATE` are already opted in but still require the displayed-diff mutation approval. `UNCHANGED` writes nothing. `CONFLICT` stops this capability while allowing the human to continue unrelated setup stages only after the conflict is clearly reported; it never invents a merge or overwrite path.

- [x] **Step 4: Run focused setup/release tests**

Run: `node --test tests/Node/prism-tool-package-release-transaction.test.js`

Run: `bash tests/Shell/release_workflow_test.sh`

Expected: PASS.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/prompts/setup.md tests/Shell/release_workflow_test.sh tests/Node/prism-tool-package-release-transaction.test.js
```

```bash
prism-tool commit create --type feat --scope setup --subject "manage lockstep package releases"
```

---

### Task 7: Package the Canonical Workflow and Update Publication Documentation

**Files:**
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `packages/prism-core/README.md`
- Modify: `NPM.md`

**Interfaces:**
- Consumes: final Core module/template and managed lockstep behavior.
- Produces: published Core tarball containing `config/release.yml` and `scripts/prism-tool/package-release.js`; accurate human publication playbook.

- [ ] **Step 1: Add failing tarball assertions**

Extend the Core package test:

```js
assert.equal(packed.files.has('config/release.yml'), true, 'canonical release workflow packaged');
assert.equal(
    packed.files.has('scripts/prism-tool/package-release.js'),
    true,
    'package-release launcher module packaged'
);
```

Read the packed `config/release.yml` and assert both ownership markers are present. Also read `NPM.md` and assert it contains `lockstep`, contains no `NPM_AUTOMATION_TOKEN`, and contains no sentence stating that packages version independently.

- [ ] **Step 2: Run packaging test and confirm Red on stale publication documentation**

Run: `node --test tests/Node/toolchain-packaging.test.js`

Expected: FAIL because `NPM.md` still describes independent versions and an npm automation token; package inventory assertions must also remain green.

- [ ] **Step 3: Update Core and npm documentation**

In `packages/prism-core/README.md`, add the package-release capability to “What it provides” and document that `/setup` discovers root/workspace packages, shows the exact list, and installs owned configuration plus workflow only after approval.

In `NPM.md`:

- remove all independent-version wording and the automated npm-publish recommendation/token instructions that contradict the accepted non-goal;
- state that each configured package version equals `vX.Y.Z` without the `v` in `package.json`;
- state that package tags are reconciled by release CI after the GitHub Release;
- state that `/release` prints one human-run command per configured package, even for version-only releases;
- preserve OTP/2FA and `--access public` guidance;
- remove `NPM_AUTOMATION_TOKEN` from checklists and troubleshooting because CI owns no npm credentials.

- [ ] **Step 4: Run packaging and full Node suites**

Run: `node --test tests/Node/toolchain-packaging.test.js`

Expected: PASS.

Run: `npm run test:node`

Expected: PASS.

- [ ] **Step 5: Create the commit**

```bash
git add tests/Node/toolchain-packaging.test.js packages/prism-core/README.md NPM.md
```

```bash
prism-tool commit create --type docs --scope release --subject "document managed lockstep package releases"
```

---

### Task 8: Aggregate Verification and Review Readiness

**Files:**
- Modify only files required to fix failures found by the mandatory gates; do not broaden behavior.

**Interfaces:**
- Consumes: all prior task commits.
- Produces: verified acceptance-criteria evidence and a clean staged/working tree before branch finalization.

- [ ] **Step 1: Run focused release suites**

Run: `node --test tests/Node/prism-tool-package-release-discovery.test.js tests/Node/prism-tool-package-release-transaction.test.js tests/Node/toolchain-packaging.test.js`

Expected: PASS.

Run: `bash tests/Shell/release_workflow_test.sh`

Expected: PASS with YAML parsing, canonical parity, historical recovery, repository-first ordering, all package-tag states, and back-merge-after-failure simulations.

- [ ] **Step 2: Run aggregate project verification**

Run: `npm run test:node`

Expected: PASS.

Run the full shell suite through the repository's established shell test command used by `/check`.

Expected: PASS.

Load `verification-before-completion`, then run `/check`.

Expected: GO, including Pest, PHP CS Fixer, Stylelint, ESLint, Semgrep, harness validation, workflow YAML validation, and changed-file coverage requirements.

- [ ] **Step 3: Inspect acceptance criteria and repository state**

Verify all 17 spec acceptance criteria against tests/diff. Confirm:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intentional uncommitted review fixes, or a clean tree after the final fix commit.

- [ ] **Step 4: Commit only gate-driven fixes when necessary**

Stage only the exact files changed to resolve verified failures, then use a task-specific Conventional Commit subject through the exclusive launcher. If no files changed, create no empty commit.

- [ ] **Step 5: Run four-axis review and triage**

Load `code-review` and run tooling/style, Fowler structural, requirement coverage, and static security axes. Load `receiving-code-review` for any findings; fix Blocking findings and resolve or explicitly defer eligible non-blocking findings without expanding the approved design.

Expected: no blocking findings before the branch-finishing workflow.

---

## Self-review

- **Spec coverage:** Tasks 1–3 cover discovery, containment/symlink rejection, schema, ownership, plan drift, atomic create/update/migration, rollback, and verification. Task 4 covers canonical parity, package/version validation, all publication/tag/recovery states, historical dispatch compatibility, repository-first ordering, and back-merge reachability after failure. Tasks 5–6 cover no-config behavior, lockstep authoring, stale-main protection, inert publish commands, and `/setup` orchestration. Task 7 covers package distribution and human publication documentation. Task 8 covers aggregate gates and four-axis review.
- **Placeholder scan:** No deferred marker or undefined interface remains. Fixture path tokens in prose are validated literal examples, not source placeholders.
- **Type consistency:** Package records consistently use `{name, path, version, tagPrefix}`; configuration consistently uses `schemaVersion`, `managedBy`, `versionPolicy`, and `packages`; launcher operations consistently use `package-release inspect|plan|apply|verify`; ownership dispositions are consistent across tests, CLI, prompt, and transaction code.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
