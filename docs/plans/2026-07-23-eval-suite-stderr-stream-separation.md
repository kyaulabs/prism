# Eval Suite stderr/JSON Stream Separation Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Stop `run-suite.php` from merging run-eval's stderr into the stdout JSON stream, so a dirty working tree (or any diagnostic NOTICE/WARNING) no longer turns every eval case into a false `INVALID`; and make a worktree-setup failure emit a JSON `INVALID` instead of a PHP fatal.

**Architecture:** Add a small, no-timeout `proc_open` capture primitive (`Runner::captureOutput`) that returns stdout/stderr/exitCode **separately** with deadlock-safe interleaved reads. Wire `run-suite.php`'s two run-eval invocations (run path + dry-run path) through it, dropping the `2>&1` merge that caused the corruption. Widen `run-eval.php`'s top-level catch from `\TypeError` to `\Throwable` so a worktree `\RuntimeException` becomes a JSON result. Reusing the existing timeout-enforcing `Runner::executeCommand` is deliberately avoided: it would race against run-eval's own internal agent/judge timeouts (a single run-eval can legitimately run ~2× the `--timeout`).

**Tech Stack:** PHP 8.5+ (procedural scripts + one class), `proc_open`/`stream_select`, Pest v4 on PHPUnit 12. Eval harness lives under `.opencode/evals/bin/`; `KYAULabs\Eval\Runner` is autoloaded via composer `classmap` (`.opencode/evals/bin/includes/`).

## Global constraints

- PHP `declare(strict_types=1)` on every touched file (already present — keep it).
- Every modified source file keeps its RCS header + vim modeline (already present — do not touch).
- Indentation: PHP 4-space (PSR-12).
- No new dependencies.
- Conventional Commits, signed (`git commit -S`). Commit type for this issue is **`fix`** (Bug → `fix`), scope **`evals`**.
- Every commit footer carries `Authored-by: glm-5.2`, `Tested-by: deepseek-v4-pro`, and `Signed-off-by:` (resolved via `bash .github/scripts/resolve-identity.sh`). The closing reference is `Fixes: #188` (sentence-case, with colon) on the commit that lands the primary defect fix (Task 2); all other task commits use `Refs: #188`.
- No `git push` by any agent — only the human pushes.

---

## Context (verified against the code, not just the issue)

The issue body is untrusted; the following was confirmed by reading the actual source:

- `run-eval.php:128-131` — `fwrite(STDERR, "NOTICE: working tree has uncommitted changes …")` fires whenever `Runner::isWorkingTreeDirty()` is true (reached only when opencode is available — the SKIPPED short-circuit at `run-eval.php:112` precedes it).
- `run-suite.php:168-169` — the run-path invocation ends in ` … --timeout {$timeout} 2>&1`, merging that STDERR line into STDOUT.
- `run-suite.php:174-175` — `$joined = implode("\n", $output); $decoded = json_decode($joined, true);` then fails (leading `NOTICE:` line) → `run-suite.php:179-185` records `INVALID` with `"Failed to parse run-eval output"`.
- `run-suite.php:149-150` — the dry-run path has the same `2>&1` anti-pattern (no JSON decode there, but inconsistent and leaks diagnostics into dry-run output).
- `EvalRunner.php:1072` / `:997` / `:1021` — `createWorktree()` and `propagateUncommittedChanges()` throw `\RuntimeException` on git failure.
- `run-eval.php:172` — `} catch (\TypeError $e)` does NOT catch `\RuntimeException`, so a worktree-setup failure escapes as a PHP fatal that emits **no JSON**.
- `EvalRunner.php:1037` — a second `fwrite(STDERR, "WARNING: git stash pop failed …")` (same corruption vector; fixed for free by separating streams).
- `Runner` is `KYAULabs\Eval\Runner`, autoloaded; existing static helpers `Runner::parseArgs` and `Runner::computeSuiteExitCode` establish the static-method convention used by the scripts. `executeCommand` (instance, with timeout+setsid+tree-kill) is the wrong tool here (see Architecture).

---

### Task 1: Add `Runner::captureOutput()` — separated-stream capture primitive  ✅ DONE (commit `a658229`, unsigned — gpg agent unreachable in sandbox)

**Files:**
- Modify: `.opencode/evals/bin/includes/EvalRunner.php` — insert a new `public static` method immediately **before** the `executeCommand()` method (currently preceded by the `hasSetSid()` method whose body ends at `return $this->hasSetSid = $this->isBinaryOnPath('setsid');` then `}`).
- Test: `tests/Unit/Eval/RunnerTest.php` — append three tests.

**Interfaces:**
- Consumes: nothing new.
- Produces: `Runner::captureOutput(string $cmd): array{stdout: string, stderr: string, exitCode: int}` — a static method. Task 2 calls it as `Runner::captureOutput($cmd)`; Task 4 calls it as `\KYAULabs\Eval\Runner::captureOutput($cmd)`.

- [ ] **Step 1: Write the failing tests** (append to `tests/Unit/Eval/RunnerTest.php`, before the final vim modeline):

```php
it('captureOutput separates stdout from stderr', function () {
    $php = 'fwrite(STDERR, "DIAG"); echo "JSON";';
    $out = Runner::captureOutput('php -r ' . escapeshellarg($php));

    expect($out['stdout'])->toBe('JSON');
    expect($out['stderr'])->toBe('DIAG');
    expect($out['exitCode'])->toBe(0);
});

it('captureOutput does not deadlock on large stderr before stdout', function () {
    $php = "fwrite(STDERR, str_repeat('x', 131072)); echo 'done';";
    $out = Runner::captureOutput('php -r ' . escapeshellarg($php));

    expect($out['stdout'])->toBe('done');
    expect($out['exitCode'])->toBe(0);
});

it('captureOutput propagates the child exit code', function () {
    expect(Runner::captureOutput('php -r "exit(7);"')['exitCode'])->toBe(7);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `php vendor/bin/pest --filter captureOutput`
Expected: FAIL — `Call to undefined method KYAULabs\Eval\Runner::captureOutput()`.

- [ ] **Step 3: Implement the method** (insert before `executeCommand()` in `EvalRunner.php`):

```php
/**
 * Run a command to completion, capturing stdout and stderr SEPARATELY.
 *
 * Unlike executeCommand(), this enforces no wall-clock timeout and performs
 * no tree-kill: the child is trusted to terminate on its own (run-eval.php
 * enforces its own agent/judge timeouts internally and always emits JSON).
 * Pipes are read non-blocking via stream_select so a large stderr cannot
 * deadlock the reader while it waits on stdout.
 *
 * @param  string $cmd  Shell command to execute.
 * @return array{stdout: string, stderr: string, exitCode: int}
 */
public static function captureOutput(string $cmd): array
{
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $process = proc_open($cmd, $descriptors, $pipes);
    if (!is_resource($process)) {
        return ['stdout' => '', 'stderr' => "Failed to start process: {$cmd}", 'exitCode' => -1];
    }

    fclose($pipes[0]);

    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);

    $stdout = '';
    $stderr = '';

    while (!feof($pipes[1]) || !feof($pipes[2])) {
        $read = [];
        if (!feof($pipes[1])) {
            $read[] = $pipes[1];
        }
        if (!feof($pipes[2])) {
            $read[] = $pipes[2];
        }
        $write = null;
        $except = null;

        if (stream_select($read, $write, $except, 0, 200_000) === false) {
            continue;
        }

        foreach ($read as $pipe) {
            $chunk = fread($pipe, 65536);
            if ($chunk === false || $chunk === '') {
                continue;
            }
            if ($pipe === $pipes[1]) {
                $stdout .= $chunk;
            } else {
                $stderr .= $chunk;
            }
        }
    }

    fclose($pipes[1]);
    fclose($pipes[2]);

    $status = proc_get_status($process);
    proc_close($process);

    return [
        'stdout' => $stdout,
        'stderr' => $stderr,
        'exitCode' => $status['exitcode'] ?? -1,
    ];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `php vendor/bin/pest --filter captureOutput`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add .opencode/evals/bin/includes/EvalRunner.php tests/Unit/Eval/RunnerTest.php
git commit -S -m $'fix(evals): add Runner::captureOutput for separated stdout/stderr\n\nIntroduce a no-timeout proc_open helper that returns stdout, stderr, and\nexit code in separate fields with deadlock-safe interleaved reads. The\nsuite runner will use this instead of exec()+2>&1 so diagnostic stderr\n(eg. a dirty-tree NOTICE) can no longer corrupt the decoded JSON stream.\n\nRefs: #188\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

> Resolve the `Signed-off-by` value by running `bash .github/scripts/resolve-identity.sh` and substituting its output before executing the commit.

---

### Task 2: `run-suite.php` — keep stdout (JSON) and stderr (diagnostics) separate  *(lands the primary fix)* ✅ DONE (commit `af89f87`)

**Files:**
- Modify: `.opencode/evals/bin/run-suite.php` — the run path (`:168-185`) and the dry-run path (`:149-156`).
- Test: `tests/Unit/Eval/RunSuiteTest.php` — append a guard test; the existing suite tests must stay green.

**Interfaces:**
- Consumes: `Runner::captureOutput(string $cmd): array{stdout, stderr, exitCode}` (Task 1). `run-suite.php` already has `use KYAULabs\Eval\Runner;`.
- Produces: unchanged suite output contract (markdown table + `**Suite:**` line + results file). On a parse failure the INVALID `error` now appends the captured stderr for diagnosability.

- [ ] **Step 1: Write the failing guard test** (append to `tests/Unit/Eval/RunSuiteTest.php`, before the vim modeline):

```php
it('run-suite.php captures run-eval stdout and stderr separately (no 2>&1 merge)', function () {
    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-suite.php';
    $contents = file_get_contents($script);

    // The run-eval invocation must keep stdout (JSON) and stderr (diagnostics)
    // separate. Merging via 2>&1 corrupted the JSON stream on dirty trees (#188).
    expect($contents)->toContain('Runner::captureOutput');
    expect($contents)->not->toContain(' --timeout {$timeout} 2>&1');
    expect($contents)->not->toContain(' --timeout {$timeout} --dry-run 2>&1');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php vendor/bin/pest --filter 'run-suite.php captures run-eval stdout and stderr separately'`
Expected: FAIL — file still contains the `2>&1` invocation strings and lacks `Runner::captureOutput`.

- [ ] **Step 3: Rewire the run path** (replace `run-suite.php:168-185`):

From:
```php
    $cmd = "php " . escapeshellarg($runEvalScript) . " " . escapeshellarg($caseInfo['file']) .
        " --timeout {$timeout} 2>&1";
    $output = [];
    $exitCode = 0;
    exec($cmd, $output, $exitCode);

    $joined = implode("\n", $output);
    $decoded = json_decode($joined, true);

    if (is_array($decoded)) {
        $results[] = $decoded;
    } else {
        $results[] = [
            'name' => $caseInfo['name'],
            'verdict' => 'INVALID',
            'error' => 'Failed to parse run-eval output',
        ];
    }
```

To:
```php
    // Invoke run-eval with stdout (JSON) and stderr (diagnostics) captured
    // SEPARATELY. Merging them via 2>&1 corrupted the JSON stream whenever
    // run-eval wrote a NOTICE/WARNING to stderr (eg. a dirty working tree),
    // turning every case into a false INVALID. See #188.
    $cmd = "php " . escapeshellarg($runEvalScript) . " " . escapeshellarg($caseInfo['file']) .
        " --timeout {$timeout}";
    $proc = Runner::captureOutput($cmd);
    $decoded = json_decode($proc['stdout'], true);

    if (is_array($decoded)) {
        $results[] = $decoded;
    } else {
        // Surface captured stderr so a parse failure is diagnosable, not silent.
        $hint = trim($proc['stderr']);
        $results[] = [
            'name' => $caseInfo['name'],
            'verdict' => 'INVALID',
            'error' => 'Failed to parse run-eval output' . ($hint !== '' ? ' — ' . $hint : ''),
        ];
    }
```

- [ ] **Step 4: Rewire the dry-run path** (replace `run-suite.php:149-156`):

From:
```php
        $cmd = "php " . escapeshellarg($runEvalScript) . " " . escapeshellarg($caseInfo['file']) .
            " --timeout {$timeout} --dry-run 2>&1";
        $output = [];
        $exitCode = 0;
        exec($cmd, $output, $exitCode);

        echo implode("\n", $output) . "\n";
```

To:
```php
        $cmd = "php " . escapeshellarg($runEvalScript) . " " . escapeshellarg($caseInfo['file']) .
            " --timeout {$timeout} --dry-run";
        $proc = Runner::captureOutput($cmd);

        echo $proc['stdout'];
        if ($proc['stdout'] !== '' && !str_ends_with($proc['stdout'], "\n")) {
            echo "\n";
        }
        // Route diagnostics to stderr so they never mingle with dry-run output.
        if (trim($proc['stderr']) !== '') {
            fwrite(STDERR, $proc['stderr']);
        }
```

- [ ] **Step 5: Run the full eval unit suite to verify green (new guard + no regressions)**

Run: `php vendor/bin/pest tests/Unit/Eval`
Expected: PASS — including the new guard and all existing `RunSuiteTest` / `RunEvalCliTest` / `RunnerTest` cases. (When opencode is absent run-eval emits a SKIPPED JSON on stdout — no NOTICE — so existing suite tests decode cleanly exactly as before.)

- [ ] **Step 6: Commit**

```bash
git add .opencode/evals/bin/run-suite.php tests/Unit/Eval/RunSuiteTest.php
git commit -S -m $'fix(evals): stop merging run-eval stderr into the JSON stream\n\nrun-suite.php invoked run-eval.php with 2>&1, folding diagnostic stderr\n(NOTICE on a dirty tree, WARNING on a failed stash pop) into stdout and\nbreaking json_decode so every case recorded a false INVALID. Capture\nstdout and stderr separately via Runner::captureOutput, and surface the\ncaptured stderr in the INVALID error when parsing fails.\n\nFixes: #188\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

### Task 3: `run-eval.php` — widen the top-level catch to `\Throwable` ✅ DONE (commit `14e2c47`)

**Files:**
- Modify: `.opencode/evals/bin/run-eval.php:172-179` (the `catch (\TypeError $e)` block).
- Test: `tests/Unit/Eval/RunEvalCliTest.php` — append a guard test.

**Interfaces:**
- Consumes: nothing new.
- Produces: a worktree-setup `\RuntimeException` (from `Runner::createWorktree()` / `propagateUncommittedChanges()`) now yields a JSON `INVALID` result instead of escaping as a PHP fatal that emits no JSON.

> **Scope note (criterion #4):** the widened catch is reachable only when opencode is present (the SKIPPED short-circuit precedes the worktree `try`), so the behavioral guarantee is covered by this guard plus the Task 4 slow integration test's "no fatal" expectations. Forcing a real `git worktree add` failure deterministically in a fast unit test is not feasible without injecting a bad `repoRoot`, which `run-eval.php` computes internally — out of scope for this Low-effort fix.

- [ ] **Step 1: Write the failing guard test** (append to `tests/Unit/Eval/RunEvalCliTest.php`, before the vim modeline):

```php
it('run-eval.php catches Throwable so worktree failures emit JSON, not a fatal', function () {
    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-eval.php';
    $contents = file_get_contents($script);

    // A worktree-setup RuntimeException must become a JSON INVALID, not a PHP
    // fatal that emits no JSON at all (#188).
    expect($contents)->toContain('catch (\\Throwable');
    expect($contents)->not->toContain('catch (\\TypeError');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php vendor/bin/pest --filter 'catchs Throwable'`  *(or run the whole file: `php vendor/bin/pest tests/Unit/Eval/RunEvalCliTest.php`)*
Expected: FAIL — file still contains `catch (\TypeError`.

- [ ] **Step 3: Widen the catch** (replace `run-eval.php:172-179`):

From:
```php
} catch (\TypeError $e) {
    $result = new EvalResult(
        name: $case->name,
        agent: $case->agent,
        passCriteria: $case->passCriteria,
        verdict: Verdict::Invalid,
        error: 'Unexpected type error: ' . $e->getMessage(),
    );
}
```

To:
```php
} catch (\Throwable $e) {
    $result = new EvalResult(
        name: $case->name,
        agent: $case->agent,
        passCriteria: $case->passCriteria,
        verdict: Verdict::Invalid,
        error: 'Eval run failed: ' . $e->getMessage(),
    );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `php vendor/bin/pest tests/Unit/Eval/RunEvalCliTest.php`
Expected: PASS (the old `'Unexpected type error'` string is not asserted by any existing test, so no regressions).

- [ ] **Step 5: Commit**

```bash
git add .opencode/evals/bin/run-eval.php tests/Unit/Eval/RunEvalCliTest.php
git commit -S -m $'fix(evals): catch Throwable so worktree failures yield JSON INVALID\n\nrun-eval.php caught only \\TypeError, so a RuntimeException from\ncreateWorktree/propagateUncommittedChanges escaped as a PHP fatal that\nemitted no JSON at all. Widen to \\Throwable and report the message as\nan INVALID result.\n\nRefs: #188\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

### Task 4: Slow integration test — dirty tree yields parseable JSON (criteria #2, #3) ✅ DONE (commit `c1fdcd6`)

**Files:**
- Modify: `tests/Integration/Eval/RunEvalIntegrationTest.php` — append a `@group slow` test.
- No production changes (behavior already fixed in Tasks 2–3); this adds the acceptance-criterion coverage.

**Interfaces:**
- Consumes: `\KYAULabs\Eval\Runner::captureOutput()` (Task 1; class is autoloaded via composer classmap) and the smoke case `.opencode/evals/smoke/tdd-red-green.json`.
- Produces: a regression test proving the dirty-tree NOTICE lands on stderr only and stdout stays parseable.

> This test is `@group slow` (excluded from default runs via `phpunit.xml`; run with `php vendor/bin/pest --group slow`). It requires opencode in PATH and dirties the real source tree with a throwaway untracked file (cleaned up in `finally`). It will not catch the bug in CI — CI runs on clean checkouts where the NOTICE never fires — which is exactly why the issue was invisible; this test is for local/manual verification.

- [ ] **Step 1: Write the test** (append to `tests/Integration/Eval/RunEvalIntegrationTest.php`, before the vim modeline):

```php
/**
 * @group slow
 *
 * Regression for #188: a dirty source tree made run-eval emit a STDERR
 * NOTICE that, pre-fix, was merged into stdout and broke json_decode.
 * Requires opencode in PATH. Excluded from default runs; run manually:
 *   vendor/bin/pest --group slow
 */
it('run-eval on a dirty tree emits parseable JSON with the NOTICE on stderr only', function () {
    $repoRoot = dirname(__DIR__, 3);
    $caseFile = $repoRoot . '/.opencode/evals/smoke/tdd-red-green.json';
    $script = $repoRoot . '/.opencode/evals/bin/run-eval.php';

    if (!file_exists($caseFile) || !file_exists($script)) {
        $this->markTestSkipped('eval smoke case or runner not found.');
    }

    $check = [];
    exec('command -v opencode 2>&1', $check, $checkExit);
    if ($checkExit !== 0) {
        $this->markTestSkipped('opencode not available in PATH — integration test skipped.');
    }

    // Dirty the source tree with a throwaway untracked file — the exact
    // condition that makes run-eval emit the STDERR NOTICE.
    $dirtyFile = $repoRoot . '/.eval-dirty-' . bin2hex(random_bytes(4));
    file_put_contents($dirtyFile, "dirty\n");

    try {
        $before = shell_exec('git -C ' . escapeshellarg($repoRoot) . ' status --porcelain');

        // Capture stdout and stderr SEPARATELY (the property #188 restores).
        $cmd = 'php ' . escapeshellarg($script) . ' ' . escapeshellarg($caseFile) . ' --timeout 180';
        $proc = \KYAULabs\Eval\Runner::captureOutput($cmd);

        $after = shell_exec('git -C ' . escapeshellarg($repoRoot) . ' status --porcelain');
        expect($after)->toBe($before, 'eval run mutated the source working tree');

        $result = json_decode($proc['stdout'], true);
        expect($result)->toBeArray('run-eval stdout was not parseable JSON');
        expect($result)->toHaveKey('verdict');

        // The dirty-tree NOTICE must live on stderr, never in the JSON stream.
        expect($proc['stderr'])->toContain('NOTICE');
        expect($proc['stdout'])->not->toContain('NOTICE');
    } finally {
        if (file_exists($dirtyFile)) {
            unlink($dirtyFile);
        }
    }
})->group('slow');
```

- [ ] **Step 2: Run the full unit suite to confirm nothing regressed (slow group excluded by default)**

Run: `php vendor/bin/pest tests/Unit/Eval`
Expected: PASS (the new slow test is not collected here).

- [ ] **Step 3: (Manual, when opencode + a provider are configured) Run the slow test**

Run: `php vendor/bin/pest --group slow --filter 'dirty tree emits parseable JSON'`
Expected: PASS — stdout parses to an array with a `verdict`; stderr contains `NOTICE`; stdout contains no `NOTICE`.

- [ ] **Step 4: Commit**

```bash
git add tests/Integration/Eval/RunEvalIntegrationTest.php
git commit -S -m $'test(evals): cover dirty-tree stderr separation end to end\n\nAdd a slow integration test that dirties the source tree, runs run-eval\non the smoke case, and asserts the JSON-decodable stdout stays free of\nthe dirty-tree NOTICE while the NOTICE lands on stderr. Guards against\nregressing the #188 stream-merge fix.\n\nRefs: #188\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

## Verification (run after all tasks, before `/check`)

- `php vendor/bin/pest tests/Unit/Eval` — all green (fast, no opencode needed).
- `php vendor/bin/pest` (full default suite) — green; confirm the slow dirty-tree test is NOT collected (clean CI must not depend on opencode).
- `php -d pcov.enabled=1 vendor/bin/pest --coverage` — ≥80% line coverage on the three changed source files (`EvalRunner.php`, `run-suite.php`, `run-eval.php`); enforced by `.github/scripts/coverage-gate.php`.
- Grep the changed scripts for `2>&1` to confirm neither `run-suite.php` invocation reintroduces the merge: `2>&1` should no longer appear in `run-suite.php`.

## Acceptance-criteria mapping

| Issue criterion | Covered by |
| --- | --- |
| Running the suite with an uncommitted change yields valid per-case verdicts | Task 2 (run path) + Task 4 (slow end-to-end) |
| `RunEvalIntegrationTest` exercises a dirty-tree run and asserts parseable results | Task 4 |
| Diagnostic NOTICE/WARNING text never appears in the decoded JSON | Task 1 (`captureOutput`) + Task 2 + Task 4 (`stdout` not contains `NOTICE`) |
| A worktree-setup failure yields a JSON INVALID result, not a PHP fatal | Task 3 (catch `\Throwable`) + Task 3 guard |

## Notes / out of scope

- `EvalRunner.php`'s own internal `git … 2>&1` calls (e.g. `:954`, `:988`, `:1062`) are **unrelated** — they capture a git subcommand's merged output inside EvalRunner for its own logic, not the inter-process JSON stream. Left untouched.
- No ADR warranted: localized bug fix, no hard-to-reverse decision.
- No `@architect` review warranted: Low effort, three files, no cross-cutting or domain impact.
