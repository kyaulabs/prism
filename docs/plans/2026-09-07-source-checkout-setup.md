# Source-checkout setup implementation plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Status:** Approved with `go`; execution started on `fix/kyau-aeb3-source-checkout-setup`.
**Goal:** Complete the remaining source-checkout setup work in #501 without regressing established consumers.
**Architecture:** Core distinguishes the Prism development repository from a consumer before setup selects an effectful workflow. A closed source-checkout route preserves repository-owned automation and uses existing source validation; consumer provisioning and its transaction protections remain unchanged.
**Tech Stack:** Existing Node.js/CommonJS, Bash, Git, Prism CLI and prompt contracts; existing PHP/web validation for the source repository.
**Originating issue:** #501

## Global constraints

- The user approved investigating the remaining source-checkout defect, with the
  established-project work merged through #516 retained as regression coverage.
- Support ordinary independent clones and forks. Remote names, URLs, branch
  names, and directory basenames are not source identity. Do not add linked
  worktree support or weaken unsupported-layout failures.
- For #501 only, the user approved relevant-ADR review and a behavior/test-focused
  plan instead of the default all-ADR audit and implementation code written in
  advance. This does not change permanent skills or implementation TDD.
- Semgrep remains `>=1.173.0 <2.0.0`; OCR remains `>=1.9.1 <2.0.0`.
- No new dependency, provider/bootstrap protocol, project manifest schema,
  migration service, CI engine, or review-authority change.
- Preserve `.github/workflows/`, repository hooks, the coverage shim, manifests,
  lockfiles, and dogfooding settings. Recognition never grants permission to
  repair or replace them.
- No new credential reads, remote access, package execution during recognition,
  setup invocation, standing consent, publication authority, or Git mutation.
- Safe restrictive public modes remain accepted; ownership, containment,
  no-symlink, content, private-record, exact-candidate, and rollback protections
  remain independent. Never chmod source files to make validation pass.
- Preserve the unrelated OCR-cutover specification and existing review evidence.
- Do not implement or create a branch until this plan is approved.

## Findings and baseline

Observed `develop`: `c7895e2ab6b4573635761f309567115b874eb856`.
Working tree was clean before planning. PR #516 established consumer metadata,
Core-only composition, and hook ordering; #501 remains open for source routing.

Read-only reproduction:

```bash
prism-tool setup route --json
```

In this Prism checkout it returns `GO`, disposition `ESTABLISHED`, applicability
`ESTABLISHED`, route `ESTABLISHED_SETUP`, reason `EXISTING_REPOSITORY`.
An assertion that the source checkout must not select `ESTABLISHED_SETUP` fails.
No `/setup` workflow, consumer transaction, or hook reconciliation was executed.

Root cause:

- `setup-entry.js` classifies every root-owned Git repository as an established
  consumer; it has no source identity check or source disposition.
- `setup-route.js` maps that classification directly to `ESTABLISHED_SETUP`.
- `cli.js` forwards the classifier's report; it is not losing an existing
  source-checkout signal.
- `prompts/setup.md` requires that same route for root-owned repositories. Its
  prose exemption explicitly deferred to #501 cannot prevent entry into consumer
  automation or establish an alternative successful path.
- `tests/Shell/toolchain_entrypoints_test.sh` currently asserts that deferral;
  it needs a positive source-route contract, not just deletion of the assertion.

Baseline command:

```bash
node --test tests/Node/prism-tool-setup-route.test.js tests/Node/prism-tool-project-manifest.test.js tests/Node/prism-tool-managed-hooks.test.js
```

Result: 56 passed, zero failed. Evidence:
`/tmp/prism-501-planning.tyceWYya/baseline.log`.
This is a planning baseline, not implementation or full-check evidence.

## Architecture review

**Verdict:** GO-WITH-CONDITIONS
**ADR-required:** 0109

Relevant decisions reviewed: ADR-0073, ADR-0083 and its successor relationship,
ADR-0084, ADR-0100, ADR-0105, and ADR-0108, with the standing credential,
consent, Core/adapter, and review boundaries retained from the harness context.
This is the approved focused review, not an all-ADR audit.

Core owns route classification. The adapter continues to own PHP/web quality;
Core must not acquire PHP-specific recognition rules or commands. A source
checkout is a workflow-applicability classification, not proof of trustworthy
repository code and not permission to skip ordinary commit or review gates.

Required before implementation:

- Accept `adr/0109-source-checkout-setup-applicability.md`, extending ADR-0105
  and narrowing ADR-0100's consumer-automation applicability for the development
  repository. Preserve accepted ADR bodies; use Status links where necessary.
- Record the source-checkout term and preservation invariant in `CONTEXT.md`.
- The new enum values remain in the existing closed setup-route schema two.
  Old readers must reject unfamiliar values rather than treating them as a
  consumer or a successful strict-empty bootstrap. No other report schema changes.

## Design contract

### Recognition

Add one package-local read-only helper:

`inspectSourceCheckout({projectRoot})`

Return a closed internal result with disposition `NOT_SOURCE`,
`SOURCE_CHECKOUT`, or `CONFLICT`, and a stable reason. No candidate workspace,
state file, registry call, Git configuration read, or executable package load.

Recognition is structural and independent of installed Core location:

- The canonical project root must own a real `.git` directory, not merely be
  inside another worktree. A source-shaped Gitfile checkout is unsupported and
  stops rather than falling into consumer automation.
- The bounded root `package.json` identifies the private `prism` development
  repository (`name: prism`, `private: true`).
- Its fixed `packages/prism-core/package.json` identifies
  `@kyaulabs/prism-core`; its fixed toolchain declaration names the same package
  and validates through the existing contract loader.
- Required Core source surfaces are the package's `scripts/prism-tool.js`,
  `scripts/validate-harness.sh`, `skills/`, and `prompts/`. Validate their kinds,
  canonical containment, and stable ancestry; do not execute them to classify.
- Do not require a GitHub origin, pristine Git status, exact source bytes, or
  particular local clone name. Fork development and ordinary tracked edits
  must remain possible.
- Root/package JSON reads are bounded to 1 MiB each, held, owner-validated,
  no-follow, and identity-revalidated, including their parent paths. Reject
  unsafe writes and special bits without broadening private-record policies.
- An ordinary repository with no Prism identity claim remains `NOT_SOURCE`.
  A root manifest claiming `name: prism` with incomplete, unsafe, or incoherent
  source evidence is `CONFLICT`, not a consumer fallback. A directory merely
  named `prism`, or containing an installed Core dependency, proves nothing.
- Preserve existing behavior for unrelated malformed consumer metadata: source
  detection must not become a blanket package.json validator for every project.
  Probe the fixed Core source layout as an additional claim indicator. An
  unreadable or malformed root manifest without that layout remains on the
  existing consumer path; with that layout it is an ambiguous source claim and
  conflicts. A safely parsed root manifest naming `prism` is itself a claim and
  conflicts if the required layout is absent. Read errors never establish
  `SOURCE_CHECKOUT`.

Keep this a narrow helper. Reuse suitable existing bounded readers where their
contracts fit; do not create a shared permission or filesystem framework.

### Classification and route

`classifySetupEntry({projectRoot})` composes the existing Git/root stability
checks with source recognition. Add `SOURCE_CHECKOUT` to disposition and
applicability. Ordinary consumers retain their existing values unchanged.

`inspectSetupRoute({projectRoot, source = null})` maps a verified source checkout
to `SOURCE_CHECKOUT_SETUP`, with status `GO` and source `null`. Supplying Blank,
Template, or Cancel selectors to a non-empty source checkout fails closed as it
already does for established consumers. Unknown or partial source evidence
returns `CONFLICT`, null applicability, `STOP`, and a bounded reason.

Route GO means recognition succeeded, not that setup validation passed.
Classification adds no manifest-absence exemption to canonical consumer hooks,
automation verification, commit creation, or review readiness.

### Source setup effects

The prompt must explicitly select the source branch before any consumer plan,
release reconciliation, adapter provisioning, or managed-hook activation.

- Preserve retained bootstrap/transaction state; never adopt, discard, or replay
  an unrelated attempt as source-checkout setup. Unresolved active bootstrap
  continuity stops with existing recovery guidance.
- Keep shared preflight, global Core verification, separately approved global
  installation, standing-consent management, and optional model/web preferences
  under their existing gates. This fix neither grants nor removes that authority.
- For source checkouts, skip consumer established metadata gathering and
  automation inspect/plan/apply/verify, managed package-release reconciliation,
  adapter scaffold/dependency resolve/apply, and canonical hook reconciliation.
- Preserve the existing disk-backed adapter activation. A missing or invalid
  activation is a validation problem, not permission to rewrite tracked settings
  or infer Core-only success. Give human remediation, not consumer scaffolding.
- Source validation uses the existing source `/check` path and resolved harness
  validation rather than the consumer scaffold verifier. Reuse existing tool
  entry points and quality policy; add no source-only quality engine or no-op
  adapter. Resolve scripts in one call, invoke the literal result in another.
- Do not use pre-commit as a read-only source validator: it can normalize and
  restage files. Do not change `core.hooksPath` merely to report hooks current.
- Global and optional GitHub effects retain their existing explicit approvals;
  recognition alone authorizes none. Investigation and automated tests do not
  run live `/setup`, consent grants, installations, or GitHub mutations.
- Report source-owned automation/hooks as preserved and consumer reconciliation
  as not applicable. Report actual validation PASS/FAIL separately. Missing
  prerequisites or failed checks cannot become a successful setup summary.
- Revalidate source identity before any source-specific execution and final
  success; changing identity stops without falling through to consumer setup.

## Task 1: Establish bounded source recognition and closed routing

**Files:** Create `packages/prism-core/scripts/prism-tool/source-checkout.js` and
`tests/Node/prism-tool-source-checkout.test.js`. Modify `setup-entry.js` and
`setup-route.js` in that Core directory, and
`tests/Node/prism-tool-setup-route.test.js`. Add ADR-0109 and the corresponding
`CONTEXT.md` entry before implementation; add only necessary ADR Status links.

**Interfaces:** The helper and existing classifier/router contracts above.
No new CLI verb. Existing `setup route --json` is the highest public test seam.

- [x] Recheck branch/base, preserve unrelated files, and create the work branch
  through the resolved branch helper only after plan approval.
- [x] Accept the required architecture record and glossary change before code.
- [x] Red: a disposable real Git repository with valid copied public source
  identity reports `SOURCE_CHECKOUT_SETUP`, not consumer or bootstrap setup.
  Confirm the same failure on this source checkout through the read-only CLI.
- [x] Green: implement only that recognition/classification/route behavior.
- [x] Add each boundary through its own Red/Green cycle: unrelated clones;
  basename-only and dependency-only lookalikes; a partial Prism identity claim;
  malformed/mismatched fixed metadata; missing required source surfaces;
  unsafe owners/modes; leaf and ancestor symlinks; path replacement during a
  held read; nested roots; source-shaped Gitfiles; non-Git source trees; and
  forbidden strict-empty source selectors.
- [x] Prove forks with absent or different remotes and tracked source edits are
  recognized without network access or pristine-byte requirements. Exercise
  the installed-launcher layout as well as source execution.
- [x] Prove recognition has no writes, source execution, remote lookup,
  credential read, or adapter invocation. Use filesystem/process boundary
  guards and snapshots, not private helper call-order assertions.
- [x] Run focused and full applicable Node checks, lint, syntax, harness checks,
  and internal spec/compliance and code-quality review before committing.

```bash
node --test tests/Node/prism-tool-source-checkout.test.js tests/Node/prism-tool-setup-route.test.js
```

```bash
prism-tool commit create --type fix --scope setup --subject "classify prism source checkouts before consumer setup" --refs 501
```

### Task 1 evidence

Architecture commit: `518468be6f6def273064d8a7dc321fdcea9512d9`.
The real source checkout now reports `SOURCE_CHECKOUT_SETUP`. Native public CLI
fixtures execute the launcher from a separate Core root, not their inert source
entry points. The first classification assertion, incomplete-claim matrix,
unsupported-Git-layout case, unsafe-mode matrix, directory-swap canary, and
excluded-input guard each failed before its corresponding implementation.
Additional preservation/ownership/held-read cases pass without source repair.
22 focused tests, the full Node suite, ESLint, syntax, and harness validation
pass. Logs: `/tmp/prism-501-planning.tyceWYya/task1-node-final.log` and
`task1-harness.log`. PHP coverage is inapplicable to this JavaScript-only task.
No runtime dependencies, global changes, or setup execution were introduced.
Internal spec-compliance and code-quality reviews passed.

## Task 2: Wire source-preserving setup and honest validation reporting

**Files:** Modify `packages/prism-core/prompts/setup.md`,
`packages/prism-core/README.md`, and
`tests/Shell/toolchain_entrypoints_test.sh`. Create
`tests/Shell/source_checkout_setup_test.sh` for the focused workflow contract.
Extend the Task 1 public-route tests only where new observable workflow evidence
needs a runtime fixture.

**Interfaces:** Consume schema-two `SOURCE_CHECKOUT_SETUP` and the existing
validation commands. Produce no provider, plan, journal, or receipt format.

- [ ] Red: replace the deferral-only Shell assertion with a contract requiring
  the source branch before the established consumer branch and requiring
  source applicability guards on each project-mutating stage.
- [ ] Green: document the closed source result and route the existing numbered
  stages according to the source setup effects above. Remove stale #501
  deferral text; do not merely suppress consumer failure diagnostics.
- [ ] Red/Green: source success reporting requires successful existing checks
  and final route revalidation. Missing tools, bad adapter activation, failed
  harness/quality checks, changed source identity, or unresolved bootstrap
  state stop without repairs or consumer fallback.
- [ ] Exercise the instruction-owned command blocks with bounded test-owned
  process stubs, retaining actual exit propagation. Stubs may replace external
  effects, not invent native classifier or provider success.
- [ ] Verify source guards forbid metadata/automation/release/scaffold/hook
  mutation while preserving the independent global/consent questions. Do not
  test or transmit real consent or credential state.
- [ ] Re-run established and strict-empty workflow contracts to ensure their
  ordering and approval boundaries were not changed.
- [ ] Run focused/full Shell tests, harness validation, Markdown, whitespace,
  and the internal task reviews before committing.

```bash
bash tests/Shell/source_checkout_setup_test.sh
bash tests/Shell/toolchain_entrypoints_test.sh
composer test:shell
```

```bash
prism-tool commit create --type fix --scope setup --subject "preserve source-owned automation during setup" --refs 501
```

## Task 3: Verify preservation and retained consumer behavior

**Files:** Extend the Task 1/2 tests as needed. Extend existing
`tests/Node/prism-tool-automation.test.js` and
`tests/Node/prism-tool-managed-hooks.test.js` only for missing consumer
regressions. Update `packages/prism-core/README.md` with verified limitations
and remediation where necessary.

**Interfaces:** No new runtime interface. This task closes the remaining #501
acceptance criteria and verifies the consumer functionality already merged.

- [ ] In a disposable independent source fixture, retain public copies of its
  repository-specific workflows, hooks, coverage shim, manifests, lockfiles,
  and dogfooding settings. Snapshot bytes, modes, identity, timestamps, and Git
  index/config before read-only routing and applicable validation.
- [ ] Prove successful and failed source validation leave that inventory
  unchanged and create no `.prism/project.json` or consumer transaction.
  Validation scratch must remain in test-owned private/ignored locations.
- [ ] Exercise restrictive safe modes and malformed source evidence without
  chmod repair. Preserve independent negative ownership/link/content controls.
- [ ] Verify established Core-only and adapter-selected flows still require
  manifest/provider verification before hook activation, reject unowned files,
  accept only recognized migrations, and preserve exact rollback evidence.
- [ ] Map all nine original acceptance criteria to source tests or retained
  consumer tests. Do not claim #501 complete merely because the new enum exists.
- [ ] Run the complete local `/check`, explicit Node suite, Shell suite,
  source harness validation, PHP/browser coverage, applicable CI lint/static
  checks, package smoke, SAST and dependency audits. No dependency install.
- [ ] Perform the internal task reviews. Use the sole closing reference only
  after source preservation and retained consumer evidence pass.

```bash
npm run test:node
composer test:shell
prism-tool server run @kyaulabs/prism-php-web:browser-fixture --tool pest -- --coverage
```

```bash
prism-tool commit create --type fix --scope setup --subject "verify source setup preservation and consumer compatibility" --fixes 501
```

## Verification and finalization

Every test or production behavior change follows vertical Red → Green →
Refactor. Test-only consolidation of already proven behavior does not require a
manufactured Red. Read complete affected files before implementation, load the
adapter test/mocking conventions where relevant, and let hooks own source
header/modeline normalization.

Stage only exact task files, verify separately, and run each ordinary commit
command alone through `prism-tool commit create`. All source commits are signed
and carry launcher-owned attribution. Any commit failure stops tools until the
human reloads; never retry or bypass hooks.

No PHP production change is planned. Report changed-PHP coverage as inapplicable
for this task unless scope actually adds PHP changes. Full backend coverage and
Node test counts remain distinct evidence. No generated assets are edited.

Plan approval authorizes the initial finalization path: remove only this
matching completed plan and any matching task spec/handoff; commit cleanup;
require a clean tree; synchronize the target through the existing finishing
workflow; attest exact branch/base/HEAD; repeat local checks until green; run
one authorized four-axis review under separately valid standing OCR consent;
revalidate SHAs and managed health; prepare PR artifacts. Preserve unrelated
review evidence. Existing records from another branch cannot authorize #501
or be overwritten implicitly. Additional review attempts need fresh approval.
Humans push, open PRs, and merge.

## Stop conditions

Stop and explain rather than expanding the fix if source recognition cannot be
made deterministic and bounded without a new trust/configuration framework;
linked-worktree support becomes necessary; a provider/bootstrap protocol change
is required; source validation would repair tracked files; or prerequisites,
signing, or applicable quality gates are unavailable. Do not turn source
classification into a general exemption for arbitrary customized consumers.

## Planning self-review

- The remaining source-routing and preservation requirements map to all three
  tasks; previously merged metadata, ordering, ownership, migration, and rollback
  requirements remain explicit Task 3 regressions.
- The helper, classifier, router, and prompt agree on the source disposition,
  applicability, source-null requirement, and `SOURCE_CHECKOUT_SETUP` route.
- No additional public command, state file, framework, dependency, or provider
  protocol is proposed.
- Exactly one logical task uses `--fixes 501`; preceding recipes use `--refs 501`.
- Verification commands come from the existing repository/adapter contracts.
- Complete implementation code is intentionally deferred to vertical TDD under
  the user's issue-specific planning exception; this plan does not modify the
  permanent planning skill.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
