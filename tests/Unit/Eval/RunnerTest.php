<?php

declare(strict_types=1);

# $KYAULabs: RunnerTest.php kyau@nova 2026/07/05 -0700 Exp $

use KYAULabs\Eval\Runner;
use KYAULabs\Eval\EvalCase;
use KYAULabs\Eval\EvalResult;

it('builds correct opencode run command', function () {
    $runner = new Runner('/path/to/repo');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'Write a function add(a, b)',
        expectedBehavior: ['test'],
        passCriteria: 'all behaviors observed',
    );

    $cmd = $runner->buildCommand($case);

    // Command starts with opencode run
    expect($cmd)->toContain('opencode run');

    // Uses --agent with the agent name (stripped of @, then escaped)
    expect($cmd)->toContain(escapeshellarg('tdd'));

    // Uses --dir for the repo root
    expect($cmd)->toContain('--dir');

    // Message is positional (last argument)
    expect($cmd)->toContain('Write a function add(a, b)');

    // Must NOT contain any invalid opencode run flags
    expect($cmd)->not->toContain('--prompt');
    expect($cmd)->not->toContain('--mode build');
    expect($cmd)->not->toContain('--path');
    expect($cmd)->not->toContain('--permissions');
});

it('buildCommand reflects case agent', function () {
    $runner = new Runner('/path/to/repo');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@code-review',
        input: 'Review this code',
        expectedBehavior: ['test'],
        passCriteria: 'all behaviors observed',
    );

    $cmd = $runner->buildCommand($case);

    // Agent from the eval case is reflected in --agent (escaped)
    expect($cmd)->toContain(escapeshellarg('code-review'));
});

it('buildJudgeCommand uses valid opencode run flags', function () {
    $runner = new Runner('/path/to/repo');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'Test input',
        expectedBehavior: ['do thing'],
        passCriteria: 'all behaviors observed',
    );

    $cmd = $runner->buildJudgeCommand($case, 'some agent output');

    // Judge runs with --dir for repo root
    expect($cmd)->toContain('--dir');

    // Judge prompt is embedded in the message
    expect($cmd)->toContain('agent output');

    // Must NOT contain invalid opencode run flags (these belong to tui/agent create, not run)
    expect($cmd)->not->toContain('--prompt');
    expect($cmd)->not->toContain('--mode build');
    expect($cmd)->not->toContain('--path');
    expect($cmd)->not->toContain('--permissions');
});

it('buildCommand and buildJudgeCommand use only valid opencode run flags', function () {
    // Parse the vendored cli.mdx run-flags table and verify every
    // --flag used by buildCommand/buildJudgeCommand appears in it.
    $cliMdx = file_get_contents(dirname(__DIR__, 3) . '/.opencode/skills/opencode-docs/docs/cli.mdx');
    if ($cliMdx === false) {
        $this->markTestSkipped('cli.mdx not found');
    }

    // Extract run command flags table (under ### run section)
    $runSection = false;
    $startsWithH3 = false;
    $runFlags = [];

    $lines = explode("\n", $cliMdx);
    foreach ($lines as $line) {
        if (preg_match('/^### run\b/', $line)) {
            $runSection = true;
            continue;
        }
        if ($runSection && preg_match('/^### \w/', $line)) {
            // Next section starts — stop collecting
            break;
        }
        if ($runSection) {
            // Match flag table rows: | <nobr><code>{"--flagname"}</code></nobr>
            if (preg_match('/<code>\{"(--[\w-]+)"\}<\/code>/', $line, $m)) {
                $runFlags[] = $m[1];
            }
        }
    }

    // Build a representative command and extract all --flags used
    $runner = new Runner('/path/to/repo');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test input',
        expectedBehavior: ['test'],
        passCriteria: 'all behaviors observed',
    );

    $buildCmd = $runner->buildCommand($case);
    $judgeCmd = $runner->buildJudgeCommand($case, 'judge output');

    $allCmds = [$buildCmd, $judgeCmd];
    foreach ($allCmds as $cmd) {
        preg_match_all('/--[a-zA-Z][\w-]*/', $cmd, $matches);
        foreach ($matches[0] as $flag) {
            expect($runFlags)->toContain($flag);
        }
    }
});

it('deterministic gate: exit code zero', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: [],
        passCriteria: 'exit code zero',
    );

    $result = $runner->checkDeterministic($case, 'output', '', 0);

    expect($result)->not->toBeNull();
    expect($result->verdict)->toBe('PASS');
    expect($result->judgeUsed)->toBeFalse();
    expect($result->deterministicChecks)->toHaveKey('exit_code');
    expect($result->deterministicChecks['exit_code']['pass'])->toBeTrue();
    expect($result->deterministicChecks['exit_code']['actual'])->toBe(0);
});

it('deterministic gate: exit code zero fails on non-zero', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: [],
        passCriteria: 'exit code zero',
    );

    $result = $runner->checkDeterministic($case, 'output', 'error', 1);

    expect($result)->not->toBeNull();
    expect($result->verdict)->toBe('FAIL');
    expect($result->deterministicChecks['exit_code']['pass'])->toBeFalse();
    expect($result->deterministicChecks['exit_code']['actual'])->toBe(1);
});

it('deterministic gate: no errors in output', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: [],
        passCriteria: 'no errors in output',
    );

    // Benign stderr (warnings, progress, deprecation notices) → PASS
    $result = $runner->checkDeterministic($case, '', 'Warning: deprecated, progress 50%', 0);
    expect($result)->not->toBeNull();
    expect($result->verdict)->toBe('PASS');
    expect($result->deterministicChecks)->toHaveKey('stderr_severity');
    expect($result->deterministicChecks['stderr_severity']['pass'])->toBeTrue();
    expect($result->deterministicChecks['stderr_severity']['matched'])->toBeFalse();

    // Error-severity stderr → FAIL
    $result2 = $runner->checkDeterministic($case, '', "Fatal error: uncaught thing\n", 0);
    expect($result2)->not->toBeNull();
    expect($result2->verdict)->toBe('FAIL');
    expect($result2->deterministicChecks['stderr_severity']['pass'])->toBeFalse();
    expect($result2->deterministicChecks['stderr_severity']['matched'])->toBeTrue();
});

it('deterministic gate: all behaviors observed returns null', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: ['do thing'],
        passCriteria: 'all behaviors observed',
    );

    $result = $runner->checkDeterministic($case, 'output', '', 0);

    expect($result)->toBeNull();
});

it('deterministic gate: manual inspection returns undetermined', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: [],
        passCriteria: 'manual inspection required',
    );

    $result = $runner->checkDeterministic($case, '', '', 0);

    expect($result)->not->toBeNull();
    expect($result->verdict)->toBe('UNDETERMINED');
    expect($result->deterministicChecks)->toBe([]);
});

it('executeCommand runs a command and captures output', function () {
    $runner = new Runner(__DIR__);

    $output = $runner->executeCommand('echo "hello world"', 5);

    expect($output['stdout'])->toContain('hello world');
    expect($output['exitCode'])->toBe(0);
    expect($output['timed_out'])->toBeFalse();
});

it('executeCommand enforces timeout on slow commands', function () {
    $runner = new Runner(__DIR__);

    $start = hrtime(true);
    $output = $runner->executeCommand('sleep 3', 1);
    $elapsed = (hrtime(true) - $start) / 1_000_000_000;

    expect($elapsed)->toBeLessThan(2.5);
    expect($output['timed_out'])->toBeTrue();
    expect($output['stdout'])->toBe('');
    expect($output['stderr'])->toBe('');
});

it('executeCommand does not deadlock on large stderr before stdout', function () {
    $runner = new Runner(__DIR__);

    $output = $runner->executeCommand(
        'php -r "fwrite(STDERR, str_repeat(\'x\', 131072)); echo \'done\';"',
        10,
    );

    expect($output['timed_out'])->toBeFalse();
    expect($output['stdout'])->toBe('done');
    expect($output['exitCode'])->toBe(0);
});

it('runJudge returns TIMEOUT verdict when executeCommand times out', function () {
    $runner = new Runner(__DIR__, timeout: 0);
    $case = new EvalCase(
        name: 'timeout-case',
        description: 'Should timeout',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: ['do thing'],
        passCriteria: 'all behaviors observed',
    );

    $result = $runner->runJudge($case, 'some output');

    expect($result->verdict)->toBe('TIMEOUT');
    expect($result->error)->toContain('timed out');
    expect($result->judgeUsed)->toBeTrue();
});

it('buildJudgeCommand runs the judge as the read-only judge agent', function () {
    $runner = new Runner('/path/to/repo');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test input',
        expectedBehavior: ['do thing'],
        passCriteria: 'all behaviors observed',
    );

    $cmd = $runner->buildJudgeCommand($case, 'agent output');

    expect($cmd)->toContain('--agent judge');
});
it('createWorktree creates a real git worktree and removeWorktree cleans it up', function () {
    // Build a throwaway git repo so we don't touch the real source tree.
    $repo = sys_get_temp_dir() . '/eval-runner-test-' . bin2hex(random_bytes(4));
    mkdir($repo);
    exec('git -C ' . escapeshellarg($repo) . ' init -q');
    exec('git -C ' . escapeshellarg($repo) . ' config user.email t@t');
    exec('git -C ' . escapeshellarg($repo) . ' config user.name t');
    file_put_contents($repo . '/README', "init\n");
    exec('git -C ' . escapeshellarg($repo) . ' add README');
    exec('git -C ' . escapeshellarg($repo) . ' commit -q -m init');

    $worktree = null;

    try {
        $runner = new Runner($repo);

        $worktree = $runner->createWorktree();

        expect(is_dir($worktree))->toBeTrue();
        expect(file_exists($worktree . '/README'))->toBeTrue();

        // It is registered as a worktree of the source repo.
        // Use basename for cross-platform path normalization — git may use
        // 8.3 short names or different slash conventions on Windows.
        $worktreeBase = basename($worktree);
        $list = shell_exec('git -C ' . escapeshellarg($repo) . ' worktree list');
        expect($list)->toContain($worktreeBase);

        $runner->removeWorktree($worktree);

        expect(is_dir($worktree))->toBeFalse();
        $listAfter = shell_exec('git -C ' . escapeshellarg($repo) . ' worktree list');
        expect($listAfter)->not->toContain($worktreeBase);
    } finally {
        if ($worktree !== null && is_dir($worktree)) {
            exec('git -C ' . escapeshellarg($repo) . ' worktree remove --force ' . escapeshellarg($worktree) . ' 2>/dev/null');
        }
        if (is_dir($repo)) {
            // Cross-platform recursive delete
            if (DIRECTORY_SEPARATOR === '\\') {
                exec('rd /s /q ' . escapeshellarg($repo) . ' 2>NUL');
            } else {
                exec('rm -rf ' . escapeshellarg($repo));
            }
        }
    }
});

it('buildCommand accepts a dir override for the worktree', function () {
    $runner = new Runner('/path/to/repo');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'do thing',
        expectedBehavior: ['test'],
        passCriteria: 'all behaviors observed',
    );

    $cmd = $runner->buildCommand($case, '/tmp/worktree-123');

    expect($cmd)->toContain('--dir');
    expect($cmd)->toContain('/tmp/worktree-123');
    expect($cmd)->not->toContain('/path/to/repo');
});

it('buildCommand falls back to repoRoot when no dir is given', function () {
    $runner = new Runner('/path/to/repo');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'do thing',
        expectedBehavior: ['test'],
        passCriteria: 'all behaviors observed',
    );

    $cmd = $runner->buildCommand($case);

    expect($cmd)->toContain('/path/to/repo');
});

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
        $this->markTestSkipped('Command did not write child PID file');
    }

    $childPid = (int) trim((string) file_get_contents($marker));
    unlink($marker);

    if ($childPid <= 0) {
        $this->markTestSkipped('Could not read child PID');
    }

    // Retry: kernel reaping can lag under CI load
    $alive = true;
    for ($i = 0; $i < 10; $i++) {
        $alive = posix_kill($childPid, 0);
        if (!$alive) {
            break;
        }
        usleep(50_000);
    }

    // The child should be dead — posix_kill(pid, 0) checks existence
    expect($alive)->toBeFalse();
});

it('deterministic gate: output contains expected string passes when needle found', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: ['behavior'],
        passCriteria: 'output contains expected string',
        expectedString: 'function add(a, b)',
    );

    $result = $runner->checkDeterministic($case, 'here is function add(a, b) in output', '', 0);

    expect($result)->not->toBeNull();
    expect($result->verdict)->toBe('PASS');
    expect($result->deterministicChecks)->toHaveKey('expected_string');
    expect($result->deterministicChecks['expected_string']['pass'])->toBeTrue();
    expect($result->deterministicChecks['expected_string']['found'])->toBeTrue();
});

it('deterministic gate: output contains expected string fails when needle absent', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: ['behavior'],
        passCriteria: 'output contains expected string',
        expectedString: 'function add(a, b)',
    );

    $result = $runner->checkDeterministic($case, 'totally unrelated output', '', 0);

    expect($result)->not->toBeNull();
    expect($result->verdict)->toBe('FAIL');
    expect($result->deterministicChecks['expected_string']['pass'])->toBeFalse();
    expect($result->deterministicChecks['expected_string']['found'])->toBeFalse();
});

it('deterministic gate: output contains expected string fails when expectedString is null', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: ['behavior'],
        passCriteria: 'output contains expected string',
        // expectedString defaults to null
    );

    $result = $runner->checkDeterministic($case, 'some output', '', 0);

    expect($result)->not->toBeNull();
    expect($result->verdict)->toBe('FAIL');
    expect($result->deterministicChecks['expected_string']['pass'])->toBeFalse();
    expect($result->deterministicChecks['expected_string']['found'])->toBeFalse();
});

// vim: ft=php sts=4 sw=4 ts=4 et :
