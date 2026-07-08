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

// vim: ft=php sts=4 sw=4 ts=4 et :
