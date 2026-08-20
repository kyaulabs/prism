---
name: writing-plans
description: Use when you have an approved spec or requirements for a multi-step task, before touching code. Produces a bite-sized, TDD-oriented implementation plan with exact file paths, interfaces, complete code, and verification commands. Sits between brainstorming approval and execution with the tdd skill.
derived-from: obra/superpowers (MIT, © Jesse Vincent)
---

# Writing Plans

Write comprehensive implementation plans assuming the engineer has zero context
for the codebase and questionable taste. Document everything they need to know:
which files to touch for each task, code, testing, docs to check, how to test it.
Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about the toolset
or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the
implementation plan."

**Context:** This skill is invoked after the `brainstorming` skill has produced
an approved spec, or after a wayfinder map has merged to a spec via the
`to-spec` skill. The spec lives at `docs/specs/YYYY-MM-DD-<topic>-spec.md`.
Read the spec directly and inspect the codebase facts it depends on. Load the
`explore` skill when a focused exploration pass would help.

**Plan delivery:** Present the plan as text in the conversation for user review.
When the user wants the plan saved to disk, persist it to
`docs/plans/YYYY-MM-DD-<topic>.md`. Planning remains instruction-only and
read-only with respect to implementation code (ADR-0055).

**Plan lifecycle:** Plans are development artifacts. After the branch is
finished (see `finishing-a-development-branch` skill), delete the plan and
spec files from `docs/plans/` and `docs/specs/`. Git history preserves them.

## Scope check

If an approved spec is still oversized, halt and return it to wayfinder; do not
create multiple plans here. Wayfinder owns pre-spec decomposition; this skill
produces one implementation plan per approved spec.

## File structure

Before defining tasks, map out which files will be created or modified and
what each one is responsible for. This is where decomposition decisions get
locked in.

- Design units with clear boundaries and well-defined interfaces. Each file
  should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits
  are more reliable when files are focused. Prefer smaller, focused files over
  large ones that do too much.
- Files that change together should live together. Split by responsibility,
  not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses
  large files, don't unilaterally restructure — but if a file you're modifying
  has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce
self-contained changes that make sense independently.

## Task right-sizing

A task is the smallest unit that carries its own test cycle and is worth a
fresh reviewer's gate. When drawing task boundaries: fold setup, configuration,
scaffolding, and documentation steps into the task whose deliverable needs
them; split only where a reviewer could meaningfully reject one task while
approving its neighbor. Each task ends with an independently testable
deliverable.

## Bite-sized task granularity

**Each step is one action (2–5 minutes):**

- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

## Plan document header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2–3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

## Global constraints

[The spec's project-wide requirements — version floors, dependency limits,
naming and copy rules, platform requirements — one line each, with exact
values copied verbatim from the spec. Every task's requirements implicitly
include this section.]

---
```

## Task structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/source-file`
- Modify: `exact/path/to/existing-file:123-145`
- Test: `tests/exact/path/to/test-file`

**Interfaces:**
- Consumes: [what this task uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact function names, parameter and
  return types. The interface block keeps neighboring task names and types
  consistent.]

- [ ] **Step 1: Write the failing test**

```text
<complete test code for one observable behavior>
```

- [ ] **Step 2: Run test to verify it fails**

Run: `<adapter-specific focused test command>`
Expected: FAIL with `<the meaningful failure proving Red>`

- [ ] **Step 3: Write minimal implementation**

```text
<complete minimal implementation for the tested behavior>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `<same focused test command>`
Expected: PASS

- [ ] **Step 5: Create the commit**

```bash
git add exact/files
prism-tool commit create --type feat --scope exact-scope --subject "exact subject"
```

> *Replace every field with task-specific literal structured values. During
> execution, load `conventional-commits` and run these as separate tool calls;
> the commit command must be the only call in its assistant batch and must not
> use compound shell syntax. Put an optional multiline body in a Pi-written
> body file; never embed it in Bash.*
````

## No placeholders

Every step must contain the actual content an engineer needs. These are **plan
failures** — never write them:

- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out
  of order)
- Steps that describe what to do without showing how (code blocks required for
  code steps)
- References to types, functions, or methods not defined in any task
- Bare or direct commit recipes — prescribe structured launcher fields and
  delegate attribution, signing, execution, and verification to
  `conventional-commits`

## Self-review

After writing the complete plan, look at the spec with fresh eyes and check
the plan against it. This is a checklist you run yourself — not a delegated
review.

1. **Spec coverage:** Skim each section/requirement in the spec. Can you point
   to a task that implements it? List any gaps.
2. **Placeholder scan:** Search your plan for red flags — any of the patterns
   from "No placeholders" above. Fix them.
3. **Type consistency:** Do the types, method signatures, and property names
   you used in later tasks match what you defined in earlier tasks? A function
   called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move
on. If you find a spec requirement with no task, add the task.

## Cycle boundary

The planning cycle ENDS at plan approval. Do not implement while authoring or
reviewing the plan. After approval, load `executing-plans` and `tdd`; the
single agent executes the tasks inline (ADR-0055).

## Remember

- Exact file paths always.
- Complete code in every step — if a step changes code, show the code.
- Exact commands with expected output.
- DRY, YAGNI, TDD, frequent commits.
- Signed ordinary commits through `prism-tool commit`.

## Cross-refs

- `brainstorming` skill — the step before this one (produces the spec).
- `to-spec` skill — the merge exit for a wayfinder map; also a source of
  approved specs.
- `wayfinder` skill — the pre-spec route: an approved spec that is still
  oversized returns here instead of becoming multiple plans.
- `explore` skill — focused spec reading, codebase exploration, and file
  discovery when the plan needs it.
- `websearch` / `searxng` skills — external documentation and dependency
  research when needed.
- `executing-plans` skill — the execution step after this one. Load it only
  after the user approves the plan.
- `tdd` skill — supplies Red → Green → Refactor discipline for every task;
  load it alongside `executing-plans` after approval.
- `verification-before-completion` skill — run after each task is green.
- `rcs-header` skill — apply RCS header + vim modeline to every new file.
- `domain-context` skill — use `CONTEXT.md` vocabulary in task/variable names.

## Gotchas

Known failure modes that compound over time. Add entries when this skill
causes a preventable mistake.

- *Placeholder creep* — "TBD", "add error handling", "similar to Task N" are
  plan failures. Every step must contain actual content the implementer needs.
- *Type drift between tasks* — `clearLayers()` in Task 3 becomes
  `clearFullLayers()` in Task 7. Run the self-review type-consistency check.
- *Tasks too large* — a task should be 2–5 minutes of work. If a task has
  more than ~5 steps, it's probably two tasks.
- *Splitting one oversized spec into multiple plans* — if the approved spec is
  still oversized, halt and return it to wayfinder. Creating multiple plans
  here bypasses the shared decision map (ADR-0050).
