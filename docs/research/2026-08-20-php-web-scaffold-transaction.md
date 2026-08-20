# PHP/web scaffold transaction contract

## Summary

Extend the PHP/web adapter's existing audited candidate transaction into one
adapter-owned scaffold transaction. The transaction prepares the complete
application-free scaffold under the ownership-marked
`.pi/prism-tool/work/` workspace, validates every existing destination before
mutation, presents one combined plan, and applies the approved desired state
with a durable rollback journal.

The adapter transaction owns manifests, locks, PHP/web scaffold directories,
canonical configuration, tests and fixtures, the shared quality surface, and
generated CI. It does not initialize Git, install canonical hooks, or mutate
`core.hooksPath`; those remain separate Prism Core operations whose ordering is
resolved by the end-to-end orchestration decision.

No new dependency or filesystem safe zone is required.

## Decision

### 1. One adapter plan and one mutation boundary

The existing `prism-tool setup resolve` / `apply` handler boundary remains the
public transaction seam. Resolution expands from four dependency files to the
whole adapter-owned scaffold inventory decided in
[the testing-ready scaffold contract](2026-08-20-testing-ready-scaffold.md),
including the generated workflow fixed by
[the CI parity contract](2026-08-20-testing-ready-generated-ci.md).

The flow is:

1. inspect the consumer project locally and validate all existing paths;
2. after registry approval, render the complete candidate tree in the owned
   workspace;
3. resolve and audit candidate Composer/npm graphs there with lifecycle scripts
   disabled;
4. return one combined manifest/lock diff and scaffold disposition report;
5. after one literal mutation approval, revalidate the plan and apply all
   adapter-owned files as one rollback unit;
6. mark the desired scaffold committed; then populate dependencies, install
   Chromium, audit, and verify; and
7. remove the owned workspace after success or a safely classified failure.

The mutation approval covers only the displayed adapter scaffold plan. It does
not authorize registry access, Git initialization, hooks, GitHub operations,
OCR activity, a push, or any later project change.

### 2. Canonical scaffold source

The adapter package should ship a versioned, machine-readable scaffold manifest
plus canonical template assets. Each entry declares only fixed data:

- repository-relative destination path;
- entry kind (`directory` or `file`);
- expected mode;
- template asset or deterministic renderer identifier; and
- compatibility policy.

All paths are normalized once as relative POSIX paths. Absolute paths, empty
segments, `.` or `..` segments, duplicate destinations, file/directory prefix
collisions, NUL bytes, paths escaping either the adapter asset root or canonical
consumer root, and unsupported manifest schema versions fail closed.

Templates use only an allowlisted typed substitution surface for values that
must vary per project, such as the normalized npm project name and exact
Pi/Core/adapter versions embedded in generated CI. Rendering occurs in Node.js,
not through shell evaluation. Every rendered file has deterministic UTF-8 bytes
and a known SHA-256 digest before consumer mutation.

The scaffold manifest is adapter-owned data; Prism Core continues to discover
and call only the generic validated adapter handler.

### 3. Existing-path compatibility matrix

Every destination is inspected with `lstat` and canonical containment checks.
No candidate command or consumer mutation begins when any parent or destination
is a symlink, escapes the project root, has the wrong kind, or cannot be read
safely.

| Existing destination | Compatibility result |
| --- | --- |
| Required directory absent | Plan creation. |
| Required directory is a real directory inside the project | Preserve it. |
| Required directory is a symlink or non-directory | Fail closed. |
| Canonical static file absent | Plan create-only installation. |
| Canonical static file has exactly the rendered bytes and required mode | Preserve it without rewriting, touching, or chmodding it. |
| Canonical static file differs in bytes or mode | Preserve it byte-for-byte and fail closed as incompatible. |
| Composer/npm manifest absent | Seed the minimal canonical manifest in the candidate workspace only. |
| Composer/npm manifest is a regular, bounded-size JSON object | Preserve unrelated keys; validate adapter-owned keys, then merge missing owned keys only in the candidate workspace. |
| Adapter-owned manifest key already has the canonical value | Preserve it. |
| Adapter-owned manifest key conflicts with the canonical type/value | Preserve the manifest and fail closed before registry access. |
| Lockfile absent | Generate it in the candidate workspace. |
| Lockfile present as a regular bounded-size JSON object | Treat it as package-manager output; regenerate the candidate lock from the compatible candidate manifest and display any approved replacement. |
| Any manifest/lock is a symlink, non-file, malformed, oversized, or changes after planning | Fail closed. |

Canonical static files include lint/test configuration, bootstrap and convention
tests, fixtures, shared scripts, the copied coverage helper, and generated CI.
Exact rendered equality is the initial automatic compatibility proof. Prism
must not patch, merge, rename, replace, chmod, or claim semantic compatibility
for a differing human-owned static file.

Manifests are the sole semantic merge surface. The adapter validates its owned
fields before package-manager execution so `composer require` or `npm install`
never silently replaces a conflicting script, runtime constraint, dependency
pin, or configuration value. Project metadata and unrelated dependencies remain
byte-for-byte represented in the candidate result. Locks may change after
approval because they are deterministic output of the approved merged
manifests.

### 4. Candidate plan contract

The candidate workspace retains its restrictive ownership marker and gains a
versioned scaffold plan and mutation journal. The plan records:

- canonical adapter and project identity;
- scaffold schema/generator version;
- every destination's kind, required mode, original state and digest, candidate
  digest, and disposition (`create`, `replace`, or `preserve`);
- the exact set of directories that may be created;
- zero-advisory totals and Chromium-only browser target;
- the exact generation-time package versions used by CI; and
- a digest covering the complete plan.

The plan path remains the exact launcher-returned path under
`.pi/prism-tool/work/`; callers cannot supply another workspace. The plan and
candidate files are bounded, regular, non-symlink files. Apply verifies exact
keys, schema, path containment, ownership marker, plan digest, candidate
content digests, expected modes, and current consumer state before the first
write.

The report shown before approval distinguishes:

- files/directories that will be created;
- exact canonical files that will be preserved;
- compatible manifest/lock changes;
- dependency install and Chromium operations; and
- any incompatibility that makes the plan NO-GO.

A NO-GO plan never offers mutation approval.

### 5. Apply and rollback boundary

A filesystem cannot make a multi-file tree globally atomic, so the adapter uses
a journaled apply with atomic per-file publication and deterministic rollback.
The mutation journal is written and fsynced before consumer mutation and moves
through these states:

```text
prepared -> applying -> committed -> post-apply -> complete
```

During `applying` the adapter:

1. takes an adapter transaction lock inside the owned workspace;
2. revalidates every original digest and path kind to reject a stale plan;
3. copies every replaceable original manifest/lock into restrictive workspace
   backups and fsyncs them;
4. records every directory and file operation in the journal before executing
   it;
5. creates only absent directories, remembering exactly which ones it owns;
6. publishes create-only files without clobbering an existing destination;
7. replaces approved manifests/locks using same-directory temporary files,
   fsync, mode application, and atomic rename; and
8. fsyncs affected parent directories before recording `committed`.

If any validation, create, write, chmod, fsync, or rename fails before the
`committed` record is durable, rollback restores all replaceable originals,
removes only files created by this transaction, and removes only transaction-
created directories that are still empty, in reverse depth order. Pre-existing
directories and canonical files are never removed or rewritten.

Rollback itself is fail closed. Before restoring or deleting a path, recovery
requires it to be either the recorded original state or the recorded candidate
state. If a path has a third digest/kind, Prism assumes concurrent human change,
preserves both the consumer tree and workspace evidence, reports the exact
conflicting paths, and stops for manual recovery rather than destroying data.

### 6. Interrupted-run recovery

The current blanket deletion of any owned interrupted workspace is insufficient
once scaffold application can span many paths. Recovery must inspect the
journal state:

| Durable state | Automatic recovery |
| --- | --- |
| no journal / `prepared` | Consumer mutation never began; remove the owned workspace. |
| `applying` | Reconcile each recorded target and roll back only known candidate states to their recorded originals; remove owned empty directories; then remove the workspace. |
| `committed` / `post-apply` | The desired scaffold is authoritative; never roll it back. Resume or report the deterministic post-apply operation, then clean the workspace when safe. |
| malformed journal, ownership mismatch, or unknown consumer state | Preserve workspace and consumer files; fail closed with manual-recovery paths. |

The journal and backups remain until the durable `committed` marker exists.
A crash after all files were written but before that marker therefore rolls the
adapter tree back; a crash after the marker keeps the complete desired tree.
This gives the transaction one explicit commit point without pretending the
filesystem provides a cross-file atomic rename.

### 7. Post-commit dependency failures

After `committed`, the adapter runs the existing deterministic population and
verification sequence:

1. Composer install from the committed lock with scripts disabled;
2. npm clean install from the committed lock with scripts disabled;
3. Playwright Chromium installation only;
4. post-install Composer/npm audits; and
5. exact executable/lock verification plus scaffold integrity verification.

Failure in this phase does not roll back manifests, locks, or scaffold files.
They are the audited desired state, matching the existing Candidate Transaction
invariant in `CONTEXT.md`; attempting to roll them back while `vendor/`,
`node_modules/`, or browser assets are partially populated would be riskier.
The result is NO-GO with a sanitized machine-readable failed phase and a fixed
deterministic retry surface. The end-to-end orchestration decision owns the
exact user-facing retry sequence.

Setup never recursively deletes partially populated `vendor/`, `node_modules`,
or browser caches as part of rollback. Existing safe-directory declarations
remain unchanged.

### 8. Core/adapter boundary

This transaction deliberately stops at the PHP/web adapter boundary:

- it does not create `.git`, select `develop`, or configure Git;
- it does not create or replace canonical Prism Core hooks;
- it does not remove a core-created repository when adapter setup fails; and
- core setup does not delete adapter-created files.

The core Git-init, core-hook, and adapter-scaffold operations must each be
idempotent and independently report GO/NO-GO. Their ordering, combined status,
and final end-to-end retry contract remain for the orchestration decision after
the dedicated Git-init and hook decisions are resolved.

## Threat model

- **Asset:** integrity of human-owned consumer files and the guarantee that
  setup never claims readiness for a partial or incompatible scaffold.
- **Trust boundaries:** existing project paths/content, adapter package assets,
  candidate package-manager output, subprocess status, and an interrupted or
  concurrently changed workspace.
- **Abuse/failure cases:** path traversal, symlink escape, plan substitution,
  stale-plan overwrite, clobbering customized configuration, partial multi-file
  publication, unsafe interrupted-run cleanup, untrusted subprocess output, and
  rollback deleting later human work.
- **Fail-closed behavior:** no mutation before full validation and literal
  approval; rollback only known transaction states; preserve evidence and stop
  when ownership, state, or compatibility cannot be proven.

## Acceptance criteria

Tests at the public `prism-tool setup` seam must prove:

1. a project with no manifests receives the minimal canonical manifests,
   audited locks, and every adapter-owned scaffold item only after approval;
2. inspect and candidate resolution leave the consumer tree byte-identical;
3. every existing exact canonical static file is preserved without a write,
   timestamp change, or mode change;
4. a differing static file, wrong file mode, wrong path kind, symlinked parent,
   path escape, duplicate manifest entry, or unsupported scaffold schema makes
   setup NO-GO before registry access or mutation;
5. compatible existing manifests retain unrelated metadata/dependencies while
   missing adapter-owned keys are added only in the candidate;
6. conflicting adapter-owned manifest keys fail closed without package-manager
   execution or consumer mutation;
7. missing locks are generated and existing locks change only through the
   approved combined diff;
8. candidate advisories, malformed audit output, dependency conflicts, and
   candidate renderer failures clean the pre-apply workspace and leave every
   consumer path unchanged;
9. apply rejects a stale original digest or substituted plan/candidate before
   the first write;
10. injected failure at every create, chmod, fsync, and rename point before the
    durable commit marker restores all original files, removes every
    transaction-created file, and removes only empty transaction-created
    directories;
11. interrupted `applying` recovery handles targets in original and candidate
    states, while a third state preserves the workspace and fails closed;
12. interrupted `committed` recovery never rolls back the desired scaffold;
13. post-commit Composer, npm, Chromium, audit, or integrity failure retains the
    complete desired scaffold and reports only sanitized phase/retry data;
14. rerunning setup against the complete canonical scaffold is idempotent and
    produces no consumer file writes;
15. workspace cleanup still requires the exact project/adapter ownership marker
    and remains confined to `.pi/prism-tool/work/`; and
16. the adapter transaction never touches `.git`, core hooks, application code,
    database artifacts, production pages, or deployment configuration.

## Consequences

- **Positive:** new projects can receive the entire testing-ready PHP/web
  surface through one reviewed and approved desired-state change.
- **Positive:** human-owned static files are never patched or overwritten; exact
  equality is simple, testable, and fail closed.
- **Positive:** missing manifests can now enter the existing audited dependency
  transaction without first mutating the consumer project.
- **Positive:** durable recovery distinguishes safe pre-commit rollback from
  post-commit retry instead of deleting an interrupted workspace blindly.
- **Negative:** customized existing config, tests, shared scripts, or CI block
  automatic setup until a human reconciles them with the canonical scaffold.
- **Negative:** journaling, fsync, rollback, and interrupted-state tests add
  substantial adapter complexity because cross-file atomicity is unavailable.
- **Neutral:** this extends ADR-0061/ADR-0063's accepted candidate-transaction
  boundary rather than introducing a new ownership or consent model, so no new
  ADR is required unless implementation changes that boundary.

## Alternatives rejected

### Create files incrementally during `/setup`

Rejected because a late incompatibility or write failure would leave a partial
quality surface with no reliable recovery record.

### Overwrite or merge differing canonical static files

Rejected because Prism cannot prove arbitrary PHP, JavaScript, JSON, XML, shell,
or GitHub Actions customizations preserve the canonical test and CI contract.

### Roll back everything after dependency-install failure

Rejected because valid audited manifests, locks, and scaffold files are already
the desired state, while package directories and browser assets may be
partially populated. This contradicts the established Candidate Transaction
invariant and risks making recovery less deterministic.

### Treat any owned workspace as disposable after interruption

Rejected because an interrupted workspace may contain the only backups and
journal evidence needed to recover a partially applied consumer tree.

### Combine Git initialization, core hooks, and adapter files into one owner

Rejected because it would make Prism Core understand PHP/web inventory or let
the adapter mutate core Git policy, violating the core/adapter package split.

## Sources

1. `CONTEXT.md` — Candidate Transaction and core/adapter ownership invariants.
2. `packages/prism-php-web/scripts/toolchain/transaction.js` — current
   four-file candidate resolution, atomic replacement, post-apply retention,
   and fixed retry behavior.
3. `packages/prism-php-web/scripts/toolchain/workspace.js` — ownership marker,
   restrictive workspace, backups, per-file atomic writes, and current
   interrupted-workspace cleanup.
4. `tests/Node/prism-tool-resolve.test.js` and
   `tests/Node/prism-tool-apply.test.js` — existing public seams for isolation,
   stale plans, rollback, advisory blocking, and post-apply retention.
5. `adr/0061-scope-owned-toolchain-contract.md` and
   `adr/0063-bounded-external-tool-compatibility.md` — accepted candidate
   transaction, consent, audit, cleanup, and post-apply invariants.
6. `adr/0070-launcher-owned-workflow-mechanics.md` — narrow launcher ownership
   for deterministic multi-step mechanics.
7. `docs/research/2026-08-20-testing-ready-scaffold.md` — exact adapter-owned
   desired inventory and manifest baseline.
8. `docs/research/2026-08-20-testing-ready-generated-ci.md` — create-only exact
   canonical CI validation and shared-gate contract.
