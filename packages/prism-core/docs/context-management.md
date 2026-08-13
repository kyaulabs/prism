# Context Management

Loaded when context usage grows. The `executing-plans` skill references this
doc when a session approaches degradation thresholds.

## The problem

Models degrade as context fills. The degradation is not linear — it
accelerates past ~40% context usage. A session that was sharp at 20% becomes
unreliable at 60%. This is a major cause of poor agent output.

Under Prism's single-agent pi architecture, the same context carries planning,
implementation, test output, and review. There is no worker-context isolation,
so proactive compaction and handoff are load-bearing.

## Thresholds

| Context usage | What to do |
|---|---|
| 0–30% | Sweet spot. Full intelligence. |
| 30–40% | Still good. Prepare a focused compaction note; avoid unrelated reads. |
| 40–50% | Early degradation. Compact now with a task-specific hint. |
| 50–60% | Noticeable degradation. Compact immediately or prepare `/handoff`. |
| 60%+ | Severe degradation. Run `/handoff` and start a fresh session. |

These are approximate. Simple tasks tolerate higher context; complex reasoning
and large refactors degrade sooner.

## Techniques

### Rewind > correct

When an attempt fails, **rewind** with `/tree` to before the failed attempt and
re-prompt with what you learned — do not leave failed attempts and corrections
polluting active context. A clean re-prompt with the lesson learned produces
better output than a correction layered on top of a failure.

### Compact with a hint

`/compact` with a focus hint beats letting autocompact fire:

```text
/compact focus on executing plan <filename>; preserve open task, interfaces, test evidence, and unchecked task numbers; drop completed task detail
```

The model is at its least reliable when overflow compaction fires. Compact
proactively before that wall.

### Persist execution state

After every completed task:

- check off the task in the plan
- record the last verified command/evidence
- keep interface names and the next unchecked task explicit

Compaction and handoff are only safe when durable state says where to resume.

### New task = new session

Related tasks can reuse context for efficiency. Genuinely new tasks deserve a
fresh session — old context is noise, not signal.

### Use focused reads

Ask: "will I need this tool output again, or just the conclusion?" Read the
smallest useful file/range, summarize durable conclusions into the plan or
handoff, and avoid repeatedly loading broad outputs. The `explore` skill keeps
investigation scoped but runs in the same agent context.

### Use `/handoff` for long sessions

When a session approaches 60%, shows degraded reasoning, or cannot compact
without losing active constraints, run `/handoff` to save state to a structured
document. Start a fresh session and tell it:

> Read `docs/handoffs/<filename>` and continue executing the plan.

## Rules

- During plan execution, check context after every three tasks.
- Prefer proactive compaction with a hint over reactive autocompact.
- At the first sign of degradation, hand off rather than pushing through.
- Keep plan checkboxes and current interface/test evidence durable.
- When in doubt, start fresh. A new session with a good handoff beats a
  degraded session with full context.
