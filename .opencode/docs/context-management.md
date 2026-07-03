# Context Management

Loaded when context usage grows. The build agent references this doc when
a session approaches degradation thresholds.

## The problem

Models degrade as context fills. The degradation is not linear — it
accelerates past ~40% context usage. A session that was sharp at 20% becomes
unreliable at 60%. This is the #1 cause of poor agent output.

## Thresholds

| Context usage | What to do |
|---|---|
| 0–30% | Sweet spot. Full intelligence. |
| 30–40% | Still good. Start being mindful. |
| 40–50% | Early degradation. Consider compacting or offloading. |
| 50–60% | Noticeable degradation. Compact now. |
| 60%+ | Severe degradation. Compact or start a new session. |

These are approximate. Simple tasks tolerate higher context; complex reasoning
and large refactors degrade sooner.

## Techniques

### Rewind > correct

When an attempt fails, **rewind** to before the failed attempt and re-prompt
with what you learned — don't leave failed attempts and corrections polluting
context. A clean re-prompt with the lesson learned produces better output
than a correction layered on top of a failure.

### Compact with a hint

`/compact` with a focus hint beats letting autocompact fire:

```
/compact focus on the auth refactor, drop the test debugging
```

The model is at its least intelligent point when auto-compacting fires (it's
already degraded). Compact proactively with a hint before you hit that wall.

### New task = new session

Related tasks (e.g. writing docs for what you just built) can reuse context
for efficiency. But genuinely new tasks deserve a fresh session — the old
context is noise, not signal.

### Use subagents for context-heavy exploration

Ask yourself: "will I need this tool output again, or just the conclusion?"

If you just need the conclusion, dispatch a subagent (`@explore`,
`@architect`, `@debug`). The subagent's 20 file reads + 12 greps + 3 dead
ends stay in the child's context — only the final report returns to the
parent. This keeps the main context clean for reasoning.

### Use `/handoff` for long sessions

When a session is approaching the degradation threshold but the work isn't
done, run `/handoff` to save the state to a structured document. Start a
fresh session and tell the agent: "read `docs/handoffs/<filename>` and
continue."

## Rules

- Monitor context usage proactively — don't wait for degradation to become
  obvious.
- Prefer proactive compaction with a hint over reactive autocompact.
- When in doubt, start fresh. A new session with a good handoff beats a
  degraded session with full context.
- The `/handoff` command exists specifically for this — use it.
