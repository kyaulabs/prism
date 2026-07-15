---
description: Analyze an existing GitHub issue, plan the fix, and halt for approval before dispatching to @tdd.
agent: build
---

Analyze GitHub issue **#$ARGUMENTS**, assess the appropriate approach, write
an implementation plan, and halt for user approval before any code changes.

## Steps

### 1. Fetch the issue

Dispatch `@explore` to run:

```bash
gh issue view $ARGUMENTS
```

Strip a leading `#` from the issue number if present. Extract: title, body,
labels, issue type, comments, and linked issues/PRs.

Also search `docs/plans/` and `docs/specs/` for files referencing issue
#$ARGUMENTS. If found, use them as the starting point and skip to Step 4.

### 2. Analyze the codebase

Dispatch `@explore` to identify affected files, modules, current behavior,
where the change lands, and related existing tests.

### 3. Assess and route

Evaluate the issue against the engineering pipeline (see AGENTS.md) and
determine which stages are needed before planning:

| Signal | Insert |
|---|---|
| Bug report | `@debug` (6-phase investigation) |
| Non-trivial / cross-cutting | `@architect` validation |
| Ambiguous / multiple approaches | `brainstorming` skill |
| Technical viability uncertain | `prototype` skill |
| Straightforward fix | Skip to planning |

Stages can stack (e.g., non-trivial bug → `@debug` + `@architect`).

### 4. Plan

Invoke the `writing-plans` skill → detailed implementation plan saved to
`docs/plans/`.

### 5. HALT — present for approval

Present:
1. Issue summary (title, key requirements)
2. Assessment result (complexity, path taken, findings)
3. The full implementation plan

Then ask: *"Review the plan. Reply 'go' to dispatch to @tdd, or request
changes."*

**Do NOT write code, create branches, or dispatch @tdd until the user
approves.**

### 6. Execute (post-approval only)

On user approval:
1. Create feature branch: `feat/<username>-<hash>-<description>`
2. Dispatch tasks to `@tdd` via the `executing-plans` skill.

## Rules

- No code changes before plan approval — zero exceptions.
- No `git push` (denied to all agents).
- No automatic issue closure or PR creation.
- `/check` is a separate manual gate after implementation completes.
