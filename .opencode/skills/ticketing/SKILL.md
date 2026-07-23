---
name: ticketing
description: Use when creating a GitHub issue/ticket or decomposing a plan or spec into an epic with vertical-slice task sub-issues. Provides the single source of truth for the commit-type to issue-type mapping, custom fields, optional labels, dynamic repo detection, the gh create-to-type-to-fields-to-labels pattern, mode auto-detection (single vs from-spec), vertical-slice decomposition with native blocking edges, and the wide-refactor path.
---

# Ticketing

Unified issue/ticket creation for the KYAULabs harness. This skill is the
single source of truth for all shared mechanics. Commands (`/issue`,
`/ticket`, `/issues`, `/tickets`) are thin wrappers that load this skill
and pass `$ARGUMENTS`.

## Mode detection

The mode is inferred from which command invoked the skill and the
`$ARGUMENTS` shape:

- **Singular commands** (`/issue`, `/ticket`):
  - Empty or free-text `$ARGUMENTS` → **Single-issue workflow**
  - `$ARGUMENTS` is a `docs/plans/` or `docs/specs/` path → **From-spec
    decomposition workflow** (auto-detected)
- **Plural commands** (`/issues`, `/tickets`):
  - Always **From-spec decomposition workflow**
  - Empty `$ARGUMENTS` → prompt for a plan/spec file or auto-pick the most
    recent in `docs/plans/`

## Commit-type to issue-type mapping

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

Security override: if the description or goal mentions security,
vulnerability, CVE, or exploit, use `fix(security)` and the Security issue
type.

## Custom fields

| Field | Type | Options | When Prompted |
|---|---|---|---|
| Priority | single_select | Critical, High, Medium, Low | Always |
| Effort | single_select | High, Medium, Low | Always |
| Progress | single_select | Under Construction, In Progress, Testing, Complete | Always |
| Start date | date | ISO 8601 (YYYY-MM-DD) | Feature/Patch only |
| Target date | date | ISO 8601 (YYYY-MM-DD) | Feature/Patch only |

## Optional labels

Present these as toggles during the interview:

- `brainstorming` — issue is still being figured out
- `research` — issue needs research first
- `request for comments` — external opinions needed
- `help wanted` — open to contributors
- `good first issue` — suitable for newcomers

## Pre-flight (delegate to @explore)

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
names. If `gh auth status` fails, stop and tell the user to run
`gh auth login`.

## The gh create to type to fields to labels pattern

Delegate to `@explore`. Execute in order:

```bash
# 1. Detect repo dynamically — never hard-code
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
OWNER=$(gh repo view --json owner -q .owner.login)
NAME=$(gh repo view --json name -q .name)

# 2. Create the issue — capture issue number from output URL
# Write title and body to temp files via single-quoted heredoc (no expansion).
# gh issue create lacks --title-file, so read the title into a shell variable.
# Double-quoted variable expansion ("$TITLE") does NOT re-parse the value for
# quotes, $(), or backticks — the content is inert data, not executable code.
cat > /tmp/issue-title.txt <<'HEREDOC'
<title>
HEREDOC
cat > /tmp/issue-body.md <<'HEREDOC'
<body>
HEREDOC
TITLE=$(cat /tmp/issue-title.txt)
gh issue create --repo "$REPO" --title "$TITLE" --body-file /tmp/issue-body.md

# 3. Get the issue's GraphQL node ID
gh api graphql -F owner="$OWNER" -F name="$NAME" -F num=<N> -f query='query($owner:String!,$name:String!,$num:Int!){ repository(owner: $owner, name: $name) { issue(number: $num) { id } } }'

# 4. Set the issue type via GraphQL mutation
gh api graphql -F nodeId="<NODE_ID>" -F typeId="<TYPE_NODE_ID>" -f query='mutation($nodeId:ID!,$typeId:ID!) { updateIssue(input: { id: $nodeId, issueTypeId: $typeId }) { issue { number issueType { name } } } }'

# 5. Set custom field values via REST POST
gh api "repos/$REPO/issues/<N>/issue-field-values" -X POST \
  -f issue_field_values='[{"field_id": <ID>, "value": "<value>"}, ...]'

# 6. Apply labels (skip if none selected)
gh issue edit <N> --repo "$REPO" --add-label "<label1>,<label2>"
```

Replace all `<...>` placeholders with actual values. Use cached type node
IDs and field IDs from the pre-flight step.

## Single-issue workflow

### Step 1: Prompt for description

Ask the user a single open-ended question:

> Describe the issue you want to create. What's happening, what should
> happen, where in the codebase, and why does it matter?

### Step 2: Generate title + body

- **Title** in conventional commit format: `type(scope): subject`
- **Issue type** auto-derived from the title's commit type via the mapping
  table above
- **Body** with all 5 sections:
  - `## Summary` — concise restatement
  - `## Location` — files/directories mentioned
  - `## Why It Matters` — rationale
  - `## Recommended Implementation` — suggested approach
  - `## Acceptance Criteria` — testable done-conditions as checkboxes

### Step 3: Present draft for review

Present title and body. Allow edits. If title changes, re-derive issue
type.

### Step 4: Prompt for custom fields

Based on derived issue type (see Custom fields table above).

### Step 5: Prompt for optional labels

Present the 5 toggles. Default is none.

### Step 6: Full preview + confirmation

Print a complete preview and wait for confirmation (y/n).

### Step 7: Create issue (delegate to @explore)

Execute the gh pattern with finalized data.

### Step 8: Report

Print issue number and GitHub URL.

## From-spec decomposition workflow

### Step 1: Identify the plan file

If `$ARGUMENTS` specifies a path, use it. Otherwise:

```bash
ls -t docs/plans/*.md 2>/dev/null | head -1
```

If no plan files exist, stop. Read the plan file and confirm it follows
the `writing-plans` format (`### Task N:` headers).

### Step 2: Parse

Extract:
- **Plan title** — from the `# ` H1 header
- **Goal** — from the `**Goal:**` line
- **Tasks** — each `### Task N: <Title>` block with Files and Interfaces

### Step 3: Vertical-slice assertion

**Each `### Task N:` block MUST be a vertical slice** — a self-contained
change that produces working, testable software on its own. The skill
asserts:
- One issue per task (never one issue per file)
- Each task has its own test cycle and independently testable deliverable
- If a task spans many files (wide-refactor), still emit one issue per
  task and note the breadth in the issue body (see Wide-refactor path)

If a plan has horizontal decomposition (e.g., "Task 1: all models", "Task
2: all views"), warn the user and suggest re-slicing vertically before
proceeding.

### Step 3.5: ADR pre-check (architect-required)

If the spec — or a prior `@architect` review of it — carries an
`ADR-required:` line listing ADR numbers other than `none`, verify each
exists in `adr/` before slicing:

```bash
# Parse the ADR-required: line from the spec/review, then:
for n in 0021 0022; do
    ls adr/${n}-*.md 2>/dev/null \
        || echo "WARN: ADR ${n} listed as required but not found in adr/"
done
```

If any required ADR is missing, **WARN** the user and suggest writing it
(via `@architect` or the `adr` skill) before proceeding. This is
non-blocking — warn and continue, consistent with the non-critical-warn
pattern. If the spec has no `ADR-required:` line, skip this check silently.

### Step 4: Derive epic issue type

Apply the commit-type to issue-type mapping to the Goal text. Present the
derived `type(scope)` and allow override. All tasks inherit this type.

### Step 5: Prompt for custom fields (once, applied to all)

Same as single-issue Step 4. Values apply to epic + every task.

### Step 6: Prompt for optional labels (once, applied to all)

Same as single-issue Step 5. The mandatory `plan` label is always applied.

### Step 7: Blocking-edge preview (opt-in)

Present the parsed task list. Ask:

> Should any task be blocked by a prerequisite task? This wires GitHub's
> "blocked by" relationship. By default, no blocking edges are set —
> sequential tasks are not necessarily dependent.

Support explicit `Depends on: Task N` markers in the plan file. If
present, pre-wire those edges. Let the user confirm or adjust at this
preview step.

### Step 8: Full preview + confirmation

Print a complete preview with epic + all tasks + fields + labels + any
blocking edges. Wait for confirmation (y/n).

### Step 9: Create epic + task issues (delegate to @explore)

Execute the gh pattern for the epic, then for each task. Task title
format: `<type>(<scope>): <task title> task#N`.

### Step 10: Wire blocking edges

For each confirmed blocking relationship, execute:

```bash
# Pre-flight: verify gh supports --add-blocked-by (v2.94.0+)
gh --version

# Wire: task is blocked by prerequisite
gh issue edit <task_number> --repo "$REPO" --add-blocked-by <prereq_number>
```

If `gh --version` < 2.94.0, fall back to GraphQL:

```bash
# Get node IDs for both issues
TASK_NODE=$(gh api graphql -F owner="$OWNER" -F name="$NAME" -F num=<TASK_NUM> -f query='query($owner:String!,$name:String!,$num:Int!){ repository(owner: $owner, name: $name) { issue(number: $num) { id } } }' -q '.data.repository.issue.id')
PREREQ_NODE=$(gh api graphql -F owner="$OWNER" -F name="$NAME" -F num=<PREREQ_NUM> -f query='query($owner:String!,$name:String!,$num:Int!){ repository(owner: $owner, name: $name) { issue(number: $num) { id } } }' -q '.data.repository.issue.id')

# Wire via GraphQL
gh api graphql -F taskId="$TASK_NODE" -F prereqId="$PREREQ_NODE" -f query='mutation($taskId:ID!,$prereqId:ID!) { addBlockedBy(input: {issueId: $taskId, blockingIssueId: $prereqId}) { clientMutationId } }'
```

### Step 11: Report

Print a summary table with issue numbers, types, titles, URLs, and any
blocking edges wired.

## Wide-refactor path

When a plan task touches many files (e.g., a cross-cutting refactor), the
decomposition does NOT split horizontally into one-issue-per-file. Instead:
- Emit one vertical-slice issue per task (as-is)
- Note the breadth in the issue body: "This task touches N files across M
  directories"
- If the task is genuinely too large for one issue, suggest the user
  re-slice the plan into smaller vertical tasks before proceeding

## Cross-refs

- `/issue`, `/ticket` (singular aliases), `/issues`, `/tickets` (plural
  aliases) — thin command wrappers that load this skill
- `@architect` agent — emits the `ADR-required:` contract this step consumes
- `writing-plans` skill — produces the plan files this skill decomposes
- `docs/agents/labels.md` — label vocabulary
- ADR-0019 — original mapping decision (partially superseded by ADR-0020)
- ADR-0020 — unified command architecture
- `@explore` — delegated all gh CLI execution

## Rules

- Never hard-code the repo name. Always detect via `gh repo view`.
- Never create issues without user confirmation.
- Title must follow conventional commit format with parentheses for scope.
- Security-related descriptions must use `fix(security)`.
- Feature and Patch types prompt for all 5 custom fields; all other types
  prompt for 3 only.
- Exactly one Type and one Progress value per issue.
- If `gh auth status` fails, stop and instruct the user to authenticate.
- If issue creation fails, stop and report the error.
- If type or field setting fails after successful issue creation, warn the
  user but still report the issue URL.
- Label application failure is non-critical — warn and continue.
- All field IDs and type node IDs must be queried dynamically, never
  hard-coded.
- Never interpolate user content (issue titles, bodies, PR descriptions, label
  names) into shell command strings. Use a single-quoted heredoc
  (`<<'HEREDOC'`) to write payloads to temp files, read them into shell
  variables via `$(cat)`, and pass via `--title "$VAR"` / `--body-file FILE`.
  For GraphQL, always use `-F` variable bindings — never inline `<placeholder>`
  text inside a query string.
- No forced linear blocking edges — sequential tasks are not necessarily
  dependent.

## Gotchas

- `gh issue edit --add-blocked-by` requires gh v2.94.0+ (2026-06-10).
  Always pre-flight `gh --version` before attempting blocking-edge wiring.
- The `plan` label may not exist yet — create it idempotently before
  applying.
- Historical references to `/plan-to-issues` remain in ADR-0017 and
  ADR-0019 bodies (ADRs are immutable). ADR-0020 records the supersession.
