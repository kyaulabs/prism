# Core-only Repository Bootstrap and Root Seed Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Turn an active durable Blank Core-only bootstrap attempt into one deterministic unborn `develop` repository with active canonical hooks, an exactly attested staged inventory, and one signed `ignore: bootstrap prism project` root commit.

**Architecture:** Add separate Core-owned repository, hook, and seed modules behind narrow public `prism-tool` operations. Extend the durable bootstrap journal through post-application and completion states, keep the root-seed attestation in the launcher-owned attempt directory, and make the existing standalone `prism-tool commit create` operation validate and consume that attestation when—and only when—the reserved initial-seed message is requested.

**Tech Stack:** Node.js 22.19+ built-ins, CommonJS, Git CLI through bounded argv-array subprocesses, `node:test`, public `prism-tool` CLI integration tests, packaged shell hook wrappers.

## Global constraints

- Implement only Blank + Core-only post-durable repository bootstrap, canonical-hook activation/dispatch, Core-only quality, bounded seed staging, attestation, and root-commit completion for Epic task #6.
- Template evidence, adapter-backed bootstrap, dependencies, browser acquisition, stack quality, optional capabilities, and final `/setup` conversation orchestration remain tasks #7–#12.
- Git must remain absent until the existing journal is valid, active, `DURABLE`, and bound to the exact applied project inventory.
- Repository creation is create-only. Existing, containing, malformed, concurrent, redirected, bare, detached, unsupported-format, or manually initialized state is preserved and never made seed-eligible.
- A created repository has a real `.git` directory, unborn `develop`, SHA-1 objects, files refs, zero commits and refs, no remotes, no active hooks, and no identity, signing, credential, or publication configuration introduced by setup.
- The bootstrap journal remains closed and versioned. Extend it with `POST_APPLICATION` and `COMPLETE` states and exact repository, hook, and seed evidence; reject unknown or inconsistent combinations.
- Canonical hook wrappers remain the four files already rendered by the Core baseline. Activation is separately approval-gated and writes repository-local `core.hooksPath=.github/hooks` only after complete reinspection.
- Core-only hook dispatch never discovers, loads, or invokes an adapter command.
- Stage only exact plan outputs. Never stage the attempt directory, journal, attestation, source/provider workspaces, credentials, environment files, remote state, or unrelated paths.
- The staged-index digest is semantic SHA-256 evidence over exact path, Git mode, and staged bytes; unexpected staged entries or working-tree substitution block seed preparation.
- Core-only quality includes local Core readiness, durable-project validation, hook integrity, `git diff --cached --check`, exact staged-inventory validation, and reserved-message validation. No adapter check or bootstrap-only bypass is introduced.
- `prism-tool commit create --type ignore --subject "bootstrap prism project"` is valid only with one active eligible attestation. It remains a standalone commit operation so ADR-0074's fatal commit-failure latch observes every failure.
- Successful root-commit creation verifies the new zero-parent commit, consumes the one-use attestation, marks the journal complete, and removes only the ownership-proven transient attempt tree. Any late verification/finalization failure returns non-zero and preserves evidence for `/reload` inspection.
- Setup creates no remote and performs no clone, fetch, pull, push, merge, amend, tag, pull request, ruleset, release, or publication operation.
- Use no new dependency, Pi extension, safe directory, credential access, or network authority.
- Every new or modified `.js`/`.sh` source follows the required RCS header and final vim modeline via the `rcs-header` workflow.

## Threat model

- **Assets:** durable project bytes, human concurrent content, repository identity, staged seed, one-use attestation, signed root history, and recovery evidence.
- **Trust boundaries:** mutable filesystem state around `.git`, ambient Git configuration/environment, hook activation, Git index staging, hook subprocesses, and commit completion.
- **Attacker control:** a concurrent local process may create or replace `.git`, alter project outputs, inject index entries, replace hooks, change Git configuration, substitute attestation state, or race cleanup.
- **Fail-closed behavior:** never normalize or delete ambiguous repository state; bind every mutation to held canonical roots and active-attempt evidence; stage no directory globs; reject ambient redirection and unexpected effective hook configuration; preserve post-durable evidence on ambiguity.

---

### Task 1: Create deterministic post-durable repositories

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/bootstrap-repository.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-journal.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-transaction.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Create: `tests/Node/prism-tool-bootstrap-seed.test.js`

**Interfaces:**
- Consumes: `validateDurableBootstrapProject({projectRoot, coreRoot, attemptId, planDigest})` exported from `bootstrap-transaction.js`.
- Produces: `createBootstrapRepository({projectRoot, coreRoot, attemptId, planDigest, runGit, fault})`.
- Produces CLI: `prism-tool setup repository create --attempt=UUID --digest=SHA256 [--json]`.
- Extends journal phases to `PREPARED | APPLYING | DURABLE | POST_APPLICATION | COMPLETE` and statuses to `ACTIVE | RECOVERY_REQUIRED | COMPLETE`.
- Produces repository evidence with exact keys `disposition`, `gitDirectory`, `branch`, `objectFormat`, `refFormat`, and `configDigest`.

- [x] **Step 1: Write failing public repository-creation tests**

Create `tests/Node/prism-tool-bootstrap-seed.test.js` with the existing `captureWrites()`, `planProject()`, and `applyProject()` pattern, then add:

```javascript
function createRepository(projectRoot, attemptId, planDigest, context = {}) {
    return captureWrites(() => main([
        'setup', 'repository', 'create', `--attempt=${attemptId}`,
        `--digest=${planDigest}`, '--json',
    ], {projectRoot, ...context}));
}
```

The happy path must plan and apply a Blank Core-only project, assert `.git` is absent before the operation, invoke the public command, and assert:

```javascript
assert.equal(result.status, 0);
assert.equal(report.status, 'GO');
assert.equal(report.disposition, 'REPOSITORY_CREATED');
assert.equal(report.data.resumePhase, 'HOOK_ACTIVATION');
assert.equal(execGit(projectRoot, ['symbolic-ref', 'HEAD']), 'refs/heads/develop');
assert.equal(execGitStatus(projectRoot, ['rev-parse', '--verify', 'HEAD']), 1);
assert.equal(execGit(projectRoot, ['remote']), '');
assert.equal(execGit(projectRoot, ['rev-parse', '--show-object-format=storage']), 'sha1');
assert.equal(execGit(projectRoot, ['rev-parse', '--show-ref-format']), 'files');
```

Read the journal and assert `phase === 'POST_APPLICATION'`, `resumePhase === 'HOOK_ACTIVATION'`, `repository.disposition === 'CREATE'`, `hooks === null`, and `seed === null`.

Add table-driven rejection tests for malformed controls, non-durable attempts, changed applied output, extra durable project content, pre-existing `.git` file/directory/symlink, containing worktree, bare repository, detached repository, unborn non-`develop`, SHA-256 object format, reftable refs, configured remote, concurrent `.git` creation, and ambient `GIT_DIR`/`GIT_WORK_TREE`/`GIT_COMMON_DIR`/`GIT_OBJECT_DIRECTORY` redirection. Every rejected state must be retained without `git init`, normalization, or deletion and must not produce repository evidence.

- [x] **Step 2: Run the focused test to verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-seed.test.js`

Expected: FAIL because repository creation and post-application journal states do not exist.

- [x] **Step 3: Extend the journal with closed post-application states**

In `bootstrap-journal.js`, add exact nullable fields to every journal record:

```javascript
repository: null,
hooks: null,
seed: null,
```

Keep existing `PREPARED`, `APPLYING`, and `DURABLE` combinations valid only with all three fields null. Add these exact combinations:

```text
POST_APPLICATION / ACTIVE / HOOK_ACTIVATION
    repository=CREATE evidence, hooks=null, seed=null
POST_APPLICATION / ACTIVE / ROOT_SEED_PREPARATION
    repository=CREATE evidence, hooks=ACTIVE evidence, seed=null
POST_APPLICATION / ACTIVE / ROOT_SEED_COMMIT
    repository=CREATE evidence, hooks=ACTIVE evidence, seed=READY evidence
COMPLETE / COMPLETE / null
    repository=CREATE evidence, hooks=ACTIVE evidence, seed=CONSUMED evidence
```

Validate every nested object with exact keys, lower-case SHA-256 digests, non-negative device/inode values, fixed dispositions, and no arbitrary paths. Update prepared-journal tests in `prism-tool-bootstrap-plan.test.js` for the three new null fields.

Export `validateDurableBootstrapProject()` from `bootstrap-transaction.js` as the single read-only durable-state seam; keep application/recovery behavior unchanged.

- [x] **Step 4: Implement deterministic create-only Git initialization**

In `bootstrap-repository.js`:

1. Canonicalize and hold the project root; revalidate the active durable plan, journal, applied inventory, and absence of `.git`.
2. Acquire one attempt-owned `repository.lock` with `wx`, mode `0600`, and exact attempt content.
3. Detect a containing worktree with a sanitized Git environment before initialization. A top-level result different from the canonical project root is `CONFLICT`.
4. Create an empty mode-`0700` template directory under the attempt and invoke Git by argv array with explicit initialization controls:

```javascript
[
    'init', '--initial-branch=develop', '--object-format=sha1',
    '--ref-format=files', `--template=${templateRoot}`, projectRoot,
]
```

5. Remove Git repository-redirection variables from the child environment and set `GIT_CONFIG_NOSYSTEM=1` plus a platform-appropriate empty global config file owned by the attempt.
6. Reopen and validate the real `.git` directory, unborn `refs/heads/develop`, SHA-1 storage, files refs, zero refs/commits/remotes, absent hooks, and the exact local config keys Git itself requires. Reject introduced identity, signing, credential, include, remote, branch, alternates, template, worktree, or publication configuration.
7. Compute a digest of the held `.git/config`, transition `DURABLE -> POST_APPLICATION`, persist `CREATE` evidence, and return `REPOSITORY_CREATED / HOOK_ACTIVATION`.
8. On any ambiguous or concurrent state, preserve `.git` and the durable project, mark recovery required when safe, and never retry or run cleanup against repository state not proven to belong to the active call.

Wire the exact grammar into `cli.js`; return bounded JSON with one next action and no ambient path or config contents.

- [x] **Step 5: Run focused and adjacent tests**

Run: `node --test tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: PASS with Git absent before durable application and one eligible unborn `develop` repository afterward.

- [x] **Step 6: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-repository.js packages/prism-core/scripts/prism-tool/bootstrap-journal.js packages/prism-core/scripts/prism-tool/bootstrap-transaction.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js
prism-tool commit create --type feat --scope setup --subject "create durable core-only repositories" --refs 386
```

---

### Task 2: Activate canonical hooks after complete reinspection

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/bootstrap-hooks.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-journal.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-repository.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-bootstrap-seed.test.js`

**Interfaces:**
- Consumes: active `POST_APPLICATION / HOOK_ACTIVATION` journal, repository evidence, plan outputs, and packaged hook resources.
- Produces: `inspectBootstrapHooks({projectRoot, coreRoot, attemptId, planDigest, runGit})`.
- Produces: `applyBootstrapHooks({projectRoot, coreRoot, attemptId, planDigest, approval, runGit, fault})`.
- Produces CLI:
  - `prism-tool setup hooks inspect --attempt=UUID --digest=SHA256 [--json]`
  - `prism-tool setup hooks apply --attempt=UUID --digest=SHA256 --approval=yes [--json]`
- Produces hook evidence `{disposition: 'ACTIVE', hooksPath: '.github/hooks', inventoryDigest: SHA256}`.

- [x] **Step 1: Write failing inspection and activation tests**

Add helpers for `setup hooks inspect` and `setup hooks apply`. The inspection happy path must report the four exact executable wrappers as `PRESERVE`, report no active effective hooks path, and perform no writes.

The apply happy path must require literal approval, set only repository-local `core.hooksPath=.github/hooks`, verify the value and origin, transition the journal to `ROOT_SEED_PREPARATION`, and preserve hook mtimes/inodes.

Add conflicts for changed bytes, mode drift, symlink/non-regular targets, unknown or duplicate canonical wrappers, active non-sample `.git/hooks/<event>`, effective system/global/worktree/command hooks paths, differing local hooks path, `.git/config` substitution, concurrent configuration change, and activation failure. Existing bytes and human configuration must be preserved; rollback may remove only the exact local config value written by the active call.

- [x] **Step 2: Run the focused test to verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-seed.test.js`

Expected: FAIL because hook inspection and approval-gated activation do not exist.

- [x] **Step 3: Implement package-to-project hook attestation**

In `bootstrap-hooks.js`:

- Revalidate the durable plan, repository evidence, and journal phase before every operation.
- Read the packaged and project wrappers through `O_NOFOLLOW`; require exact bytes and mode `0755` for `commit-msg`, `pre-commit`, `pre-push`, and `prepare-commit-msg`.
- Require the four paths to be part of the applied plan inventory; never accept a caller-provided hook source or target.
- Inspect every effective `core.hooksPath` origin with bounded Git output. No effective value is the only apply-ready state; exact repository-local `.github/hooks` is the idempotent active state; every other value is conflict.
- Inspect `.git/hooks` and reject any executable non-sample event hook. Preserve unrelated inactive/sample files.
- Compute the semantic hook inventory digest from event, mode, and SHA-256.
- During apply, repeat inspection, set repository-local `core.hooksPath` as the final commit point, re-read origin/value, transition the journal to `ROOT_SEED_PREPARATION`, and return `HOOKS_ACTIVE`.
- If a caught failure occurs after the local write, unset only when the current origin/value still exactly match the active call; otherwise preserve state and report manual recovery.

- [x] **Step 4: Run the focused test to verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-seed.test.js`

Expected: PASS with no wrapper rewrite and one exact local hooks-path activation.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-hooks.js packages/prism-core/scripts/prism-tool/bootstrap-journal.js packages/prism-core/scripts/prism-tool/bootstrap-repository.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-seed.test.js
prism-tool commit create --type feat --scope setup --subject "activate canonical bootstrap hooks" --refs 386
```

---

### Task 3: Dispatch Core-only hook policy through the launcher

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/hook.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-bootstrap-seed.test.js`
- Create: `tests/Shell/bootstrap_hook_dispatch_test.sh`

**Interfaces:**
- Produces: `hookCommand(args, context)`.
- Produces CLI: `prism-tool hook pre-commit|commit-msg|prepare-commit-msg|pre-push ...`.
- Consumes bounded stdin only for `pre-push`.
- Consumes `.prism/project.json` and treats `adapter: null` as explicit Core-only state.
- Produces no adapter subprocess invocation for Core-only projects.

- [x] **Step 1: Write failing launcher and wrapper tests**

In the Node test, cover exact event grammar, bounded stdin, message-file containment beneath the active Git directory, local readiness before commit-message validation, protected-branch root exception, later protected-branch rejection, non-fast-forward rejection, and explicit Core-only adapter absence.

In `tests/Shell/bootstrap_hook_dispatch_test.sh`, create a disposable Core-only repository, place a fake `prism-tool` first on `PATH`, invoke each packaged wrapper, and assert event name, argument boundaries, exit status, and pre-push stdin are propagated exactly once. Also assert a missing launcher fails closed.

- [x] **Step 2: Run tests to verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-seed.test.js`

Run: `bash tests/Shell/bootstrap_hook_dispatch_test.sh`

Expected: FAIL because the public `hook` command is not dispatched.

- [x] **Step 3: Implement the closed Core hook dispatcher**

In `hook.js`:

- Accept only the four event names and their Git-defined argument counts.
- Resolve the canonical repository and read the bounded regular `.prism/project.json`; require schema version `1` and explicit `adapter: null` for this slice.
- `pre-commit`: run Core local readiness, `git diff --cached --check`, and read-only active seed-attestation validation when a root seed is pending. Do not modify source or index.
- `commit-msg`: validate the message path resolves beneath the current Git directory, run local readiness, then invoke bundled commitlint through the existing launcher with `--edit` and one inert path argument.
- `prepare-commit-msg`: invoke the packaged branch validator by argv array; permit protected `develop` only for unborn HEAD with no matching remote; retain pushed-amend protection for the Git-provided `commit`/`HEAD` form.
- `pre-push`: parse bounded four-field lines, allow `develop`/`main` only for the exact single zero-parent initial push, reject protected direct pushes otherwise, and reject non-fast-forward updates. Do not fetch or contact a remote.
- Unknown project metadata, non-null adapter, malformed stdin, unsupported OIDs, detached state, or subprocess failure fails closed with generic diagnostics.

Wire `hookCommand` into `main()` without changing `run` or `commit` dispatch.

- [x] **Step 4: Run hook tests to verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-seed.test.js`

Run: `bash tests/Shell/bootstrap_hook_dispatch_test.sh`

Expected: PASS, including proof that Core-only dispatch invokes no adapter handler or consumer-development command.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/hook.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Shell/bootstrap_hook_dispatch_test.sh
prism-tool commit create --type feat --scope hooks --subject "dispatch core-only hook policy" --refs 386
```

---

### Task 4: Stage and attest the exact Core-only seed

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/bootstrap-seed.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-hooks.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-journal.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-plan.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-repository.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-transaction.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `packages/prism-core/scripts/prism-tool/hook.js`
- Modify: `tests/Node/prism-tool-bootstrap-seed.test.js`

**Interfaces:**
- Produces: `prepareBootstrapSeed({projectRoot, coreRoot, attemptId, planDigest, runGit, runTool, fault})`.
- Produces: `validateActiveBootstrapSeed({projectRoot, coreRoot, runGit})` for hook and commit consumption.
- Produces CLI: `prism-tool setup seed prepare --attempt=UUID --digest=SHA256 [--json]`.
- Produces one mode-`0600` fixed-path `seed-attestation.json` under the active attempt.
- Produces seed evidence `{status: 'READY', attestationDigest: SHA256, stagedIndexDigest: SHA256}` and resume phase `ROOT_SEED_COMMIT`.

- [x] **Step 1: Write failing exact-staging and attestation tests**

The happy path must assert:

```javascript
assert.equal(report.status, 'GO');
assert.equal(report.disposition, 'SEED_READY');
assert.deepEqual(report.data.commit, {
    type: 'ignore',
    scope: null,
    subject: 'bootstrap prism project',
});
assert.deepEqual(stagedNames(projectRoot), plan.outputs.map(({path}) => path).sort());
assert.equal(fs.statSync(attestationPath).mode & 0o777, 0o600);
assert.equal(journal.resumePhase, 'ROOT_SEED_COMMIT');
assert.equal(journal.seed.status, 'READY');
```

Assert the attestation binds canonical root, attempt ID, Blank source, provider identities/versions/report digests, metadata digest, null adapter, plan digest, applied-inventory digest, durable-journal digest, repository evidence, hook inventory digest, and staged-index digest.

Add failures for pre-staged entries, extra/missing/replaced/mode-drifted plan output, changed project manifest, changed repository config, inactive hooks, changed hook bytes, index lock, intent-to-add entry, submodule/symlink/special staged kind, index mutation during preparation, readiness failure, whitespace/conflict-marker failure, and attestation substitution. Unrelated untracked files remain untouched and unstaged but are reported in bounded counts, not contents.

- [x] **Step 2: Run the focused test to verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-seed.test.js`

Expected: FAIL because exact seed preparation and attestation do not exist.

- [x] **Step 3: Implement semantic index staging and Core quality**

In `bootstrap-seed.js`:

1. Revalidate the active `ROOT_SEED_PREPARATION` journal, durable project, repository evidence, hook evidence, and empty Git index.
2. Validate every plan output through held parents and stage each literal path with argv-array `git add -- <path>`; never stage a directory or glob.
3. Read the resulting index with `git ls-files --stage -z` and each staged blob with `git show :<path>`. Require exactly one regular stage-0 entry per plan output, expected Git mode (`100644` or `100755`), and exact bytes/digest.
4. Compute `stagedIndexDigest` from the ordered records:

```javascript
{path, gitMode, sha256}
```

5. Run Core-only quality: local doctor, durable plan/inventory validation, canonical hook validation, `git diff --cached --check`, and a second complete staged-inventory validation. Record closed PASS checks.
6. Write `seed-attestation.json` exclusively with mode `0600`, fsync it, reopen through `O_NOFOLLOW`, and validate exact schema and digest.
7. Transition the journal to `ROOT_SEED_COMMIT` only after final index revalidation; return the fixed structured commit fields without executing a commit.
8. On failure before attestation publication, reset only index entries staged by the current call when the index still matches the recorded active-call state. On ambiguous index change, preserve it and report manual recovery rather than resetting human entries.

`validateActiveBootstrapSeed()` must be read-only, discover exactly one active eligible attempt beneath the fixed bootstrap root, revalidate every attestation binding and current staged digest, and reject caller-selected attestation paths.

- [x] **Step 4: Run the focused test to verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-seed.test.js`

Expected: PASS with exact staged equality, Core-only quality, and no adapter/network/remote operation.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-seed.js packages/prism-core/scripts/prism-tool/bootstrap-hooks.js packages/prism-core/scripts/prism-tool/bootstrap-journal.js packages/prism-core/scripts/prism-tool/bootstrap-plan.js packages/prism-core/scripts/prism-tool/bootstrap-repository.js packages/prism-core/scripts/prism-tool/bootstrap-transaction.js packages/prism-core/scripts/prism-tool/cli.js packages/prism-core/scripts/prism-tool/hook.js tests/Node/prism-tool-bootstrap-seed.test.js
prism-tool commit create --type feat --scope setup --subject "attest the core-only root seed" --refs 386
```

---

### Task 5: Consume root-seed attestations in the exclusive commit operation

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-hooks.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-journal.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-repository.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-seed.js`
- Modify: `packages/prism-core/scripts/prism-tool/commit.js`
- Modify: `tests/Node/prism-tool-commit.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-seed.test.js`

**Interfaces:**
- Produces: `completeBootstrapSeed({projectRoot, coreRoot, attestation, previousHead, newHead, runGit, fault})`.
- Extends: `prism-tool commit create` reserved `ignore` semantics.
- Exact reserved invocation: `prism-tool commit create --type ignore --subject "bootstrap prism project"`.
- Successful output remains the canonical commit message followed by `Commit: <OID>`.

- [x] **Step 1: Write failing reserved-commit and completion tests**

Extend commit tests so `ignore` is rejected when any of these holds: no active attestation, scope/body/issue reference supplied, wrong subject, existing HEAD, non-`develop` branch, inactive hooks, changed index digest, consumed attestation, multiple attempts, or substituted evidence.

Add an eligible success test using the existing fake subprocess seam. Assert the command still performs local readiness, attribution, commitlint, locked-index copy, and exact `git commit -S -F`; assert the prepared message header is exactly `ignore: bootstrap prism project` with the ordinary three required footers.

Add completion assertions for zero-parent HEAD, `COMPLETE` journal transition, attestation consumption, exact transient attempt cleanup, retained committed project files, clean index/worktree, no remote, and no post-commit publication operation.

Inject failures after Git success but before journal completion and during attempt cleanup. Assert non-zero transaction status, retained evidence, no automatic retry, and compatibility with the existing fatal-latch tests.

- [x] **Step 2: Run focused tests to verify Red**

Run: `node --test tests/Node/prism-tool-commit.test.js tests/Node/prism-tool-bootstrap-seed.test.js`

Expected: FAIL because `ignore` does not require or consume root-seed evidence.

- [x] **Step 3: Bind the reserved commit to one-use evidence**

In `commit.js`:

- After structured parsing, treat `type === 'ignore'` as a reserved path. Require no scope, body, `Fixes`, or `Refs`, and require subject `bootstrap prism project`.
- Before attribution or commit mutation, call `validateActiveBootstrapSeed()` and retain the validated attestation as inert operation context.
- Revalidate the attestation after `repositoryState()` and again against the locked index tree before invoking Git.
- Preserve the existing standalone `git commit -S -F`, hooks-enabled execution, index-lock publication, HEAD-advance verification, and generic fatal-return semantics.
- After HEAD advances, call `completeBootstrapSeed()` before reporting success. A completion error is a transaction failure even though the commit may exist; preserve evidence and require reload/inspection.

In `bootstrap-seed.js`, `completeBootstrapSeed()` must:

1. Revalidate the attestation, previous unborn state, exact new HEAD, zero-parent commit, `develop`, no remote, and signed commit verification through bounded Git.
2. Transition the journal to `COMPLETE` with `seed.status='CONSUMED'` and the root commit OID.
3. Remove only the exact mode/identity/digest-matched attempt directory and empty owned operational parents; never remove the durable project or `.git`.
4. Confirm the repository has one commit, the index equals HEAD, the working tree contains only committed outputs plus no transient attempt state, and no second seed remains eligible.

Keep ordinary non-`ignore` commit behavior byte-for-byte compatible.

- [x] **Step 4: Run focused and safety tests**

Run: `node --test tests/Node/prism-tool-commit.test.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/safety-fatal-commit-latch.test.ts tests/Node/safety-extension-lifecycle.test.ts`

Expected: PASS. Every reserved-commit failure remains observable as a failed standalone commit operation and therefore fatal to the active Pi session.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-hooks.js packages/prism-core/scripts/prism-tool/bootstrap-journal.js packages/prism-core/scripts/prism-tool/bootstrap-repository.js packages/prism-core/scripts/prism-tool/bootstrap-seed.js packages/prism-core/scripts/prism-tool/commit.js tests/Node/prism-tool-commit.test.js tests/Node/prism-tool-bootstrap-seed.test.js
prism-tool commit create --type feat --scope setup --subject "complete signed core-only root seeds" --refs 386
```

---

### Task 6: Package and regress the complete Core-only seed boundary

**Files:**
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `tests/Shell/toolchain_entrypoints_test.sh`
- Modify: `packages/prism-core/README.md`
- Modify: `docs/agents/labels.md` only if the existing issue-progress guidance incorrectly implies default-branch auto-closure; otherwise do not touch it.

**Interfaces:**
- Consumes: packed Core package and public setup/repository/hooks/seed/hook/commit operations.
- Produces package inventory assertions for `bootstrap-repository.js`, `bootstrap-hooks.js`, `bootstrap-seed.js`, and `hook.js`.
- Produces bounded documentation for post-durable recovery and the human-owned publication boundary.

- [ ] **Step 1: Write failing package, CLI-grammar, and no-publication assertions**

Extend the packaged module list with:

```javascript
'bootstrap-hooks', 'bootstrap-repository', 'bootstrap-seed', 'hook'
```

Add public grammar tests rejecting unknown operations, duplicate controls, caller-selected journal/attestation/index paths, missing hook approval, non-literal approval, malformed attempts/digests, and extra arguments.

Add an end-to-end Core-only test sequence through the public CLI:

```text
plan -> apply -> repository create -> hooks inspect -> hooks apply
-> seed prepare -> standalone commit create -> verified one-commit repository
```

Stub only external readiness, attribution, signing verification, and commit subprocess boundaries where a real signed commit is unavailable. Assert no invocation contains remote, clone, fetch, pull, push, merge, tag, `gh`, release, publication, package manager, adapter handler, browser, OCR network, or credential operation.

- [ ] **Step 2: Run packaging and contract tests to verify Red**

Run: `node --test tests/Node/toolchain-packaging.test.js tests/Node/prism-tool-bootstrap-seed.test.js`

Run: `bash tests/Shell/toolchain_entrypoints_test.sh`

Expected: FAIL until the new modules and documented public commands are packaged.

- [ ] **Step 3: Complete bounded Core documentation**

Update `packages/prism-core/README.md` with the closed post-durable sequence:

```text
PROJECT_DURABLE / REPOSITORY_BOOTSTRAP
-> REPOSITORY_CREATED / HOOK_ACTIVATION
-> HOOKS_ACTIVE / ROOT_SEED_PREPARATION
-> SEED_READY / ROOT_SEED_COMMIT
-> ignore: bootstrap prism project
```

Document:

- Git begins only after durable application.
- Only active-attempt `CREATE` is seed-eligible.
- Hook mutation has a separate approval.
- Core-only dispatch invokes no adapter.
- Exact staging excludes operational and unrelated files.
- A commit failure requires `/reload` and inspection and is never retried automatically.
- Successful setup creates no remote and leaves remote creation, initial `develop` push, and post-push rulesets to the human.

Do not claim Template, adapter-backed, capability, or final prompt orchestration support in this slice.

- [ ] **Step 4: Run the complete verification set**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-commit.test.js tests/Node/prism-tool-setup-route.test.js tests/Node/toolchain-packaging.test.js`

Expected: PASS.

Run: `bash tests/Shell/bootstrap_hook_dispatch_test.sh`

Expected: PASS.

Run: `npm run test:node`

Expected: PASS.

Run: `bash packages/prism-core/scripts/validate-harness.sh`

Expected: PASS with 0 errors.

Run: `git diff --check`

Expected: no output.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/README.md tests/Node/toolchain-packaging.test.js tests/Shell/toolchain_entrypoints_test.sh tests/Shell/bootstrap_hook_dispatch_test.sh
prism-tool commit create --type test --scope setup --subject "regress core-only repository seeding" --refs 386
```

---

## Self-review

- **Issue coverage:** Tasks 1–5 cover post-durable Git ordering, deterministic unborn `develop`, create/preserve/conflict behavior, one-use eligibility, nullable adapter evidence, hook activation and Core-only dispatch, full attestation bindings, exact staging, Core-only quality, signed exclusive commit creation, fatal late-failure handling, and no publication. Task 6 covers packaging, public-contract regression, and documentation.
- **ADR coverage:** ADR-0084 is the controlling repository/seed decision; ADR-0044 supplies the root/protected-ref exception; ADR-0074 supplies standalone commit and fatal-latch semantics; ADR-0078 supplies canonical hook ownership and activation; ADR-0082 supplies durable transaction and explicit Core-only state.
- **Scope containment:** PHP/web adapter preparation, stack checks, dependencies, Template source evidence, optional capabilities, release profiles, and full prompt conversation remain later Epic tasks.
- **Placeholder scan:** No `TBD`, `TODO`, unspecified error handling, undefined neighboring interface, or caller-selected operational path remains.
- **Type consistency:** Journal phases, resume phases, repository/hook/seed evidence, attestation digests, and reserved commit fields are consistent across all tasks.
- **Dependency note:** No new dependency is introduced.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
