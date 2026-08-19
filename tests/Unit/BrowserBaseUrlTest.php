<?php

declare(strict_types=1);

# $KYAULabs: BrowserBaseUrlTest.php kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

beforeEach(function () {
    putenv('PEST_BROWSER_BASE_URL');
});

afterEach(restoreEnvVars('PEST_BROWSER_BASE_URL'));

test('browser_base_url returns getenv value when env var is set', function () {
    putenv('PEST_BROWSER_BASE_URL=http://test.example.com:9999');

    expect(browser_base_url())->toBe('http://test.example.com:9999');
});

test('browser_base_url falls back to localhost when env var is unset', function () {
    expect(browser_base_url())->toBe('http://localhost:8080');
});

test('browser_base_url falls back to localhost when env var is empty string', function () {
    putenv('PEST_BROWSER_BASE_URL=');

    expect(browser_base_url())->toBe('http://localhost:8080');
});

// vim: ft=php sts=4 sw=4 ts=4 et :
