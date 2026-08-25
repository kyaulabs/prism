# Blank PHP/Web Bootstrap Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Allow strict-empty Blank setup to compose, durably apply, verify, and seed the complete application-free PHP/web scaffold through the selected adapter without moving PHP/web behavior into Prism Core.

**Architecture:** Extend the validated PHP/web adapter handler with one generic `prepareBootstrapProject()` provider entry point. The adapter renders a package-owned scaffold report into the launcher-designated outer bootstrap candidate root; Core validates the selected adapter identity and generic report envelope, composes it with the Core baseline, applies both through the existing durable outer transaction, and carries adapter evidence into hooks, quality, and root-seed attestation.

**Tech Stack:** Node.js 22+, CommonJS, PHP 8.5+, Composer, npm, Pest 5, Playwright Chromium, Node's built-in test runner.

## Global constraints

- Core must contain no PHP, Composer, Pest, Aurora, SCSS, JavaScript, nginx, MariaDB, browser, or PHP/web quality behavior.
- The selected adapter receives only normalized source mode, selected capability IDs, approved metadata, nullable adapter identity, and launcher-designated paths.
- The adapter owns every stack manifest, lock, scaffold path, generated CI file, dependency effect, browser effect, check, and verification command.
- Blank and Template must use the same adapter preparation interface; this task wires Blank only and leaves Template source orchestration to task #388.
- Existing `inspect`, `resolve`, `apply`, and `verify` adapter operations remain behaviorally unchanged.
- Composer and npm resolution/population disable lifecycle scripts; every advisory blocks.
- Browser acquisition is exactly Playwright Chromium as declared by `packages/prism-php-web/toolchain.json`.
- Pre-durable failure restores strict emptiness; post-durable failure retains the complete project and deterministic resume evidence.
- No new dependency, Pi extension, safe directory, Git transport, remote operation, or publication operation is introduced.
- Every modified or created `.js`, `.php`, and `.sh` source carries the required RCS header and vim modeline through the pre-commit normalizer.

---

### Revised Task 1A: Closed scaffold manifest and safe renderer

- [x] Prove the missing public provider interface with a failing inventory test.
- [x] Add the package-owned manifest, packaged config surface, candidate renderer, digests, modes, and handler entry point.
- [x] Add hostile unknown-field, escaping-path, and symlinked-parent tests one at a time; implement candidate-parent fail-closed validation.
- [x] Verify the focused bootstrap and packaging suites, then commit `feat(setup): render bounded php-web scaffold inventories` with `Refs: #387`.

### Revised Task 1B: Composer/npm manifests and audited locks

- [x] Test and render canonical PHP `^8.5`, exact adapter dependencies, normalized npm project identity, and shared check scripts.
- [x] Test candidate-only Composer/npm lock generation with lifecycle scripts disabled and every advisory blocking.
- [x] Verify focused bootstrap plus existing resolve/apply regressions, then commit `feat(setup): prepare php-web bootstrap dependency graphs` with `Refs: #387`.

### Revised Task 1C: PHP/Pest readiness surface

- [x] Test and add canonical PHP CS Fixer, PHPUnit/Pest, runtime, coverage-probe, browser-fixture, architecture, and RCS-convention assets.
- [x] Verify generated PHP syntax and focused bootstrap tests, then commit `feat(setup): render php-web bootstrap test surfaces` with `Refs: #387`.

### Revised Task 1D: Lint and application-free directory surface

- [x] Test and add canonical ESLint, Stylelint, ignore policy, and exact `.gitkeep` inventory.
- [x] Prove no application webroot, Aurora, SQL, nginx, deployment, SCSS/JS application source, or generated minified output is created.
- [x] Verify focused tests, then commit `feat(setup): render php-web bootstrap lint surfaces` with `Refs: #387`.

### Revised Task 1E: Shared local/CI quality implementation

- [x] Test and add `.github/scripts/check-php.sh`, the byte-identical coverage helper, and optional shell aggregator.
- [x] Prove identical gate order, validated CI base, conditional lint, bounded browser server, guaranteed cleanup, aggregate coverage, and per-file coverage.
- [x] Verify focused Node/shell tests, then commit `feat(setup): render shared php-web quality gates` with `Refs: #387`.

### Revised Task 1F: Create-only generated CI

- [x] Test every acceptance criterion in `docs/research/2026-08-20-testing-ready-generated-ci.md`.
- [x] Render pinned read-only hosted CI with full history, PHP 8.5/PCOV, Node 24, locked installs, exact Prism versions, bounded Semgrep/OCR, local-only doctor, Chromium, first-push comparison, and one shared-check invocation.
- [x] Verify focused and packaging tests, then commit `ci(setup): render php-web bootstrap verification workflow` with `Refs: #387`.

### Revised Task 1G: Closed provider report

- [x] Test malformed requests/reports, identity/version/protocol substitution, unknown effects/checks, changed bytes, and non-Chromium targets.
- [x] Implement exact request/report validation and `verifyBootstrapScaffold` with closed dependency/browser effects.
- [x] Run verification-before-completion for Revised Tasks 1A–1G, then commit `feat(setup): close php-web bootstrap provider reports` with `Refs: #387`.

### Superseded Task 1: Define and render the package-owned PHP/web scaffold

> Superseded by Revised Tasks 1A–1G above. The original detail remains as design reference; its checkboxes are not execution state.

**Files:**
- Create: `packages/prism-php-web/config/bootstrap/scaffold.json`
- Create: `packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js`
- Create: `packages/prism-php-web/config/bootstrap/assets/` with the canonical static scaffold files listed below
- Modify: `packages/prism-php-web/package.json`
- Test: `tests/Node/prism-tool-php-web-bootstrap.test.js`

**Canonical outputs:**

```text
.github/scripts/check-php.sh
.github/scripts/coverage-gate.php
.github/workflows/ci.yml
.php-cs-fixer.dist.php
.stylelintrc.json
.gitignore
composer.json
composer.lock
package.json
package-lock.json
eslint.config.mjs
phpunit.xml
backend/.gitkeep
cdn/css/.gitkeep
cdn/javascript/.gitkeep
cdn/js/.gitkeep
cdn/sass/.gitkeep
tests/bootstrap.php
tests/Pest.php
tests/Unit/Harness/ArchTest.php
tests/Unit/Harness/RcsHeaderConventionTest.php
tests/Feature/fixtures/coverage_probe.php
tests/Feature/CoverageProbeTest.php
tests/Feature/RuntimeSmokeTest.php
tests/Browser/fixtures/smoke.html
tests/Browser/SmokeTest.php
tests/Integration/.gitkeep
tests/Plugin/.gitkeep
tests/Semgrep/.gitkeep
tests/Shell/run-all.sh
```

**Interfaces:**
- Consumes: normalized provider request `{schemaVersion: 1, source, capabilities, metadata, adapter}`; adapter package root; launcher-designated candidate root; active toolchain contract; bounded subprocess runner.
- Produces: `renderBootstrapScaffold({packageRoot, candidateRoot, request, contract, run}) -> ProviderReport` with exact provider identity, bounded file outputs, dependency/browser effects, checks, and `setup verify --adapter=@kyaulabs/prism-php-web --network-approved=yes` verification.

- [ ] **Step 1: Write the failing package-render test**

Add a public handler test that calls the adapter's bootstrap preparation operation in a disposable candidate root and independently asserts the complete literal output list above, regular-file kinds, required `0644`/`0755` modes, SHA-256 digests, contained absolute candidate paths, exact provider identity, dependency effects for Composer/npm locked population, and the single Chromium browser effect.

- [ ] **Step 2: Run the focused test and verify Red**

Run: `node --test tests/Node/prism-tool-php-web-bootstrap.test.js`

Expected: FAIL because `prepareBootstrapProject` and the scaffold manifest do not exist.

- [ ] **Step 3: Implement the closed scaffold renderer**

Implement `bootstrap-scaffold.js` with these exported interfaces:

```javascript
function renderBootstrapScaffold({packageRoot, candidateRoot, request, contract, run}) {}
function verifyBootstrapScaffold({packageRoot, projectRoot, report, contract, run}) {}
module.exports = {renderBootstrapScaffold, verifyBootstrapScaffold};
```

The renderer must:

1. validate exact request keys and require source mode `BLANK`, no capabilities, approved metadata, and adapter identity matching `@kyaulabs/prism-php-web` protocol 1;
2. validate the schema-versioned manifest, reject duplicate/prefix-colliding/escaping paths, and allow only `file` entries with mode `0644` or `0755`;
3. copy static assets and render only allowlisted typed values: normalized npm project name plus exact Pi/Core/adapter/tool versions needed by generated CI;
4. create candidate parents without following symlinks, publish files create-only, hold file identity while hashing, and return no arbitrary commands;
5. produce effects with closed IDs for Composer lock resolution, npm lock resolution, Composer install, npm install, and Chromium acquisition; and
6. return checks `php-web-scaffold-render` and verification command `setup verify --adapter=@kyaulabs/prism-php-web --network-approved=yes`.

Add `config` to `package.json.files` so published adapters include the scaffold manifest and assets.

- [ ] **Step 4: Add the canonical asset contents**

Render the exact testing-ready contract recorded in `docs/research/2026-08-20-testing-ready-scaffold.md` and `docs/research/2026-08-20-testing-ready-generated-ci.md`:

- Composer: PHP `^8.5`, exact adapter `require-dev`, `test`, `test:coverage`, and `check` scripts, sorted packages, optimized autoloader, Pest plugin allowlist.
- npm: private package, normalized directory name, local check script, exact adapter dev dependencies.
- Pest/PHPUnit: application-free bootstrap, Unit/Feature/Integration/Browser/Plugin suites, PCOV-compatible coverage outputs, `backend/` plus coverage fixture source.
- Shared quality: local/CI modes with identical ordered gates, 40-hex CI base validation, conditional SCSS/JS lint, bounded fixture server, guaranteed cleanup, aggregate and changed-file 80% coverage, optional shell suite.
- CI: read-only hosted runner, full-history credential-free checkout, pinned actions, PHP 8.5 + PCOV, Node 24, locked script-disabled installs, exact Pi/Core/adapter versions, bounded Semgrep/OCR provisioning, local-only doctor, Chromium only, first-push empty-tree handling, one shared check invocation.
- Tests: runtime floor, two-outcome coverage probe, static browser fixture, non-vacuous architecture scan, RCS/header/modeline convention checks.
- Exclusions: no application webroot, Aurora checkout, SQL, nginx, deployment, SCSS/JS application source, generated minified asset, credential, `.env`, remote, or publication file.

- [ ] **Step 5: Run the focused test and package tests**

Run: `node --test tests/Node/prism-tool-php-web-bootstrap.test.js tests/Node/toolchain-packaging.test.js`

Expected: PASS with the exact scaffold inventory and packaged config assets.

- [ ] **Step 6: Commit the renderer slice**

```bash
git add packages/prism-php-web/config packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js packages/prism-php-web/package.json tests/Node/prism-tool-php-web-bootstrap.test.js
prism-tool commit create --type feat --scope setup --subject "render blank php-web bootstrap scaffolds" --issue 387 --reference refs
```

---

### Task 2: Expose the generic adapter bootstrap preparation protocol

**Files:**
- Modify: `packages/prism-php-web/scripts/prism-tool-adapter.js`
- Modify: `packages/prism-core/scripts/prism-tool/discovery.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-adapter.js`
- Test: `tests/Node/prism-tool-discovery.test.js`
- Test: `tests/Node/prism-tool-bootstrap-adapter.test.js`
- Test: `tests/Node/prism-tool-php-web-bootstrap.test.js`

**Interfaces:**
- Consumes: validated selected-adapter registration and protocol 1.
- Produces: handler method `prepareBootstrapProject(options)` while retaining `inspect`, `resolveTool`, `resolve`, `apply`, and `verify`.

- [ ] **Step 1: Write the failing discovery test**

Assert that bootstrap-capable handler loading requires `prepareBootstrapProject` when protocol 1 is requested, rejects non-functions and protocol mismatches, and leaves established-project loading compatible with all existing operations.

- [ ] **Step 2: Run discovery tests and verify Red**

Run: `node --test tests/Node/prism-tool-discovery.test.js tests/Node/prism-tool-bootstrap-adapter.test.js`

Expected: FAIL because the handler contract does not expose or validate preparation.

- [ ] **Step 3: Add the handler operation**

In `prism-tool-adapter.js`, export:

```javascript
function prepareBootstrapProject(options) {
    return renderBootstrapScaffold({
        packageRoot: __dirname + '/..',
        candidateRoot: options.candidateRoot,
        request: options.request,
        contract: options.contract,
        run: options.run,
    });
}
```

Use `path.resolve(__dirname, '..')`, not string concatenation, in production. Keep every existing export and behavior unchanged.

Update discovery/bootstrap adapter validation so protocol-1 bootstrap loading proves this method is callable after package identity, handler containment, toolchain containment, and protocol validation. Do not require it for established-project inspection paths that do not request bootstrap support.

- [ ] **Step 4: Run the focused tests and verify Green**

Run: `node --test tests/Node/prism-tool-discovery.test.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-php-web-bootstrap.test.js`

Expected: PASS; existing inspect/resolve/apply/verify assertions remain unchanged.

- [ ] **Step 5: Commit the protocol slice**

```bash
git add packages/prism-php-web/scripts/prism-tool-adapter.js packages/prism-core/scripts/prism-tool/discovery.js packages/prism-core/scripts/prism-tool/bootstrap-adapter.js tests/Node/prism-tool-discovery.test.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-php-web-bootstrap.test.js
prism-tool commit create --type feat --scope setup --subject "expose php-web bootstrap provider protocol" --issue 387 --reference refs
```

---

### Task 3: Generalize Core provider validation without importing stack policy

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-providers.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-composer.js`
- Test: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Test: `tests/Node/prism-tool-php-web-bootstrap.test.js`

**Interfaces:**
- Consumes: Core provider descriptors and one descriptor derived from a fully validated selected-adapter registration.
- Produces: generic `validateProviderReport({projectRoot, candidateRoot, registry, report})` supporting closed provider-specific output ownership, allowed effects, checks, and verification declarations.

- [ ] **Step 1: Write failing mixed-provider validation tests**

Add cases proving Core accepts one valid Core report plus one valid PHP/web report, rejects identity/version/protocol substitution, unknown report fields, unknown effects/checks/verification, invalid paths/modes/digests, and exact or prefix ownership overlap. Assert the test never imports PHP/web path literals into Core production modules.

- [ ] **Step 2: Run focused tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-php-web-bootstrap.test.js`

Expected: FAIL because validation is hard-coded to the Core baseline's seven outputs and check IDs.

- [ ] **Step 3: Deepen the provider descriptor contract**

Retain `loadTrustedProviderRegistry({coreRoot})` for Core. Add a generic trusted descriptor shape:

```javascript
{
    id,
    packageName,
    packageVersion,
    protocolVersion,
    outputs,
    effects,
    checks,
    verification,
}
```

For Core, `outputs` remains the exact seven-path list. For the selected adapter, build the descriptor only from the already validated registration plus its package-owned scaffold manifest; Core validates schema/containment but does not name or interpret PHP/web paths or commands.

Update `validateProviderReport` to compare each report section against its descriptor, validate candidate bytes safely, and return semantic outputs. Keep `composeProviderReports` as the sole overlap gate.

- [ ] **Step 4: Run focused and packaging tests**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-php-web-bootstrap.test.js tests/Node/toolchain-packaging.test.js`

Expected: PASS; malformed report matrix remains fail-closed.

- [ ] **Step 5: Commit the composition slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-providers.js packages/prism-core/scripts/prism-tool/bootstrap-composer.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-php-web-bootstrap.test.js
prism-tool commit create --type refactor --scope setup --subject "compose trusted adapter provider reports" --issue 387 --reference refs
```

---

### Task 4: Plan Blank projects with the selected PHP/web adapter

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-plan.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Test: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Test: `tests/Node/prism-tool-php-web-bootstrap.test.js`

**Interfaces:**
- Consumes: `setup adapter select` receipt, normalized metadata, selected adapter registration, Core report, adapter report.
- Produces: `prism-tool setup project plan --source=blank --adapter=@kyaulabs/prism-php-web --attempt=<UUID> [--json]` and a combined digest-bound plan.

- [ ] **Step 1: Write the failing public CLI plan test**

From a strict-empty root with a provisioned PHP/web receipt, invoke the public CLI and assert:

- adapter identity/package/version/protocol is non-null and exact;
- providers are Core baseline then PHP/web adapter;
- outputs are sorted and non-overlapping;
- effects include only adapter-declared locked dependency and Chromium effects;
- checks and verification contain both provider contracts;
- filesystem allowed root state includes only transaction-owned `.pi` before durable application;
- no PHP/web literal appears in Core except inert selected package/registration data; and
- decline or provider failure removes the provisional adapter and restores strict emptiness.

- [ ] **Step 2: Run focused tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-php-web-bootstrap.test.js`

Expected: FAIL because project planning accepts only `--adapter=core-only`.

- [ ] **Step 3: Compose the selected adapter plan**

Refactor `planCoreOnlyProject` into a generic Blank planner that:

1. revalidates the active adapter receipt and registration;
2. creates one outer candidate root;
3. renders Core with the selected adapter identity in `.prism/project.json`;
4. invokes `handler.prepareBootstrapProject()` with normalized request data and a launcher-designated adapter subroot;
5. validates and composes both reports;
6. persists `core-baseline.json`, `adapter.json`, metadata, combined plan, and journal with relative candidate paths;
7. binds adapter package/protocol/report digest in the plan; and
8. restores only transaction-owned state on every pre-durable error.

Update CLI usage to accept exactly `core-only` or the validated provisioned package. Require the receipt attempt ID for selected adapters; reject caller-selected paths, stale receipts, package substitution, and missing preparation support.

- [ ] **Step 4: Run focused tests and verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-php-web-bootstrap.test.js`

Expected: PASS for Core-only regression and adapter-selected Blank planning.

- [ ] **Step 5: Commit the plan slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-plan.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-php-web-bootstrap.test.js
prism-tool commit create --type feat --scope setup --subject "plan blank php-web bootstrap projects" --issue 387 --reference refs
```

---

### Task 5: Apply and recover the combined adapter scaffold durably

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-transaction.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-journal.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-plan.js`
- Modify: `packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js`
- Modify: `packages/prism-php-web/scripts/toolchain/transaction.js`
- Modify: `packages/prism-php-web/scripts/toolchain/workspace.js`
- Test: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Test: `tests/Node/prism-tool-php-web-bootstrap.test.js`

**Interfaces:**
- Consumes: validated combined plan and both provider candidate trees.
- Produces: one durable applied project inventory; deterministic pre-durable rollback and post-durable resume phases.

- [ ] **Step 1: Write the failing durable-application test**

Exercise the public `setup project apply` seam and assert all Core and adapter outputs appear only after approval, exact modes/digests match the plan, `.pi` package activation is retained as canonical project state, and no operational report/candidate/journal file enters the applied inventory.

Add injected failures before and after the durable marker. Before durable, assert strict emptiness. After durable, assert the complete scaffold remains and the report names the exact dependency/audit/browser/verification retry phase.

- [ ] **Step 2: Run focused tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-php-web-bootstrap.test.js`

Expected: FAIL because plan validation/application assumes one Core report and seven outputs.

- [ ] **Step 3: Apply generic combined outputs**

Update plan validation and transaction application to iterate the composed semantic output inventory rather than Core literals. Preserve the existing held-directory, digest, stale-state, lock, fsync, journal, rollback, and third-state safety rules.

Delegate adapter post-durable effects through closed handler operations only:

```javascript
installBootstrapDependencies({contract, projectRoot, run})
verifyBootstrapScaffold({packageRoot, projectRoot, report, contract, run})
```

Reuse existing script-disabled Composer/npm population, audits, exact graph verification, and Chromium installation logic. Do not run package managers before durable application. Do not roll back the scaffold after dependency, browser, audit, or verification failure.

- [ ] **Step 4: Run focused recovery tests and verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-php-web-bootstrap.test.js tests/Node/prism-tool-apply.test.js tests/Node/prism-tool-resolve.test.js`

Expected: PASS; established-project candidate transaction tests remain unchanged.

- [ ] **Step 5: Commit the durable transaction slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-transaction.js packages/prism-core/scripts/prism-tool/bootstrap-journal.js packages/prism-core/scripts/prism-tool/bootstrap-plan.js packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js packages/prism-php-web/scripts/toolchain/transaction.js packages/prism-php-web/scripts/toolchain/workspace.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-php-web-bootstrap.test.js tests/Node/prism-tool-apply.test.js tests/Node/prism-tool-resolve.test.js
prism-tool commit create --type feat --scope setup --subject "apply blank php-web projects durably" --issue 387 --reference refs
```

---

### Task 6: Bind adapter hooks, quality, and seed attestation

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-hooks.js`
- Modify: `packages/prism-core/scripts/prism-tool/hook.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-seed.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-plan.js`
- Test: `tests/Node/prism-tool-bootstrap-seed.test.js`
- Test: `tests/Shell/bootstrap_hook_dispatch_test.sh`
- Test: `tests/Node/prism-tool-php-web-bootstrap.test.js`

**Interfaces:**
- Consumes: durable selected-adapter plan and report digest.
- Produces: adapter-aware hook dispatch, shared PHP/web quality verification, exact staged inventory, and one-use seed attestation carrying adapter evidence.

- [ ] **Step 1: Write failing hook/seed tests**

Assert canonical hooks dispatch the selected adapter's public check command only when adapter evidence is present. Assert root-seed preparation binds adapter ID/package/version/protocol/report digest and exact scaffold inventory, rejects substitution, excludes operational/dependency/generated-output paths, runs shared quality before commit creation, and retains Core-only null-adapter behavior.

- [ ] **Step 2: Run focused tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-php-web-bootstrap.test.js && bash tests/Shell/bootstrap_hook_dispatch_test.sh`

Expected: FAIL because seed plan validation and attestation require a null adapter.

- [ ] **Step 3: Generalize adapter evidence and dispatch**

Update hook/seed validation to read only the generic adapter identity and verified handler registration. The hook invokes the adapter-owned shared quality entry point; Core does not name PHP/web tools or files. Extend attestation and staged-inventory equality with adapter package identity, bootstrap protocol, persisted report digest, and every applied adapter output.

Exclude `.pi/prism-tool/`, `vendor/`, `node_modules/`, browser caches, coverage output, generated CSS/JavaScript, `.env*` except `.env.example`, remotes, credentials, and unexpected index entries.

- [ ] **Step 4: Run focused tests and verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-php-web-bootstrap.test.js && bash tests/Shell/bootstrap_hook_dispatch_test.sh`

Expected: PASS for both adapter-selected and Core-only seed paths.

- [ ] **Step 5: Commit the seed slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-hooks.js packages/prism-core/scripts/prism-tool/hook.js packages/prism-core/scripts/prism-tool/bootstrap-seed.js packages/prism-core/scripts/prism-tool/bootstrap-plan.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-php-web-bootstrap.test.js tests/Shell/bootstrap_hook_dispatch_test.sh
prism-tool commit create --type feat --scope setup --subject "attest blank php-web root seeds" --issue 387 --reference refs
```

---

### Task 7: Complete adapter, packaging, and established-project regression coverage

**Files:**
- Modify: `tests/Node/prism-tool-php-web-bootstrap.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `tests/Node/prism-tool-discovery.test.js`
- Modify: `tests/Node/prism-tool-resolve.test.js`
- Modify: `tests/Node/prism-tool-apply.test.js`
- Modify: `packages/prism-php-web/README.md`
- Modify: `packages/prism-core/README.md`

**Interfaces:**
- Consumes: completed public CLI and adapter seams.
- Produces: regression evidence and public contract documentation.

- [ ] **Step 1: Add the end-to-end Blank PHP/web test**

Through public `prism-tool` commands in one disposable strict-empty root, test route → adapter selection → metadata plan → approval → durable application → dependency/browser verification stubs → hook activation → seed preparation. Assert the exact application-free scaffold, no Core stack literals, no Template network access, no remote/publication operation, and no second adapter installation approval.

- [ ] **Step 2: Add hostile and regression matrices**

Cover malformed manifest/report schemas, unsafe paths and modes, symlinked candidate parents, output overlap, stale adapter receipt/report/plan, changed candidate bytes, lifecycle-script attempts, advisory output, non-Chromium acquisition, pre/post-durable failures, rerun idempotence, and existing inspect/resolve/apply/verify behavior.

- [ ] **Step 3: Run the complete applicable Node/Shell suites**

Run: `npm run test:node`

Run: `bash tests/Shell/bootstrap_hook_dispatch_test.sh`

Run: `bash tests/Shell/toolchain_entrypoints_test.sh`

Expected: PASS.

- [ ] **Step 4: Update public documentation**

Document that strict-empty Blank setup can select exact PHP/web, that the adapter renders and verifies the application-free scaffold through the generic provider protocol, that lifecycle-script-free locked population and Chromium are disclosed effects, and that Core remains stack-agnostic. Preserve established-project documentation.

- [ ] **Step 5: Run formatting, lint, and repository verification**

Run: `npm run lint`

Run: `/check`

Expected: all Node, shell, PHP/web lint, package, hook, and harness gates PASS.

- [ ] **Step 6: Commit the regression/documentation slice**

```bash
git add tests/Node tests/Shell packages/prism-core/README.md packages/prism-php-web/README.md
prism-tool commit create --type test --scope setup --subject "regress blank php-web project bootstrap" --issue 387 --reference fixes
```

---

## Final verification

- [ ] `node --test tests/Node/prism-tool-php-web-bootstrap.test.js`
- [ ] `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-bootstrap-adapter.test.js`
- [ ] `node --test tests/Node/prism-tool-discovery.test.js tests/Node/prism-tool-resolve.test.js tests/Node/prism-tool-apply.test.js tests/Node/toolchain-packaging.test.js`
- [ ] `bash tests/Shell/bootstrap_hook_dispatch_test.sh`
- [ ] `bash tests/Shell/toolchain_entrypoints_test.sh`
- [ ] `npm run test:node`
- [ ] `/check`
- [ ] Load `verification-before-completion` and confirm no debug instrumentation, temporary fixture state, unexpected dependencies, or stack policy in Core.
- [ ] Load `finishing-a-development-branch` for cleanup, synchronization, unlimited `/check` reruns, one four-axis review, revalidation, and preparation-only `/pr`.

## Self-review

- Spec coverage: all task #387 acceptance criteria map to Tasks 1–7.
- Architecture: Core validates generic identities/reports and owns the outer transaction; PHP/web owns every stack output and effect.
- Type consistency: the plan uses one handler method (`prepareBootstrapProject`), one provider report envelope, one selected adapter identity, and the existing protocol version 1 throughout.
- Dependencies: none added; all generated consumer dependencies come from the existing adapter toolchain contract.
- Scope: Template acquisition/capability behavior remains task #388; optional governance/security/release profiles remain tasks #389–#391; prompt orchestration remains task #392.
