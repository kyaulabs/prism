---
name: writing-plans
description: Use when you have an approved spec or requirements for a multi-step task, before touching code. Produces a bite-sized, TDD-oriented implementation plan with exact file paths, interfaces, complete code, and verification commands. Sits between brainstorming approval and @tdd execution.
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
an approved spec. The spec lives at `docs/specs/YYYY-MM-DD-<topic>-spec.md`.
The Plan agent delegates reading the spec file to `@explore` (since `read`
is denied on the Plan agent) — dispatch `@explore` with the spec path to
load its contents into context.

**Plan delivery:** Present the plan as text in the conversation for user review.
If the user wants the plan saved to disk, delegate file writing to
`@docs-writer` with the path `docs/plans/YYYY-MM-DD-<feature-name>.md`.
The Plan agent does not write files directly (`edit: deny`).

## Scope check

If the spec covers multiple independent subsystems, it should have been broken
into sub-project specs during brainstorming. If it wasn't, suggest breaking
this into separate plans — one per subsystem. Each plan should produce working,
testable software on its own.

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

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

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
- Create: `exact/path/to/file.php`
- Modify: `exact/path/to/existing.php:123-145`
- Test: `tests/exact/path/to/Test.php`

**Interfaces:**
- Consumes: [what this task uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact function names, parameter and
  return types. A task's implementer sees only their own task; this block is
  how they learn the names and types neighboring tasks use.]

- [ ] **Step 1: Write the failing test**

```php
it('does the specific behavior', function () {
    $result = function($input);
    expect($result)->toBe($expected);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php vendor/bin/pest --filter TestName`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```php
function function($input) {
    return $expected;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php vendor/bin/pest --filter TestName`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/to/Test.php backend/path/to/file.php
git commit -S -m "feat(scope): concise subject describing the change

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```
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
- Bare commit messages missing scope or required footers — use the full
  conventional-commits format (type[scope]: subject + Plan-by + Acked-by + Signed-off-by)

## Self-review

After writing the complete plan, look at the spec with fresh eyes and check
the plan against it. This is a checklist you run yourself — not a subagent
dispatch.

1. **Spec coverage:** Skim each section/requirement in the spec. Can you point
   to a task that implements it? List any gaps.
2. **Placeholder scan:** Search your plan for red flags — any of the patterns
   from "No placeholders" above. Fix them.
3. **Type consistency:** Do the types, method signatures, and property names
   you used in later tasks match what you defined in earlier tasks? A function
   called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move
on. If you find a spec requirement with no task, add the task.

## Execution handoff

After presenting the plan and receiving user approval, hand off to the
`executing-plans` skill:

> "Plan complete. If you want this saved to `docs/plans/<filename>.md`,
> I can delegate that to @docs-writer. Invoking the `executing-plans` skill
> to execute it."

Load the `executing-plans` skill and follow its process — it defines two
execution modes (inline batch-with-checkpoints and @tdd-dispatch with
two-stage review), per-task review gates, halt/re-plan thresholds, and
context management across long plans.

## Remember

- Exact file paths always.
- Complete code in every step — if a step changes code, show the code.
- Exact commands with expected output.
- DRY, YAGNI, TDD, frequent commits.
- Signed commits (`git commit -S`).

## Cross-refs

- `brainstorming` skill — the step before this one (produces the spec).
- `@explore` agent — delegate spec reading, codebase exploration, and file discovery (Plan agent cannot read files directly).
- `@scout` agent — delegate web research and external dependency inspection.
- `@docs-writer` agent — delegate writing the plan file to disk if the user requests it.
- `executing-plans` skill — the step after this one (executes the plan).
- `@tdd` agent — executes each task in Red → Green → Refactor cycles.
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
