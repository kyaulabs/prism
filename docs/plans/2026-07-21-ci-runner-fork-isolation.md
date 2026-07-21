# Plan: CI Runner Fork-Isolation (Issue #179)

**Date:** 2026-07-21
**Spec:** `docs/specs/2026-07-21-ci-runner-fork-isolation-spec.md`
**ADR:** `adr/0035-ci-runner-fork-isolation.md` (Accepted)
**Architect verdict:** GO-WITH-CONDITIONS (`ADR-required: 0035` — satisfied)
**Branch:** `fix/kyau-8249-ci-runner-fork-isolation`

## Goal

Resolve issue #179 (Critical CI/CD supply-chain vulnerability) by migrating the
`check` job to `ubuntu-latest`, eliminating workflow-source `sudo`, setting
`persist-credentials: false` on all checkouts, adding `--no-scripts` to composer
installs, and adding a pip cache for semgrep. Driven by four new Shell
regression tests + one ADR contract test, Red → Green → Refactor per slice.

## Execution mode

Inline batch with checkpoints (executing-plans skill). Each slice writes the
test first, runs it to confirm Red (fails for the right reason), makes the
ci.yml edit, runs it to confirm Green, then proceeds.

## Slices

### Slice 1 — AC1: runner hosted
- **Test:** `tests/Shell/ci_runner_hosted_test.sh` — asserts no `runs-on:` line
  in `.github/workflows/ci.yml` contains `self-hosted`.
- **Edit:** `runs-on: [self-hosted, linux]` → `runs-on: ubuntu-latest`.

### Slice 2 — AC3: persist-credentials false
- **Test:** `tests/Shell/ci_persist_credentials_test.sh` — asserts the count of
  `persist-credentials: false` equals the count of `actions/checkout@` uses,
  and both are ≥ 1.
- **Edit:** add `persist-credentials: false` under `with:` on both checkouts
  (`check` job + `check-macos` job).

### Slice 3 — AC2: no workflow-source sudo
- **Test:** `tests/Shell/ci_no_sudo_test.sh` — asserts no non-comment line in
  the file contains the `sudo` token. (Playwright's transitive sudo is internal
  to the trusted action, not a `run:` token — see ADR-0035's caveat.)
- **Edit:** rewrite the shellcheck install (line ~105) and gitleaks install
  (line ~223) to install into `$HOME/.local/bin` via `$GITHUB_PATH`, with an
  inline `export PATH="$HOME/.local/bin:$PATH"` for the same-step version check
  (since `$GITHUB_PATH` only affects subsequent steps).

### Slice 4 — Hardening: composer --no-scripts
- **Test:** `tests/Shell/ci_no_composer_scripts_test.sh` — asserts every
  `composer install` line carries `--no-scripts`.
- **Edit:** add `--no-scripts` to both `composer install` steps (`check` +
  `check-macos`). Verify `/check` parity: ADR-0025 parity is about gates, not
  install; confirm no local script runs `composer install` (it doesn't — `/check`
  assumes deps are installed).

### Slice 5 — Perf: pip cache for semgrep
- **No test** (caching is perf, not behavior; verified by observing restore on
  a follow-up run).
- **Edit:** add an `actions/cache@v4` step before "Install Semgrep" keyed to
  `~/.cache/pip` by the semgrep version.

### Slice 6 — ADR-0035 contract (machine-checked)
- **Test:** extend `tests/Shell/ci_local_parity_test.sh` (or a new
  `ci_runner_isolation_parity_test.sh`) to grep-assert that
  `adr/0035-ci-runner-fork-isolation.md` exists with `Status: Accepted`,
  mirroring how the existing test §1 asserts ADR-0025. Locks in the
  load-bearing interpretive claim.
- **Edit:** none (test-only).

## Verification

- `bash tests/Shell/ci_runner_hosted_test.sh &&
  bash tests/Shell/ci_persist_credentials_test.sh &&
  bash tests/Shell/ci_no_sudo_test.sh &&
  bash tests/Shell/ci_no_composer_scripts_test.sh` — all Green.
- Full `tests/Shell/` suite — no regressions (esp. `ci_local_parity_test.sh`,
  `ci_npm_test.sh`, `semgrep_ci_test.sh`).
- `php -d pcov.enabled=1 vendor/bin/pest --coverage` — green (no PHP changed;
  coverage gate is a no-op for this diff).
- AC checklist: AC1 ✓ (Slice 1), AC2 ✓ (Slice 3), AC3 ✓ (Slice 2),
  AC4 ✓ (trigger block unchanged; push to main/develop still fires full
  `check` on ubuntu-latest).
- `/check` gate + `@code-review` (4-axis, incl. semgrep secret scan).

## Commit sequence (proposed)

1. `docs(spec): add CI runner fork-isolation spec`
2. `docs(adr): add ADR-0035 CI runner fork-isolation` (+ CONTEXT.md one-liner)
3. `docs(plan): add CI runner fork-isolation implementation plan`
4. `fix(ci): isolate fork PRs from self-hosted runner` (+ tests, `Fixes: #179`,
   footers)
