<?php

# $KYAULabs: run-eval.php SEANBR~1@KYAU-DEV 2025/07/05 -0500 Exp $

declare(strict_types=1);

/**
 * run-eval.php — Execute a single eval case against opencode run.
 *
 * Usage: php run-eval.php <case-file> [--timeout <seconds>] [--dry-run]
 *
 * Reads a JSON eval case, invokes opencode run with the case's input prompt,
 * applies deterministic pass criteria checks (exit code, output content, etc.),
 * and optionally invokes an LLM judge for 'all behaviors observed' criteria.
 * Outputs a JSON result object to stdout.
 *
 * Exit codes:
 *   0 — PASS
 *   1 — FAIL, TIMEOUT, or INVALID
 *   2 — SKIPPED (opencode not available)
 */

require_once __DIR__ . '/includes/EvalRunner.php';

use KYAULabs\Eval\Runner;
use KYAULabs\Eval\EvalCase;
use KYAULabs\Eval\EvalResult;

// ── Parse arguments ──────────────────────────────────────────────────────
$args = Runner::parseArgs($argv);

if ($args['caseFile'] === '' || !file_exists($args['caseFile'])) {
    $name = $args['caseFile'] !== '' ? basename($args['caseFile']) : 'unknown';
    $result = new EvalResult(
        name: $name,
        agent: 'unknown',
        passCriteria: '',
        verdict: 'INVALID',
        error: $args['caseFile'] === ''
            ? 'No case file specified.' : "Case file not found: {$args['caseFile']}",
    );
    echo json_encode($result->toArray(), JSON_PRETTY_PRINT) . "\n";
    exit(1);
}

// ── Parse and validate case file ─────────────────────────────────────────
try {
    $case = EvalCase::fromFile($args['caseFile']);
} catch (\RuntimeException $e) {
    $result = new EvalResult(
        name: basename($args['caseFile']),
        agent: 'unknown',
        passCriteria: '',
        verdict: 'INVALID',
        error: $e->getMessage(),
    );
    echo json_encode($result->toArray(), JSON_PRETTY_PRINT) . "\n";
    exit(1);
}

$errors = $case->validate();
if (!empty($errors)) {
    $result = new EvalResult(
        name: $case->name,
        agent: $case->agent,
        passCriteria: $case->passCriteria,
        verdict: 'INVALID',
        error: implode('; ', $errors),
    );
    echo json_encode($result->toArray(), JSON_PRETTY_PRINT) . "\n";
    exit(1);
}

// ── Build runner ─────────────────────────────────────────────────────────
$repoRoot = dirname(__DIR__, 3);
$runner = new Runner($repoRoot, $args['timeout']);

// ── Dry-run mode ─────────────────────────────────────────────────────────
if ($args['dryRun']) {
    $cmd = $runner->buildCommand($case);
    echo "DRY RUN — would execute:\n";
    echo "  {$cmd}\n";
    $judgeCmd = $runner->buildJudgeCommand($case, '<judge prompt omitted>');
    echo "DRY RUN — judge would execute:\n";
    echo "  {$judgeCmd}\n";
    exit(0);
}

// ── Check for opencode ───────────────────────────────────────────────────
if (!$runner->isOpenCodeAvailable()) {
    $result = new EvalResult(
        name: $case->name,
        agent: $case->agent,
        passCriteria: $case->passCriteria,
        verdict: 'SKIPPED',
        error: 'opencode not found in PATH. Install opencode to run evals.',
    );
    echo json_encode($result->toArray(), JSON_PRETTY_PRINT) . "\n";
    exit(2);
}

// ── Run the agent ────────────────────────────────────────────────────────
$start = hrtime(true);
$cmd = $runner->buildCommand($case);
$agentOutput = $runner->executeCommand($cmd, $args['timeout']);
$elapsedMs = (int) ((hrtime(true) - $start) / 1_000_000);

// ── Agent timeout ─────────────────────────────────────────────────────────
if ($agentOutput['timed_out']) {
    $result = new EvalResult(
        name: $case->name,
        agent: $case->agent,
        passCriteria: $case->passCriteria,
        verdict: 'TIMEOUT',
        durationMs: $elapsedMs,
        error: "Agent timed out after {$args['timeout']} seconds",
    );
    echo json_encode($result->toArray(), JSON_PRETTY_PRINT) . "\n";
    exit(1);
}

// ── Deterministic gate ───────────────────────────────────────────────────
$result = $runner->checkDeterministic(
    $case,
    $agentOutput['stdout'],
    $agentOutput['stderr'],
    $agentOutput['exitCode'],
);

// ── LLM judge ────────────────────────────────────────────────────────────
if ($result === null) {
    $combinedOutput = $agentOutput['stdout'];
    if ($agentOutput['stderr'] !== '') {
        $combinedOutput .= "\n\n[stderr]\n" . $agentOutput['stderr'];
    }

    $result = $runner->runJudge($case, $combinedOutput);
    $result->durationMs = $elapsedMs;
} else {
    $result->durationMs = $elapsedMs;
}

// ── Output ───────────────────────────────────────────────────────────────
echo json_encode($result->toArray(), JSON_PRETTY_PRINT) . "\n";

exit($result->isPass() ? 0 : 1);

// vim: ft=php sts=4 sw=4 ts=4 et :
