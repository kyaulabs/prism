# Error Flow Audit Remediation (F3 + F6) Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Make `backend/env.php` diagnose operational config faults — unreadable env files and unparseable boolean values — via `error_log`, with zero change to any return value or the never-throws contract.

**Architecture:** Two isolated behaviors in one library file, each with its own red/green cycle and atomic commit: `load_env()` distinguishes absent (silent, intended) from present-but-unreadable (logged), and `env_bool()` logs the unparseable branch only. Existing tests pin return-behavior identity.

**Tech Stack:** PHP 8.5, Pest 5 on PHPUnit 13, prism-tool pest launcher, php-cs-fixer in pre-commit.

## Global constraints

- Zero behavior delta on all return paths (spec Goals 2, D2) — the existing `LoadEnvTest`/`EnvBoolTest` suites must stay green unchanged.
- `load_env()` keeps its never-throws contract; absent-file stays a silent no-op (spec Non-goals).
- No aurora changes; no doc artifacts (spec Non-goals).
- Tests use the repo's closure style (no `$this->` properties — none exist in this suite).
- Commit messages: conventional format, single `-m` with `$'...\n...'`, footers `Authored-by` → `Implemented-by` → `Tested-by` → `Signed-off-by` (resolved via `packages/prism-core/scripts/resolve-identity.sh`). Never let any message token end in `.env` (safety-extension deny floor, ADR-0047 — use "env-file"/"env_bool" phrasing).
- Branch: `fix/kyau-ede6-error-flow-audit-remediation` (exists, spec committed at `c5f3701`).

## Spec deviations

1. **Spec D4 #2 (directory-path test) is dropped.** `is_file()` returns `false` for directories, so a directory path returns at the absent-branch before reaching `file()` — the test cannot reach the `file() === false` branch. The `file() === false` `error_log` (D1) stays as defensive code, covered by inspection only; the `is_readable()` branch — the audit's actual scenario ("wrong owner after a deploy") — gets the full test, now also carrying the no-warning-leak trap.

---

### Task 1: F3 — `load_env()` logs unreadable env files

**Files:**
- Modify: `backend/env.php:156-163` (fault returns), `backend/env.php:151-152` (`@note` docblock)
- Test: `tests/Unit/LoadEnvTest.php` (append before vim modeline)

**Interfaces:**
- Consumes: existing `load_env(string $path): void`, `env_bool(string $key, bool $default = false): bool`, `restoreEnvVars(...)` from `tests/Pest.php`.
- Produces: two new `error_log` diagnostics: `load_env: {path} exists but is not readable; using defaults` and `load_env: failed to read {path}; using defaults`. Later tasks rely on no change to function signatures.

- [x] **Step 1: Write the failing test** — append to `tests/Unit/LoadEnvTest.php`:

```php
test('load_env logs an unreadable env file and keeps defaults', function () {
    $path = sys_get_temp_dir() . '/unreadable_' . uniqid() . '.env';
    file_put_contents($path, "APP_DEBUG=true\n");
    chmod($path, 0000);

    $logPath = sys_get_temp_dir() . '/errlog_' . uniqid() . '.log';
    $prevLog = ini_get('error_log');
    ini_set('error_log', $logPath);

    $warnings = [];
    set_error_handler(static function (int $no, string $msg) use (&$warnings): bool {
        $warnings[] = $msg;

        return true;
    });

    try {
        load_env($path);

        expect(env_bool('APP_DEBUG'))->toBeFalse();
        expect((string) file_get_contents($logPath))->toContain('is not readable');
        expect((string) file_get_contents($logPath))->toContain($path);
        expect($warnings)->toBe([]);
    } finally {
        restore_error_handler();
        ini_set('error_log', $prevLog);
        @chmod($path, 0644);
        @unlink($path);
        @unlink($logPath);
    }
})->skip(function_exists('posix_geteuid') && posix_geteuid() === 0, 'permission assertions are unreliable when running as root');

test('load_env absent env file stays silent (no log, defaults kept)', function () {
    $path = sys_get_temp_dir() . '/nonexistent_' . uniqid() . '.env';

    $logPath = sys_get_temp_dir() . '/errlog_' . uniqid() . '.log';
    $prevLog = ini_get('error_log');
    ini_set('error_log', $logPath);

    try {
        load_env($path);

        expect(env_bool('APP_DEBUG'))->toBeFalse();
        expect((string) file_get_contents($logPath))->toBe('');
    } finally {
        ini_set('error_log', $prevLog);
        @unlink($logPath);
    }
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node packages/prism-core/scripts/prism-tool.js run pest -- tests/Unit/LoadEnvTest.php`
Expected: FAIL — the unreadable test fails on `$warnings` being non-empty (today `file()` emits `E_WARNING` and returns silently) and on the empty log; the absent-file test passes (pins the current silence).

- [x] **Step 3: Write minimal implementation** — in `backend/env.php`, replace the two silent fault returns:

```php
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    if ($lines === false) {
        return;
    }
```

with:

```php
    if (!is_readable($path)) {
        error_log("load_env: {$path} exists but is not readable; using defaults");

        return;
    }

    $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    if ($lines === false) {
        error_log("load_env: failed to read {$path}; using defaults");

        return;
    }
```

And update the `@note` in the `load_env()` docblock from:

```php
 * @note Never throws — errors (unreadable file, parse failures) are
 *       silently discarded.
```

to:

```php
 * @note Never throws — unreadable files and failed reads are logged via
 *       error_log and defaults are used; absent files stay a silent no-op.
```

- [x] **Step 4: Run test to verify it passes**

Run: `node packages/prism-core/scripts/prism-tool.js run pest -- tests/Unit/LoadEnvTest.php`
Expected: PASS — all existing tests green unchanged, both new tests green (log contains the message and the path; zero warnings leaked).

- [x] **Step 5: Commit**

```bash
git add backend/env.php tests/Unit/LoadEnvTest.php
git commit -S -m $'fix(env): log unreadable env-file reads in load_env\n\nF3 from the error-flow audit: absent env file stays a silent no-op, but a present-unreadable file now logs the path instead of degrading to all-default config indistinguishably.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 2: F6 — `env_bool()` logs unparseable values

**Files:**
- Modify: `backend/env.php:41-45` (tail of `env_bool`), `backend/env.php:17-23` (docblock note)
- Test: `tests/Unit/EnvBoolTest.php` (append before vim modeline)

**Interfaces:**
- Consumes: Task 1's untouched `load_env`, existing `env_bool` semantics (empty-string = unset, `FILTER_VALIDATE_BOOL` coercion).
- Produces: one new diagnostic on the garbage-value branch: `env_bool: cannot parse value "{value}" for {key}; using default {true|false}`. Return values byte-identical to the `?? $default` collapse.

- [x] **Step 1: Write the failing test** — append to `tests/Unit/EnvBoolTest.php`:

```php
test('env_bool logs an unparseable value with key, value, and default', function () {
    $_ENV['APP_DEBUG'] = 'ture';

    $logPath = sys_get_temp_dir() . '/errlog_' . uniqid() . '.log';
    $prevLog = ini_get('error_log');
    ini_set('error_log', $logPath);

    try {
        $result = env_bool('APP_DEBUG');

        expect($result)->toBeFalse();
        expect((string) file_get_contents($logPath))->toContain('env_bool');
        expect((string) file_get_contents($logPath))->toContain('"ture"');
        expect((string) file_get_contents($logPath))->toContain('APP_DEBUG');
        expect((string) file_get_contents($logPath))->toContain('using default false');
    } finally {
        ini_set('error_log', $prevLog);
        @unlink($logPath);
    }
});

test('env_bool unset key stays silent (no log)', function () {
    unset($_ENV['APP_DEBUG']);
    putenv('APP_DEBUG');

    $logPath = sys_get_temp_dir() . '/errlog_' . uniqid() . '.log';
    $prevLog = ini_get('error_log');
    ini_set('error_log', $logPath);

    try {
        expect(env_bool('APP_DEBUG'))->toBeFalse();
        expect((string) file_get_contents($logPath))->toBe('');
    } finally {
        ini_set('error_log', $prevLog);
        @unlink($logPath);
    }
});

test('env_bool empty-string value stays silent (treated as unset)', function () {
    $_ENV['APP_DEBUG'] = '';
    putenv('APP_DEBUG');

    $logPath = sys_get_temp_dir() . '/errlog_' . uniqid() . '.log';
    $prevLog = ini_get('error_log');
    ini_set('error_log', $logPath);

    try {
        expect(env_bool('APP_DEBUG'))->toBeFalse();
        expect((string) file_get_contents($logPath))->toBe('');
    } finally {
        ini_set('error_log', $prevLog);
        @unlink($logPath);
    }
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node packages/prism-core/scripts/prism-tool.js run pest -- tests/Unit/EnvBoolTest.php`
Expected: FAIL — the unparseable test fails on the empty log; both silence tests pass (pin current behavior).

- [x] **Step 3: Write minimal implementation** — in `backend/env.php`, replace:

```php
    return filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? $default;
```

with:

```php
    $parsed = filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);

    if ($parsed === null) {
        error_log(sprintf(
            'env_bool: cannot parse value "%s" for %s; using default %s',
            $value,
            $key,
            $default ? 'true' : 'false'
        ));

        return $default;
    }

    return $parsed;
```

And add to the `env_bool()` docblock description (after the "empty-string $_ENV value is treated as unset" sentence):

```php
 * An unparseable (present-but-garbage) value is logged via error_log before
 * the default is returned.
```

- [x] **Step 4: Run test to verify it passes**

Run: `node packages/prism-core/scripts/prism-tool.js run pest -- tests/Unit/EnvBoolTest.php`
Expected: PASS — all 14 existing tests green unchanged, all 3 new tests green.

- [x] **Step 5: Commit**

```bash
git add backend/env.php tests/Unit/EnvBoolTest.php
git commit -S -m $'fix(env): log unparseable env_bool values\n\nF6 from the error-flow audit: a typo\'d value now logs key, value, and chosen default; return semantics are unchanged and unset/empty stay silent.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

## Verification (after both tasks)

1. `node packages/prism-core/scripts/prism-tool.js run pest -- tests/Unit/LoadEnvTest.php tests/Unit/EnvBoolTest.php` — both files green.
2. Full suite with gate: `node packages/prism-core/scripts/prism-tool.js run pest -- --coverage --min=80`.
3. `/check-php` (php-cs-fixer + stylelint + eslint + coverage gate).
4. `code-review` on the staged diff before push.
