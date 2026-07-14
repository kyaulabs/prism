---
description: Interactive issue creation — describe the issue, AI generates conventional-commit title and body draft, sets org issue type/fields/labels.
---

Create a GitHub issue through an interactive AI-assisted workflow. The user
describes the issue in natural language; you generate a conventional-commit
title and draft the body, then delegate `gh` execution to `@explore`.

## Commit-Type → Issue-Type Mapping

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

Security override: if the description mentions security, vulnerability, CVE,
or exploit, use `fix(security)` and the Security issue type.

## Custom Fields

| Field | Type | Options | When Prompted |
|---|---|---|---|
| Priority | single_select | Critical, High, Medium, Low | Always |
| Effort | single_select | High, Medium, Low | Always |
| Progress | single_select | Under Construction, In Progress, Testing, Complete | Always |
| Start date | date | ISO 8601 (YYYY-MM-DD) | Feature/Patch only |
| Target date | date | ISO 8601 (YYYY-MM-DD) | Feature/Patch only |

## Optional Labels

Present these as toggles during the interview:

- `brainstorming` — issue is still being figured out
- `research` — issue needs research first
- `request for comments` — external opinions needed
- `help wanted` — open to contributors
- `good first issue` — suitable for newcomers

## Issue Body Format

```markdown
## 📋 Summary

[content]

## 📍 Location

[content]

## 🧠 Why It Matters

[content]

## 🛠️ Recommended Implementation

[content]

## ✅ Acceptance Criteria

- [ ] [criterion]
```

## Workflow

### Step 0: Pre-flight (delegate to @explore)

Dispatch `@explore` with instructions to run:

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

### Step 1: Prompt for description

Ask the user a single open-ended question:

> Describe the issue you want to create. What's happening, what should
> happen, where in the codebase, and why does it matter? Be as detailed
> as you like — the more context, the better the draft.

### Step 2: Generate title + body

From the user's description, generate:

- **Title** in conventional commit format: `type(scope): subject`
  - Detect the commit type from semantic context
  - Detect scope from the affected module or area (optional)
  - Subject: lowercase, no trailing period, imperative mood, max 100 chars
  - Use parentheses for scope — never brackets
  - Security override: if description mentions security/vulnerability/CVE,
    use `fix(security)` which maps to the Security issue type
- **Issue type** auto-derived from the title's commit type via the
  mapping table above
- **Body** with all 5 sections drafted from the description:
  - `## 📋 Summary` — concise restatement of the issue
  - `## 📍 Location` — files/directories/components mentioned (or "To be
    determined" if not mentioned)
  - `## 🧠 Why It Matters` — rationale extracted from the description
  - `## 🛠️ Recommended Implementation` — suggested approach
  - `## ✅ Acceptance Criteria` — testable done-conditions as checkboxes

### Step 3: Present draft for review

Present the generated title and body to the user. Ask whether to accept
as-is or edit any part (type, scope, subject, or any body section). If
the user edits the title, re-validate the format and re-derive the issue
type.

### Step 4: Prompt for custom fields

Based on the derived issue type, prompt for:

- **Always**: Priority (Critical/High/Medium/Low), Effort (High/Medium/Low),
  Progress (Under Construction/In Progress/Testing/Complete)
- **Feature/Patch only**: also Start date and Target date (YYYY-MM-DD or skip)

Suggest sensible defaults from the description context when possible.

### Step 5: Prompt for optional labels

Present the 5 labels listed above as optional toggles. The user may select
none, one, or multiple. Default is none.

### Step 6: Full preview + confirmation

Print a complete preview:

```text
╔══════════════════════════════════════════╗
║  ISSUE PREVIEW                           ║
╠══════════════════════════════════════════╣
║  Title:  <generated title>               ║
║  Type:   <derived issue type>            ║
║  Labels: <selected labels or none>       ║
║  Fields:                                 ║
║    Priority: <value>                     ║
║    Effort:    <value>                    ║
║    Progress:  <value>                    ║
║    [<dates if Feature/Patch>]            ║
║  Body: (truncated preview)               ║
╚══════════════════════════════════════════╝
```

Wait for user confirmation (y/n). On "n", return to the relevant step.

### Step 7: Create issue (delegate to @explore)

Dispatch `@explore` with all finalized data (title, body, issue type node
ID, field IDs + values, label names) and instructions to execute in order:

```bash
# 1. Detect repo dynamically — never hard-code
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
OWNER=$(gh repo view --json owner -q .owner.login)
NAME=$(gh repo view --json name -q .name)

# 2. Create the issue — capture issue number from output URL
gh issue create --repo "$REPO" --title "<title>" --body "<body>"

# 3. Get the issue's GraphQL node ID
gh api graphql -f query="{ repository(owner: \"$OWNER\", name: \"$NAME\") { issue(number: <N>) { id } } }"

# 4. Set the issue type via GraphQL mutation
gh api graphql -f query="mutation { updateIssue(input: { id: \"<NODE_ID>\", issueTypeId: \"<TYPE_NODE_ID>\" }) { issue { number issueType { name } } } }"

# 5. Set custom field values via REST POST
gh api "repos/$REPO/issues/<N>/issue-field-values" -X POST \
  -f issue_field_values='[{"field_id": <ID>, "value": "<value>"}, ...]'

# 6. Apply labels (skip if none selected)
gh issue edit <N> --repo "$REPO" --add-label "<label1>,<label2>"
```

Replace all `<...>` placeholders with the actual values from the interview.
Use the cached type node IDs and field IDs from Step 0.

### Step 8: Report

Print the issue number and GitHub URL returned by `@explore`:

```text
✅ Issue #<N> created: https://github.com/<owner>/<repo>/issues/<N>
```

## Rules

- Never hard-code the repo name. Always detect via `gh repo view --json nameWithOwner`.
- Never create an issue without user confirmation.
- Title must follow conventional commit format with parentheses for scope, never brackets.
- Security-related descriptions must use `fix(security)` which maps to the Security issue type.
- Feature and Patch types prompt for all 5 custom fields; all other types prompt for 3 only.
- If `gh auth status` fails, stop and instruct the user to authenticate.
- If issue creation fails, stop and report the error. Do not attempt type/field/label assignment.
- If type or field setting fails after successful issue creation, warn the user but still report the issue URL.
- Label application failure is non-critical — warn and continue.
- All field IDs and type node IDs must be queried dynamically from the org API, never hard-coded.
