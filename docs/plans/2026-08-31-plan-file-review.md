# Plan File Review Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Make plan files the sole full-plan review surface for direct and issue-driven planning workflows.

**Architecture:** Add a focused shell contract test for plan delivery, then update the two workflow skills that currently require conversation-first rendering. Keep the existing plan format, approval gate, branch transition, and execution behavior unchanged.

**Tech Stack:** Markdown Agent Skills, Bash contract tests

**Originating issue:** none

## Global constraints

- Write complete plan drafts directly to `docs/plans/YYYY-MM-DD-<topic>.md`.
- Do not reproduce a complete plan, task outline, or code excerpt in conversation unless the user explicitly asks.
- Apply requested revisions to the same file and rerun plan self-review.
- Preserve explicit user approval before branch creation or implementation, according to the invoking workflow.
- Introduce no dependencies or domain terms.

---

### Task 1: Enforce file-first plan review

**Files:**

- Create: `tests/Shell/plan_file_review_contract_test.sh`
- Modify: `packages/prism-core/skills/writing-plans/SKILL.md:19-29,191-213,229-246`
- Modify: `packages/prism-core/skills/from-issue/SKILL.md:174-193,271-276,296-314`
- Test: `tests/Shell/plan_file_review_contract_test.sh`

**Interfaces:**

- Consumes: the existing `writing-plans` plan format and `from-issue` approval transition
- Produces: one canonical `docs/plans/` review artifact and a path-only conversation handoff

- [x] **Step 1: Write the failing contract test**

Create `tests/Shell/plan_file_review_contract_test.sh` with this content. The pre-commit hook will add the canonical RCS header and vim modeline.

```bash
#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

WRITING_PLANS="$REPO_ROOT/packages/prism-core/skills/writing-plans/SKILL.md"
FROM_ISSUE="$REPO_ROOT/packages/prism-core/skills/from-issue/SKILL.md"

assert_contains() {
    local file="$1" pattern="$2" message="$3"
    if grep -qiF -- "$pattern" "$file"; then
        pass "$message"
    else
        fail "$message"
    fi
}

assert_not_contains() {
    local file="$1" pattern="$2" message="$3"
    if grep -qiF -- "$pattern" "$file"; then
        fail "$message"
    else
        pass "$message"
    fi
}

printf '%s\n' '── Plan file review contract ──'
assert_contains "$WRITING_PLANS" \
    'Write every complete draft directly to' \
    'writing-plans creates the canonical file before review'
assert_contains "$WRITING_PLANS" \
    'Do not reproduce the plan body in the conversation.' \
    'writing-plans forbids duplicate conversation rendering'
assert_contains "$WRITING_PLANS" \
    'Do not emit a task-title outline' \
    'writing-plans omits unsolicited partial restatements'
assert_contains "$WRITING_PLANS" \
    'Apply requested changes directly to the same plan file.' \
    'writing-plans revises the canonical file in place'
assert_contains "$WRITING_PLANS" \
    'If writing or self-review fails' \
    'writing-plans blocks review of an incomplete file'
assert_not_contains "$WRITING_PLANS" \
    'Present the plan as text in the conversation for user review.' \
    'writing-plans removes conversation-first delivery'
assert_contains "$FROM_ISSUE" \
    'and (3) the exact plan path, but' \
    'from-issue reviews the canonical file by path'
assert_not_contains "$FROM_ISSUE" \
    '(3) the full plan. Then ask:' \
    'from-issue removes duplicate full-plan presentation'
assert_contains "$FROM_ISSUE" \
    "Reply 'go' to create the branch" \
    'from-issue preserves explicit execution approval'

print_summary "plan file review contract"
```

- [x] **Step 2: Run the contract test to verify Red**

Run: `bash tests/Shell/plan_file_review_contract_test.sh`

Expected: FAIL because `writing-plans` still requires conversation-first delivery and `from-issue` still requires the full plan in Step 9.

- [x] **Step 3: Implement file-first delivery in both skills**

In `packages/prism-core/skills/writing-plans/SKILL.md`, replace the current `Plan delivery` paragraph with:

```markdown
**Plan delivery:** Write every complete draft directly to
`docs/plans/YYYY-MM-DD-<topic>.md`. The file is the sole full-plan review
surface. Run the self-review against the written file, then report its exact
path and ask the user to request additions or changes, or approve the plan for
the next pipeline stage. Do not reproduce the plan body in the conversation.
Do not emit a task-title outline, code excerpt, or partial restatement unless
the user explicitly asks for one.

Apply requested changes directly to the same plan file. Rerun the applicable
self-review after each revision, then report the path again without restating
the plan. If writing or self-review fails, report the failure and do not ask
for approval of an incomplete plan. Planning remains instruction-only and
read-only with respect to implementation code (ADR-0055).
```

Add this delivery instruction after the numbered `Self-review` checklist:

```markdown
After the self-review passes, report only:

> Plan written to `<path>`. Review it there. Request additions or changes, or
> reply `go` to approve the next pipeline stage.

Do not include plan content in that message unless the user asks for it.
```

Replace the `Cycle boundary` section with:

```markdown
## Cycle boundary

The planning cycle ENDS at approval of the plan file. Writing or revising the
file does not authorize implementation. Do not implement while authoring or
reviewing the plan. After approval, load `executing-plans` and `tdd`; the
single agent executes the tasks inline (ADR-0055).
```

Add this `Gotchas` entry:

```markdown
- *Rendering the plan twice* — the `docs/plans/` file is the sole full-plan
  review surface. Report its path; do not copy the plan or an unsolicited
  outline into the conversation.
```

In `packages/prism-core/skills/from-issue/SKILL.md`, replace Step 9 with:

```markdown
### 9. HALT for approval

Present: (1) issue summary (title, key requirements), (2) assessment
(complexity, routing path taken, findings), and (3) the exact plan path, but
not the plan body. Then ask:

> "Plan written to `<path>`. Review it there. Reply 'go' to create the branch
> and begin inline execution with the `executing-plans` and `tdd` skills, or
> request changes."

Apply requested changes directly to the same plan file through
`writing-plans`, rerun its self-review, and report the path again. Do not
reproduce the complete plan or a partial outline unless the user explicitly
asks.

**Do NOT write code or create a branch until the user approves.** This is the
single hard gate between planning and execution.
```

Replace the enhancement-path sentence in `Output format` with:

```markdown
For the enhancement path, follow with the exact plan path and approval prompt
from Step 9. Do not present the plan body.
```

Add this `Gotchas` entry:

```markdown
- *Repeating the plan at approval* — `writing-plans` already wrote the
  canonical review file. Present its path, not its contents.
```

- [x] **Step 4: Run the focused test to verify Green**

Run: `bash tests/Shell/plan_file_review_contract_test.sh`

Expected: PASS with 9 passing contract assertions and 0 failures.

- [x] **Step 5: Run the shell regression suite**

Run: `bash tests/Shell/run-all.sh`

Expected: PASS for every shell regression test, including `plan_file_review_contract_test.sh`.

- [x] **Step 6: Run the Prism harness validator**

Run: `bash packages/prism-core/scripts/validate-harness.sh`

Expected: exit 0 with no malformed skill, prompt, extension, script, or stale-reference errors.

- [x] **Step 7: Create the commit**

```bash
git add tests/Shell/plan_file_review_contract_test.sh packages/prism-core/skills/writing-plans/SKILL.md packages/prism-core/skills/from-issue/SKILL.md
prism-tool commit create --type feat --scope planning --subject "review implementation plans from canonical files"
```

> During execution, load `conventional-commits` and run these as separate tool
> calls; the commit command must be the only call in its assistant batch and
> must not use compound shell syntax.
