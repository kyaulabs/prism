# /work-issue Command Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Create a `/work-issue` command that fetches an existing GitHub issue, analyzes the codebase, routes through the appropriate pipeline stages, writes an implementation plan, and halts for user approval before dispatching to @tdd.

**Architecture:** Single command file (`.opencode/commands/work-issue.md`) using `agent: build` context. Orchestrates existing agents (@explore, @architect, @debug) and skills (brainstorming, prototype, writing-plans, executing-plans) through a conditional branching workflow. Requires companion updates to `AGENTS.md` and `README.md` index tables — `validate-harness.sh` enforces atomic consistency.

**Tech Stack:** Markdown command template, opencode command frontmatter, gh CLI (via @explore delegation).

## Global constraints

- Command files are markdown — no RCS header (exempt per rcs-header skill).
- Frontmatter requires `---` delimiters and a `description` field.
- `validate-harness.sh` cross-checks command files against both `AGENTS.md` Commands table and `README.md` Slash commands table — both must be updated atomically.
- No unit tests apply to command files — verification is `validate-harness.sh` + `tests/Shell/validate-harness_test.sh` + manual invocation.
- Commit messages use Conventional Commits format with Plan-by / Acked-by / Signed-off-by footers (see conventional-commits skill).

---

### Task 1: Write the brainstorming spec

**Files:**
- Create: `docs/specs/2026-07-14-work-issue-command-spec.md`

**Interfaces:**
- Produces: the approved design document for `/work-issue`

- [ ] **Step 1: Create the spec file**

Content for `docs/specs/2026-07-14-work-issue-command-spec.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/specs/2026-07-14-work-issue-command-spec.md
git commit -S -m "docs(specs): add /work-issue command spec

Plan-by: glm-5.2
Acked-by: <build-model>
Signed-off-by: kyau <git@kyaulabs.com>"
```

> Replace `<build-model>` with the model ID segment after the last `/` from
> `agent.build.model` in `opencode.json` (or the top-level `model` if
> `agent.build.model` is absent).

---

### Task 2: Create command file + update index tables

**Files:**
- Create: `.opencode/commands/work-issue.md`
- Modify: `AGENTS.md` — Commands table (add row)
- Modify: `README.md` — `### Slash commands` table (add row)

**Interfaces:**
- Produces: a valid `/work-issue` command registered in all index tables,
  passing `validate-harness.sh` cross-checks.

- [ ] **Step 1: Create the command file**

Create `.opencode/commands/work-issue.md` with this exact content:

```markdown
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
```

- [ ] **Step 2: Add row to AGENTS.md Commands table**

In `AGENTS.md`, find the `## Commands` table. Add this row after the `/issue`
row:

```markdown
| `/work-issue` | Analyze an existing GitHub issue, plan the fix, and halt for approval before dispatching to @tdd |
```

- [ ] **Step 3: Add row to README.md Slash commands table**

In `README.md`, find the `### Slash commands` table. Add this row as the
**last row** (alphabetically, `work-issue` sorts after `teach`):

```markdown
| `/work-issue` | Analyze an existing GitHub issue, plan the fix, and halt for approval before dispatching to @tdd |
```

- [ ] **Step 4: Verify with validate-harness.sh**

Run:
```bash
bash .github/scripts/validate-harness.sh
```
Expected: 0 errors. Output should show the command count incremented by 1
and both "AGENTS.md index tables cross-checked" and "README.md index tables
cross-checked" reporting OK.

- [ ] **Step 5: Run shell tests**

Run:
```bash
bash tests/Shell/validate-harness_test.sh
```
Expected: all tests pass (no regressions in the validator's own test suite).

- [ ] **Step 6: Commit**

```bash
git add .opencode/commands/work-issue.md AGENTS.md README.md
git commit -S -m "feat(commands): add /work-issue command

Takes an existing GitHub issue number, fetches it via gh, analyzes the
codebase, conditionally routes through pipeline stages (brainstorm,
prototype, @debug, @architect as needed), writes an implementation
plan, and halts for user approval before dispatching to @tdd.

Plan-by: glm-5.2
Acked-by: <build-model>
Signed-off-by: kyau <git@kyaulabs.com>"
```

> Replace `<build-model>` as noted in Task 1.

---

### Task 3: Manual verification (user-performed)

This task is **not** executed by @tdd — it's a manual smoke test performed by
the user after implementation.

- [ ] **Step 1: Invoke /work-issue on a real issue**

Run `/work-issue <real-issue-number>` in opencode. Verify:
1. `@explore` fetches the issue via `gh issue view`
2. Codebase analysis identifies relevant files
3. Assessment determines a pipeline path
4. A plan is written and presented
5. The command halts and waits for approval

- [ ] **Step 2: Test the halt boundary**

Verify that **no** code changes, branches, or @tdd dispatches occur before
approval. The command should present the plan and explicitly wait.

- [ ] **Step 3: Approve and verify execution flow**

Reply "go" and verify:
1. A feature branch is created
2. @tdd is dispatched per the plan
