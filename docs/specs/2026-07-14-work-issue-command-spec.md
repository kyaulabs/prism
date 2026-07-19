# /work-issue Command Spec

**Date:** 2026-07-14
**Status:** Approved

## Purpose

Create a `/work-issue` command that takes an existing GitHub issue number,
fetches its details, analyzes the codebase, routes through the appropriate
engineering pipeline stages, writes an implementation plan, and halts for
user approval before dispatching to @tdd.

## Background

The project has commands for creating issues (`/issue`) and pushing plans to
issues (`/plan-to-issues`), but no command for the reverse direction: taking
an existing issue and starting work on it. Users currently manually type a
prompt into Plan mode each time.

## Design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Autonomy scope | Plan-and-halt | Matches current workflow; prevents implementing the wrong thing |
| Assessment logic | Conditional branching | Efficient — skips brainstorming for clear-cut fixes, inserts it for ambiguous ones |
| Branch creation | Command creates it | Keeps @tdd focused on Red→Green→Refactor |
| Existing work check | Yes | Avoids duplicating effort if a plan/spec already references the issue |
| Agent context | `agent: build` | Needs to dispatch subagents and manage interactive halt-and-continue |

## Workflow

1. Fetch issue via `gh issue view` (delegate to @explore)
2. Check `docs/plans/` and `docs/specs/` for existing work referencing the issue
3. Analyze codebase for affected files (delegate to @explore)
4. Assess and route through pipeline stages as needed
5. Write implementation plan (writing-plans skill)
6. Halt for user approval
7. On approval: create feature branch, dispatch to @tdd

## Conditional routing matrix

| Signal from issue | Pipeline insertion |
|---|---|
| Bug report (reproducible defect) | `@debug` (6-phase investigation) |
| Non-trivial or cross-cutting change | `@architect` validation |
| Ambiguous requirements / multiple approaches | `brainstorming` skill |
| Technical viability uncertain | `prototype` skill |
| Straightforward, clear fix | Skip directly to planning |

Stages can stack (e.g., non-trivial bug → `@debug` + `@architect`).

## Non-goals

- Automatic issue closure or PR creation
- Running /check automatically (separate manual gate)
- Pushing to remote (denied to all agents)
