---
name: executing-plans
description: Use when executing a multi-task implementation plan from docs/plans/. Defines two execution modes (inline batch-with-checkpoints, @tdd-dispatch with two-stage review), per-task review gates, halt/re-plan policy, and context management across long plans.
---

# Executing Plans

Execute an implementation plan task by task, with structured review gates and
clear halt thresholds. This skill sits between `writing-plans` (which produces
the plan) and `@tdd` (which implements each task).

**Announce at start:** "I'm using the executing-plans skill to execute the
plan at `docs/plans/<filename>.md`."

## Choose an execution mode

### Inline mode — parent executes tasks directly

Use for small plans (≤5 tasks) or when the parent already has full context.

- The parent reads the plan, picks up task 1, and implements it directly
  (Red → Green → Refactor cycle, same as `@tdd` but in-session).
- After each task: run `verification-before-completion`, checkpoint with the
  user (ask if they want to review before continuing).
- Commit after each task (or logical group) with the commit message from the
  plan task's step.

### @tdd-dispatch mode — parent dispatches @tdd per task

Use for larger plans or when context budget matters (each @tdd dispatch is a
fresh subagent context — the parent's context grows only with reviews, not
implementation details).

- Dispatch `@tdd` with the full task text from the plan as the prompt.
- The subagent implements the task, returns its output (including test results
  and commit hash).
- The parent reviews the output (see "Per-task review gate" below).
- Only proceed to the next task after the review gate passes.

## Per-task review gate

After each task completes (whether inline or via `@tdd`), run a two-stage
review before moving to the next task:

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

Does the implementation follow harness conventions?

- [ ] Every new or modified source file has an RCS header and vim modeline
      (see `rcs-header` skill).
- [ ] PHP classes/methods/functions have PHPDoc (PSR-5).
- [ ] No debug artifacts (`dd()`, `dump()`, `var_dump()`, `print_r()`,
      `console.log()`, `[DEBUG-...]` tags).
- [ ] No generated files edited directly (`cdn/css/*.min.css`,
      `cdn/javascript/*.min.js`).
- [ ] Tests use Pest conventions: `describe()` / `it()` with behavior
      descriptions, Arrange/Act/Assert, no tautological tests.

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
| A task's findings **invalidate the plan's assumptions** (architectural blocker, dependency conflict, discovered constraint) | Halt immediately. Suggest `@architect` review or re-plan with `writing-plans`. |
| The user changes requirements mid-plan | Halt. Update the spec (see `brainstorming` skill), then re-plan with `writing-plans`. |

**Never silently deviate from the plan.** If a task can't be done as written,
halt and surface the discrepancy — don't improvise.

## Context management across long plans

Long plans (10+ tasks) will exhaust context. Manage it proactively:

- After every **5 tasks**, check context usage against the thresholds in
  `.opencode/docs/context-management.md`.
- When context exceeds **40%**, compact with a hint:
  `/compact focus on executing plan <filename>, drop completed tasks 1-N`.
- When context exceeds **60%** or the session shows degradation, run
  `/handoff` and start a fresh session. Tell the new session:
  "Read `docs/handoffs/<filename>` and continue executing the plan."
- In @tdd-dispatch mode, each dispatch is a fresh subagent context — the
  parent's context grows only with reviews and orchestration decisions, not
  implementation details. This naturally extends the parent's range.
- Update the plan's checkbox status (`- [x]`) after each task completes so
  a resumed session knows exactly where to pick up.

## Rules

- After each task completes, run both stages of the review gate BEFORE
  dispatching the next task.
- Commit after each task (or logical group) with the plan's prescribed
  commit message. Validate the message format before committing (see
  `conventional-commits` skill).
- Update the plan's checkbox status after each task completes.
- Never continue past a halt trigger without user intervention.
- The parent handles code-quality fixes (missing RCS headers, debug artifact
  cleanup) — don't bounce those back to @tdd.

## Cross-refs

- `writing-plans` skill — the step before this one (produces the plan).
- `verification-before-completion` skill — run after each task is green.
- `@tdd` agent — executes each task in Red → Green → Refactor cycles.
- `@architect` agent — insert before re-planning if a halt was architectural.
- `brainstorming` skill — re-plan from scratch if requirements change.
- `conventional-commits` skill — validate commit messages.
- `rcs-header` skill — fix missing RCS headers during code-quality review.
- `.opencode/docs/context-management.md` — context thresholds and compaction.
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
- *Context exhaustion on long plans* — the parent can hold ~15 task reviews
  before context degrades. Compact proactively or use @tdd-dispatch mode to
  keep the parent context lean.
- *Code-quality fixes delegated to @tdd* — RCS header misses, debug artifacts,
  and convention violations are the parent's responsibility to catch and fix.
  Don't bounce a completed task back to the subagent for a style fix.
