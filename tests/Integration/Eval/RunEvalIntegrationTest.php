<?php

# $KYAULabs: RunEvalIntegrationTest.php creator@host YYYY/MM/DD ±TZ Exp $

declare(strict_types=1);

/**
 * @group slow
 *
 * Requires opencode in PATH and a configured LLM provider.
 * Skip in default test runs; run manually or in pre-commit/pre-push hook.
 */
it('runs tdd-red-green smoke case through full pipeline', function () {
    $repoRoot = dirname(__DIR__, 3);
    $caseFile = $repoRoot . '/.opencode/evals/smoke/tdd-red-green.json';
    $script = $repoRoot . '/.opencode/evals/bin/run-eval.php';

    if (!file_exists($caseFile)) {
        $this->markTestSkipped('tdd-red-green.json not found — eval case missing.');
    }

    if (!file_exists($script)) {
        $this->markTestSkipped('run-eval.php not found — runner not built.');
    }

    // Skip if opencode is not available
    $check = [];
    exec('command -v opencode 2>&1', $check, $checkExit);
    if ($checkExit !== 0) {
        $this->markTestSkipped('opencode not available in PATH — integration test skipped.');
    }

    $output = [];
    $exitCode = 0;
    exec("php {$script} " . escapeshellarg($caseFile) . " --timeout 180 2>&1", $output, $exitCode);

    $joined = implode("\n", $output);
    $result = json_decode($joined, true);

    expect($result)->toBeArray();
    expect($result['name'] ?? '')->toBe('tdd-red-green');

    // The test may pass or fail — the integration test verifies the runner
    // produces valid JSON with expected fields, not that the agent behaves
    // perfectly (that's what the LLM judge does).
    expect($result)->toHaveKey('verdict');
    expect($result)->toHaveKey('behaviors');
    expect($result)->toHaveKey('duration_ms');
    expect(in_array($result['verdict'], ['PASS', 'FAIL', 'SKIPPED', 'TIMEOUT']))->toBeTrue();
})->group('slow');

// vim: ft=php sts=4 sw=4 ts=4 et :
