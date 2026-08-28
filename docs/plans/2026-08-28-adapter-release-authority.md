# Adapter Release Authority Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans`, `tdd`, `security-coding`, and `tdd-php` skills. The active
> code is Node.js/Core rather than PHP, so use the repository's focused Node and
> Shell commands while retaining the adapter's full `/check` gate. Steps use
> checkbox (`- [ ]`) syntax for tracking. Each implementation task follows Red
> → Green → Refactor inline.

**Goal:** Add a closed, reviewed adapter release declaration to Prism's Core-owned package-release capability so stable release commits can become catalogue compatibility authority.

**Architecture:** Bump the owned package-release schema and workflow marker to version 2. Add an `adapterReleases` array whose entries bind one release-managed package path to adapter identity, display name, reviewed Core range, bootstrap protocol, and status; package name and release version remain derived from the validated manifest. Setup creates schema 2 with an empty declaration set, preserves and validates declarations during updates, and migrates supported schema-1 state without inference.

**Tech Stack:** Node.js 22.19+, CommonJS Core launcher modules, built-in `node:test`, Bash workflow drift/extracted-step tests, GitHub Actions YAML, bundled `semver` 7.8.5

**Originating issue:** #463

## Global constraints

- Follow `docs/specs/2026-08-28-automated-signed-adapter-catalogue-publication-spec.md`, ADR-0094, and ADR-0095.
- The managed release schema and `# prism-release-schema:` marker advance from `1` to `2` together.
- Schema 2 has exactly `adapterReleases`, `managedBy`, `packages`, `schemaVersion`, and `versionPolicy` at the root.
- `adapterReleases` is an array with at most 64 entries and may be empty for repositories that publish no catalogue adapter.
- Each entry has exactly `package`, `id`, `displayName`, `coreRange`, `bootstrapProtocol`, and `status`.
- `package` must identify exactly one configured release-managed public package path; duplicate package paths and adapter IDs fail closed.
- Adapter IDs use the supported-adapter ID grammar; display names are bounded and contain no control characters.
- `coreRange` must be a canonical valid SemVer range accepted by bundled `semver`; do not infer it from package or repository versions.
- `bootstrapProtocol` is a positive safe integer and must equal the selected adapter package manifest's existing `prism.bootstrapProtocol` when that manifest declares `prism.adapter: true`.
- `status` is exactly `ACTIVE` or `REVOKED`.
- Package name and release version are derived from the validated package manifest and are never duplicated as caller-controlled declaration fields.
- Schema-1 managed configuration and the exact packages-only historical recovery shape remain migration/recovery inputs only; new rendering always emits schema 2.
- Setup migration from schema 1 renders `adapterReleases: []`; it never invents compatibility.
- Updating valid schema-2 state preserves its validated declarations while reconciling package candidates and the canonical workflow.
- Registry URLs, npm integrity, publication timestamps, commands, credentials, sequence, branch names, and signing input are forbidden declaration fields.
- No new dependency is added; use Core's existing exact `semver` dependency.
- All source changes retain required RCS headers and vim modelines.

---

### Task 1: Persist the approved design authority

**Files:**

- Modify: `CONTEXT.md`
- Modify: `adr/0092-signed-compatible-adapter-discovery.md`
- Create: `adr/0094-protected-actions-catalogue-signing-custody.md`
- Create: `adr/0095-cross-repository-catalogue-publication-transaction.md`
- Create: `docs/specs/2026-08-28-automated-signed-adapter-catalogue-publication-spec.md`
- Create: `docs/plans/2026-08-28-adapter-release-authority.md`

**Interfaces:**

- Consumes: completed Wayfinder map #455 and accepted decisions #456–#461.
- Produces: accepted architecture and domain vocabulary consumed by every later task.

- [x] **Step 1: Verify the approved artifacts are present and structurally clean**

Run:

```bash
git diff --check
```

Expected: exit code `0`.

Stage only the six listed paths, then run:

```bash
prism-tool markdown lint --cached
```

Expected: exit code `0` with no diagnostics.

- [x] **Step 2: Create the design-authority commit**

Load `conventional-commits`, stage the six listed paths, and run this as the only tool call in its assistant batch:

```bash
prism-tool commit create --type docs --scope architecture --subject "record automated catalogue publication authority" --refs 463
```

Expected: one signed commit containing no implementation code.

---

### Task 2: Parse and render schema-2 adapter release declarations

**Files:**

- Modify: `packages/prism-core/scripts/prism-tool/package-release.js`
- Modify: `tests/Node/prism-tool-package-release-discovery.test.js`

**Interfaces:**

- Consumes: package candidates from `discoverReleasePackages({projectRoot})` and managed release JSON.
- Produces: `loadReleaseConfiguration({projectRoot, allowLegacy}) -> {kind, packages, adapterReleases}` and `renderManagedConfiguration(candidates, adapterReleases = []) -> string`.

- [x] **Step 1: Write failing parser and renderer tests**

Add focused tests asserting:

```javascript
const declaration = {
    package: 'packages/adapter',
    id: 'fixture-adapter',
    displayName: 'Fixture adapter',
    coreRange: '>=1.2.3 <2.0.0',
    bootstrapProtocol: 1,
    status: 'ACTIVE',
};
```

The Red assertions must cover:

1. schema 2 loads and returns the frozen/normalized declaration;
2. rendering emits root keys in canonical JSON order with `adapterReleases` after `packages`;
3. package name/version are absent from rendered declaration data;
4. schema 1 is rejected normally but accepted as migration input when `allowLegacy` is true, returning `adapterReleases: []`;
5. exact packages-only recovery remains accepted only with `allowLegacy`;
6. unknown root/entry keys, duplicate package/ID, unmanaged/private package, invalid ID/display/range/protocol/status, and protocol disagreement fail closed.

Use a fixture adapter manifest containing:

```json
{
  "name": "@fixture/adapter",
  "version": "1.2.3",
  "prism": {
    "adapter": true,
    "bootstrapProtocol": 1
  }
}
```

- [x] **Step 2: Run the focused test to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-package-release-discovery.test.js
```

Expected: FAIL because schema version 2 and `adapterReleases` are unsupported.

- [x] **Step 3: Implement the minimal closed schema**

In `package-release.js`:

- import the existing bundled `semver` package;
- set `RELEASE_SCHEMA_VERSION = 2` and `WORKFLOW_SCHEMA_MARKER = '# prism-release-schema: 2'`;
- add bounded adapter ID, display name, count, protocol, and status validation;
- validate `coreRange` with `semver.validRange()` and require the returned canonical range to equal the supplied range;
- map every declaration's `package` through the already validated configured package records;
- read the package manifest's closed `prism.adapter` and `prism.bootstrapProtocol` evidence without accepting package-manifest compatibility authority;
- return normalized declaration records from `loadReleaseConfiguration`;
- render schema 2 deterministically from `renderManagedConfiguration(candidates, adapterReleases = [])`;
- keep schema 1 and packages-only shapes behind `allowLegacy`, both normalized to an empty declaration set.

The normalized entry interface is exactly:

```javascript
{
    package: 'packages/adapter',
    id: 'fixture-adapter',
    displayName: 'Fixture adapter',
    coreRange: '>=1.2.3 <2.0.0',
    bootstrapProtocol: 1,
    status: 'ACTIVE',
}
```

Do not add package name, version, URL, integrity, timestamp, command, credential, sequence, or signing fields.

- [x] **Step 4: Run the focused test to verify Green**

Run:

```bash
node --test tests/Node/prism-tool-package-release-discovery.test.js
```

Expected: PASS.

- [x] **Step 5: Create the schema commit**

Load `conventional-commits`, stage the two listed paths, and run this as the only tool call in its assistant batch:

```bash
prism-tool commit create --type fix --scope security --subject "validate adapter release declarations" --refs 463
```

---

### Task 3: Preserve declarations through setup migration and updates

**Files:**

- Modify: `packages/prism-core/scripts/prism-tool/package-release.js`
- Modify: `tests/Node/prism-tool-package-release-transaction.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-capabilities.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-seed.test.js`

**Interfaces:**

- Consumes: normalized configuration from Task 2.
- Produces: create/update/migrate plans that atomically install schema 2 and canonical workflow 2 without discarding valid declarations.

- [ ] **Step 1: Write failing transaction tests**

Add Red cases proving:

- absent capability renders schema 2 with `adapterReleases: []`;
- schema-1 managed config plus owned workflow 1 is a supported migration to schema 2;
- packages-only legacy recovery also migrates to schema 2;
- schema-2 outdated workflow updates while preserving exact declarations;
- adding/removing discovered release-managed packages fails if a preserved declaration would point at a removed package;
- apply and verify carry `adapterReleases` through closed reports without exposing additional authority;
- rollback and recovery preserve pre-transaction schema-1 or schema-2 bytes exactly on failure;
- bootstrap capability, combined plan, and root-seed inventories include the updated canonical files without changing provider boundaries.

- [ ] **Step 2: Run focused tests to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-package-release-transaction.test.js tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js
```

Expected: FAIL on schema marker/config expectations and declaration preservation.

- [ ] **Step 3: Implement preservation and migration**

Change inspection/rendering so:

```text
CREATE                 -> schema 2 + empty adapterReleases
schema 1 + workflow 1  -> MIGRATE -> schema 2 + empty adapterReleases
legacy packages-only   -> MIGRATE -> schema 2 + empty adapterReleases
schema 2 outdated      -> UPDATE -> preserve validated adapterReleases
schema 2 canonical     -> UNCHANGED only when config and workflow match
```

Pass `configuration.adapterReleases` into desired rendering after package candidate reconciliation. Fail closed instead of dropping declarations whose package is no longer release-managed. Keep plan files, digest checks, atomic publication, rollback ownership, and durable recovery unchanged.

- [ ] **Step 4: Run focused tests to verify Green**

Run the same four-file `node --test` command.

Expected: PASS.

- [ ] **Step 5: Create the transaction commit**

Load `conventional-commits`, stage the five listed paths, and run this as the only tool call in its assistant batch:

```bash
prism-tool commit create --type fix --scope setup --subject "preserve adapter release authority" --refs 463
```

---

### Task 4: Author and validate Prism's reviewed declaration

**Files:**

- Modify: `.prism/release.json`
- Modify: `packages/prism-core/prompts/release.md`
- Modify: `tests/Shell/release_workflow_test.sh`

**Interfaces:**

- Consumes: confirmed repository release version and schema-2 configuration.
- Produces: a reviewed release commit whose PHP/web declaration remains structurally valid and whose package version equals the repository version.

- [ ] **Step 1: Write failing release-authoring contract tests**

Update the shell drift guard to require this repository declaration:

```json
{
  "package": "packages/prism-php-web",
  "id": "php-web",
  "displayName": "PHP/web",
  "coreRange": ">=0.4.1 <0.5.0",
  "bootstrapProtocol": 1,
  "status": "ACTIVE"
}
```

Add extracted authoring-contract cases that reject unknown declaration fields, unmanaged packages, package protocol disagreement, malformed ranges, and declaration/package version disagreement after lockstep version authoring.

- [ ] **Step 2: Run the shell test to verify Red**

Run:

```bash
bash tests/Shell/release_workflow_test.sh
```

Expected: FAIL because the repository configuration and release prompt still require schema 1.

- [ ] **Step 3: Update repository policy and release authoring**

Change `.prism/release.json` to schema 2 with the exact declaration above.

Update `/release` guidance to require the closed schema-2 shape before package mutation, validate every declaration against its package manifest, and revalidate after lockstep version updates. The release command must not rewrite compatibility, infer a range, or add registry/signing evidence. It stages the already reviewed configuration only when the release branch changes it deliberately.

- [ ] **Step 4: Run focused tests to verify Green**

Run:

```bash
bash tests/Shell/release_workflow_test.sh
```

Expected: PASS.

- [ ] **Step 5: Create the authoring commit**

Load `conventional-commits`, stage the three listed paths, and run this as the only tool call in its assistant batch:

```bash
prism-tool commit create --type fix --scope release --subject "author reviewed adapter compatibility" --refs 463
```

---

### Task 5: Revalidate declaration authority in release CI

**Files:**

- Modify: `packages/prism-core/config/release.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `tests/Shell/release_workflow_test.sh`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `packages/prism-core/docs/adapter-catalogue.md`

**Interfaces:**

- Consumes: immutable checked-out release merge, schema-2 release config, validated package manifests, and repository release version.
- Produces: bounded inert adapter release evidence for Task #464's later dispatch work; this task performs no cross-repository dispatch.

- [ ] **Step 1: Write failing workflow tests**

Extend workflow tests to require:

- canonical and repository workflow marker 2 parity;
- exact schema-2 root and declaration keys;
- declaration package membership in the configured package set;
- manifest `prism.adapter === true` and matching positive bootstrap protocol;
- package version equal to validated repository version;
- stable declaration data emitted only to a bounded local JSON evidence file;
- no registry, integrity, timestamp, command, credential, sequence, branch, or signing fields;
- malformed/unknown/duplicate declaration cases fail before repository publication;
- packaged workflow bytes remain exact.

- [ ] **Step 2: Run focused tests to verify Red**

Run:

```bash
bash tests/Shell/release_workflow_test.sh
```

Run:

```bash
node --test tests/Node/toolchain-packaging.test.js
```

Expected: FAIL because workflow 1 neither accepts nor emits declaration evidence.

- [ ] **Step 3: Implement immutable-merge revalidation**

In the canonical workflow, extend package metadata preparation to parse schema 2, validate the closed declaration against the already validated package TSV/manifests, and write one bounded local JSON evidence document. Preserve repository-first release publication, package-tag reconciliation, independent back-merge behavior, permissions, no npm publication, and no cross-repository call.

Copy canonical workflow bytes to the repository-owned workflow through the normal Core-owned parity update. Update catalogue documentation to identify the release declaration as compatibility authority while preserving publisher verification and signing ownership.

- [ ] **Step 4: Run focused tests to verify Green**

Run both focused commands from Step 2.

Expected: PASS.

- [ ] **Step 5: Run issue-level verification**

Load `verification-before-completion`, then run the semantic feedback loop from the investigation. Expected: `PASS: adapter compatibility declaration is present`.

Run:

```bash
node --test tests/Node/prism-tool-package-release-discovery.test.js tests/Node/prism-tool-package-release-transaction.test.js tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/toolchain-packaging.test.js
```

Run:

```bash
bash tests/Shell/release_workflow_test.sh
```

Expected: all focused tests pass.

- [ ] **Step 6: Create the terminal implementation commit**

Load `conventional-commits`, stage the five listed paths, and run this as the only tool call in its assistant batch:

```bash
prism-tool commit create --type fix --scope security --subject "verify adapter release authority in CI" --fixes 463
```

---

## Final verification and handoff

After all tasks are green:

1. Load `verification-before-completion` and rerun every focused command above.
2. Run `/check` until green.
3. Run the authorized four-axis `code-review`, including security review of all release evidence boundaries.
4. Finalize the branch through `finishing-a-development-branch`; `/pr` remains preparation-only and the human pushes/merges.
5. Do not switch Pi instances after #463. Once its pull request is merged, continue in the Prism instance with: `Continue from issue https://github.com/kyaulabs/prism/issues/464`.
6. After #464 is merged, tell the human to switch to the `prism-adapters` instance and paste: `Continue from issue https://github.com/kyaulabs/prism-adapters/issues/3`.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
