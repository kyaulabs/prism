---
name: test-audit
description: Use when auditing an existing test suite for quality problems — coverage padding, missing behaviors and edge cases, weak assertions, duplication, and implementation coupling. Produces a report only and makes no code changes.
---

# Test Audit

Audit the test suite for this project. Do NOT make any code changes — produce a
report only.

## Gather the baseline

Use applicable module TDD guidance when available, otherwise inspect the project's
native test configuration and documented commands. Run its relevant test/coverage
baseline and review the full output. Ask only if inspection leaves a material
choice unresolved; no module installation is required.

If coverage tooling is unavailable, continue the qualitative audit and mark
coverage evidence SKIPPED with the exact reason.

## What to audit

For each test file in the relevant project test roots:

1. **Missing behaviors** — Are the happy path, boundary conditions, invalid
   input, and error paths covered? List what is missing.
2. **Weak assertions** — Are there tests that assert a constant truth, assert
   only that a symbol exists, or make no meaningful assertion? Flag them by
   file and line.
3. **Coverage padding** — Are there tests that exist only to push a percentage
   higher without verifying real behavior? Flag them.
4. **Duplicate tests** — Are there tests with different descriptions but
   identical or near-identical logic? Flag them.
5. **Implementation coupling** — Do tests assert private methods, internal
   state, call order, or implementation details rather than observable
   behavior? Flag them.
6. **Missing edge cases** — For each tested public behavior, list clearly
   absent edge cases (empty values, zero, maxima, malformed input, exception
   paths, timing, or concurrency where applicable).
7. **Boundary realism** — Are mocks limited to actual system boundaries? Flag
   tests that mock internal collaborators or replace the behavior under test.

## Output format

Produce a prioritized list:

- **Critical** — gaps concealing plausible systemic compromise or catastrophic
  failure; a vacuous assertion alone does not establish critical impact.
- **High** — gaps with demonstrated significant behavioral or security risk.
- **Medium** — missing boundary/edge-case coverage.
- **Low** — style issues, duplicate tests, or minor gaps.

For each item include the file and line, a one-line description of the
problem, the observable behavior at risk, and a concrete test to add or fix.

End with:

```text
## Test Audit Summary

Baseline: PASS / FAIL / SKIPPED (<command and evidence>)
Critical: N · High: N · Medium: N · Low: N
Confidence: REAL / MIXED / MISLEADING
Reason: <one line>
```

## Rules

- Report only; never edit tests or production code.
- Test behavior through public interfaces, not implementation details.
- Coverage percentage is evidence, not the verdict. High coverage can still be
  misleading.
- Do not invent stack conventions; use project policy and applicable module guidance.
- If the baseline command fails, include the failure and continue any audit
  that remains possible from source.

## Cross-refs

- `tdd` skill — language-agnostic test quality and boundary-mocking rules.
- The active adapter's TDD skill — concrete framework, test roots, commands,
  coverage, and lint.
- `code-review` skill — consumes this audit as review evidence when requested.

## Gotchas

- *Equating coverage with confidence* — inspect assertions and behaviors; a
  high percentage can be padding.
- *Guessing the test command* — inspect native project configuration before asking.
- *Auditing private structure instead of public risk* — every finding should
  name the observable behavior that could regress.
