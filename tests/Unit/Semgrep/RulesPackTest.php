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

/**
 * Mutable cell for tracking semgrep process invocations.
 *
 * Call with $increment = 0 to read the current count, or
 * $increment = 1 to increment. Used by the counter test to
 * assert exactly one semgrep process per suite run.
 *
 * @param int $increment  Amount to add to the counter (0 = read-only).
 * @return int             Current invocation count.
 */
function semgrepInvocationCounter(int $increment = 0): int
{
    static $count = 0;
    $count += $increment;

    return $count;
}

/**
 * Run a single semgrep scan over the entire tests/Semgrep/ fixture tree.
 *
 * Scans all fixture directories in one process, memoizes the result in a
 * static so subsequent calls return the cached findings without spawning
 * another semgrep process. Findings are filtered per-rule/per-fixture
 * in-process by filterFindings().
 *
 * @return array{results: array, exitCode: int}
 */
function semgrepScanAll(): array
{
    static $cached = null;

    if ($cached !== null) {
        return $cached;
    }

    $projectRoot = realpath(__DIR__ . '/../../..');

    if ($projectRoot === false) {
        throw new \RuntimeException("Project root not resolvable");
    }

    $configPath = '.semgrep/kyaulabs.yml';
    $scanTarget = 'tests/Semgrep/';
    $null = (PHP_OS_FAMILY === 'Windows') ? 'nul' : '/dev/null';

    $cmd = 'cd ' . escapeshellarg($projectRoot) . ' && '
        . semgrepBin() . ' scan --config ' . escapeshellarg($configPath)
        . ' --json --metrics off --disable-version-check --x-ignore-semgrepignore-files '
        . escapeshellarg($scanTarget) . ' 2>' . $null;

    $output = [];
    $code = 0;
    exec($cmd, $output, $code);
    semgrepInvocationCounter(1);

    $json = json_decode(implode("\n", $output), true);

    $results = [];
    if (is_array($json) && isset($json['results'])) {
        $results = $json['results'];
    }

    $cached = [
        'results' => $results,
        'exitCode' => $code,
    ];

    return $cached;
}

/**
 * Filter scan results by rule ID and fixture directory + filename.
 *
 * Matches findings whose check_id ends with $ruleId and whose path
 * ends with "$dir/$fixtureFile" (e.g. "AuroraStatusTrue/positive.php").
 * Path comparison is normalized to forward slashes for cross-platform safety.
 *
 * @param array  $results      Raw findings from semgrepScanAll().
 * @param string $ruleId       Short rule ID (e.g. 'kyaulabs-sqli-interpolated-query').
 * @param string $dir          Fixture directory name (e.g. 'SqliInterpolatedQuery').
 * @param string $fixtureFile  Fixture filename (e.g. 'positive.php').
 * @return array               Matching findings, re-indexed.
 */
function filterFindings(array $results, string $ruleId, string $dir, string $fixtureFile): array
{
    $pathSuffix = $dir . '/' . $fixtureFile;

    return array_values(array_filter(
        $results,
        fn (array $f): bool =>
            ($f['check_id'] === $ruleId || str_ends_with($f['check_id'], '.' . $ruleId))
            && str_ends_with(str_replace('\\', '/', $f['path'] ?? ''), $pathSuffix),
    ));
}

test('Semgrep rules: each positive fixture fires its rule the expected number of times')
    ->with([
        ['AuroraStatusTrue',        'kyaulabs-aurora-status-true-literal', 1],
        ['SqliInterpolatedQuery',    'kyaulabs-sqli-interpolated-query',    2],
        ['XssEchoRequestSink',      'kyaulabs-xss-echo-request-sink',      2],
        ['UnserializeRequestData',   'kyaulabs-unserialize-request-data',   1],
        ['MissingCsrfToken',        'kyaulabs-missing-csrf-token',         1],
        ['HardcodedDisplayErrors',  'kyaulabs-hardcoded-display-errors-on', 1],
    ])
    ->skip(!semgrepAvailable(), 'semgrep not installed')
    ->expect(function (string $dir, string $ruleId, int $expectedCount): bool {
        $scan = semgrepScanAll();
        $findings = filterFindings($scan['results'], $ruleId, $dir, 'positive.php');

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
        $scan = semgrepScanAll();

        return filterFindings($scan['results'], $ruleId, $dir, 'negative.php');
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

test('semgrepScanAll invokes exactly one semgrep process across multiple calls')
    ->skip(!semgrepAvailable(), 'semgrep not installed')
    ->expect(function (): int {
        semgrepScanAll();
        semgrepScanAll();
        semgrepScanAll();

        return semgrepInvocationCounter();
    })->toBe(1);

// vim: ft=php sts=4 sw=4 ts=4 et :
