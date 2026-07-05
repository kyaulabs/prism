<?php

declare(strict_types=1);

# $KYAULabs: RulesPackTest.php kyau@host 2026/07/05 -0700 Exp $

/**
 * Validates every rule in .semgrep/kyaulabs.yml against its positive and
 * negative fixtures in tests/Semgrep/<Dir>/.
 *
 * Skipped when semgrep is not installed — validation runs on the Linux
 * pre-push gate (/check).
 */

function semgrepAvailable(): bool
{
    $output = [];
    $code = 0;
    $home = getenv('USERPROFILE') ?: getenv('HOME');

    if ($home) {
        $bin = $home . DIRECTORY_SEPARATOR . '.local' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'semgrep';
        exec('"' . $bin . '" --version 2>&1', $output, $code);
    }

    if ($code !== 0) {
        exec('semgrep --version 2>&1', $output, $code);
    }

    return $code === 0;
}

function semgrepBin(): string
{
    $home = getenv('USERPROFILE') ?: getenv('HOME');

    if ($home) {
        return '"' . $home . DIRECTORY_SEPARATOR . '.local'
            . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'semgrep' . '"';
    }

    return 'semgrep';
}

function semgrepScanDir(string $dir): array
{
    $projectRoot = realpath(__DIR__ . '/../../..');

    if ($projectRoot === false) {
        throw new \RuntimeException("Project root not resolvable");
    }

    // Scan each fixture file individually to isolate positive/negative
    $positiveFile = 'tests/Semgrep/' . $dir . '/positive.php';
    $negativeFile = 'tests/Semgrep/' . $dir . '/negative.php';
    $configPath = '.semgrep/kyaulabs.yml';

    $null = (PHP_OS_FAMILY === 'Windows') ? 'nul' : '/dev/null';

    // Scan both files and merge results, tagged by source
    $results = [];
    $exitCode = 0;

    foreach ([$positiveFile, $negativeFile] as $fixture) {
        $cmd = 'cd ' . escapeshellarg($projectRoot) . ' && '
            . semgrepBin() . ' scan --config ' . escapeshellarg($configPath)
            . ' --json --metrics off --disable-version-check --x-ignore-semgrepignore-files '
            . escapeshellarg($fixture) . ' 2>' . $null;

        $output = [];
        $code = 0;
        exec($cmd, $output, $code);
        $exitCode = max($exitCode, $code);

        $json = json_decode(implode("\n", $output), true);

        if (is_array($json) && isset($json['results'])) {
            foreach ($json['results'] as $finding) {
                $finding['_source'] = basename($fixture);
                $results[] = $finding;
            }
        }
    }

    return [
        'results' => $results,
        'exitCode' => $exitCode,
    ];
}

function filterFindings(array $results, string $ruleId, string $fixtureFile): array
{
    return array_values(array_filter(
        $results,
        fn (array $f): bool =>
            ($f['check_id'] === $ruleId || str_ends_with($f['check_id'], '.' . $ruleId))
            && ($f['_source'] ?? '') === $fixtureFile,
    ));
}

test('Semgrep rules: each positive fixture triggers its rule')
    ->with([
        ['AuroraStatusTrue',        'kyaulabs-aurora-status-true-literal'],
        ['SqliInterpolatedQuery',    'kyaulabs-sqli-interpolated-query'],
        ['XssEchoRequestSink',      'kyaulabs-xss-echo-request-sink'],
        ['UnserializeRequestData',   'kyaulabs-unserialize-request-data'],
        ['MissingCsrfToken',        'kyaulabs-missing-csrf-token'],
        ['HardcodedDisplayErrors',  'kyaulabs-hardcoded-display-errors-on'],
    ])
    ->skip(!semgrepAvailable(), 'semgrep not installed')
    ->expect(function (string $dir, string $ruleId): array {
        $scan = semgrepScanDir($dir);

        return filterFindings($scan['results'], $ruleId, 'positive.php');
    })->not->toBeEmpty();

test('Semgrep rules: each negative fixture does not trigger its rule')
    ->with([
        ['AuroraStatusTrue',        'kyaulabs-aurora-status-true-literal'],
        ['SqliInterpolatedQuery',    'kyaulabs-sqli-interpolated-query'],
        ['XssEchoRequestSink',      'kyaulabs-xss-echo-request-sink'],
        ['UnserializeRequestData',   'kyaulabs-unserialize-request-data'],
        ['MissingCsrfToken',        'kyaulabs-missing-csrf-token'],
        ['HardcodedDisplayErrors',  'kyaulabs-hardcoded-display-errors-on'],
    ])
    ->skip(!semgrepAvailable(), 'semgrep not installed')
    ->expect(function (string $dir, string $ruleId): array {
        $scan = semgrepScanDir($dir);

        return filterFindings($scan['results'], $ruleId, 'negative.php');
    })->toBeEmpty();

// vim: ft=php sts=4 sw=4 ts=4 et :
