<?php

declare(strict_types=1);

# $KYAULabs: ArchTest.php kyau@nova 2026/07/13 -0700 Exp $




/**
 * Harness architecture test exclude directories.
 *
 * Returns directory fragments that, if found anywhere in a file path,
 * cause the file to be skipped. Tests/Semgrep/ is excluded because
 * SAST rule fixtures intentionally contain vulnerable or non-conformant
 * code.
 *
 * @return list<string>
 */
function harness_arch_exclude_dirs(): array
{
    return [
        DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'node_modules' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'aurora' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'cdn' . DIRECTORY_SEPARATOR . 'css' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'cdn' . DIRECTORY_SEPARATOR . 'javascript' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'tests' . DIRECTORY_SEPARATOR . 'Semgrep' . DIRECTORY_SEPARATOR,
    ];
}

/**
 * Discovers all PHP source files in the repository.
 *
 * Walks the repository root with RecursiveDirectoryIterator, skipping
 * directories listed in harness_arch_exclude_dirs(). Returns absolute
 * paths to all .php files found.
 *
 * @return list<string> Absolute file paths.
 */
function harness_arch_discover_php_files(): array
{
    $repoRoot = dirname(__DIR__, 3);
    $exclude = harness_arch_exclude_dirs();
    $files = [];

    $dirIter = new RecursiveDirectoryIterator($repoRoot, RecursiveDirectoryIterator::SKIP_DOTS);
    $iter = new RecursiveIteratorIterator($dirIter);

    foreach ($iter as $file) {
        $path = $file->getPathname();

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

        $files[] = $path;
    }

    return $files;
}

/**
 * Discovers all agent markdown files in .opencode/agents/.
 *
 * Returns absolute paths to all .md files found under .opencode/agents/.
 *
 * @return list<string> Absolute file paths.
 */
function harness_arch_discover_agent_files(): array
{
    $repoRoot = dirname(__DIR__, 3);
    $agentsDir = $repoRoot . DIRECTORY_SEPARATOR . '.opencode' . DIRECTORY_SEPARATOR . 'agents';

    if (!is_dir($agentsDir)) {
        return [];
    }

    $files = [];

    $dirIter = new RecursiveDirectoryIterator(
        $agentsDir,
        RecursiveDirectoryIterator::SKIP_DOTS,
    );
    $iter = new RecursiveIteratorIterator($dirIter);

    foreach ($iter as $file) {
        if (strtolower($file->getExtension()) === 'md') {
            $files[] = $file->getPathname();
        }
    }

    return $files;
}

test('arch scan universe is non-empty', function (): void {
    $files = harness_arch_discover_php_files();

    expect($files)->not->toBeEmpty(
        'Arch scan universe is empty — no PHP files found. '
        . 'Check exclude paths in harness_arch_exclude_dirs().'
    );
});

test('agent files do not use command-only template features', function (): void {
    $files = harness_arch_discover_agent_files();
    $repoRoot = dirname(__DIR__, 3);
    $failures = [];

    foreach ($files as $path) {
        $relative = substr($path, strlen($repoRoot) + 1);
        $content = file_get_contents($path);

        if ($content === false) {
            continue;
        }

        // $ARGUMENTS is a command-only feature — renders as literal text in agents.
        if (preg_match('/\$ARGUMENTS/', $content)) {
            $failures[] = sprintf('  %s: uses $ARGUMENTS (command-only)', $relative);
        }

        // !`command` shell injection is a command-only feature.
        if (preg_match('/!`[^`]+`/', $content)) {
            $failures[] = sprintf('  %s: uses !`command` shell injection (command-only)', $relative);
        }
    }

    if ($failures !== []) {
        $message = sprintf(
            "Found %d agent file(s) using command-only template features:\n\n%s\n\n"
            . '$ARGUMENTS and !`command` are processed only in command templates '
            . "(SessionPrompt.command()). Agent system prompts are assembled "
            . 'statically. Agents receive their task as a separate invocation '
            . 'message at runtime.',
            count($failures),
            implode("\n", $failures),
        );
        expect($failures)->toBeEmpty($message);
    } else {
        expect($failures)->toBeEmpty();
    }
});

test('no debug functions in source code', function (): void {
    $files = harness_arch_discover_php_files();
    $repoRoot = dirname(__DIR__, 3);
    $debugFunctions = ['var_dump', 'print_r', 'dd', 'dump'];
    $failures = [];

    foreach ($files as $path) {
        $relative = substr($path, strlen($repoRoot) + 1);
        $content = file_get_contents($path);

        if ($content === false) {
            continue;
        }

        foreach ($debugFunctions as $func) {
            if (preg_match('/\b' . preg_quote($func, '/') . '\s*\(/', $content)) {
                $failures[] = sprintf('  %s: uses %s()', $relative, $func);
            }
        }
    }

    if ($failures !== []) {
        $message = sprintf(
            "Found %d file(s) with debug functions:\n\n%s\n\n"
            . "Remove dd, dump, var_dump, and print_r calls from source code.",
            count($failures),
            implode("\n", $failures),
        );
        expect($failures)->toBeEmpty($message);
    } else {
        expect($failures)->toBeEmpty();
    }
});

test('PHP source files declare strict types', function (): void {
    $files = harness_arch_discover_php_files();
    $repoRoot = dirname(__DIR__, 3);
    $failures = [];

    foreach ($files as $path) {
        $relative = substr($path, strlen($repoRoot) + 1);

        $handle = fopen($path, 'r');
        if ($handle === false) {
            continue;
        }

        $found = false;
        for ($i = 0; $i < 10; $i++) {
            $line = fgets($handle);
            if ($line === false) {
                break;
            }
            if (str_contains($line, 'declare(strict_types=1)')) {
                $found = true;
                break;
            }
        }
        fclose($handle);

        if (!$found) {
            $failures[] = sprintf('  %s: missing declare(strict_types=1)', $relative);
        }
    }

    if ($failures !== []) {
        $message = sprintf(
            "Found %d file(s) without declare(strict_types=1):\n\n%s\n\n"
            . "Add declare(strict_types=1) after <?php in each file.",
            count($failures),
            implode("\n", $failures),
        );
        expect($failures)->toBeEmpty($message);
    } else {
        expect($failures)->toBeEmpty();
    }
});

test('test files referencing aurora submodule guard with markTestSkipped', function (): void {
    $files = harness_arch_discover_php_files();
    $repoRoot = dirname(__DIR__, 3);
    $failures = [];

    foreach ($files as $path) {
        $relative = substr($path, strlen($repoRoot) + 1);
        $content = file_get_contents($path);

        if ($content === false) {
            continue;
        }

        // Only inspect test files that reference the aurora entry point.
        if (!str_contains($relative, 'tests' . DIRECTORY_SEPARATOR)) {
            continue;
        }

        if (!str_contains($content, 'aurora.inc.php')) {
            continue;
        }

        $hasGuard = str_contains($content, 'is_file(') || str_contains($content, 'file_exists(');
        $hasSkip = str_contains($content, 'markTestSkipped(');

        if (!$hasGuard || !$hasSkip) {
            $missing = [];
            if (!$hasGuard) {
                $missing[] = 'is_file()/file_exists() guard';
            }
            if (!$hasSkip) {
                $missing[] = 'markTestSkipped() call';
            }
            $failures[] = sprintf(
                '  %s: missing %s',
                $relative,
                implode(' and ', $missing),
            );
        }
    }

    if ($failures !== []) {
        $message = sprintf(
            "Found %d file(s) referencing aurora.inc.php without a skip guard:\n\n%s\n\n"
            . "Guard aurora.inc.php references with is_file()/file_exists() + markTestSkipped() "
            . "so a missing submodule skips tests instead of fatalling the suite. "
            . "Fix: git submodule update --init",
            count($failures),
            implode("\n", $failures),
        );
        expect($failures)->toBeEmpty($message);
    } else {
        expect($failures)->toBeEmpty();
    }
});


// vim: ft=php sts=4 sw=4 ts=4 et :
