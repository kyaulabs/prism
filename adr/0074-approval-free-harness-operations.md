# 0074. Approval-Free Harness Operations

Date: 2026-08-19

## Status

Accepted

Selectively supersedes ADR-0063's OCR consent and connectivity-cadence clauses
while retaining its external-tool ownership, compatibility ranges, version
parsing, credential boundaries, and fail-closed readiness requirements.
Extends ADR-0056, ADR-0069, and ADR-0070. Supersedes the explicit per-commit
approval goal and two-phase transaction in
`docs/specs/2026-08-18-prism-tool-commit-wrapper-spec.md`.

## Context

Prism currently repeats approval after the user has already selected an
ordinary workflow. Signed commits are prepared, displayed, approved, and then
applied through a persistent plan. `/doctor` and every code review separately
ask for OCR connectivity and reviewed-code egress. Completed branches require
another manual sequence to synchronize, attest, check, review, and prepare a
pull request.

These pauses do not always represent a new decision. Commit creation already
has mandatory signing, hooks, commitlint, attribution, protected-branch
validation, and staged-state checks. The operator wants selecting an ordinary
commit workflow to be sufficient authorization for that exact commit attempt.
OCR connectivity and reviewed-code egress are intentionally accepted as a
global Prism capability rather than separately approved for every project and
review. Branch completion should have one explicit acceptance that authorizes
one bounded finalization attempt.

Failure at the commit-history boundary is different from an ordinary command
failure. A launcher may create a commit and then fail during verification, or
Git may fail because of readiness, hooks, signing, or repository state. The
active agent must not continue or retry automatically after any such result.

The decision crosses the launcher, global setup, installer, safety extension,
commit workflow, health check, code review, branch finishing, pull-request
preparation, documentation, and regression tests. It must preserve ADR-0055's
single-agent architecture, ADR-0056's sole-extension rule, ADR-0063's external
tool and credential boundaries, ADR-0064's attribution, ADR-0070's narrow
launcher operations, and the protected-branch and human-only publication
rules.

## Decision

We adopt approval-free launcher operations backed by explicit standing consent
and fail-closed extension state.

### 1. Global standing OCR consent

`/setup` is the sole workflow that asks whether to grant **standing OCR
consent**. Literal approval authorizes OCR connectivity testing and transmission
of reviewed code from every Prism project until revoked. This intentionally
combines the two OCR approvals previously required by ADR-0063; it does not
authorize registry access, consumer mutation, GitHub mutation, Git network
operations, or any other external effect.

Prism stores only a versioned boolean consent record in its managed global Pi
configuration area. The record contains no credential, provider, model,
repository, identity, code, or review output. The launcher requires a regular
non-symlink file owned by the current user with private permissions, validates
its parent and schema, and writes it through an atomic private replacement.
Tests use an injected path or isolated home.

Missing, malformed, unsupported, permissive, wrongly owned, symlinked, or
otherwise unsafe state fails closed before any OCR network access. An unsafe
existing record is never overwritten or removed automatically. `/setup`
reports the exact non-secret managed path and requires the human to remove or
repair it before retrying. Revocation removes only an ownership-proven valid
managed record and is idempotent when the record is absent.

The global installer performs local executable/version readiness only and
directs the user to `/setup`; it neither grants consent nor tests OCR
connectivity. Full `/doctor` and code review never ask for OCR approval. They
validate standing consent and then perform their required live connectivity
check. `/doctor --local-only` remains offline. Missing or unsafe consent makes
full doctor and OCR review NO-GO.

### 2. Narrow launcher operations

The existing `prism-tool` boundary owns these public operations:

- consent status, grant, and revocation;
- one atomic ordinary signed-commit creation operation; and
- a dedicated OCR code-review operation limited to the required review and
  scan forms.

The commit operation accepts only structured Conventional Commit fields. It
runs local readiness, validates repository and staged state, resolves the
ADR-0064 attribution, constructs and validates the canonical message, invokes
`git commit -S -F` with hooks enabled, verifies that `HEAD` advanced, prints the
exact message and commit ID, and cleans every owned temporary file. It replaces
commit prepare/apply/discard plans and has no approval flag.

Generic agent-facing OCR review or scan execution is removed. The dedicated
code-review operation validates standing consent, local versions, live OCR
connectivity, and an exact allowlisted review/scan grammar before invoking OCR
with bounded execution and sanitized diagnostics. OCR output remains untrusted
data.

These operations never push, amend, rebase, merge, tag, publish, bypass hooks,
install tools, authenticate providers, or read credential files.

### 3. Fatal commit-failure latch

The sole safety extension gains a **fatal commit-failure latch** separate from
the bounded-window denial circuit breaker.

Only a standalone supported `prism-tool commit create` invocation is eligible
to execute. The extension inspects the current assistant tool-call batch using
Pi's tool-call identity and synchronized assistant message. If the commit has a
sibling tool call, is wrapped in compound shell control flow, or cannot be
recognized unambiguously, the attempted commit fails closed before repository
mutation, sets the fatal latch, and aborts the active operation.

For an executed commit operation, every error result is fatal, including
invalid invocation, readiness, repository, staged-state, attribution,
commitlint, hook, signing, timeout, Git, and post-commit verification failure.
On failure the extension sets the latch, emits a redacted diagnostic, and calls
`ctx.abort()`. It blocks every subsequent tool call while latched.

`agent_end` does not clear the fatal latch. User-invoked `/reload`, `/new`, a
session switch, or process shutdown tears down the extension instance and
clears it. The agent cannot clear or retry the latch itself. After reload the
repository must be inspected before another commit attempt because a late
verification failure may follow successful commit creation.

The denial circuit breaker retains ADR-0068's threshold/window behavior and
ADR-0069's recovery semantics. Ordinary denied or failed Bash commands never
set the fatal commit latch, and the fatal latch does not feed the denial
window.

### 4. One-attempt automatic branch finalization

When implementation tasks and per-task verification are complete, the
finishing workflow performs ADR-0027 artifact cleanup and its commit, requires
a clean tree, reports branch completion, and pauses once for explicit
**finalization acceptance**.

The pause discloses that one acceptance authorizes one attempt which may fetch
the target branch and merge it into an already-published work branch. It also
authorizes attestation, full `/check`, all four code-review axes, and automatic
invocation of `/pr`. Standing OCR consent, not finalization acceptance,
authorizes OCR connectivity and code egress.

After acceptance the workflow proceeds in this order: determine the protected
target, synchronize without rebasing or force-pushing, record the exact branch,
head, base reference, and base SHA, run full `/check`, run every review axis,
resolve or explicitly waive eligible non-blocking findings, revalidate the
clean tree and attested SHAs, and invoke `/pr`.

A synchronization conflict, changed attestation, failed check, incomplete
unwaived axis, Blocking finding, or unresolved Suggested finding stops before
`/pr`. Repair or an eligible explicit waiver invalidates the attempt; the
workflow pauses again and requires fresh finalization acceptance.

`/pr` remains preparation-only. It displays validated artifacts and the
human-run GitHub command but never pushes the branch, creates the pull request,
or mutates GitHub. Humans remain solely responsible for publication and merge.

### 5. Existing boundaries remain

The safety extension remains Prism's only Pi extension. No orchestration
extension, background agent, custom permission layer, external dependency, or
credential store is introduced. The consent record is a narrowly owned global
configuration exception analogous to Prism's other explicitly approved global
setup surfaces; agents never access it directly.

Language-agnostic mechanics remain in Prism core. Adapters continue to own only
stack-specific checks, tools, conventions, and coverage gates.

## Consequences

- **Positive:** ordinary and release commits no longer pause after the commit
  workflow has been selected, while signing, hooks, commitlint, attribution,
  and protected-branch enforcement remain mandatory.
- **Positive:** a failed commit cannot be retried or followed by unrelated
  agent actions until the human reloads and repository state is inspected.
- **Positive:** OCR consent is established once, remains explicit and
  revocable, and is mechanically checked before every network use.
- **Positive:** generic OCR passthrough is replaced by a smaller reviewed-code
  egress surface.
- **Positive:** completed branches have one visible decision point followed by
  a deterministic, attested finalization sequence.
- **Negative:** standing OCR consent has broad future-project scope; reviewed
  diffs may leave any Prism project without a project-specific prompt until
  consent is revoked.
- **Negative:** commit failure becomes intentionally disruptive because the
  current agent operation ends and all tools remain blocked until reload.
- **Negative:** the safety extension must correlate exact Bash operations,
  assistant tool-call batches, and completion results without weakening its
  existing fail-closed classifier.
- **Negative:** an unsafe consent record requires human filesystem remediation
  rather than automatic repair.
- **Neutral:** OCR and Semgrep remain mandatory externally managed 1.x
  prerequisites under ADR-0063.
- **Neutral:** humans still push branches, create pull requests, merge, and
  administer external-tool credentials.

## Alternatives Considered

### Keep per-operation approval prompts

Rejected. The repeated commit and OCR prompts no longer represent distinct
operator decisions and create avoidable workflow interruption.

### Auto-approve the existing commit and OCR flags

Rejected. Fake approval flags preserve a misleading interface and allow generic
operations to impersonate consent. Dedicated operations make authorization and
mechanics explicit.

### Keep commit prepare/apply plans but remove the pause

Rejected. Without human review between phases, the persistent plan adds stale
state, cleanup, and replay complexity without preserving a useful decision
boundary.

### Let commit failures return normally

Rejected. Repository history is a critical mutation boundary, and late
verification failure can leave ambiguous state. Continuing or automatically
retrying is unsafe.

### Add a second extension for commit orchestration

Rejected by ADR-0056. The existing safety extension already observes tool-call
and completion boundaries and can carry a separate, narrowly defined latch.

### Store OCR consent per project

Rejected. The operator explicitly chose global Prism consent so `/doctor` and
code review behave consistently across projects.

### Automatically repair unsafe consent state

Rejected. Replacing or deleting a malformed or ownership-ambiguous global file
could destroy unrelated user data. Human remediation preserves the ownership
boundary.

### Push or create the pull request after finalization

Rejected. Protected-branch publication and GitHub mutation remain human-owned;
`/pr` prepares evidence and commands only.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
