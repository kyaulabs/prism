# Issue #49: Arch Tests Silently Discarded — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Replace the dead `arch()` blocks in `tests/Pest.php` with working filesystem-walker convention tests that actually scan procedural PHP files, remove the unused pest-plugin-arch dependency, and correct all documentation.

**Architecture:** New `tests/Unit/Harness/ArchTest.php` follows the proven `RcsHeaderConventionTest.php` pattern — `RecursiveDirectoryIterator` scans all PHP files excluding `vendor/`, `node_modules/`, `aurora/`, `cdn/css/`, `cdn/javascript/`, and `tests/Semgrep/` (intentionally vulnerable SAST fixtures). Three tests: vacuity guard, debug-function ban, strict-types enforcement. pest-plugin-arch is removed entirely — its autoload-based DSL cannot see procedural code.

**Tech Stack:** PHP 8.5+, Pest v4, RecursiveDirectoryIterator (no new dependencies)

## Global constraints

- PHP 8.5+ (typed properties, named arguments)
- No dependencies added — pest-plugin-arch is **removed**
- RCS headers + vim modeline on every new/modified source file (per `rcs-header` skill)
- Tests run via `php vendor/bin/pest`
- Exclude `aurora/` submodule from all scans (separate repo, companion issue)
- Exclude `tests/Semgrep/` from debug-function and strict-types scans (intentionally vulnerable fixtures)
- Commit footers: `Plan-by: glm-5.2`, `Acked-by: deepseek-v4-pro`, `Signed-off-by: kyau <git@kyaulabs.com>`
- Acceptance criteria from issue #49:
  - Planted `var_dump()` in `backend/env.php` fails `vendor/bin/pest`
  - Planted missing `declare(strict_types=1)` in a scanned file fails the suite
  - Vacuity guard fails if the arch scan universe is empty
  - Docs updated to new location/instructions

---

### Task 1: Write ADR 0004

**Files:**
- Create: `adr/0004-filesystem-walker-arch-tests.md`
- Modify: `CONTEXT.md:50` (add ADR to list)

### Task 2: Create `tests/Unit/Harness/ArchTest.php` (TDD via @tdd)

**Files:**
- Create: `tests/Unit/Harness/ArchTest.php`

### Task 3: Remove dead `arch()` blocks from `tests/Pest.php`

**Files:**
- Modify: `tests/Pest.php`

### Task 4: Remove `pestphp/pest-plugin-arch` dependency

**Files:**
- Modify: `composer.json`
- Regenerate: `composer.lock`

### Task 5: Update documentation

**Files:**
- Modify: `.opencode/docs/conventions.md`
- Modify: `.opencode/docs/tests.md`
- Modify: `README.md`
