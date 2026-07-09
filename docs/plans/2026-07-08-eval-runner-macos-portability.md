# Eval Runner macOS Portability Fix — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Make the eval runner functional on macOS (and other non-Linux POSIX) by probing for `setsid` instead of assuming it, surface degraded kill capability in results, stop all-skipped suites from self-masking as green, and add a macOS CI job.

**Architecture:** Add a cached `setsid`-availability probe on `Runner`; `executeCommand()` only prefixes `exec setsid` when the probe succeeds, otherwise runs unprefixed and `killProcessTree()` falls back to `proc_terminate` + `pkill -P` (best-effort, no group kill). A `degraded_kill` flag propagates from `executeCommand` → `EvalResult` → JSON only when a timeout occurred without `setsid`. `run-suite.php` gets a pure static `Runner::computeSuiteExitCode()` (unit-testable) that returns exit 2 for all-skipped suites and supports `--fail-on-skip`. CI gains a focused `macos-latest` job running `tests/Shell` + `tests/Unit/Eval`.

**Tech Stack:** PHP 8.5, Pest v4, GitHub Actions, bash shell tests.

**Spec source:** GitHub issue #50 (treated as the spec — it carries Summary, Location, Explanation, Recommended implementation, and Acceptance criteria). Design forks resolved with the user: all-skipped=exit 2 + `--fail-on-skip`; macOS CI = Shell + Unit/Eval only; `degraded_kill` = per-result on timeout cases.

## Global constraints

- PHP 8.5+, `declare(strict_types=1)` on all backend classes.
- PSR-12 (4-space indent), PHPDoc on all classes/methods.
- Every new/modified source file keeps its RCS header + vim modeline (the modified files already have them — preserve).
- TDD Red → Green → Refactor; ≥80% line coverage on changed files.
- Signed commits; footers: `Plan-by: glm-5.2`, `Acked-by: deepseek-v4-pro`, `Signed-off-by: kyau <git@kyaulabs.com>`.
- The `aurora/.opencode/evals/...` parallel copy is a git submodule and is **out of scope** for this issue (tracked as a follow-up to fix in the aurora repo + submodule bump). Do not touch `aurora/`.

## File structure

| File | Responsibility | Action |
|---|---|---|
| `.opencode/evals/bin/includes/EvalRunner.php` | `Runner` core: probe, executeCommand, killProcessTree, EvalResult, computeSuiteExitCode | Modify |
| `.opencode/evals/bin/run-eval.php` | Wire `degraded_kill` into the agent-timeout EvalResult | Modify |
| `.opencode/evals/bin/run-suite.php` | `--fail-on-skip` arg, all-skipped exit 2 + warning, delegate to `computeSuiteExitCode` | Modify |
| `tests/Unit/Eval/RunnerTest.php` | New tests for probe fallback, degraded kill, degraded_kill flag; update 2 existing POSIX tests | Modify |
| `tests/Unit/Eval/SuiteExitCodeTest.php` | Focused unit tests for `Runner::computeSuiteExitCode()` | Create |
| `.github/workflows/ci.yml` | New `check-macos` job | Modify |

---

### Task 1: setsid availability probe + executeCommand unprefixed fallback

**Files:**
- Modify: `.opencode/evals/bin/includes/EvalRunner.php` (Runner class — property near line 181, new method, `executeCommand` lines 275-307)
- Test: `tests/Unit/Eval/RunnerTest.php` (new tests + update existing test at lines 392-413)

**Interfaces:**
- Produces: `protected function hasSetSid(): bool` — returns cached result of probing `command -v setsid`; `false` on Windows. Consumed by `executeCommand()` (this task), `killProcessTree()` (Task 2), and `readPipes()` (Task 2).

- [ ] **Step 1: Write the failing tests**

Add to `tests/Unit/Eval/RunnerTest.php` (after the existing `executeCommand` tests, before the `runJudge` timeout test at line 277):

```php
it('executeCommand succeeds without setsid (macOS/BSD fallback)', function () {
    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $this->markTestSkipped('POSIX-only test');
    }

    // Simulate a platform where setsid is unavailable (e.g. macOS).
    $runner = new class(__DIR__) extends Runner {
        protected function hasSetSid(): bool
        {
            return false;
        }
    };

    $output = $runner->executeCommand('echo "hello world"', 5);

    expect($output['exitCode'])->toBe(0);
    expect($output['stdout'])->toContain('hello world');
    expect($output['timed_out'])->toBeFalse();
});

it('hasSetSid is cached after first probe', function () {
    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $this->markTestSkipped('POSIX-only test');
    }

    $runner = new Runner(__DIR__);
    $first = $runner->hasSetSid();
    $second = $runner->hasSetSid();

    expect($first)->toBeBool();
    expect($second)->toBe($first);
});
```

Then update the existing test at lines 392-413 (`executeCommand launches commands in a new process group on POSIX`) to skip when `setsid` is unavailable — replace its skip block:

```php
it('executeCommand launches commands in a new process group on POSIX', function () {
    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $this->markTestSkipped('POSIX-only test');
    }
    exec('command -v setsid 2>/dev/null', $probe, $probeExit);
    if ($probeExit !== 0) {
        $this->markTestSkipped('setsid not available — process-group isolation is degraded on this platform');
    }

    $runner = new Runner(__DIR__);

    // sh -c prints its own PGID. With setsid, PGID should equal PID.
    $output = $runner->executeCommand("sh -c 'echo \$\$ \$(ps -o pgid= -p \$\$ | tr -d \" \")'", 5);

    expect($output['exitCode'])->toBe(0);
    expect($output['timed_out'])->toBeFalse();

    $parts = explode(' ', trim($output['stdout']));
    $pid  = (int) $parts[0];
    $pgid = (int) ($parts[1] ?? -1);

    // With setsid, the process group ID equals the PID
    expect($pgid)->toBe($pid);
    // Also verify it is NOT in the parent process's process group
    expect($pgid)->not->toBe(posix_getpgid(getmypid()));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php vendor/bin/pest tests/Unit/Eval/RunnerTest.php --filter 'succeeds without setsid|cached after first probe|launches commands in a new process group'`
Expected: FAIL — `hasSetSid()` is undefined (private/absent); the "succeeds without setsid" test fails because the current code prefixes `exec setsid` unconditionally on POSIX.

- [ ] **Step 3: Write minimal implementation**

In `.opencode/evals/bin/includes/EvalRunner.php`, add the cached property to the `Runner` class (near line 181, alongside `$repoRoot`):

```php
    /** @var bool|null Cached result of probing for the setsid(1) binary. */
    private ?bool $hasSetSid = null;
```

Add the probe method (place it immediately before `executeCommand`, around line 274):

```php
    /**
     * Probe once for the setsid(1) binary and cache the result.
     *
     * macOS and some BSDs do not ship setsid(1); on those platforms
     * executeCommand() runs commands unprefixed and killProcessTree()
     * uses a best-effort fallback (no process-group tree-kill).
     *
     * @return bool
     */
    protected function hasSetSid(): bool
    {
        if ($this->hasSetSid !== null) {
            return $this->hasSetSid;
        }

        if (DIRECTORY_SEPARATOR === '\\') {
            return $this->hasSetSid = false;
        }

        exec('command -v setsid 2>/dev/null', $output, $exitCode);

        return $this->hasSetSid = ($exitCode === 0);
    }
```

Replace the prefix block in `executeCommand()` (lines 281-285) — change the guard from `DIRECTORY_SEPARATOR !== '\\'` to the cached probe:

```php
        // On POSIX with setsid(1), launch via exec setsid so the process
        // runs in its own process group. The PID from proc_get_status then
        // identifies the group, enabling posix_kill(-$pid, SIGKILL) to
        // tree-kill on timeout. macOS/BSD lack setsid(1): run unprefixed
        // and fall back to a best-effort kill in killProcessTree().
        // --wait: forces fork+wait on Linux where setsid forks by default.
        if ($this->hasSetSid()) {
            $cmd = PHP_OS_FAMILY === 'Linux'
                ? 'exec setsid --wait ' . $cmd
                : 'exec setsid ' . $cmd;
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php vendor/bin/pest tests/Unit/Eval/RunnerTest.php --filter 'succeeds without setsid|cached after first probe|launches commands in a new process group'`
Expected: PASS on Linux (setsid present → group test runs; fallback test uses the subclass override). On macOS the group test skips and the fallback test passes.

- [ ] **Step 5: Run the full RunnerTest suite to confirm no regressions**

Run: `php vendor/bin/pest tests/Unit/Eval/RunnerTest.php`
Expected: PASS — existing `executeCommand runs a command and captures output` still passes (Linux prefixes setsid; macOS runs unprefixed).

- [ ] **Step 6: Commit**

```bash
git add .opencode/evals/bin/includes/EvalRunner.php tests/Unit/Eval/RunnerTest.php
git commit -S -m "fix(eval-runner): probe setsid instead of assuming it on POSIX

macOS ships no setsid(1); the unconditional 'exec setsid' prefix made
every executeCommand() exit 127, so isOpenCodeAvailable() returned
false and the whole suite self-masked as SKIPPED. Probe command -v
setsid once (cached) and only prefix when present; otherwise run
unprefixed. Kill-tree degradation is handled in a follow-up task.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 2: Degraded killProcessTree + degraded_kill result flag

**Files:**
- Modify: `.opencode/evals/bin/includes/EvalRunner.php` (`EvalResult` class lines 120-174, `readPipes` lines 309-400, `killProcessTree` lines 402-430, `executeCommand` early-return line 295)
- Modify: `.opencode/evals/bin/run-eval.php` (agent-timeout EvalResult, around lines 115-121)
- Test: `tests/Unit/Eval/RunnerTest.php` (new tests + update existing killProcessTree test at lines 415-461)

**Interfaces:**
- Consumes: `hasSetSid()` from Task 1.
- Produces: `executeCommand()` return array gains a `degraded_kill: bool` key (true only when `timed_out && !hasSetSid()`). `EvalResult` gains `public bool $degradedKill = false` and a `degraded_kill` key in `toArray()`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/Unit/Eval/RunnerTest.php` (after the `executeCommand` block):

```php
it('executeCommand reports degraded_kill when timeout occurs without setsid', function () {
    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $this->markTestSkipped('POSIX-only test');
    }

    $runner = new class(__DIR__) extends Runner {
        protected function hasSetSid(): bool
        {
            return false;
        }
    };

    $start = hrtime(true);
    $output = $runner->executeCommand('sleep 3', 1);
    $elapsed = (hrtime(true) - $start) / 1_000_000_000;

    expect($elapsed)->toBeLessThan(2.5);
    expect($output['timed_out'])->toBeTrue();
    expect($output['degraded_kill'])->toBeTrue();
});

it('executeCommand does not set degraded_kill when setsid is available', function () {
    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $this->markTestSkipped('POSIX-only test');
    }
    exec('command -v setsid 2>/dev/null', $probe, $probeExit);
    if ($probeExit !== 0) {
        $this->markTestSkipped('setsid not available on this platform');
    }

    $runner = new Runner(__DIR__);

    $output = $runner->executeCommand('sleep 3', 1);

    expect($output['timed_out'])->toBeTrue();
    expect($output['degraded_kill'])->toBeFalse();
});

it('killProcessTree kills direct children without setsid (POSIX fallback)', function () {
    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $this->markTestSkipped('POSIX-only test');
    }

    $runner = new class(__DIR__) extends Runner {
        protected function hasSetSid(): bool
        {
            return false;
        }
    };

    $marker = tempnam(sys_get_temp_dir(), 'eval-kill-');
    $cmd = sprintf(
        "sh -c 'sleep 30 & echo \$! > %s; wait'",
        escapeshellarg($marker),
    );

    $output = $runner->executeCommand($cmd, 1);

    expect($output['timed_out'])->toBeTrue();

    if (!file_exists($marker)) {
        $this->markTestSkipped('Command did not write child PID file');
    }

    $childPid = (int) trim((string) file_get_contents($marker));
    unlink($marker);

    if ($childPid <= 0) {
        $this->markTestSkipped('Could not read child PID');
    }

    $alive = true;
    for ($i = 0; $i < 10; $i++) {
        $alive = posix_kill($childPid, 0);
        if (!$alive) {
            break;
        }
        usleep(50_000);
    }

    expect($alive)->toBeFalse();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php vendor/bin/pest tests/Unit/Eval/RunnerTest.php --filter 'degraded_kill|does not set degraded_kill|kills direct children without setsid'`
Expected: FAIL — `degraded_kill` key absent; the fallback kill test may fail because `posix_kill(-$pid)` without setsid does not tree-kill.

- [ ] **Step 3: Write minimal implementation**

**(a) `EvalResult` class** — add the `degradedKill` property and `toArray` key. Update the constructor (lines 124-135) to add the parameter after `$error`:

```php
    /** @param array<int, array{behavior: string, verdict: string, rationale: string}> $behaviors */
    /** @param array<string, array<string, mixed>> $deterministicChecks */
    public function __construct(
        public string $name,
        public string $agent,
        public string $passCriteria,
        public string $verdict,
        public array $behaviors = [],
        public array $deterministicChecks = [],
        public int $durationMs = 0,
        public bool $judgeUsed = false,
        public ?string $error = null,
        public bool $degradedKill = false,
    ) {
    }
```

Update `toArray()` (lines 142-152) to append the key:

```php
    public function toArray(): array
    {
        return [
            'name' => $this->name,
            'agent' => $this->agent,
            'pass_criteria' => $this->passCriteria,
            'verdict' => $this->verdict,
            'behaviors' => $this->behaviors,
            'deterministic_checks' => $this->deterministicChecks,
            'duration_ms' => $this->durationMs,
            'judge_used' => $this->judgeUsed,
            'error' => $this->error,
            'degraded_kill' => $this->degradedKill,
        ];
    }
```

**(b) `readPipes()`** — compute `degraded_kill` and include it in the return array. In the method body, add a local before the return (after the `$timedOut` block, near line 393):

```php
        $degradedKill = $timedOut && !$this->hasSetSid();

        return [
            'stdout'        => trim($stdout),
            'stderr'        => trim($stderr),
            'exitCode'      => $exitCode,
            'timed_out'     => $timedOut,
            'degraded_kill' => $degradedKill,
        ];
```

Update the `@return` PHPDoc on `readPipes()` and `executeCommand()` to: `array{stdout: string, stderr: string, exitCode: int, timed_out: bool, degraded_kill: bool}`.

**(c) `executeCommand()` early-failure return** (line 295) — add the key:

```php
            return ['stdout' => '', 'stderr' => "Failed to start process: {$cmd}", 'exitCode' => -1, 'timed_out' => false, 'degraded_kill' => false];
```

**(d) `killProcessTree()`** — add a degraded branch. Replace the method body (lines 418-429) so the POSIX branch checks `hasSetSid()`:

```php
    private function killProcessTree($process, int $pid): void
    {
        if (DIRECTORY_SEPARATOR === '\\') {
            exec("taskkill /f /t /pid {$pid} 2>NUL");
            proc_terminate($process, 9);
        } elseif ($this->hasSetSid() && function_exists('posix_kill')) {
            // Negative PID: kill the entire process group (setsid'd).
            // SIGKILL comes from PCNTL extension; fall back to integer 9
            // when only posix (not pcntl) is available.
            posix_kill(-$pid, defined('SIGKILL') ? SIGKILL : 9);
        } else {
            // No setsid (macOS/BSD) or no posix extension: the process is
            // not a group leader, so posix_kill(-$pid) would signal the
            // wrong group. Kill direct children best-effort via pkill -P
            // while the parent is still alive (so they are findable),
            // then terminate the parent. Grandchildren may escape.
            exec("pkill -P {$pid} 2>/dev/null");
            proc_terminate($process, 9);
        }
    }
```

**(e) `runJudge()` timeout branch** (lines 645-652) — propagate the flag into the `EvalResult`:

```php
        if ($output['timed_out']) {
            return new EvalResult(
                name: $case->name,
                agent: $case->agent,
                passCriteria: $case->passCriteria,
                verdict: 'TIMEOUT',
                durationMs: $elapsed,
                judgeUsed: true,
                error: "Judge timed out after {$this->timeout} seconds",
                degradedKill: $output['degraded_kill'],
            );
        }
```

**(f) `run-eval.php` agent-timeout branch** (lines 115-121) — propagate the flag:

```php
        if ($agentOutput['timed_out']) {
            $result = new EvalResult(
                name: $case->name,
                agent: $case->agent,
                passCriteria: $case->passCriteria,
                verdict: 'TIMEOUT',
                durationMs: $elapsedMs,
                error: "Agent timed out after {$args['timeout']} seconds",
                degradedKill: $agentOutput['degraded_kill'],
            );
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php vendor/bin/pest tests/Unit/Eval/RunnerTest.php --filter 'degraded_kill|does not set degraded_kill|kills direct children without setsid'`
Expected: PASS.

- [ ] **Step 5: Run the full eval unit suite + EvalCaseTest (toArray shape) to confirm no regressions**

Run: `php vendor/bin/pest tests/Unit/Eval`
Expected: PASS — `EvalCaseTest`/`RunEvalCliTest` unaffected; existing `killProcessTree terminates the full process tree on timeout (POSIX)` still passes on Linux (setsid present → `posix_kill(-$pid)` branch).

- [ ] **Step 6: Commit**

```bash
git add .opencode/evals/bin/includes/EvalRunner.php .opencode/evals/bin/run-eval.php tests/Unit/Eval/RunnerTest.php
git commit -S -m "fix(eval-runner): degrade kill tree + report degraded_kill without setsid

Without setsid the child is not a process-group leader, so
posix_kill(-\$pid) would signal the wrong group. Branch killProcessTree
on hasSetSid(): keep the group kill when setsid is present, otherwise
pkill -P the direct children then proc_terminate the parent. Surface a
per-result degraded_kill flag (true only on timeout without setsid) so
consumers can see the degraded kill capability in the result JSON.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 3: run-suite.php all-skipped exit 2 + --fail-on-skip

**Files:**
- Modify: `.opencode/evals/bin/includes/EvalRunner.php` (add `Runner::computeSuiteExitCode()` static method)
- Modify: `.opencode/evals/bin/run-suite.php` (arg parsing lines 26-41, usage lines 10/44, exit logic lines 157-158)
- Test: `tests/Unit/Eval/SuiteExitCodeTest.php` (create)

**Interfaces:**
- Produces: `public static function computeSuiteExitCode(int $pass, int $fail, int $timeout, int $skip, int $invalid, bool $failOnSkip): int` — returns `0` (pass/mixed-pass-skip), `1` (any fail/timeout/invalid, or any skip with `--fail-on-skip`), or `2` (every case skipped, no `--fail-on-skip`).

- [ ] **Step 1: Write the failing tests**

Create `tests/Unit/Eval/SuiteExitCodeTest.php`:

```php
<?php

declare(strict_types=1);

# $KYAULabs: SuiteExitCodeTest.php kyau@nova 2026/07/08 -0700 Exp $

/**
 * SuiteExitCodeTest — Unit tests for Runner::computeSuiteExitCode().
 *
 * Covers the all-skipped self-masking fix (issue #50): a suite where
 * every case is SKIPPED must exit non-zero (2), and --fail-on-skip
 * promotes any SKIPPED case to a failure (1).
 */

use KYAULabs\Eval\Runner;

it('returns 0 when all cases pass', function () {
    expect(Runner::computeSuiteExitCode(3, 0, 0, 0, 0, false))->toBe(0);
});

it('returns 1 when any case fails', function () {
    expect(Runner::computeSuiteExitCode(2, 1, 0, 0, 0, false))->toBe(1);
});

it('returns 1 when any case times out', function () {
    expect(Runner::computeSuiteExitCode(2, 0, 1, 0, 0, false))->toBe(1);
});

it('returns 1 when any case is invalid', function () {
    expect(Runner::computeSuiteExitCode(2, 0, 0, 0, 1, false))->toBe(1);
});

it('returns 2 when every case is skipped', function () {
    expect(Runner::computeSuiteExitCode(0, 0, 0, 3, 0, false))->toBe(2);
});

it('returns 0 for mixed pass and skip without failures', function () {
    expect(Runner::computeSuiteExitCode(2, 0, 0, 1, 0, false))->toBe(0);
});

it('returns 1 for any skip when --fail-on-skip is set', function () {
    expect(Runner::computeSuiteExitCode(2, 0, 0, 1, 0, true))->toBe(1);
});

it('returns 1 for all-skipped when --fail-on-skip is set', function () {
    expect(Runner::computeSuiteExitCode(0, 0, 0, 3, 0, true))->toBe(1);
});

it('returns 0 for an empty suite', function () {
    expect(Runner::computeSuiteExitCode(0, 0, 0, 0, 0, false))->toBe(0);
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php vendor/bin/pest tests/Unit/Eval/SuiteExitCodeTest.php`
Expected: FAIL — `Runner::computeSuiteExitCode()` not defined.

- [ ] **Step 3: Write minimal implementation**

Add the static method to the `Runner` class in `EvalRunner.php` (place it right after `parseArgs`, around line 262):

```php
    /**
     * Compute the suite exit code from per-verdict counts.
     *
     * 0 — all pass (mixed pass+skip with no failures is still 0).
     * 1 — any FAIL/TIMEOUT/INVALID, or any SKIPPED when $failOnSkip is set.
     * 2 — every case SKIPPED (silent-suite guard); $failOnSkip promotes to 1.
     *
     * @param int  $pass
     * @param int  $fail
     * @param int  $timeout
     * @param int  $skip
     * @param int  $invalid
     * @param bool $failOnSkip
     * @return int
     */
    public static function computeSuiteExitCode(
        int $pass,
        int $fail,
        int $timeout,
        int $skip,
        int $invalid,
        bool $failOnSkip,
    ): int {
        $total = $pass + $fail + $timeout + $skip + $invalid;

        if ($fail > 0 || $timeout > 0 || $invalid > 0) {
            return 1;
        }

        if ($failOnSkip && $skip > 0) {
            return 1;
        }

        if ($total > 0 && $skip === $total) {
            return 2;
        }

        return 0;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php vendor/bin/pest tests/Unit/Eval/SuiteExitCodeTest.php`
Expected: PASS (all 9 cases).

- [ ] **Step 5: Wire run-suite.php to the new exit logic**

In `.opencode/evals/bin/run-suite.php`:

1. Add the include + use after line 3 (`declare(strict_types=1);`), before the RCS header comment — place after the docblock, near line 24:

```php
require_once __DIR__ . '/includes/EvalRunner.php';

use KYAULabs\Eval\Runner;
```

2. Add `$failOnSkip = false;` to the defaults block (line 30, alongside `$dryRun = false;`).

3. Add a branch to the arg-parsing loop (after the `--dry-run` branch, around line 38):

```php
        } elseif ($argv[$i] === '--fail-on-skip') {
            $failOnSkip = true;
```

4. Update both usage strings (line 10 and line 44) to:

```
Usage: php run-suite.php <directory> [--tag <tag>] [--timeout <seconds>] [--dry-run] [--fail-on-skip]
```

5. Replace the exit logic (lines 157-158) with:

```php
$exitCode = Runner::computeSuiteExitCode(
    $passCount,
    $failCount,
    $timeoutCount,
    $skipCount,
    $invalidCount,
    $failOnSkip,
);

if ($skipCount > 0 && $passCount === 0 && $failCount === 0
    && $timeoutCount === 0 && $invalidCount === 0 && $skipCount === $total
) {
    fwrite(STDERR, "WARNING: every eval case was SKIPPED — the suite did nothing. "
        . "Verify opencode is installed and that cases are not filtered out.\n");
}

exit($exitCode);
```

- [ ] **Step 6: Run the full eval unit suite to confirm no regressions**

Run: `php vendor/bin/pest tests/Unit/Eval`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .opencode/evals/bin/includes/EvalRunner.php .opencode/evals/bin/run-suite.php tests/Unit/Eval/SuiteExitCodeTest.php
git commit -S -m "fix(eval-suite): exit non-zero on all-skipped suites, add --fail-on-skip

run-suite.php treated SKIPPED as neutral, so a fully-skipped suite
(e.g. opencode missing on macOS) exited 0 and self-masked as green.
Extract Runner::computeSuiteExitCode() (unit-tested) returning 2 when
every case is SKIPPED, 1 on any fail/timeout/invalid, and 1 for any
skip under --fail-on-skip. Print a loud stderr warning on all-skipped.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 4: macOS CI job

**Files:**
- Modify: `.github/workflows/ci.yml` (add a second job after the `check` job, before EOF)

**Interfaces:**
- Consumes: the fixes from Tasks 1-3 (the macOS job is the live validation of acceptance criteria #1 and #3).

- [ ] **Step 1: Add the macOS job**

Append a new job to `.github/workflows/ci.yml` (after the `check` job's last step, at the top level of `jobs:`):

```yaml
  check-macos:
    name: macOS Eval & Shell
    runs-on: macos-latest
    timeout-minutes: 10

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          submodules: true

      - name: Setup PHP 8.5
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.5'
          coverage: pcov
          tools: composer

      - name: Install Composer dependencies
        run: composer install --no-progress --no-interaction

      - name: Shell regression tests
        shell: bash
        run: |
          shopt -s nullglob
          tests=( tests/Shell/*_test.sh )
          if [ ${#tests[@]} -eq 0 ]; then
            echo "No shell tests found in tests/Shell/"
            exit 1
          fi
          for t in "${tests[@]}"; do
            echo "::group::Running $t"
            bash "$t"
            echo "::endgroup::"
          done

      - name: Eval unit tests
        run: php vendor/bin/pest tests/Unit/Eval
```

- [ ] **Step 2: Validate the workflow YAML locally**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('YAML OK')"` (or `npx --yes yaml-lint .github/workflows/ci.yml`)
Expected: `YAML OK` — no syntax errors.

- [ ] **Step 3: Verify the eval unit tests pass on the current (Linux) machine as a smoke check**

Run: `php vendor/bin/pest tests/Unit/Eval`
Expected: PASS (this is the same command the macOS job runs; on Linux the setsid-present path is exercised, on macOS the fallback path).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -S -m "ci: add macos-latest job for eval unit tests and shell tests

The eval runner was ubuntu-only in CI, so the macOS setsid regression
shipped unnoticed. Add a focused check-macos job running tests/Shell
and tests/Unit/Eval on macos-latest — the setsid-unavailable fallback
path is now exercised on every push and pull request.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

## Acceptance criteria verification (run after all tasks)

- [ ] **`executeCommand('echo hi')` succeeds on macOS and Linux** — covered by `executeCommand runs a command and captures output` (Linux prefixes setsid; macOS runs unprefixed via the `hasSetSid()` fallback) and the new `executeCommand succeeds without setsid (macOS/BSD fallback)` test; live-validated by the `check-macos` CI job.
- [ ] **A suite where every case is SKIPPED exits non-zero or prints a loud warning** — `Runner::computeSuiteExitCode()` returns `2` for all-skipped; `run-suite.php` prints a stderr `WARNING:` and exits `2`. Covered by `SuiteExitCodeTest.php`.
- [ ] **CI includes a macOS job running the eval unit tests** — the `check-macos` job runs `php vendor/bin/pest tests/Unit/Eval` on `macos-latest`.

## Out of scope (follow-up)

- The `aurora/.opencode/evals/...` parallel copy carries the same bug. It is a git submodule; fix it upstream in the aurora repo and bump the submodule pointer here in a separate change (noted in `docs/plans/2026-07-07-check-deterministic-semantics.md` line 602).
- A formal JSON result schema (`schema.json` currently only covers eval *case* input). The new `degraded_kill` key is added to `EvalResult::toArray()` ad-hoc, matching the existing convention. A dedicated result schema is a separate task.
