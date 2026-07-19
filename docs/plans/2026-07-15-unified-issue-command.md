# Unified Issue Command Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Unify `/issue`, `/plan-to-issues`, and a proposed `to-tickets` into one ticketing flow with four aliases, backed by a shared `ticketing` skill (single source of the mapping/fields/labels/gh-pattern), with from-spec vertical-slice decomposition and native blocking edges.

**Architecture:** One new skill (`.opencode/skills/ticketing/SKILL.md`) holds all shared mechanics + the unified workflow. Four command wrappers split into two semantic pairs: singular (`/issue`, `/ticket`) default to single-issue creation with from-spec auto-detection; plural (`/issues`, `/tickets`) default to from-spec decomposition. `/plan-to-issues` is hard-deleted. ADR-0020 partially supersedes ADR-0019. All commands run in Plan context (delegate `gh` to `@explore`).

**Tech Stack:** OpenCode harness (Markdown commands + skill), Pest PHP v4 harness test, GitHub `gh` CLI v2.94.0+ (`--add-blocked-by`).

**Source:** Issue #135 (parent epic #127). Issue body is the spec.

## Global constraints

- Skill `name` must equal dir name (`ticketing`); `description` starts with "Use when"
- Markdown files (`.md`) are exempt from RCS headers and vim modelines (per rcs-header skill)
- New test file (`UnifiedIssueCommandTest.php`) requires RCS header + `declare(strict_types=1)` + vim modeline
- ADRs are immutable once accepted — only ADR-0019's **status line** may be updated; bodies of ADR-0017 and ADR-0019 retain historical `/plan-to-issues` references (correct ADR practice)
- `gh --version` ≥ 2.94.0 required for `--add-blocked-by` (GraphQL `addBlockedBy` fallback otherwise)
- Conventional Commits + footers: `Plan-by: glm-5.2`, `Acked-by: deepseek-v4-pro`, `Signed-off-by: kyau <git@kyaulabs.com>`, `Refs: #135` (no auto-closure — user closes after `/check` + `@code-review`)
- No `agent:` field in command frontmatter → runs in Plan context, delegates `gh` to `@explore` (ADR-0019 D2)

## File structure

| File | Action | Responsibility |
|---|---|---|
| `tests/Unit/Harness/UnifiedIssueCommandTest.php` | **Create** | Contract test — validates all files exist, parity with table rows, ADR status |
| `.opencode/skills/ticketing/SKILL.md` | **Create** | Single source: mapping, fields, labels, repo detection, gh pattern, single + from-spec workflows, vertical-slice assertion, blocking edges, wide-refactor path |
| `.opencode/commands/issue.md` | **Modify** | Singular wrapper — single-mode default, from-spec auto-detect |
| `.opencode/commands/ticket.md` | **Create** | Singular alias wrapper |
| `.opencode/commands/issues.md` | **Create** | Plural wrapper — from-spec decomposition only |
| `.opencode/commands/tickets.md` | **Create** | Plural alias wrapper |
| `.opencode/commands/plan-to-issues.md` | **Delete** | Hard-deleted (superseded by `/issues` from-spec mode) |
| `adr/0020-unified-issue-command-architecture.md` | **Create** | Partially supersedes ADR-0019 (mapping-source + command-consolidation clauses) |
| `adr/0019-issue-command-conventional-commit-mapping.md` | **Status-only edit** | Status line → `Accepted (partially superseded by ADR-0020 — mapping-source and command-consolidation clauses)`. Body immutable. |
| `CONTEXT.md` | **Modify** | Add ADR-0019 + ADR-0020 entries to Architectural Decisions list |
| `AGENTS.md` | **Modify** | Commands: remove `/plan-to-issues` row, add `/ticket`+`/issues`+`/tickets` rows, update `/issue` row; Skills Available: add `ticketing` row |
| `README.md` | **Modify** | Slash commands: remove `/plan-to-issues`, add 3 aliases, update `/issue`; Skills (on-demand): add `ticketing` to Engineering pipeline category |

**Files NOT touched (intentional):**
- `adr/0017-command-only-template-features.md:25` — immutable ADR body, retains historical reference
- `adr/0019-...md:57` — immutable ADR body, retains historical bullet
- `docs/specs/2026-07-14-work-issue-command-spec.md:16` — historical record
- `docs/plans/2026-07-14-work-issue-command.md:51` — historical record
- `aurora/AGENTS.md:245` + `aurora/CODING_HARNESS.md:114` — submodule (companion issue)

---

### Task 1: Failing harness test (RED)

**Files:**
- Create: `tests/Unit/Harness/UnifiedIssueCommandTest.php`

**Interfaces:**
- Consumes: filesystem (reads `.opencode/commands/*.md`, `.opencode/skills/ticketing/SKILL.md`, `adr/*.md`, `AGENTS.md`, `README.md`, `CONTEXT.md`)
- Produces: the contract that Task 2 satisfies — all assertions in this test define the acceptance criteria for the unified command structure

- [ ] **Step 1: Write the failing test**

Create `tests/Unit/Harness/UnifiedIssueCommandTest.php`:

```php
<?php

declare(strict_types=1);

# $KYAULabs: UnifiedIssueCommandTest.php kyau@nova 2026/07/15 -0700 Exp $

test('ticketing skill exists with correct frontmatter', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $skillPath = $repoRoot . '/.opencode/skills/ticketing/SKILL.md';

    expect(file_exists($skillPath))->toBeTrue(
        'Expected ticketing skill at .opencode/skills/ticketing/SKILL.md'
    );

    $content = file_get_contents($skillPath);

    expect($content)->toContain('name: ticketing');
    expect($content)->toContain('description: Use when');
});

test('four unified command aliases exist and reference the ticketing skill', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $commandsDir = $repoRoot . '/.opencode/commands';

    foreach (['issue.md', 'ticket.md', 'issues.md', 'tickets.md'] as $alias) {
        $path = $commandsDir . '/' . $alias;

        expect(file_exists($path))->toBeTrue(
            "Expected command file .opencode/commands/{$alias}"
        );

        $content = file_get_contents($path);
        expect($content)->toContain('ticketing');
        expect($content)->toContain('$ARGUMENTS');
    }
});

test('singular commands reference single-issue mode', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $commandsDir = $repoRoot . '/.opencode/commands';

    foreach (['issue.md', 'ticket.md'] as $alias) {
        $content = file_get_contents($commandsDir . '/' . $alias);

        expect($content)->toContain('Single');
    }
});

test('plural commands reference from-spec decomposition mode', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $commandsDir = $repoRoot . '/.opencode/commands';

    foreach (['issues.md', 'tickets.md'] as $alias) {
        $content = file_get_contents($commandsDir . '/' . $alias);

        expect($content)->toContain('From-spec');
    }
});

test('plan-to-issues command has been hard-deleted', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $path = $repoRoot . '/.opencode/commands/plan-to-issues.md';

    expect(file_exists($path))->toBeFalse(
        '/plan-to-issues should be hard-deleted — file still exists'
    );
});

test('ADR-0020 exists and partially supersedes ADR-0019', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $adrDir = $repoRoot . '/adr';

    $adr020Files = glob($adrDir . '/0020-*.md');

    expect($adr020Files)->not->toBeEmpty(
        'Expected ADR-0020 file in adr/'
    );

    $content = file_get_contents($adr020Files[0]);

    expect($content)->toContain('Partially supersedes ADR-0019');
    expect($content)->toContain('## Status');
    expect($content)->toContain('Accepted');
});

test('ADR-0019 status reflects partial supersession', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $adrDir = $repoRoot . '/adr';

    $adr019Files = glob($adrDir . '/0019-*.md');

    expect($adr019Files)->not->toBeEmpty();

    $content = file_get_contents($adr019Files[0]);

    expect($content)->toContain('partially superseded by ADR-0020');
});

test('AGENTS.md commands and skills tables reflect unified structure', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $content = file_get_contents($repoRoot . '/AGENTS.md');

    // New aliases present in Commands table
    expect($content)->toContain('`/ticket`');
    expect($content)->toContain('`/issues`');
    expect($content)->toContain('`/tickets`');

    // /plan-to-issues row removed from Commands table (check for table row pattern)
    expect(preg_match('/^\| `\/plan-to-issues` \|/m', $content))->toBe(0);

    // ticketing skill present in Skills Available
    expect($content)->toContain('`ticketing`');
});

test('README.md commands and skills tables reflect unified structure', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $content = file_get_contents($repoRoot . '/README.md');

    expect($content)->toContain('`/ticket`');
    expect($content)->toContain('`/issues`');
    expect($content)->toContain('`/tickets`');
    expect(preg_match('/^\| `\/plan-to-issues` \|/m', $content))->toBe(0);
    expect($content)->toContain('ticketing');
});

test('CONTEXT.md lists ADR-0019 and ADR-0020', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $content = file_get_contents($repoRoot . '/CONTEXT.md');

    expect($content)->toContain('0019');
    expect($content)->toContain('0020');
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/UnifiedIssueCommandTest.php`
Expected: FAIL — skill absent, alias commands absent, ADR-0020 absent, ADR-0019 status unchanged

- [ ] **Step 3: Commit (RED)**

```bash
git add tests/Unit/Harness/UnifiedIssueCommandTest.php
git commit -S -m "test(harness): add failing unified-issue-command harness test

Red phase for issue #135 — asserts the unified /issue command contract:
ticketing skill (name + Use-when description), four alias command files
(issue/ticket/issues/tickets) with singular/plural semantic split,
plan-to-issues hard-deleted, ADR-0020 partially superseding 0019,
ADR-0019 status updated, and AGENTS.md + README.md + CONTEXT.md table
rows updated.

Refs: #135
Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 2: Create skill + unified commands + delete + ADR + tables (GREEN)

> One atomic GREEN commit because the test asserts parity across all files — partial implementation leaves the repo in an inconsistent state.

**Files:**
- Create: `.opencode/skills/ticketing/SKILL.md`
- Modify: `.opencode/commands/issue.md`
- Create: `.opencode/commands/ticket.md`
- Create: `.opencode/commands/issues.md`
- Create: `.opencode/commands/tickets.md`
- Delete: `.opencode/commands/plan-to-issues.md`
- Create: `adr/0020-unified-issue-command-architecture.md`
- Modify: `adr/0019-issue-command-conventional-commit-mapping.md` (status line only)
- Modify: `CONTEXT.md`
- Modify: `AGENTS.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: ADR-0019 (amended by ADR-0020), existing `/issue` + `/plan-to-issues` workflows (consolidated into the skill)
- Produces: the `ticketing` skill (single source of truth), four command wrappers, ADR-0020, updated tables

- [ ] **Step 1: Create `.opencode/skills/ticketing/SKILL.md`**

Create with this exact frontmatter and body structure:

````markdown
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
gh issue create --repo "$REPO" --title "<title>" --body "<body>"

# 3. Get the issue's GraphQL node ID
gh api graphql -f query='{ repository(owner: "$OWNER", name: "$NAME") { issue(number: <N>) { id } } }'

# 4. Set the issue type via GraphQL mutation
gh api graphql -f query='mutation { updateIssue(input: { id: "<NODE_ID>", issueTypeId: "<TYPE_NODE_ID>" }) { issue { number issueType { name } } } }'

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
TASK_NODE=$(gh api graphql -f query='{ repository(owner: "$OWNER", name: "$NAME") { issue(number: <TASK_NUM>) { id } } }' -q '.data.repository.issue.id')
PREREQ_NODE=$(gh api graphql -f query='{ repository(owner: "$OWNER", name: "$NAME") { issue(number: <PREREQ_NUM>) { id } } }' -q '.data.repository.issue.id')

# Wire via GraphQL
gh api graphql -f query='mutation { addBlockedBy(input: {issueId: "$TASK_NODE", blockingIssueId: "$PREREQ_NODE"}) { clientMutationId } }'
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
- No forced linear blocking edges — sequential tasks are not necessarily
  dependent.

## Gotchas

- `gh issue edit --add-blocked-by` requires gh v2.94.0+ (2026-06-10).
  Always pre-flight `gh --version` before attempting blocking-edge wiring.
- The `plan` label may not exist yet — create it idempotently before
  applying.
- Historical references to `/plan-to-issues` remain in ADR-0017 and
  ADR-0019 bodies (ADRs are immutable). ADR-0020 records the supersession.
````

- [ ] **Step 2: Rewrite `.opencode/commands/issue.md`**

Replace the entire file with:

```markdown
---
description: Create a single issue, or decompose a plan/spec into an epic with vertical-slice tasks. Auto-detects mode from the argument. Aliases: /ticket (singular), /issues, /tickets (plural = from-spec only).
---

Load the `ticketing` skill and execute its unified ticketing workflow.

**Mode auto-detection:** If `$ARGUMENTS` is empty or free text, run the
**Single-issue workflow** (describe, generate title/body, set
type/fields/labels, create). If `$ARGUMENTS` is a `docs/plans/` or
`docs/specs/` file path, auto-detect and run the **From-spec decomposition
workflow** (parse, epic + vertical-slice tasks + blocking edges, create).

Arguments: $ARGUMENTS
```

- [ ] **Step 3: Create `.opencode/commands/ticket.md`**

```markdown
---
description: Alias of /issue — create a single issue, or decompose a plan/spec into an epic with vertical-slice tasks. Auto-detects mode from the argument.
---

Load the `ticketing` skill and execute its unified ticketing workflow.

**Mode auto-detection:** If `$ARGUMENTS` is empty or free text, run the
**Single-issue workflow**. If `$ARGUMENTS` is a `docs/plans/` or
`docs/specs/` file path, auto-detect and run the **From-spec decomposition
workflow**.

Arguments: $ARGUMENTS
```

- [ ] **Step 4: Create `.opencode/commands/issues.md`**

```markdown
---
description: Decompose a plan or spec into a GitHub epic with vertical-slice task issues and native blocking edges. Alias of /tickets. For single-issue creation, use /issue or /ticket.
---

Load the `ticketing` skill and execute its **From-spec decomposition
workflow**: create an epic with vertical-slice task issues, set issue
types and custom fields, apply labels, and wire native blocking edges via
`gh issue edit --add-blocked-by`.

If `$ARGUMENTS` specifies a `docs/plans/` or `docs/specs/` file path, use
it. If empty, prompt for a plan/spec file or auto-pick the most recent in
`docs/plans/`.

Arguments: $ARGUMENTS
```

- [ ] **Step 5: Create `.opencode/commands/tickets.md`**

```markdown
---
description: Alias of /issues — decompose a plan or spec into a GitHub epic with vertical-slice task issues and native blocking edges.
---

Load the `ticketing` skill and execute its **From-spec decomposition
workflow**: create an epic with vertical-slice task issues, set issue
types and custom fields, apply labels, and wire native blocking edges via
`gh issue edit --add-blocked-by`.

If `$ARGUMENTS` specifies a `docs/plans/` or `docs/specs/` file path, use
it. If empty, prompt for a plan/spec file or auto-pick the most recent in
`docs/plans/`.

Arguments: $ARGUMENTS
```

- [ ] **Step 6: Delete `.opencode/commands/plan-to-issues.md`**

```bash
git rm .opencode/commands/plan-to-issues.md
```

- [ ] **Step 7: Create `adr/0020-unified-issue-command-architecture.md`**

```markdown
# 0020. Unified Issue Command Architecture

Date: 2026-07-15

## Status

Accepted

Partially supersedes ADR-0019 (mapping-source and command-consolidation
clauses). ADR-0019's core decisions — commit-type to issue-type mapping
semantics, two-phase Plan + @explore architecture, dynamic repo detection
— remain intact.

## Context

ADR-0019 established the commit-type to issue-type mapping and the two-phase
architecture for the `/issue` command. The `/plan-to-issues` command
subsequently duplicated the same mapping table, custom-field definitions,
optional labels, and dynamic-repo-detection discipline. This duplication
creates a maintenance burden: any change to the mapping must be applied in
two places.

Additionally, the mattpocock #513 vertical-slicing principle is not
enforced by `/plan-to-issues` — it decomposes plan tasks into issues but
does not assert that each task is a vertical slice. Plans with horizontal
decomposition (e.g., "Task 1: all models", "Task 2: all views") would
produce issues that cannot be independently tested.

GitHub CLI v2.94.0 (2026-06-10) introduced native blocking-edge support
(`gh issue edit --add-blocked-by`), enabling dependency wiring without
GraphQL mutations. No harness command leverages this capability.

## Decision

1. **Single source of truth**: The `ticketing` skill
   (`.opencode/skills/ticketing/SKILL.md`) holds the mapping table,
   custom-field definitions, optional labels, dynamic-repo-detection
   pattern, and the gh create-to-type-to-fields-to-labels pattern. This
   replaces the duplicated tables in `/issue` and `/plan-to-issues`.

2. **Four unified aliases with semantic split**: One unified command flow
   with four aliases:
   - Singular (`/issue`, `/ticket`): default to single-issue creation;
     auto-detect from-spec mode if given a plan/spec path
   - Plural (`/issues`, `/tickets`): from-spec decomposition only; signal
     "create multiple issues" intent through command choice

3. **Plan context**: Commands have no `agent:` frontmatter field, so they
   run in Plan context and delegate all `gh` execution to `@explore`
   (consistent with ADR-0019 D2's two-phase model).

4. **Vertical-slice assertion**: The from-spec workflow asserts that each
   `### Task N:` block in a plan is a vertical slice — self-contained,
   independently testable. Horizontal decomposition triggers a warning.

5. **Native blocking edges (opt-in)**: The from-spec workflow supports
   explicit `Depends on: Task N` markers in plan files and user-confirmed
   edges at the preview step. Edges are wired via
   `gh issue edit --add-blocked-by` (gh v2.94.0+), with GraphQL
   `addBlockedBy` as fallback. No forced linear blocking — sequential
   tasks are not necessarily dependent.

6. **Wide-refactor path**: When a task spans many files, still emit one
   vertical-slice issue per task and note the breadth in the issue body.
   Do not split horizontally.

7. **Supersession of /plan-to-issues**: The command is hard-deleted. Its
   functionality is absorbed by the `/issues` and `/tickets` aliases
   (from-spec mode).

## Consequences

- The mapping table lives in one place (the `ticketing` skill), reducing
  drift risk.
- The `/plan-to-issues` command is removed. Historical references to it
  remain in ADR-0017 and ADR-0019 bodies (ADRs are immutable).
- `gh` v2.94.0+ is required for native blocking edges. Earlier versions
  fall back to GraphQL.
- The `@explore` agent is used for write operations (issue creation),
  which is outside its documented "read-only" purpose. This item from
  ADR-0019 remains an open concern.
- The `ticketing` skill is the canonical reference for issue-creation
  mechanics. Future commands or agents that create issues should consume
  this skill rather than re-implementing the mapping.

## Alternatives Considered

- **Keep three separate commands**: Rejected — the duplicated mapping
  table creates maintenance burden and drift risk.
- **Force linear blocking edges (task N blocks N+1)**: Rejected —
  sequential tasks are not necessarily dependent. Forced edges would
  produce incorrect dependency graphs.
- **Deprecation stub instead of hard-delete**: Rejected by the user — the
  command is fully replaced by `/issues` from-spec mode.
- **Add `agent: build` to the unified commands**: Rejected — would
  diverge from ADR-0019 D2's two-phase model. Plan context with @explore
  delegation is consistent.
```

- [ ] **Step 8: Update ADR-0019 status line**

In `adr/0019-issue-command-conventional-commit-mapping.md`, change ONLY the status section from `## Status\n\nAccepted` to:

```markdown
## Status

Accepted (partially superseded by ADR-0020 — mapping-source and command-consolidation clauses)
```

Do NOT edit any other line in the file.

- [ ] **Step 9: Update `CONTEXT.md`**

Add these two lines to the Architectural Decisions list (after the ADR-0018 line):

```markdown
- `adr/0019-issue-command-conventional-commit-mapping.md` — Auto-derive org-level issue types from conventional commit types; two-phase Plan + @explore architecture for gh CLI execution
- `adr/0020-unified-issue-command-architecture.md` — Unify /issue + /plan-to-issues into four aliases backed by a shared ticketing skill; vertical-slice decomposition with native blocking edges
```

- [ ] **Step 10: Update `AGENTS.md` Commands table**

Replace the `/plan-to-issues` and `/issue` rows with:

```markdown
| `/issue` | Create a single issue, or decompose a plan/spec into an epic with vertical-slice tasks. Auto-detects mode from the argument. Aliases: `/ticket` (singular), `/issues`, `/tickets` (plural = from-spec only) |
| `/ticket` | Alias of `/issue` — create a single issue, or decompose a plan/spec (singular mode) |
| `/issues` | Decompose a plan or spec into a GitHub epic with vertical-slice task issues and native blocking edges. Alias: `/tickets` |
| `/tickets` | Alias of `/issues` — from-spec decomposition into epic + vertical-slice tasks |
```

Remove the `/plan-to-issues` row entirely.

- [ ] **Step 11: Update `AGENTS.md` Skills Available table**

Add this row (after the `executing-plans` row):

```markdown
| `ticketing` | Creating a GitHub issue/ticket or decomposing a plan or spec into an epic with vertical-slice task sub-issues — single source of the commit-type→issue-type mapping, custom fields, labels, gh pattern, mode auto-detection, vertical-slice decomposition with native blocking edges |
```

- [ ] **Step 12: Update `README.md` Slash commands table**

Replace the `/plan-to-issues` and `/issue` rows with:

```markdown
| `/issue` | Create a single issue, or decompose a plan/spec into an epic with vertical-slice tasks |
| `/ticket` | Alias of `/issue` (singular mode) |
| `/issues` | Decompose a plan or spec into a GitHub epic with vertical-slice task issues and native blocking edges |
| `/tickets` | Alias of `/issues` (from-spec decomposition) |
```

Remove the `/plan-to-issues` row entirely.

- [ ] **Step 13: Update `README.md` Skills (on-demand) table**

In the "Engineering pipeline" category row, add `ticketing` after `executing-plans`:

```markdown
| Engineering pipeline | `brainstorming`, `grilling`, `prototype`, `to-spec`, `writing-plans`, `executing-plans`, `ticketing`, `verification-before-completion` |
```

- [ ] **Step 14: Run test to verify GREEN**

Run: `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/UnifiedIssueCommandTest.php`
Expected: PASS — all 10 tests green

- [ ] **Step 15: Commit (GREEN)**

```bash
git add .opencode/skills/ticketing/SKILL.md .opencode/commands/issue.md .opencode/commands/ticket.md .opencode/commands/issues.md .opencode/commands/tickets.md .opencode/commands/plan-to-issues.md adr/0020-unified-issue-command-architecture.md adr/0019-issue-command-conventional-commit-mapping.md CONTEXT.md AGENTS.md README.md
git commit -S -m "feat(harness): unify /issue + /plan-to-issues into ticketing skill

Green phase for issue #135 — the ticketing skill becomes the single source
of the commit-type-to-issue-type mapping, custom fields, optional labels,
dynamic repo detection, and the gh create-to-type-to-fields-to-labels
pattern. Four command aliases with semantic split: singular (/issue,
/ticket) default to single-issue creation with from-spec auto-detection;
plural (/issues, /tickets) default to from-spec decomposition with
vertical-slice assertion and opt-in blocking edges via 'gh issue edit
--add-blocked-by' (gh v2.94.0+). /plan-to-issues is hard-deleted.
ADR-0020 partially supersedes ADR-0019. CONTEXT.md ADR list gap fixed.

Refs: #135
Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 3: Verify + smoke (REFACTOR)

- [ ] **Step 1: Full test sweep**

Run: `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness`
Expected: PASS — all harness tests green (ArchTest, RcsHeaderConventionTest, UnifiedIssueCommandTest)

- [ ] **Step 2: writing-skills quality checklist**

Verify against `.opencode/skills/ticketing/SKILL.md` + four command files:
- Skill `name` matches directory name
- `description` starts with "Use when"
- No AGENTS.md duplication (skill doesn't copy table content that AGENTS.md already has)
- Cross-refs by name (not path)
- `## Gotchas` section present
- Command descriptions are one-liner summaries

- [ ] **Step 3: Manual smoke (no GitHub writes)**

Invoke `/issue` with no args → confirm single-mode prompt. Invoke `/issues` with a plan path → confirm from-spec decomposition. Confirm gate blocks before any `gh` write.

- [ ] **Step 4: Commit only if quality checklist found issues**

If fixes were needed:
```bash
git commit -S -m "refactor(harness): tighten ticketing skill quality

Refs: #135
Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```
Otherwise skip.

- [ ] **Step 5: Create companion issue for aurora submodule**

Note that `aurora/AGENTS.md:245` and `aurora/CODING_HARNESS.md:114` reference the deleted `/plan-to-issues` command.

- [ ] **Step 6: Do not close #135** — leave for user after `/check` + `@code-review`
