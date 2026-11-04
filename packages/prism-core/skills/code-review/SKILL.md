---
name: code-review
description: Use to review a diff or proposed specification, or evaluate incoming review feedback. Verify concrete defects, requirements and consequences.
---

# Review

Establish whether the request concerns code, a proposed specification or incoming
feedback. Determine the requested range and actual target branch. Inspect paths
before contents; include task-owned untracked files, relevant callers and tests
without absorbing unrelated changes.

For code, trace behavior against requirements: correctness, failure handling,
trust boundaries, compatibility and meaningful regression coverage. For a
specification, check observable acceptance criteria, internal consistency,
feasibility, exclusions and unresolved decisions against project evidence; code
need not exist. For incoming feedback, reconstruct the alleged trigger and test
its premise before accepting it. Disagree with unsupported feedback using
concrete evidence, not automatic compliance or defensive assertion.

Try to falsify suspected defects with caller tracing or a focused reproduction.
Report each actionable finding with location, trigger, consequence, severity and
a useful repair direction. Tie structural concerns to actual maintenance or
behavioral costs; token similarity and taste alone are not defects. Keep advisory
cleanup, uncertainty and pre-existing problems separate.

Review-only requests remain read-only. When fixes are within authorized
implementation scope, repair concrete task-related defects through `tdd`, verify
the affected behavior and re-review affected changes. Follow Core for review
cadence and evidence; do not require a full review per slice.

Report actual checks and limitations. If no actionable defects were found, say
so without claiming exhaustive correctness. Same-session review is not independent
review and cannot satisfy a project requirement for a different reviewer.
