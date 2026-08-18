<?php

declare(strict_types=1);

# $KYAULabs: RulesPackTest.php kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

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

/**
 * Canonical rule → fixture → expected-positive-count mapping.
 *
 * Single source of truth consumed by the positive/negative dataset tests
 * below AND by the sync test that enforces parity with
 * .semgrep/kyaulabs.yml and the tests/Semgrep/<Dir>/ fixtures. Adding a
 * new rule means appending one row here and creating the fixture dir —
 * the sync test fails otherwise (see ADR-0002).
 *
 * @return list<array{dir: string, rule: string, positive: int}>
 */
function semgrepRulesProvider(): array
{
    return [
        ['dir' => 'AuroraStatusTrue',       'rule' => 'kyaulabs-aurora-status-true-literal',  'positive' => 4],
        ['dir' => 'SqliInterpolatedQuery',   'rule' => 'kyaulabs-sqli-interpolated-query',    'positive' => 7],
        ['dir' => 'XssEchoRequestSink',      'rule' => 'kyaulabs-xss-echo-request-sink',      'positive' => 3],
        ['dir' => 'UnserializeRequestData',   'rule' => 'kyaulabs-unserialize-request-data',   'positive' => 3],
        ['dir' => 'MissingCsrfToken',        'rule' => 'kyaulabs-missing-csrf-token',         'positive' => 5],
        ['dir' => 'HardcodedDisplayErrors',  'rule' => 'kyaulabs-hardcoded-display-errors-on', 'positive' => 10],
    ];
}

test('rules pack stays in sync across YAML, provider, and fixtures', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $yamlPath = $repoRoot . DIRECTORY_SEPARATOR . '.semgrep'
        . DIRECTORY_SEPARATOR . 'kyaulabs.yml';
    $fixturesRoot = $repoRoot . DIRECTORY_SEPARATOR . 'tests'
        . DIRECTORY_SEPARATOR . 'Semgrep';

    $yaml = file_get_contents($yamlPath);
    expect($yaml)->not->toBeEmpty(".semgrep/kyaulabs.yml missing or empty at {$yamlPath}");

    // Regex extraction is safe: the YAML is first-party/controlled and `id:`
    // appears only as the list-item form `- id: <rule>` under `rules:`.
    preg_match_all('/^[ \t]*-[ \t]+id:[ \t]+([A-Za-z0-9][A-Za-z0-9._+-]*)/m', $yaml, $m);
    $yamlRules = array_values(array_unique($m[1]));

    $rows = semgrepRulesProvider();
    $providerRules = array_column($rows, 'rule');
    $providerDirs = array_column($rows, 'dir');

    $failures = [];

    // 1. set-equality: every YAML rule is tested, no stale test rows.
    $untested = array_values(array_diff($yamlRules, $providerRules));
    $stale = array_values(array_diff($providerRules, $yamlRules));
    if ($untested !== []) {
        $failures[] = 'In YAML but absent from semgrepRulesProvider() '
            . '(untested — violates ADR-0002 "no untested rules"): '
            . implode(', ', $untested);
    }
    if ($stale !== []) {
        $failures[] = 'In semgrepRulesProvider() but absent from YAML (stale rows): '
            . implode(', ', $stale);
    }

    // 2. every provider dir has both fixtures.
    foreach ($rows as $r) {
        foreach (['positive.php', 'negative.php'] as $fixture) {
            $path = $fixturesRoot . DIRECTORY_SEPARATOR . $r['dir']
                . DIRECTORY_SEPARATOR . $fixture;
            if (!is_file($path)) {
                $failures[] = "Provider references tests/Semgrep/{$r['dir']}/{$fixture} but it does not exist.";
            }
        }
    }

    // 3. no orphan fixture directories.
    $diskDirs = [];
    foreach (glob($fixturesRoot . '/*', GLOB_ONLYDIR) ?: [] as $d) {
        $diskDirs[] = basename($d);
    }
    $orphans = array_values(array_diff($diskDirs, $providerDirs));
    if ($orphans !== []) {
        $failures[] = 'Fixture dirs on disk with no provider row (orphans): '
            . implode(', ', $orphans);
    }

    // 4. no duplicate dirs or rules in the provider.
    if (count($providerDirs) !== count(array_unique($providerDirs))) {
        $failures[] = 'Duplicate dir entries in semgrepRulesProvider().';
    }
    if (count($providerRules) !== count(array_unique($providerRules))) {
        $failures[] = 'Duplicate rule entries in semgrepRulesProvider().';
    }

    if ($failures !== []) {
        $message = sprintf(
            "Rules-pack sync drift detected (issue #94):\n\n%s\n\n"
            . "Ensure each rule in .semgrep/kyaulabs.yml has exactly one row in"
            . " semgrepRulesProvider() (RulesPackTest.php) and matching"
            . " tests/Semgrep/<Dir>/{positive,negative}.php fixtures.",
            implode("\n", $failures),
        );
        expect($failures)->toBeEmpty($message);
    } else {
        expect($failures)->toBeEmpty();
    }
});

test('semgrep scan over fixtures exits zero (experimental flag still recognized)')
    ->skip(!semgrepAvailable(), 'semgrep not installed')
    ->expect(function (): int {
        return semgrepScanAll()['exitCode'];
    })->toBe(0, 'semgrep exited non-zero. The experimental'
        . ' --x-ignore-semgrepignore-files flag may have been removed/renamed,'
        . ' or semgrep otherwise failed. Do not trust any positive/negative'
        . ' result until this passes (negatives pass vacuously on empty results).');

test('semgrep still advertises the --x-ignore-semgrepignore-files flag')
    ->skip(!semgrepAvailable(), 'semgrep not installed')
    ->expect(function (): bool {
        $output = [];
        $code = 0;
        exec(semgrepBin() . ' scan --help 2>&1', $output, $code);

        $help = preg_replace('/\x1b\[[0-9;]*m/', '', implode("\n", $output));

        return str_contains($help, 'x-ignore-semgrepignore-files');
    })->toBeTrue('semgrep no longer advertises'
        . ' --x-ignore-semgrepignore-files in `scan --help`. The flag may be'
        . ' graduating (dropping the x- prefix) or being removed. Update the'
        . ' command in semgrepScanAll() and this assertion to the new name.');

test('Semgrep rules: each positive fixture fires its rule the expected number of times')
    ->with(array_map(
        static fn (array $r): array => [$r['dir'], $r['rule'], $r['positive']],
        semgrepRulesProvider(),
    ))
    ->skip(!semgrepAvailable(), 'semgrep not installed')
    ->expect(function (string $dir, string $ruleId, int $expectedCount): bool {
        $scan = semgrepScanAll();
        $findings = filterFindings($scan['results'], $ruleId, $dir, 'positive.php');

        return count($findings) === $expectedCount;
    })->toBeTrue();

test('Semgrep rules: each negative fixture does not trigger its rule')
    ->with(array_map(
        static fn (array $r): array => [$r['dir'], $r['rule']],
        semgrepRulesProvider(),
    ))
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
