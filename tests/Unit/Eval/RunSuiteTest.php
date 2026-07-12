<?php

declare(strict_types=1);

# $KYAULabs: RunSuiteTest.php kyau@akira.kyaulabs 2026/07/12 -0700 Exp $




it('run-suite.php exists', function () {
    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-suite.php';
    expect(file_exists($script))->toBeTrue();
});

it('run-suite.php discovers JSON files in a directory', function () {
    $tmpDir = sys_get_temp_dir() . '/eval_suite_test_' . uniqid();
    mkdir($tmpDir);
    $casePath = $tmpDir . '/test-case.json';
    file_put_contents($casePath, json_encode([
        'name' => 'test-case',
        'description' => 'test',
        'agent' => '@tdd',
        'input' => 'test',
        'expected_behavior' => ['test'],
        'pass_criteria' => 'all behaviors observed',
    ]));

    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-suite.php';
    $output = [];
    $exitCode = 0;
    exec("php {$script} {$tmpDir} --timeout 5 2>&1", $output, $exitCode);

    $joined = implode("\n", $output);
    expect($joined)->not->toBeEmpty();

    unlink($casePath);
    rmdir($tmpDir);
});

it('run-suite.php handles case file with string tags without crashing', function () {
    $tmpDir = sys_get_temp_dir() . '/eval_suite_tags_test_' . uniqid();
    mkdir($tmpDir);
    $casePath = $tmpDir . '/bad-tags.json';
    file_put_contents($casePath, json_encode([
        'name' => 'bad-tags',
        'description' => 'test',
        'agent' => '@tdd',
        'input' => 'test',
        'expected_behavior' => ['test'],
        'pass_criteria' => 'all behaviors observed',
        'tags' => 'smoke',
    ]));

    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-suite.php';
    $output = [];
    $exitCode = 0;
    exec("php {$script} {$tmpDir} --tag smoke --timeout 5 2>&1", $output, $exitCode);

    $joined = implode("\n", $output);
    expect($exitCode)->not->toBe(255);
    expect($joined)->not->toContain('Fatal error');
    expect($joined)->not->toContain('TypeError');

    unlink($casePath);
    rmdir($tmpDir);
});


// vim: ft=php sts=4 sw=4 ts=4 et :
