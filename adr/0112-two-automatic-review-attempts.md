# 0112. Two automatic review attempts per active task

Date: 2026-09-08

## Status

Accepted

Partially supersedes the review-attempt approval clauses in ADR-0081,
ADR-0093, and ADR-0103; other clauses remain in force.

## Context

The installed Prism reviewer replaced the external review tool and its standing
consent. Current coordinator instructions still require separate approval for
every attempt after the first. The user wants reviews and one retry or repair
to proceed automatically, while stopping repeated review loops after two attempts.
Review still invokes the selected provider and can incur cost and transmit code;
removing prompts does not remove those effects.

## Decision

An active user-requested task or workflow includes two automatic review attempts,
including bounded provider cost and reviewed-code egress. Do not ask a separate
review permission question for either. Before the third and every later attempt,
obtain fresh explicit approval for exactly one attempt. Decline stops review.
There is no standing review-consent record and no unlimited retry approval.

The `code-review` coordinator owns the counting policy in
`packages/prism-core/docs/review-attempt-policy.md`. Count each launched review
before execution, including failure, interruption, timeout, Blocking, and
Inconclusive outcomes. All four axes and verifier work form one attempt.
Verified same-HEAD receipt reuse and deterministic local checks do not count.

The budget follows the active task across review modes, repairs, commits,
finalization, `/pr`, compaction, `/reload`, and resumption. None resets it.
Preserve the count and consumed approvals in existing continuation context or
workflow artifacts. Uncertain history requires approval rather than assuming
a new allowance. Only a genuinely separate user-requested task gets a new budget.

This remains instruction-owned workflow authorization, not a new executable
approval service. The engine runs no autonomous retry loop. Review receipts
remain evidence and must not be treated as an approval ledger.

Required installed authority, criteria, deterministic checks, four-axis coverage,
Blocking closure, and preparation-only publication boundaries are unchanged.
Standalone `/pr` still recovers only safely absent chains with exact prerequisites
and cannot repair code, run checks, select criteria, or migrate legacy state.
It shares the existing budget, including any eligible retry.

This decision partially supersedes ADR-0081, ADR-0093, and ADR-0103 only where
they grant one initial review and demand fresh approval for every subsequent
attempt. Their scope, evidence, repair-delta, readiness, and human-only publication
requirements remain in force. Explicit task-specific deferrals of live review,
such as the current cutover's pending installed-authority checkpoint, remain valid.

## Consequences

- Routine initial and first repair reviews no longer pause for permission.
- Two failed attempts cannot silently become an unlimited retry loop.
- Additional attempts remain bounded and visible to the human.
- Provider cost and code transmission are authorized by the active workflow,
  not by web consent or by an assumption that review is purely local.
- Continuation must preserve attempt history; losing it fails closed.
- Contract tests cover budget ownership, counting, continuation, and unchanged
  mandatory review gates. They verify coordinator instructions, not a new runtime
  enforcement mechanism.
