# Plan File Review Specification

## Purpose

Make `docs/plans/` the sole full-plan review surface. Planning workflows must
stop printing a complete implementation plan in the conversation before saving
the same content to disk.

## Current behavior

The `writing-plans` skill instructs the agent to present the complete plan in
the conversation and save it only when the user asks. The `from-issue` skill
also requires the complete plan in its approval message. A plan that is then
saved under `docs/plans/` is rendered twice, increasing token use and creating
two review surfaces.

## Required behavior

### Canonical draft

The `writing-plans` skill must write each complete draft directly to
`docs/plans/YYYY-MM-DD-<topic>.md`. The file is the canonical review surface
from the first draft onward.

The existing plan format, task detail, TDD structure, issue provenance, and
self-review requirements remain unchanged. Self-review applies to the written
file.

### Conversation output

After writing and self-reviewing the draft, the agent must not reproduce the
plan body in the conversation. It reports:

- the exact plan path;
- that the draft is ready for review; and
- that the user may request additions or changes, or approve the plan to begin
  the next pipeline stage.

A task-title outline, code excerpt, or other partial restatement is not emitted
unless the user explicitly asks for one.

### Revisions and approval

Requested changes are applied directly to the same plan file. After each
revision, the agent reruns the applicable self-review and reports the path
without reproducing the plan.

The existing approval gate remains in force. Writing the draft does not
authorize implementation. Execution begins only after explicit user approval.

### Issue-driven flow

The `from-issue` approval step continues to present its concise issue summary
and assessment, but replaces the full-plan presentation with the exact plan
path and the standard review prompt. The user may request changes or reply
`go` to approve branch creation and inline execution.

## Scope

Modify:

- `packages/prism-core/skills/writing-plans/SKILL.md`
- `packages/prism-core/skills/from-issue/SKILL.md`

No implementation-plan schema, execution behavior, finalization authorization,
branch policy, or development-artifact cleanup behavior changes. No new domain
term or dependency is introduced.

## Error handling

If the plan cannot be written or self-review finds an unresolved contradiction,
placeholder, provenance error, or unsupported command, the workflow halts and
reports the failure. It must not ask for approval of an incomplete plan.

If requested revisions invalidate the approved specification or reveal
oversized scope, the existing return-to-design or Wayfinder rules apply.

## Verification

Verification must establish that:

1. `writing-plans` requires direct creation of the canonical file before the
   review prompt.
2. `writing-plans` forbids unsolicited reproduction of the complete plan or a
   partial outline in the conversation.
3. Revision instructions update and self-review the same file.
4. `from-issue` points to the file instead of presenting the full plan.
5. Both workflows preserve explicit approval before implementation.
6. No remaining maintained Prism instruction contradicts the save-first
   delivery rule.
7. The repository documentation and harness checks pass.

## Acceptance criteria

- A newly drafted plan exists under `docs/plans/` before the agent asks the
  user to review it.
- The review message contains the plan path and review choices but no duplicated
  plan content.
- User-requested edits are made in place and reported without restating the
  plan.
- Explicit approval remains the only transition from planning to branch
  creation or execution, according to the invoking workflow.
- Issue-driven planning follows the same file-first review behavior.
