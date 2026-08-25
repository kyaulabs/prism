# Template-Backed Project Bootstrap Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Allow strict-empty Template setup to compose, durably apply, recover, verify, and seed Core-only and PHP/web projects from immutable Template capability evidence without importing remote project bytes or policy.

**Architecture:** Keep fixed public Template acquisition in Prism Core, normalize its validated report into one closed source-state record, and pass only `{mode, evidence}` plus locally selected capabilities and adapter identity to trusted providers. Persist the normalized source state under the launcher-owned bootstrap attempt, bind its digest through the combined plan and journal, and carry only immutable source evidence into `.prism/project.json` and the root-seed attestation. Blank and Template continue through the same provider, transaction, recovery, repository, hook, quality, and seed contracts.

**Tech Stack:** Node.js 22+, CommonJS, Node's built-in test runner, fixed unauthenticated HTTPS fixtures, PHP/web adapter protocol 1.

## Global constraints

- Template acquisition supports only public `kyaulabs/template` through the fixed unauthenticated HTTPS object sequence already owned by Core.
- Redirects, credentials, caller-selected repositories, branches, refs, URLs, transports, archives, and authenticated GitHub access remain prohibited.
- Template responses, remote blobs, manifest bytes, catalogue files, and operational source state never become durable project files or staged root-seed entries.
- The Template manifest may advertise only the allowlisted capabilities and provider IDs validated by `template-source-validation.js`; it cannot choose capabilities, outputs, packages, scripts, defaults, metadata, or project bytes.
- Core selects trusted installed providers. Remote provider advertisements may only prove that a locally selected baseline, adapter scaffold, or optional capability is advertised.
- Every optional capability remains disabled by default; task #388 selects none and must not implement tasks #389–#391 early.
- Core-only remains an explicit nullable-adapter result. PHP/web remains the sole owner of stack manifests, locks, source/test layout, generated CI, dependencies, browser effects, checks, and verification.
- Template and Blank use the same provider-report, combined-plan, journal, durable application, recovery, repository, hook, quality, and seed schemas.
- Pre-durable Template decline or failure restores strict emptiness when ownership is proven; ambiguous state is retained for manual recovery. There is no Template-to-Blank fallback.
- Post-durable failure retains the complete project and deterministic resume evidence.
- Git remains absent until durable project application. Setup creates no remote and performs no push, publication, or hosted-repository mutation.
- No new dependency, Pi extension, safe directory, Git transport, archive parser, or template engine is introduced.
- Every created or modified `.js` source retains the required RCS header and vim modeline.

---

### Task 1: Normalize immutable Template source state

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/bootstrap-source.js`
- Modify: `packages/prism-core/scripts/prism-tool/template-source.js`
- Modify: `packages/prism-core/scripts/prism-tool/template-source-validation.js`
- Modify: `tests/Node/fixtures/template-source.js`
- Modify: `tests/Node/prism-tool-template-source.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`

**Interfaces:**
- Consumes: the closed `setup source` report produced by `inspectTemplateSource()` and local selections `{capabilities, adapter}`.
- Produces:

```javascript
function blankBootstrapSource() {}
function normalizeTemplateBootstrapSource({report, capabilities, adapter}) {}
function validateBootstrapSourceState(value) {}
```

- `blankBootstrapSource()` returns:

```javascript
{
    schemaVersion: 1,
    source: {mode: 'BLANK', evidence: null},
    catalogue: null,
}
```

- `normalizeTemplateBootstrapSource()` returns a deeply frozen record:

```javascript
{
    schemaVersion: 1,
    source: {
        mode: 'TEMPLATE',
        evidence: {
            schemaVersion: 1,
            source: 'TEMPLATE',
            templateId: 'kyaulabs/template',
            defaultBranch: '<validated branch>',
            commitSha: '<40 lowercase hex>',
            treeSha: '<40 lowercase hex>',
            manifest: {
                path: '.prism/template-manifest.json',
                blobSha: '<40 lowercase hex>',
                size: '<safe non-negative integer>',
                sha256: '<64 lowercase hex>',
            },
            classificationSha256: '<64 lowercase hex>',
        },
    },
    catalogue: {
        schemaVersion: 1,
        bootstrapProtocol: 1,
        entries: '<already normalized closed entries>',
    },
}
```

- [x] **Step 1: Write failing normalization tests**

Add tests proving that a valid fixture report normalizes into the exact source-state schema, recomputes `classificationSha256` from the normalized catalogue, and retains no HTTP response object, manifest bytes, fetch function, URL, or caller authority.

Expand `SOURCE_ENTRIES` so the fixture advertises all mandatory Core baseline capabilities (`project-readme`, `core-hooks`, `commit-policy`), the adapter scaffold, one disabled optional capability, and one excluded maintenance entry.

- [x] **Step 2: Run the focused tests and verify Red**

Run: `node --test tests/Node/prism-tool-template-source.test.js tests/Node/toolchain-packaging.test.js`

Expected: FAIL because `bootstrap-source.js` and its packaged module contract do not exist.

- [x] **Step 3: Implement closed source-state validation**

Implement exact-key, bounded-string, SHA, branch, manifest, catalogue, entry, and provider validation without accepting caller-selected coordinates. Reuse `digestJson()` for the classification digest. Require the catalogue to advertise the three mandatory Core baseline capabilities. Require `adapter-scaffold` only when `adapter !== null`. Require every locally selected optional capability to be advertised, but never derive `capabilities` from the catalogue.

Export an internal fixed-source acquisition function from `template-source.js` for a caller that has already validated a provisioned bootstrap attempt; keep `inspectTemplateSource()` as the strict-empty public inspection seam.

- [x] **Step 4: Add hostile stored-state tests**

Test one mutation at a time: unknown top-level field, changed evidence SHA, changed catalogue entry, mismatched classification digest, missing mandatory baseline advertisement, missing selected-adapter advertisement, remote attempt to preselect an optional capability, unknown provider scope/ID, duplicate normalized entry, and unsupported bootstrap protocol.

- [x] **Step 5: Run the focused tests and verify Green**

Run: `node --test tests/Node/prism-tool-template-source.test.js tests/Node/toolchain-packaging.test.js`

Expected: PASS with `bootstrap-source.js` present in the packed Core package.

- [x] **Step 6: Commit the source normalization slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-source.js packages/prism-core/scripts/prism-tool/template-source.js packages/prism-core/scripts/prism-tool/template-source-validation.js tests/Node/fixtures/template-source.js tests/Node/prism-tool-template-source.test.js tests/Node/toolchain-packaging.test.js
prism-tool commit create --type feat --scope setup --subject "normalize template bootstrap source state" --issue 388 --reference refs
```

---

### Task 2: Accept Template source through trusted provider requests

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-providers.js`
- Modify: `packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Modify: `tests/Node/prism-tool-php-web-bootstrap.test.js`

**Interfaces:**
- Consumes: normalized provider request `{schemaVersion: 1, source, capabilities: [], metadata, adapter}` where `source` is validated by `validateBootstrapSourceState()`.
- Produces: the existing Core baseline and PHP/web provider report schemas without remote-controlled output changes.

- [x] **Step 1: Write failing provider parity tests**

Add a Core provider test and a PHP/web provider test using the same valid Template source evidence. Assert that:

1. both providers accept `source.mode === 'TEMPLATE'`;
2. Core writes the exact normalized source evidence to `.prism/project.json`;
3. the PHP/web output path list, effects, checks, verification, modes, and all bytes except the Core-owned project manifest are identical to Blank;
4. no Template path, blob SHA, manifest bytes, or catalogue entry controls an output path or file body; and
5. unknown source evidence fields fail closed.

- [x] **Step 2: Run the focused tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-php-web-bootstrap.test.js`

Expected: FAIL because both provider request validators require `BLANK` with null evidence.

- [x] **Step 3: Generalize the Core provider request**

Replace the hard-coded project manifest source with `request.source`. Validate only the two supported normalized source forms:

```javascript
{mode: 'BLANK', evidence: null}
{mode: 'TEMPLATE', evidence: '<closed immutable attestation>'}
```

Keep `capabilities: []` for this issue. Do not pass the catalogue to `renderCoreBaseline()` and do not add Template data to README or other generated files.

- [x] **Step 4: Generalize the adapter provider request**

Allow the PHP/web adapter to accept the same two source forms while treating source evidence as opaque validated context. Do not branch scaffold rendering, dependency behavior, browser behavior, checks, or verification by source mode.

- [x] **Step 5: Run the focused tests and verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-php-web-bootstrap.test.js`

Expected: PASS; Blank behavior remains unchanged and Template changes only the Core-owned project manifest evidence.

- [x] **Step 6: Commit the provider parity slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-providers.js packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-php-web-bootstrap.test.js
prism-tool commit create --type feat --scope setup --subject "accept template provider requests" --issue 388 --reference refs
```

---

### Task 3: Plan Template-backed Core-only projects

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-plan.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-journal.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`

**Interfaces:**
- Consumes: `setup project plan --source=template --adapter=core-only --network-approved=yes --json`, metadata JSON on stdin, fixed-source fetch implementation, and `randomUUID`.
- Produces: the existing `PLAN_READY` report plus `sourceDigest`, with `source.mode === 'TEMPLATE'` and immutable evidence.

- [x] **Step 1: Write the failing Core-only Template plan test**

Use `createTemplateFixture()` through the public CLI. Assert the fixed four-request sequence, one Core provider, zero optional capabilities, seven Core outputs, no remote bytes in the candidate, and these plan fields:

```javascript
{
    source: {mode: 'TEMPLATE', evidence: '<immutable attestation>'},
    sourceDigest: '<64 lowercase hex>',
    adapter: null,
    capabilities: [],
}
```

Assert `reports/source.json` is mode `0600`, contains only `{schemaVersion, source, catalogue}`, and hashes to `sourceDigest`.

- [x] **Step 2: Run the focused test and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: FAIL with project-plan usage restricted to `--source=blank`.

- [x] **Step 3: Add Template planning controls**

Accept exactly:

```text
--source=template --adapter=core-only --network-approved=yes [--json]
```

Continue rejecting missing approval, approval on Blank, duplicate controls, unknown source values, caller repository/branch/URL controls, and adapter attempts on Core-only.

Acquire and normalize Template source before creating launcher-owned attempt directories. Pass the normalized source to the existing Core plan builder.

- [x] **Step 4: Persist and bind normalized source state**

Write `reports/source.json` create-only at `0600`. Add `sourceDigest` to the plan and prepared journal. Include the source report in `attemptInventoryDigest`. Update plan/journal validators so Blank and Template share one schema and source evidence is revalidated against `reports/source.json` before plan validation succeeds.

Do not persist HTTP responses or manifest bytes. Keep the normalized catalogue only in private attempt state; only `plan.source.evidence` enters the candidate project manifest.

- [x] **Step 5: Add failure and no-fallback tests**

Prove that network rejection, hostile Template data, changed source state, stale source digest, and provider failure leave a Core-only root strictly empty. Assert no failure report or filesystem state changes source mode to Blank.

- [x] **Step 6: Run the focused tests and verify Green**

Run: `node --test tests/Node/prism-tool-template-source.test.js tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: PASS for both Blank and Template Core-only planning.

- [x] **Step 7: Commit the Core-only planning slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-plan.js packages/prism-core/scripts/prism-tool/bootstrap-journal.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-plan.test.js
prism-tool commit create --type feat --scope setup --subject "plan template-backed core projects" --issue 388 --reference refs
```

---

### Task 4: Plan Template-backed selected-adapter projects

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-adapter.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-plan.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-bootstrap-adapter.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`

**Interfaces:**
- Consumes: a provisioned adapter receipt whose `source` is `TEMPLATE`, then `setup project plan --source=template --adapter=@kyaulabs/prism-php-web --attempt=<UUID> --network-approved=yes --json`.
- Produces: the existing two-provider combined plan with Template source evidence and unchanged adapter report schema.

- [x] **Step 1: Write failing Template adapter receipt tests**

Provision the PHP/web adapter with `--source=template`. Assert the receipt records `TEMPLATE`, inspection accepts it only when the requested plan source is also `TEMPLATE`, and Blank/Template receipt substitution fails closed.

- [x] **Step 2: Run adapter tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-adapter.test.js`

Expected: FAIL because provisioned receipt inspection requires `receipt.source === 'BLANK'`.

- [x] **Step 3: Bind adapter attempts to the selected source**

Add an explicit expected source to `inspectProvisionedBootstrapAdapter()` and `openSelectedAttempt()`. Accept only `BLANK` or `TEMPLATE`; require exact equality between receipt, plan control, and normalized source state on every initial and retained validation.

- [x] **Step 4: Write the failing selected-adapter Template plan test**

Provision the adapter first, then plan through the public CLI. Assert Template acquisition occurs only after the exact attempt and adapter receipt are validated. Assert the resulting provider IDs remain `core-baseline` and `php-web-scaffold`, output/effect/check/verification counts match Blank, and the project plan binds the Template source and source digest.

- [x] **Step 5: Implement selected-adapter Template planning**

For a selected adapter, validate the provisional attempt before fixed Template acquisition. Invoke the internal fixed-source acquisition function without rerunning strict-empty routing, normalize the report against the selected adapter, then call the same adapter preparation and Core composition path used by Blank.

If acquisition, normalization, provider rendering, composition, or plan persistence fails before durability, remove only ownership-proven adapter and attempt state and prove strict emptiness. If cleanup cannot prove ownership, return `RECOVERY_REQUIRED` with the exact retained attempt path and one action.

- [x] **Step 6: Add cleanup and no-fallback tests**

Inject failure at each boundary: before first request, after repository metadata, after commit, after tree, after manifest, after source persistence, during Core rendering, during adapter rendering, and during plan validation. Assert exact cleanup or bounded retained recovery, never Blank fallback, and never a second adapter installation.

- [x] **Step 7: Run focused tests and verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-php-web-bootstrap.test.js`

Expected: PASS with one provisional adapter installation and one fixed Template acquisition.

- [x] **Step 8: Commit the selected-adapter planning slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-adapter.js packages/prism-core/scripts/prism-tool/bootstrap-plan.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-bootstrap-plan.test.js
prism-tool commit create --type feat --scope setup --subject "plan template-backed adapter projects" --issue 388 --reference refs
```

---

### Task 5: Revalidate Template evidence through application and recovery

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-plan.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-journal.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-transaction.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`

**Interfaces:**
- Consumes: retained `reports/source.json`, `plan.source`, `plan.sourceDigest`, journal source evidence, plan digest, and applied project manifest.
- Produces: unchanged `PROJECT_DURABLE`, `ROOT_RESTORED`, and `RECOVERY_REQUIRED` report schemas with Template evidence continuity enforced.

- [x] **Step 1: Write failing source-substitution tests**

After planning but before validation/application/recovery, independently mutate:

1. `reports/source.json` evidence;
2. the normalized catalogue;
3. `sourceDigest` in the plan envelope;
4. source evidence in the journal;
5. source evidence in candidate `.prism/project.json`; and
6. source evidence in the applied durable `.prism/project.json`.

Assert every changed state fails closed before additional project mutation.

- [x] **Step 2: Run the focused tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: at least one substituted source state is not yet independently revalidated.

- [x] **Step 3: Enforce source continuity**

Centralize source-state restoration in `bootstrap-plan.js`: read `reports/source.json` through the existing bounded held-file seam, validate its closed schema, recompute its digest, compare its `source` to the plan and journal, and rerun catalogue selection checks against the retained adapter and selected capabilities.

Require durable validation to compare `.prism/project.json.source` to the plan source. Keep recovery offline: it revalidates retained immutable evidence and does not contact the moving default branch again.

- [x] **Step 4: Verify rollback and recovery behavior**

Prove a pre-durable source mismatch removes only exact owned state when safe, while a post-durable mismatch retains the complete project and reports manual recovery. Prove Template operational source state remains beneath `.pi/prism-tool/bootstrap/<attempt>/` and never moves into the durable inventory.

- [x] **Step 5: Run the focused tests and verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: PASS for plan validation, application, durable validation, and recovery with source substitution blocked.

- [x] **Step 6: Commit the continuity slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-plan.js packages/prism-core/scripts/prism-tool/bootstrap-journal.js packages/prism-core/scripts/prism-tool/bootstrap-transaction.js tests/Node/prism-tool-bootstrap-plan.test.js
prism-tool commit create --type feat --scope setup --subject "bind template source recovery evidence" --issue 388 --reference refs
```

---

### Task 6: Bind Template evidence into root-seed readiness

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-seed.js`
- Modify: `tests/Node/prism-tool-bootstrap-seed.test.js`

**Interfaces:**
- Consumes: a durable Template Core-only or selected-adapter plan, complete journal, repository evidence, active hooks, and exact staged inventory.
- Produces: the existing seed attestation schema with `source` carrying immutable Template evidence and no operational catalogue or remote bytes.

- [ ] **Step 1: Write failing Template seed tests**

Create one ready Core-only Template project and one ready PHP/web Template project through the public launcher seams. Assert the attestation binds:

- `templateId`;
- validated default branch;
- immutable commit and tree SHAs;
- manifest path, blob SHA, size, and SHA-256;
- classification SHA-256;
- provider identities and report digests;
- nullable or selected adapter evidence;
- plan, applied inventory, durable journal, hooks, and staged index.

Assert staged names contain only `plan.outputs` plus `.pi/settings.json` for the selected adapter.

- [ ] **Step 2: Run seed tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-seed.test.js`

Expected: FAIL because no public Template plan reaches seed readiness yet or the active attestation validator does not reject substituted Template evidence.

- [ ] **Step 3: Close Template attestation validation**

Reuse the validated plan source in attestation creation. Validate the complete closed Template evidence shape when reading an active seed, compare it byte-for-byte to journal and durable plan source, and reject changed source, plan, journal, provider, adapter, hook, or staged evidence without changing the index.

Do not add catalogue entries, source-report digests, manifest bytes, HTTP responses, URLs, or operational paths to the staged inventory or durable project.

- [ ] **Step 4: Add exclusion and substitution tests**

Assert no staged or committed path begins with `.pi/prism-tool/`; no remote blob content appears in project files; no `.prism/template-manifest.json` is created; no Git remote exists; and changing any Template attestation field blocks readiness or completion.

- [ ] **Step 5: Run focused tests and verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: PASS for Blank and Template, Core-only and selected-adapter seed readiness.

- [ ] **Step 6: Commit the seed slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-seed.js tests/Node/prism-tool-bootstrap-seed.test.js
prism-tool commit create --type feat --scope setup --subject "attest template-backed root seeds" --issue 388 --reference refs
```

---

### Task 7: Complete public Template bootstrap and documentation regressions

**Files:**
- Modify: `tests/Node/prism-tool-bootstrap-seed.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Modify: `tests/Node/prism-tool-template-source.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `packages/prism-core/README.md`
- Modify: `packages/prism-php-web/README.md`
- Modify: `docs/plans/2026-08-25-template-backed-project-bootstrap.md`

**Interfaces:**
- Consumes: public route, adapter selection, project plan, project apply/recover, repository, hooks, and seed commands with injected true-system-boundary fixtures.
- Produces: end-to-end regression evidence for task #388. Prompt orchestration remains task #392.

- [ ] **Step 1: Add the Core-only public end-to-end test**

Exercise `route(template)` → `project plan(template, core-only)` → `project apply` → repository create → hook inspect/apply → seed prepare. Assert exactly one fixed Template request sequence, no adapter command, no dependency/browser effect, immutable evidence continuity, exact staging, no remote, no publication, and no Template-to-Blank fallback.

- [ ] **Step 2: Add the PHP/web public end-to-end test**

Exercise `route(template)` → adapter catalogue/select with source Template → `project plan(template, selected adapter)` → durable effects → repository → hooks → seed. Assert one adapter installation, one fixed Template request sequence, one adapter quality run, no Template project bytes, exact staging, and no clone/fetch/pull/push/remote/npm-publish operation.

- [ ] **Step 3: Add failure-matrix regressions**

Cover Core-only and selected-adapter Template failure before source readiness, before plan readiness, before durability, and after durability. Assert strict-empty restoration or exact retained resume state and prove every failure remains Template rather than silently becoming Blank.

- [ ] **Step 4: Document the public contract**

Update Core README sections from Blank-only wording to Template-and-Blank provider composition. State that Template is immutable untrusted catalogue evidence, all project bytes come from trusted installed providers, source evidence is digest-bound through plan/recovery/seed, and setup performs no remote publication.

Update the PHP/web README to state that the same generic adapter preparation/report and quality contract serves Blank and Template without source-dependent stack output.

Do not modify `packages/prism-core/prompts/setup.md`; complete interactive orchestration belongs to task #392.

- [ ] **Step 5: Run focused and full Node verification**

Run:

```bash
node --test tests/Node/prism-tool-template-source.test.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-php-web-bootstrap.test.js tests/Node/toolchain-packaging.test.js
npm run test:node
```

Expected: PASS with no skipped Template cases and unchanged established-project adapter regressions.

- [ ] **Step 6: Mark the plan complete and commit regressions/docs**

Mark every completed checkbox in this plan, then run the `verification-before-completion` skill.

```bash
git add tests/Node/prism-tool-template-source.test.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/toolchain-packaging.test.js packages/prism-core/README.md packages/prism-php-web/README.md docs/plans/2026-08-25-template-backed-project-bootstrap.md
prism-tool commit create --type test --scope setup --subject "regress template-backed project bootstrap" --issue 388 --reference refs
```

---

## Final verification

After all tasks are green:

1. Load `verification-before-completion` and rerun every focused command from the plan.
2. Run `npm run test:node`.
3. Run `/check` and resolve all failures without bypasses.
4. Confirm `git status --short` contains no debug artifacts or unexpected generated files.
5. Confirm no new dependency, credential file, remote, pushed ref, or hosted mutation was introduced.
6. Hand the completed branch to `finishing-a-development-branch` for cleanup, target synchronization, `/check`, one four-axis review, and preparation-only `/pr`.

## Self-review

- Spec coverage: immutable source identity, complete classification binding, advertised-only provider/capability use, disabled-by-default capabilities, Core-only and selected-adapter Template support, shared Blank/Template schemas, source substitution rejection, pre/post-durable recovery, seed evidence, remote-byte exclusion, no fallback, and no publication are each assigned to a task.
- Deliberate deferral: governance/collaboration, security/identity, release-management, and prompt orchestration remain tasks #389–#392.
- Placeholder scan: no unresolved placeholder or unspecified implementation step remains.
- Type consistency: `source`, `sourceDigest`, `reports/source.json`, and the Template evidence shape are named consistently across plan, journal, project manifest, transaction, and seed tasks.
