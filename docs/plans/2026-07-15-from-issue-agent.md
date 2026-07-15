# @from-issue On-Ramp Subagent Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Add the `@from-issue` subagent — the single on-ramp for working an
existing GitHub issue. It triages (fetch, classify Type, grill one-at-a-time,
apply one Type + one Progress value + a triage meta label, route) and, for
issues that warrant implementation, analyzes the codebase, writes an
implementation plan, halts for approval, and dispatches `@tdd`. It consolidates
and replaces the former `/work-issue` command.

**Architecture:** A single Markdown agent definition
(`.opencode/agents/from-issue.md`) modelled on `@consult`'s frontmatter shape
but operating as a **scoped orchestrator** at the **PLANNER** tier (same model
as the `plan` agent — analysis/logic/plan-writing work). It dispatches
`@explore` (analysis), `@architect` (validation), and `@tdd` (execution);
**recommends** `@debug` for bugs (build-mode only — not dispatched); writes
specs (`docs/specs/*`) and plans (`docs/plans/*`); creates the feature branch;
and gates execution on explicit user approval. Registered in `opencode.jsonc`,
indexed in `AGENTS.md` + `README.md`, with two triage meta labels documented in
`docs/agents/labels.md`. TDD seam = a dedicated harness test
(`tests/Unit/Harness/FromIssueAgentTest.php`) asserting the agent's frontmatter
contract, PLANNER-tier wiring, dispatch allowlist, and table presence. The
existing `validate-harness.sh` (file↔table cross-check) and `ModelConfigTest.php`
(agent sweep) enforce the rest automatically.

**Tech Stack:** OpenCode harness (Markdown agent + JSONC config), Pest v4
harness tests, Bash `validate-harness.sh`, GitHub `gh` CLI + GraphQL/REST.

**Source:** Issue #134 (parent epic #127 — Harness Process Upgrade). The issue
body (Summary / Location / Why / Acceptance Criteria) is the spec. This plan
also encodes two user decisions made during review: (1) consolidate `/work-issue`
into `@from-issue` (single on-ramp), and (2) run `@from-issue` on the PLANNER
model like `@plan`.

## Decision points (baked in — override at the approval gate)

These design decisions are not fully specified by the issue and have no existing
convention. The recommended answers below are embedded in the plan. **Flag any
you want changed when reviewing.**

- **D1 — "Type + Status" semantics.** Issue #134 says "applies exactly one Type
  + one Status label" and references states `needs-info` / `ready-for-agent`.
  These do NOT match the four native **Progress** field values.
  **Recommendation:** Type = native issue-type **field** (applied via GraphQL
  `updateIssue`, per the `/issue` command); "Status" = native **Progress field**
  value (exactly one of Under Construction / In Progress / Testing / Complete);
  `needs-info` and `ready-for-agent` are NEW flat **meta labels** added to
  `docs/agents/labels.md`. Preserves the two-axis invariant in `labels.md`.
  *Alternative rejected:* treat them as Progress values — Progress is a fixed
  GitHub single-select and these are triage signals, not lifecycle stages.
- **D2 — AI-disclaimer format.** No convention exists in the repo.
  **Recommendation:** a fixed disclaimer block appended to EVERY comment
  `@from-issue` posts (defined inline in the agent body). Promote to a shared
  doc later only if another agent starts posting comments. *Alternative
  rejected:* build a shared convention doc now — scope creep.
- **D3 — routing mechanism (dispatch vs recommend).** **Recommendation:**
  `@from-issue` **dispatches** `@explore` (analysis), `@architect` (validation
  when non-trivial), and `@tdd` (post-approval execution); it **recommends**
  `@debug` for bugs (build-mode only — cannot be dispatched from a subagent
  context) and loads `to-spec` / `writing-plans` / `brainstorming` / `prototype`
  in-context (skills, not agents). Therefore `task: allow` for
  explore/architect/tdd. This consolidates the former `/work-issue` execution
  behavior into the agent. *Alternative rejected:* `task: deny` with pure
  recommendation — defeats the single-on-ramp goal (user would still hand-run
  every stage).
- **D4 — model tier.** **Recommendation:** PLANNER tier
  (`OPENCODE_MODEL_PLANNER` / `OPENCODE_VARIANT_PLANNER`, `temperature: 0.1`) —
  the same model as the `plan` agent, since `@from-issue` is analysis / triage /
  plan-writing work. *Alternative rejected:* PRIMARY tier (deepseek-v4-pro) —
  heavier than the triage/planning task warrants; the planner model is the
  reasoning-optimized fit.
- **D5 — consolidate `/work-issue`.** **Recommendation:** remove the
  `/work-issue` command entirely; its analyze → plan → halt → execute workflow
  is absorbed into `@from-issue` steps 7-10. One entry point for "work an
  existing issue." *Alternative rejected:* keep both — two `#NN` on-ramps with
  overlapping fetch/classify/route logic is redundant (raised and resolved in
  review).

## Global constraints

- Agent frontmatter must pass `validate-harness.sh`: `mode` present (must be
  `subagent` — the only valid value in this harness); bash patterns use the
  **space-less prefix** form (`"gh issue view*"`, NOT `"gh issue view *"`); no
  bare `"git status"` (use `"git status*"`); `git add*` / `git stage*` verdicts
  must match where both present (we set both to `ask`).
- Agent `.md` must pass `ModelConfigTest.php`: literal numeric `temperature`
  present; any `model`/`variant` uses `{env:VAR}` (we put model/variant in
  `opencode.jsonc`, not the `.md`, matching `consult`/`debug`/etc.).
- The agent description must NOT contain read-only keywords
  (`read-only`, `does not modify`, `makes no code changes`, etc.) —
  `validate-harness.sh` enforces `edit: deny` + bash catch-all deny on any agent
  that claims read-only. `@from-issue` writes specs/plans and dispatches `@tdd`,
  so it is correctly NOT read-only.
- `validate-harness.sh` forward+reverse checks couple every `.opencode/agents/*.md`
  to rows in BOTH `AGENTS.md` "Agents Available" AND `README.md` "Custom agents"
  tables, and every `.opencode/commands/*.md` to rows in BOTH `AGENTS.md`
  "Commands" AND `README.md` "Slash commands" tables. The agent file + its two
  rows must land together (one green commit); the `/work-issue` file + its two
  rows must be removed together (one commit) or the cross-check goes red.
- No source code is written by the agent at runtime for triage. The files it
  writes are specs (`docs/specs/*`) and plans (`docs/plans/*`) via the in-context
  skill exits.
- Signed commits, Conventional Commits format, required footers (`Plan-by`,
  `Acked-by`, `Signed-off-by`). `Plan-by: glm-5.2` (from `agent.plan.model` =
  `OPENCODE_MODEL_PLANNER` = `openrouter/z-ai/glm-5.2`, segment after last `/`).
  `Acked-by: deepseek-v4-pro` (from the top-level `model` =
  `OPENCODE_MODEL_PRIMARY` = `deepseek/deepseek-v4-pro`). Reference the issue
  with `Refs: #134` — do NOT close it (`Fixes:`) per the no-auto-closure rule.

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `tests/Unit/Harness/FromIssueAgentTest.php` | Create | RED→GREEN contract test for the merged agent (frontmatter, scoped write + dispatch allowlist, PLANNER-tier wiring, Plan-mode invocation, table presence, label docs, merged-workflow body) |
| `.opencode/agents/from-issue.md` | Create | The agent definition: triage workflow + analyze/plan/halt/execute, routing matrix, AI-disclaimer, rules, gotchas |
| `opencode.jsonc` | Modify | Register `from-issue` (PLANNER tier) + add to `plan` task allowlist |
| `AGENTS.md` | Modify | Add `@from-issue` row to "Agents Available" table; remove `/work-issue` row from "Commands" table |
| `README.md` | Modify | Add `@from-issue` row to "Custom agents" table + Planner tier row; remove `/work-issue` row from "Slash commands" table |
| `CODING_HARNESS.md` | Modify | Add `from-issue` to the Planner tier row |
| `.opencode/docs/model-configuration.md` | Modify | Add `from-issue` to the Planner tier row |
| `docs/agents/labels.md` | Modify | Add `needs-info` + `ready-for-agent` meta labels |
| `.opencode/skills/grilling/SKILL.md` | Modify | Drop `(planned)` after `@from-issue` (×2) |
| `.opencode/skills/to-spec/SKILL.md` | Modify | Drop `(planned)` after `@from-issue` (×2) |
| `.opencode/commands/work-issue.md` | Delete | Consolidated into `@from-issue` |
| `.opencode/agents/consult.md` | Modify | Re-point `/work-issue #NN` → `@from-issue #NN` (line 107) |

---

### Task 1: Failing harness test for the @from-issue agent (RED)

**Files:**
- Create: `tests/Unit/Harness/FromIssueAgentTest.php`

**Interfaces:**
- Consumes: `load_opencode_config()` global helper (already used by
  `ModelConfigTest.php` / `ConfigArchTest.php` in the same directory — parses
  `opencode.jsonc` with JSONC comments stripped). Defined in `tests/Pest.php`.
- Produces: the contract that Task 2 satisfies. All assertions below are the
  issue #134 acceptance criteria plus the merged execution contract, expressed
  as code.

- [ ] **Step 1: Write the failing test**

Create `tests/Unit/Harness/FromIssueAgentTest.php`:

```php
<?php

declare(strict_types=1);

# $KYAULabs: FromIssueAgentTest.php kyau@nova 2026/07/15 -0700 Exp $




use PHPUnit\Framework\Assert;

/**
 * Harness tests for the @from-issue on-ramp subagent (issue #134).
 *
 * Asserts the agent definition exists with the correct frontmatter contract,
 * is registered in opencode.jsonc at the PLANNER tier (same model as @plan),
 * dispatches @explore/@architect/@tdd, is invocable from Plan mode, is indexed
 * in the canonical doc tables, and that its triage-state meta labels are
 * documented. The broad compliance sweep (every agent has a literal
 * temperature, no bare model IDs) is already covered by ModelConfigTest.php;
 * these tests assert the @from-issue-specific contract.
 */

/**
 * Absolute path to the from-issue agent definition.
 *
 * @return string
 */
function from_issue_agent_path(): string
{
    return __DIR__ . '/../../../.opencode/agents/from-issue.md';
}

/**
 * Reads the from-issue agent file, failing loudly if it is missing.
 *
 * @return string
 */
function from_issue_agent_contents(): string
{
    $path = from_issue_agent_path();
    Assert::assertFileExists($path, '.opencode/agents/from-issue.md must exist');

    $contents = file_get_contents($path);
    Assert::assertNotFalse($contents, "Failed to read {$path}");

    return $contents;
}

/**
 * Extracts the YAML frontmatter block from the from-issue agent file.
 *
 * @return string
 */
function from_issue_frontmatter(): string
{
    $contents = from_issue_agent_contents();

    if (! preg_match('/^---\n(.*?)\n---/s', $contents, $matches)) {
        Assert::fail('from-issue.md has no frontmatter delimiters');
    }

    return $matches[1];
}

it('has the from-issue agent definition file', function (): void {
    Assert::assertFileExists(from_issue_agent_path());
});

it('from-issue agent has mode subagent and a literal temperature', function (): void {
    $frontmatter = from_issue_frontmatter();

    Assert::assertMatchesRegularExpression(
        '/^mode:\s*subagent/m',
        $frontmatter,
        'from-issue.md must declare mode: subagent',
    );
    Assert::assertMatchesRegularExpression(
        '/^temperature:\s*[\d.]+/m',
        $frontmatter,
        'from-issue.md must set an explicit numeric temperature',
    );
});

it('from-issue agent has scoped write (specs + plans), gh access, branch + ask-commit, no push', function (): void {
    $frontmatter = from_issue_frontmatter();

    // edit: deny by default, allow docs/specs/* (to-spec exit) + docs/plans/* (writing-plans exit)
    Assert::assertStringContainsString('edit:', $frontmatter);
    Assert::assertStringContainsString('"docs/specs/*": allow', $frontmatter);
    Assert::assertStringContainsString('"docs/plans/*": allow', $frontmatter);

    // gh read/comment/edit access for triage (space-less prefix form)
    Assert::assertStringContainsString('"gh issue view*": allow', $frontmatter);
    Assert::assertStringContainsString('"gh issue comment*": allow', $frontmatter);
    Assert::assertStringContainsString('"gh issue edit*": allow', $frontmatter);

    // branch creation allowed; commits ask; push denied
    Assert::assertStringContainsString('"git checkout*": allow', $frontmatter);
    Assert::assertStringContainsString('"git add*": ask', $frontmatter);
    Assert::assertStringContainsString('"git commit*": ask', $frontmatter);
    Assert::assertStringContainsString('"git push*": deny', $frontmatter);
});

it('from-issue agent dispatches explore, architect, and tdd (task: allow)', function (): void {
    $frontmatter = from_issue_frontmatter();

    Assert::assertStringContainsString('task:', $frontmatter);
    Assert::assertStringContainsString('"explore": allow', $frontmatter);
    Assert::assertStringContainsString('"architect": allow', $frontmatter);
    Assert::assertStringContainsString('"tdd": allow', $frontmatter);
});

it('from-issue agent is registered in opencode.jsonc at the PLANNER tier', function (): void {
    $config = load_opencode_config();

    Assert::assertArrayHasKey('from-issue', $config['agent'], 'opencode.jsonc must register from-issue');

    $agent = $config['agent']['from-issue'];
    Assert::assertSame('{env:OPENCODE_MODEL_PLANNER}', $agent['model']);
    Assert::assertSame('{env:OPENCODE_VARIANT_PLANNER}', $agent['variant']);
    Assert::assertIsFloat($agent['temperature']);
});

it('from-issue is invocable from Plan mode', function (): void {
    $config = load_opencode_config();

    $taskAllow = $config['agent']['plan']['permission']['task'] ?? [];
    Assert::assertSame(
        'allow',
        $taskAllow['from-issue'] ?? null,
        'plan agent task allowlist must include from-issue',
    );
});

it('AGENTS.md indexes @from-issue in the Agents Available table', function (): void {
    $agents = file_get_contents(__DIR__ . '/../../../AGENTS.md');
    Assert::assertStringContainsString('| `@from-issue`', $agents);
});

it('README.md indexes @from-issue in the Custom agents table', function (): void {
    $readme = file_get_contents(__DIR__ . '/../../../README.md');
    Assert::assertStringContainsString('| `@from-issue`', $readme);
});

it('labels.md documents the needs-info and ready-for-agent triage labels', function (): void {
    $labels = file_get_contents(__DIR__ . '/../../../docs/agents/labels.md');
    Assert::assertStringContainsString('`needs-info`', $labels);
    Assert::assertStringContainsString('`ready-for-agent`', $labels);
});

it('from-issue agent body references the merged workflow and triage labels', function (): void {
    $body = from_issue_agent_contents();

    // triage layer
    Assert::assertStringContainsString('grilling', $body);
    Assert::assertStringContainsString('to-spec', $body);
    Assert::assertStringContainsString('needs-info', $body);
    Assert::assertStringContainsString('ready-for-agent', $body);
    // execution layer (absorbed from /work-issue)
    Assert::assertStringContainsString('writing-plans', $body);
    Assert::assertStringContainsString('executing-plans', $body);
    Assert::assertStringContainsString('@explore', $body);
    Assert::assertStringContainsString('@tdd', $body);
    // approval gate before execution
    Assert::assertMatchesRegularExpression('/halt/i', $body);
    // AI-disclaimer on posted comments (acceptance criterion)
    Assert::assertMatchesRegularExpression('/Generated by/i', $body);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/FromIssueAgentTest.php`
Expected: FAIL — first assertion fails because `.opencode/agents/from-issue.md` does not exist (`assertFileExists`).

- [ ] **Step 3: Commit (RED)**

```bash
git add tests/Unit/Harness/FromIssueAgentTest.php
git commit -S -m "test(agents): add failing from-issue agent harness test

Red phase for issue #134 — asserts the @from-issue on-ramp subagent contract:
frontmatter (mode, temperature, scoped write to docs/specs/* + docs/plans/*,
gh access, branch + ask-commit, push deny), task allowlist (explore/architect/tdd),
opencode.jsonc PLANNER-tier registration, Plan-mode invocation, AGENTS.md +
README.md table presence, and the needs-info/ready-for-agent triage labels.
Covers the merged triage + plan + execute workflow.

Refs: #134
Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 2: Create the @from-issue agent + wire config + sync tables (GREEN)

**Files:**
- Create: `.opencode/agents/from-issue.md`
- Modify: `opencode.jsonc` (add PLANNER-tier agent block + `plan` task allowlist entry)
- Modify: `AGENTS.md` (Agents Available table — add `@from-issue` row)
- Modify: `README.md` (Custom agents table — add `@from-issue` row; Planner tier row — add `from-issue`)
- Modify: `CODING_HARNESS.md` (Planner tier row — add `from-issue`)
- Modify: `.opencode/docs/model-configuration.md` (Planner tier row — add `from-issue`)
- Modify: `docs/agents/labels.md` (two meta labels)
- Modify: `.opencode/skills/grilling/SKILL.md` (drop `(planned)` ×2)
- Modify: `.opencode/skills/to-spec/SKILL.md` (drop `(planned)` ×2)

**Interfaces:**
- Consumes: `grilling` skill (triage questions), `to-spec` + `writing-plans` +
  `executing-plans` skills (the enhancement pipeline), `/issue` command pattern
  (GraphQL `updateIssue` + REST `issue-field-values` + `gh issue edit --add-label`),
  `docs/agents/labels.md` (Type/Progress axes), `@explore` / `@architect` /
  `@tdd` / `@debug` agents.
- Produces: the `@from-issue` subagent, invocable as `@from-issue #NN`,
  satisfying every assertion in `FromIssueAgentTest.php` and passing
  `validate-harness.sh` + `ModelConfigTest.php`.

> **Why one big GREEN task:** the `validate-harness.sh` forward check couples
> the agent file to its `AGENTS.md` + `README.md` table rows — they must land
> together or the cross-check is red between them. All edits below are the
> minimal atomic green unit. (`/work-issue` removal is a separate Task 3 so the
> git history records addition and removal as distinct logical changes; between
> Task 2 and Task 3 both on-ramps exist, which keeps the harness green
> throughout.)

- [ ] **Step 1: Create the agent definition**

Create `.opencode/agents/from-issue.md`:

```markdown
---
description: Issue on-ramp — fetches an existing GitHub issue, classifies its type, grills one question at a time, applies exactly one Type + one Progress value, then analyzes the codebase, writes an implementation plan, halts for approval, and dispatches @tdd. Routes bugs to @debug and chores to the fast-path. Posts comments with an AI-disclaimer.
mode: subagent
temperature: 0.1
permission:
  edit:
    "*": deny
    "docs/specs/*": allow
    "docs/plans/*": allow
  bash:
    "*": deny
    "ls*": allow
    "cat*": allow
    "tail*": allow
    "head*": allow
    "grep*": allow
    "find*": allow
    "git log*": allow
    "git show*": allow
    "git status*": allow
    "git diff*": allow
    "git branch*": allow
    "git checkout*": allow
    "git switch*": allow
    "gh issue view*": allow
    "gh issue list*": allow
    "gh issue edit*": allow
    "gh issue comment*": allow
    "gh label list*": allow
    "gh label create*": ask
    "gh api*": ask
    "git add*": ask
    "git stage*": ask
    "git commit*": ask
    "git push*": deny
    "git tag*": deny
  webfetch: deny
  task:
    "*": deny
    "explore": allow
    "architect": allow
    "tdd": allow
---

You are the issue on-ramp agent for the KYAULabs OpenCode harness. Given an
existing GitHub issue, you triage it (classify, grill, label, route) and — for
issues that warrant implementation — analyze the codebase, write an
implementation plan, halt for approval, and dispatch @tdd. You adapt
mattpocock/skills v1.1 `skills/engineering/triage` and consolidate the former
`/work-issue` command into a single subagent. You do NOT write application
source code; you write specs and plans and orchestrate the agents that do.

## Your task

The invocation is `@from-issue #NN` (a leading `#` is optional). The number in
your task description is the GitHub issue number. Fetch it, triage it, then —
for buildable issues — plan and execute it, gated on approval.

## Workflow

### 1. Fetch the issue

Read the issue and its context autonomously — these are facts, never ask the
user:

```bash
gh issue view <NN>
gh issue view <NN> --json title,body,labels,assignees,milestone,comments
```

Also read `AGENTS.md`, `CONTEXT.md` (if present), and dispatch `@explore` to
find any `docs/plans/` or `docs/specs/` referencing `<NN>`. If a plan or spec
already exists for this issue, say so and ask whether to skip straight to
execution (Step 9 → Step 10).

### 2. Classify the type

Map the issue to exactly one **Type** (GitHub native issue-type field) using
the same mapping as the `/issue` command and `docs/agents/labels.md`:

| Signal | Type |
| --- | --- |
| Unexpected behavior, crash, regression | Bug |
| New capability, enhancement | Feature |
| Small incremental fix/update | Patch |
| Docs-only change | Documentation |
| Speed/efficiency improvement | Performance |
| Restructure, no behavior change | Refactor |
| Formatting/styling only | Style |
| Adding/updating tests | Test |
| Build/CI/deploy pipeline | CI/CD |
| Misc maintenance | Chore |
| Vulnerability, CVE, security fix | Security |

Present your recommended Type with one-sentence reasoning. This is the first
grilling turn — load the `grilling` skill (one-at-a-time, recommended answer,
confirmation gate).

### 3. Grill to resolve ambiguity

Run the `grilling` skill's five-behavior protocol. Ask exactly one question
per turn. Look up codebase facts yourself (dispatch `@explore`); ask the user
only for decisions (scope, priority, expected behavior, acceptable trade-offs).
After each answer, reassess: does the Type still hold? Is the routing path
clearer? Stop grilling the moment the issue is unambiguous.

### 4. Determine routing + triage state

Choose exactly one path from the Type and what grilling revealed:

| Path | When | Triage state |
| --- | --- | --- |
| **bug → @debug** | Type is Bug or Security | Insufficient repro → `needs-info`; else `ready-for-agent` |
| **enhancement → plan + @tdd** | Feature, Patch, Documentation, Performance, Refactor, Style, Test, CI/CD | `ready-for-agent` |
| **chore → fast-path** | Type is Chore AND zero behavior delta (typo, RCS header, docs, style-only, patch-deps, test-only) | `ready-for-agent` |

`needs-info` and `ready-for-agent` are meta labels (see
`docs/agents/labels.md`). They supplement — never replace — the single Progress
value.

### 5. Apply Type + Progress + triage label

Apply exactly one Type, exactly one Progress value, and the triage meta label.
Detect IDs dynamically — never hard-code (same pattern as `/issue`):

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
OWNER=$(gh repo view --json owner -q .owner.login)
NAME=$(gh repo view --json name -q .name)

# Type via GraphQL (issue-type FIELD, not a label)
NODE=$(gh api graphql -f query="{ repository(owner: \"$OWNER\", name: \"$NAME\") { issue(number: <NN>) { id } } }" -q .data.repository.issue.id)
gh api graphql -f query="mutation { updateIssue(input: { id: \"$NODE\", issueTypeId: \"<TYPE_NODE_ID>\" }) { issue { issueType { name } } } }"

# Progress (+ Priority/Effort) via the issue-fields REST endpoint
gh api "repos/$REPO/issues/<NN>/issue-field-values" -X POST -f issue_field_values='[...]'

# Triage meta label
gh issue edit <NN> --repo "$REPO" --add-label "ready-for-agent"
```

**Confirmation gate:** present the Type, Progress, and label you intend to
apply and wait for explicit user approval before writing anything to GitHub.
Never auto-apply. (`gh api*` and `gh label create*` are `ask`, reinforcing
this.)

### 6. Route

- **Enhancement path:** continue to Step 7 (analyze) → Step 8 (plan) →
  Step 9 (halt) → Step 10 (execute).
- **Bug/Security path:** if reproduction is insufficient, leave the issue at
  `needs-info`, post the AI-disclaimer comment (Step 11) requesting the missing
  detail, and STOP. If reproduction is sufficient, RECOMMEND the user run
  `@debug` (do NOT dispatch — `@debug` is build-mode only and cannot be
  dispatched from a subagent). Then STOP — `@debug` owns the investigation; the
  user re-invokes `@from-issue` (or proceeds to plan) once the root cause is
  known.
- **Chore path:** describe the fast-path (the `brainstorming` skill defines
  it). If it is a true zero-behavior-delta change, recommend the user proceed
  directly. Do NOT write the source change yourself. STOP.

### 7. Analyze the codebase (enhancement path)

Dispatch `@explore` to identify affected files, modules, current behavior,
where the change lands, and related existing tests. Insert deeper stages only
when the routing matrix demands it:

| Signal | Insert |
| --- | --- |
| Non-trivial / cross-cutting | dispatch `@architect` for read-only validation against CONTEXT.md + ADRs |
| Ambiguous / multiple approaches | load the `brainstorming` skill |
| Technical viability uncertain | load the `prototype` skill |

### 8. Plan

Load the `writing-plans` skill and write a detailed implementation plan to
`docs/plans/YYYY-MM-DD-<topic>.md` (you have edit access there). For an
enhancement whose design emerged from grilling, you may instead load the
`to-spec` skill and write a spec to `docs/specs/` first, then the plan. For a
bug whose root cause is already known, write the fix plan directly.

### 9. HALT for approval

Present: (1) issue summary (title, key requirements), (2) assessment
(complexity, routing path taken, findings), (3) the full plan. Then ask:

> "Review the plan. Reply 'go' to dispatch to @tdd, or request changes."

**Do NOT write code, create a branch, or dispatch @tdd until the user
approves.** This is the single hard gate between planning and execution.

### 10. Execute (post-approval only)

On approval:

1. Create the feature branch: `git checkout -b feat/<username>-<hash>-<description>`.
2. Load the `executing-plans` skill and dispatch tasks to `@tdd` (Red → Green →
   Refactor, per task, with review between tasks).

`git add` / `git commit` prompt the user before running (`ask`). `git push` is
denied — only the human pushes. After implementation, `/check` and `@code-review`
are separate manual gates.

### 11. Post the AI-disclaimer comment

Every comment you post to the issue ends with this disclaimer block:

```
---
> _🤖 Generated by `@from-issue` (AI triage/planning agent). A human reviewed
> this recommendation before it was applied. Verify details before acting._
```

Post a single summary comment after the routing decision: the agreed Type +
Progress + label, the routing path, and the next step. Gate on user approval
before posting.

## Output format

Present each turn inline. End the triage with a routing summary:

```
## Triage: #<NN>

- Type: <Type>
- Progress: <Progress>
- Label: needs-info | ready-for-agent
- Routing: bug → @debug | enhancement → plan + @tdd | chore → fast-path
- Next step: <one sentence>
```

For the enhancement path, follow with the plan presentation and the approval
prompt (Step 9).

## Rules

- **One Type, one Progress.** Exactly one of each per issue (GitHub-enforced).
  `needs-info`/`ready-for-agent` are supplementary meta labels, not Progress
  values.
- **Never auto-apply.** Gate on explicit user approval before any `gh issue
  edit`, `gh api`, or comment post.
- **Facts from codebase, decisions from user.** Follow the `grilling` skill.
  Never ask the user for information you can read yourself (dispatch `@explore`).
- **One question at a time.** Never bundle questions.
- **Halt before execution.** Never dispatch `@tdd` or create a branch before
  the user approves the plan (Step 9).
- **@debug is recommended, not dispatched.** `@debug` is build-mode only.
- **No application source code.** You triage, plan, and orchestrate. The only
  files you write are specs (`docs/specs/*`) and plans (`docs/plans/*`).
- **AI-disclaimer on every comment.** Never post without it.
- **Detect IDs dynamically.** Never hard-code repo/type/field IDs.

## Cross-refs

- `grilling` skill — interview mechanics (load for triage questions)
- `to-spec` skill — enhancement exit when the design emerged from grilling
- `writing-plans` skill — implementation plan (Step 8)
- `executing-plans` skill — dispatch @tdd per task (Step 10)
- `brainstorming` skill — defines the chore fast-path; loaded when ambiguous
- `prototype` skill — loaded when viability is uncertain
- `/issue` command — Type→field mapping and the GraphQL/REST application pattern
- `docs/agents/labels.md` — Type/Progress axes + meta labels
- `@explore` agent — codebase analysis (Step 1, Step 7)
- `@architect` agent — read-only validation when non-trivial (Step 7)
- `@tdd` agent — execution target, post-approval (Step 10)
- `@debug` agent — bug/security routing target (user-invoked)
- `AGENTS.md` — pipeline, boundaries

## Gotchas

- *Applying Type/Progress without confirmation* — the issue says "never
  auto-answers decisions." Gate even when the answer seems obvious.
- *Treating needs-info/ready-for-agent as Progress values* — they are meta
  labels. Progress has exactly four values; do not invent a fifth.
- *Dispatching @debug directly* — it is build-mode only; recommend it and stop.
- *Proceeding to execute before plan approval* — Step 9 is a hard gate.
- *Posting a comment without the AI-disclaimer* — every comment carries it.
- *Hard-coding repo or type IDs* — always detect via `gh repo view` /
  `gh api orgs/<owner>/issue-types`.
```

- [ ] **Step 2: Register the agent in opencode.jsonc (PLANNER tier)**

In `opencode.jsonc`, inside the `"agent": { ... }` object, add a `from-issue`
block immediately after the `consult` block (after line 120, before `"debug"`):

```jsonc
    "from-issue": {
      "model": "{env:OPENCODE_MODEL_PLANNER}",
      "variant": "{env:OPENCODE_VARIANT_PLANNER}",
      "temperature": 0.1
    },
```

Then, in the `plan` agent's `task` allowlist (lines 73-82), add
`"from-issue": "allow"` so the agent is invocable from Plan mode:

```jsonc
        "task": {
          "*": "deny",
          "test-audit": "allow",
          "code-review": "allow",
          "semgrep": "allow",
          "architect": "allow",
          "explore": "allow",
          "scout": "allow",
          "docs-writer": "allow",
          "from-issue": "allow"
        }
```

> `build` needs no change — it has no restrictive `task` block, so it can
> already dispatch subagents.

- [ ] **Step 3: Add the AGENTS.md Agents Available row**

In `AGENTS.md`, in the "## Agents Available" table, add a row immediately after
the `@consult` row:

```markdown
| `@from-issue` | Issue on-ramp — fetches an existing GitHub issue, classifies type, grills one-at-a-time, applies one Type + one Progress value, analyzes, plans, halts for approval, and dispatches @tdd; routes bugs to @debug and chores to the fast-path |
```

- [ ] **Step 4: Add the README.md Custom agents row + Planner tier entry**

In `README.md`, in the "### Custom agents" table, add a row immediately after
the `@consult` row:

```markdown
| `@from-issue` | Issue on-ramp — classifies type, grills one-at-a-time, applies Type + Progress, analyzes, plans, and dispatches @tdd |
```

In the same file, in the "### Model Configuration" Planner tier row, append
`from-issue` so the tier table stays accurate (from-issue is on the PLANNER
model, like `plan`). The row currently reads:

```markdown
| Planner | `OPENCODE_MODEL_PLANNER` | `openrouter/z-ai/glm-5.2` | plan |
```

Change it to:

```markdown
| Planner | `OPENCODE_MODEL_PLANNER` | `openrouter/z-ai/glm-5.2` | plan, from-issue |
```

> Do NOT add `from-issue` to the Primary tier row — it is on the Planner model.

- [ ] **Step 5: Add from-issue to the Planner tier row in the other two live tier tables**

In `CODING_HARNESS.md`, the Planner row (under the Model Configuration tier
table) currently reads:

```markdown
| Planner | `OPENCODE_MODEL_PLANNER` | `OPENCODE_VARIANT_PLANNER` | `openrouter/z-ai/glm-5.2` | `high` | plan |
```

Change the agents cell to `plan, from-issue`:

```markdown
| Planner | `OPENCODE_MODEL_PLANNER` | `OPENCODE_VARIANT_PLANNER` | `openrouter/z-ai/glm-5.2` | `high` | plan, from-issue |
```

In `.opencode/docs/model-configuration.md`, the Planner row currently reads:

```markdown
| PLANNER | `OPENCODE_MODEL_PLANNER` | `OPENCODE_VARIANT_PLANNER` | `openrouter/z-ai/glm-5.2` | `high` | plan |
```

Change the agents cell to `plan, from-issue`:

```markdown
| PLANNER | `OPENCODE_MODEL_PLANNER` | `OPENCODE_VARIANT_PLANNER` | `openrouter/z-ai/glm-5.2` | `high` | plan, from-issue |
```

> ADRs `0012` and `0013` also contain tier tables but are immutable
> point-in-time records — do NOT edit them.

- [ ] **Step 6: Add the two triage meta labels to docs/agents/labels.md**

In `docs/agents/labels.md`, in the "### Meta — Optional context labels" table,
add two rows immediately after the `plan` row (keeps the workflow-signal labels
grouped):

```markdown
| `needs-info` | `#fbca04` | Triage: issue lacks detail to proceed (awaiting reporter) |
| `ready-for-agent` | `#0e8a16` | Triage: classified and routed, ready for an agent to pick up |
```

- [ ] **Step 7: Drop `(planned)` from the grilling + to-spec skills**

In `.opencode/skills/grilling/SKILL.md`, change the two occurrences of
`@from-issue (planned)` to `@from-issue` (lines ~11 and ~20).

In `.opencode/skills/to-spec/SKILL.md`, change the two occurrences of
`@from-issue (planned)` to `@from-issue` (description line ~3 and body line ~17).

- [ ] **Step 8: Run the dedicated test — verify GREEN**

Run: `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/FromIssueAgentTest.php`
Expected: PASS (all tests green).

- [ ] **Step 9: Run the harness sweep — verify no regressions**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: PASS — `from-issue.md` is found, its frontmatter is valid, and its
`AGENTS.md` + `README.md` table rows are present (forward check satisfied).

Run: `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness`
Expected: PASS — `ModelConfigTest.php` confirms `from-issue.md` has a literal
temperature and no bare model ID; `FromIssueAgentTest.php` passes.

- [ ] **Step 10: Commit (GREEN)**

```bash
git add .opencode/agents/from-issue.md opencode.jsonc AGENTS.md README.md CODING_HARNESS.md .opencode/docs/model-configuration.md docs/agents/labels.md .opencode/skills/grilling/SKILL.md .opencode/skills/to-spec/SKILL.md
git commit -S -m "feat(agents): add @from-issue on-ramp subagent

Green phase for issue #134 — the @from-issue on-ramp subagent fetches an
existing GitHub issue, classifies its Type, grills one question at a time,
applies exactly one Type + one Progress value, then (for buildable issues)
analyzes the codebase, writes an implementation plan, halts for approval, and
dispatches @tdd. Routes bugs to @debug (recommended, build-mode only) and
chores to the fast-path. Runs on the PLANNER model (same as @plan). Posts
comments with an AI-disclaimer. Adds needs-info + ready-for-agent triage meta
labels to docs/agents/labels.md.

Refs: #134
Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 3: Remove /work-issue, consolidated into @from-issue

**Files:**
- Delete: `.opencode/commands/work-issue.md`
- Modify: `AGENTS.md` (Commands table — remove `/work-issue` row)
- Modify: `README.md` (Slash commands table — remove `/work-issue` row)
- Modify: `.opencode/agents/consult.md` (re-point `/work-issue #NN` → `@from-issue #NN`, line 107)

**Interfaces:**
- Consumes: the `@from-issue` agent from Task 2 (now the sole `#NN` on-ramp).
- Produces: a single issue on-ramp; `validate-harness.sh` stays green (file +
  both table rows removed together).

> No unit test is added for the removal — a deletion is verified by the harness
> staying consistent (no dangling references), not by a Red→Green behavior
> cycle. The forward/reverse cross-checks in `validate-harness.sh` enforce that
> the file and both table rows disappear together; a grep confirms no stale
> references remain.

- [ ] **Step 1: Delete the command file**

```bash
git rm .opencode/commands/work-issue.md
```

- [ ] **Step 2: Remove the AGENTS.md Commands table row**

In `AGENTS.md`, in the "## Commands" table, remove this row:

```markdown
| `/work-issue` | Analyze an existing GitHub issue, plan the fix, and halt for approval before dispatching to @tdd |
```

- [ ] **Step 3: Remove the README.md Slash commands table row**

In `README.md`, in the "### Slash commands" table, remove this row:

```markdown
| `/work-issue` | Analyze an existing GitHub issue, plan the fix, and halt for approval before dispatching to @tdd |
```

- [ ] **Step 4: Re-point the consult.md handoff**

In `.opencode/agents/consult.md` (line 107, inside the "Let's build this"
handoff block), change:

```markdown
> - If this is an existing issue: run `/work-issue #NN` to analyze and plan
>   it.
```

to:

```markdown
> - If this is an existing issue: run `@from-issue #NN` to analyze, plan, and
>   execute it.
```

- [ ] **Step 5: Verify no stale references remain**

Run: `git grep -n "work-issue" -- ':!docs/plans' ':!docs/specs'`
Expected: no output. (The historical `docs/plans/2026-07-14-work-issue-command.md`
and `docs/specs/2026-07-14-work-issue-command-spec.md` are excluded — they are
point-in-time design records and git history preserves them. If you would
rather delete them, do so in a separate `docs(plans): ...` commit.)

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: PASS — `work-issue` is gone from the filesystem and both tables
(forward + reverse checks satisfied; no dangling table rows, no orphan file).

Run: `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness`
Expected: PASS — no regressions.

- [ ] **Step 6: Commit (removal)**

```bash
git add -A .opencode/commands/work-issue.md AGENTS.md README.md .opencode/agents/consult.md
git commit -S -m "chore(commands): remove /work-issue, consolidated into @from-issue

/work-issue's analyze → plan → halt → execute workflow is absorbed into the
@from-issue subagent (Steps 7-10), making @from-issue the single on-ramp for
working an existing GitHub issue. Removes the command file and its AGENTS.md +
README.md table rows, and re-points consult.md's handoff to @from-issue #NN.

Refs: #134
Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 4: Verification + manual smoke (REFACTOR)

**Files:**
- Verify only. Edit only if the smoke review finds a tighten-up.

- [ ] **Step 1: Full harness test run**

Run: `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness`
Run: `bash tests/Shell/validate-harness_test.sh`
Expected: both PASS, zero failures.

- [ ] **Step 2: writing-skills quality checklist against from-issue.md**

Confirm against `.opencode/skills/writing-skills/SKILL.md` quality checks:
frontmatter complete; description is a one-liner (not "Use when"); no content
duplicated from `AGENTS.md`/`labels.md` (referenced by name); cross-refs use
skill/doc/agent names, not markdown links; no placeholders; `## Gotchas`
present.

- [ ] **Step 3: Manual smoke — dry-run triage on a real issue**

Without writing to GitHub, invoke `@from-issue #42` (a closed Documentation
issue — safe sample). Confirm the agent:
1. fetches the issue,
2. presents a Type recommendation (Documentation) + a Progress recommendation,
3. asks one question at a time,
4. for an enhancement-style issue, proceeds through analyze → plan → presents
   the approval prompt (do NOT approve — abort at the gate),
5. ends with the routing summary + AI-disclaimer text.

Do NOT let it post a comment, apply labels, create a branch, or dispatch @tdd
during the smoke test — abort at every gate. This satisfies the AC
"@from-issue #NN fetches issue, presents Type + Status recommendation" and
"Grills one question at a time."

- [ ] **Step 4: Commit only if Step 2 tightened the body**

If the quality checklist required edits, commit:

```bash
git add .opencode/agents/from-issue.md
git commit -S -m "refactor(agents): tighten from-issue agent body

Address writing-skills quality checklist findings from the Task 4 review.

Refs: #134
Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

If no edits were needed, skip the commit — Task 2's GREEN commit plus Task 3's
removal commit are the complete deliverable.

- [ ] **Step 5: Report completion**

Summarize: agent created (PLANNER tier, scoped orchestrator), wired, indexed;
`/work-issue` removed and references re-pointed; tests green;
`validate-harness.sh` green; smoke test confirms the fetch → classify → grill →
route → (plan → halt) flow. Do NOT close #134 (no auto-closure). Leave the
issue for the user to close after `/check` + `@code-review`.

---

## Self-review

- **Spec (issue #134 AC) coverage:**
  - "fetches issue, presents Type + Status recommendation" → Task 2 Step 1
    workflow §1-2; verified Task 4 Step 3. ✓
  - "Grills one question at a time with per-answer reassessment" → Task 2
    Step 1 workflow §3 + Rule; grilling skill referenced. ✓
  - "Bug path reproduces (or reports insufficient detail → status: needs-info)"
    → workflow §4/§6 bug row + `needs-info` label (Task 2 Step 6). ✓
  - "Enhancement path exits to to-spec + status: ready-for-agent" → workflow
    §6 enhancement → §7-10 (analyze/plan/halt/execute) + §8 to-spec option +
    `ready-for-agent` label + `edit: docs/specs/*` + `docs/plans/*`. ✓
  - "Never auto-answers decisions; applies exactly one Type + one Status label"
    → Rules "One Type, one Progress" + "Never auto-apply" + confirmation gates
    + `ask` on `gh api`/`gh label create`. ✓
  - "AI-disclaimer on posted comments" → workflow §11 + Rule + Gotcha + test
    assertion. ✓
- **Merge coverage (former /work-issue):** analyze (@explore, §7) + plan
  (writing-plans, §8) + halt-for-approval (§9) + execute (branch + @tdd via
  executing-plans, §10) + non-trivial→@architect (§7). ✓
- **Decision coverage:** D1 (Type/Status/meta labels), D2 (AI-disclaimer),
  D3 (dispatch explore/architect/tdd; recommend debug), D4 (PLANNER tier),
  D5 (/work-issue removed). All encoded. ✓
- **Placeholder scan:** none — every step shows complete content (full agent
  body, full test, exact config/table snippets, exact deletion targets).
- **Type/name consistency:** `from-issue` / `@from-issue` used uniformly across
  agent file, config block, table rows, and test; meta labels `needs-info` /
  `ready-for-agent` match across agent body, `labels.md`, and test; PLANNER
  env vars (`OPENCODE_MODEL_PLANNER` / `OPENCODE_VARIANT_PLANNER`) match across
  `opencode.jsonc`, all three live tier tables, and the test.
