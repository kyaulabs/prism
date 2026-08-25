# Setup Orchestration and Regression Coverage Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Complete the public `/setup` workflow for strict-empty Blank and Template projects, including deterministic recovery, signed root-seed completion, established-project isolation, and packaged documentation.

**Architecture:** Keep conversational choices and approval ordering in `packages/prism-core/prompts/setup.md`, while all filesystem, network, recovery, Git, hook, quality, and seed mechanics remain behind closed `prism-tool` reports. Add one read-only active-bootstrap status seam so later `/setup` invocations can resume retained state without parsing operational files directly. Reuse the existing source, adapter, metadata, plan, application, repository, hook, seed, and exclusive commit operations rather than creating a second transaction implementation.

**Tech Stack:** Node.js 22+, CommonJS, Node's built-in test runner, Bash prompt-contract tests, existing Core bootstrap protocol version 1, existing PHP/web adapter bootstrap protocol version 1, Markdown prompt and package documentation.

## Global constraints

- Strict-empty setup asks one question at a time in this order: source, adapter/Core-only, capabilities, selected metadata, identity-publication confirmation, combined-plan approval, and hook activation.
- Template is the recommended default, but every optional capability remains disabled by default and no project bytes change before literal combined-plan approval.
- Template networking remains the fixed unauthenticated `kyaulabs/template` object sequence; Blank performs no Template request.
- Selected-adapter installation has no redundant approval question and remains provisional until durable application.
- Identity-bearing metadata is previewed before plan rendering and is never passed through command substitution, interpolated shell fragments, or caller-selected files.
- Pre-durable decline or caught failure restores strict emptiness when ownership is proven; ambiguous state is retained with one manual action.
- Post-durable failure retains the complete project and reports the exact resume phase, blocking condition, and one next action.
- Git begins only after durable application. Hook activation remains separately approved. The root seed uses one exclusive `prism-tool commit create --type ignore --subject "bootstrap prism project"` call.
- Core-only runs no adapter command. Adapter-selected projects use only the selected adapter's public dependency, verification, and quality contracts.
- Established projects never access Template data, the bootstrap adapter catalogue, capabilities, metadata, provider composition, the outer bootstrap transaction, or automatic root-seed creation.
- Setup creates no remote and performs no clone, fetch, pull, push, tag, release, pull request, ruleset, hosted-repository mutation, credential access, OCR expansion, or publication.
- No new dependency, Pi extension, safe directory, external API, or stack-specific Core behavior is introduced.
- Every created or modified `.js` or `.sh` file retains its RCS header and vim modeline.

---

### Task 1: Expose closed active-bootstrap status and selected-route inspection

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/bootstrap-status.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-adapter.js`
- Modify: `tests/Node/prism-tool-template-source.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-capabilities.test.js`
- Create: `tests/Node/prism-tool-bootstrap-orchestration.test.js`
- Modify: `docs/plans/2026-08-25-setup-orchestration-regression-coverage.md`

**Interfaces:**
- Add `prism-tool setup project status --json` with a closed schema reporting exactly one of `NO_ACTIVE_BOOTSTRAP`, `ADAPTER_PROVISIONED`, `PLAN_READY`, `PROJECT_DURABLE`, `REPOSITORY_CREATED`, `HOOKS_ACTIVE`, `SEED_READY`, `COMPLETE`, or `RECOVERY_REQUIRED`.
- Active status data contains only validated inert continuity values: attempt ID, plan digest when present, source, nullable adapter identity, retained phase, resume phase, retained-state description, blocking condition, and one next action.
- Status accepts no caller attempt, digest, path, source, adapter, or recovery override. Missing state is `NO_ACTIVE_BOOTSTRAP`; multiple, malformed, symlinked, escaping, unsupported, or changing attempts return `RECOVERY_REQUIRED` without mutation.
- Extend `setup source` and `setup project metadata` with the selected route controls:

```text
--source=template|blank --adapter=core-only|PACKAGE [--attempt=UUID]
```

- Core-only requires no attempt and revalidates strict emptiness. A package requires one validated provisional receipt matching source, exact catalogue identity, package version, and protocol. Template source inspection requires `--network-approved=yes`; Blank forbids it.
- Metadata inspection remains read-only, returns only fields for selected capabilities, and includes the selected source and nullable adapter identity.

- [x] **Step 1: Add a failing public status test for no active bootstrap and one provisioned adapter**

Add one test through `main()` proving an empty/established project reports `NO_ACTIVE_BOOTSTRAP`, while a validated receipt-only attempt reports `ADAPTER_PROVISIONED` with one cleanup action and no project mutation.

- [x] **Step 2: Run the focused status test to verify Red**

Run:

```bash
node --test --test-name-pattern='active bootstrap status' tests/Node/prism-tool-bootstrap-orchestration.test.js
```

Expected: FAIL because `setup project status` is unavailable.

- [x] **Step 3: Implement the minimum closed status inspection**

Create `bootstrap-status.js` with bounded directory discovery, UUID validation, no-follow path checks, closed receipt/journal recognition, and inert report rendering. Wire only `setup project status [--json]` in `cli.js`.

- [x] **Step 4: Add and satisfy the status failure matrix**

Cover multiple attempts, unknown entries, symlinked roots/files, malformed receipts/journals, unsupported phases, changed state, complete cleanup interruption, and manual recovery. Assert no removal, write, subprocess, network, Git, or adapter execution.

- [x] **Step 5: Add selected-route source and metadata tests one behavior at a time**

Prove Template and Blank inspection for Core-only and provisioned PHP/web selections; exact receipt/source mismatch rejection; Template catalogue reporting after adapter selection; Blank zero-fetch behavior; canonical capability ordering; and unchanged strict-empty roots.

- [x] **Step 6: Implement selected-route source and metadata inspection**

Reuse `inspectProvisionedBootstrapAdapter` through a caller-authority-free validated-attempt helper. Keep all source URLs fixed and all metadata fields generated by `inspectCapabilityMetadata`.

- [x] **Step 7: Run the focused Task 1 suites**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-orchestration.test.js tests/Node/prism-tool-template-source.test.js tests/Node/prism-tool-bootstrap-capabilities.test.js
```

Expected: PASS.

- [x] **Step 8: Verify, review, update checkboxes, and create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-status.js packages/prism-core/scripts/prism-tool/bootstrap-adapter.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-orchestration.test.js tests/Node/prism-tool-template-source.test.js tests/Node/prism-tool-bootstrap-capabilities.test.js docs/plans/2026-08-25-setup-orchestration-regression-coverage.md
prism-tool commit create --type feat --scope setup --subject "inspect resumable bootstrap state"
```

---

### Task 2: Complete strict-empty pre-durable prompt orchestration

**Files:**
- Modify: `packages/prism-core/prompts/setup.md`
- Modify: `tests/Shell/toolchain_entrypoints_test.sh`
- Modify: `tests/Node/prism-tool-bootstrap-orchestration.test.js`
- Modify: `docs/plans/2026-08-25-setup-orchestration-regression-coverage.md`

**Interfaces:**
- `STRICT_EMPTY` never enters established setup sections.
- Source selection remains Template, Blank, or Cancel with Template as the empty-answer default.
- Adapter selection remains Core only, PHP/web, or Cancel with exact package/version display and one implicit bounded acquisition authorization.
- Template source inspection occurs only after adapter selection and exposes only the validated capability catalogue. Blank offers the closed Core capability list without network access.
- One capability question accepts `none` or a comma-separated selection from the displayed list; no capability is preselected.
- `setup project metadata` supplies the exact selected fields. The prompt asks each field separately, previews every `publications` entry, and requires one explicit publication confirmation before planning.
- The prompt serializes one normalized single-line JSON object as a single-quoted here-document to `setup project plan`; metadata values are rejected before shell rendering if they contain controls or newlines.
- The complete `PLAN_READY` report is displayed before one literal `yes` approval. Decline invokes `setup project recover` for a prepared plan or `setup adapter cleanup` for a receipt-only attempt.

- [ ] **Step 1: Add failing prompt-contract assertions for the complete pre-durable order**

Assert command and question ordering, disabled capability defaults, selected-field metadata, identity preview, here-document stdin, complete plan display, literal plan approval, decline recovery, and absence of redundant adapter approval.

- [ ] **Step 2: Run the shell contract to verify Red**

Run:

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
```

Expected: FAIL because `/setup` currently cleans the adapter and stops before source, capability, metadata, and plan orchestration.

- [ ] **Step 3: Replace the strict-empty temporary stop with the approved flow**

Update only the strict-empty section of `setup.md`. Keep the established sections behaviorally unchanged. Require closed report schemas and render validated attempt IDs, package identities, capability IDs, and digests literally in later commands.

- [ ] **Step 4: Add public transcript regressions**

In the Node orchestration suite, exercise Template-default, Blank, Cancel, Core-only, PHP/web, no-capability, selected-capability, metadata-preview decline, and plan decline transcripts through public launcher commands. Assert pre-durable decline restores an empty root.

- [ ] **Step 5: Run the focused Task 2 suites**

Run:

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
node --test tests/Node/prism-tool-bootstrap-orchestration.test.js
```

Expected: PASS.

- [ ] **Step 6: Verify, review, update checkboxes, and create the commit**

```bash
git add packages/prism-core/prompts/setup.md tests/Shell/toolchain_entrypoints_test.sh tests/Node/prism-tool-bootstrap-orchestration.test.js docs/plans/2026-08-25-setup-orchestration-regression-coverage.md
prism-tool commit create --type feat --scope setup --subject "orchestrate strict empty project planning"
```

---

### Task 3: Complete post-durable resume, hooks, seed, and final reporting

**Files:**
- Modify: `packages/prism-core/prompts/setup.md`
- Modify: `tests/Shell/toolchain_entrypoints_test.sh`
- Modify: `tests/Node/prism-tool-bootstrap-orchestration.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-seed.test.js`
- Modify: `docs/plans/2026-08-25-setup-orchestration-regression-coverage.md`

**Interfaces:**
- After `setup route` reports an established root, `/setup` runs read-only `setup project status --json` before package-release inspection or adapter discovery. `NO_ACTIVE_BOOTSTRAP` continues established setup unchanged; any active bootstrap follows only its validated resume phase.
- Plan approval runs `setup project validate`, then `setup project apply --approval=yes` with the exact attempt and digest.
- Resume dispatch is closed:
  - receipt only → cleanup or continue source/metadata/planning;
  - `PROJECT_APPLICATION`, `BOOTSTRAP_DEPENDENCIES`, `BOOTSTRAP_VERIFICATION`, or provider effect/verification → rerun project apply;
  - `REPOSITORY_CREATION` → repository create;
  - `HOOK_ACTIVATION` → hooks inspect and the separate hook question;
  - `ROOT_SEED_PREPARATION` → seed prepare;
  - `ROOT_SEED_COMMIT` → one exclusive commit operation;
  - `MANUAL_RECOVERY` or unsupported state → stop with the report's one action.
- Hook activation asks exactly `Activate the displayed canonical Git hooks? (yes/no)` and only literal `yes` runs `setup hooks apply --approval=yes`.
- Seed preparation runs after active hooks and displays exact staged inventory and quality results.
- Root commit creation is the sole tool call in its assistant batch:

```bash
prism-tool commit create --type ignore --subject "bootstrap prism project"
```

- Final success reports the root commit, no remote, and exactly these human-owned actions: create/configure the hosted repository, add the remote, push `develop`, then configure post-push rulesets. Setup executes none of them.

- [ ] **Step 1: Add failing prompt-contract assertions for resume and post-durable ordering**

Cover status-before-established-discovery, validate-before-apply, repository-after-durable, separate hook approval, seed-after-hooks, exclusive commit wording, bounded recovery, and human-owned publication.

- [ ] **Step 2: Run the shell contract to verify Red**

Run:

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
```

Expected: FAIL because the strict-empty prompt has no post-durable or rerun flow.

- [ ] **Step 3: Implement the closed resume and completion flow in `/setup`**

Add phase dispatch and final-report tables without changing established setup behavior when status is `NO_ACTIVE_BOOTSTRAP`.

- [ ] **Step 4: Add public end-to-end and failure-injection regressions**

Exercise Blank/Template × Core-only/PHP-web through seed readiness, plus retained failures at project application, dependency population, verification, repository creation, hook activation, seed preparation, and root commit. Assert each status points to the exact next operation and no forbidden publication command runs.

- [ ] **Step 5: Run the focused Task 3 suites**

Run:

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
node --test tests/Node/prism-tool-bootstrap-orchestration.test.js tests/Node/prism-tool-bootstrap-seed.test.js
```

Expected: PASS.

- [ ] **Step 6: Verify, review, update checkboxes, and create the commit**

```bash
git add packages/prism-core/prompts/setup.md tests/Shell/toolchain_entrypoints_test.sh tests/Node/prism-tool-bootstrap-orchestration.test.js tests/Node/prism-tool-bootstrap-seed.test.js docs/plans/2026-08-25-setup-orchestration-regression-coverage.md
prism-tool commit create --type feat --scope setup --subject "complete bootstrap recovery and root seed"
```

---

### Task 4: Lock established-project isolation and the complete regression matrix

**Files:**
- Modify: `tests/Node/prism-tool-bootstrap-orchestration.test.js`
- Modify: `tests/Node/prism-tool-setup-route.test.js`
- Modify: `tests/Shell/toolchain_entrypoints_test.sh`
- Modify: `docs/plans/2026-08-25-setup-orchestration-regression-coverage.md`

**Interfaces:**
- Existing route schema and `ESTABLISHED_SETUP` behavior remain unchanged.
- A project with no active bootstrap attempt follows the existing package-release, readiness, consent, preferences, adapter discovery, candidate transaction, hooks, optional diagnostics, GitHub opt-in, validation, and final-report sequence.
- Established setup never invokes or mentions strict-empty source acquisition, adapter catalogue selection, project capability selection, project metadata, project plan/application/recovery, repository creation, bootstrap hooks, seed preparation, or automatic root commits.
- Complete tests assert no authenticated GitHub, arbitrary URL, credential, Git remote, push, OCR expansion, hosted mutation, or publication authority.

- [ ] **Step 1: Add a failing established-project isolation transcript**

Use a non-empty isolated root with no bootstrap state and record every launcher boundary. Assert status inspection is read-only and every empty-project boundary remains uncalled.

- [ ] **Step 2: Run focused regressions to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-orchestration.test.js tests/Node/prism-tool-setup-route.test.js
bash tests/Shell/toolchain_entrypoints_test.sh
```

Expected: FAIL until the final orchestration explicitly preserves the established route.

- [ ] **Step 3: Tighten prompt and launcher regressions without changing established mechanics**

Add only assertions and minimal report handling needed to prove isolation. Do not refactor or reorder the accepted established-project sections.

- [ ] **Step 4: Run all public bootstrap Node suites and the prompt seam**

Run:

```bash
node --test tests/Node/prism-tool-setup-route.test.js tests/Node/prism-tool-template-source.test.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-bootstrap-orchestration.test.js tests/Node/prism-tool-php-web-bootstrap.test.js
bash tests/Shell/toolchain_entrypoints_test.sh
```

Expected: PASS.

- [ ] **Step 5: Verify, review, update checkboxes, and create the commit**

```bash
git add tests/Node/prism-tool-bootstrap-orchestration.test.js tests/Node/prism-tool-setup-route.test.js tests/Shell/toolchain_entrypoints_test.sh docs/plans/2026-08-25-setup-orchestration-regression-coverage.md
prism-tool commit create --type test --scope setup --subject "regress complete setup orchestration"
```

---

### Task 5: Publish the completed setup contract and run the full gate

**Files:**
- Modify: `packages/prism-core/README.md`
- Modify: `packages/prism-php-web/README.md`
- Modify: `README.md`
- Modify: `CODING_HARNESS.md`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `tests/Shell/toolchain_entrypoints_test.sh`
- Modify: `docs/plans/2026-08-25-setup-orchestration-regression-coverage.md`

**Interfaces:**
- Remove every statement that interactive orchestration or preview confirmation is deferred to task 12.
- Document Template, Blank, Cancel, Core-only, PHP/web, disabled-by-default capabilities, identity preview, complete-plan approval, strict-empty rollback, retained recovery, post-durable Git order, separate hook approval, signed seed, and established-project isolation.
- Document that setup creates no remote and that hosted repository creation, remote addition, initial `develop` push, and post-push rulesets are human actions.
- Package tests assert the complete public contract and reject stale deferred wording.

- [ ] **Step 1: Add failing packaging and documentation assertions**

Require completed orchestration, deterministic recovery, human publication actions, and absence of `deferred to task 12`.

- [ ] **Step 2: Run focused documentation tests to verify Red**

Run:

```bash
node --test tests/Node/toolchain-packaging.test.js
bash tests/Shell/toolchain_entrypoints_test.sh
```

Expected: FAIL on stale deferred documentation and missing public workflow text.

- [ ] **Step 3: Update public and packaged documentation**

Describe behavior and boundaries without duplicating implementation internals or weakening the prompt/launcher source of truth.

- [ ] **Step 4: Run focused tests to verify Green**

Run:

```bash
node --test tests/Node/toolchain-packaging.test.js
bash tests/Shell/toolchain_entrypoints_test.sh
```

Expected: PASS.

- [ ] **Step 5: Run complete Node and shell regression suites**

Run:

```bash
npm run test:node
bash tests/Shell/toolchain_entrypoints_test.sh
```

Expected: PASS.

- [ ] **Step 6: Run the repository pre-push gate**

Run `/check` through the active prompt workflow. Expected: every Core and PHP/web delegated check passes, including lint, generated-CI parity, security checks, Node tests, shell tests, Pest coverage, and changed-file coverage.

- [ ] **Step 7: Verify, review, update checkboxes, and create the commit**

```bash
git add packages/prism-core/README.md packages/prism-php-web/README.md README.md CODING_HARNESS.md tests/Node/toolchain-packaging.test.js tests/Shell/toolchain_entrypoints_test.sh docs/plans/2026-08-25-setup-orchestration-regression-coverage.md
prism-tool commit create --type docs --scope setup --subject "publish strict empty setup contract"
```

---

## Completion

After every task is checked and committed:

1. Load `verification-before-completion` and rerun the complete relevant feedback loops.
2. Load `finishing-a-development-branch` automatically under the approved plan authorization.
3. Remove this plan and the superseded active development spec artifact under ADR-0027 while retaining Git history.
4. Synchronize with `develop`, run `/check` until green, run one four-axis review, revalidate HEAD, and prepare `/pr` artifacts.
5. Use `Fixes: #392` on the final implementation or regression commit so GitHub closes Task 12 after the human merges the pull request.
