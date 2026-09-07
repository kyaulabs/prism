<?php

declare(strict_types=1);

# $KYAULabs: RulesPackTest.php kyau@aura.kyaulabs 2026/09/07 -0700 Exp $

use Tests\Semgrep\FixtureRepository;

require_once __DIR__ . '/FixtureRepository.php';

/**
 * Validates every rule in .semgrep/kyaulabs.yml against its positive and
 * negative fixtures in tests/Semgrep/<Dir>/.
 *
 * Prism verifies required tools; missing tools fail rather than skip.
 */

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
 * @throws \RuntimeException When the scan or its evidence is incomplete.
 */
function semgrepScanAll(): array
{
    static $cached = null;

    if ($cached instanceof \Throwable) {
        throw $cached;
    }

    if ($cached !== null) {
        return $cached;
    }

    try {
        $projectRoot = realpath(__DIR__ . '/../../..');

        if ($projectRoot === false) {
            throw new \RuntimeException("Project root not resolvable");
        }

        $paths = ['.semgrep/kyaulabs.yml'];

        foreach (semgrepRulesProvider() as $row) {
            foreach (['positive.php', 'negative.php'] as $fixture) {
                $paths[] = 'tests/Semgrep/' . $row['dir'] . '/' . $fixture;
            }
        }

        $outcome = FixtureRepository::scan($projectRoot, $paths);
        semgrepInvocationCounter(1);

        if ($outcome['exitCode'] !== 0) {
            throw new \RuntimeException('Semgrep fixture scan failed (exit ' . $outcome['exitCode'] . ')');
        }

        $json = json_decode($outcome['stdout'], true);

        if (!is_array($json) || !isset($json['results'], $json['errors'])
            || !is_array($json['results']) || !array_is_list($json['results']) || $json['errors'] !== []) {
            throw new \RuntimeException('Semgrep fixture output is invalid');
        }

        foreach ($json['results'] as $finding) {
            if (!is_array($finding) || !isset($finding['check_id'], $finding['path'])
                || !is_string($finding['check_id']) || $finding['check_id'] === ''
                || !is_string($finding['path']) || $finding['path'] === '') {
                throw new \RuntimeException('Semgrep fixture output is invalid');
            }
        }

        $cached = [
            'results' => $json['results'],
            'exitCode' => $outcome['exitCode'],
        ];

        return $cached;
    } catch (\Throwable $error) {
        $cached = $error;
        throw $error;
    }
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
    ->expect(function (): int {
        return semgrepScanAll()['exitCode'];
    })->toBe(0, 'semgrep exited non-zero. The experimental'
        . ' --x-ignore-semgrepignore-files flag may have been removed/renamed,'
        . ' or semgrep otherwise failed. Do not trust any positive/negative'
        . ' result until this passes (negatives pass vacuously on empty results).');

test('semgrep still advertises the --x-ignore-semgrepignore-files flag')
    ->expect(function (): bool {
        $output = [];
        $code = 0;
        $launcher = dirname(__DIR__, 3) . '/packages/prism-core/scripts/prism-tool.js';
        exec('node ' . escapeshellarg($launcher) . ' run semgrep -- scan --help 2>&1', $output, $code);

        $help = preg_replace('/\x1b\[[0-9;]*m/', '', implode("\n", $output));

        return $code === 0 && str_contains($help, 'x-ignore-semgrepignore-files');
    })->toBeTrue('semgrep no longer advertises'
        . ' --x-ignore-semgrepignore-files in `scan --help`. The flag may be'
        . ' graduating (dropping the x- prefix) or being removed. Update the'
        . ' command in semgrepScanAll() and this assertion to the new name.');

test('Semgrep rules: each positive fixture fires its rule the expected number of times')
    ->with(array_map(
        static fn (array $r): array => [$r['dir'], $r['rule'], $r['positive']],
        semgrepRulesProvider(),
    ))
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
    ->expect(function (string $dir, string $ruleId): array {
        $scan = semgrepScanAll();

        return filterFindings($scan['results'], $ruleId, $dir, 'negative.php');
    })->toBeEmpty();

test('semgrepScanAll invokes exactly one semgrep process across multiple calls')
    ->expect(function (): int {
        semgrepScanAll();
        semgrepScanAll();
        semgrepScanAll();

        return semgrepInvocationCounter();
    })->toBe(1);

// vim: ft=php sts=4 sw=4 ts=4 et :
