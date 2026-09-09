---
name: tdd-php
description: Use for PHP/Pest development alongside the Core tdd skill. Supplies native test commands, module conventions and the 90% changed-file coverage default.
compatibility: "PHP 8.5+, Pest PHP 5, PHPUnit 13, Composer"
derived-from: obra/superpowers (MIT, © Jesse Vincent); glebis/claude-skills (MIT, © Gleb)
---

# PHP/Pest TDD

Use the Core `tdd` skill's one-behavior-at-a-time Red → Green → Refactor cycle.
Follow project instructions over module defaults.

## Project setup

Inspect `composer.json`, `phpunit.xml` and `tests/Pest.php` before running tests.
Use the project's existing commands and structure. If test tooling is absent,
use the module setup skill or ordinary Composer setup within the requested scope;
do not require global Prism readiness or an adapter protocol.

For Pest projects, use `vendor/bin/pest --init` only if bootstrap is absent. Use
PHPUnit's default test case unless the project defines a shared test case. Put
architecture tests in discovered test files, not in `tests/Pest.php`.

Read `../../docs/tests.md` for test design, `../../docs/conventions.md` for source
style, and mocking/refactoring guidance only when needed.

## Develop and verify

```bash
vendor/bin/pest tests/Unit/ExampleTest.php
vendor/bin/pest --filter='behavior under test'
vendor/bin/pest --coverage --coverage-clover=tests/coverage.xml
```

Replace example paths/filters with actual project tests. Confirm the first test
fails for the missing behavior, implement the minimum fix, then rerun affected
tests. Use public seams, independent expected values and boundary-only mocks.

Run browser tests only when relevant or included in the broader suite. Use the
project's test-server setup, preserve occupied services and clean up only owned
processes. For visual changes, use applicable frontend/visual-review skills and
inspect the resulting images; do not claim visual validation from code alone.

## Coverage

The default is **90% line coverage per changed PHP file in the coverage source
set**, not a substitute for behavior-focused tests. Generate Clover coverage and
pass the task's changed PHP paths on stdin to `../../scripts/coverage-gate.php`
(relative to this skill). Invoke it with PHP and the Clover path; use `--root`
when the working directory is not the consumer root. `--min=N` implements an
explicit project/user threshold override.

Inspect warnings for changed executable files outside the coverage source set;
register relevant source files rather than hiding them. Report unavailable or
skipped coverage honestly. Do not impose an additional whole-project threshold
unless the project requests one.

## Completion

Run relevant tests and lint via `/check-php`, verify actual results and commit
logical changes with `conventional-commits`. RCS headers, modelines, naming and
PHP documentation follow module/project conventions, not Core-wide enforcement.

## Gotchas

- Overall coverage can hide an untested changed file.
- A coverage percentage is not proof of useful assertions.
- Avoid starting browser services for a focused pure-unit test.
