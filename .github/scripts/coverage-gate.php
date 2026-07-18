<?php

declare(strict_types=1);

# $KYAULabs: coverage-gate.php kyau@nova 2026/07/17 -0700 Exp $










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
 *   2  Usage error or unreadable clover file.
 *
 * @param int    $argc
 * @param array<int,string> $argv
 * @return int
 */

$min = 80;
$root = getcwd();
$cloverPath = null;

for ($i = 1; $i < $argc; $i++) {
    $arg = $argv[$i];
    if ($arg === '--min' && $i + 1 < $argc) {
        $min = (int) $argv[++$i];
    } elseif (str_starts_with($arg, '--min=')) {
        $min = (int) substr($arg, 6);
    } elseif ($arg === '--root' && $i + 1 < $argc) {
        $root = $argv[++$i];
    } elseif (str_starts_with($arg, '--root=')) {
        $root = substr($arg, 7);
    } elseif (!str_starts_with($arg, '--') && $cloverPath === null) {
        $cloverPath = $arg;
    }
}

if ($cloverPath === null || !is_file($cloverPath)) {
    fwrite(STDERR, "Usage: coverage-gate.php <clover.xml> [--min=N] [--root=DIR]\n");
    fwrite(STDERR, "       Pipe changed file paths (one per line) via stdin.\n");
    exit(2);
}

$changedRaw = file_get_contents('php://stdin');
if ($changedRaw === false) {
    $changedRaw = '';
}
$changedFiles = array_filter(array_map('trim', explode("\n", $changedRaw)));
$changedFiles = array_values(array_unique($changedFiles));

$xml = @simplexml_load_file($cloverPath);
if ($xml === false) {
    fwrite(STDERR, "ERROR: could not parse clover XML at {$cloverPath}\n");
    exit(2);
}

$rootReal = realpath($root);
if ($rootReal === false) {
    $rootReal = $root;
}
// Normalize to forward slashes for cross-platform path comparison.
// On Windows, realpath() returns backslash paths (C:\...) which would
// never str_starts_with-match Clover paths that use forward slashes.
$rootPrefix = rtrim(str_replace('\\', '/', $rootReal), '/') . '/';

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

$failures = [];
$skipped = [];
$passed = [];

foreach ($changedFiles as $changed) {
    if ($changed === '') {
        continue;
    }
    $fullChanged = $rootPrefix . $changed;
    if (!is_file($fullChanged) && !is_file($changed)) {
        $skipped[] = [$changed, 'deleted/not found'];
        continue;
    }
    if (!isset($coverage[$changed])) {
        $skipped[] = [$changed, 'not in coverage source'];
        continue;
    }
    [$covered, $total] = $coverage[$changed];
    if ($total === 0) {
        $skipped[] = [$changed, 'no executable lines'];
        continue;
    }
    $pct = ($covered / $total) * 100;
    if ($pct >= $min) {
        $passed[] = [$changed, $pct, $covered, $total];
    } else {
        $failures[] = [$changed, $pct, $covered, $total];
    }
}

echo "Changed-file coverage gate (min {$min}%):\n\n";
printf("  %-55s %8s   %s\n", 'File', 'Coverage', 'Gate');
foreach ($passed as [$f, $pct, $c, $t]) {
    printf("  %-55s %7.1f%%   %s  (%d/%d)\n", $f, $pct, 'PASS', $c, $t);
}
foreach ($failures as [$f, $pct, $c, $t]) {
    printf("  %-55s %7.1f%%   %s  (%d/%d)\n", $f, $pct, 'FAIL', $c, $t);
}
foreach ($skipped as [$f, $reason]) {
    printf("  %-55s %8s   %s  (%s)\n", $f, '-', 'SKIP', $reason);
}

echo "\n";
if (count($failures) > 0) {
    fwrite(STDERR, sprintf(
        "FAIL — %d file(s) below %d%% coverage\n",
        count($failures),
        $min
    ));
    exit(1);
}
echo sprintf(
    "PASS — %d file(s) checked, %d skipped, 0 failures\n",
    count($passed),
    count($skipped)
);
exit(0);

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




// vim: ft=php sts=4 sw=4 ts=4 et :
