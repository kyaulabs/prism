<?php

declare(strict_types=1);

# $KYAULabs: SmokeTest.php,v 1.0.0 2026/07/04 -0700 kyau Exp $

test('smoke test verifies backend smoke file exists and is readable', function () {
    $path = dirname(__DIR__, 2) . '/backend/smoke.php';

    expect(file_exists($path))->toBeTrue();
    expect(is_readable($path))->toBeTrue();
});

test('smoke test verifies backend smoke file has expected content', function () {
    $path = dirname(__DIR__, 2) . '/backend/smoke.php';
    $contents = file_get_contents($path);

    expect($contents)->toContain('function smoke_test');
    expect($contents)->toContain('return true');
});

// vim: ft=php sts=4 sw=4 ts=4 et :
