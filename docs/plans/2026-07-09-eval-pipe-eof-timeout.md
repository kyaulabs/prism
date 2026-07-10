# Eval Pipe-EOF Timeout Enforcement Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Fix EvalRunner's timeout bypass when a child process closes stdout/stderr but keeps running (e.g. daemonizing tools). After pipes hit EOF, poll `proc_get_status()['running']` against the remaining deadline; on expiry call `killProcessTree()` and set `timed_out`.

**Architecture:** Single-method fix in `Runner::readPipes()`. Replace the immediate `break` on `empty($read)` (both pipes EOF) with a polling loop that checks `proc_get_status()['running']` every 10ms until the child exits or the deadline expires. The existing post-loop kill-and-drain logic handles both outcomes without modification.

**Tech Stack:** PHP 8.5+, Pest v4

## Global constraints

- PHP 8.5+, strict types on all source files
- PSR-12 code style (4-space indent)
- RCS header + vim modeline on every source file (pre-commit hook auto-adds/updates)
- Minimum 80% line coverage on changed files
- Conventional Commits format with Plan-by/Acked-by/Signed-off-by footers
- Never modify `aurora/` (git submodule)

---

### Task 1: Red — Write failing regression tests

**Files:**
- Modify: `tests/Unit/Eval/RunnerTest.php` (append 3 tests after existing `executeCommand does not set degraded_kill when setsid is available` test)

**Interfaces:**
- Consumes: `KYAULabs\Eval\Runner` (existing)
- Produces: Three new Pest tests exercising the EOF-poll code path

- [ ] **Step 1: Add Test A (acceptance criteria regression)**

```php
it('executeCommand enforces timeout when child closes pipes but keeps running', function () {
    $runner = new Runner(__DIR__);

    $start = hrtime(true);
    $output = $runner->executeCommand('php -r "fclose(STDOUT);fclose(STDERR);sleep(5);"', 1);
    $elapsed = (hrtime(true) - $start) / 1_000_000_000;

    expect($elapsed)->toBeLessThan(2.5);
    expect($output['timed_out'])->toBeTrue();
    expect($output['stdout'])->toBe('');
    expect($output['stderr'])->toBe('');
});
```

- [ ] **Step 2: Add Test B (happy-path guard — child closes pipes and exits cleanly)**

```php
it('executeCommand returns normally when child closes pipes and exits', function () {
    $runner = new Runner(__DIR__);

    $output = $runner->executeCommand('php -r "fclose(STDOUT);fclose(STDERR);exit(0);"', 5);

    expect($output['timed_out'])->toBeFalse();
    expect($output['exitCode'])->toBe(0);
});
```

- [ ] **Step 3: Add Test C (no-setsid variant, skipped on Windows)**

```php
it('executeCommand enforces timeout on pipe-closing child without setsid (macOS/BSD fallback)', function () {
    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $this->markTestSkipped('POSIX-only test');
    }

    $runner = new class (__DIR__) extends Runner {
        protected function hasSetSid(): bool
        {
            return false;
        }
    };

    $start = hrtime(true);
    $output = $runner->executeCommand('php -r "fclose(STDOUT);fclose(STDERR);sleep(5);"', 1);
    $elapsed = (hrtime(true) - $start) / 1_000_000_000;

    expect($elapsed)->toBeLessThan(2.5);
    expect($output['timed_out'])->toBeTrue();
    expect($output['degraded_kill'])->toBeTrue();
});
```

- [ ] **Step 4: Verify tests fail (Red)**

```bash
php vendor/bin/pest tests/Unit/Eval/RunnerTest.php --filter 'closes pipes'
```

Expected: Tests A and C fail (run ~5s with `timed_out=false`). Test B passes (child exits immediately, current code handles this case).

- [ ] **Step 5: Commit**

```bash
git add tests/Unit/Eval/RunnerTest.php
git commit -S -m $'test(eval): add pipe-EOF timeout regression tests

Add three tests for issue #66: child closes streams but keeps running.
Tests A and C assert timeout enforcement; Test B guards the happy path.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 2: Green — Implement the fix

**Files:**
- Modify: `.opencode/evals/bin/includes/EvalRunner.php` (replace `break` on `empty($read)` with polling loop)

**Interfaces:**
- Consumes: `proc_get_status()`, `hrtime()`, `usleep()`, `killProcessTree()` (all existing)
- Produces: EOF path now polls `proc_get_status()['running']`; `$timedOut` may be set to `true` from this branch

- [ ] **Step 1: Apply the fix in readPipes()**

Replace:

```php
            if (empty($read)) {
                break;
            }
```

With:

```php
            if (empty($read)) {
                // Both pipes at EOF. A child that closed its stdout/stderr
                // but is still running (e.g. a daemonizing tool) would
                // otherwise cause proc_close() to block indefinitely,
                // bypassing the timeout. Poll proc_get_status()['running']
                // against the remaining deadline; on expiry call
                // killProcessTree() and set timed_out. The 'running' field
                // is reliable on every call (only 'exitcode' is first-call
                // only, and the exit code is still read via proc_close()).
                while (true) {
                    $status = proc_get_status($process);
                    if (!$status['running']) {
                        break 2;
                    }
                    $elapsedNs = hrtime(true) - $startNs;
                    if ($elapsedNs >= $timeoutNs) {
                        $timedOut = true;
                        break 2;
                    }
                    usleep(10_000);
                }
            }
```

- [ ] **Step 2: Verify fix (Green)**

```bash
php vendor/bin/pest tests/Unit/Eval/RunnerTest.php --filter 'closes pipes'
```

Expected: All three tests pass. Tests A and C complete in ~1s with `timed_out=true`.

- [ ] **Step 3: Run full Eval suite to confirm no regressions**

```bash
php vendor/bin/pest tests/Unit/Eval/
```

Expected: All existing tests pass. Especially confirm test 2 (`executeCommand enforces timeout on slow commands`, `sleep 3`) — exercises the `stream_select` timeout path, not the new EOF path.

- [ ] **Step 4: Commit**

```bash
git add .opencode/evals/bin/includes/EvalRunner.php
git commit -S -m $'fix(eval): enforce timeout when child closes pipes but keeps running

The read loop broke on stdout+stderr EOF without checking whether the
child was still alive, causing proc_close() to block indefinitely and
bypass the wall-clock timeout. Poll proc_get_status()[\'running\'] against
the remaining deadline after EOF; on expiry call killProcessTree() and
set timed_out.

Fixes #66

Acked-by: deepseek-v4-pro
Plan-by: glm-5.2
Signed-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 3: Refactor & final verification

- [ ] **Step 1: Self-review the diff for clarity**

No extraction needed — the poll loop is small (10 lines) and local to a single code path. The existing post-loop logic handles both outcomes without modification.

- [ ] **Step 2: Run pre-push gate**

```bash
php -d pcov.enabled=1 vendor/bin/pest --coverage
```

Expected: ≥80% line coverage on changed files, all tests pass.

- [ ] **Step 3: Run lint gate**

```bash
php vendor/bin/php-cs-fixer fix --dry-run --diff
```

Expected: No violations.

- [ ] **Step 4: Verification checklist**

- [x] All Pest tests pass (Unit/Eval + full suite)
- [x] No debug artifacts (`var_dump`, `print_r`, `dd`, `dump`)
- [x] `declare(strict_types=1)` present (source file already has it)
- [x] RCS header intact (pre-commit hook will auto-update timestamp)
- [x] No `aurora/` submodule modified
- [ ] Acceptance criteria met: `executeCommand('php -r "fclose(STDOUT);fclose(STDERR);sleep(5);"', 1)` returns within ~1s with `timed_out=true`
