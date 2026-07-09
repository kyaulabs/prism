<?php

declare(strict_types=1);

# $KYAULabs: run-suite.php kyau@nova 2026/07/05 -0700 Exp $

/**
 * run-suite.php — Batch eval suite runner.
 *
 * Usage: php run-suite.php <directory> [--tag <tag>] [--timeout <seconds>] [--dry-run] [--fail-on-skip]
 *
 * Discovers all .json eval case files in the given directory, optionally
 * filtered by --tag. Runs each through run-eval.php, aggregates results,
 * prints a markdown summary table to stdout, and writes a detailed JSON
 * results file.
 *
 * Exit codes:
 *   0 — all cases PASS (mixed PASS+SKIP with no failures is 0)
 *   1 — any FAIL, TIMEOUT, or INVALID case (or any SKIP with --fail-on-skip)
 *   2 — every case SKIPPED (silent-suite guard)
 */

$repoRoot = realpath(dirname(__DIR__, 3));
$runEvalScript = __DIR__ . '/run-eval.php';

require_once __DIR__ . '/includes/EvalRunner.php';

use KYAULabs\Eval\Runner;

// ── Parse arguments ──────────────────────────────────────────────────────
$directory = '';
$tag = null;
$timeout = 120;
$dryRun = false;
$failOnSkip = false;

for ($i = 1; $i < count($argv); $i++) {
    if ($argv[$i] === '--tag' && isset($argv[$i + 1])) {
        $tag = $argv[++$i];
    } elseif ($argv[$i] === '--timeout' && isset($argv[$i + 1])) {
        $timeout = (int) $argv[++$i];
    } elseif ($argv[$i] === '--dry-run') {
        $dryRun = true;
    } elseif ($argv[$i] === '--fail-on-skip') {
        $failOnSkip = true;
    } elseif (!str_starts_with($argv[$i], '--')) {
        $directory = $argv[$i];
    }
}

if ($directory === '' || !is_dir($directory)) {
    fwrite(STDERR, "Error: directory not found: {$directory}\n");
    fwrite(STDERR, "Usage: php run-suite.php <directory> [--tag <tag>] [--timeout <seconds>] [--dry-run] [--fail-on-skip]\n");
    exit(1);
}

// ── Discover case files ──────────────────────────────────────────────────
$files = glob($directory . '/*.json');
$cases = [];

foreach ($files as $file) {
    $contents = file_get_contents($file);
    if ($contents === false) {
        continue;
    }

    $data = json_decode($contents, true);
    if (!is_array($data)) {
        continue;
    }

    if ($tag !== null && !in_array($tag, $data['tags'] ?? [], true)) {
        continue;
    }

    $cases[] = ['file' => $file, 'name' => $data['name'] ?? basename($file)];
}

if (empty($cases)) {
    echo "No eval cases found in {$directory}" .
        ($tag !== null ? " with tag '{$tag}'" : '') . ".\n";
    exit(0);
}

// ── Run each case ─────────────────────────────────────────────────────────
$results = [];
$dryFlag = $dryRun ? ' --dry-run' : '';

foreach ($cases as $i => $caseInfo) {
    $num = $i + 1;
    $total = count($cases);
    echo "Running [{$num}/{$total}] {$caseInfo['name']}...\n";

    $cmd = "php {$runEvalScript} " . escapeshellarg($caseInfo['file']) .
        " --timeout {$timeout}{$dryFlag} 2>&1";
    $output = [];
    $exitCode = 0;
    exec($cmd, $output, $exitCode);

    $joined = implode("\n", $output);
    $decoded = json_decode($joined, true);

    if (is_array($decoded)) {
        $results[] = $decoded;
    } else {
        $results[] = [
            'name' => $caseInfo['name'],
            'verdict' => 'INVALID',
            'error' => 'Failed to parse run-eval output',
        ];
    }
}

// ── Markdown summary ─────────────────────────────────────────────────────
echo "\n";
echo str_repeat('-', 60) . "\n";
echo "\n| # | Eval Case | Verdict | Behaviors | Duration | Judge |\n";
echo "|---|---|---|---|---|---|\n";

$passCount = 0;
$failCount = 0;
$skipCount = 0;
$timeoutCount = 0;
$invalidCount = 0;

foreach ($results as $i => $r) {
    $num = $i + 1;
    $name = $r['name'] ?? 'unknown';
    $verdict = $r['verdict'] ?? 'UNKNOWN';
    $behaviors = count($r['behaviors'] ?? []);
    $yesBehaviors = count(array_filter($r['behaviors'] ?? [], fn ($b) => ($b['verdict'] ?? '') === 'YES'));
    $duration = isset($r['duration_ms']) ? sprintf('%.1fs', $r['duration_ms'] / 1000) : '-';
    $judge = ($r['judge_used'] ?? false) ? 'yes' : 'no';

    echo "| {$num} | {$name} | {$verdict} | {$yesBehaviors}/{$behaviors} | {$duration} | {$judge} |\n";

    match ($verdict) {
        'PASS' => $passCount++,
        'FAIL' => $failCount++,
        'TIMEOUT' => $timeoutCount++,
        'SKIPPED' => $skipCount++,
        default => $invalidCount++,
    };
}

$total = count($results);
echo "\n**Suite: {$passCount}/{$total} passed ({$failCount} failed, {$timeoutCount} timeout, {$skipCount} skipped, {$invalidCount} invalid)**\n";
echo "\n" . str_repeat('-', 60) . "\n";

// ── Write JSON results ───────────────────────────────────────────────────
$resultsDir = dirname(__DIR__) . '/results';
if (!is_dir($resultsDir)) {
    mkdir($resultsDir, 0755, true);
}

$timestamp = date('Y-m-d\THis');
$resultsFile = $resultsDir . "/{$timestamp}.json";
file_put_contents(
    $resultsFile,
    json_encode(['timestamp' => $timestamp, 'results' => $results], JSON_PRETTY_PRINT),
);

echo "\nDetailed results: {$resultsFile}\n";

$exitCode = Runner::computeSuiteExitCode(
    $passCount,
    $failCount,
    $timeoutCount,
    $skipCount,
    $invalidCount,
    $failOnSkip,
);

if ($skipCount > 0 && $passCount === 0 && $failCount === 0
    && $timeoutCount === 0 && $invalidCount === 0 && $skipCount === $total
) {
    fwrite(STDERR, "WARNING: every eval case was SKIPPED — the suite did nothing. "
        . "Verify opencode is installed and that cases are not filtered out.\n");
}

exit($exitCode);

// vim: ft=php sts=4 sw=4 ts=4 et :
