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

    expect($cmd)->toContain('opencode run');
    expect($cmd)->toContain('--mode build');
    expect($cmd)->toContain('--prompt');
    expect($cmd)->toContain('Write a function add(a, b)');
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

// vim: ft=php sts=4 sw=4 ts=4 et :
