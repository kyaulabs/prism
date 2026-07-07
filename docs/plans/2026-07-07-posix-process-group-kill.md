# POSIX Process-Group Kill on Eval Timeout Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** On Linux/macOS, launch eval commands via `setsid` (own process group) and tree-kill the group on timeout via `posix_kill(-$pid, SIGKILL)`, so no orphaned children survive a timeout.

**Architecture:** Prefix the command with `exec setsid ` in `executeCommand()` on non-Windows so the sh wrapper PID returned by `proc_get_status` is the process-group leader. In `killProcessTree()`, use `posix_kill(-$pid, SIGKILL)` on POSIX with the posix extension, falling back to `proc_terminate($process, 9)`. Windows path is unchanged.

**Tech Stack:** PHP 8.5+, proc_open, posix extension, bash shell utilities

## Global constraints

- PHP 8.5+ (no new dependencies)
- Windows `taskkill /f /t` path must remain unchanged
- Docblocks must describe both platforms
- Unix tests skip on Windows via `->skip(strtoupper(substr(PHP_OS, 0, 3)) === 'WIN', 'POSIX only')`

---

### Task 1: POSIX process-group kill on timeout

**Files:**
- Modify: `.opencode/evals/bin/includes/EvalRunner.php:243-265` (executeCommand)
- Modify: `.opencode/evals/bin/includes/EvalRunner.php:267-280` (readPipes docblock)
- Modify: `.opencode/evals/bin/includes/EvalRunner.php:359-375` (killProcessTree)
- Modify: `tests/Unit/Eval/RunnerTest.php` (add 2 new tests + 1 skip guard)

**Interfaces:**
- Consumes: (none — self-contained change to Runner class internals)
- Produces: `Runner::executeCommand()` now launches via `exec setsid ` on POSIX; `killProcessTree()` tree-kills via `posix_kill(-$pid, SIGKILL)` on POSIX, falls back to `proc_terminate`

- [ ] **Step 1: Write the failing test — new process group on POSIX**

Add to `tests/Unit/Eval/RunnerTest.php` before the final `// vim:` modeline:

```php
it('executeCommand launches commands in a new process group on POSIX', function () {
    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $this->markTestSkipped('POSIX-only test');
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

- [ ] **Step 2: Run test to verify it fails**

Run: `php vendor/bin/pest tests/Unit/Eval/RunnerTest.php --filter "new process group"`
Expected: FAIL — PGID != PID (no `setsid` prefix yet)

- [ ] **Step 3: Write minimal implementation — setsid prefix in executeCommand**

In `EvalRunner.php`, modify `executeCommand()` (line ~251):

```php
public function executeCommand(string $cmd, int $timeout): array
{
    // On POSIX, launch via exec setsid so the process runs in its own
    // process group. The PID from proc_get_status then identifies the
    // group, enabling posix_kill(-$pid, SIGKILL) to tree-kill on timeout.
    if (DIRECTORY_SEPARATOR !== '\\') {
        $cmd = 'exec setsid ' . $cmd;
    }

    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $process = proc_open($cmd, $descriptors, $pipes);
    // ... rest unchanged
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php vendor/bin/pest tests/Unit/Eval/RunnerTest.php --filter "new process group"`
Expected: PASS

- [ ] **Step 5: Write the failing test — full tree kill on timeout (POSIX)**

Add to `tests/Unit/Eval/RunnerTest.php`:

```php
it('killProcessTree terminates the full process tree on timeout (POSIX)', function () {
    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
        $this->markTestSkipped('POSIX-only test');
    }

    $runner = new Runner(__DIR__);

    // Spawn a command that writes its child PID to a temp file, then sleeps.
    // The child (sleep) should not survive the timeout+kill.
    $marker = tempnam(sys_get_temp_dir(), 'eval-kill-');
    $cmd = sprintf(
        "sh -c 'sleep 30 & echo \$! > %s; wait'",
        escapeshellarg($marker),
    );

    $start = hrtime(true);
    $output = $runner->executeCommand($cmd, 1);
    $elapsed = (hrtime(true) - $start) / 1_000_000_000;

    expect($elapsed)->toBeLessThan(2.5);
    expect($output['timed_out'])->toBeTrue();

    // Read the child PID that was spawned
    if (!file_exists($marker)) {
        unlink($marker);
        $this->markTestSkipped('Command did not write child PID file');
    }

    $childPid = (int) trim((string) file_get_contents($marker));
    unlink($marker);

    if ($childPid <= 0) {
        $this->markTestSkipped('Could not read child PID');
    }

    // Give the kernel a moment to reap
    usleep(100_000);

    // The child should be dead — posix_kill(pid, 0) checks existence
    $alive = posix_kill($childPid, 0);
    expect($alive)->toBeFalse();
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `php vendor/bin/pest tests/Unit/Eval/RunnerTest.php --filter "terminates the full process tree"`
Expected: FAIL — child still alive (only `proc_terminate` on sh wrapper, not children)

- [ ] **Step 7: Write minimal implementation — posix_kill in killProcessTree**

Replace `killProcessTree()` (lines 369-375) with:

```php
/**
 * Kill a process and its entire child tree.
 *
 * On Windows, proc_terminate only signals the shell wrapper (cmd.exe)
 * but not child processes. taskkill /t ensures the full tree is
 * terminated so stream_get_contents does not block.
 *
 * On POSIX, the process was launched via exec setsid (own process group),
 * so posix_kill(-$pid, SIGKILL) kills the entire group. Falls back to
 * proc_terminate when the posix extension is unavailable.
 *
 * @param resource $process
 * @param int $pid    Process group leader PID (equal to PGID via setsid).
 */
private function killProcessTree($process, int $pid): void
{
    if (DIRECTORY_SEPARATOR === '\\') {
        exec("taskkill /f /t /pid {$pid} 2>NUL");
        proc_terminate($process, 9);
    } elseif (function_exists('posix_kill')) {
        // Negative PID: kill the entire process group (setsid'd)
        posix_kill(-$pid, SIGKILL);
    } else {
        proc_terminate($process, 9);
    }
}
```

- [ ] **Step 8: Run both new tests to verify they pass**

Run: `php vendor/bin/pest tests/Unit/Eval/RunnerTest.php --filter "process group|terminates the full"`
Expected: both PASS

- [ ] **Step 9: Update readPipes docblock (lines 267-280)**

Update the docblock to describe both platforms:

```php
/**
 * Read stdout and stderr pipes until both EOF or timeout expires.
 *
 * Uses stream_select to wait for pipe data without blocking,
 * interleaving reads on stdout and stderr to avoid pipe-buffer
 * deadlock. Enforces a wall-clock timeout — on Windows via
 * taskkill /t /f, on POSIX via posix_kill(-$pid, SIGKILL) against
 * the process group (set up by exec setsid in executeCommand).
 *
 * @param  resource $process
 * @param  array{0: resource, 1: resource, 2: resource} $pipes
 * @param  int $timeout  Timeout in seconds.
 * @param  int $pid  Process group leader PID for tree-kill.
 * @return array{stdout: string, stderr: string, exitCode: int, timed_out: bool}
 */
```

- [ ] **Step 10: Add skip guard to existing timeout test for clean POSIX result**

The existing `executeCommand enforces timeout on slow commands` test (line 238) uses `sleep 3`. On POSIX, after the setsid+posix_kill change, `sleep` will be fully killed so the elapsed time check is fine. However, add a Windows skip for the new POSIX-specific tests is already done. No changes needed to the existing test.

- [ ] **Step 11: Run full eval test suite**

Run: `php vendor/bin/pest tests/Unit/Eval/`
Expected: all tests PASS (POSIX tests skip on Windows, Windows path unchanged)

- [ ] **Step 12: Run full suite + coverage**

Run: `php -d pcov.enabled=1 vendor/bin/pest --coverage`
Expected: 80%+ line coverage on changed file, all tests PASS

- [ ] **Step 13: Verify no surviving processes from the test suite**

Run: `ps aux | grep 'eval-kill\|sleep 30' | grep -v grep || echo "clean"`
Expected: clean (no orphaned sleep processes)

- [ ] **Step 14: Commit**

```bash
git add .opencode/evals/bin/includes/EvalRunner.php tests/Unit/Eval/RunnerTest.php docs/plans/2026-07-07-posix-process-group-kill.md
git commit -S -m "fix(eval): POSIX process-group kill on eval timeout

On Linux/macOS, proc_terminate only signals the sh -c wrapper,
orphaning the actual opencode process and its children after a
timeout. Launch via exec setsid (own process group) and tree-kill
on timeout via posix_kill(-$pid, SIGKILL).

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```
