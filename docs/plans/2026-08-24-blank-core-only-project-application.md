# Blank Core-only Project Application Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Apply an approved Blank Core-only candidate into a strict-empty project root, restore strict emptiness after every pre-durable decline or failure, and retain a deterministic resumable project after durable application.

**Architecture:** Add a versioned Core-owned bootstrap journal beside the active candidate plan and a separate transaction module that validates the launcher-owned plan, publishes candidate files with no-replace semantics, records exact applied inventory, and rolls back only bytes and directories proven to belong to the active attempt. Public `prism-tool setup project apply` and `setup project recover` operations expose the transaction without accepting caller-selected plan paths; Git, hooks, dependencies, quality, and seed creation remain Task #6.

**Tech Stack:** Node.js 22.19+ built-ins (`node:crypto`, `node:fs`, `node:path`), CommonJS, `node:test`, public `prism-tool` CLI integration tests.

## Global constraints

- Implement only Blank + Core-only project application and recovery; Template, adapter-backed projects, Git initialization, hooks, quality, attestation, and root-seed creation remain later Epic slices.
- Use no new dependency, Pi extension, safe directory, network access, subprocess, Git operation, credential access, or caller-selected project path.
- Keep transient state beneath the existing `.pi/prism-tool/bootstrap/<uuid>/` safe-cleanup surface.
- Accept only the active launcher-owned attempt ID and semantic plan digest; never accept a plan path from the caller.
- Require literal `--approval=yes` before durable project mutation. Adapter selection and setup-network authorization do not imply project-plan approval.
- Journal schema version `1` uses explicit `PREPARED`, `APPLYING`, and `DURABLE` phases. Later phases remain reserved for Task #6.
- Write the durable marker only after every approved output is published, synced, and revalidated against the plan.
- Before the durable marker, remove only exact attempt-owned files and identity-matched empty directories; any third state is preserved and reported as manual recovery.
- At and after the durable marker, retain the complete applied project and journal and return `REPOSITORY_BOOTSTRAP` as the single resume phase.
- Git must not exist before or during this slice. Any `.git` entry causes a fail-closed report without normalization or deletion.
- Exact canonical files are preserved without rewrite on a durable rerun; differing, unsafe, symlinked, or ownership-ambiguous state fails closed.
- Preserve established-project setup and every existing setup command unchanged.
- Every new or modified `.js` source retains the required RCS header and final vim modeline through the `rcs-header` workflow.

## Threat model

- **Asset:** integrity of the initially empty project root, approved candidate bytes, human-created concurrent files, and deterministic recovery evidence.
- **Trust boundary:** mutable filesystem state between plan approval, candidate validation, target publication, rollback, and rerun recovery.
- **Attacker control:** a local concurrent process may replace directories, insert symlinks, create target paths, mutate applied files, substitute attempt state, or race journal transitions.
- **Abuse cases:** path traversal, symlink escape, overwrite of human content, deletion of unowned content, stale-plan replay, partial application presented as durable, and concurrent double application.
- **Fail-closed behavior:** publish no replacement over an existing path, validate through held directories and exact digests, roll back only identity-matched owned state, preserve ambiguous state, and return one bounded recovery action without exposing paths outside the project root.

---

### Task 1: Journal prepared attempts and restore declined plans

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/bootstrap-journal.js`
- Create: `packages/prism-core/scripts/prism-tool/bootstrap-transaction.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-plan.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`

**Interfaces:**
- Consumes: validated `projectRoot`, `attemptId`, semantic `planDigest`, and the closed Blank Core-only plan.
- Produces: `createPreparedBootstrapJournal({projectRoot, attemptId, planDigest, plan})`.
- Produces: `readBootstrapJournal({projectRoot, attemptId})` and `transitionBootstrapJournal({projectRoot, attemptId, expectedPhase, next})`.
- Produces: `recoverBootstrapProject({projectRoot, coreRoot, attemptId, planDigest})` for a `PREPARED` attempt.
- Produces CLI: `prism-tool setup project recover --attempt=UUID --digest=SHA256 [--json]`.

- [x] **Step 1: Write the failing prepared-journal and decline-recovery tests**

Add this helper beside `validatePlan()`:

```javascript
function recoverProject(projectRoot, attemptId, planDigest, context = {}) {
    return captureWrites(() => main([
        'setup', 'project', 'recover', `--attempt=${attemptId}`,
        `--digest=${planDigest}`, '--json',
    ], {projectRoot, ...context}));
}
```

Extend the existing plan test with exact prepared-journal assertions:

```javascript
const attemptRoot = path.dirname(path.dirname(report.data.planPath));
const journalPath = path.join(attemptRoot, 'journal.json');
const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));

assert.equal(fs.statSync(journalPath).mode & 0o777, 0o600);
assert.deepEqual(journal, {
    schemaVersion: 1,
    attemptId: ATTEMPT_ID,
    projectRoot: fs.realpathSync(projectRoot),
    planDigest: report.planDigest,
    metadataDigest: report.metadataDigest,
    source: {mode: 'BLANK', evidence: null},
    adapter: null,
    phase: 'PREPARED',
    status: 'ACTIVE',
    reason: null,
    resumePhase: 'PROJECT_APPLICATION',
    applied: [],
    appliedInventoryDigest: null,
});
```

Add a decline/recovery behavior test:

```javascript
const result = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
    coreRoot: CORE_ROOT,
});
const report = JSON.parse(result.stdout);

assert.equal(result.status, 0);
assert.equal(result.stderr, '');
assert.equal(report.status, 'GO');
assert.equal(report.disposition, 'ROOT_RESTORED');
assert.equal(report.data.resumePhase, null);
assert.deepEqual(fs.readdirSync(projectRoot), []);
```

Add rejection cases for malformed attempt IDs, malformed digests, a substituted `journal.json`, mode other than `0600`, unknown journal fields, wrong project root, wrong plan digest, wrong source, non-null adapter, unsupported phase/status, and a root containing an unowned entry. The unowned-entry case must retain `.pi` and the human entry and return `RECOVERY_REQUIRED` rather than delete either.

- [x] **Step 2: Run the focused test to verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: FAIL because prepared journals and `setup project recover` do not exist.

- [x] **Step 3: Implement the closed journal and prepared-attempt recovery**

In `bootstrap-journal.js`, define the exact schema constants and exports:

```javascript
const JOURNAL_SCHEMA_VERSION = 1;
const PHASES = Object.freeze(new Set(['PREPARED', 'APPLYING', 'DURABLE']));
const STATUSES = Object.freeze(new Set(['ACTIVE', 'RECOVERY_REQUIRED']));
const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function preparedJournal({projectRoot, attemptId, planDigest, plan}) {
    return {
        schemaVersion: JOURNAL_SCHEMA_VERSION,
        attemptId,
        projectRoot,
        planDigest,
        metadataDigest: plan.metadataDigest,
        source: plan.source,
        adapter: null,
        phase: 'PREPARED',
        status: 'ACTIVE',
        reason: null,
        resumePhase: 'PROJECT_APPLICATION',
        applied: [],
        appliedInventoryDigest: null,
    };
}
```

`createPreparedBootstrapJournal()` must validate the exact keys above, require the canonical root, write `journal.json` with `flag: 'wx'` and mode `0600`, sync the file and containing attempt directory, then reopen with `O_NOFOLLOW` and verify identity, mode, and bytes.

`readBootstrapJournal()` must positively validate every field, collection bound, digest, phase/status combination, applied entry, and project-root relationship. Each applied entry has exactly:

```javascript
{
    path: 'README.md',
    kind: 'file',
    mode: 0o644,
    sha256: '64-lowercase-hex',
    dev: 123,
    ino: 456,
}
```

`transitionBootstrapJournal()` must read the current journal through `O_NOFOLLOW`, require `expectedPhase`, write a same-directory mode-`0600` temporary file, sync it, rename it over the held journal only after the original identity is revalidated, sync the directory, and return the validated next record. It must never accept a caller-provided journal path.

In `bootstrap-plan.js`, exclude only `plan/project.json`, `journal.json`, and `apply.lock` from `inventoryAttempt()`. After writing `plan/project.json`, create the prepared journal:

```javascript
createPreparedBootstrapJournal({
    projectRoot,
    attemptId: attempt.attemptId,
    planDigest,
    plan,
});
```

Then re-run `validateBootstrapProjectPlan()` before returning so planning never reports `PLAN_READY` with an invalid journal.

In `bootstrap-transaction.js`, implement prepared recovery by validating the plan and journal, requiring `PREPARED`, confirming the root contains only `.pi`, removing the exact attempt tree, pruning only identity-matched empty `bootstrap`, `prism-tool`, and `.pi` parents, and proving `fs.readdirSync(projectRoot)` is empty. If any unowned or ambiguous state exists, preserve it and transition the journal to:

```javascript
{
    ...journal,
    status: 'RECOVERY_REQUIRED',
    reason: 'ROOT_STATE_CHANGED',
    resumePhase: 'MANUAL_RECOVERY',
}
```

Wire the exact `setup project recover` grammar into `cli.js`. Return `ROOT_RESTORED` on clean prepared recovery and `RECOVERY_REQUIRED` with one next action on ambiguity. Diagnostics remain generic and must not include candidate contents.

- [x] **Step 4: Run the focused test to verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: PASS, including unchanged plan validation and byte-for-byte root restoration after recovery.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-journal.js packages/prism-core/scripts/prism-tool/bootstrap-transaction.js packages/prism-core/scripts/prism-tool/bootstrap-plan.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-plan.test.js
prism-tool commit create --type feat --scope setup --subject "journal prepared bootstrap projects" --refs 385
```

---

### Task 2: Apply approved candidate files and mark the project durable

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-journal.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-transaction.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`

**Interfaces:**
- Consumes: `validateBootstrapProjectPlan({projectRoot, coreRoot, attemptId, planDigest})`, a `PREPARED` journal, and literal approval.
- Produces: `applyBootstrapProject({projectRoot, coreRoot, attemptId, planDigest, approval, fault})`.
- Produces CLI: `prism-tool setup project apply --attempt=UUID --digest=SHA256 --approval=yes [--json]`.
- Produces durable report disposition `PROJECT_DURABLE` with resume phase `REPOSITORY_BOOTSTRAP`.

- [x] **Step 1: Write the failing durable-application tests**

Add this helper:

```javascript
function applyProject(projectRoot, attemptId, planDigest, context = {}) {
    return captureWrites(() => main([
        'setup', 'project', 'apply', `--attempt=${attemptId}`,
        `--digest=${planDigest}`, '--approval=yes', '--json',
    ], {projectRoot, ...context}));
}
```

Add a public happy-path test:

```javascript
const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
    coreRoot: CORE_ROOT,
});
const report = JSON.parse(result.stdout);
const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));

assert.equal(result.status, 0);
assert.equal(result.stderr, '');
assert.equal(report.status, 'GO');
assert.equal(report.disposition, 'PROJECT_DURABLE');
assert.equal(report.data.resumePhase, 'REPOSITORY_BOOTSTRAP');
assert.equal(fs.existsSync(path.join(projectRoot, '.git')), false);
assert.deepEqual(
    plan.outputs.map(({path: outputPath}) => outputPath).sort(),
    journal.applied.map(({path: outputPath}) => outputPath).sort()
);
assert.equal(journal.phase, 'DURABLE');
assert.equal(journal.status, 'ACTIVE');
assert.equal(journal.resumePhase, 'REPOSITORY_BOOTSTRAP');
assert.match(journal.appliedInventoryDigest, /^[0-9a-f]{64}$/);
```

For each planned output, assert the target is a regular non-symlink file with the exact mode and SHA-256 from the plan. Assert candidate files, provider reports, plan, and journal remain beneath the attempt and no operational file appears in `journal.applied`.

Add approval and boundary tests proving:

```javascript
assert.notEqual(main([
    'setup', 'project', 'apply', `--attempt=${ATTEMPT_ID}`,
    `--digest=${plan.planDigest}`, '--json',
], {projectRoot}), 0);
```

Also reject `--approval=no`, duplicate controls, caller `--plan=...`, existing `.git`, pre-existing target files, target symlinks, unsafe target parents, changed candidate bytes, changed plan bytes, and changed provider or metadata reports. Every rejection before publication must leave only the retained active attempt.

- [x] **Step 2: Run the focused test to verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: FAIL because `setup project apply` and durable publication do not exist.

- [x] **Step 3: Implement no-replace publication and durable journaling**

Implement an exclusive attempt lock at `<attemptRoot>/apply.lock` with `flag: 'wx'`, mode `0600`, bounded JSON containing only schema version and attempt ID. Never break or replace an existing lock automatically; report `RECOVERY_REQUIRED`.

Before writing a target, `applyBootstrapProject()` must:

1. Canonicalize and hold the project root directory with `O_DIRECTORY | O_NOFOLLOW`.
2. Reject any `.git` entry.
3. Validate the active plan, candidate, metadata, provider report, and prepared journal.
4. Revalidate that the root contains only the active `.pi` operational tree.
5. Transition the journal from `PREPARED` to `APPLYING` with an empty applied list.

Create target directories one path segment at a time. Each segment must be absent or an identity-stable real directory, never a symlink. Record every newly created directory as `{path, dev, ino}` for reverse cleanup.

Publish each file through a held parent directory using a same-directory temporary file and atomic no-replace link:

```javascript
fs.writeFileSync(tempPath, candidateContents, {flag: 'wx', mode: output.mode});
fs.chmodSync(tempPath, output.mode);
const descriptor = fs.openSync(tempPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
fs.fsyncSync(descriptor);
fs.closeSync(descriptor);
fs.linkSync(tempPath, targetPath);
fs.unlinkSync(tempPath);
```

After linking, reopen the target with `O_NOFOLLOW`, verify it is a regular file with the exact mode, byte length, and SHA-256 from the plan, record its `dev` and `ino`, and sync the held parent directory. Do not use `copyFileSync` over an existing path and do not use overwrite-capable rename for final publication.

After every file is published, revalidate every applied entry and compute:

```javascript
const appliedInventoryDigest = sha256(Buffer.from(JSON.stringify(
    applied.map(({path, kind, mode, sha256}) => ({path, kind, mode, sha256}))
), 'utf8'));
```

Transition the journal from `APPLYING` to `DURABLE` only after all target parents and the project root are synced:

```javascript
{
    ...journal,
    phase: 'DURABLE',
    status: 'ACTIVE',
    reason: null,
    resumePhase: 'REPOSITORY_BOOTSTRAP',
    applied,
    appliedInventoryDigest,
}
```

Return a closed `PROJECT_DURABLE` report containing the attempt ID, plan digest, applied-inventory digest, and resume phase. It must not expose candidate paths.

Wire the exact apply grammar into `cli.js`; only literal `--approval=yes` proceeds. Pass `context.bootstrapApplyFault` only to the internal function for deterministic test injection and never expose it as a CLI control.

- [x] **Step 4: Run the focused test to verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: PASS with the seven exact Core outputs durable, no `.git`, and a `DURABLE` journal.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-journal.js packages/prism-core/scripts/prism-tool/bootstrap-transaction.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-plan.test.js
prism-tool commit create --type feat --scope setup --subject "apply blank core-only projects" --refs 385
```

---

### Task 3: Roll back pre-durable failures and resume durable projects

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-journal.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-plan.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-transaction.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`

**Interfaces:**
- Consumes: the applied-entry identity records, created-directory identity records, fault seam, and current journal phase.
- Produces: exact reverse rollback for `APPLYING` attempts.
- Extends: `recoverBootstrapProject()` for `APPLYING`, `RECOVERY_REQUIRED`, and `DURABLE` attempts.
- Produces dispositions `ROOT_RESTORED`, `RECOVERY_REQUIRED`, and `PROJECT_DURABLE` with one deterministic next action.

- [x] **Step 1: Write failing failure-injection, ambiguity, and rerun tests**

Add table-driven failure injection after every publication boundary:

```javascript
for (let failAfter = 0; failAfter <= plan.outputs.length; failAfter += 1) {
    const result = applyProject(projectRoot, attemptId, plan.planDigest, {
        coreRoot: CORE_ROOT,
        bootstrapApplyFault(event) {
            if (event.name === 'after-output' && event.index === failAfter) {
                throw new Error('injected application failure');
            }
            if (event.name === 'before-durable' && failAfter === plan.outputs.length) {
                throw new Error('injected durable-marker failure');
            }
        },
    });
    const report = JSON.parse(result.stdout);
    assert.equal(report.disposition, 'ROOT_RESTORED');
    assert.deepEqual(fs.readdirSync(projectRoot), []);
}
```

Use a fresh root and attempt for every row. Add separate injections for temporary-file write failure, target-parent sync failure, journal transition failure, and cleanup-parent failure.

Add concurrent third-state tests:

```javascript
bootstrapApplyFault(event) {
    if (event.name === 'after-output' && event.index === 1) {
        fs.writeFileSync(path.join(projectRoot, 'human-note.txt'), 'preserve me\n');
        throw new Error('injected concurrent state');
    }
}
```

Assert owned unchanged outputs are removed, `human-note.txt` remains byte-for-byte unchanged, the attempt and journal remain, and the report is `RECOVERY_REQUIRED` with `MANUAL_RECOVERY`.

Add a modified-owned-output test that changes one published file before failure. Assert the changed file is preserved and no later cleanup claims `ROOT_RESTORED`.

Add durable recovery tests:

```javascript
const recovered = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
    coreRoot: CORE_ROOT,
});
const report = JSON.parse(recovered.stdout);
assert.equal(report.status, 'GO');
assert.equal(report.disposition, 'PROJECT_DURABLE');
assert.equal(report.data.resumePhase, 'REPOSITORY_BOOTSTRAP');
```

Assert a second apply of the same durable attempt is idempotent, performs no writes, preserves file mtimes and inodes, and returns the same applied-inventory digest. Assert changed, missing, replaced, symlinked, mode-drifted, or extra plan-owned outputs return `RECOVERY_REQUIRED`; unrelated post-durable files are retained but reported as unexpected state for Task #6 rather than deleted.

- [x] **Step 2: Run the focused test to verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: FAIL because application failures do not yet perform exact rollback and durable attempts cannot yet resume.

- [x] **Step 3: Implement exact rollback and durable recovery**

For every published file, retain `{path, kind, mode, sha256, dev, ino}` in memory and persist the current list in the `APPLYING` journal after each successful publication. The journal transition must occur before the next output begins so an interrupted process has a bounded recovery prefix.

Rollback files in reverse order. A target may be removed only when all conditions hold:

```javascript
stat.isFile() &&
!stat.isSymbolicLink() &&
stat.dev === applied.dev &&
stat.ino === applied.ino &&
(stat.mode & 0o777) === applied.mode &&
sha256(contents) === applied.sha256
```

Remove newly created directories in reverse depth order only when their `dev` and `ino` still match and they are empty. After owned target cleanup, remove the attempt and operational parents only if the root can be proven to contain exactly that owned operational tree. Finally require an empty root before returning `ROOT_RESTORED`.

If any identity, digest, mode, path kind, directory content, journal transition, or root-entry check is ambiguous, stop cleanup, preserve the remaining state, and persist when safely possible:

```javascript
{
    ...journal,
    status: 'RECOVERY_REQUIRED',
    reason: 'AMBIGUOUS_PROJECT_STATE',
    resumePhase: 'MANUAL_RECOVERY',
}
```

`recoverBootstrapProject()` behavior is phase-specific:

- `PREPARED`: remove the exact attempt and prove strict emptiness.
- `APPLYING`: validate and remove only the persisted applied prefix, then prove strict emptiness.
- `DURABLE`: revalidate the launcher-owned plan, every applied output, applied inventory digest, source, metadata, provider report, and absence of Git; return `PROJECT_DURABLE` and `REPOSITORY_BOOTSTRAP` without writing canonical files.
- `RECOVERY_REQUIRED`: perform no deletion unless every currently retained owned entry can be reproven; otherwise return the same bounded manual-recovery report.

A repeated `applyBootstrapProject()` call on a valid `DURABLE` journal delegates to durable recovery and returns idempotently without changing files. An existing or stale `apply.lock` is never broken automatically; retain state and report manual recovery.

Always remove a lock created by the current call in `finally` only after validating that its inode and contents still match the current attempt. Lock cleanup failure changes the final disposition to `RECOVERY_REQUIRED`.

- [x] **Step 4: Run focused and adjacent regression tests**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-setup-route.test.js tests/Node/prism-tool-bootstrap-adapter.test.js`

Expected: PASS. Every injected pre-durable failure restores emptiness unless the test deliberately introduces ambiguous third state; every durable rerun preserves exact project bytes.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-journal.js packages/prism-core/scripts/prism-tool/bootstrap-plan.js packages/prism-core/scripts/prism-tool/bootstrap-transaction.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-plan.test.js
prism-tool commit create --type feat --scope setup --subject "recover blank bootstrap transactions" --fixes 385
```

---

### Task 4: Package and regress the public transaction contract

**Files:**
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Modify: `packages/prism-core/README.md`

**Interfaces:**
- Consumes: packaged Core tarball and public `prism-tool setup project` operations.
- Produces: package inventory assertions for `bootstrap-journal.js` and `bootstrap-transaction.js`.
- Produces: bounded Core documentation for plan, apply, rollback, durable recovery, and the Task #6 handoff.

- [ ] **Step 1: Write failing package and public-contract assertions**

Extend the package module list:

```javascript
for (const module of [
    'bootstrap-adapter', 'bootstrap-composer', 'bootstrap-journal',
    'bootstrap-metadata', 'bootstrap-plan', 'bootstrap-providers',
    'bootstrap-transaction', 'cli', 'code-review', 'commit',
    'consent', 'contract', 'discovery', 'preflight', 'process',
    'review-chain', 'setup-entry', 'setup-route', 'supported-adapters',
    'template-source', 'template-source-http', 'template-source-validation',
]) {
    assert.equal(packed.files.has(`scripts/prism-tool/${module}.js`), true, module);
}
```

Add CLI grammar tests that reject unknown operations, positional plan paths, duplicate attempts/digests/approvals, missing approval, non-literal approval, malformed IDs, malformed digests, extra controls, and use outside strict-empty or retained active-attempt state.

Add a no-effects test that spies on `node:child_process` entry points and verifies plan, apply, and recover invoke no subprocess and create no `.git`, remote, credential, environment, hook activation, dependency, or network state.

Add an established-project regression that creates a non-empty project, invokes the new operations, and asserts the existing file is unchanged and no `.pi/prism-tool/bootstrap` state is created.

- [ ] **Step 2: Run focused packaging tests to verify Red**

Run: `node --test tests/Node/toolchain-packaging.test.js tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: FAIL until the new modules and public contract are present in the packed package and documentation.

- [ ] **Step 3: Complete packaging assertions and bounded documentation**

Update `packages/prism-core/README.md` with one concise strict-empty transaction section documenting only these public states:

```text
PLAN_READY -> PREPARED
--approval=yes -> APPLYING -> PROJECT_DURABLE
pre-durable failure/recover -> ROOT_RESTORED or RECOVERY_REQUIRED
post-durable recover -> PROJECT_DURABLE / REPOSITORY_BOOTSTRAP
```

State explicitly that project application creates no Git repository, runs no dependency or quality command, activates no hooks, makes no network request, and performs no publication; the next Epic slice owns repository bootstrap and the signed root seed.

- [ ] **Step 4: Run the complete verification set**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-setup-route.test.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/toolchain-packaging.test.js`

Expected: PASS.

Run: `npm run test:node`

Expected: PASS with no Node regression.

Run: `bash packages/prism-core/scripts/validate-harness.sh`

Expected: PASS with 0 errors.

Run: `git diff --check`

Expected: no output.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/README.md tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/toolchain-packaging.test.js
prism-tool commit create --type test --scope setup --subject "cover blank project application recovery" --refs 385
```

---

## Self-review

- **Spec coverage:** Tasks 1–3 cover the Task #5 acceptance criteria for active-plan application, Git absence, pre-durable restoration, ownership-proven cleanup, concurrent third-state preservation, durable inventory, post-durable retention, deterministic resume, stale-state rejection, unchanged canonical preservation, and no fallback. Task 4 covers packaging and established-project regression.
- **Scope containment:** Template source, adapter reports, optional capabilities, Git initialization, hooks, dependency population, quality, attestation, seed creation, and prompt orchestration remain explicitly deferred to Tasks #6–#12.
- **Placeholder scan:** No `TBD`, `TODO`, “implement later,” unspecified validation, or undefined neighboring interface remains.
- **Type consistency:** `attemptId`, `planDigest`, journal phases, applied-entry fields, dispositions, and resume phases are identical across tests, modules, CLI reports, and documentation.
- **Dependency note:** No new dependency is introduced.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
