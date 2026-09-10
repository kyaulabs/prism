---
name: executing-plans
description: Use to carry out an authorized multi-task plan in tested slices, committing verified logical changes and continuing without routine approval pauses.
derived-from: obra/superpowers (MIT, © Jesse Vincent)
---

# Executing Plans

Execute the requested work, not a parallel workflow engine.

1. Read the plan and inspect current repository state. Resume from the first
   incomplete slice; do not assume an earlier edit or check succeeded.
2. Use `tdd` for each development slice: one failing behavior test, minimal
   implementation, passing verification, then refactor while green.
3. Check that the slice meets its acceptance criteria and integrates with its
   callers. Adapt file choices and implementation details to evidence. Ask for
   direction only if requirements, material scope or consequential trade-offs change.
4. Run relevant checks using `verification-before-completion`. Commit verified
   logical changes with `conventional-commits`; update the existing checklist.
5. Continue to the next slice automatically. If progress stalls, explain the
   blocker and propose a next step instead of repeating the same failing loop.
6. At non-trivial task completion, use `code-review`, repair concrete defects and
   verify affected behavior. Finish according to user/project publication instructions.

## Continuity

Keep a short progress note for long work: completed slices, actual test evidence,
current changes, unresolved decisions and the next task. Use Pi's normal session
continuity. Honor pause requests after leaving recoverable state; no receipt or
attempt counter is needed across resumption.

## Gotchas

- Do not run verification twice merely because two skills mention it; reuse fresh
  evidence for unchanged code and rerun checks affected by later edits.
- Passing a focused test does not prove the entire plan is done.
- Keep useful specs/plans and preserve unrelated user changes.
