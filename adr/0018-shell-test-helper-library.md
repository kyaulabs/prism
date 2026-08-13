# 0018. Shell Test Helper Library

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-13

## Status

Accepted

## Context

`tests/Shell/` contains 20 `*_test.sh` files (run via `bash` in CI on both
Ubuntu and macOS). Copy-paste boilerplate — color variables (`RED`, `GREEN`,
`RESET`), `pass()`/`fail()` functions, `RESULT_FILE` lifecycle with `trap`
cleanup, and summary blocks — is duplicated across ~14 of them. Drift is
already visible:

- `install-hooks_test.sh` and `ci_npm_test.sh` lack the `: "${total_pass:=0}"`
  / `: "${total_fail:=0}"` default-value guards present in 11 other files.
- `pass()` formatting differs between files: some use a two-space indent
  (`"  ${GREEN}PASS${RESET}"`), others omit it (`"${GREEN}PASS${RESET}"`).
- `check_resolution_test.sh` copies the pre-commit CS-fixer resolution block
  three times as heredocs, and the copies already differ from the real
  `.github/hooks/pre-commit` block.
- A local `setup_test_repo()` function is duplicated in two files
  (`pre_commit_robustness_test.sh`, `pre_commit_index_lint_test.sh`).

A partial shared library, `tests/Shell/lib/test_helpers.sh`, already exists
with `pass()`, `fail()`, `make_file_stale()`, `REPO_ROOT`, and basic color
variables, sourced by only 2 of the 20 files.

Issue #29 (gpgsign) also intersects: a global `commit.gpgsign=true` config
causes hangs during `git commit` inside test repos. Every test that calls
`git init` must add `git config commit.gpgsign false`. A shared `git init`
helper would centralize this.

## Decision

We extend `tests/Shell/lib/test_helpers.sh` into the single source of truth
for shell test infrastructure. The lib provides:

- **Color variables:** `RED`, `GREEN`, `RESET`, `YELLOW`.
- **`pass()`/`fail()`:** unified to the two-space-indent variant.
- **`setup_result_file()`:** creates `RESULT_FILE=$(mktemp)`, installs an
  EXIT trap that removes `RESULT_FILE` plus every directory registered via
  `register_temp_dir()`.
- **`register_temp_dir()`:** tracks a temp directory for EXIT-trap cleanup.
- **`print_summary()`:** tallies PASS/FAIL lines in `RESULT_FILE`, prints a
  boxed summary, embeds `: "${total_pass:=0}"` / `: "${total_fail:=0}"`
  guards, and exits non-zero on any failure.
- **`git_init_test_repo()`:** `git init` + `commit.gpgsign false` + test
  user identity (fixes Issue #29).
- **`setup_linter_repo()`:** composes `git_init_test_repo` with symlinked
  `vendor`/`node_modules` and copied linter configs for tests that invoke
  the real pre-commit hook.

All `tests/Shell/*_test.sh` files source this lib and drop inline
boilerplate. `lib_test.sh` (the lib's own test) dogfoods `print_summary()`
instead of its `wc -l` arithmetic summary.

`check_resolution_test.sh` is rewritten to invoke the real
`.github/hooks/pre-commit` against fixture repos instead of testing stale
heredoc copies (proven viable via prototype, 2026-07-13).

`gpgsign_guard_test.sh` is extended to also scan `test_helpers.sh`,
asserting `git_init_test_repo` contains `commit.gpgsign false`.

## Consequences

### Positive
- Single source of truth eliminates copy-paste drift. A bugfix in the lib
  fixes all consumers.
- `git_init_test_repo` centralizes the `commit.gpgsign false` pattern
  (Issue #29), reducing the odds of a forgotten guard.
- `check_resolution_test.sh` tests the *actual* pre-commit hook, not a stale
  copy — drift detection becomes impossible by construction.
- New shell tests simply `source` the lib and call helpers; they inherit
  consistent output formatting.

### Negative
- All shell test files gain a dependency on `test_helpers.sh`. A breaking
  change to the lib requires updating every consumer (acceptable — the lib
  is versioned in the same repo and tested by `lib_test.sh`).
- `pass()` formatting changes cosmetically for 6 files (variant B → variant
  A two-space indent). No automation parses the PASS/FAIL text; CI only
  checks exit codes.

### Neutral / follow-up
- `gpgsign_guard_test.sh` remains as a belt-and-suspenders static scanner.
  Once all files have migrated, it can be tightened to forbid bare `git
  init` entirely.
- This ADR should be referenced in CONTEXT.md under "Architectural
  Decisions."

## Alternatives Considered

### Create a new `lib.sh` instead of extending `test_helpers.sh`
Rejected: two competing libraries in the same directory invite confusion.
Extending the existing `lib/test_helpers.sh` makes the migration a clean
extraction rather than a greenfield, and `lib_test.sh` already tests the
existing functions.

### Migrate only the 7 files originally cited in Issue #102
Rejected: the 13 newer files already show the same boilerplate patterns and
some show the same drift. A partial migration guarantees future drift
between migrated and unmigrated files. Completing the migration for all 20
files eliminates the problem completely.

### Extract the real pre-commit resolution block dynamically at test time (sed)
Rejected: fragile — format changes to the hook break the extraction. A
fixture-based hook invocation tests behavior, not textual representation.

### Keep the `check_resolution_test.sh` heredocs and add a drift-detection test
Rejected: two copies of the same logic (heredoc + drift-detection test)
still means the heredoc is the "test source of truth," not the hook. A
fixture-based test makes the hook the single authoritative source.
