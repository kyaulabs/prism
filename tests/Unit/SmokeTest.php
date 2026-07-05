<?php

declare(strict_types=1);

# $KYAULabs: SmokeTest.php,v 1.0.0 2026/07/04 -0700 kyau Exp $

require_once __DIR__ . '/../../backend/smoke.php';

test('smoke test verifies unit testing infrastructure works', function () {
    expect(smoke_test())->toBeTrue();
});

// vim: ft=php sts=4 sw=4 ts=4 et :
