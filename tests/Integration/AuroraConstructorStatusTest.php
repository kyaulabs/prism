<?php

declare(strict_types=1);

# $KYAULabs: AuroraConstructorStatusTest.php kyau@nova 2026/07/04 -0700 Exp $

/**
 * Scans all web-accessible PHP files for hardcoded Aurora constructor
 * $status=true (positional or named argument). Every PHP page scaffolded
 * through the aurora-page skill must use (bool)($_ENV['APP_DEBUG'] ?? false)
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
        "\nReplace with: (bool)(\$_ENV['APP_DEBUG'] ?? false)",
    );
});

// vim: ft=php sts=4 sw=4 ts=4 et :
