<?php

declare(strict_types=1);

# $KYAULabs: coverage-gate.php kyau@aura.kyaulabs 2026/08/16 -0700 Exp $





































/**
 * Mechanized changed-file coverage gate.
 *
 * Parses a PHPUnit/Pest Clover XML coverage report, intersects it with a
 * list of changed PHP file paths (read from stdin), and enforces a minimum
 * line coverage percentage on each changed file that appears in the
 * coverage source set.
 *
 * Usage:
 *   git diff --name-only origin/main...HEAD -- '*.php' \
 *     | php .github/scripts/coverage-gate.php <clover.xml> [--min=80] [--root=DIR]
 *
 * Exit codes:
 *   0  All changed files meet the threshold (or none are in the source set).
 *   1  One or more changed files are below the threshold.
 *   2  Usage error, unreadable clover file, or empty/degenerate clover (no instrumented files).
 *
 * @param int    $argc
 * @param array<int,string> $argv
 * @return int
 */

if (defined('COVERAGE_GATE_AS_LIBRARY')) {
    return;
}

exit(main($argc, $argv));

/**
 * Convert an absolute filesystem path to one relative to the project root.
 *
 * Normalizes backslashes to forward slashes before comparison so that
 * Windows paths from realpath() (C:\...) match Clover XML paths and the
 * forward-slash rootPrefix. Falls back to realpath() for symlink-resolution
 * mismatches (e.g. macOS /tmp -> /private/tmp).
 *
 * @param string $absPath
 * @param string $rootPrefix
 * @return string
 */
function relativize_path(string $absPath, string $rootPrefix): string
{
    $normalized = str_replace('\\', '/', $absPath);
    if (str_starts_with($normalized, $rootPrefix)) {
        return substr($normalized, strlen($rootPrefix));
    }
    // Handle symlink-resolution mismatch (e.g. macOS /tmp -> /private/tmp):
    // the Clover XML may carry the unresolved form while --root is realpath'd,
    // or vice-versa. Clover paths always reference executed (existing) files,
    // so realpath() is safe here.
    $resolved = realpath($absPath);
    if ($resolved !== false) {
        $resolved = str_replace('\\', '/', $resolved);
        if (str_starts_with($resolved, $rootPrefix)) {
            return substr($resolved, strlen($rootPrefix));
        }
    }
    return $normalized;
}

/**
 * Heuristic: does a PHP source string contain executable code?
 *
 * Tokenizes $source and returns true if any token is an unambiguous
 * executable-statement indicator (control structures, echo/print, return,
 * throw, yield, inline HTML, etc.). These tokens never appear inside a
 * declaration header, so no brace-depth tracking is required.
 *
 * Used by classify_changed_files() to decide whether an out-of-<source>
 * changed file should WARN (has code) or SKIP (pure declarations/config).
 *
 * Known limitation: assignment-only bodies without a control structure are
 * not detected. The WARN is a nudge, not a measurement — the Clover XML is
 * authoritative for in-source files.
 *
 * @param string $source
 * @return bool
 */
function has_executable_code(string $source): bool
{
    $executable = [
        T_IF, T_ELSEIF, T_ELSE, T_WHILE, T_DO, T_FOR, T_FOREACH, T_SWITCH,
        T_MATCH, T_RETURN, T_THROW, T_YIELD, T_YIELD_FROM, T_TRY, T_CATCH,
        T_FINALLY, T_BREAK, T_CONTINUE, T_GOTO, T_ECHO, T_PRINT, T_INLINE_HTML,
    ];
    foreach (PhpToken::tokenize($source) as $token) {
        if (in_array($token->id, $executable, true)) {
            return true;
        }
    }
    return false;
}

/**
 * Parse CLI arguments.
 *
 * @param array<int,string> $argv
 * @return array{clover:?string, min:?int, root:string, strict:bool}
 */
function parse_args(array $argv): array
{
    $cfg = ['clover' => null, 'min' => 80, 'root' => getcwd(), 'strict' => false];
    $n = count($argv);
    for ($i = 1; $i < $n; $i++) {
        $arg = $argv[$i];
        if ($arg === '--min' && $i + 1 < $n) {
            $cfg['min'] = parse_min_value($argv[++$i]);
        } elseif (str_starts_with($arg, '--min=')) {
            $cfg['min'] = parse_min_value(substr($arg, 6));
        } elseif ($arg === '--root' && $i + 1 < $n) {
            $cfg['root'] = $argv[++$i];
        } elseif (str_starts_with($arg, '--root=')) {
            $cfg['root'] = substr($arg, 7);
        } elseif ($arg === '--strict') {
            $cfg['strict'] = true;
        } elseif (!str_starts_with($arg, '--') && $cfg['clover'] === null) {
            $cfg['clover'] = $arg;
        }
    }
    return $cfg;
}

/**
 * Parse and validate the --min threshold. Returns null for anything that
 * is not an integer 1..100 so main() can report a usage error (exit 2)
 * instead of silently gating at a degenerate threshold (F-3).
 *
 * @param string $raw raw --min value from argv
 * @return ?int valid threshold, or null when invalid
 */
function parse_min_value(string $raw): ?int
{
    $v = filter_var($raw, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 100]]);

    return $v === false ? null : $v;
}

/**
 * Build the relPath => [covered,total] map from a parsed Clover document.
 *
 * @param SimpleXMLElement $xml
 * @param string $rootPrefix
 * @return array<string,array{0:int,1:int}>
 */
function build_coverage_map(SimpleXMLElement $xml, string $rootPrefix): array
{
    $coverage = [];
    $files = $xml->xpath('//file');
    if ($files === false) {
        $files = [];
    }
    foreach ($files as $file) {
        $absPath = (string) $file['name'];
        $relPath = relativize_path($absPath, $rootPrefix);
        $covered = 0;
        $total = 0;
        foreach ($file->line as $line) {
            if ((string) $line['type'] !== 'stmt') {
                continue;
            }
            $total++;
            if ((int) $line['count'] > 0) {
                $covered++;
            }
        }
        $coverage[$relPath] = [$covered, $total];
    }
    return $coverage;
}

/**
 * Classify each changed file into passed/failed/warned/skipped buckets.
 *
 * @param list<string>                     $changedFiles
 * @param array<string,array{0:int,1:int}> $coverage
 * @param string                           $rootPrefix
 * @param int                              $min
 * @return array{passed:list<mixed>,failed:list<mixed>,warned:list<mixed>,skipped:list<mixed>}
 */
function classify_changed_files(array $changedFiles, array $coverage, string $rootPrefix, int $min): array
{
    $passed = $failed = $warned = $skipped = [];
    foreach ($changedFiles as $changed) {
        if ($changed === '') {
            continue;
        }
        $fullChanged = $rootPrefix . $changed;
        if (!is_file($fullChanged) && !is_file($changed)) {
            $skipped[] = [$changed, 'deleted/not found'];
            continue;
        }
        if (isset($coverage[$changed])) {
            [$covered, $total] = $coverage[$changed];
            if ($total === 0) {
                $skipped[] = [$changed, 'no executable lines'];
                continue;
            }
            $pct = ($covered / $total) * 100;
            if ($pct >= $min) {
                $passed[] = [$changed, $pct, $covered, $total];
            } else {
                $failed[] = [$changed, $pct, $covered, $total];
            }
            continue;
        }
        // Exists but absent from Clover → outside <source>.
        $path = is_file($fullChanged) ? $fullChanged : $changed;
        $source = (string) @file_get_contents($path);
        if ($source !== '' && has_executable_code($source)) {
            $warned[] = [$changed, 'outside <source>, has executable code — register in phpunit.xml <source>'];
        } else {
            $skipped[] = [$changed, 'outside <source>, no executable code'];
        }
    }
    return ['passed' => $passed, 'failed' => $failed, 'warned' => $warned, 'skipped' => $skipped];
}

/**
 * Decide the process exit code from the classification result.
 *
 * @param array{passed:list,failed:list,warned:list,skipped:list} $result
 * @param bool $strict
 * @return int
 */
function exit_code_for(array $result, bool $strict): int
{
    if ($result['failed'] !== []) {
        return 1;
    }
    if ($strict && $result['warned'] !== []) {
        return 1;
    }
    return 0;
}

/**
 * Print the per-file coverage gate report.
 *
 * Output format is part of the CLI contract (asserted by
 * tests/Shell/coverage_gate_test.sh) and must stay byte-identical.
 *
 * @param array{passed:list, failed:list, warned:list, skipped:list} $result
 * @param int $min
 * @return void
 */
function print_report(array $result, int $min): void
{
    echo "Changed-file coverage gate (min {$min}%):\n\n";
    printf("  %-55s %8s   %s\n", 'File', 'Coverage', 'Gate');
    foreach ($result['passed'] as [$f, $pct, $c, $t]) {
        printf("  %-55s %7.1f%%   %s  (%d/%d)\n", $f, $pct, 'PASS', $c, $t);
    }
    foreach ($result['failed'] as [$f, $pct, $c, $t]) {
        printf("  %-55s %7.1f%%   %s  (%d/%d)\n", $f, $pct, 'FAIL', $c, $t);
    }
    foreach ($result['warned'] as [$f, $reason]) {
        fwrite(STDERR, sprintf("  %-55s %8s   %s  (%s)\n", $f, '-', 'WARN', $reason));
    }
    foreach ($result['skipped'] as [$f, $reason]) {
        printf("  %-55s %8s   %s  (%s)\n", $f, '-', 'SKIP', $reason);
    }
    echo "\n";
}

/**
 * Thin CLI entry — parses args, reads stdin, loads Clover, classifies, prints, exits.
 *
 * @param int               $argc
 * @param array<int,string> $argv
 * @param string            $stdin  Stream/path to read changed-file list from
 *                                  (default 'php://stdin'); overridable by tests.
 * @return int
 */
function main(int $argc, array $argv, string $stdin = 'php://stdin'): int
{
    $args = parse_args($argv);

    if ($args['min'] === null) {
        fwrite(STDERR, "ERROR: --min must be an integer 1..100\n");

        return 2;
    }

    $cloverPath = $args['clover'];
    $min = $args['min'];
    $root = $args['root'];
    $strict = $args['strict'];

    if ($cloverPath === null || !is_file($cloverPath)) {
        fwrite(STDERR, "Usage: coverage-gate.php <clover.xml> [--min=N] [--root=DIR] [--strict]\n");
        fwrite(STDERR, "       Pipe changed file paths (one per line) via stdin.\n");
        return 2;
    }

    $changedRaw = (string) file_get_contents($stdin);
    $changedFiles = array_values(array_unique(array_filter(array_map('trim', explode("\n", $changedRaw)))));

    $xml = @simplexml_load_file($cloverPath);
    if ($xml === false) {
        fwrite(STDERR, "ERROR: could not parse clover XML at {$cloverPath}\n");
        return 2;
    }

    $rootReal = realpath($root);
    $rootPrefix = rtrim(str_replace('\\', '/', $rootReal !== false ? $rootReal : $root), '/') . '/';
    $coverage = build_coverage_map($xml, $rootPrefix);

    if ($coverage === []) {
        fwrite(STDERR, "ERROR: Clover report '{$cloverPath}' contains no <file> entries.\n");
        fwrite(STDERR, "       No source files are instrumented. Register instrumented\n");
        fwrite(STDERR, "       directories in phpunit.xml <source><include>, then re-run\n");
        fwrite(STDERR, "       `pest --coverage` to regenerate tests/coverage.xml.\n");
        return 2;
    }

    $result = classify_changed_files($changedFiles, $coverage, $rootPrefix, $min);

    print_report($result, $min);

    $code = exit_code_for($result, $strict);
    if ($result['failed'] !== []) {
        fwrite(STDERR, sprintf("FAIL — %d file(s) below %d%% coverage\n", count($result['failed']), $min));
    } else {
        echo sprintf(
            "PASS — %d file(s) checked, %d warned, %d skipped, 0 failures\n",
            count($result['passed']),
            count($result['warned']),
            count($result['skipped']),
        );
    }
    return $code;
}









// vim: ft=php sts=4 sw=4 ts=4 et :
