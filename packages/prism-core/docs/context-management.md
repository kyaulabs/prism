# Context management

Use this guide when a long pi session starts losing focus, repeating work, or
burying the current task under old output. Prism runs planning, implementation,
tests, and review in one agent context, so context management is part of
execution discipline.

## Observable thresholds

Treat these as operating thresholds, not measurements of model capacity:

| Context use | Action |
| --- | --- |
| 0-30% | Continue normally and keep reads focused |
| 30-40% | Prepare a compaction note and persist current evidence |
| 40-50% | Compact with a task-specific prompt |
| 50-60% | Compact immediately or write a handoff |
| Above 60% | Write a handoff and continue in a new session |

Act earlier for architecture work, debugging, or large refactors. Warning signs
matter more than the percentage: repeated questions, forgotten constraints,
contradictory edits, broad rereads, or difficulty naming the next test all mean
the active context is degrading.

## Choose the recovery action

| Situation | Action |
| --- | --- |
| A recent attempt was wrong | Rewind with `/tree` and retry from before it |
| The task is clear but history is noisy | Run `/compact` with a focused prompt |
| State must survive compaction | Update the plan, task list, or durable note first |
| The session is long but continuation is well-defined | Run `/handoff` |
| The next task is unrelated | Start a new session |
| Only one code question remains | Use a focused read or `explore` |

## Rewind

Prefer rewind to layering corrections over a failed attempt. Use `/tree` to
return to the point before the wrong action, then retry with the new fact. This
removes failed reasoning and tool output from the active branch of the
conversation.

Do not rewind past durable repository mutations unless the workflow explicitly
permits it. Git history, plans, issue state, and transaction journals remain the
source of truth.

## Compact

Compact before automatic overflow. State the active task and what must survive:

```text
/compact preserve the active plan task, interfaces, open decisions, failing or passing test evidence, exact paths, and the next unchecked step; drop completed-task detail and broad exploration output
```

A compaction prompt should preserve:

- the current task and acceptance criteria;
- exact interfaces and paths;
- the last Red or Green command and result;
- unresolved decisions or blockers;
- the next action;
- commit and branch state when relevant.

## Persist execution state

Before compaction or handoff:

1. update task status;
2. record the last verified command and result;
3. keep current interface names and invariants explicit;
4. identify the next unchecked task;
5. note staged, committed, or untracked repository state.

Do not rely on conversation memory for facts that another session must use.
Write durable facts to the approved plan, issue, ADR, `CONTEXT.md`, or handoff
surface owned by the workflow.

## Handoff and new session

Use `/handoff` when compaction would remove important constraints or when the
session is already degraded. A handoff should contain the goal, decisions,
completed work, active task, blockers, verification evidence, repository state,
and exact next steps.

Start a fresh session for unrelated work. Old context is useful only when it
reduces rereading without importing obsolete assumptions.

## Rules

- Check context after every three plan tasks and before a large new slice.
- Prefer the smallest useful read range.
- Keep test evidence and task status durable.
- Rewind failed attempts instead of narrating over them.
- Compact before overflow.
- Use a handoff rather than pushing through visible degradation.
