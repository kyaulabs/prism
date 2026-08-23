# 0081. Plan-Approved Automatic Finalization

Date: 2026-08-23

## Status

Accepted

Selectively supersedes ADR-0074's one-attempt branch-finalization acceptance
and restart clauses and ADR-0080's retained one-attempt acceptance clause.
Retains standing OCR consent, exact attestation, bounded diff-causal review
chains, fail-closed review evidence, preparation-only `/pr`, and human-owned
publication boundaries.

## Context

ADR-0074 removed repeated commit and OCR prompts but retained one explicit
finalization acceptance after implementation and artifact cleanup. ADR-0080
kept that acceptance while making repair reviews incremental and diff-causal.
The executing workflow therefore still stops after an already-approved plan,
asks again before synchronization and checking, and treats every failed local
check as consuming the finalization attempt.

These pauses do not represent equal authorization boundaries. `/check` is a
local, read-only quality gate and may need several executions while the agent
repairs plan-scoped defects. The initial four-axis review is different because
standing OCR consent may permit reviewed-code egress and the review creates
bounded acceptance evidence. Synchronization and preparation-only `/pr` are
expected branch-completion effects, while publication remains human-owned.

The operator wants plan approval to authorize the complete ordinary path from
implementation through pull-request preparation. Additional heuristic review
attempts remain a separate decision because they occur only after the initial
review failed, was incomplete, or produced a Blocking finding requiring a
repair.

## Decision

We adopt **plan-approved automatic finalization**.

### 1. Plan approval authorizes the ordinary completion path

Approval of an implementation plan authorizes one uninterrupted workflow that:

1. executes every approved task with TDD, internal review gates, verification,
   and atomic commits;
2. removes and commits the matching completed plan/spec artifacts;
3. fetches the validated protected target and merges it into the work branch
   when synchronization is required;
4. records exact branch, HEAD, base-ref, and base-SHA attestation;
5. runs `/check` until it passes;
6. runs one complete four-axis review;
7. revalidates the clean tree and attested identities; and
8. invokes preparation-only `/pr` automatically.

There is no routine acceptance pause between successful task execution and
initial finalization.

### 2. `/check` has unlimited local authorization

Plan approval authorizes unlimited `/check` executions during that workflow.
When `/check` finds a defect within the approved spec and plan, the agent may
repair it through the normal TDD and atomic-commit discipline and rerun
`/check` without further approval.

A requirement change, invalid plan assumption, architectural blocker,
unavailable capability, synchronization conflict, fatal commit failure, or
other existing hard halt condition still stops the workflow. Unlimited check
execution is not permission to improvise outside the approved design.

### 3. The initial four-axis review is authorized once

Plan approval authorizes exactly one initial four-axis review after `/check`
passes. Standing OCR consent, not plan approval, remains the authority for OCR
connectivity and reviewed-code egress.

Advisory findings remain visible and non-blocking under ADR-0080. An incomplete
axis or unresolved Blocking finding stops automatic finalization. Repairs may
use the normal approved-plan discipline when they remain in scope, and
`/check` may continue to rerun, but every additional four-axis review requires
fresh explicit approval. Each fresh approval authorizes one chain-selected
review attempt: a repair-delta review when the existing chain is valid, or a
new complete initial review when it is invalid.

### 4. `/pr` remains automatic and preparation-only

When synchronization, `/check`, the authorized review attempt, review-chain
validation, and SHA revalidation all pass, the workflow invokes `/pr`
automatically without another pause. `/pr` prepares validated artifacts and a
human-run command only.

Neither plan approval nor review-rerun approval authorizes pushing, creating a
pull request, merging a protected branch, opening a browser, changing GitHub,
or bypassing standing consent and safety policy.

## Consequences

**Positive:**

- One plan decision covers the complete expected engineering pipeline through
  pull-request preparation.
- Local checks can converge without artificial approval loops.
- The costlier heuristic review boundary remains explicit after the first
  attempt.
- Existing attestation, review-chain, protected-branch, and human-publication
  controls remain intact.

**Negative:**

- Plan approval now authorizes more effects and must clearly disclose artifact
  cleanup, signed cleanup commits, fetch/merge synchronization, initial review,
  and automatic `/pr` preparation.
- A long-running agent may perform several plan-scoped repairs and local checks
  without another conversational checkpoint.
- Finishing logic must distinguish unlimited check retries from single-use
  review authorization.

**Neutral:**

- Standing OCR consent remains independently required and revocable.
- Every additional review attempt remains explicit and bounded.
- The agent still never publishes branches or mutates GitHub.
- No new dependency, extension, background worker, or credential surface is
  introduced.

## Alternatives Considered

### Keep a separate finalization acceptance

Rejected. It repeats approval for the ordinary consequence of an approved
implementation plan and interrupts otherwise deterministic execution.

### Authorize only `/check` and review, then stop

Rejected. Successful checks and review already produce the evidence required
for preparation-only `/pr`; another pause adds no new decision.

### Allow unlimited four-axis review attempts

Rejected. Repeated external heuristic review is materially different from a
local deterministic check and can create unbounded cost and egress without a
fresh decision.

### Require approval for every `/check` rerun

Rejected. `/check` is local, deterministic, and read-only. Repeated approval
does not protect a distinct boundary.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
