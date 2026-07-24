# Env Loader Validation Hardening Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Harden `backend/env.php` (`load_env` + `env_bool`) against malformed
and dangerous `.env` input — validate key names, strip `export ` prefixes and
UTF-8 BOMs, strip inline `#` comments, block child-process code-execution env
names, and stop empty-string `$_ENV` values from shadowing `getenv()`.

**Architecture:** `load_env()` parses `.env` at page bootstrap (ADR-0003). The
parse loop (`backend/env.php:60-97`) currently performs zero key-name
validation, stores inline comments and BOM bytes inside key/value strings, and
will happily `putenv()` an `LD_PRELOAD` it read from the file. `env_bool()`
(`:20-29`) reads `$_ENV[$key] ?? getenv($key)`, so an empty-string `$_ENV`
entry short-circuits past a real `getenv()` value. The fix adds POSIX key
validation, BOM/export/comment handling, a fixed dangerous-name blocklist
(extracted as `is_dangerous_env_name()`), and an empty-string-as-unset rule in
`env_bool()`. The ADR-0003 "never overwrite server env" invariant is preserved
unchanged.

**Tech Stack:** PHP 8.5+ (procedural, `declare(strict_types=1)`), Pest v4.
Single source file (`backend/env.php`) + two existing test files + one doc
file + one ADR. No new dependencies, no SCSS/JS.

## Origin

- **Issue:** #192 — "load_env() / backend/env.php — Validation Gaps"
- **Type:** Security (commit type `fix` per `docs/agents/labels.md`)
- **Root cause:** Known and fully documented. The issue *is* a multi-model
  security review (4/6 consensus, severity Medium) with exact line numbers
  (`env.php:22`, `:60-97`, `:73`, `:96`), rationale, a recommended
  implementation, and four concrete acceptance criteria. No `@debug`
  investigation is required — see "Why not route through `@debug`" in Notes.

## Global constraints

- **TDD mandatory.** Every behavior change lands Red → Green. Tests live in
  the two existing files (`tests/Unit/LoadEnvTest.php`,
  `tests/Unit/EnvBoolTest.php`) following their temp-file / `restoreEnvVars`
  pattern. No new test files.
- **80% line coverage on changed files** — enforced by
  `.github/scripts/coverage-gate.php` via `/check`. `backend/env.php` is the
  only changed source file; every new branch must be exercised.
- **Each commit leaves the repo green.** Tasks are ordered so each is
  independently testable. Pre-commit runs php-cs-fixer + shellcheck + gitleaks
  + RCS/arch checks (not the full suite) — `php vendor/bin/pest` is the
  per-task verification command.
- **ADR-0003 invariants preserved.** "Never overwrite server env" (the
  `isset($_ENV[$key]) || getenv($key) !== false` guard) and "file-absent →
  no-op" are untouched. The hardening only tightens *which* file values are
  accepted and *how* empty values resolve.
- **Commit footers.** `Authored-by: glm-5.2` (planner tier =
  `zai-coding-plan/glm-5.2`), `Tested-by: deepseek-v4-pro` (judge tier =
  `deepseek/deepseek-v4-pro`), `Signed-off-by:` resolved via
  `bash .github/scripts/resolve-identity.sh`. Closing ref `Fixes: #192` on the
  final source commit (Task 3) — or split as noted per task; non-closing tasks
  use `Refs: #192`. Use the canonical `$'...\n...'` ANSI-C quoting form
  (commit-msg hook rejects literal `\n`, ADR-0025).
- **RCS header + vim modeline** already present on `backend/env.php`; the date
  stamp auto-updates on edit — leave it. Do not add explanatory inline comments
  beyond the security rationale already shown in the code blocks below.

## Acceptance criteria (from issue #192)

- [ ] `export FOO=1`, `FOO=1 # note`, and BOM-prefixed lines all parse to clean `FOO=1` — Task 1
- [ ] Empty-string `$_ENV` value falls back to `getenv()` — Task 3
- [ ] Invalid keys are skipped — Task 1
- [ ] Dangerous env names (`LD_PRELOAD`, `BASH_ENV`, etc.) are blocked — Task 2
- [ ] (Implied) `.env.example` documents the supported dialect; ADR-0003 amended — Task 4

## File structure

| File | Change | Task |
| :--- | :--- | :---: |
| `backend/env.php` | `load_env()` parse loop hardened (BOM, export, key validation, inline-comment + quote-aware value parsing); add `is_dangerous_env_name()` predicate; `env_bool()` empty-string fallback | 1, 2, 3 |
| `tests/Unit/LoadEnvTest.php` | New cases: export prefix, BOM, inline comment, `#` in quotes, trailing comment, invalid keys, dangerous-name block, `is_dangerous_env_name` unit assertions; extend `beforeEach`/`afterEach` key lists | 1, 2 |
| `tests/Unit/EnvBoolTest.php` | New case: empty-string `$_ENV` falls back to `getenv()` | 3 |
| `.env.example` | Rewrite the "Rules" comment block to document the dialect | 4 |
| `adr/0003-env-delivery-mechanism.md` | Append `## Amendments` entry recording the hardening | 4 |

---

### Task 1: Harden the `load_env` parse loop (BOM, export, key validation, inline comments)

**Files:**
- Modify: `backend/env.php:48-98` (replace the whole `load_env()` body)
- Test: `tests/Unit/LoadEnvTest.php` (extend `beforeEach`/`afterEach` key lists + add cases)

**Interfaces:**
- Consumes: ADR-0003 (server-precedence guard, file-absent no-op).
- Produces: a validated, BOM/export/comment-clean `$key`/`$value` pair inside
  the loop. Task 2's `is_dangerous_env_name($key)` consumes this cleaned key.

- [ ] **Step 1: Extend the test fixture key lists**

In `tests/Unit/LoadEnvTest.php`, the `beforeEach`/`afterEach` pair currently
manages `APP_DEBUG`, `TEST_KEY`, `QUOTED_KEY`, `EQUALS_KEY`. Add the three new
keys this task introduces:

```php
beforeEach(function () {
    $_ENV['APP_DEBUG'] = null;
    unset($_ENV['APP_DEBUG']);
    putenv('APP_DEBUG');
    putenv('TEST_KEY');
    putenv('QUOTED_KEY');
    putenv('EQUALS_KEY');
    putenv('EXPORT_KEY');
    putenv('COMMENT_KEY');
    putenv('VALID_KEY');
    unset($_ENV['EXPORT_KEY'], $_ENV['COMMENT_KEY'], $_ENV['VALID_KEY']);
});

afterEach(restoreEnvVars(
    'APP_DEBUG',
    'TEST_KEY',
    'QUOTED_KEY',
    'EQUALS_KEY',
    'EXPORT_KEY',
    'COMMENT_KEY',
    'VALID_KEY',
));
```

- [ ] **Step 2: Write the failing tests (Red)**

Append these cases to `tests/Unit/LoadEnvTest.php` (before the vim modeline):

```php
test('load_env strips a leading `export ` shell prefix', function () {
    $path = sys_get_temp_dir() . '/test_env_export.env';
    file_put_contents($path, "export EXPORT_KEY=42\n");

    load_env($path);

    expect($_ENV)->toHaveKey('EXPORT_KEY');
    expect($_ENV['EXPORT_KEY'])->toBe('42');
    expect($_ENV)->not->toHaveKey('export EXPORT_KEY');

    unlink($path);
});

test('load_env strips a leading UTF-8 BOM from the first line', function () {
    $path = sys_get_temp_dir() . '/test_env_bom.env';
    file_put_contents($path, "\xEF\xBB\xBFAPP_DEBUG=true\n");

    load_env($path);

    expect($_ENV)->toHaveKey('APP_DEBUG');
    expect($_ENV['APP_DEBUG'])->toBe('true');

    unlink($path);
});

test('load_env strips an inline `#` comment from an unquoted value', function () {
    $path = sys_get_temp_dir() . '/test_env_inline_comment.env';
    file_put_contents($path, "COMMENT_KEY=hello # a note\n");

    load_env($path);

    expect($_ENV['COMMENT_KEY'])->toBe('hello');

    unlink($path);
});

test('load_env preserves a `#` inside a quoted value', function () {
    $path = sys_get_temp_dir() . '/test_env_hash_in_quotes.env';
    file_put_contents($path, 'COMMENT_KEY="a # b"' . "\n");

    load_env($path);

    expect($_ENV['COMMENT_KEY'])->toBe('a # b');

    unlink($path);
});

test('load_env drops a trailing comment after a closing quote', function () {
    $path = sys_get_temp_dir() . '/test_env_trailing_comment.env';
    file_put_contents($path, 'COMMENT_KEY="value" # trailing' . "\n");

    load_env($path);

    expect($_ENV['COMMENT_KEY'])->toBe('value');

    unlink($path);
});

test('load_env skips lines with invalid key names', function () {
    $path = sys_get_temp_dir() . '/test_env_invalid_key.env';
    file_put_contents($path, "BAD KEY=1\n1LEADING_DIGIT=2\nVALID_KEY=3\n");

    load_env($path);

    expect($_ENV)->not->toHaveKey('BAD KEY');
    expect($_ENV)->not->toHaveKey('1LEADING_DIGIT');
    expect($_ENV['VALID_KEY'])->toBe('3');

    unlink($path);
});
```

- [ ] **Step 3: Run the tests to verify they FAIL**

Run: `php vendor/bin/pest tests/Unit/LoadEnvTest.php`
Expected: the six new tests FAIL — `export EXPORT_KEY` parses to a key named
`export EXPORT_KEY`; the BOM test stores a key whose name starts with the BOM
bytes; inline-comment/hash-in-quote/trailing-comment cases store the comment
text; invalid-key lines are stored verbatim.

- [ ] **Step 4: Implement the hardened parse loop (Green)**

Replace the entire `load_env()` function in `backend/env.php` (currently
lines 48-98) with:

```php
function load_env(string $path): void
{
    if (!is_file($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    if ($lines === false) {
        return;
    }

    // Strip a leading UTF-8 BOM (EF BB BF) so a Windows-saved file does not
    // fold the BOM into the first key name.
    if (isset($lines[0]) && str_starts_with($lines[0], "\xEF\xBB\xBF")) {
        $lines[0] = substr($lines[0], 3);
    }

    foreach ($lines as $line) {
        $line = trim($line);

        if ($line === '' || $line[0] === '#' || $line[0] === ';') {
            continue;
        }

        // Strip an optional `export ` shell prefix (e.g. `export FOO=bar`).
        $line = preg_replace('/^export[ \t]+/', '', $line);

        $pos = strpos($line, '=');

        if ($pos === false) {
            continue;
        }

        $key = trim(substr($line, 0, $pos));

        // Validate the key name: POSIX env identifiers only. Rejects malformed
        // lines and keys carrying whitespace or shell metacharacters.
        if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $key) !== 1) {
            continue;
        }

        $value = parse_env_value(substr($line, $pos + 1));

        // Server env wins — never overwrite an already-set key
        if (isset($_ENV[$key]) || getenv($key) !== false) {
            continue;
        }

        $_ENV[$key] = $value;
        putenv("{$key}={$value}");
    }
}
```

And add the `parse_env_value()` helper immediately above `load_env()` (it is
the single place that handles quoting + inline comments, keeping the loop
readable and unit-testable):

```php
/**
 * Parses a raw `.env` value (the text after the first `=`).
 *
 * Strips an inline `#` comment from unquoted values: a `#` that begins the
 * value or is preceded by whitespace starts a comment (`FOO=1 # note` → `1`;
 * `FOO=a#b` keeps `a#b`). Quoted values are taken literally between the first
 * matching pair of single or double quotes — a `#` inside quotes is preserved,
 * and any text after the closing quote is dropped. Surrounding whitespace on
 * unquoted values is trimmed.
 *
 * @param  string $raw The untrimmed text following the first `=`.
 * @return string      The cleaned value (may be empty).
 */
function parse_env_value(string $raw): string
{
    $value = ltrim($raw);

    if ($value !== '' && ($value[0] === '"' || $value[0] === "'")) {
        $quote = $value[0];
        $close = strpos($value, $quote, 1);

        if ($close === false) {
            return substr($value, 1);
        }

        return substr($value, 1, $close - 1);
    }

    // Unquoted: locate the first `#` that starts the value or follows
    // whitespace. `FOO=a#b` is preserved (no whitespace before the `#`).
    $cut = false;

    if ($value !== '' && $value[0] === '#') {
        $cut = 0;
    } else {
        foreach ([' #', "\t#"] as $marker) {
            $at = strpos($value, $marker);

            if ($at !== false) {
                $cut = $at + 1;
                break;
            }
        }
    }

    if ($cut !== false) {
        $value = substr($value, 0, $cut);
    }

    return rtrim($value);
}
```

- [ ] **Step 5: Run the tests to verify they PASS**

Run: `php vendor/bin/pest tests/Unit/LoadEnvTest.php`
Expected: all cases PASS, including the pre-existing quote/comment/equals
tests (`strips surrounding double quotes`, `strips surrounding single quotes`,
`splits only on first =`, `sets both $_ENV and getenv`).

- [ ] **Step 6: Refactor check (lint clean)**

Run: `php vendor/bin/php-cs-fixer fix --dry-run --diff backend/env.php`
Expected: no diff (PSR-12 clean). If flagged, run without `--dry-run` to fix,
then re-run.

- [ ] **Step 7: Commit**

```bash
git add backend/env.php tests/Unit/LoadEnvTest.php
git commit -S -m $'fix(env): validate keys, strip export/BOM/comments in load_env\n\nThe load_env parse loop performed no key-name validation, folded an export\nprefix and a leading UTF-8 BOM into key names, and stored inline `#`\ncomments inside values. Harden it: strip a leading BOM and an optional\n`export ` prefix; validate keys against /^[A-Za-z_][A-Za-z0-9_]*$/ (invalid\nlines skipped); extract parse_env_value() to strip inline comments from\nunquoted values while preserving `#` inside quotes. Server-env precedence\n(ADR-0003) is unchanged.\n\nRefs: #192\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

### Task 2: Block dangerous child-process env names

**Files:**
- Modify: `backend/env.php` (add `is_dangerous_env_name()`; call it in the loop)
- Test: `tests/Unit/LoadEnvTest.php` (add `LD_PRELOAD` to fixtures + two cases)

**Interfaces:**
- Consumes: the validated `$key` produced by Task 1's loop.
- Produces: `is_dangerous_env_name(string $key): bool` — a predicate over a
  fixed, extensible blocklist.

- [ ] **Step 1: Add `LD_PRELOAD` to the test fixture key lists**

In `tests/Unit/LoadEnvTest.php`, add `LD_PRELOAD` to both the `beforeEach`
clear and the `afterEach(restoreEnvVars(...))` call (it must never leak into
the process between tests):

```php
    putenv('LD_PRELOAD');
    unset($_ENV['LD_PRELOAD']);
```
…inside `beforeEach`, and `'LD_PRELOAD',` appended to the `restoreEnvVars(...)`
argument list.

- [ ] **Step 2: Write the failing tests (Red)**

Append to `tests/Unit/LoadEnvTest.php`:

```php
test('is_dangerous_env_name flags known injection vectors', function () {
    expect(is_dangerous_env_name('LD_PRELOAD'))->toBeTrue();
    expect(is_dangerous_env_name('BASH_ENV'))->toBeTrue();
    expect(is_dangerous_env_name('DYLD_INSERT_LIBRARIES'))->toBeTrue();
    expect(is_dangerous_env_name('ENV'))->toBeTrue();
    expect(is_dangerous_env_name('APP_DEBUG'))->toBeFalse();
    expect(is_dangerous_env_name('DB_HOST'))->toBeFalse();
});

test('load_env refuses to load dangerous env names from a file', function () {
    $path = sys_get_temp_dir() . '/test_env_dangerous.env';
    file_put_contents($path, "LD_PRELOAD=/evil/preload.so\nBASH_ENV=/evil.sh\nAPP_DEBUG=true\n");

    load_env($path);

    expect($_ENV)->not->toHaveKey('LD_PRELOAD');
    expect(getenv('LD_PRELOAD'))->toBeFalse();
    expect($_ENV)->not->toHaveKey('BASH_ENV');
    expect(getenv('BASH_ENV'))->toBeFalse();
    expect(env_bool('APP_DEBUG'))->toBeTrue();

    unlink($path);
});
```

- [ ] **Step 3: Run the tests to verify they FAIL**

Run: `php vendor/bin/pest tests/Unit/LoadEnvTest.php --filter 'is_dangerous_env_name|refuses to load dangerous'`
Expected: FAIL — `is_dangerous_env_name` is undefined, and `LD_PRELOAD` is
currently loaded into `$_ENV`/`getenv`.

- [ ] **Step 4: Implement the blocklist (Green)**

Add `is_dangerous_env_name()` to `backend/env.php` (place it directly above
`load_env()`, after `parse_env_value()`):

```php
/**
 * Reports whether an env var name is dangerous to load from a file.
 *
 * These names yield code execution or library/module hijacking in child
 * processes (dynamic-linker preloads, shell startup files, interpreter
 * options). If a `.env` file is ever attacker-influenced, blocking them
 * prevents a file write from becoming remote code execution. Matched
 * case-sensitively — the real-world vectors use these exact canonical names.
 * The list is deliberately small and extensible.
 *
 * @param  string $key Environment variable name.
 * @return bool        True if the name must never be loaded from a file.
 */
function is_dangerous_env_name(string $key): bool
{
    static $dangerous = [
        'LD_PRELOAD',
        'LD_AUDIT',
        'LD_LIBRARY_PATH',
        'DYLD_INSERT_LIBRARIES',
        'DYLD_LIBRARY_PATH',
        'BASH_ENV',
        'ENV',
        'ZDOTDIR',
        'PERL5OPT',
        'PERL5LIB',
        'IFS',
    ];

    return in_array($key, $dangerous, true);
}
```

Wire it into the loop. In `load_env()`, immediately after the key-validation
`if (preg_match(...) !== 1) { continue; }` block and before
`$value = parse_env_value(...)`, insert:

```php
        // Refuse to load names that execute code in child processes if the
        // file is ever attacker-influenced (issue #192).
        if (is_dangerous_env_name($key)) {
            continue;
        }
```

- [ ] **Step 5: Run the tests to verify they PASS**

Run: `php vendor/bin/pest tests/Unit/LoadEnvTest.php`
Expected: all cases PASS (the two new ones plus Task 1's cases and the
pre-existing suite).

- [ ] **Step 6: Commit**

```bash
git add backend/env.php tests/Unit/LoadEnvTest.php
git commit -S -m $'fix(env): block dangerous child-process env names in load_env\n\nIf a .env file is ever attacker-influenced, names like LD_PRELOAD,\nBASH_ENV, or DYLD_INSERT_LIBRARIES yield code execution in child\nprocesses. Add is_dangerous_env_name() over a fixed, extensible blocklist\nand refuse to load matching keys. Matched case-sensitively against the\ncanonical vector names.\n\nRefs: #192\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

### Task 3: Treat empty-string `$_ENV` as unset in `env_bool`

**Files:**
- Modify: `backend/env.php:20-29` (`env_bool()` body + PHPDoc note)
- Test: `tests/Unit/EnvBoolTest.php` (one new case)

**Interfaces:** None — `env_bool()` is the public accessor; this only changes
its empty-string resolution.

- [ ] **Step 1: Write the failing test (Red)**

Append to `tests/Unit/EnvBoolTest.php` (which already restores `APP_DEBUG` in
its `afterEach(restoreEnvVars('APP_DEBUG', 'UNSET_KEY'))`):

```php
test('env_bool falls back to getenv() when the $_ENV value is an empty string', function () {
    $_ENV['APP_DEBUG'] = '';
    putenv('APP_DEBUG=true');

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeTrue();
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

Run: `php vendor/bin/pest tests/Unit/EnvBoolTest.php --filter 'falls back to getenv'`
Expected: FAIL — `$_ENV[$key] ?? getenv($key)` returns `''` (empty string is
set, so `??` never consults `getenv()`), and `filter_var('')` resolves to the
default `false`, not the server's `true`.

- [ ] **Step 3: Implement the empty-string fallback (Green)**

Replace the `env_bool()` body in `backend/env.php` (currently lines 20-29):

```php
function env_bool(string $key, bool $default = false): bool
{
    $envValue = $_ENV[$key] ?? null;

    // Treat an empty-string $_ENV entry as unset so getenv() is consulted.
    // Without this, a `.env` line like `APP_DEBUG=` (empty) shadows a real
    // server value delivered only via getenv().
    $value = ($envValue === null || $envValue === '')
        ? getenv($key)
        : $envValue;

    if ($value === false || $value === null || $value === '') {
        return $default;
    }

    return filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? $default;
}
```

Update the PHPDoc summary note (line ~14) from:

```php
 * Reads from $_ENV first, falling back to getenv().
```
to:

```php
 * Reads from $_ENV first, falling back to getenv(). An empty-string $_ENV
 * value is treated as unset so it does not shadow a real getenv() value.
```

- [ ] **Step 4: Run the full EnvBoolTest suite to verify PASS (and no regression)**

Run: `php vendor/bin/pest tests/Unit/EnvBoolTest.php`
Expected: all PASS. Note the pre-existing
`env_bool returns false when value is an empty string` case still passes: it
sets `$_ENV['APP_DEBUG'] = ''` and leaves `getenv('APP_DEBUG')` unset (`false`),
so the new code returns the `false` default — same observable result, now via
the `getenv()` fallback.

- [ ] **Step 5: Commit**

```bash
git add backend/env.php tests/Unit/EnvBoolTest.php
git commit -S -m $'fix(env): treat empty-string $_ENV as unset in env_bool\n\nenv_bool read $_ENV[$key] ?? getenv($key), so an empty-string $_ENV\nentry (e.g. a `.env` line `APP_DEBUG=`) shadowed a real server value\ndelivered only via getenv(). Treat null and empty-string $_ENV entries\nas unset so getenv() is consulted. APP_DEBUG display_errors gating is no\nlonger silently flipped by an empty file value.\n\nFixes: #192\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

### Task 4: Document the dialect + amend ADR-0003

**Files:**
- Modify: `.env.example:8-13` (rewrite the "Rules" comment block)
- Modify: `adr/0003-env-delivery-mechanism.md` (append `## Amendments`)

**Interfaces:** None — documentation only. Verified by grep, no unit test.

- [ ] **Step 1: Rewrite the `.env.example` "Rules" block**

In `.env.example`, replace the current comment block (lines 8-13):

```
# Rules:
#   - One KEY=VALUE per line. Split on the first =.
#   - Blank lines and lines starting with # or ; are ignored.
#   - Surrounding single or double quotes are stripped from values.
#   - No variable interpolation, no shell export prefix.
```

with:

```
# Rules:
#   - One KEY=VALUE per line. Split on the first =.
#   - Blank lines and lines starting with # or ; are ignored.
#   - An optional leading `export ` prefix is stripped (export FOO=bar -> FOO).
#   - A leading UTF-8 BOM, if present, is stripped.
#   - Inline `#` comments are stripped from UNQUOTED values
#     (FOO=1 # note -> 1). A # inside quotes is preserved.
#   - Surrounding single or double quotes are stripped from values.
#   - Key names must match /^[A-Za-z_][A-Za-z0-9_]*$/; invalid keys are skipped.
#   - Dangerous names (LD_PRELOAD, BASH_ENV, DYLD_INSERT_LIBRARIES, etc.)
#     are blocked and never loaded from this file.
#   - No variable interpolation.
```

- [ ] **Step 2: Amend ADR-0003**

`adr/0003-env-delivery-mechanism.md` has no `## Amendments` section yet.
Append one at the end of the file (after the "Alternatives Considered" list):

```markdown

## Amendments

- **2026-07-23 (issue #192):** The minimal parser was hardened against
  malformed and dangerous input. Key names are now validated against
  `/^[A-Za-z_][A-Za-z0-9_]*$/`; a leading `export ` prefix and a leading
  UTF-8 BOM are stripped; inline `#` comments are removed from unquoted
  values (preserved inside quotes) via an extracted `parse_env_value()`.
  A fixed blocklist (`is_dangerous_env_name()`) refuses to load names that
  yield code execution in child processes (`LD_PRELOAD`, `BASH_ENV`,
  `DYLD_INSERT_LIBRARIES`, …) so an attacker-influenced `.env` cannot
  become RCE. `env_bool()` now treats an empty-string `$_ENV` entry as
  unset, falling back to `getenv()`, so a file line like `APP_DEBUG=` no
  longer shadows a server-delivered value. The "never overwrite server env"
  decision and the "no variable interpolation" invariant are unchanged; the
  parser still performs no nested expansion.
```

- [ ] **Step 3: Verify the docs read correctly**

Run: `php -r 'echo file_get_contents(".env.example");'` (eyeball the Rules
block) and confirm `adr/0003-*.md` ends with the new `## Amendments` entry.

- [ ] **Step 4: Commit**

```bash
git add .env.example adr/0003-env-delivery-mechanism.md
git commit -S -m $'docs(env): document .env dialect and amend ADR-0003 hardening\n\nRewrite the .env.example Rules block to record export-prefix/BOM stripping,\ninline-comment handling, key validation, and the dangerous-name blocklist.\nAmend ADR-0003 with the issue-#192 hardening, noting the server-precedence\nand no-interpolation invariants are unchanged.\n\nRefs: #192\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

## Verification (after all four tasks)

1. `php vendor/bin/pest tests/Unit/LoadEnvTest.php tests/Unit/EnvBoolTest.php` → all green.
2. Full suite: `php vendor/bin/pest` → green (no regressions in
   `tests/Integration/AuroraConstructorStatusTest.php`, which exercises
   `load_env` + `env_bool` end-to-end).
3. Coverage on the changed source file:
   `php -d pcov.enabled=1 vendor/bin/pest --coverage --min=80 backend/env.php`
   → `backend/env.php` ≥ 80% (every new branch in `parse_env_value` and
   `is_dangerous_env_name` is exercised by the new cases).
4. `/check` (pre-push gate: php-cs-fixer + stylelint + eslint + pest --coverage) → PASS.
5. Grep confirms the new control surface exists:
   `grep -nE 'is_dangerous_env_name|parse_env_value' backend/env.php` → both defined and called.

## Notes

- **Why not route through `@debug`:** the routing matrix maps Security → the
  bug path, but `@from-issue` Step 8 permits writing the fix plan directly
  when the root cause is already known. Issue #192 *is* a completed
  multi-model security review (4/6 consensus) with exact line numbers,
  rationale, a recommended implementation, and four acceptance criteria —
  there is no unknown root cause for `@debug`'s 6-phase loop to discover, and
  the reproduction is deterministic (write a `.env`, observe the parsed key).
  This mirrors the precedent set by issue #183's plan.
- **Blocklist scope is deliberately narrow.** The list targets the highest-
  value child-process code-execution vectors (dynamic-linker preloads, shell
  startup files, Perl options, `IFS`). `PATH` is intentionally *not* blocked
  — it is routinely and legitimately set from a file; blocking it would break
  applications. The list is a `static` array inside `is_dangerous_env_name()`,
  trivially extensible if a follow-up names additional vectors. Matching is
  case-sensitive because the real injection vectors use the canonical casing;
  `APP_ENV` and other legitimately-cased app keys never collide.
- **Inline-comment rule:** a `#` is treated as a comment only when it begins
  the value or is preceded by whitespace (`FOO=1 # note` → `1`). `FOO=a#b` is
  preserved verbatim. This matches widespread dotenv conventions and the
  issue's acceptance example, while keeping the no-interpolation invariant.
- **`parse_env_value` extraction** keeps the quoting/comment edge cases in one
  unit-testable function rather than bloating the loop. It is internal to the
  env module (not part of the documented public surface); `env_bool` and
  `load_env` remain the two intended public entry points from ADR-0003.
