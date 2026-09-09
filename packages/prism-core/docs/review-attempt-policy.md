# Review attempt policy

## Two automatic attempts

An active user-requested task or workflow includes up to two automatic review
attempts, including provider cost and transmission of the selected review input.
Do not ask separate review permission for attempt one or two. The third and
every later attempt require fresh explicit approval for one additional attempt.
Approval never enables an unbounded retry loop. Decline stops review and leaves
incomplete or Blocking evidence blocking PR preparation.

A review request does not authorize unrelated work. Existing scope approval,
package installation, synchronization, model configuration, and human-only
publication boundaries remain unchanged. Standing web consent neither enables
nor disables review. There is no new global review-consent record.

## Count before launching

The `code-review` coordinator owns a shared `reviewAttempts` count for the active
task, initially zero only when the task has genuinely had no review attempts.
Record the next attempt number before launching a review command. A launched
review counts even if it fails readiness, returns Blocking or Inconclusive,
times out, is interrupted, or produces no receipt. A four-axis review is one
attempt, not four; verifier sessions belong to that same attempt.

| Evidence before the next operation | Action |
| --- | --- |
| No attempts used | Run attempt one without a review permission prompt |
| One attempt used, including a failure | Run attempt two without a review permission prompt when prerequisites pass |
| Two or more attempts used | Ask before the next attempt; approval permits only that attempt |
| Exact same-HEAD valid receipt already available | Reuse it without inference or consuming an attempt |
| Doctor, deterministic checks, receipt inspection, or verification only | Do not increment the count |
| Attempt history is missing or uncertain | Stop and ask before inference; never assume a fresh budget |

Before retrying, address the reported cause when repair is within the active
scope and revalidate required evidence. Never retry unsafe state, missing trust
roots, or hard blockers blindly. Reaching the limit does not waive a gate.

## Preserve the count across continuation

Keep attempt number, outcome, attested identity, and any approval for the next
attempt in the existing workflow plan or continuation context. No source bytes,
credentials, or provider transcripts belong in this record. Consume an approval
when its one attempt starts; do not reuse it after failure or interruption.

Switching between `code-review`, finalization, and `/pr` does not reset the count.
Neither do fixes, new commits, changed HEAD or base, a replacement initial review,
compaction, `/reload`, resuming the task, or repeating a command. A new budget
belongs only to a genuinely separate user-requested task after the prior task
has ended; the agent must not relabel retries as new tasks.

This is coordinator workflow policy, like the prior one-attempt approval rule.
The review executable does not infer human consent, initiate retry loops, or
provide a persistent authorization service. Receipts remain review evidence,
not an approval ledger. Uncertain continuation history requires a human decision.

## Required review and PR recovery

The installed trust root, immutable criteria, exact deterministic PASS receipt,
four complete axes, clean attestation, and no open Blocking findings remain
mandatory. Advisory findings require disclosure, not a waiver.

Standalone `/pr` can recover only an absent chain with matching criteria,
checks, and synchronization evidence. It uses the same remaining attempt budget,
not a fresh one. It may retry an unsuccessful initial attempt only if state is
still safely absent and all prerequisites remain exact. It never repairs code,
chooses criteria, runs checks, migrates legacy state, or publishes anything.
Blocking or unsafe state returns to the existing repair workflow.

ADR-0112 supersedes earlier per-review approval wording; other authority and
publication requirements remain in force.
