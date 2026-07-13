---
description: Audit an existing test suite for quality problems — coverage padding, missing edge cases, weak assertions. Produces a report only; makes no code changes. Invoke when reviewing tests before a PR or release.
temperature: 0.1
mode: subagent
permission:
  edit: deny
  bash:
    "*": deny
    "ls*": allow
    "cat*": allow
    "tail*": allow
    "head*": allow
    "grep*": allow
    "find*": allow
    "php -d pcov.enabled=1 vendor/bin/pest*": allow
    "git log*": allow
    "git show*": allow
    "git status*": allow
    "git diff*": allow
  webfetch: deny
  task: deny
---

Audit the test suite for this project. Do NOT make any code changes — produce a report only.

## Gather coverage baseline

Before auditing, run the coverage command to get the current baseline:

```bash
php -d pcov.enabled=1 vendor/bin/pest --coverage
```

You have bash permission for this command. Capture and review the full output
— it is your baseline for the audit.

## What to audit

For each test file you find under `tests/`:

1. **Missing behaviors** — Are the happy path, boundary conditions, invalid input, and error paths all covered? List what is missing.
2. **Weak assertions** — Are there tests that assert `true`, assert a method exists, or make no meaningful assertion? Flag them by file and line.
3. **Coverage padding** — Are there tests that exist only to push a percentage higher without verifying real behavior? Flag them.
4. **Duplicate tests** — Are there tests with different descriptions but identical or near-identical logic? Flag them.
5. **Implementation coupling** — Are any tests asserting on private methods, internal state, or implementation details instead of observable behavior? Flag them.
6. **Missing edge cases** — For each tested function/class, list edge cases that are clearly not covered (null inputs, empty collections, zero values, max values, exception paths).

## Output format

Produce a prioritized list:

**Critical** — Tests that give false confidence (always pass regardless of correctness, or test the wrong thing).
**High** — Missing tests for error/exception paths on core functionality.
**Medium** — Missing boundary/edge case coverage.
**Low** — Style issues, duplicate tests, or minor gaps.

For each item include the file name, a one-line description of the problem, and a concrete suggestion for what test should be added or fixed.

End the report with an overall assessment: is this test suite providing real confidence, or is the coverage percentage misleading?
