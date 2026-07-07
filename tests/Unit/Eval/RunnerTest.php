<?php

# $KYAULabs: RunnerTest.php creator@host YYYY/MM/DD ±TZ Exp $

declare(strict_types=1);

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

    // Uses --agent with the agent name (stripped of @)
    expect($cmd)->toContain('--agent tdd');

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

    // Agent from the eval case is reflected in --agent
    expect($cmd)->toContain('--agent code-review');
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

    $result = $runner->checkDeterministic($case, '', '', 0);
    expect($result)->not->toBeNull();
    expect($result->verdict)->toBe('PASS');

    $result2 = $runner->checkDeterministic($case, '', 'some error', 0);
    expect($result2)->not->toBeNull();
    expect($result2->verdict)->toBe('FAIL');
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

// vim: ft=php sts=4 sw=4 ts=4 et :
