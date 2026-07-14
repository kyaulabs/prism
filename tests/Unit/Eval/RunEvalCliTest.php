<?php

declare(strict_types=1);

# $KYAULabs: RunEvalCliTest.php kyau@nova 2026/07/13 -0700 Exp $













it('run-eval.php exists', function () {
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

it('run-eval.php produces INVALID JSON for wrong-typed case fields', function () {
    $caseFile = tempnam(sys_get_temp_dir(), 'eval_');
    $json = json_encode([
        'name' => 123,
        'description' => 'test',
        'agent' => '@tdd',
        'input' => 'test',
        'expected_behavior' => ['test'],
        'pass_criteria' => 'all behaviors observed',
    ]);
    file_put_contents($caseFile, $json);

    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-eval.php';
    $output = [];
    $exitCode = 0;
    exec("php {$script} {$caseFile} --dry-run 2>&1", $output, $exitCode);

    $joined = implode("\n", $output);
    expect($exitCode)->not->toBe(255);
    expect($joined)->not->toContain('Fatal error');
    expect($joined)->not->toContain('TypeError');

    $decoded = json_decode($joined, true);
    expect($decoded)->toBeArray();
    expect($decoded['verdict'])->toBe('INVALID');

    unlink($caseFile);
});


it('run-eval.php header documents UNDETERMINED in exit codes', function () {
    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-eval.php';
    $contents = file_get_contents($script);
    expect($contents)->toContain('UNDETERMINED');
});




// vim: ft=php sts=4 sw=4 ts=4 et :
