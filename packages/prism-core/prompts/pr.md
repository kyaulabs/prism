---
description: Prepare or deliver a PR within existing authority, including its post-creation current-head Test Plan.
argument-hint: "[target or instructions]"
---

Handle the PR for $ARGUMENTS, or the current task branch. Inspect the actual
target, diff and publication state; preserve unrelated work. Follow Core and
project delivery roles, signing, templates, protections and authorization.

Reuse valid preparation evidence for unchanged code and perform missing checks
and the required `code-review`. Draft-only scope stays draft-only. For authorized
creation, use the supplied PR template with a concrete Test Plan and verify the
actual PR URL. After creating each PR, execute its Test Plan against the current
head and record actual results; pre-creation runs alone do not satisfy this step.
Refresh affected evidence after fixes and wait for required CI and review before
actual approval or merge. Never invent approval. Record actual approval as
`✔️ Approved by: @<reviewer>` only after it occurs.

Use safe arguments/body files and inspect ambiguous outcomes before retrying.
Merge and cleanup require existing authority. Delete only current-task branches
confirmed merged with no additional work, preserving protected/unrelated branches.
Report the real outcome, remaining blockers and URLs.
