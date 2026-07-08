<?php

declare(strict_types=1);

# $KYAULabs: RcsHeaderConventionTest.php kyau@nova 2026/07/07 -0700 Exp $

test('source file RCS headers contain no placeholder or foreign literals', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $exclude = [
        DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'node_modules' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'aurora' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'cdn' . DIRECTORY_SEPARATOR . 'css' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'cdn' . DIRECTORY_SEPARATOR . 'javascript' . DIRECTORY_SEPARATOR,
    ];
    $badPatterns = ['creator@host', 'YYYY/MM/DD', 'SEANBR~1'];
    $failures = [];

    $dirIter = new RecursiveDirectoryIterator($repoRoot, RecursiveDirectoryIterator::SKIP_DOTS);
    $iter = new RecursiveIteratorIterator($dirIter);

    foreach ($iter as $file) {
        $path = $file->getPathname();
        $relative = substr($path, strlen($repoRoot) + 1);
        $ext = strtolower($file->getExtension());

        if (!in_array($ext, ['php', 'js', 'scss', 'sh', 'ts'], true)) {
            continue;
        }

        $skip = false;
        foreach ($exclude as $ex) {
            if (str_contains($path, $ex)) {
                $skip = true;
                break;
            }
        }
        if ($skip) {
            continue;
        }

        $handle = fopen($path, 'r');
        if ($handle === false) {
            continue;
        }

        for ($i = 0; $i < 10; $i++) {
            $line = fgets($handle);
            if ($line === false) {
                break;
            }
            if (str_contains($line, '$KYAULabs:')) {
                foreach ($badPatterns as $pattern) {
                    if (str_contains($line, $pattern)) {
                        $failures[] = sprintf('  %s: contains "%s"', $relative, $pattern);
                    }
                }
                break;
            }
        }
        fclose($handle);
    }

    if ($failures !== []) {
        $message = sprintf(
            "Found %d file(s) with placeholder or foreign RCS headers:\n\n%s\n\n"
            . "Fix: replace with kyau@nova YYYY/MM/DD -0700 convention.",
            count($failures),
            implode("\n", $failures),
        );
        expect($failures)->toBeEmpty($message);
    } else {
        expect($failures)->toBeEmpty();
    }
});

test('PHP files with declare(strict_types=1) place it before the RCS header', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $exclude = [
        DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'node_modules' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'aurora' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'cdn' . DIRECTORY_SEPARATOR . 'css' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'cdn' . DIRECTORY_SEPARATOR . 'javascript' . DIRECTORY_SEPARATOR,
    ];
    $failures = [];

    $dirIter = new RecursiveDirectoryIterator($repoRoot, RecursiveDirectoryIterator::SKIP_DOTS);
    $iter = new RecursiveIteratorIterator($dirIter);

    foreach ($iter as $file) {
        $path = $file->getPathname();
        $relative = substr($path, strlen($repoRoot) + 1);

        if (strtolower($file->getExtension()) !== 'php') {
            continue;
        }

        $skip = false;
        foreach ($exclude as $ex) {
            if (str_contains($path, $ex)) {
                $skip = true;
                break;
            }
        }
        if ($skip) {
            continue;
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES);
        if ($lines === false || count($lines) < 5) {
            continue;
        }

        $head = array_slice($lines, 0, 10);
        $declareLine = null;
        $headerLine = null;

        foreach ($head as $i => $line) {
            if ($declareLine === null && str_contains($line, 'declare(strict_types=1)')) {
                $declareLine = $i + 1; // 1-indexed
            }
            if ($headerLine === null && str_contains($line, '$KYAULabs:')) {
                $headerLine = $i + 1; // 1-indexed
            }
        }

        // Only assert if BOTH exist (skip header-only files like MissingCsrfToken fixtures)
        if ($declareLine !== null && $headerLine !== null && $declareLine > $headerLine) {
            $failures[] = sprintf(
                '  %s: RCS header (line %d) before declare(strict_types=1) (line %d)',
                $relative,
                $headerLine,
                $declareLine,
            );
        }
    }

    if ($failures !== []) {
        $message = sprintf(
            "Found %d file(s) with declare(strict_types=1) after the RCS header:\n\n%s\n\n"
            . "Canonical ordering is: <?php -> declare(strict_types=1); -> blank -> # \$KYAULabs: header.",
            count($failures),
            implode("\n", $failures),
        );
        expect($failures)->toBeEmpty($message);
    } else {
        expect($failures)->toBeEmpty();
    }
});

test('source files contain at most one vim modeline', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $exclude = [
        DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'node_modules' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'aurora' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'cdn' . DIRECTORY_SEPARATOR . 'css' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'cdn' . DIRECTORY_SEPARATOR . 'javascript' . DIRECTORY_SEPARATOR,
    ];
    $failures = [];

    $dirIter = new RecursiveDirectoryIterator($repoRoot, RecursiveDirectoryIterator::SKIP_DOTS);
    $iter = new RecursiveIteratorIterator($dirIter);

    foreach ($iter as $file) {
        $path = $file->getPathname();
        $relative = substr($path, strlen($repoRoot) + 1);
        $ext = strtolower($file->getExtension());

        if (!in_array($ext, ['php', 'js', 'scss', 'sh', 'ts'], true)) {
            continue;
        }

        $skip = false;
        foreach ($exclude as $ex) {
            if (str_contains($path, $ex)) {
                $skip = true;
                break;
            }
        }
        if ($skip) {
            continue;
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES);
        if ($lines === false || count($lines) < 3) {
            continue;
        }

        // Strip empty lines for accurate last-N-line sampling
        $nonEmpty = array_values(array_filter($lines, fn (string $l): bool => trim($l) !== ''));

        // Only check the last 5 non-empty lines for modelines — real modelines
        // are always at the end of the file. This avoids false positives from
        // grep references and heredoc content in test fixtures.
        $tail = array_slice($nonEmpty, -5);
        $count = preg_match_all('/vim:\s+ft=\w+\s+sts=\d+/', implode("\n", $tail));

        if ($count > 1) {
            $failures[] = sprintf('  %s: %d vim modelines (expected at most 1)', $relative, $count);
        }
    }

    if ($failures !== []) {
        $message = sprintf(
            "Found %d file(s) with multiple vim modelines:\n\n%s\n\n"
            . "Each source file must contain at most one vim modeline.",
            count($failures),
            implode("\n", $failures),
        );
        expect($failures)->toBeEmpty($message);
    } else {
        expect($failures)->toBeEmpty();
    }
});

// vim: ft=php sts=4 sw=4 ts=4 et :
