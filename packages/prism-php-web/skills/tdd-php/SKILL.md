---
name: tdd-php
description: "Use for the PHP/Pest-specific half of TDD: test framework, coverage tooling, lint. Load alongside the core tdd skill in PHP projects."
compatibility: "PHP 8.5+, Pest PHP 5, PHPUnit 13, Composer"
derived-from: obra/superpowers (MIT, © Jesse Vincent); glebis/claude-skills (MIT, © Gleb)
---

# PHP/Pest Test-Driven Development

Load this skill alongside the core `tdd` skill. The core skill owns the
Red-Green-Refactor cycle, vertical slicing, behavior-through-public-interface
discipline, and boundary-only mocking. This adapter owns the PHP/Pest commands,
test layout, coverage gate, lint, and file conventions.

## Reference docs

This adapter has supporting reference docs at
`packages/prism-php-web/docs/`. They are referenced by path below (not as
markdown links). Use the Read tool to load each one on a need-to-know basis —
don't preemptively load all three; pull each in exactly when the step that
needs it comes up. Treat their contents as mandatory once loaded.

- `packages/prism-php-web/docs/tests.md` — read **before writing your first
  test**. Worked examples of good vs. bad tests, including tautological tests
  and implementation-coupling anti-patterns. The rules below summarize; the
  doc is authoritative.
- `packages/prism-php-web/docs/mocking.md` — read only if the behavior you're
  testing touches a system boundary. Full mocking guidelines and boundary-
  interface design.
- `packages/prism-php-web/docs/refactoring.md` — read once you reach the
  refactor step. Refactor-candidate checklist.
- `packages/prism-php-web/docs/conventions.md` — read before creating the first
  PHP or test file. File naming, indentation, PHP standards, and arch tests.

## Pest bootstrap and test case

If `tests/Pest.php` does not exist, run `prism-tool run pest -- --init` before
writing tests. This creates the Pest bootstrap.

> [!WARNING]
> `pest --init` generates a **bare** `Pest.php` (stock scaffolding only —
> no arch tests). After running it, create
> `tests/Unit/Harness/ArchTest.php` with the three filesystem-walker arch
> tests described in `packages/prism-php-web/docs/conventions.md` (Arch Tests
> section). Do not append `arch()` blocks to `Pest.php` — they will not execute.

Pest closures use `PHPUnit\Framework\TestCase` by default. If the project has a
custom `Tests\TestCase`, bind it only for the directories that need its shared
setup in `tests/Pest.php`:

```php
pest()->extend(Tests\TestCase::class)->in('Feature');
```

Keep global Pest configuration and project-wide helper functions in
`tests/Pest.php`; keep reusable test-case lifecycle setup in
`tests/TestCase.php` when that class exists.

## PHP/Pest vertical slices

For the first behavior in the core `tdd` skill's tracer bullet:

- **Red.** Write one Pest test for that behavior in the appropriate `tests/`
  subdirectory (`Unit/`, `Feature/`, `Integration/`, or `Browser/`). Run
  `prism-tool run pest --` and confirm it **fails** with a meaningful error, not
  a syntax error. Show the failing output.
- **Green.** Write the minimum production code to make that one test pass —
  nothing more. Do not implement behaviors you haven't written a test for yet.
  Run `prism-tool run pest --` again and confirm it passes. Show the passing
  output.

For each remaining behavior, one at a time:

- **Red.** Write the next single test → run the suite → confirm it fails
  meaningfully.
- **Green.** Write only enough code to pass that test → run the suite →
  confirm everything is green.

Use a focused Pest path or `--filter` during each cycle (`prism-tool run pest
-- <path> --filter=...`), then run the full applicable suite before completion.

## Frontend slices

When the slice touches presentation PHP/HTML, SCSS, JavaScript, visual,
responsive, progressive-enhancement, or accessibility work:

1. Detect the frontend surface and plan a narrow slice.
2. Load `frontend-design`, `frontend-architecture`, `scss-mobile-first`, and
   `accessibility` as applicable before writing the failing test.
3. Use their standards to select observable behavior, verify Red, implement the
   approved slice, rerun tests, and reach Green.
4. Load `visual-review` after Green for every changed visual slice.
5. Run:

   ```bash
   prism-tool run playwright -- test visual_review.spec.mjs --workers=1 --output tests/Browser/Screenshots/.playwright --reporter=line
   ```

6. Read every generated PNG, repair visual failures, rerun behavior tests, and
   recapture the complete affected evidence set.
7. Present the configured mobile and desktop milestone set and wait for user
   confirmation before declaring visual completion.

## Test quality rules

- Use `describe()` to group scenarios for the same unit/function.
- Use `it()` for individual cases with a clear plain-English behavior
  description.
- Use Pest datasets (`->with([...])`) when the same behavior must hold across
  multiple inputs.
- Do NOT write tests that only assert a method exists, always return true, or
  exist solely to inflate coverage.
- Do NOT write tautological tests — the expected value must be an independent
  literal or worked example, never recomputed the way the code computes it.
  If unsure, read `packages/prism-php-web/docs/tests.md`.
- Do NOT test private/internal implementation details — test the public
  interface.
- Follow Arrange / Act / Assert inside each test closure.
- Apply the project RCS header to every new test file (see the `rcs-header`
  skill). The pre-commit hook manages the canonical marker.
- Name test files in PascalCase with a `Test.php` suffix
  (`UserAuthenticationTest.php`).

## Mocking rules

Mock only at system boundaries — external APIs, databases (prefer a real test
DB when practical), time/randomness, the file system. Never mock your own
classes or internal collaborators; if a test needs to mock an internal
collaborator to pass, it's coupled to implementation, not behavior. Before
writing any mock, read `packages/prism-php-web/docs/mocking.md` for the full
guidelines, including designing boundary interfaces so they stay easy to
mock.

## Coverage check

Run:

```bash
PEST_BROWSER_BASE_URL="http://localhost:8080" prism-tool run pest -- --coverage
```

Use this exact coverage invocation even when the current suite has no browser
tests. The environment variable is inert for non-browser tests and keeps TDD,
CI, aggregate checks, and generated plans on one adapter-owned command. Report
coverage for the files you touched. Minimum 80% line coverage on
changed files is enforced by
`packages/prism-php-web/scripts/coverage-gate.php`. Feed it the Clover report:

```bash
git diff --name-only --diff-filter=AM -- '*.php' \
  | php packages/prism-php-web/scripts/coverage-gate.php tests/coverage.xml
```

If line coverage for the new code is below 80%, identify the uncovered lines
and either add a test for a missed behavior or explain why the line is
legitimately excluded (e.g. defensive code unreachable through the public
interface).

## Lint and file ceremony

Run the adapter gate `/check-php`, which covers:

```bash
prism-tool run php-cs-fixer -- fix --dry-run --diff
prism-tool run stylelint -- "cdn/sass/**/*.scss" --allow-empty-input
prism-tool run eslint -- "cdn/js/**/*.js" --ignore-pattern "*.min.js" --no-error-on-unmatched-pattern
PEST_BROWSER_BASE_URL="http://localhost:8080" prism-tool run pest -- --coverage
```

- PSR-12 code style is enforced by `php-cs-fixer`.
- `declare(strict_types=1)` is required on all backend classes.
- PHP classes/methods/functions require PHPDoc (PSR-5) with params, return
  types, and exceptions. Load `rcs-header` for the exact format.
- Every PHP and test source file carries the RCS header and applicable vim
  modeline managed by the pre-commit hook.

## Cross-refs

- `tdd` — mandatory language-agnostic Red-Green-Refactor discipline.
- `pest-browser` — browser plugin setup and critical-flow examples.
- `rcs-header` — source header, vim modeline, and PHPDoc format.
- `/check-php` — aggregate PHP/web pre-push gate.

## Gotchas

- *Running only the focused Pest test* — run the full applicable suite before
  completion.
- *Putting arch tests in `tests/Pest.php`* — generated `arch()` blocks there do
  not execute; use `tests/Unit/Harness/ArchTest.php`.
- *Guessing a custom TestCase binding* — use PHPUnit's default unless the
  project already defines `Tests\TestCase` and needs its setup.
- *Reporting overall coverage only* — the gate applies to each changed PHP
  file in the coverage source set.
