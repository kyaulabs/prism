# 0004. Filesystem-Walker Architecture Tests

Date: 2026-07-08

## Status

Accepted

## Context

The template ships two architecture tests ("no debug functions", "strict types")
documented as "enforced automatically" in `.opencode/docs/conventions.md`.
However, these tests never execute:

1. The `arch()` blocks live in `tests/Pest.php` — Pest's configuration file,
   not part of any configured test suite in `phpunit.xml`. A planted
   `var_dump()` in `backend/env.php` passes with `Tests: 1 passed`.
2. Even if relocated to a test suite, pest-plugin-arch resolves its scan
   universe from autoloaded namespaces. `composer.json` uses classmap-only
   autoload (no PSR-4), and `backend/` contains only procedural PHP files
   (no classes). `expect('KYAULabs')` and the debug-function sweep match
   zero files.

The result: a documented CI-enforced convention is enforced nowhere, and every
seeded repo inherits the same false assurance.

Forces:
- **Procedural codebase** — `backend/` is procedural PHP, not class-based.
  pest-plugin-arch's autoload-based DSL fundamentally cannot scan it.
- **Existing pattern** — `tests/Unit/Harness/RcsHeaderConventionTest.php`
  already demonstrates a working filesystem-walker approach using
  `RecursiveDirectoryIterator`.
- **Minimal dependencies** — removing pest-plugin-arch reduces the dependency
  surface.
- **Seed propagation** — `tests.md` instructs `@tdd` to append `arch()` blocks
  to `Pest.php` in seeded repos, institutionalizing the bug.

## Decision

We replace pest-plugin-arch's DSL with filesystem-walker convention tests in
`tests/Unit/Harness/ArchTest.php`, following the `RcsHeaderConventionTest.php`
pattern. We remove `pestphp/pest-plugin-arch` from `composer.json`.

Three tests scan all PHP files (excluding `vendor/`, `node_modules/`, `aurora/`,
`cdn/css/`, `cdn/javascript/`, `tests/Semgrep/`):

1. **Vacuity guard** — asserts the scan universe is non-empty (≥1 PHP file).
2. **No debug functions** — scans for `\b(var_dump|print_r|dd|dump)\s*\(`.
3. **Strict types** — asserts every PHP file has `declare(strict_types=1)` in
   its first 10 lines.

## Consequences

- **Easier:** arch tests actually execute and catch violations in procedural
  code. A planted `var_dump()` in `backend/env.php` now fails the suite.
- **Easier:** no dependency on pest-plugin-arch's autoload-based scan universe.
  One less Composer package.
- **Easier:** consistent with the existing `RcsHeaderConventionTest` pattern —
  one mechanism for all harness convention tests.
- **Harder:** adding new arch checks requires writing PHP (recursive iterator
  + assertion) rather than a DSL one-liner. Acceptable trade-off for actually
  working.
- **Neutral:** `tests/Semgrep/` is excluded from debug-function and
  strict-types scans (intentionally vulnerable SAST fixtures).

## Alternatives Considered

- **Move `arch()` blocks to `tests/Unit/ArchTest.php` + add PSR-4 mapping for
  `backend/`** — rejected: `backend/` has no classes to map; PSR-4 maps
  namespaces to directories, and procedural files have no namespace. The
  strict-types check would still need a filesystem walker.
- **Move `arch()` blocks + use pest-plugin-arch for class-based checks, filesystem
  walker for procedural checks** — rejected: two mechanisms for similar checks
  is inconsistent and confusing. The filesystem walker handles both cases.
- **Keep pest-plugin-arch for future class-based arch tests** — rejected: the
  project is procedural by design (no MVC, no router). If namespaced classes
  are added later, a filesystem walker can scan them too.
