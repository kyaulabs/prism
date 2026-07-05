<?php

declare(strict_types=1);

# $KYAULabs: SmokeTest.php kyau@nova 2026/07/04 -0700 Exp $

test('smoke test verifies PHP version meets minimum requirement', function () {
    expect(version_compare(PHP_VERSION, '8.5', '>='))->toBeTrue();
});

test('smoke test verifies pest is properly installed', function () {
    expect(class_exists(\Pest\TestSuite::class))->toBeTrue();
});

// vim: ft=php sts=4 sw=4 ts=4 et :
