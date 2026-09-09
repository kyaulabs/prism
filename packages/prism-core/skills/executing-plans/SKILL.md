---
name: executing-plans
description: Use when executing an approved multi-task implementation plan from docs/plans/. Defines uninterrupted inline task execution with the tdd skill, internal per-task review gates, automatic finalization handoff, halt/re-plan policy, and proactive context management across long plans.
derived-from: obra/superpowers (MIT, © Jesse Vincent)
---

# Executing Plans

Execute an approved implementation plan task by task, inline, with internal
review gates and clear halt thresholds. Plan approval authorizes uninterrupted
execution of every task; do not request routine review or approval between
tasks. This skill sits between `writing-plans` (which produces the plan) and
`tdd` (whose discipline governs each task). Load it only after the user has
approved the plan; the planning read-only boundary is instruction-only under
ADR-0055.

**Announce at start:** "I'm using the executing-plans skill to execute the
plan at `docs/plans/<filename>.md`."

## Agent capability contract

Before starting, confirm the agent can:

- edit every implementation path named by the plan and update plan checkboxes;
- run the task's tests, linters, and `verification-before-completion` commands;
- inspect task output and repository diffs; and
- stage changes and create signed commits through the atomic launcher operation.

If a required capability is unavailable, do not partially run this skill.
Surface the missing capability and halt.

## Issue provenance gate

Read the plan's immutable originating issue metadata before the first task. If
it is `#NN`, verify each non-terminal logical implementation commit uses `--refs NN`
and the terminal logical implementation commit uses `--fixes NN`.
Do not continue with missing, mismatched, zero, or duplicate closing recipes;
return the plan to `writing-plans`. Finalization cleanup commits do not repeat
the closing reference.

## Capture approved criteria before implementation

Before the first implementation task, run installed `prism-review doctor --json`.
Require an eligible installed Core and matching external adapter provider. Never
substitute checkout authority or install packages automatically.

Retain immutable Git commits and paths for the approved spec and plan. If the
approved plan is not committed, stage only that plan and create its ordinary
signed documentation commit through `conventional-commits` before proceeding.
Do not capture unapproved edits or reconstruct criteria from a later summary.

Record both sources through installed `prism-review criteria record`, supplying
separate `--source SPEC:COMMIT:PATH` and `--source PLAN:COMMIT:PATH` arguments.
Replace markers with validated literal full commits and repository-relative
paths. Retain the successful receipt digest for finalization before making any
implementation change. Existing conflicting or unsafe criteria state stops;
never use `criteria none` to bypass missing approved requirements.

Plan approval authorizes this local criteria capture, not installation or an
unlimited review loop. Carry the active task's attempt count into finalization:
two review attempts run automatically; each later attempt needs fresh approval. Finalization retains the receipt through artifact
cleanup and binds deterministic checks and review to it.

## Inline execution

The single agent executes every task directly, regardless of plan size:

- Read the plan, pick up the first unchecked task, and load the `tdd` skill.
- Before running a stack command, compare it with the active adapter; reject direct stack-tool execution or invented flags and return the plan to `writing-plans` instead of silently improvising a replacement.
- Implement the task inline using one Red → Green → Refactor cycle at a time.
- After each task, run `verification-before-completion` and the internal
  per-task review gate. When both pass, continue automatically to the next task.
- After each task (or logical group), load `conventional-commits` and use its
  single atomic `prism-tool commit create` operation with the structured fields
  from the plan task. The commit is the only tool call in its assistant batch.
- Do not ask the user to review, approve, or authorize continuation between
  tasks. Interrupt execution only when the halt/re-plan policy requires it.
- When no unchecked tasks remain, automatically load
  `finishing-a-development-branch`. Plan approval remains active as the initial
  finalization authorization; do not add another routine acceptance pause.

Implementation output stays in the current session, so context management is
part of execution, not an optional optimization.

## Internal per-task review gate

After each inline task completes, the executing agent runs a two-stage internal
review before moving to the next task. This is a quality gate, not a user
checkpoint:

### Stage 1 — Spec-compliance

Does the task output match what the plan specified?

- [ ] Files created/modified match the plan's "Files" list exactly.
- [ ] Interfaces match: the "Produces" signatures match what neighboring
      tasks expect in their "Consumes" blocks.
- [ ] Test names and locations match the plan.
- [ ] Structured commit fields match the plan task (or follow
      `conventional-commits` when the plan did not prescribe them).
- [ ] No scope creep — the task implemented only what was specified, not
      neighbouring tasks or speculative features.

If spec-compliance fails, note the discrepancy and decide: fix inline (if
minor, e.g. wrong file path) or re-plan the task with the user (if the plan's
assumptions were wrong).

### Stage 2 — Code-quality

Does the implementation follow harness and active-adapter conventions?

- [ ] Every new or modified source file follows the active adapter's header,
      modeline, documentation, naming, and indentation rules.
- [ ] No debug artifacts or `[DEBUG-...]` tags remain.
- [ ] No generated files were edited directly.
- [ ] Tests describe behavior through public interfaces, arrange/act/assert
      clearly, and contain no tautological assertions.

If code-quality fails, fix the issues inline (e.g. add missing RCS header)
and re-run `verification-before-completion` before proceeding. Do not
delegate these fixes — they are the parent's responsibility.

### After both stages pass

Run `verification-before-completion` on the task's output. Once all checks
pass, update the plan's checkbox status (`- [x]`) and create the task's atomic
commit. Start the next unchecked task automatically. When no unchecked tasks
remain, transition directly to `finishing-a-development-branch` under the
approved plan's finalization authorization. Do not pause for routine user
review or approval.

## Halt / re-plan policy

Stop and re-evaluate rather than pushing through when the plan is going
wrong:

| Trigger | Action |
|---|---|
| A task's tests won't go green after **3 attempts** | Halt that task. Re-plan it with the user — the plan's approach may be wrong. |
| **2 consecutive tasks** need re-planning | Halt the entire plan. The plan's assumptions are wrong. Re-plan with `writing-plans`. |
| A task's findings **invalidate the plan's assumptions** (architectural blocker, dependency conflict, discovered constraint) | Halt immediately. Load `architect` for review or re-plan with `writing-plans`. |
| The user changes requirements mid-plan | Halt. Load `brainstorming` to update the spec, then re-plan with `writing-plans`. |

**Never silently deviate from the plan.** If a task can't be done as written,
halt and surface the discrepancy — don't improvise.

## Context management across long plans

Continue through the approved plan in the current Pi session using native
compaction. Follow `packages/prism-core/docs/context-management.md`; session
length and fixed context percentages do not create a stop or approval gate.

Update the plan's checkbox status after each verified task. Preserve the active
task, interfaces, approval boundaries, latest test evidence, and next unchecked
step in existing workflow-owned artifacts. After compaction, reload the current
skill and task and verify repository state before relying on earlier evidence.

Actual halt/re-plan triggers and fatal tool-state recovery remain unchanged.

## Rules

- After each task completes, run both stages of the internal review gate BEFORE
  starting the next task.
- After plan approval, continue through every successful task and the initial
  finalization path without routine user prompts; only a defined halt or review
  reauthorization boundary may interrupt execution.
- When no unchecked tasks remain, automatically load
  `finishing-a-development-branch`; never ask for separate initial finalization
  acceptance.
- Commit after each task (or logical group) through the atomic process owned by
  `conventional-commits`; never duplicate direct Git mechanics.
- Update the plan's checkbox status after each task completes.
- Never continue past a halt trigger without user intervention.
- The agent handles code-quality fixes (missing required headers, debug
  artifact cleanup) inline; do not defer them to a later task.
- Plans are ephemeral — delete or archive plan/spec files after
  `finishing-a-development-branch`. They are development artifacts, not
  permanent documentation.

## Cross-refs

- `writing-plans` skill — the step before this one (produces the plan).
- `verification-before-completion` skill — run after each task is green.
- `tdd` skill — governs each inline task's Red → Green → Refactor cycles.
- `architect` skill — load before re-planning if a halt was architectural.
- `brainstorming` skill — update the spec and re-plan from scratch if
  requirements change.
- `conventional-commits` skill — validate commit messages.
- `rcs-header` skill — fix missing RCS headers during code-quality review.
- `finishing-a-development-branch` skill — automatically consumes the
  successful terminal handoff and plan-approved initial finalization.
- `packages/prism-core/docs/context-management.md` — native compaction and
  recovery.

## Gotchas

Known failure modes that compound over time. Add entries when this skill
causes a preventable mistake.

- *Stopping after the final task* — successful plan execution flows directly
  into `finishing-a-development-branch`; the plan's approval already authorizes
  initial finalization.
- *Treating the internal review gate as a user checkpoint* — plan approval
  already authorizes execution of every task. Run the review yourself and
  continue automatically unless a halt/re-plan trigger applies.
- *Skipping the per-task review gate* — the plan assumes each task's interfaces
  connect correctly. If task N produces `clearLayers()` but task N+1 consumes
  `clearFullLayers()`, the plan breaks silently. Review gate catches this.
- *Pushing through when a task is stuck* — three attempts without green is a
  signal the approach is wrong, not that you need a fourth attempt. Halt and
  re-plan.
- *Stopping because a session is long* — keep current plan state accurate and
  continue with Pi's native compaction; only a defined blocker or approval gate
  stops execution.
- *Code-quality fixes deferred to another worker* — header misses, debug
  artifacts, and convention violations are the executing agent's
  responsibility to catch and fix inline.
