---
name: ticketing
description: Use when creating a GitHub issue/ticket or decomposing a plan or spec into an epic with vertical-slice task sub-issues. Provides the single source of truth for the commit-type to issue-type mapping, custom fields, optional labels, dynamic repo detection, the gh create-to-type-to-fields-to-labels pattern, mode auto-detection (single vs from-spec), vertical-slice decomposition with native blocking edges, and the wide-refactor path.
---

# Ticketing

Unified issue/ticket creation for the KYAULabs harness. This skill is the
single source of truth for all shared mechanics. Commands (`/issue`,
`/ticket`, `/issues`, `/tickets`) are thin wrappers that load this skill
and pass `$ARGUMENTS`.

## Execution topology

This is a single-agent workflow. Before any GitHub operation, load the
`tracker-operator` skill and follow its least-privilege and untrusted-content
rules. Run read-only `gh` steps directly.
The full-preview confirmation authorizes the complete mutation batch.
After confirmation, execute every issue, epic, task, type, field, label,
sub-issue, and blocking-edge operation in that displayed batch without
per-command approval.

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

## Pre-flight (load `tracker-operator`)

After loading `tracker-operator`, run:

```bash
gh auth status
gh repo view --json nameWithOwner -q .nameWithOwner
gh repo view --json owner -q .owner.login
gh repo view --json name -q .name
```

Validate and retain the three repository outputs as inert `REPO`, `OWNER`, and
`NAME` context. Render their literal values in the remaining pre-flight calls:

```bash
gh api "orgs/OWNER/issue-types"
gh api "orgs/OWNER/issue-fields"
gh label list --repo OWNER/REPO --json name
```

Cache the returned issue type node IDs, field IDs + options, and label names.
If `gh auth status` fails, stop and tell the user to run `gh auth login`.

## GraphQL issue mutation pattern

Follow `tracker-operator`'s project-local JSON-envelope transport. Use Pi's
write tool to create `.pi/tmp/tracker-create-issue.json` with the finalized
trusted control values and confirmed untrusted tracker payload as JSON data:

```json
{
  "query": "mutation CreateIssue($input: CreateIssueInput!) { createIssue(input: $input) { issue { id number url } } }",
  "variables": {
    "input": {
      "repositoryId": "REPOSITORY_NODE_ID",
      "title": "CONFIRMED_TITLE",
      "body": "CONFIRMED_BODY",
      "issueTypeId": "ISSUE_TYPE_NODE_ID",
      "labelIds": ["LABEL_NODE_ID"],
      "assigneeIds": ["ACTOR_NODE_ID"],
      "parentIssueId": "PARENT_ISSUE_NODE_ID",
      "issueFields": [
        {"fieldId": "PRIORITY_FIELD_NODE_ID", "singleSelectOptionId": "PRIORITY_OPTION_NODE_ID"},
        {"fieldId": "EFFORT_FIELD_NODE_ID", "singleSelectOptionId": "EFFORT_OPTION_NODE_ID"},
        {"fieldId": "PROGRESS_FIELD_NODE_ID", "singleSelectOptionId": "PROGRESS_OPTION_NODE_ID"}
      ]
    }
  }
}
```

Omit optional properties that do not apply; never populate them with invented
IDs. Every node ID comes from the read-only pre-flight. The `issueFields`
entries use the discovered field and option node IDs required by
`IssueFieldCreateOrUpdateInput`, so type, fields, labels, assignees, and parent
metadata are created atomically where supported.

<!-- tracker-graphql:start -->
```bash
gh api graphql --input .pi/tmp/tracker-create-issue.json
```
<!-- tracker-graphql:end -->

For an existing issue, use Pi's write tool to create a separate literal input
file containing `updateIssue`:

```json
{
  "query": "mutation UpdateIssue($input: UpdateIssueInput!) { updateIssue(input: $input) { issue { id number url } } }",
  "variables": {
    "input": {
      "id": "ISSUE_NODE_ID",
      "issueTypeId": "ISSUE_TYPE_NODE_ID",
      "labelIds": ["LABEL_NODE_ID"],
      "issueFieldUpdates": [
        {"fieldName": "Progress", "operation": "SET", "value": "In Progress"}
      ]
    }
  }
}
```

Existing-issue field updates use exact discovered field names and string option
names. Do not send numeric option database IDs in the string-valued `value`
property. Use dedicated tracker-operator envelopes for `addComment`,
`closeIssue`, `addAssigneesToAssignable`, `addLabelsToLabelable`, `addSubIssue`,
and `addBlockedBy`.

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

Print a complete preview and wait for confirmation (y/n). This single
confirmation authorizes the full displayed mutation batch.

### Step 7: Create issue (using `tracker-operator`)

Execute the GraphQL issue mutation pattern with finalized data without another
mutation prompt.

### Step 8: Report

Print issue number and GitHub URL.

## From-spec decomposition workflow

### Step 1: Identify the plan file

If `$ARGUMENTS` specifies a path, use it. Otherwise:

```text
Use the glob tool to list `docs/plans/*.md` and read the most recent plan
file. If none exist, stop.
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

If the spec — or a prior `architect` review of it — carries an
`ADR-required:` line listing ADR numbers other than `none`, verify each
exists in `adr/` before slicing:

```text
For each required ADR number N, use the glob tool to check `adr/NNNN-*.md`
exists; report any missing as "WARN: ADR NNNN listed as required but not
found in adr/".
```

If any required ADR is missing, **WARN** the user and suggest writing it
(via `architect` or the `adr` skill) before proceeding. This is
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
blocking edges. Wait for confirmation (y/n). This single confirmation
authorizes the epic and every displayed task, relationship, field, label, and
blocking edge.

### Step 9: Create epic + task issues (using `tracker-operator`)

Execute the GraphQL issue mutation pattern for the epic, then for each task
without further mutation approval. Set each task's `parentIssueId` during
`createIssue`. Task title format: `<type>(<scope>): <task title> task#N`.

### Step 10: Wire blocking edges

For each confirmed blocking relationship, discover the task and prerequisite
node IDs, write an inert JSON envelope with Pi's write tool, and invoke the
canonical literal-path transport. The mutation is:

```json
{
  "query": "mutation AddBlockedBy($input: AddBlockedByInput!) { addBlockedBy(input: $input) { clientMutationId } }",
  "variables": {
    "input": {
      "issueId": "TASK_NODE_ID",
      "blockingIssueId": "PREREQUISITE_NODE_ID"
    }
  }
}
```

<!-- tracker-graphql:start -->
```bash
gh api graphql --input .pi/tmp/tracker-add-blocked-by.json
```
<!-- tracker-graphql:end -->

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
- `architect` skill — emits the `ADR-required:` contract this step consumes
- `writing-plans` skill — produces the plan files this skill decomposes
- `docs/agents/labels.md` — label vocabulary
- ADR-0019 — original mapping decision (partially superseded by ADR-0020)
- ADR-0020 — unified command architecture
- `tracker-operator` skill — least-privilege protocol and workflow-scoped
  authorization for all gh CLI execution
- ADR-0085 — one preview confirmation authorizes the complete tracker mutation
  batch
- ADR-0086 — standing read authorization and GraphQL-first tracker transport

## Rules

- Never hard-code the repo name. Always detect via `gh repo view`.
- Never create issues without the workflow's full-preview confirmation.
- After that confirmation, never ask for per-command approval inside the
  displayed mutation batch.
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
  names) into shell command strings. Serialize it with Pi's write tool as JSON
  data under project-local `.pi/tmp/`, then invoke GraphQL with a literal input
  path in a separate command.
- No forced linear blocking edges — sequential tasks are not necessarily
  dependent.

## Gotchas

- Blocking edges use the GraphQL `addBlockedBy` mutation directly; do not
  introduce a version-dependent convenience-command first attempt.
- The `plan` label may not exist yet — create it idempotently before
  applying.
- Historical references to `/plan-to-issues` remain in ADR-0017 and
  ADR-0019 bodies (ADRs are immutable). ADR-0020 records the supersession.
