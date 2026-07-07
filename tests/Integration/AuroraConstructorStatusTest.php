<?php

declare(strict_types=1);

# $KYAULabs: AuroraConstructorStatusTest.php kyau@nova 2026/07/04 -0700 Exp $

/**
 * Scans all web-accessible PHP files for hardcoded Aurora constructor
 * $status=true (positional or named argument). Every PHP page scaffolded
 * through the aurora-page skill must use env_bool('APP_DEBUG')
 * — never a literal true. This test prevents that class of production
 * error-display bug from silently recurring as apps are added.
 * The kyaulabs-aurora-status-true-literal Semgrep rule provides early
 * warning at diff-audit time (see ADR-0002).
 */

test('Aurora constructor must not hardcode $status=true in web-accessible files', function () {
    $root = dirname(__DIR__);
    $excluded = ['aurora', 'tests', 'backend', 'vendor', 'node_modules', '.git'];
    $pattern = '/(?:new\s+KYAULabs\\\\Aurora\(\s*[^,]+,\s*[^,]+,\s*true\b)|(?:\bstatus:\s*true\b)/';

    $files = [];

    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root, RecursiveDirectoryIterator::SKIP_DOTS),
    );

    foreach ($iterator as $file) {
        if (!$file->isFile() || $file->getExtension() !== 'php') {
            continue;
        }

        $path = $file->getPathname();

        foreach ($excluded as $excl) {
            if (str_contains($path, DIRECTORY_SEPARATOR . $excl . DIRECTORY_SEPARATOR)) {
                continue 2;
            }
        }

        $files[] = $path;
    }

    $violations = [];

    foreach ($files as $path) {
        $contents = file_get_contents($path);

        if ($contents === false) {
            continue;
        }

        if (preg_match($pattern, $contents) === 1) {
            $violations[] = $path;
        }
    }

    expect($violations)->toBeEmpty(
        'Files with hardcoded $status=true in Aurora constructor:' .
        "\n" . implode("\n", $violations) .
        "\nReplace with: env_bool('APP_DEBUG')",
    );
});

test('env_bool returns true after load_env loads APP_DEBUG=true', function () {
    require_once __DIR__ . '/../../backend/env.php';

    $path = sys_get_temp_dir() . '/test_integration_debug.env';
    file_put_contents($path, "APP_DEBUG=true\n");

    load_env($path);

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeTrue();

    unlink($path);
    unset($_ENV['APP_DEBUG']);
    putenv('APP_DEBUG');
});

test('env_bool returns false when load_env file is absent (prod default)', function () {
    require_once __DIR__ . '/../../backend/env.php';

    unset($_ENV['APP_DEBUG']);
    putenv('APP_DEBUG');

    $path = sys_get_temp_dir() . '/definitely_not_a_file.env';

    load_env($path);

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeFalse();
});

// vim: ft=php sts=4 sw=4 ts=4 et :
