# Uninterrupted Plan Execution Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Make approved implementation plans run to completion without routine user prompts between tasks.

**Architecture:** Keep all existing per-task quality controls inside `executing-plans`, but define them as agent-owned internal gates. Plan approval becomes authorization to continue automatically until completion or an existing exceptional halt condition.

**Tech Stack:** Markdown-based Pi skills and global harness instructions; repository text-validation commands.

## Global constraints

- Preserve per-task TDD, verification, spec-compliance review, code-quality review, checkbox updates, and atomic commits.
- Preserve every existing halt and re-plan condition.
- Do not introduce routine user review or approval prompts between approved tasks.
- Keep Prism core language-agnostic.

---

### Task 1: Define uninterrupted execution semantics

**Files:**
- Modify: `packages/prism-core/skills/executing-plans/SKILL.md`
- Modify: `packages/prism-core/AGENTS.md`
- Test: repository text validation against both modified files

**Interfaces:**
- Consumes: approved implementation plan and existing halt/re-plan policy
- Produces: instruction contract in which successful tasks continue automatically and only exceptional halt conditions interrupt execution

- [x] **Step 1: Run the failing text check**

```bash
rg -n "checkpoint with the user|ask if they want to review|exact-message approval process" packages/prism-core/skills/executing-plans/SKILL.md
```

Expected: matches proving that routine between-task prompting and obsolete approval wording remain.

- [x] **Step 2: Update the execution skill**

Change the skill description, summary, inline execution section, review-gate heading and continuation instructions, rules, and gotchas so that:

```text
- plan approval authorizes uninterrupted execution of all tasks;
- per-task reviews are internal agent-owned gates;
- the agent automatically starts the next task after successful verification and commit;
- no routine review or approval question is asked between tasks;
- only the existing halt/re-plan triggers interrupt execution;
- commits use the atomic launcher without a separate approval process.
```

- [x] **Step 3: Update the global skill description**

Replace the `executing-plans` table description in `packages/prism-core/AGENTS.md` with:

```text
After writing-plans — implements every approved task inline using the tdd skill, continuing automatically through internal per-task review gates unless a halt/re-plan condition applies
```

- [x] **Step 4: Run focused verification**

Run:

```bash
! rg -n "checkpoint with the user|ask if they want to review|exact-message approval process" packages/prism-core/skills/executing-plans/SKILL.md
rg -n "uninterrupted|automatically|internal.*review|halt" packages/prism-core/skills/executing-plans/SKILL.md packages/prism-core/AGENTS.md
git diff --check
```

Expected: prohibited wording has no matches; uninterrupted internal-gate semantics have matches; diff check passes.

- [x] **Step 5: Create the commit**

```bash
git add packages/prism-core/skills/executing-plans/SKILL.md packages/prism-core/AGENTS.md docs/specs/2026-08-23-uninterrupted-plan-execution-spec.md docs/plans/2026-08-23-uninterrupted-plan-execution.md
prism-tool commit create --type fix --scope execution --subject "continue approved plans without task prompts"
```

> Run staging and commit creation as separate tool calls. The commit command must be the only tool call in its assistant batch.
