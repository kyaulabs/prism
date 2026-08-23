# Automatic Plan Finalization

## Problem

Approved implementation plans currently stop after task execution. The user must separately authorize finalization before artifact cleanup, synchronization, `/check`, four-axis review, and `/pr` preparation, even though these are expected consequences of completing the approved plan.

## Design

Plan approval authorizes one continuous execution and finalization workflow:

1. Execute every plan task with internal per-task quality gates and atomic commits.
2. Delete and commit the matching completed plan/spec artifacts.
3. Synchronize the work branch by fetching the validated target branch and merging it when required.
4. Record exact branch, HEAD, base-ref, and base-SHA attestation.
5. Run `/check` until it passes. `/check` is local and may be rerun without additional approval. Plan-scoped failures may be repaired automatically; requirement changes, architectural blockers, invalid assumptions, or unavailable capabilities still halt.
6. Run one complete four-axis review after `/check` passes. Standing OCR consent remains the authority for review connectivity and code egress.
7. Revalidate the clean tree and attested SHAs.
8. Invoke `/pr` automatically when all gates pass. `/pr` remains preparation-only and never pushes or mutates GitHub.

Plan approval authorizes only the first four-axis review attempt. Advisory findings remain non-blocking. An incomplete review axis or unresolved Blocking finding stops the workflow. Any repair followed by another four-axis review requires fresh explicit approval. That approval covers one additional review attempt; `/check` may still rerun without limit.

## Authorization Semantics

- Plan approval authorizes task execution, matching artifact cleanup, cleanup commit creation, target synchronization, unlimited local `/check` executions, one four-axis review, attestation revalidation, and automatic `/pr` preparation.
- Plan approval does not replace standing OCR consent.
- Plan approval never authorizes pushing, creating a pull request, merging a protected branch, or opening a browser.
- Fresh approval is required only for an additional four-axis review attempt after the initial review is consumed.
- A synchronization conflict, changed requirement, architectural blocker, invalid plan assumption, or unavailable capability halts and requires the workflow appropriate to that condition.

## Changes

- Extend `executing-plans` so its successful terminal transition automatically loads `finishing-a-development-branch` without a user checkpoint.
- Change `finishing-a-development-branch` so approved-plan execution supplies the initial finalization authorization.
- Permit unlimited `/check` reruns and plan-scoped repairs within that authorization.
- Limit review authorization to one four-axis attempt and require fresh approval before each review rerun.
- Preserve automatic `/pr` preparation after successful revalidation.
- Update global pipeline and domain language to describe plan-approved automatic finalization.

## Acceptance Criteria

1. Completing the final approved task automatically enters branch finalization.
2. Matching plan/spec artifacts are cleaned up and committed without another approval prompt.
3. Target fetch and required synchronization occur under plan approval.
4. `/check` runs automatically and may rerun indefinitely without further approval.
5. Plan-scoped `/check` failures may be repaired automatically; existing hard halt conditions remain enforced.
6. Exactly one four-axis review attempt is authorized by plan approval.
7. A second or later four-axis review requires fresh explicit approval for that review attempt.
8. Successful review and SHA revalidation automatically invoke `/pr`.
9. No workflow pushes, creates a pull request, merges a protected branch, or treats plan approval as OCR consent.

## Verification

- Text checks prove there is no routine acceptance prompt between successful plan execution and initial finalization.
- Text checks prove `/check` reruns do not require fresh approval.
- Text checks prove review reruns require explicit approval.
- Harness validation passes.
- `/check` and the four-axis review pass for the completed branch.
