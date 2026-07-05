<?php

# $KYAULabs: EvalCaseTest.php creator@host YYYY/MM/DD ±TZ Exp $

declare(strict_types=1);

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

// vim: ft=php sts=4 sw=4 ts=4 et :
