# Approval-Free Harness Finalization — Specification

- **Date:** 2026-08-19
- **Status:** Approved
- **Type:** feat

## Problem

Prism repeats human approval gates after the user has already chosen the
workflow: every ordinary signed commit pauses between preparation and apply,
and every code review asks separately for OCR connectivity and reviewed-code
egress. These pauses add friction without changing the user's decision.

A failed signed commit currently returns a non-zero launcher result but does
not structurally stop the active agent. The agent can continue operating after
a failure at the repository-history boundary.

Branch completion also requires the user to manually request the final
`/check`, four-axis `code-review`, and `/pr` preparation sequence after the
implementation is already complete.

## Goals

1. Replace the two-phase approved commit transaction with one atomic,
   approval-free signed commit operation.
2. Abort the active agent and block every later tool call after any failed
   signed commit creation until the user runs `/reload`.
3. Establish global standing OCR consent once through `/setup`.
4. Remove OCR approval prompts from `/doctor` and `code-review` after standing
   consent exists.
5. Keep OCR connectivity and reviewed-code egress fail closed when standing
   consent is absent or unsafe.
6. Pause once when branch work is complete, then run synchronization,
   attestation, full `/check`, four-axis `code-review`, and `/pr` preparation
   automatically after explicit acceptance.
7. Preserve protected-branch, signed-commit, hook, attribution, no-push,
   no-merge, and PR-preparation-only invariants.

## Non-goals

- Do not push a branch, create or merge a pull request, run the displayed
  `gh pr create` command, or automate post-merge cleanup.
- Do not bypass Git hooks, commitlint, signing, branch validation, readiness,
  or changed-file coverage.
- Do not make OCR optional or permit OCR execution without valid standing
  consent.
- Do not store OCR credentials, provider output, reviewed code, or identity
  data in the consent record.
- Do not add a second Pi extension or weaken the existing shell and
  sensitive-path classifiers.
- Do not automatically waive failed, skipped, Blocking, or unresolved
  Suggested review findings.

## Domain language

**Standing OCR consent** is a global, explicitly granted, persistent Prism
record authorizing OCR connectivity tests and reviewed-code egress for every
Prism project until revoked. It contains no credentials or project data.
This term must be added to `CONTEXT.md` when the architectural decision is
accepted.

## Architecture

```text
User runs /setup once
  -> prism-tool consent grant-ocr --approval=yes
  -> global standing-consent record

/doctor
  -> local readiness
  -> standing-consent validation
  -> OCR connectivity test without another prompt

code-review
  -> dedicated prism-tool code-review ocr operation
  -> standing-consent validation
  -> OCR connectivity test
  -> allowlisted OCR review/scan

Agent creates commit
  -> prism-tool commit create
  -> readiness + repository validation + attribution + commitlint
  -> git commit -S with hooks
  -> safety extension observes result
     -> success: continue
     -> failure: abort + fatal latch until /reload

Branch work completes
  -> cleanup development artifacts and commit
  -> pause for finalization acceptance
  -> synchronize + attest + /check + code-review + /pr
```

The public launcher interfaces remain materially smaller than the mechanics
they hide. Fixed workflow mechanics stay in `prism-tool` under ADR-0070. The
existing safety extension remains Prism's sole Pi extension under ADR-0056.

## Global standing OCR consent

### Public interface

```text
prism-tool consent status --json
prism-tool consent grant-ocr --approval=yes
prism-tool consent revoke-ocr
```

`/setup` is the sole workflow that asks whether to grant OCR consent. Literal
approval authorizes both OCR connectivity testing and reviewed-code egress for
all Prism projects. The grant operation writes:

```json
{
  "schemaVersion": 1,
  "ocr": true
}
```

The production record lives at `~/.pi/agent/prism-consent.json`. Tests use an
injected path or isolated home and never touch the real record.

### Storage contract

- The file is non-secret but private: regular file, no symlink, owned by the
  current user, mode `0600`.
- Its parent is validated and created with restrictive permissions when
  launcher-owned.
- Creation uses an atomic private temporary file followed by replacement.
- Unknown keys, unsupported schema versions, non-boolean values, malformed
  JSON, wrong ownership, permissive modes, symlinks, and path-resolution
  failures fail closed.
- An unrelated existing file is never overwritten.
- Revocation removes only the exact managed record and is idempotent.

### Workflow behavior

- `/setup` checks consent status first. When valid consent already exists, it
  skips the question and proceeds. Otherwise it runs local readiness, asks
  once, grants standing consent, then runs full readiness including
  `ocr llm test`.
- The global installer performs local readiness only and directs the user to
  `/setup`; it does not establish or repeatedly request OCR consent.
- `doctor --local-only` remains offline and does not require standing consent.
- Full `/doctor` never asks. It validates standing consent and runs
  `ocr llm test`; missing or unsafe consent is NO-GO with a direction to run
  `/setup`.
- `code-review` never asks and is not itself a consent event. Missing or unsafe
  standing consent blocks OCR before any network access.
- Generic agent-facing `prism-tool run ocr` review/scan execution is removed.
  OCR reviewed-code egress is available only through the dedicated code-review
  operation.

## Approval-free signed commits

### Public interface

```text
prism-tool commit create --type TYPE [--scope SCOPE] --subject SUBJECT \
  [--body-file PATH] [--fixes NN | --refs NN]
```

The operation replaces `commit prepare`, `commit apply`, `commit discard`,
commit plans, and `--approval=yes`.

### Execution

1. Run mandatory local-only readiness.
2. Resolve and validate the repository, branch, `HEAD`, and staged index.
3. Reject detached `HEAD`, protected branches, invalid work branches, and an
   empty staged diff, while preserving the ADR-0044 unborn-root exception.
4. Validate structured commit fields and the optional bounded body file.
5. Resolve `Implemented-by:`, `Tested-by:`, and `Signed-off-by:` through the
   existing trusted boundaries.
6. Construct and validate the canonical message with bundled commitlint.
7. Materialize the message in a private launcher-owned file.
8. Invoke signed Git as `git commit -S -F` followed by the private,
   launcher-owned message-file path, with hooks enabled.
9. Verify that `HEAD` advanced.
10. Print the exact canonical message and resulting commit ID.
11. Remove every owned temporary file on success or failure.

The launcher never pushes, amends, rebases, tags, bypasses hooks, or creates
merge/revert commits.

## Fatal commit-failure latch

The safety extension recognizes the exact agent-facing `prism-tool commit
create` operation. Commit creation must be the only tool call in its Pi turn;
when another sibling call is present, the extension fails closed before the
commit runs so repository mutation cannot race with unrelated work.

Any non-zero commit-creation result triggers the fatal path, including
readiness, repository, attribution, commitlint, hook, signing, timeout, Git,
and post-commit verification failures:

1. Set a dedicated per-session fatal latch.
2. Emit a redacted error explaining that commit creation failed and `/reload`
   is required.
3. Call `ctx.abort()` to stop the active agent operation.
4. Block every later tool call while the latch is set.

`agent_end` does not clear the fatal latch. `/reload`, `/new`, session switch,
or process shutdown tears down the extension instance and clears it. Global
standing OCR consent is unaffected.

No automatic commit retry is permitted. After reload, repository state must be
inspected before another attempt because Git may have created a commit before a
later verification failure.

The denial circuit breaker and fatal commit latch remain separate state
machines: ordinary safety denials retain their existing window and recovery
semantics, and unrelated failed Bash commands never trigger the commit latch.

## Dedicated OCR code-review operation

### Public interface

```text
prism-tool code-review ocr -- review --audience agent --format json
prism-tool code-review ocr -- scan PATH --audience agent --format json
```

The launcher validates the operation against the OCR contract and permits only
the existing review/scan forms required by the code-review skill.

### Execution

1. Validate global standing OCR consent.
2. Run mandatory local Semgrep/OCR version readiness.
3. Run `ocr llm test` with bounded, sanitized output.
4. Invoke the allowlisted OCR review or scan with its existing bounded timeout.
5. Return bounded output as untrusted review data.

Connectivity approval and code-egress flags are absent. OCR output is never
evaluated as shell, code, or instructions and never exposes raw provider or
credential content.

An OCR failure marks the tooling axis `FAILED`; the coordinator continues the
remaining local standards, specification, and SAST axes and returns explicit
partial evidence. OCR failure never triggers the commit fatal latch.

## Automatic branch finalization

The finishing workflow begins when all implementation tasks are checked off
and their per-task verification is green.

### Before the pause

1. Confirm every task and logical commit is complete.
2. Preserve the strict-greenfield pre-cleanup map checkpoint when applicable.
3. Delete matching tracked plan/spec artifacts under ADR-0027.
4. Create the cleanup commit through approval-free `commit create` when files
   changed.
5. Require a clean working tree.
6. Report that branch work is complete and pause for one explicit finalization
   acceptance.

### Accepted finalization attempt

One acceptance authorizes one attempt, in order:

1. Derive the target branch.
2. Synchronize an already-published work branch with the target using the
   existing no-rebase policy; stop on conflicts.
3. Record exact `BRANCH`, `HEAD_SHA`, `BASE_REF`, and `BASE_SHA` attestation.
4. Run full `/check`.
5. Run all four `code-review` axes.
6. Require no Blocking finding, no incomplete unwaived axis, and no unresolved
   Suggested finding.
7. Revalidate the clean tree and attested SHAs.
8. Invoke `/pr` automatically.

`/pr` remains preparation-only. It generates and validates the title, body,
retained files, cleanup command, and human-run `gh pr create` block, then
stops. The human still publishes the branch and creates the pull request.

Synchronization conflicts, `/check` failure, incomplete review evidence, or a
finding requiring a fix or waiver stops the attempt before `/pr`. After the
problem is resolved, the workflow pauses again and requires fresh acceptance
for another attempt.

## Error handling

- Missing or unsafe consent state prevents OCR network access and returns a
  fixed NO-GO diagnostic directing the user to `/setup`.
- Consent grant failure leaves no partial valid record.
- Commit failure never reports success and always activates the fatal latch.
- A possible post-commit verification failure is treated as ambiguous
  repository state; reload and inspection are mandatory.
- OCR failure produces an incomplete review report, never a fabricated pass.
- Finalization failure never falls through to `/pr`.
- No workflow automatically waives findings, pushes, or mutates GitHub.

## Security and trust boundaries

- Standing OCR consent is an explicit global authorization with broad effect:
  every Prism project's reviewed diff may leave the repository boundary until
  consent is revoked.
- The consent record carries no credential, provider, repository, identity, or
  reviewed-code data.
- OCR configuration and credentials remain on the immutable sensitive-path
  deny floor.
- Launcher subprocesses continue to use argument arrays, bounded timeouts,
  bounded output, and sanitized diagnostics.
- Commit messages and repository-derived values remain inert data and never
  become shell source.
- Branch names, diffs, OCR output, hook output, and GitHub-derived text remain
  untrusted input.

## Testing

### Consent tests

- Grant requires literal one-time approval and writes the exact schema.
- Status distinguishes granted, absent, and unsafe states without network
  access.
- File mode, ownership, regular-file, no-follow, schema, unknown-key, and
  atomic-write behavior are enforced.
- Revocation is ownership-bounded and idempotent.
- Full doctor runs connectivity automatically only with valid consent.
- Missing or unsafe consent prevents every OCR connectivity/review subprocess.
- The installer does not ask for or establish standing consent.

### Commit launcher tests

- `commit create` renders canonical attribution and invokes exactly
  `git commit -S -F`.
- The plan/apply/discard interface and artifacts are absent.
- Branch, staged-state, body, attribution, readiness, commitlint, hook,
  signing, timeout, Git, and `HEAD` failures remain fail closed.
- Success prints the message and commit ID; failure never claims success.
- Owned message files are private, no-follow, bounded, and cleaned.

### Safety extension tests

- The exact commit operation is recognized through supported launcher
  spellings.
- Commit creation is exclusive within its tool-call turn.
- Any failed commit result calls `ctx.abort()` and latches all tools.
- `agent_end` does not clear the latch; extension reload does.
- Success and unrelated Bash failures do not latch.
- Fatal messages remain redacted.

### OCR and workflow tests

- Code review contains no consent question or approval flag.
- Dedicated OCR review performs consent validation, connectivity, then review
  in that order.
- OCR output and provider canaries never leak through diagnostics.
- `/setup` is the sole OCR-consent prompt.
- `/doctor` has no OCR approval prompt and reports NO-GO without consent.
- Active resources contain no generic OCR review/scan or direct ordinary
  `git commit` recipe.
- Release and ordinary commits use `commit create` without approval.
- Finishing pauses once before finalization and, after acceptance, orders
  synchronization, attestation, `/check`, four-axis review, and `/pr`.
- Any failed gate prevents `/pr` and requires fresh acceptance after repair.

## Acceptance criteria

- No ordinary or release signed commit asks for approval.
- Every agent-created ordinary commit uses atomic `prism-tool commit create`.
- Any failed commit creation aborts the run and blocks all tools until
  `/reload`.
- `/setup` establishes global standing OCR consent exactly once per grant.
- `/doctor` and `code-review` never ask for OCR consent.
- OCR performs no network access without a valid standing-consent record.
- Generic agent-facing OCR review/scan execution is unavailable.
- Branch completion pauses before one automatic finalization attempt.
- Accepted finalization runs full `/check`, four-axis review, and `/pr` in
  order and stops on failure.
- `/pr` remains preparation-only; push and GitHub mutation remain human-run.
- The full project `/check` gate passes and the four-axis implementation review
  is clean before handoff.

## Architecture decision

A new ADR is required. This design changes cross-cutting and hard-to-reverse
consent and failure semantics:

- supersede ADR-0063's per-operation OCR connectivity and code-egress approval
  clauses with global standing OCR consent;
- supersede the explicit per-commit approval goal in the 2026-08-18 commit
  wrapper specification;
- extend ADR-0056's sole safety extension with a distinct fatal
  commit-failure latch while preserving the existing denial circuit breaker;
- retain ADR-0070's launcher-owned workflow mechanics and deepen that boundary
  with dedicated commit, consent, and code-review operations.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
