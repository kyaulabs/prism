---
name: executing-plans
description: Use when executing a multi-task implementation plan from docs/plans/. Defines inline task execution with the tdd skill, two-stage per-task review gates, halt/re-plan policy, and proactive context management across long plans.
derived-from: obra/superpowers (MIT, © Jesse Vincent)
---

# Executing Plans

Execute an implementation plan task by task, inline, with structured review
gates and clear halt thresholds. This skill sits between `writing-plans`
(which produces the plan) and `tdd` (whose discipline governs each task).
Load it only after the user has approved the plan; the planning read-only
boundary is instruction-only under ADR-0055.

**Announce at start:** "I'm using the executing-plans skill to execute the
plan at `docs/plans/<filename>.md`."

## Agent capability contract

Before starting, confirm the agent can:

- edit every implementation path named by the plan and update plan checkboxes;
- run the task's tests, linters, and `verification-before-completion` commands;
- inspect task output and repository diffs; and
- stage changes and present signed commits for approval.

If a required capability is unavailable, do not partially run this skill.
Surface the missing capability and halt.

## Inline execution

The single agent executes every task directly, regardless of plan size:

- Read the plan, pick up the first unchecked task, and load the `tdd` skill.
- Implement the task inline using one Red → Green → Refactor cycle at a time.
- After each task, run `verification-before-completion` and checkpoint with
  the user (ask if they want to review before continuing).
- Commit after each task (or logical group) with the commit message from the
  plan task's step.

Implementation output stays in the current session, so context management is
part of execution, not an optional optimization.

## Per-task review gate

After each inline task completes, run a two-stage review before moving to the
next task:

### Stage 1 — Spec-compliance

Does the task output match what the plan specified?

- [ ] Files created/modified match the plan's "Files" list exactly.
- [ ] Interfaces match: the "Produces" signatures match what neighboring
      tasks expect in their "Consumes" blocks.
- [ ] Test names and locations match the plan.
- [ ] Commit message matches the plan task's prescribed message (or follows
      conventional-commits format if the plan didn't prescribe one).
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

Run `verification-before-completion` on the task's output. Only proceed to
the next task once all checks pass. Update the plan's checkbox status
(`- [x]`) for the completed task.

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

The same agent now carries planning, implementation, test output, and review
context. Manage it proactively rather than waiting for degradation:

- Check context usage after every **3 tasks** and against the thresholds in
  `packages/prism-core/docs/context-management.md`.
- At **30–40%**, prepare a focused compaction note and avoid loading unrelated
  files.
- At **40%**, compact with a hint:
  `/compact focus on executing plan <filename>, preserve open task and interfaces, drop completed tasks 1-N`.
- At **60%** or at the first sign of degraded reasoning, run `/handoff` and
  start a fresh session. Tell the new session:
  "Read `docs/handoffs/<filename>` and continue executing the plan."
- Update the plan's checkbox status (`- [x]`) after each task completes so a
  compacted or resumed session knows exactly where to pick up.

## Rules

- After each task completes, run both stages of the review gate BEFORE
  starting the next task.
- Commit after each task (or logical group) with the plan's prescribed
  commit message. Validate the message format before committing (see
  `conventional-commits` skill).
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
- `packages/prism-core/docs/context-management.md` — context thresholds and
  compaction.
- `/handoff` command — save state when context degrades.

## Gotchas

Known failure modes that compound over time. Add entries when this skill
causes a preventable mistake.

- *Skipping the per-task review gate* — the plan assumes each task's interfaces
  connect correctly. If task N produces `clearLayers()` but task N+1 consumes
  `clearFullLayers()`, the plan breaks silently. Review gate catches this.
- *Pushing through when a task is stuck* — three attempts without green is a
  signal the approach is wrong, not that you need a fourth attempt. Halt and
  re-plan.
- *Context exhaustion on long plans* — the single agent carries implementation
  output as well as reviews. Check every three tasks, compact proactively at
  40%, and use `/handoff` before degradation.
- *Code-quality fixes deferred to another worker* — header misses, debug
  artifacts, and convention violations are the executing agent's
  responsibility to catch and fix inline.
