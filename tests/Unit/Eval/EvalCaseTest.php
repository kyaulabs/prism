<?php

declare(strict_types=1);

# $KYAULabs: EvalCaseTest.php kyau@nova 2026/07/05 -0700 Exp $

use KYAULabs\Eval\EvalCase;

it('parses a valid eval case JSON file', function () {
    $json = json_encode([
        'name' => 'test-case',
        'description' => 'A test case',
        'agent' => '@tdd',
        'input' => 'Write a function',
        'expected_behavior' => ['Agent writes code', 'Agent runs tests'],
        'pass_criteria' => 'all behaviors observed',
        'tags' => ['smoke'],
    ]);
    $file = tempnam(sys_get_temp_dir(), 'eval_');
    file_put_contents($file, $json);

    $case = EvalCase::fromFile($file);

    expect($case->name)->toBe('test-case');
    expect($case->passCriteria)->toBe('all behaviors observed');
    expect($case->expectedBehavior)->toHaveCount(2);

    unlink($file);
});

it('validates required fields', function () {
    $json = json_encode(['name' => 'missing-fields']);
    $file = tempnam(sys_get_temp_dir(), 'eval_');
    file_put_contents($file, $json);

    $errors = EvalCase::fromFile($file)->validate();

    expect($errors)->toHaveCount(6);
    unlink($file);
});

it('validates pass_criteria against allowed values', function () {
    $json = json_encode([
        'name' => 'bad-criteria',
        'description' => 'test',
        'agent' => '@tdd',
        'input' => 'test',
        'expected_behavior' => ['test'],
        'pass_criteria' => 'invalid criteria',
    ]);
    $file = tempnam(sys_get_temp_dir(), 'eval_');
    file_put_contents($file, $json);

    $errors = EvalCase::fromFile($file)->validate();

    expect($errors)->toContain("pass_criteria 'invalid criteria' is not a valid value");
    unlink($file);
});

it('validates expected_string required when pass_criteria is output contains expected string', function () {
    $json = json_encode([
        'name' => 'needs-string',
        'description' => 'desc',
        'agent' => '@tdd',
        'input' => 'test',
        'expected_behavior' => ['behavior'],
        'pass_criteria' => 'output contains expected string',
    ]);
    $file = tempnam(sys_get_temp_dir(), 'eval_');
    file_put_contents($file, $json);

    $errors = EvalCase::fromFile($file)->validate();

    expect($errors)->toContain("expected_string is required when pass_criteria is 'output contains expected string'");
    unlink($file);
});

it('accepts expected_string when pass_criteria is output contains expected string', function () {
    $json = json_encode([
        'name' => 'has-string',
        'description' => 'desc',
        'agent' => '@tdd',
        'input' => 'test',
        'expected_behavior' => ['behavior'],
        'pass_criteria' => 'output contains expected string',
        'expected_string' => 'function add(a, b)',
    ]);
    $file = tempnam(sys_get_temp_dir(), 'eval_');
    file_put_contents($file, $json);

    $errors = EvalCase::fromFile($file)->validate();

    expect($errors)->not->toContain("expected_string is required when pass_criteria is 'output contains expected string'");
    unlink($file);
});

it('parses expected_string from JSON', function () {
    $json = json_encode([
        'name' => 'parse-string',
        'description' => 'desc',
        'agent' => '@tdd',
        'input' => 'test',
        'expected_behavior' => ['behavior'],
        'pass_criteria' => 'output contains expected string',
        'expected_string' => 'needle value',
    ]);
    $file = tempnam(sys_get_temp_dir(), 'eval_');
    file_put_contents($file, $json);

    $case = EvalCase::fromFile($file);

    expect($case->expectedString)->toBe('needle value');
    unlink($file);
});

it('validates expected_string that is empty when pass_criteria requires it', function () {
    $json = json_encode([
        'name' => 'empty-string',
        'description' => 'desc',
        'agent' => '@tdd',
        'input' => 'test',
        'expected_behavior' => ['behavior'],
        'pass_criteria' => 'output contains expected string',
        'expected_string' => '',
    ]);
    $file = tempnam(sys_get_temp_dir(), 'eval_');
    file_put_contents($file, $json);

    $errors = EvalCase::fromFile($file)->validate();

    expect($errors)->toContain("expected_string is required when pass_criteria is 'output contains expected string'");
    unlink($file);
});

it('warns when expected_string is set but pass_criteria does not require it', function () {
    $json = json_encode([
        'name' => 'misconfigured',
        'description' => 'desc',
        'agent' => '@tdd',
        'input' => 'test',
        'expected_behavior' => ['behavior'],
        'pass_criteria' => 'exit code zero',
        'expected_string' => 'some needle',
    ]);
    $file = tempnam(sys_get_temp_dir(), 'eval_');
    file_put_contents($file, $json);

    $errors = EvalCase::fromFile($file)->validate();

    expect($errors)->toContain("expected_string is set but pass_criteria is 'exit code zero' (did you mean 'output contains expected string'?)");
    unlink($file);
});

// vim: ft=php sts=4 sw=4 ts=4 et :
