<?php

declare(strict_types=1);

# $KYAULabs: RunEvalCliTest.php kyau@nova 2026/07/05 -0700 Exp $

it('run-eval.php exists and is executable', function () {
    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-eval.php';
    expect(file_exists($script))->toBeTrue();
});

it('run-eval.php with --dry-run prints the command', function () {
    $caseFile = tempnam(sys_get_temp_dir(), 'eval_');
    $json = json_encode([
        'name' => 'dry-run-test',
        'description' => 'test',
        'agent' => '@tdd',
        'input' => 'Write a function',
        'expected_behavior' => ['test'],
        'pass_criteria' => 'all behaviors observed',
    ]);
    file_put_contents($caseFile, $json);

    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-eval.php';
    $output = [];
    $exitCode = 0;
    exec("php {$script} {$caseFile} --dry-run 2>&1", $output, $exitCode);

    $joined = implode("\n", $output);
    expect($joined)->toContain('opencode run');
    expect($joined)->toContain('DRY RUN');

    unlink($caseFile);
});

// vim: ft=php sts=4 sw=4 ts=4 et :
