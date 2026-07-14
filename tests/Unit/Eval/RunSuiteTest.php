<?php

declare(strict_types=1);

# $KYAULabs: RunSuiteTest.php kyau@nova 2026/07/13 -0700 Exp $

























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
    exec("php " . escapeshellarg($script) . " " . escapeshellarg($tmpDir) . " --timeout 5 2>&1", $output, $exitCode);

    $joined = implode("\n", $output);
    expect($exitCode)->not->toBe(255);
    expect($joined)->not->toContain('Fatal error');
    expect($joined)->not->toContain('TypeError');
    expect($joined)->toContain('test-case');
    expect($joined)->toContain('| # | Eval Case | Verdict |');
    expect($joined)->toContain('**Suite:');

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
    exec("php " . escapeshellarg($script) . " " . escapeshellarg($tmpDir) . " --tag smoke --timeout 5 2>&1", $output, $exitCode);

    $joined = implode("\n", $output);
    expect($exitCode)->not->toBe(255);
    expect($joined)->not->toContain('Fatal error');
    expect($joined)->not->toContain('TypeError');
    expect($joined)->toContain('No eval cases found');

    unlink($casePath);
    rmdir($tmpDir);
});

it('run-suite.php --dry-run streams verbatim and exits 0', function () {
    $tmpDir = sys_get_temp_dir() . '/eval_suite_dryrun_test_' . uniqid();
    mkdir($tmpDir);
    $casePath = $tmpDir . '/dry-run-case.json';
    file_put_contents($casePath, json_encode([
        'name' => 'dry-run-case',
        'description' => 'test',
        'agent' => '@tdd',
        'input' => 'Write a function',
        'expected_behavior' => ['test'],
        'pass_criteria' => 'all behaviors observed',
    ]));

    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-suite.php';
    $output = [];
    $exitCode = 0;
    exec("php " . escapeshellarg($script) . " " . escapeshellarg($tmpDir) . " --dry-run --timeout 5 2>&1", $output, $exitCode);

    $joined = implode("\n", $output);

    // Dry-run should exit 0 (not 1)
    expect($exitCode)->toBe(0);

    // Should stream the verbatim run-eval dry-run output
    expect($joined)->toContain('DRY RUN');
    expect($joined)->toContain('opencode run');

    // Should NOT mark anything INVALID
    expect($joined)->not->toContain('INVALID');

    // Should NOT write a results file
    expect($joined)->not->toContain('Detailed results:');

    // Should NOT print the markdown summary table header
    expect($joined)->not->toContain('| # | Eval Case | Verdict |');

    unlink($casePath);
    rmdir($tmpDir);
});



it('run-suite.php header documents --fail-on-undetermined flag', function () {
    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-suite.php';
    $contents = file_get_contents($script);
    expect($contents)->toContain('--fail-on-undetermined');
    expect($contents)->toContain('UNDETERMINED');
});

it('run-suite.php summary line includes undetermined count', function () {
    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-suite.php';
    $contents = file_get_contents($script);
    expect($contents)->toContain('undetermined');
});

it('run-suite.php surfaces malformed-JSON case files as INVALID instead of skipping', function () {
    $tmpDir = sys_get_temp_dir() . '/eval_suite_invalid_test_' . uniqid();
    mkdir($tmpDir);
    $brokenPath = $tmpDir . '/broken-case.json';
    // Malformed JSON — not parseable by json_decode
    file_put_contents($brokenPath, '{ this is not valid json');

    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-suite.php';
    $output = [];
    $exitCode = 0;
    exec("php " . escapeshellarg($script) . " " . escapeshellarg($tmpDir) . " --timeout 5 2>&1", $output, $exitCode);

    $joined = implode("\n", $output);
    expect($exitCode)->not->toBe(255);
    expect($joined)->not->toContain('Fatal error');
    // Must NOT claim there were no cases — the broken file must be reported
    expect($joined)->not->toContain('No eval cases found');
    // The broken file's name and an INVALID verdict must appear
    expect($joined)->toContain('broken-case');
    expect($joined)->toContain('INVALID');
    // The suite summary line counts the invalid case
    expect($joined)->toContain('invalid');

    unlink($brokenPath);
    rmdir($tmpDir);
});

it('run-suite.php surfaces schema-invalid case files as INVALID', function () {
    $tmpDir = sys_get_temp_dir() . '/eval_suite_schemaval_test_' . uniqid();
    mkdir($tmpDir);
    $casePath = $tmpDir . '/bad-schema.json';
    file_put_contents($casePath, json_encode([
        'name' => 'bad-schema',
        'description' => 'test',
        'agent' => '@tdd',
        'input' => 'test',
        'expected_behavior' => ['test'],
        'pass_criteria' => 'totally invalid criterion',
    ]));

    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-suite.php';
    $output = [];
    $exitCode = 0;
    exec("php " . escapeshellarg($script) . " " . escapeshellarg($tmpDir) . " --timeout 5 2>&1", $output, $exitCode);

    $joined = implode("\n", $output);
    expect($exitCode)->not->toBe(255);
    expect($joined)->not->toContain('Fatal error');
    expect($joined)->toContain('bad-schema');
    expect($joined)->toContain('INVALID');

    unlink($casePath);
    rmdir($tmpDir);
});

it('run-suite.php excludes malformed case files from tag-filtered runs', function () {
    $tmpDir = sys_get_temp_dir() . '/eval_suite_filtered_test_' . uniqid();
    mkdir($tmpDir);
    $brokenPath = $tmpDir . '/broken-case.json';
    file_put_contents($brokenPath, '{ this is not valid json');

    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-suite.php';
    $output = [];
    $exitCode = 0;
    exec("php " . escapeshellarg($script) . " " . escapeshellarg($tmpDir) . " --tag smoke --timeout 5 2>&1", $output, $exitCode);

    $joined = implode("\n", $output);
    expect($exitCode)->not->toBe(255);
    expect($joined)->not->toContain('Fatal error');
    // Filtered run: the invalid file is excluded, so nothing is found
    expect($joined)->toContain('No eval cases found');
    expect($joined)->not->toContain('INVALID');

    unlink($brokenPath);
    rmdir($tmpDir);
});

it('run-suite.php tag filter selects only matching valid cases', function () {
    $tmpDir = sys_get_temp_dir() . '/eval_suite_tagselect_test_' . uniqid();
    mkdir($tmpDir);
    file_put_contents($tmpDir . '/smoke-case.json', json_encode([
        'name' => 'smoke-case',
        'description' => 'test',
        'agent' => '@tdd',
        'input' => 'Write a function',
        'expected_behavior' => ['test'],
        'pass_criteria' => 'all behaviors observed',
        'tags' => ['smoke'],
    ]));
    file_put_contents($tmpDir . '/integration-case.json', json_encode([
        'name' => 'integration-case',
        'description' => 'test',
        'agent' => '@tdd',
        'input' => 'Write a function',
        'expected_behavior' => ['test'],
        'pass_criteria' => 'all behaviors observed',
        'tags' => ['integration'],
    ]));

    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-suite.php';
    $output = [];
    $exitCode = 0;
    // --dry-run avoids spawning opencode; discovery + tag filter still run
    exec("php " . escapeshellarg($script) . " " . escapeshellarg($tmpDir) . " --tag smoke --dry-run --timeout 5 2>&1", $output, $exitCode);

    $joined = implode("\n", $output);
    expect($exitCode)->toBe(0);
    expect($joined)->toContain('smoke-case');
    expect($joined)->not->toContain('integration-case');

    unlink($tmpDir . '/smoke-case.json');
    unlink($tmpDir . '/integration-case.json');
    rmdir($tmpDir);
});



// vim: ft=php sts=4 sw=4 ts=4 et :
