# CI Failures Fix: killProcessTree + macOS Shell Portability

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Fix the two CI failure surfaces on `feat/kyau-50-eval-runner-macos-portability`: the Pest `killProcessTree` POSIX-fallback test (Linux) and the 7 macOS shell test failures from Bash 3.2 + GNU-isms.

**Architecture:** (1) Replace the flat `pkill -P` in `killProcessTree`'s no-setsid fallback with a recursive `pgrep -P` descendant walk that kills the full process tree, handling the double-shell `proc_open` introduces. (2) Replace 4 GNU-only constructs in `validate-harness.sh` with POSIX equivalents. (3) Install Homebrew Bash 5 + npm dependencies on the macOS CI job so the validator's Bash 4+ associative-array gate passes.

**Tech Stack:** PHP 8.5 (Pest v4), Bash, GitHub Actions, macOS (BSD userland)

## Global constraints

- PHP 8.5+, Pest v4 on PHPUnit 12, `pcov` coverage driver
- Minimum 80% line coverage on changed files
- Conventional Commits with `Plan-by: glm-5.2`, `Acked-by: deepseek-v4-pro`, `Signed-off-by: kyau <git@kyaulabs.com>`
- Signed commits (`git commit -S`)
- RCS headers on all modified source files (already present — preserve)
- `declare(strict_types=1)` on all PHP files (already present — preserve)
- Never edit `cdn/css/*.min.css` or `cdn/javascript/*.min.js`

---

### Task 1: Recursive descendant walk in `killProcessTree` fallback

**Files:**
- Modify: `.opencode/evals/bin/includes/EvalRunner.php:478-512` (killProcessTree method + PHPDoc)
- Modify: `.opencode/evals/bin/includes/EvalRunner.php` (insert new `collectDescendantPids` method after line 512)
- Test: `tests/Unit/Eval/RunnerTest.php:543-586` (existing failing test — the Red)

**Interfaces:**
- Consumes: `posix_kill` (PHP posix extension), `SIGKILL` constant (pcntl), `exec()`, `escapeshellarg()`
- Produces: `collectDescendantPids(int $rootPid): array` — new private method, returns `list<int>` of descendant PIDs excluding `$rootPid`

**Context:** The existing test at line 543 (`killProcessTree kills direct children without setsid (POSIX fallback)`) is already Red on CI — it has never passed. The test overrides `hasSetSid()` → `false`, spawns `sh -c 'sleep 30 & echo $! > marker; wait'` with a 1s timeout, and asserts the `sleep 30` child is dead after 500ms. It fails because PHP's `proc_open` wraps string commands in `sh -c`, creating a potential double-shell that makes `sleep 30` a grandchild of `$pid` — invisible to the flat `pkill -P <pid>` in the current fallback.

### Task 2: Replace GNU-isms in `validate-harness.sh` for BSD portability

**Files:**
- Modify: `.github/scripts/validate-harness.sh:63` (`head -1` → `head -n 1`)
- Modify: `.github/scripts/validate-harness.sh:292` (`find -not` → `!`)
- Modify: `.github/scripts/validate-harness.sh:330` (`\t` in awk → `[[:space:]]`)
- Modify: `.github/scripts/validate-harness.sh:409` (`\s` in grep → `[[:space:]]`)
- Test: `tests/Shell/validate-harness_test.sh` (existing — passes on Linux, will pass on macOS after Task 3)

### Task 3: Install Homebrew Bash 5 + npm dependencies on macOS CI

**Files:**
- Modify: `.github/workflows/ci.yml:128-166` (macOS CI job — add 3 new steps)

### Task 4: Verify both CI jobs pass

**Files:** None (verification only)
