# Coverage Gate: Empty-Clover Hard-FAIL + Out-of-Source WARN/--strict

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Stop `.github/scripts/coverage-gate.php` from silently passing when
its input is degenerate (empty/truncated Clover) or when a changed file escapes
the coverage `<source>` set — make the former a hard FAIL, the latter a loud
WARN (or FAIL under a new `--strict` flag).

**Architecture:** Refactor the currently top-level procedural script into thin
CLI entry + pure, unit-testable seams (`parse_args`, `build_coverage_map`,
`has_executable_code`, `classify_changed_files`, `exit_code_for`). New behavior:
empty Clover → `exit 2` with a remediation message; an out-of-source file with
executable code → WARN (`exit 0` default, `exit 1` under `--strict`). The
existing shell contract tests stay as the integration layer; a new Pest unit
test covers the seams. `.github/scripts` enters `<source>` so the gate measures
itself (zero collateral — `coverage-gate.php` is the only `.php` there).

**Tech Stack:** PHP 8.5, `PhpToken::tokenize()` (Tokenizer ext, core), Pest v4
on PHPUnit 12, Bash (existing shell test), PHPUnit `phpunit.xml` `<source>`.

**Issue:** kyaulabs/prism #189 (Type: Bug).
**Architect:** GO-WITH-CONDITIONS → `ADR-required: 0037` (amends 0009).

## Global constraints

- PHP 8.5, `declare(strict_types=1)` on every PHP file, PSR-12 (4-space).
- Every new/modified source file carries an RCS header + vim modeline
  (`rcs-header` skill). Canonical ordering: `<?php` → `declare(strict_types=1);`
  → blank → `# $KYAULabs:` header.
- ArchTest (`tests/Unit/Harness/ArchTest.php`) scans `.github/scripts/` AND
  `tests/` (excl. `tests/Semgrep/`): no `var_dump/print_r/dd/dump`,
  strict-types enforced.
- **CI↔local parity (ADR-0025):** `--strict` must land in BOTH `ci.yml:204` and
  `check.md:116`, or NEITHER. This plan adopts WARN-only at both call sites
  (neither caller passes `--strict`); the flag is implemented but unwired, to be
  coordinated later. Do not add `--strict` to either caller in this plan.
- No new Composer/npm dependency (`PhpToken` is core). No external API, no
  aurora, no generated assets, no `.env`.
- Signed commits (`git commit -S`), Conventional Commits, issue-closing
  `Fixes: #189` on the final footer.

---

## File structure

- **Modify** `.github/scripts/coverage-gate.php` — refactor into seams + new
  behavior (empty-Clover FAIL, WARN, `--strict`).
- **Create** `tests/Unit/Harness/CoverageGateTest.php` — Pest unit tests for the
  extracted pure functions + the executable-code heuristic.
- **Modify** `tests/Shell/coverage_gate_test.sh` — update Test 3 (SKIP→WARN),
  add empty-Clover and `--strict` contract cases.
- **Create** `adr/0037-coverage-gate-empty-clover-and-strict-mode.md` — amends
  ADR-0009 (status Accepted).
- **Modify** `phpunit.xml` — add `.github/scripts` to `<source>`.
- **Modify** `.opencode/commands/check.md:119-122` — rewrite stale contract prose.
- **Modify** `CONTEXT.md` — append ADR-0037 to the Architectural Decisions list.

### Interfaces (locked here, referenced by tasks)

```php
/** @return array{clover:?string, min:int, root:string, strict:bool} */
function parse_args(array $argv): array

/** @return array<string,array{0:int,1:int}> relPath => [covered,total] */
function build_coverage_map(SimpleXMLElement $xml, string $rootPrefix): array

/** True iff $source contains an executable statement (see heuristic docblock). */
function has_executable_code(string $source): bool

/**
 * @param list<string>                       $changedFiles
 * @param array<string,array{0:int,1:int}>   $coverage   relPath => [covered,total]
 * @return array{passed:list,mixed:...,failed:list,warned:list,skipped:list}
 *   passed:  list<array{0:string,1:float,2:int,3:int}>
 *   failed:  list<array{0:string,1:float,2:int,3:int}>
 *   warned:  list<array{0:string,1:string}>   // [path, reason]
 *   skipped: list<array{0:string,1:string}>   // [path, reason]
 */
function classify_changed_files(
    array $changedFiles,
    array $coverage,
    string $rootPrefix,
    int $min,
): array

/** 1 if any failures; 1 if --strict and any warned; else 0. */
function exit_code_for(array $result, bool $strict): int

/** Thin CLI entry — parses args, reads stdin, loads Clover, prints, exits. */
function main(int $argc, array $argv): int
```

---

### Task 1: ADR-0037 (amends 0009) + enable coverage measurement

**Files:**
- Create: `adr/0037-coverage-gate-empty-clover-and-strict-mode.md`
- Modify: `CONTEXT.md` (Architectural Decisions list)
- Modify: `phpunit.xml:30-34` (`<source>` block)

**Interfaces:** Produces ADR-0037 (referenced by `CONTEXT.md`); enables pcov to
measure `.github/scripts/coverage-gate.php` for Tasks 2–6.

- [ ] **Step 1: Author ADR-0037** (Nygard format, status Accepted, "Amends
  0009"). Decision records:

  1. **Empty/degenerate Clover** (parsed but zero `<file>` nodes) is a pipeline
     failure, not a vacuous pass. The gate exits `2` with a STDERR message naming
     the remediation: register instrumented dirs in `phpunit.xml` `<source>`.
     This is a *clarification* of ADR-0009's anti-"pacifier" intent (an empty
     Clover passing is an accidental pacifier).
  2. **Out-of-source executable files** extend ADR-0009 decision 1 (which
     deliberately scoped enforcement to the `<source>` set). A changed PHP file
     that exists but is absent from the Clover is tokenized; if it contains
     executable code it emits a loud WARN (`exit 0`) by default, or FAIL
     (`exit 1`) under `--strict`. Pure-declaration files (interfaces,
     constants-only, trait-without-bodies) remain SKIP.
  3. **`--strict`** is an additive CLI flag; CI and `/check` stay on the WARN
     default (ADR-0025 parity preserved). Adopting `--strict` at either caller is
     a coordinated later decision, out of scope here.
  4. **`.github/scripts`** joins `<source>` so the gate measures itself.

  Consequences section notes the changed meaning of the "80% on changed files"
  guarantee (now: enforced in-source + warned out-of-source) and that the
  exit-code contract gains `2 = empty Clover` (already used for usage errors).

- [ ] **Step 2: Append ADR-0037 to CONTEXT.md** list, one-line summary:
  `- \`adr/0037-coverage-gate-empty-clover-and-strict-mode.md\` — Empty/degenerate Clover now hard-fails (exit 2); out-of-source executable files WARN by default and FAIL under \`--strict\`; amends ADR-0009`

- [ ] **Step 3: Add `.github/scripts` to `<source>`**

```xml
    <source>
        <include>
            <directory>backend</directory>
            <directory>.github/scripts</directory>
            <directory>.opencode/evals/bin/includes</directory>
        </include>
    </source>
```

- [ ] **Step 4: Verify no regression + denominator now includes the script**

Run: `php -d pcov.enabled=1 vendor/bin/pest --coverage`
Expected: suite green; `coverage-gate.php` appears in the coverage report (it
now has `<?php` but no exercised lines yet, so it may show 0% — that is fine
until Task 2 adds unit coverage; the *aggregate* `--min=80` backstop must still
hold because existing tests cover the rest).

- [ ] **Step 5: Commit**

```bash
git add adr/0037-coverage-gate-empty-clover-and-strict-mode.md CONTEXT.md phpunit.xml
git commit -S -m $'docs(adr): 0037 empty-clover hard-fail and out-of-source warn/strict\n\nAmends ADR-0009. Empty/degenerate Clover now exits 2 with a remediation\nmessage; out-of-source executable files WARN by default and FAIL under\n--strict; .github/scripts enters <source>.\n\nRefs: #189\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 2: Extract `has_executable_code(string): bool` (the heuristic)

**Files:**
- Modify: `.github/scripts/coverage-gate.php` (add function)
- Test: `tests/Unit/Harness/CoverageGateTest.php` (create)

**Interfaces:** Produces `has_executable_code(string): bool`. Consumed by
`classify_changed_files` (Task 5).

**Heuristic (document this in the function's PHPDoc):** tokenize via
`PhpToken::tokenize($source)`; return `true` if any token id is in the
unambiguous executable-statement set. These tokens only ever appear as
statements (never inside a declaration header), so no brace-depth tracking is
needed:

`T_IF T_ELSEIF T_ELSE T_WHILE T_DO T_FOR T_FOREACH T_SWITCH T_MATCH T_RETURN
T_THROW T_YIELD T_YIELD_FROM T_TRY T_CATCH T_FINALLY T_BREAK T_CONTINUE T_GOTO
T_ECHO T_PRINT T_INLINE_HTML`

**Known limitation (record in PHPDoc):** a file whose only code is assignment
statements with no control structure (e.g. a method body `$this->x = 1;` and
nothing else) is not detected and stays SKIP. Acceptable for v1 — the WARN is a
nudge, not a coverage measurement; the Clover is authoritative for in-source
files.

- [ ] **Step 1: Write the failing test** (create the test file with RCS header +
  strict types + the first case)

```php
<?php

declare(strict_types=1);

# $KYAULabs: CoverageGateTest.php kyau@nova 2026/07/23 -0700 Exp $


/**
 * Unit tests for the executable-code heuristic extracted from
 * coverage-gate.php. Pure string inputs — no filesystem.
 */

test('procedural echo is executable', function (): void {
    expect(has_executable_code("<?php\necho 'hi';\n"))->toBeTrue();
});

test('class with a method body is executable', function (): void {
    expect(has_executable_code("<?php\nclass A { public function go(): void { if (true) { return; } } }\n"))->toBeTrue();
});

test('interface with no bodies is not executable', function (): void {
    expect(has_executable_code("<?php\ninterface I { public function go(): void; }\n"))->toBeFalse();
});

test('constants-only class is not executable', function (): void {
    expect(has_executable_code("<?php\nclass C { public const X = 1; }\n"))->toBeFalse();
});

test('bare open tag is not executable', function (): void {
    expect(has_executable_code("<?php\n"))->toBeFalse();
});

test('inline HTML is executable', function (): void {
    expect(has_executable_code("<h1>hi</h1><?php echo 1;"))->toBeTrue();
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php vendor/bin/pest --filter 'has_executable_code|executable' tests/Unit/Harness/CoverageGateTest.php`
Expected: FAIL — `Call to undefined function has_executable_code()`.

- [ ] **Step 3: Implement** (add to `coverage-gate.php`, alongside
  `relativize_path()`)

```php
/**
 * Heuristic: does a PHP source string contain executable code?
 *
 * Tokenizes $source and returns true if any token is an unambiguous
 * executable-statement indicator (control structures, echo/print, return,
 * throw, yield, inline HTML, etc.). These tokens never appear inside a
 * declaration header, so no brace-depth tracking is required.
 *
 * Used by classify_changed_files() to decide whether an out-of-<source>
 * changed file should WARN (has code) or SKIP (pure declarations/config).
 *
 * Known limitation: assignment-only bodies without a control structure are
 * not detected. The WARN is a nudge, not a measurement — the Clover XML is
 * authoritative for in-source files.
 *
 * @param string $source
 * @return bool
 */
function has_executable_code(string $source): bool
{
    $executable = [
        T_IF, T_ELSEIF, T_ELSE, T_WHILE, T_DO, T_FOR, T_FOREACH, T_SWITCH,
        T_MATCH, T_RETURN, T_THROW, T_YIELD, T_YIELD_FROM, T_TRY, T_CATCH,
        T_FINALLY, T_BREAK, T_CONTINUE, T_GOTO, T_ECHO, T_PRINT, T_INLINE_HTML,
    ];
    foreach (PhpToken::tokenize($source) as $token) {
        if (in_array($token->id, $executable, true)) {
            return true;
        }
    }
    return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php vendor/bin/pest --filter 'executable' tests/Unit/Harness/CoverageGateTest.php`
Expected: PASS (6 cases).

- [ ] **Step 5: Verify the existing shell contract tests still pass** (the script
  still runs end-to-end; the new function is defined but not yet wired)

Run: `bash tests/Shell/coverage_gate_test.sh`
Expected: PASS (all 11, unchanged).

- [ ] **Step 6: Commit**

```bash
git add tests/Unit/Harness/CoverageGateTest.php .github/scripts/coverage-gate.php
git commit -S -m $'test(coverage-gate): add has_executable_code heuristic\n\nExtracts a token-based heuristic that detects executable code in a PHP\nsource string, used to decide WARN vs SKIP for out-of-<source> changed\nfiles. Unit-tested in isolation; not yet wired into classification.\n\nRefs: #189\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 3: Extract `parse_args(array): array` (+ `--strict`)

**Files:**
- Modify: `.github/scripts/coverage-gate.php` (replace the top-level arg loop
  with a call to `parse_args()`)
- Test: `tests/Unit/Harness/CoverageGateTest.php` (append cases)

**Interfaces:** Produces `parse_args(array $argv): array` returning
`{clover, min, root, strict}`. Consumed by `main()` (Task 5).

- [ ] **Step 1: Write failing tests** (append)

```php
test('parse_args reads clover positional and defaults', function (): void {
    $a = parse_args(['script.php', 'clover.xml']);
    expect($a['clover'])->toBe('clover.xml')
        ->and($a['min'])->toBe(80)
        ->and($a['strict'])->toBeFalse();
});

test('parse_args reads --min=N and --min N forms', function (): void {
    expect(parse_args(['s', 'c.xml', '--min=90'])['min'])->toBe(90)
        ->and(parse_args(['s', 'c.xml', '--min', '75'])['min'])->toBe(75);
});

test('parse_args reads --root and --strict flags', function (): void {
    $a = parse_args(['s', 'c.xml', '--root=/tmp', '--strict']);
    expect($a['root'])->toBe('/tmp')->and($a['strict'])->toBeTrue();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php vendor/bin/pest --filter 'parse_args' tests/Unit/Harness/CoverageGateTest.php`
Expected: FAIL — undefined function.

- [ ] **Step 3: Implement + rewire the CLI top-level to call it**

Extract the existing `$for ($i=1...)` loop (lines 42–55) into:

```php
/**
 * Parse CLI arguments.
 *
 * @param array<int,string> $argv
 * @return array{clover:?string, min:int, root:string, strict:bool}
 */
function parse_args(array $argv): array
{
    $cfg = ['clover' => null, 'min' => 80, 'root' => getcwd(), 'strict' => false];
    $n = count($argv);
    for ($i = 1; $i < $n; $i++) {
        $arg = $argv[$i];
        if ($arg === '--min' && $i + 1 < $n) {
            $cfg['min'] = (int) $argv[++$i];
        } elseif (str_starts_with($arg, '--min=')) {
            $cfg['min'] = (int) substr($arg, 6);
        } elseif ($arg === '--root' && $i + 1 < $n) {
            $cfg['root'] = $argv[++$i];
        } elseif (str_starts_with($arg, '--root=')) {
            $cfg['root'] = substr($arg, 7);
        } elseif ($arg === '--strict') {
            $cfg['strict'] = true;
        } elseif (!str_starts_with($arg, '--') && $cfg['clover'] === null) {
            $cfg['clover'] = $arg;
        }
    }
    return $cfg;
}
```

Replace the top-level `$min/$root/$cloverPath/$for(...)` block (lines 38–55)
with `$args = parse_args($argv);` then `$min=$args['min']; $root=$args['root'];
$cloverPath=$args['clover']; $strict=$args['strict'];` — keep the existing usage
guard (`$cloverPath === null || !is_file(...)` → exit 2).

- [ ] **Step 4: Run tests to verify pass**

Run: `php vendor/bin/pest --filter 'parse_args' tests/Unit/Harness/CoverageGateTest.php && bash tests/Shell/coverage_gate_test.sh`
Expected: Pest PASS (3 cases); shell tests PASS (behavior preserved — `--strict`
is parsed but not yet acted upon).

- [ ] **Step 5: Commit**

```bash
git add tests/Unit/Harness/CoverageGateTest.php .github/scripts/coverage-gate.php
git commit -S -m $'refactor(coverage-gate): extract parse_args and add --strict flag\n\nMoves the CLI argument loop into a pure, unit-tested parse_args() that\nalso recognizes --strict (parsed but not yet acted upon).\n\nRefs: #189\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 4: Extract `build_coverage_map()` + `classify_changed_files()` + `exit_code_for()` + thin `main()`

**Files:**
- Modify: `.github/scripts/coverage-gate.php` (the big refactor — behavior
  PRESERVING for existing cases)
- Test: `tests/Unit/Harness/CoverageGateTest.php` (append)

**Interfaces:** Produces the three functions above + `main()`. Behavior for
in-source files and deleted/0-line files is unchanged; the `warned` bucket is
populated but **not yet surfaced** (Task 6 wires reporting + strict). For this
task, `exit_code_for` treats `warned` as non-blocking (strict is false here).

- [ ] **Step 1: Write failing tests for the pure seams** (append; uses temp
  files for the out-of-source tokenization path)

```php
test('build_coverage_map relativizes file nodes', function (): void {
    $xml = simplexml_load_string(
        '<?xml version="1.0"?><coverage><project>'
        . '<file name="/r/backend/a.php"><line num="1" type="stmt" count="1"/></file>'
        . '<file name="/r/backend/b.php"><line num="1" type="stmt" count="0"/></file>'
        . '</project></coverage>'
    );
    $map = build_coverage_map($xml, '/r/');
    expect($map)->toHaveKey('backend/a.php')
        ->and($map['backend/a.php'])->toBe([1, 1])
        ->and($map['backend/b.php'])->toBe([0, 1]);
});

test('classify: in-source above threshold passes', function (): void {
    $r = classify_changed_files(['backend/a.php'], ['backend/a.php' => [10, 10]], '/r/', 80);
    expect($r['passed'])->toHaveCount(1)
        ->and($r['failed'])->toBeEmpty()
        ->and($r['warned'])->toBeEmpty();
});

test('classify: deleted file is skipped', function (): void {
    $r = classify_changed_files(['backend/gone.php'], [], '/r/', 80);
    expect($r['skipped'][0][1])->toBe('deleted/not found');
});

test('classify: out-of-source file with executable code is warned', function (): void {
    $dir = sys_get_temp_dir() . '/cg_' . bin2hex(random_bytes(4));
    mkdir($dir . '/backend', 0777, true);
    file_put_contents($dir . '/backend/extra.php', "<?php\necho 'x';\n");
    $r = classify_changed_files(['backend/extra.php'], [], $dir . '/', 80);
    expect($r['warned'])->toHaveCount(1)->and($r['skipped'])->toBeEmpty();
    array_map('unlink', glob($dir . '/backend/*')); rmdir($dir . '/backend'); rmdir($dir);
});

test('exit_code_for: failures exit 1; strict+warned exits 1; else 0', function (): void {
    $ok   = ['passed' => [['a', 100.0, 1, 1]], 'failed' => [], 'warned' => [], 'skipped' => []];
    $fail = ['passed' => [], 'failed' => [['a', 50.0, 1, 2]], 'warned' => [], 'skipped' => []];
    $warn = ['passed' => [], 'failed' => [], 'warned' => [['a', 'reason']], 'skipped' => []];
    expect(exit_code_for($ok, false))->toBe(0)
        ->and(exit_code_for($fail, false))->toBe(1)
        ->and(exit_code_for($warn, false))->toBe(0)
        ->and(exit_code_for($warn, true))->toBe(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php vendor/bin/pest --filter 'build_coverage_map|classify|exit_code_for' tests/Unit/Harness/CoverageGateTest.php`
Expected: FAIL — undefined functions.

- [ ] **Step 3: Implement the three functions** (add to `coverage-gate.php`)

```php
/**
 * Build the relPath => [covered,total] map from a parsed Clover document.
 *
 * @return array<string,array{0:int,1:int}>
 */
function build_coverage_map(SimpleXMLElement $xml, string $rootPrefix): array
{
    $coverage = [];
    $files = $xml->xpath('//file');
    if ($files === false) {
        $files = [];
    }
    foreach ($files as $file) {
        $absPath = (string) $file['name'];
        $relPath = relativize_path($absPath, $rootPrefix);
        $covered = 0;
        $total = 0;
        foreach ($file->line as $line) {
            if ((string) $line['type'] !== 'stmt') {
                continue;
            }
            $total++;
            if ((int) $line['count'] > 0) {
                $covered++;
            }
        }
        $coverage[$relPath] = [$covered, $total];
    }
    return $coverage;
}

/**
 * Classify each changed file into passed/failed/warned/skipped buckets.
 *
 * @param list<string>                     $changedFiles
 * @param array<string,array{0:int,1:int}> $coverage
 * @return array{passed:list<mixed>,failed:list<mixed>,warned:list<mixed>,skipped:list<mixed>}
 */
function classify_changed_files(array $changedFiles, array $coverage, string $rootPrefix, int $min): array
{
    $passed = $failed = $warned = $skipped = [];
    foreach ($changedFiles as $changed) {
        if ($changed === '') {
            continue;
        }
        $fullChanged = $rootPrefix . $changed;
        if (!is_file($fullChanged) && !is_file($changed)) {
            $skipped[] = [$changed, 'deleted/not found'];
            continue;
        }
        if (isset($coverage[$changed])) {
            [$covered, $total] = $coverage[$changed];
            if ($total === 0) {
                $skipped[] = [$changed, 'no executable lines'];
                continue;
            }
            $pct = ($covered / $total) * 100;
            if ($pct >= $min) {
                $passed[] = [$changed, $pct, $covered, $total];
            } else {
                $failed[] = [$changed, $pct, $covered, $total];
            }
            continue;
        }
        // Exists but absent from Clover → outside <source>.
        $path = is_file($fullChanged) ? $fullChanged : $changed;
        $source = (string) @file_get_contents($path);
        if ($source !== '' && has_executable_code($source)) {
            $warned[] = [$changed, 'outside <source>, has executable code — register in phpunit.xml <source>'];
        } else {
            $skipped[] = [$changed, 'outside <source>, no executable code'];
        }
    }
    return ['passed' => $passed, 'failed' => $failed, 'warned' => $warned, 'skipped' => $skipped];
}

/**
 * Decide the process exit code from the classification result.
 *
 * @param array{passed:list,failed:list,warned:list,skipped:list} $result
 */
function exit_code_for(array $result, bool $strict): int
{
    if ($result['failed'] !== []) {
        return 1;
    }
    if ($strict && $result['warned'] !== []) {
        return 1;
    }
    return 0;
}
```

- [ ] **Step 4: Replace the inline classify+report block (lines ~107–163) with a
  thin `main()`** that calls the seams and keeps the SAME printing for
  passed/failed/skipped. For now print `warned` rows as `WARN` (Task 6 finalizes
  the summary line). End with `exit(main($argc, $argv));` at the top level.

```php
function main(int $argc, array $argv): int
{
    $args = parse_args($argv);
    $cloverPath = $args['clover'];
    $min = $args['min'];
    $root = $args['root'];
    $strict = $args['strict'];

    if ($cloverPath === null || !is_file($cloverPath)) {
        fwrite(STDERR, "Usage: coverage-gate.php <clover.xml> [--min=N] [--root=DIR] [--strict]\n");
        fwrite(STDERR, "       Pipe changed file paths (one per line) via stdin.\n");
        return 2;
    }

    $changedRaw = (string) file_get_contents('php://stdin');
    $changedFiles = array_values(array_unique(array_filter(array_map('trim', explode("\n", $changedRaw)))));

    $xml = @simplexml_load_file($cloverPath);
    if ($xml === false) {
        fwrite(STDERR, "ERROR: could not parse clover XML at {$cloverPath}\n");
        return 2;
    }

    $rootReal = realpath($root);
    $rootPrefix = rtrim(str_replace('\\', '/', $rootReal !== false ? $rootReal : $root), '/') . '/';
    $coverage = build_coverage_map($xml, $rootPrefix);

    $result = classify_changed_files($changedFiles, $coverage, $rootPrefix, $min);

    echo "Changed-file coverage gate (min {$min}%):\n\n";
    printf("  %-55s %8s   %s\n", 'File', 'Coverage', 'Gate');
    foreach ($result['passed'] as [$f, $pct, $c, $t]) {
        printf("  %-55s %7.1f%%   %s  (%d/%d)\n", $f, $pct, 'PASS', $c, $t);
    }
    foreach ($result['failed'] as [$f, $pct, $c, $t]) {
        printf("  %-55s %7.1f%%   %s  (%d/%d)\n", $f, $pct, 'FAIL', $c, $t);
    }
    foreach ($result['warned'] as [$f, $reason]) {
        fwrite(STDERR, sprintf("  %-55s %8s   %s  (%s)\n", $f, '-', 'WARN', $reason));
    }
    foreach ($result['skipped'] as [$f, $reason]) {
        printf("  %-55s %8s   %s  (%s)\n", $f, '-', 'SKIP', $reason);
    }
    echo "\n";

    $code = exit_code_for($result, $strict);
    if ($result['failed'] !== []) {
        fwrite(STDERR, sprintf("FAIL — %d file(s) below %d%% coverage\n", count($result['failed']), $min));
    } else {
        echo sprintf(
            "PASS — %d file(s) checked, %d warned, %d skipped, 0 failures\n",
            count($result['passed']),
            count($result['warned']),
            count($result['skipped']),
        );
    }
    return $code;
}

exit(main($argc, $argv));
```

- [ ] **Step 5: Run unit + shell tests to verify behavior is preserved**

Run: `php vendor/bin/pest tests/Unit/Harness/CoverageGateTest.php && bash tests/Shell/coverage_gate_test.sh`
Expected: Pest PASS; shell Tests 1,2,4–11 PASS. **Shell Test 3 will now emit WARN
instead of SKIP** — that is expected and is updated in Task 6 (it currently
asserts `SKIP`, so it will FAIL until Task 6 fixes it; if you prefer green at
this commit, fix Test 3 now and drop it from Task 6).

- [ ] **Step 6: Commit**

```bash
git add tests/Unit/Harness/CoverageGateTest.php .github/scripts/coverage-gate.php
git commit -S -m $'refactor(coverage-gate): extract classify/map/exit seams into thin main()\n\nBehavior-preserving refactor: build_coverage_map, classify_changed_files,\nand exit_code_for are now pure, unit-tested functions called by a thin\nmain(). Out-of-source executable files now populate a warned bucket\n(WARN output); strict promotion is wired but callers do not pass --strict.\n\nRefs: #189\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 5: Empty/degenerate Clover → hard FAIL (exit 2)

**Files:**
- Modify: `.github/scripts/coverage-gate.php` (`main()`, after
  `build_coverage_map`)
- Test: `tests/Unit/Harness/CoverageGateTest.php` (subprocess) +
  `tests/Shell/coverage_gate_test.sh` (new Test 12)

**Interfaces:** Adds an early `return 2` in `main()` when
`$coverage === []`. Consumes `build_coverage_map` (Task 4).

- [ ] **Step 1: Write failing Pest test** (append; exercises the CLI end-to-end)

```php
test('empty clover (no file nodes) exits 2', function (): void {
    $dir = sys_get_temp_dir() . '/cg_' . bin2hex(random_bytes(4));
    mkdir($dir, 0777, true);
    $clover = $dir . '/empty.xml';
    file_put_contents($clover, '<?xml version="1.0"?><coverage><project></project></coverage>');
    $cmd = sprintf('printf %s | php %s %s --root=%s 2>&1', escapeshellarg('backend/a.php'), escapeshellarg(getcwd() . '/.github/scripts/coverage-gate.php'), escapeshellarg($clover), escapeshellarg($dir));
    exec($cmd, $out, $rc);
    expect($rc)->toBe(2);
    expect(implode("\n", $out))->toContain('<source>');
    unlink($clover); rmdir($dir);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php vendor/bin/pest --filter 'empty clover' tests/Unit/Harness/CoverageGateTest.php`
Expected: FAIL — exit 0 (current behavior).

- [ ] **Step 3: Implement** — in `main()`, immediately after `$coverage =
  build_coverage_map(...)`:

```php
    if ($coverage === []) {
        fwrite(STDERR, "ERROR: Clover report '{$cloverPath}' contains no <file> entries.\n");
        fwrite(STDERR, "       No source files are instrumented. Register instrumented\n");
        fwrite(STDERR, "       directories in phpunit.xml <source><include>, then re-run\n");
        fwrite(STDERR, "       `pest --coverage` to regenerate tests/coverage.xml.\n");
        return 2;
    }
```

- [ ] **Step 4: Run test to verify pass**

Run: `php vendor/bin/pest --filter 'empty clover' tests/Unit/Harness/CoverageGateTest.php`
Expected: PASS.

- [ ] **Step 5: Add shell contract Test 12** (append before the Summary block in
  `tests/Shell/coverage_gate_test.sh`)

```bash
# ── Test 12: Empty Clover (no <file> nodes) → exit 2 ────────────────────────
echo ""
echo "── Test 12: empty clover → exit 2 ──"
T12=$(mktemp -d)
register_temp_dir "$T12"
(
	cd "$T12"
	CLOVER=$(mktemp)
	{
		echo '<?xml version="1.0" encoding="UTF-8"?>'
		echo '<coverage generated="1"><project></project></coverage>'
	} > "$CLOVER"
	printf 'backend/env.php\n' | php "$SCRIPT" "$CLOVER" --root="$T12" >out.txt 2>&1 || rc=$?
	if [ "${rc:-2}" -eq 2 ] && grep -q '<source>' out.txt; then
		pass "empty clover exits 2 with <source> remediation"
	else
		fail "expected exit 2 + <source> hint, got rc=${rc:-0}"
	fi
)
```

- [ ] **Step 6: Run shell test to verify pass**

Run: `bash tests/Shell/coverage_gate_test.sh`
Expected: PASS including new Test 12.

- [ ] **Step 7: Commit**

```bash
git add tests/Unit/Harness/CoverageGateTest.php tests/Shell/coverage_gate_test.sh .github/scripts/coverage-gate.php
git commit -S -m $'fix(coverage-gate): fail on empty/degenerate clover report\n\nA parsed Clover with zero <file> nodes is a pipeline failure, not a\nvacuous pass. The gate now exits 2 with a remediation message pointing\nto phpunit.xml <source>. Acceptance criterion #2 of #189.\n\nRefs: #189\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 6: Out-of-source WARN surfacing + `--strict` contract + update stale docs

**Files:**
- Modify: `tests/Shell/coverage_gate_test.sh` (Test 3 + new Test 13)
- Modify: `.opencode/commands/check.md:119-122`

**Interfaces:** No new code — finalizes the WARN reporting (already in `main()`)
and locks the `--strict` contract in the shell layer. `--strict` is NOT added to
`ci.yml` or `check.md` (ADR-0025 parity — WARN-only at both call sites).

- [ ] **Step 1: Update shell Test 3** (out-of-source file WITH executable code →
  WARN). Replace the body of Test 3 so `backend/other.php` contains real code:

```bash
# ── Test 3: out-of-source executable file → WARN, exit 0 ────────────────────
echo ""
echo "── Test 3: out-of-source executable file warns ──"
T3=$(mktemp -d)
register_temp_dir "$T3"
(
	cd "$T3"
	mkdir -p backend
	echo '<?php' > backend/env.php
	printf '<?php\necho "x";\n' > backend/other.php   # executable, outside <source>
	CLOVER=$(mktemp)
	build_clover "$CLOVER" "$T3" "backend/env.php:10:10"
	printf 'backend/other.php\n' | php "$SCRIPT" "$CLOVER" --root="$T3" >out.txt 2>&1 || rc=$?
	if [ "${rc:-0}" -eq 0 ] && grep -q 'WARN' out.txt; then
		pass "out-of-source executable file warns (exit 0)"
	else
		fail "expected exit 0 + WARN, got rc=${rc:-0}"
	fi
)
```

- [ ] **Step 2: Add shell Test 13** (`--strict` promotes WARN → FAIL, exit 1)

```bash
# ── Test 13: --strict promotes out-of-source WARN → FAIL, exit 1 ───────────
echo ""
echo "── Test 13: --strict fails out-of-source executable ──"
T13=$(mktemp -d)
register_temp_dir "$T13"
(
	cd "$T13"
	mkdir -p backend
	echo '<?php' > backend/env.php
	printf '<?php\necho "x";\n' > backend/other.php
	CLOVER=$(mktemp)
	build_clover "$CLOVER" "$T13" "backend/env.php:10:10"
	printf 'backend/other.php\n' | php "$SCRIPT" "$CLOVER" --root="$T13" --strict >out.txt 2>&1 || rc=$?
	if [ "${rc:-1}" -eq 1 ] && grep -q 'WARN' out.txt; then
		pass "--strict fails out-of-source executable (exit 1)"
	else
		fail "expected exit 1 + WARN under --strict, got rc=${rc:-0}"
	fi
)
```

- [ ] **Step 3: Run the full shell suite**

Run: `bash tests/Shell/coverage_gate_test.sh`
Expected: PASS (13 tests).

- [ ] **Step 4: Rewrite the stale contract prose in `check.md`** (lines 119–122)

Replace:
```
- Gate: **≥ 80% line coverage** on each changed file that is in the
  coverage source set (`<source>` in `phpunit.xml`).
- Files outside the source set, deleted files, and files with no
  executable lines are SKIPped (non-blocking).
```
with:
```
- Gate: **≥ 80% line coverage** on each changed file that is in the
  coverage source set (`<source>` in `phpunit.xml`).
- A changed file that exists but is **outside `<source>` and contains
  executable code emits a WARN** (non-blocking by default; FAILs under
  `--strict`). Deleted files and files with no executable lines are
  SKIPped. An empty/degenerate Clover report fails with exit 2.
- This command and CI both run the gate **without** `--strict` (ADR-0025
  parity); `--strict` is an available opt-in for stricter local checks.
```

- [ ] **Step 5: Commit**

```bash
git add tests/Shell/coverage_gate_test.sh .opencode/commands/check.md
git commit -S -m $'test(coverage-gate): warn on out-of-source files; add --strict contract\n\nUpdates the shell contract: out-of-source executable files WARN (exit 0)\nand FAIL under --strict (exit 1). Rewrites the stale /check prose to match\n(ADR-0037). Neither caller wires --strict (ADR-0025 parity).\n\nRefs: #189\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 7: Verification gate (no new code)

- [ ] **Step 1: Full suite + 80% gate on changed files**

Run: `php -d pcov.enabled=1 vendor/bin/pest --coverage --min=80`
Expected: green; `coverage-gate.php` and `CoverageGateTest.php` both ≥ 80%.

- [ ] **Step 2: `/check` equivalence** (lint + coverage gate)

Run: `bash .github/scripts/coverage-gate.php` is invoked by `/check`; run the
pre-push gate mentally — the changed files are the plan's own deliverables, all
in `<source>` now and covered.

- [ ] **Step 3: Confirm no debug funcs / strict-types / RCS headers**

Run: `php vendor/bin/pest tests/Unit/Harness` (runs ArchTest +
RcsHeaderConventionTest over `.github/scripts/` and `tests/`).
Expected: PASS.

---

## Acceptance criteria traceability (#189)

| Criterion | Covered by |
| --- | --- |
| A changed file outside coverage source produces a visible warning | Task 4 (`warned` bucket + WARN output), Task 6 (shell Test 3) |
| An empty/truncated Clover report fails with a non-zero exit | Task 5 (exit 2 + Pest + shell Test 12) |
| The requirement to register new source dirs is documented at the point of failure | Task 5 (STDERR message names `phpunit.xml <source>`), `README.md:70-73` (pre-existing) |

## Out of scope (follow-ups)

- Wiring `--strict` into `ci.yml:204` and/or `check.md:116` (coordinated
  ADR-0025 parity decision — deferred).
- `/setup` auto-registering scaffolded dirs into `<source>` (ADR-0026 territory;
  separate issue).
- Tightening `has_executable_code` to detect assignment-only bodies (documented
  limitation; only if real noise is observed).
