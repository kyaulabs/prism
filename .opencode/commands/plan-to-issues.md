---
description: Parse a plan from docs/plans/ and create a GitHub epic + task issues via gh. Prints the parsed task list for confirmation before running gh issue create.
agent: build
---

Parse a writing-plans-format plan file and push it into GitHub Issues as an
epic with per-task sub-issues. Runs `gh issue create` after user confirmation.

## 1. Prerequisites

```bash
gh auth status 2>&1 | head -1
```

If `gh` is not installed or not authed, stop and report:

```text
✗ gh is not available or not authenticated.

Fix:
  gh auth login
```

## 2. Identify the plan file

If the user specified a plan file path, use it. Otherwise pick the most recent
plan:

```bash
ls -t docs/plans/*.md 2>/dev/null | head -1
```

If no plan files exist, stop: "No plan files found in docs/plans/."

Read the plan file and confirm it follows the `writing-plans` format
(`### Task N:` headers). If parsing fails, report the error and stop.

## 3. Parse

From the plan file, extract:

- **Plan title** — from the `# ` H1 header.
- **Goal** — from the `**Goal:**` line.
- **Tasks** — each `### Task N: <Title>` block. For each task, extract:
  - Task number and title.
  - Files list (from `**Files:**` section).
  - Interfaces summary (from `**Interfaces:**` section — truncated to one line
    per produced/consumed interface).

## 4. Verify

Print a preview table:

```text
Plan: <plan title>
Goal: <goal>
File: docs/plans/<file>.md

#  Title                                    Files
-  ---------------------------------------  --------------------
1  Shared include — EvalCase, EvalResult    Create: 1, Test: 1
2  Command builder                          Create: 2, Test: 1
...

Parent epic: [Plan] <plan title>

Create 1 epic + N task issues? (y/n)
```

Wait for confirmation before creating any issues.

## 5. Ensure the plan label exists

```bash
gh label list --json name -q '.[].name' | grep -qx plan || gh label create plan --color "0ea5e9" --description "Work from a docs/plans/ implementation plan"
```

If the label is newly created, note it in the report.

## 6. Create the parent epic

```bash
gh issue create \
  --title "[Plan] <plan title>" \
  --label "plan" \
  --body "**Goal:** <goal>

Plan file: docs/plans/<file>.md

---

This epic tracks implementation of the full plan. Each task is a sub-issue."
```

Capture the issue number from the output.

## 7. Create task issues

For each task, create an issue:

```bash
gh issue create \
  --title "[Task N] <task title>" \
  --label "plan" \
  --body "Parent: #<epic-number>

Plan: docs/plans/<file>.md

## Files
<files list as bullet points>

## Interfaces
<interfaces summary>

---

Implementation follows the @tdd Red → Green → Refactor cycle per the
executing-plans skill."
```

## 8. Report

Print a summary table with issue numbers and URLs:

```text
Issue  Type   Title                                    URL
-----  -----  ----------------------------------------  ---
#42    epic   [Plan] <plan title>                      https://github.com/<repo>/issues/42
#43    task   [Task 1] <task title>                    https://github.com/<repo>/issues/43
#44    task   [Task 2] <task title>                    https://github.com/<repo>/issues/44
...

Created 1 epic + N task issues. Label: plan.
```

## Rules

- Never create issues without user confirmation of the parsed task list.
- If `gh` is not available or not authed, stop (do not fall back to printing
  commands — the user chose auto-run).
- If the plan file doesn't match the `writing-plans` format (no `### Task N:`
  headers), report the parse error and stop.
- Only the `plan` label is applied — no triage schema, no per-project label
  config.
- Each task issue links back to the plan file and the parent epic.
- If the plan file path contains spaces or special characters, quote it.
