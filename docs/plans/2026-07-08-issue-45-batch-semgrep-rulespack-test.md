# Batch `RulesPackTest` Into Single Semgrep Invocation — Issue #45 Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Replace 24 per-fixture semgrep cold starts in `RulesPackTest` with a single memoized scan of `tests/Semgrep/`, filtering findings per rule/fixture path in-process.

**Architecture:** Replace `semgrepScanDir(string $dir)` (which loops over positive/negative files, spawning 2 semgrep processes per call × 12 calls = 24 cold starts) with `semgrepScanAll()` — a single `semgrep scan --config .semgrep/kyaulabs.yml --json tests/Semgrep/` memoized in a static. Update `filterFindings()` to disambiguate by directory + filename via semgrep's `path` field (the current `_source = basename($fixture)` is ambiguous when all 6 directories share `positive.php`/`negative.php`). Add a process-counter test asserting exactly 1 invocation.

**Tech Stack:** PHP 8.5+ (Pest v4), semgrep CLI.

## Global constraints

- PHP 8.5+ (`declare(strict_types=1)`, typed return types)
- No dependencies added — semgrep already required in CI
- RCS header: `# $KYAULabs: RulesPackTest.php kyau@nova 2026/07/08 -0700 Exp $` (preserve existing)
- Vim modeline: `// vim: ft=php sts=4 sw=4 ts=4 et :` (preserve existing)
- Tests run via Pest: `php vendor/bin/pest`
- Commit footers: `Plan-by: glm-5.2`, `Acked-by: deepseek-v4-pro`, `Signed-off-by: kyau <[EMAIL]>`
- Test-only change — no production code touched

---

### Task 1: Add process-counter test + batch scan implementation

**Files:**
- Modify: `tests/Unit/Semgrep/RulesPackTest.php` (entire file — replace `semgrepScanDir` with `semgrepScanAll`, update `filterFindings` signature, update test callbacks, add counter test)

**Interfaces:**
- Produces:
  - `semgrepScanAll(): array` — memoized single scan of `tests/Semgrep/`, returns `['results' => array, 'exitCode' => int]`
  - `semgrepInvocationCounter(int $increment = 0): int` — mutable cell function; call with `0` to read, `1` to increment
  - `filterFindings(array $results, string $ruleId, string $dir, string $fixtureFile): array` — updated signature, filters by `check_id` + path suffix `$dir/$fixtureFile`

- [ ] **Step 1: Write the failing test (Red)**

Add this test at the end of `tests/Unit/Semgrep/RulesPackTest.php`, before the vim modeline (after the existing `semgrepBin` test at line 182):

```php
test('semgrepScanAll invokes exactly one semgrep process across multiple calls')
    ->skip(!semgrepAvailable(), 'semgrep not installed')
    ->expect(function (): int {
        semgrepScanAll();
        semgrepScanAll();
        semgrepScanAll();

        return semgrepInvocationCounter();
    })->toBe(1);
```

- [ ] **Step 2: Run test to verify it fails (Red)**

```bash
php vendor/bin/pest tests/Unit/Semgrep/RulesPackTest.php --filter 'semgrepScanAll'
```

Expected: **FAIL** — `Error: Call to undefined function semgrepScanAll()`.

- [ ] **Step 3: Replace `semgrepScanDir` with `semgrepScanAll` + counter + update `filterFindings` (Green)**

Replace the `semgrepScanDir` function (lines 84–128) and `filterFindings` function (lines 130–138) with:

```php
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
```

- [ ] **Step 4: Update test callbacks to use `semgrepScanAll` + new `filterFindings` signature (Green)**

Replace the positive-fixture test callback (lines 150–155):

```php
    ->expect(function (string $dir, string $ruleId, int $expectedCount): bool {
        $scan = semgrepScanAll();
        $findings = filterFindings($scan['results'], $ruleId, $dir, 'positive.php');

        return count($findings) === $expectedCount;
    })->toBeTrue();
```

Replace the negative-fixture test callback (lines 167–171):

```php
    ->expect(function (string $dir, string $ruleId): array {
        $scan = semgrepScanAll();

        return filterFindings($scan['results'], $ruleId, $dir, 'negative.php');
    })->toBeEmpty();
```

- [ ] **Step 5: Run full RulesPackTest to verify all tests pass (Green)**

```bash
php vendor/bin/pest tests/Unit/Semgrep/RulesPackTest.php
```

Expected: **PASS** — 12 dataset assertions (6 positive + 6 negative) + 1 `semgrepBin` test + 1 counter test = all green.

If semgrep is not installed locally, the semgrep-dependent tests skip. Verify on CI or after installing semgrep.

- [ ] **Step 6: Run full Pest suite to verify no regressions**

```bash
php vendor/bin/pest --coverage --min=80
```

Expected: **PASS** — all tests green, coverage ≥ 80%.

- [ ] **Step 7: Commit**

```bash
git add tests/Unit/Semgrep/RulesPackTest.php
git commit -S -m "perf(semgrep): batch RulesPackTest into single semgrep invocation

Replaces 24 per-fixture semgrep cold starts (2 per directory ×
12 dataset rows) with a single memoized scan of tests/Semgrep/.
Findings are filtered per-rule/per-fixture in-process via the
semgrep path field, disambiguating positive.php/negative.php
across the 6 fixture directories.

Adds semgrepInvocationCounter() mutable-cell function and a
counter test asserting exactly 1 semgrep process per suite run.

Closes #45.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <[EMAIL]>"
```

---

### Verification

After the task is committed:

- [ ] `verification-before-completion`: re-run `php vendor/bin/pest tests/Unit/Semgrep/RulesPackTest.php` — all green
- [ ] `/check` (php-cs-fixer + stylelint + eslint + pest --coverage 80% + shell tests)
- [ ] `@code-review` on the feature branch
- [ ] Confirm CI shows `RulesPackTest` executing with significantly reduced time vs. pre-fix runs
