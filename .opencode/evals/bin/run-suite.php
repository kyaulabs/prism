<?php

declare(strict_types=1);

# $KYAULabs: run-suite.php kyau@cosmos.kyaulabs 2026/07/23 -0700 Exp $






















/**
 * run-suite.php — Batch eval suite runner.
 *
 * Usage: php run-suite.php <directory> [--tag <tag>] [--timeout <seconds>] [--dry-run] [--fail-on-skip] [--fail-on-undetermined]
 *
 * Discovers all .json eval case files in the given directory, optionally
 * filtered by --tag. Runs each through run-eval.php, aggregates results,
 * prints a markdown summary table to stdout, and writes a detailed JSON
 * results file.
 *
 * Exit codes:
 *   0 — all cases PASS (mixed PASS+SKIP+UNDETERMINED with no failures is 0)
 *   1 — any FAIL, TIMEOUT, or INVALID case (or any SKIP with --fail-on-skip,
 *       or any UNDETERMINED with --fail-on-undetermined)
 *   2 — every case SKIPPED (silent-suite guard)
 */

$repoRoot = realpath(dirname(__DIR__, 3));
$runEvalScript = __DIR__ . '/run-eval.php';

require_once __DIR__ . '/includes/EvalRunner.php';

use KYAULabs\Eval\EvalCase;
use KYAULabs\Eval\Runner;

// ── Parse arguments ──────────────────────────────────────────────────────
$directory = '';
$tag = null;
$timeout = 120;
$dryRun = false;
$failOnSkip = false;
$failOnUndetermined = false;

for ($i = 1; $i < count($argv); $i++) {
    if ($argv[$i] === '--tag' && isset($argv[$i + 1])) {
        $tag = $argv[++$i];
    } elseif ($argv[$i] === '--timeout' && isset($argv[$i + 1])) {
        $timeout = (int) $argv[++$i];
    } elseif ($argv[$i] === '--dry-run') {
        $dryRun = true;
    } elseif ($argv[$i] === '--fail-on-skip') {
        $failOnSkip = true;
    } elseif ($argv[$i] === '--fail-on-undetermined') {
        $failOnUndetermined = true;
    } elseif (!str_starts_with($argv[$i], '--')) {
        $directory = $argv[$i];
    }
}

if ($directory === '' || !is_dir($directory)) {
    fwrite(STDERR, "Error: directory not found: {$directory}\n");
    fwrite(STDERR, "Usage: php run-suite.php <directory> [--tag <tag>] [--timeout <seconds>] [--dry-run] [--fail-on-skip] [--fail-on-undetermined]\n");
    exit(1);
}

// ── Discover case files ──────────────────────────────────────────────────
$files = glob($directory . '/*.json');
$cases = [];
$invalidResults = [];

foreach ($files as $file) {
    try {
        $case = EvalCase::fromFile($file);
    } catch (\RuntimeException $e) {
        // Unreadable file or invalid JSON. Report only in unfiltered runs;
        // a --tag filter narrows scope and an invalid file cannot claim
        // membership in any tag, so it is excluded from filtered runs.
        if ($tag === null) {
            $invalidResults[] = [
                'name' => basename($file),
                'agent' => 'unknown',
                'pass_criteria' => '',
                'verdict' => 'INVALID',
                'behaviors' => [],
                'deterministic_checks' => [],
                'duration_ms' => 0,
                'judge_used' => false,
                'error' => $e->getMessage(),
                'degraded_kill' => false,
            ];
        }
        continue;
    }

    $errors = $case->validate();
    if (!empty($errors)) {
        // Structurally parseable but schema-invalid. Same tag-scope rule.
        if ($tag === null) {
            $invalidResults[] = [
                'name' => $case->name !== '' ? $case->name : basename($file),
                'agent' => $case->agent,
                'pass_criteria' => $case->passCriteria,
                'verdict' => 'INVALID',
                'behaviors' => [],
                'deterministic_checks' => [],
                'duration_ms' => 0,
                'judge_used' => false,
                'error' => implode('; ', $errors),
                'degraded_kill' => false,
            ];
        }
        continue;
    }

    if ($tag !== null && !in_array($tag, $case->tags, true)) {
        continue;
    }

    $cases[] = ['file' => $file, 'name' => $case->name];
}

if (empty($cases) && empty($invalidResults)) {
    echo "No eval cases found in {$directory}" .
        ($tag !== null ? " with tag '{$tag}'" : '') . ".\n";
    exit(0);
}

// ── Dry-run mode: stream verbatim, skip aggregation ───────────────────
if ($dryRun) {
    foreach ($cases as $i => $caseInfo) {
        $num = $i + 1;
        $total = count($cases);
        echo "Running [{$num}/{$total}] {$caseInfo['name']}...\n";

        $cmd = "php " . escapeshellarg($runEvalScript) . " " . escapeshellarg($caseInfo['file']) .
            " --timeout {$timeout} --dry-run";
        $proc = Runner::captureOutput($cmd);

        echo $proc['stdout'];
        if ($proc['stdout'] !== '' && !str_ends_with($proc['stdout'], "\n")) {
            echo "\n";
        }
        // Route diagnostics to stderr so they never mingle with dry-run output.
        if (trim($proc['stderr']) !== '') {
            fwrite(STDERR, $proc['stderr']);
        }
    }
    exit(0);
}

// ── Run each case ─────────────────────────────────────────────────────────
$results = [];

foreach ($cases as $i => $caseInfo) {
    $num = $i + 1;
    $total = count($cases);
    echo "Running [{$num}/{$total}] {$caseInfo['name']}...\n";

    // Invoke run-eval with stdout (JSON) and stderr (diagnostics) captured
    // SEPARATELY. Merging them via 2>&1 corrupted the JSON stream whenever
    // run-eval wrote a NOTICE/WARNING to stderr (eg. a dirty working tree),
    // turning every case into a false INVALID. See #188.
    $cmd = "php " . escapeshellarg($runEvalScript) . " " . escapeshellarg($caseInfo['file']) .
        " --timeout {$timeout}";
    $proc = Runner::captureOutput($cmd);
    $decoded = json_decode($proc['stdout'], true);

    if (is_array($decoded)) {
        $results[] = $decoded;
    } else {
        // Surface captured stderr so a parse failure is diagnosable, not silent.
        $hint = trim($proc['stderr']);
        $results[] = [
            'name' => $caseInfo['name'],
            'verdict' => 'INVALID',
            'error' => 'Failed to parse run-eval output' . ($hint !== '' ? ' — ' . $hint : ''),
        ];
    }
}

// Merge discovery-time INVALID cases into results so they appear in the
// summary table and the JSON results file (unfiltered runs only — filtered
// runs exclude invalid cases per the tag-scope rule).
$results = array_merge($results, $invalidResults);

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
$undeterminedCount = 0;

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
        'UNDETERMINED' => $undeterminedCount++,
        default => $invalidCount++,
    };
}

$total = count($results);
echo "\n**Suite: {$passCount}/{$total} passed ({$failCount} failed, {$timeoutCount} timeout, {$skipCount} skipped, {$invalidCount} invalid, {$undeterminedCount} undetermined)**\n";
echo "\n" . str_repeat('-', 60) . "\n";

// ── Write JSON results ───────────────────────────────────────────────────
$resultsDir = dirname(__DIR__) . '/results';
if (!is_dir($resultsDir)) {
    mkdir($resultsDir, 0755, true);
}

$timestamp = date('Y-m-d\THis');
$suffix = substr(uniqid('', true), -6);
$resultsFile = $resultsDir . "/{$timestamp}-{$suffix}.json";
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
    $undeterminedCount,
    $failOnUndetermined,
);

if ($total > 0 && $skipCount === $total) {
    fwrite(STDERR, "WARNING: every eval case was SKIPPED — the suite did nothing. "
        . "Verify opencode is installed and that cases are not filtered out.\n");
}

exit($exitCode);








// vim: ft=php sts=4 sw=4 ts=4 et :
