---
name: tdd
description: Use for development. Implement one observable behavior at a time through Red, Green and Refactor, testing public interfaces and mocking only system boundaries.
derived-from: obra/superpowers (MIT, © Jesse Vincent); glebis/claude-skills (MIT, © Gleb)
---

# Test-Driven Development

TDD is mandatory for development. Keep the workflow small, not optional.

## Prepare

Read the relevant implementation and representative tests. Use project/module
commands and conventions. If no module is installed, inspect the project's
native test setup; do not require adapter installation to begin. Clarify missing
behavioral decisions, not discoverable facts.

Identify observable acceptance criteria and the highest practical public test
seam. For a bug, reproduce the failure first. Prefer real lightweight boundaries;
mock external services, time, filesystem or processes only when necessary.

## One vertical slice

1. **Red:** write one test for the next behavior. Run it and confirm failure for
   the expected missing behavior, not syntax or broken setup. Show the result.
2. **Green:** implement only enough to pass that test. Run the focused tests and
   relevant existing tests; confirm and report the result.
3. **Refactor:** while green, simplify production and test code. Rerun affected
   tests after each meaningful change. Avoid speculative abstractions.
4. Repeat for the next behavior, guided by what the previous slice revealed.

Never write all tests first and then all implementation. Do not weaken a correct
test to hide a defect, or manufacture a failing test for a prose-only edit.
For behavior-preserving refactors, retain characterization coverage and run it
before and after; add tests first when important behavior lacks coverage.

## Test quality

- Test behavior through public interfaces, not private functions or source spelling.
- Expected values must be independent examples, not the implementation repeated.
- Do not mock internal collaborators merely to make implementation convenient.
- Keep arrange/act/assert clear and test failures diagnostic.
- When deleting a feature, test retained boundaries/callers and remove tests that
  assert the deliberately deleted policy. Do not keep dead code for those tests.

## Finish

Run relevant tests, lint and module/project coverage checks; broaden verification
for cross-cutting changes. Use ordinary project commands and test-server tooling,
not a mandatory launcher or global readiness gate. Clean up only owned processes
and temporary files. Report unavailable checks honestly.

Use `verification-before-completion` and commit verified logical changes with
`conventional-commits`. At non-trivial task completion use `code-review`; do not
repeat the full review for each tiny implementation step.

## Gotchas

- A setup error is not the intended Red; fix the setup and demonstrate the bug.
- Never claim a command ran because a plan contains it.
- Numeric coverage does not replace tests of meaningful behavior.
