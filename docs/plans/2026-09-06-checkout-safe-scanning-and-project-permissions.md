# Checkout-safe scanning and umask compatibility implementation plan

> **For the executing agent:** After approval, load `executing-plans` and `tdd`.
> Work one observable behavior at a time: Red → Green → Refactor. Do not write
> every test first or resume the withdrawn permission-policy design.

**Status:** Approved with `go`; execution started
**Goal:** Fix #520 without changing project creation permissions or adapter protocols.
**Architecture:** Isolate Semgrep behind one Core execution boundary. Correct existing managed-file runtime readers while preserving exact private transaction checks. Reuse those readers for post-review readiness.
**Tech Stack:** Existing Node.js/CommonJS, Git, Semgrep, Bash, PHP/Pest. No new dependencies.
**Originating issue:** #520

## Approved planning exception

For #520 only, the user approved relevant-ADR review and a behavior/test-focused
plan without complete implementation and test code written in advance. This
exception changes neither Prism's permanent skills nor branch policy, TDD,
signing, hooks, verification, review, consent, or human publication boundaries.

The specification remains
`docs/specs/2026-09-06-checkout-safe-scanning-and-project-permissions-spec.md`.
The withdrawn plan is preserved, ignored by Git, at
`audits/2026-09-06-issue-520-withdrawn-plan.md`. It is not implementation authority
and must not be staged or used as a source of additional requirements.

## Scope and constraints

- Canonical public outputs stay `0644`/`0755`; runtime readers also accept safe
  restrictive modes, including `0640`/`0600` and `0750`/`0700`.
- Only existing Prism-managed public files are affected. No source/documentation
  permission inventory, developer migration, CI preparation engine, or protocol bump.
- Owner read is required for data; owner read/execute for executable wrappers.
  Reject bits outside the relevant canonical mask, including special bits.
- Ownership, containment, no-symlink, identity, content, and schema validation
  remain independent. Private records and package resources retain their contracts.
- Candidate modes, observed approval state, and rollback ownership stay exact.
  Verification never chmods, changes umask, repairs Git, or fabricates metadata.
- Credential/private paths are excluded before content reads, including historical
  blobs. No full-history blob clone, shared mutable Git administration, or implicit fetch.
- No real developer checkout is used to reproduce Semgrep baseline resets.
- Retain Semgrep `>=1.173.0 <2.0.0`, OCR `>=1.9.1 <2.0.0`, current review authority,
  standing OCR consent, and ADR-0103's separate release/install/cutover boundary.
- Preserve source headers/modelines, the PHP 80% changed-file coverage gate,
  generated-asset boundaries, and all existing commit hooks.
- No edits to `prism-adapters`, permanent planning rules, or release declarations.

## Architecture review

**Verdict:** GO-WITH-CONDITIONS
**ADR-required:** 0107,0108

**CONTEXT.md alignment:** Core owns scanner execution and generic validation;
PHP/web continues to own its scaffold and quality behavior. No new framework,
provider service, or repository-wide access policy is needed.

**ADR alignment:** Reviewed the governing decisions 0025, 0027, 0047, 0048,
0063, 0070, 0078, 0080, 0084, 0088, 0100, 0103, 0104, and 0105, and revised
Proposed 0107/0108. This was a relevant-ADR review under the approved exception,
not a claim to have reread all historical ADRs.

**Boundary check:** No credential, installation, network, publication, or
Core-to-adapter bootstrap authority is added. Runtime relaxation does not change
canonical provider reports, so ADR-0104 requires no bootstrap-protocol bump.

**Risks and conditions:**

- Accept ADR-0107/0108 before implementation; add only supersession metadata to
  the affected accepted ADRs and update `CONTEXT.md`.
- Core automation currently binds disposition but not exact observed modes in
  retained plans. Adapter visual-file plans likewise conflate canonical and
  observed modes. Bind observations separately before widening these paths.
- Private plan schemas may advance locally for that evidence. Old plans fail
  closed with regeneration guidance; provider reports and bootstrap journals
  are not reinterpreted or migrated.
- Source checkouts may lack a project manifest. Health checks must distinguish
  genuinely unconfigured repositories from broken managed consumers, without
  introducing source-checkout setup or an absence-based bypass.
- Native baseline behavior and failure cleanup need real disposable-repository
  tests. Test counts, mock argv checks, and clean Git status alone are insufficient.

## Start after approval

Observed baseline: `b056fb0927094fc9e348512ac83654badec12bef` on `develop`.
The real index is empty; current changes are untracked planning documents.
Recheck state before acting and preserve unrelated work.

- [x] Run `prism-tool doctor --local-only`; confirm the launcher, required test
  tools, active model metadata, human identity, and signing capability are
  available. Do not probe readiness with a commit or read credentials.
- [x] Resolve scripts with `prism-tool resolve scripts` in a standalone call.
  In a later call, invoke the returned literal `new-branch.sh` path with
  `fix checkout-safe-scanning-and-umask-compatibility`. The helper may synchronize
  `develop`; recheck HEAD and the draft assumptions afterward. No code on `develop`.
- [x] Accept the two Proposed ADRs; add partial-supersession Status notes to
  ADR-0078/0088/0100 without editing their bodies. Update `CONTEXT.md` for
  scanner isolation and managed-file runtime acceptance only.
- [x] Stage the exact spec, this plan, the matching handoff, the two new ADRs,
  the three prior ADR Status changes, and `CONTEXT.md`. Preserve the separate
  OCR-cutover specification. Create the documentation commit below.

```bash
prism-tool commit create --type docs --scope architecture --subject "record narrowed checkout safety fix" --refs 520
```

Every commit command in this plan runs alone in its assistant batch, after
separate exact staging and verification. The launcher owns attribution,
pre-commit proof, normal Git hooks, signing, and post-commit verification.
A failure stops tools until human `/reload`; never retry or bypass a hook.

## Task 1: Make Core managed files survive ordinary Git recreation

**Files:** Create `packages/prism-core/scripts/prism-tool/managed-file.js`.
Modify `project-manifest.js`, `managed-hooks.js`, `automation.js`, and `hook.js`
in that directory. Extend `tests/Node/prism-tool-project-manifest.test.js`,
`prism-tool-managed-hooks.test.js`, and `prism-tool-automation.test.js`.

**Interface:** Keep the existing public manifest, hook, automation, and hook
command interfaces. A package-local `isSafeManagedMode(mode, canonicalMode)`
predicate owns mode acceptance only; readers retain ownership and content checks.
Typed internal errors carry bounded public-path/mode diagnostics, not raw errors.

Run one Red/Green cycle for each behavior, in this order:

- [x] A valid `0600` project manifest is readable without mutation; next cover
  `0640`, canonical `0644`, required owner access, and invalid bits.
- [x] Canonical hook bytes at `0700`/`0750` inspect as CURRENT, not MIGRATE;
  reconciliation preserves bytes, mode, inode, and timestamps. Unsafe modes
  cannot fall through to marker-based migration. Package hook sources stay exact.
- [x] Existing canonical automation outputs at safe restrictive modes remain
  CURRENT. Applying a mixed plan preserves those files while creating missing
  canonical outputs. Incorrect content still conflicts or follows existing
  explicit ownership/migration rules; permission failure never becomes repair.
- [x] Retained Core automation plans bind each existing output's exact observed
  mode, owner, identity, size, and content digest separately from canonical mode.
  Revalidate before mutation; safe-to-safe drift invalidates approval. Use a new
  private plan version rather than accepting missing observations from old plans.
  Keep candidate and rollback verification exact.
- [x] Recreate a Core-only managed fixture with actual Git checkout, switch, and
  fast-forward operations under `0022`, `0027`, and `0077`. Verify automation
  and exercise pre-commit/pre-push through `hookCommand` without chmod.
  Fake only external quality processes. Add negative ownership, symlink,
  ancestor-link, special-bit, tampered-content, and private-record controls.

Focused command:

```bash
node --test tests/Node/prism-tool-project-manifest.test.js tests/Node/prism-tool-managed-hooks.test.js tests/Node/prism-tool-automation.test.js
```

After focused/full applicable verification and internal review:

```bash
prism-tool commit create --type fix --scope hooks --subject "accept safe restrictive managed file modes" --refs 520
```

### Task 1 verification

- Initial documentation commit: `fbd5408311f0e8de75bc75c436238f604f3e6d6b`.
- Verified Red/Green at manifest, hook, automation, and hook-command seams.
  All nine Git-operation/umask combinations pass in disposable Core-only fixtures.
- 92 focused tests and 1,399 full Node tests passed. Final full-suite log:
  `/tmp/prism-520-task1-verify.0NLa6p/node-final.log`.
- ESLint, Node syntax, harness validation, staged whitespace, Markdown, and
  the effective pre-commit hook passed. The hook normalized source headers and
  ran Gitleaks. No debug artifacts, generated-asset edits, or dependencies.
- PHP coverage and asset lint/build: N/A for this JavaScript-only task. Full
  scanner-dependent `/check` remains deferred until Task 4, as approved above.
- Internal spec-compliance and code-quality reviews passed. Public reports and
  bootstrap protocol remain unchanged; the private Core plan alone advances to
  version two and binds exact observations before and during application.

## Task 2: Keep the existing PHP/web managed-file path compatible

**Files:** Create `packages/prism-php-web/scripts/toolchain/managed-file.js`.
Modify `bootstrap-scaffold.js`, `automation-provider.js`, and `transaction.js`
in that directory. Extend `tests/Node/prism-tool-php-web-bootstrap.test.js`,
`prism-tool-apply.test.js`, and `source-toolchain-parity.test.js`.

**Interface:** Existing adapter handler signatures, reports, and protocol stay
unchanged. Use a tiny package-local mode predicate with the same independently
specified accepted/rejected matrix as Core; do not add a cross-package service
handoff or dependency merely to share that predicate.

- [ ] Prove that the existing quality entry point accepts a valid `0700` shared
  check script, and automation verification accepts safe restrictive outputs.
  Unsafe modes and identities must fail before script execution or content reads.
- [ ] Preserve exact candidate checks when verification is against a candidate
  root. Relax only existing public runtime files, not provider declarations,
  initial publication proof, or active bootstrap journal/inventory identities.
- [ ] Existing canonical visual-review files at restrictive modes are PRESERVE.
  Bind their actual mode/identity independently in the adapter's private plan;
  reject stale or old-version plans without a provider-protocol change.
  Applying unrelated work leaves preserved files unchanged.
- [ ] Test an adapter-selected fixture after real Git recreation under all three
  umasks, plus missing execute access, unsafe writes, content tampering, symlinks,
  candidate substitution, stale observations, and exact rollback behavior.
- [ ] Verify fresh scaffold bytes, declared creation modes, reports, and bootstrap
  protocol are unchanged. Re-run the Core tests to catch package-policy drift.

Focused command:

```bash
node --test tests/Node/prism-tool-php-web-bootstrap.test.js tests/Node/prism-tool-apply.test.js tests/Node/source-toolchain-parity.test.js
```

```bash
prism-tool commit create --type fix --scope php-web --subject "preserve restrictive managed scaffold files" --refs 520
```

## Task 3: Isolate the launcher's Semgrep execution

**Files:** Create `packages/prism-core/scripts/prism-tool/semgrep.js` and
`semgrep-workspace.js`. Modify `cli.js` and `packages/prism-core/toolchain.json`.
Create `tests/Node/prism-tool-semgrep.test.js`; extend
`tests/Node/prism-tool-run.test.js` and `toolchain-contract.test.js`.

**Interface:** Retain `prism-tool run semgrep -- scan ...` and its existing exit
mapping. Internally, `runIsolatedSemgrep({projectRoot, executable, args, env,
timeoutMs, maxBuffer})` returns a Promise of the existing bounded process result
shape: status, stdout, stderr, timedOut, error. Isolation/preservation failure
sets an error even if Semgrep exited zero. No public fallback or bypass flag.

- [ ] Start with a disposable committed fixture and a process-boundary fake that
  performs Semgrep's baseline/reset pattern. Through the real launcher, prove
  that a scan under `0077` cannot change the consumer's index bytes, refs/reflogs,
  HEAD, or public file contents/modes/identity/timestamps. Ignore access-time
  changes caused by observation; never read protected content for the snapshot.
- [ ] Implement independent private Git materialization using native Git plumbing:
  validate commit/tree metadata and endpoint paths before copying required blobs,
  retain original baseline/HEAD identities, and compute the effective merge base.
  No linked worktree, object alternates, hardlinks, full-history blob copy,
  consumer hooks/filters, populated submodules, or inherited authentication.
- [ ] Accept only the read-only scan arguments used by current workflows: tracked
  local configs, existing fixed registry presets, baseline, error/JSON, metrics
  off, version-check disablement, validated targets, and the rule-fixture ignore
  flag. Reject `ci`, login/publish/autofix/output writes, arbitrary remote config,
  stdin scanning, and unknown controls before execution. Internal version/help
  probes remain distinct. Validate CLI and environment baselines; conflicting
  selectors or missing objects fail without fetching. Preserve supported local
  changes by rejecting dirty input before work rather than stashing it.
- [ ] Run real installed Semgrep with a local synthetic rule: unchanged baseline
  findings disappear; a new HEAD finding remains at the correct relative path.
  Cover divergent history, paths with spaces, both supported Git object formats,
  and no-baseline scanning. Use private home/cache/config and neutral Git settings;
  do not inherit credentials or access remote presets in automated tests.
- [ ] Exercise scanner failure, spawn failure, timeout, output overflow, handled
  SIGINT/SIGTERM, child cleanup, unsafe historical endpoints, ignored canaries,
  symlinks, and concurrent consumer changes. Kill the owned process group before
  cleanup. Keep failed scanner output distinguishable from preservation failure;
  never repair, retry automatically, or report partial evidence as success.

Use a 600,000 ms total deadline, 30,000 ms per Git call, and at most 5,000 ms
reserved cleanup within the total. Bound paths to 100,000 entries and 4,096
bytes each; metadata to 64 MiB; endpoint blobs to 32 MiB each/256 MiB total;
scanner output to 1 MiB per stream. Existing stricter caller bounds still apply.
Limits are failures, never silent truncation. These are fixed implementation
limits, not new configuration or a general workspace framework.

Use existing sensitive-path policy and trusted dependency/submodule evidence.
If an endpoint cannot be materialized safely with its original identity, fail
before reading excluded blobs rather than inventing a sanitized commit.

```bash
node --test tests/Node/prism-tool-semgrep.test.js tests/Node/prism-tool-run.test.js tests/Node/toolchain-contract.test.js
```

```bash
prism-tool commit create --type fix --scope security --subject "isolate semgrep scans from consumer checkouts" --refs 520
```

## Task 4: Route the remaining scanners through the same boundary

**Files:** Modify `packages/prism-core/scripts/prism-review/core-quality.js`,
`tests/Node/prism-review-core-quality.test.js`, and
`tests/Unit/Semgrep/RulesPackTest.php`. Create
`tests/Unit/Semgrep/FixtureRepository.php` only for the PHP fixture lifecycle;
extend `tests/Node/prism-tool-semgrep.test.js` for caller parity.

**Interface:** Core quality retains its gate IDs, result schema, and exact-HEAD
receipt semantics, calling Task 3's runner rather than duplicating isolation.
The PHP rule suite retains its six-rule result contract and single-scan cache.

- [ ] Prove the real Core quality path uses isolation and fails its existing
  Semgrep gate on either scanner or preservation failure; command-array
  assertions alone do not establish this behavior.
- [ ] Make the PHP rule suite copy only its known non-sensitive rule and fixture
  inputs to a private committed test repository, then invoke the launcher there.
  Keep unrelated local changes untouched and retain positive/negative rule cases,
  JSON parsing, the required ignore flag, and one-scan-per-suite behavior.
- [ ] Test that the PHP path uses neither an inherited baseline nor the consumer
  checkout accidentally; missing tools, malformed output, and cleanup failure
  must not become successful rule assertions. No provider requests or credentials.
- [ ] Check all production scanner callers and shipped commands. Existing CI and
  security prompts already use the launcher; their current read-only scan
  arguments must remain supported. No CI workflow rewrite is planned.

```bash
node --test tests/Node/prism-review-core-quality.test.js tests/Node/prism-tool-semgrep.test.js
```

```bash
prism-tool run pest -- tests/Unit/Semgrep/RulesPackTest.php
```

```bash
prism-tool commit create --type fix --scope security --subject "use isolated scanning for quality and rule tests" --refs 520
```

## Task 5: Detect managed-file drift before declaring readiness

**Files:** Create `packages/prism-core/scripts/prism-tool/managed-project.js`.
Modify `cli.js`, `pr.js`, `hook.js`, `packages/prism-core/prompts/check.md`,
`skills/code-review/SKILL.md`, and `skills/finishing-a-development-branch/SKILL.md`
under Core. Extend `tests/Node/prism-tool-pr.test.js`,
`prism-tool-managed-hooks.test.js`, `tests/Shell/branch_finalization_workflow_test.sh`,
`pr_command_test.sh`, and `toolchain_entrypoints_test.sh`.

**Interface:** Add narrow read-only `prism-tool automation health --json` to the
existing automation command family. `verifyManagedProject({projectRoot, coreRoot})`
composes existing manifest, automation, and managed-hook checks. Report CURRENT,
NOT_CONFIGURED, or CONFLICT with bounded checks; no writes, repair commands,
new state files, provider protocol, or project-wide inventory.

- [ ] With a configured managed consumer, all healthy canonical/restrictive files
  pass. Unsafe permissions, malformed metadata, missing managed files, and content
  drift fail with distinct stable diagnostics including safe public paths/modes.
- [ ] Manifest absence is NOT_CONFIGURED only when no effective canonical managed
  hook claims that manifest. A missing manifest with managed hooks is CONFLICT;
  malformed, unreadable, or symlinked state is never absence. The Prism source
  checkout retains its existing repository-specific hooks and requires no setup.
  Report genuinely inapplicable checks as SKIPPED, not verified managed health.
- [ ] Run health during `/check`, after all four review axes/evidence recording,
  and inside both PR preflight routes before success or absent-chain recovery.
  Use one implementation; do not append an OCR retry or alter receipt schemas.
- [ ] Simulate post-review drift after successful external output: readiness fails,
  completed evidence survives unchanged, no new review runs, and both PR paths
  block. Restore only the fixture's permissions and prove revalidation does not
  require another source review when recorded identities remain valid.

```bash
node --test tests/Node/prism-tool-pr.test.js tests/Node/prism-tool-managed-hooks.test.js
```

```bash
bash tests/Shell/branch_finalization_workflow_test.sh
bash tests/Shell/pr_command_test.sh
bash tests/Shell/toolchain_entrypoints_test.sh
```

```bash
prism-tool commit create --type fix --scope review --subject "check managed file health before review readiness" --refs 520
```

## Task 6: Close the original regression and document the behavior

**Files:** Extend the behavioral tests from Tasks 1–5 as needed for one complete
Core-only consumer reproduction; update `packages/prism-core/README.md`,
`packages/prism-core/docs/project-manifest.md`,
`packages/prism-core/docs/review-runtime.md`, `packages/prism-php-web/README.md`,
and `packages/prism-php-web/docs/visual-review.md` for the adapter behavior.

- [ ] In a disposable `prism-adapters`-shaped Core-only fixture, perform native
  baseline scanning, real Git recreation, and managed pre-commit/pre-push
  validation. Prove no recurring chmod is needed and unsafe state still fails.
  Add any missing behavioral regression through TDD; do not manufacture Red for
  a test-only consolidation of behavior already implemented.
- [ ] Document accepted runtime modes, unchanged creation defaults, supported
  scan inputs/limits, read-only health diagnostics, and old private-plan
  regeneration. Remove any stale current-doc claim that runtime equality is
  required, without rewriting accepted ADR bodies or unrelated OCR guidance.
- [ ] Run the complete verification checklist below, including the additional
  CI commands that the current `/check-php` prompt omits. Do not change unrelated
  planning rules, Pi compatibility, or gate architecture to hide failures.
- [ ] Confirm the original issue's amended acceptance criteria have evidence,
  and no withdrawn migration, protocol, CI preparation, or creation policy has
  entered the diff. Use the sole closing commit only after this proof.

```bash
prism-tool commit create --type fix --scope review --subject "verify checkout safe review and hook compatibility" --fixes 520
```

## Verification and finalization

For every task: show meaningful Red, the same command Green, relevant regression
results, and `verification-before-completion`; inspect the diff and run the
internal spec-compliance/code-quality review before its commit. Read each source
file fully before editing it. Read adapter test/mocking/convention guidance before
the corresponding test work. Header normalization remains hook-owned.
Before Task 4 is complete, scanner-dependent verification stays in disposable
fixtures; do not baseline-scan the consumer to establish a baseline. Per-task
Node and applicable lint checks are not a claim that the full `/check` passed.

Required completion evidence:

- `/check` and `/check-php`, including harness validation and Shell regressions.
- `npm run test:node` explicitly: the current adapter prompt only looks for
  `test:plugin`, while this repository and CI use `test:node`.
- The CI TypeScript, syntax, Shellcheck, executable-bit, package-smoke, secret-scan,
  locked-dependency audit, commitlint-range, and applicable lint gates. Use the
  existing workflow's exact commands and required tools; missing tools or
  unrelated failures are reported, not silently skipped or repaired out of scope.
- Full adapter coverage via the exact command below, then the existing changed-PHP
  gate using the branch merge-base range as CI does, not an empty staged-only diff.
  Record out-of-source warnings accurately; Node counts are not JS coverage.

```bash
prism-tool server run @kyaulabs/prism-php-web:browser-fixture --tool pest -- --coverage
```

Plan approval authorizes the existing initial finalization path: commit matching
artifact cleanup, require a clean tree, fetch/synchronize the target according to
the finishing skill, attest branch/base/HEAD, repeat local checks until green,
run one complete four-axis review, revalidate identities and managed health,
then prepare `/pr`. Standing OCR consent remains separately required for egress.
Additional reviews require fresh approval. Humans alone push and create/merge PRs.

Remove only this plan, its matching spec, and the task handoff during approved
completion cleanup. Preserve the separate OCR-cutover spec, durable ADRs, and
ignored withdrawn-plan archive. No cleanup commits repeat the closing reference.

## Stop conditions

Stop rather than expanding the project if scanner semantics cannot be preserved
within the declared safety boundary, an incompatible provider change proves
necessary, an approval snapshot cannot be kept exact, or a required tool/gate is
unavailable. Explain the specific blocker. Do not reopen the discarded permission
policy, add a general framework, bypass hooks, or guess signing/model attribution.
Follow the executing skill's three-failed-attempt and repeated-replanning halts.

## Planning verification

- Scope maps to Tasks 1–2 (Git/umask), 3–4 (scanner), 5 (post-review readiness),
  and 6 (original consumer regression and documentation).
- One initial documentation recipe and five non-terminal implementation recipes
  use non-closing references; only Task 6 closes #520.
- All new modules have bounded responsibilities; no producer modes, provider
  reports, release declarations, or bootstrap protocol changes are planned.
- Fresh baseline: 163 focused existing Node tests passed on the observed HEAD.
  Earlier full audit: 1,376 Node tests and harness validation passed. Neither is
  evidence of implementation, native scanner isolation, PHP coverage, or final review.
- The user approved this plan with `go`. Work branch:
  `fix/kyau-e7c1-checkout-safe-scanning-and-umask-compatibility`, based on the
  observed HEAD above. Local tool readiness passed before branch creation.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
