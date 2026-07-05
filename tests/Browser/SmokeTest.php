<?php

declare(strict_types=1);

# $KYAULabs: SmokeTest.php,v 1.0.0 2026/07/04 -0700 kyau Exp $

$baseUrl = $_ENV['PEST_BROWSER_BASE_URL'] ?? 'http://localhost:8080';

test('smoke test verifies browser testing infrastructure works', function () use ($baseUrl) {
    visit($baseUrl . '/smoke.html')
        ->assertSee('Smoke Test')
        ->assertSee('Browser testing infrastructure is working.');
});

// vim: ft=php sts=4 sw=4 ts=4 et :
