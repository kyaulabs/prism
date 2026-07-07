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

/**
 * Resolve the semgrep binary path.
 *
 * Probes ~/.local/bin/semgrep first (when HOME or USERPROFILE is set),
 * then semgrep on PATH. Returns the first binary that answers --version,
 * or null if neither is available. Memoizes the result so probing occurs
 * at most once per process.
 *
 * @return ?string  Quoted binary path, unquoted 'semgrep', or null.
 */
function semgrepResolve(): ?string
{
    static $resolved = null;
    static $set = false;

    if ($set) {
        return $resolved;
    }

    $home = getenv('USERPROFILE') ?: getenv('HOME');
    $candidates = [];

    if ($home) {
        $candidates[] = '"' . $home . DIRECTORY_SEPARATOR . '.local'
            . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'semgrep' . '"';
    }
    $candidates[] = 'semgrep';

    foreach ($candidates as $bin) {
        $output = [];
        $code = 0;
        exec($bin . ' --version 2>&1', $output, $code);

        if ($code === 0) {
            $resolved = $bin;
            $set = true;

            return $resolved;
        }
    }

    $resolved = null;
    $set = true;

    return null;
}

/**
 * Check whether semgrep is available on this system.
 *
 * @return bool
 */
function semgrepAvailable(): bool
{
    return semgrepResolve() !== null;
}

/**
 * Return the semgrep binary path.
 *
 * Must only be called when semgrep is available (guarded by semgrepAvailable).
 *
 * @return string  Quoted binary path or 'semgrep'.
 */
function semgrepBin(): string
{
    return semgrepResolve() ?? 'semgrep';
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

test('Semgrep rules: each positive fixture fires its rule the expected number of times')
    ->with([
        ['AuroraStatusTrue',        'kyaulabs-aurora-status-true-literal', 1],
        ['SqliInterpolatedQuery',    'kyaulabs-sqli-interpolated-query',    2],
        ['XssEchoRequestSink',      'kyaulabs-xss-echo-request-sink',      1],
        ['UnserializeRequestData',   'kyaulabs-unserialize-request-data',   1],
        ['MissingCsrfToken',        'kyaulabs-missing-csrf-token',         1],
        ['HardcodedDisplayErrors',  'kyaulabs-hardcoded-display-errors-on', 1],
    ])
    ->skip(!semgrepAvailable(), 'semgrep not installed')
    ->expect(function (string $dir, string $ruleId, int $expectedCount): bool {
        $scan = semgrepScanDir($dir);
        $findings = filterFindings($scan['results'], $ruleId, 'positive.php');

        return count($findings) === $expectedCount;
    })->toBeTrue();

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

test('semgrepBin returns a working binary when semgrep is available')
    ->skip(! semgrepAvailable(), 'semgrep not installed')
    ->expect(function (): int {
        $bin = semgrepBin();
        $output = [];
        $code = 0;
        exec($bin . ' --version 2>&1', $output, $code);

        return $code;
    })->toBe(0);

// vim: ft=php sts=4 sw=4 ts=4 et :
