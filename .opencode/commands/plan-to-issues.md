---
description: Parse a plan from docs/plans/ and create a GitHub epic + task issues via gh with issue types, custom fields, and labels aligned to /issue conventions. Confirms parsed task list before creating.
agent: build
---

Parse a writing-plans-format plan file and push it into GitHub Issues as an
epic with per-task sub-issues. Applies org-level issue types, custom fields
(Priority, Effort, Progress ± dates), and optional labels using the same
patterns as the `/issue` command.

## Plan file argument

The user may specify a plan file path: $ARGUMENTS

If the above is empty, automatically pick the most recent plan (Step 1).

## 0. Pre-flight

Same as `/issue` — check auth, detect repo dynamically, cache issue-type
node IDs, field IDs + options, and label names:

```bash
gh auth status
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
OWNER=$(gh repo view --json owner -q .owner.login)
NAME=$(gh repo view --json name -q .name)
gh api "orgs/$OWNER/issue-types"
gh api "orgs/$OWNER/issue-fields"
gh api "repos/$REPO/labels"
```

Cache the returned issue type node IDs, field IDs + options, and label
names from the responses. If `gh auth status` fails, stop and tell the
user to run `gh auth login`.

## 1. Identify the plan file

If the argument above specifies a plan file path, use it. Otherwise pick
the most recent plan:

```bash
ls -t docs/plans/*.md 2>/dev/null | head -1
```

If no plan files exist, stop: "No plan files found in docs/plans/."

Read the plan file and confirm it follows the `writing-plans` format
(`### Task N:` headers). If parsing fails, report the error and stop.

## 2. Parse

From the plan file, extract:

- **Plan title** — from the `# ` H1 header.
- **Goal** — from the `**Goal:**` line.
- **Tasks** — each `### Task N: <Title>` block. For each task, extract:
  - Task number and title.
  - Files list (from `**Files:**` section).
  - Interfaces summary (from `**Interfaces:**` section).
  - **Scope** — infer from the Files section (e.g. files under
    `backend/commands/` → scope `commands`; files under `backend/auth/` →
    scope `auth`). Use the most specific common directory name.

## 3. Derive epic issue type from Goal

Apply the same commit-type → issue-type mapping as `/issue`:

| Commit Type | Issue Type | Custom Fields |
|---|---|---|
| `feat` | Feature | All 5 |
| `fix` | Bug | 3 only |
| `fix(security)` | Security | 3 only |
| `patch` | Patch | All 5 |
| `docs` | Documentation | 3 only |
| `perf` | Performance | 3 only |
| `refactor` | Refactor | 3 only |
| `style` | Style | 3 only |
| `test` | Test | 3 only |
| `ci` | CI/CD | 3 only |
| `build` | CI/CD | 3 only |
| `chore` | Chore | 3 only |
| `revert` | Chore | 3 only |

"All 5" = Priority, Effort, Progress, Start date, Target date.
"3 only" = Priority, Effort, Progress.

Derive the commit type and scope from the Goal text using the same
heuristic as `/issue`. Security override: if the Goal mentions security,
vulnerability, CVE, or exploit, use `fix(security)` → Security type.

Present the derived `type(scope)` to the user. Allow override.

**All tasks inherit this issue type.** Task scopes are per-task (from
Step 2).

## 4. Prompt for custom fields (once, applied to all)

Prompt for:

- **Always:** Priority (Critical/High/Medium/Low), Effort (High/Medium/Low),
  Progress (Under Construction/In Progress/Testing/Complete)
- **Feature/Patch only:** also Start date and Target date (YYYY-MM-DD or
  skip)

Suggest sensible defaults from the plan context (e.g. Priority=Medium,
Effort=Medium, Progress=Under Construction). These values apply to the
epic and every task.

## 5. Prompt for optional labels (once, applied to all)

Present the same 5 toggles as `/issue`:

- `brainstorming` — issue is still being figured out
- `research` — issue needs research first
- `request for comments` — external opinions needed
- `help wanted` — open to contributors
- `good first issue` — suitable for newcomers

Selected labels apply to the epic + all tasks, alongside the mandatory
`plan` label. Default is none.

## 6. Full preview + confirmation

Print a complete preview:

```text
╔══════════════════════════════════════════════════════╗
║  PLAN-TO-ISSUES PREVIEW                              ║
╠══════════════════════════════════════════════════════╣
║  Plan:    docs/plans/<file>.md                       ║
║  Goal:    <goal>                                     ║
║                                                      ║
║  Epic:   <type>(<scope>): <plan title>               ║
║  Type:    <derived issue type>                       ║
║                                                      ║
║  Fields (applied to all issues):                     ║
║    Priority:    <value>                              ║
║    Effort:       <value>                             ║
║    Progress:     <value>                             ║
║    [Start date:   <value>]                           ║
║    [Target date:  <value>]                           ║
║                                                      ║
║  Labels:   plan[, <selected toggles>]                ║
║                                                      ║
║  Tasks:                                              ║
║    1  <type>(<scope>): <task title> task#1           ║
║    2  <type>(<scope>): <task title> task#2           ║
║    ...                                               ║
╚══════════════════════════════════════════════════════╝

Create 1 epic + N task issues? (y/n)
```

Wait for user confirmation before creating any issues. On "n", return to
the relevant step.

## 7. Ensure the plan label exists

```bash
gh label list --json name -q '.[].name' | grep -qx plan || gh label create plan --color "0ea5e9" --description "Work from a docs/plans/ implementation plan"
```

If the label is newly created, note it in the report.

## 8. Create the parent epic

Create the issue, set its type via GraphQL, set custom fields via REST,
and apply labels:

```bash
# 1. Create the issue — capture number from output URL
EPIC_URL=$(gh issue create --repo "$REPO" \
  --title "<type>(<scope>): <plan title>" \
  --body "<body>")
EPIC_NUM=<extract from URL>

# 2. Get GraphQL node ID
EPIC_NODE=$(gh api graphql -f query="{ repository(owner: \"$OWNER\", name: \"$NAME\") { issue(number: $EPIC_NUM) { id } } }" -q '.data.repository.issue.id')

# 3. Set issue type
gh api graphql -f query="mutation { updateIssue(input: { id: \"$EPIC_NODE\", issueTypeId: \"<TYPE_NODE_ID>\" }) { issue { number issueType { name } } } }"

# 4. Set custom fields
gh api "repos/$REPO/issues/$EPIC_NUM/issue-field-values" -X POST \
  -f issue_field_values='[{"field_id": <ID>, "value": "<value>"}, ...]'

# 5. Apply labels
gh issue edit "$EPIC_NUM" --repo "$REPO" --add-label "<labels>"
```

**Epic body** (5-section template):

```markdown
Plan file: docs/plans/<file>.md

## 📋 Summary

<goal text>

## 📍 Location

docs/plans/<file>.md

## 🧠 Why It Matters

<rationale extracted from the plan's goal/context>

## 🛠️ Recommended Implementation

This epic tracks implementation of the full plan. Each task below is a
sub-issue linked to this epic. Implementation follows the @tdd
Red → Green → Refactor cycle per the executing-plans skill.

## ✅ Acceptance Criteria

- [ ] All task sub-issues are complete
- [ ] /check passes
- [ ] @code-review approved
```

Replace all `<...>` placeholders with actual values from the interview.

## 9. Create task issues

For each task, create an issue with the inherited type, per-task scope,
shared fields, labels, and the 5-section body. Use the same create →
type → fields → labels pattern:

```bash
# 1. Create the task issue
TASK_URL=$(gh issue create --repo "$REPO" \
  --title "<type>(<scope>): <task title> task#N" \
  --body "<body>")
TASK_NUM=<extract from URL>

# 2. Get GraphQL node ID
TASK_NODE=$(gh api graphql -f query="{ repository(owner: \"$OWNER\", name: \"$NAME\") { issue(number: $TASK_NUM) { id } } }" -q '.data.repository.issue.id')

# 3. Set issue type
gh api graphql -f query="mutation { updateIssue(input: { id: \"$TASK_NODE\", issueTypeId: \"<TYPE_NODE_ID>\" }) { issue { number issueType { name } } } }"

# 4. Set custom fields
gh api "repos/$REPO/issues/$TASK_NUM/issue-field-values" -X POST \
  -f issue_field_values='[{"field_id": <ID>, "value": "<value>"}, ...]'

# 5. Apply labels
gh issue edit "$TASK_NUM" --repo "$REPO" --add-label "<labels>"
```

**Task body** (5-section template):

```markdown
Parent: #<epic-number>
Plan: docs/plans/<file>.md

## 📋 Summary

<task title — what this task implements>

## 📍 Location

<files from the task's **Files:** section, as bullet points>

## 🧠 Why It Matters

<from plan Goal — why this task contributes to the plan's objective>

## 🛠️ Recommended Implementation

<interfaces from the task's **Interfaces:** section>
Implementation follows the @tdd Red → Green → Refactor cycle.

## ✅ Acceptance Criteria

- [ ] <task deliverable 1 as extracted from the plan>
- [ ] <task deliverable 2>
```

**Task title format:** `<type>(<scope>): <task title> task#N` — type
inherited from epic, scope per-task, `task#N` suffix.

## 10. Report

Print a summary table with issue numbers, issue types, titles, and URLs:

```text
Issue  Type      Title                                          URL
-----  --------  ---------------------------------------------  ---
#42    Feature   feat(commands): command builder                https://github.com/<repo>/issues/42
#43    Feature   feat(commands): shared include task#1         https://github.com/<repo>/issues/43
#44    Feature   feat(commands): command builder task#2        https://github.com/<repo>/issues/44
...

Created 1 epic + N task issues.
Labels: plan[, <selected toggles>]. Issue type: <type>. Fields applied to all.
```

## Rules

- Never hard-code the repo name. Always detect via `gh repo view ... -q
  .nameWithOwner`.
- Never create issues without user confirmation of the parsed task list.
- The epic's issue type is derived from the Goal line; all tasks inherit
  that type. The user may override the type before creation.
- Task titles use `<type>(<scope>): <task title> task#N` format — type
  inherited from epic, scope per-task, `task#N` suffix.
- Feature and Patch types prompt for all 5 custom fields (including
  dates); all other types prompt for 3 only (Priority, Effort, Progress).
- Custom fields and optional labels are prompted once and applied to the
  epic + all tasks.
- The `plan` label is always applied; optional labels are additive.
- If `gh auth status` fails, stop and instruct the user to authenticate.
- If issue creation fails for any issue, stop and report the error.
- If type or field setting fails after successful issue creation, warn
  the user but still report the issue URL.
- Label application failure is non-critical — warn and continue.
- All field IDs and type node IDs must be queried dynamically from the
  org API, never hard-coded.
- If the plan file doesn't match the `writing-plans` format (no
  `### Task N:` headers), report the parse error and stop.
- If the plan file path contains spaces or special characters, quote it.
