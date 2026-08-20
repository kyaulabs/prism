---
name: tdd
description: Use for any feature, bug fix, or behavior-changing implementation. Enforces strict Red-Green-Refactor through vertical slices, tests behavior through public interfaces, mocks only at system boundaries, and verifies every cycle before continuing.
derived-from: obra/superpowers (MIT, © Jesse Vincent); glebis/claude-skills (MIT, © Gleb)
---

# Test-Driven Development

Operate in strict TDD mode. Follow the Red-Green-Refactor cycle without
exception, one observable behavior at a time.

## The task

The implementation task is described in the current invocation or approved
plan task. Treat that text as the work to perform. Do not broaden its scope.

## Activate the stack adapter

This core skill owns language-agnostic TDD discipline. For the test framework,
test locations, coverage tooling, lint, file ceremony, and focused commands,
load the active adapter's TDD skill (for example, `tdd-php`). If no stack skill
is loaded, ask the user which adapter applies before writing the first test.

Load adapter reference docs only at the step that needs them:

- test conventions — before the first test
- mocking guidance — only when the behavior crosses a system boundary
- refactoring guidance — once Green is established

## Core principle

Tests verify **behavior through public interfaces**, not implementation
details. Code can change entirely; tests should not. A good test reads like a
specification and survives refactors because it does not care about internal
structure.

**Never write all the tests first and then all the implementation** (horizontal
slicing). That produces tests verifying *imagined* behavior. Go vertical: one
test → one small implementation → repeat. Each new test responds to what you
learned by implementing the previous one.

```text
WRONG (horizontal): RED: test1..test5 → GREEN: impl1..impl5
RIGHT (vertical):   RED→GREEN: test1→impl1, test2→impl2, test3→impl3, ...
```

If you are about to write a second test before the first is green, stop and
implement the first behavior.

## Workflow

### Step 1 — Understand before writing anything

Read the relevant existing source files fully. If adding to an existing unit,
read it completely first. Read a representative sample of existing tests to
match conventions. If `CONTEXT.md` exists, read it so test names and interface
vocabulary match the project's domain language; respect relevant ADRs.

### Step 2 — Plan behaviors, not implementation

Before writing code:

- Identify the **observable behaviors** the implementation must have — not the
  internal steps.
- List them in priority order: happy path first, then boundary conditions,
  invalid/error input, then externally visible side effects.
- Identify opportunities for deep modules (small interface, deep
  implementation).
- Identify the highest public seam that exercises the real behavior.
- If interface or behavior priority is ambiguous, confirm with the user.

You cannot test every theoretical input. Focus on critical paths, boundaries,
and complex logic.

### Step 3 — Tracer bullet (first vertical slice)

Take the single most important behavior and run one full cycle:

- **Red.** Write exactly one test for that behavior at the public seam. Run the
  active adapter's focused test command and confirm it **fails for the expected
  reason**, not because of syntax, setup, or an unrelated error. Show the
  failing command and output.
- **Green.** Write the minimum production code to make that one test pass —
  nothing more. Do not implement behavior without a failing test. Run the same
  focused command and confirm it passes. Show the passing output.

This tracer bullet proves the path works end-to-end before you commit to more
structure.

### Step 4 — Incremental loop (remaining vertical slices)

For each remaining behavior, one at a time:

- **Red.** Write the next single test → run it → confirm a meaningful failure.
- **Green.** Write only enough code to pass that test → run the focused test
  and relevant suite → confirm Green.

Rules for every cycle:

- One test at a time. Never write test N+1 before test N is green.
- Only enough code to pass the current test — no speculative features.
- Keep tests focused on observable behavior through the public interface.
- Let what you learned from the previous slice inform the next test.

### Step 5 — Refactor

Only while Green, load the active adapter's refactoring guidance and look for
candidates: duplication → extract; long units → split by responsibility;
shallow modules → combine or deepen; feature envy → move logic; primitive
obsession → introduce a meaningful type when justified.

Clean up duplication, naming, or structure in both production code and tests.
Re-run the relevant suite after each refactor. **Never refactor while Red** —
restore Green first.

### Step 6 — Verify the completed task

Run the active adapter's:

1. focused tests
2. full applicable suite
3. changed-file coverage gate, when one exists
4. formatter/lint/static checks

Then load `verification-before-completion`. If any evidence is stale or fails,
the task is not done.

### Step 7 — Create the commit through the launcher

After verification, load `conventional-commits`. Select the type, optional
scope, subject, optional body, and optional issue reference from the work
performed. Delegate attribution, validation, signing, commit execution, and
post-commit verification to its single atomic `prism-tool commit create`
process. Validate plan-provided structured fields and correct them when needed.
The commit must be the only tool call in its assistant batch. Never duplicate
commit construction, ask for per-commit approval, or execute ordinary Git
commits directly.

## Test quality rules

- Use clear behavior descriptions in the active framework's conventions.
- Group related scenarios without hiding independent failures.
- Use data-driven cases when the same behavior must hold across multiple
  inputs.
- Do NOT write tests that only assert a symbol exists, always return true, or
  exist solely to inflate coverage.
- Do NOT write tautological tests — expected values must be independent
  literals or worked examples, never recomputed with the implementation's
  algorithm.
- Do NOT test private/internal implementation details.
- Keep arrange, act, and assert phases legible.
- Follow the active adapter's test naming, location, header, modeline, and
  documentation requirements.

## Mocking rules

Mock only at **system boundaries** — external services, persistence, time,
randomness, filesystem, process, or network. Prefer a real lightweight
boundary when practical. Never mock your own internal collaborators merely to
make a test pass; that couples the test to implementation rather than
behavior.

Before writing a mock, load the active adapter's mocking guide when one
exists. Design boundary interfaces so they are small, explicit, and easy to
replace without leaking internals.

## Existing code with no tests

1. Read the existing implementation fully first.
2. Write tests for what the code **should** do, one behavior at a time.
3. If a test reveals a bug, state it explicitly before fixing it.
4. Do not rubber-stamp accidental current behavior without verifying that it
   is correct.

## Checklist per cycle

```text
[ ] Only one new test since the last Green
[ ] Test describes behavior, not implementation
[ ] Test uses the highest practical public interface
[ ] Test would survive an internal refactor
[ ] Expected values are independent, not recomputed by the same algorithm
[ ] Mocks (if any) are at system boundaries only
[ ] Red failed for the expected reason and its output was shown
[ ] Code is minimal for this test — no speculative features
[ ] Focused test and applicable suite are green before the next behavior
```

## Cross-refs

- `executing-plans` skill — supplies approved task boundaries and review gates.
- `verification-before-completion` skill — evidence gate after the final
  cycle.
- `conventional-commits` skill — signed commit format and attribution.
- `domain-context` skill — canonical vocabulary for behavior names.
- The active adapter's TDD skill — framework, commands, coverage, lint, and
  file conventions.

## Gotchas

- *Writing multiple tests before Green* — that is horizontal slicing. Finish
  one behavior before starting the next.
- *A Red caused by broken setup* — Red must prove missing behavior, not a
  syntax/configuration mistake.
- *Mocking internal collaborators* — move the seam to a real system boundary.
- *Guessing stack commands* — load the adapter's TDD skill or ask which
  adapter applies.
- *Refactoring while Red* — restore Green before changing structure.
