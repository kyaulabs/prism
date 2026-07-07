# Env Delivery Mechanism — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Implement `load_env()` to parse `.env` files at page bootstrap,
making `env_bool('APP_DEBUG')` functional as documented.

**Architecture:** A single new function `load_env(string $path): void` added
to `backend/env.php`, called explicitly by page templates. Parser reads
line-by-line, splits on first `=`, trims, strips quotes, skips comments, and
never overwrites pre-existing `$_ENV` or `getenv()` values. `env_bool()` is
unchanged.

**Tech Stack:** PHP 8.5+, Pest v4, no dependencies.

## Global constraints

- PHP 8.5+ with `declare(strict_types=1)` on all class/function files
- PSR-12 indentation (4-space); PHP files end with `// vim: ft=php sts=4 sw=4 ts=4 et :`
- RCS header on every source file (`# $KYAULabs: filename.php creator@host YYYY/MM/DD ±TZ Exp $`)
- No explanatory inline comments; PHPDoc for new functions per PSR-5
- 80% line coverage on changed files minimum
- All tests in pestphp/pest v4 with `expect()` assertions
- Precedence: `$_ENV` AND `getenv()` checked before overwriting

---

### Task 1: load_env() — Red → Green → Refactor

**Files:**
- Create: `tests/Unit/LoadEnvTest.php`
- Modify: `backend/env.php` (add function after line 29, before vim modeline)

**Interfaces:**
- Produces: `load_env(string $path): void` — parses `.env` file at `$path`,
  populates `$_ENV` and `putenv()`. Silently skips if file absent. Never
  overwrites an already-set key (checks both `$_ENV` and `getenv()`).
- Consumes: `env_bool()` (already exists, unchanged) and `putenv()`/`sys_get_temp_dir()` (stdlib).

- [ ] **Step 1: Write the failing test file**

Create `tests/Unit/LoadEnvTest.php`:

```php
<?php

declare(strict_types=1);

# $KYAULabs: LoadEnvTest.php kyau@nova 2026/07/06 -0700 Exp $

require_once __DIR__ . '/../../backend/env.php';

beforeEach(function () {
    $_ENV['APP_DEBUG'] = null;
    unset($_ENV['APP_DEBUG']);
    putenv('APP_DEBUG');
    putenv('TEST_KEY');
    putenv('QUOTED_KEY');
    putenv('EQUALS_KEY');
});

test('load_env parses .env with APP_DEBUG=true and env_bool returns true', function () {
    $path = sys_get_temp_dir() . '/test_env_true.env';
    file_put_contents($path, "APP_DEBUG=true\n");

    load_env($path);

    expect(env_bool('APP_DEBUG'))->toBeTrue();

    unlink($path);
    putenv('APP_DEBUG');
});

test('load_env parses .env with APP_DEBUG=false and env_bool returns false', function () {
    $path = sys_get_temp_dir() . '/test_env_false.env';
    file_put_contents($path, "APP_DEBUG=false\n");

    load_env($path);

    expect(env_bool('APP_DEBUG'))->toBeFalse();

    unlink($path);
    putenv('APP_DEBUG');
});

test('load_env with file absent does not change env_bool default', function () {
    $path = sys_get_temp_dir() . '/nonexistent.env';

    load_env($path);

    expect(env_bool('APP_DEBUG'))->toBeFalse();
});

test('load_env does not overwrite pre-set $_ENV key', function () {
    $_ENV['TEST_KEY'] = 'server_value';

    $path = sys_get_temp_dir() . '/test_env_precedence.env';
    file_put_contents($path, "TEST_KEY=file_value\n");

    load_env($path);

    expect($_ENV['TEST_KEY'])->toBe('server_value');

    unlink($path);
    unset($_ENV['TEST_KEY']);
    putenv('TEST_KEY');
});

test('load_env does not overwrite pre-set getenv key when $_ENV is not set', function () {
    unset($_ENV['TEST_KEY']);
    putenv('TEST_KEY=server_value');

    $path = sys_get_temp_dir() . '/test_env_getenv_precedence.env';
    file_put_contents($path, "TEST_KEY=file_value\n");

    load_env($path);

    expect(getenv('TEST_KEY'))->toBe('server_value');

    unlink($path);
    putenv('TEST_KEY');
});

test('load_env skips comment lines starting with #', function () {
    $path = sys_get_temp_dir() . '/test_env_hash_comment.env';
    file_put_contents($path, "# this is a comment\nAPP_DEBUG=true\n");

    load_env($path);

    expect(env_bool('APP_DEBUG'))->toBeTrue();

    unlink($path);
    putenv('APP_DEBUG');
});

test('load_env skips comment lines starting with ;', function () {
    $path = sys_get_temp_dir() . '/test_env_semicolon_comment.env';
    file_put_contents($path, "; this is a comment\nAPP_DEBUG=true\n");

    load_env($path);

    expect(env_bool('APP_DEBUG'))->toBeTrue();

    unlink($path);
    putenv('APP_DEBUG');
});

test('load_env skips blank lines', function () {
    $path = sys_get_temp_dir() . '/test_env_blank_lines.env';
    file_put_contents($path, "\n\nAPP_DEBUG=true\n\n");

    load_env($path);

    expect(env_bool('APP_DEBUG'))->toBeTrue();

    unlink($path);
    putenv('APP_DEBUG');
});

test('load_env strips surrounding double quotes from value', function () {
    $path = sys_get_temp_dir() . '/test_env_quoted.env';
    file_put_contents($path, 'QUOTED_KEY="value with spaces"' . "\n");

    load_env($path);

    expect($_ENV['QUOTED_KEY'])->toBe('value with spaces');

    unlink($path);
    unset($_ENV['QUOTED_KEY']);
    putenv('QUOTED_KEY');
});

test('load_env strips surrounding single quotes from value', function () {
    $path = sys_get_temp_dir() . '/test_env_single_quoted.env';
    file_put_contents($path, "QUOTED_KEY='single quoted'" . "\n");

    load_env($path);

    expect($_ENV['QUOTED_KEY'])->toBe('single quoted');

    unlink($path);
    unset($_ENV['QUOTED_KEY']);
    putenv('QUOTED_KEY');
});

test('load_env splits only on first = in line', function () {
    $path = sys_get_temp_dir() . '/test_env_equals_split.env';
    file_put_contents($path, "EQUALS_KEY=value=with=equals\n");

    load_env($path);

    expect($_ENV['EQUALS_KEY'])->toBe('value=with=equals');

    unlink($path);
    unset($_ENV['EQUALS_KEY']);
    putenv('EQUALS_KEY');
});

test('load_env sets both $_ENV and getenv for each key', function () {
    $path = sys_get_temp_dir() . '/test_env_dual_population.env';
    file_put_contents($path, "APP_DEBUG=true\n");

    load_env($path);

    expect($_ENV['APP_DEBUG'])->toBe('true');
    expect(getenv('APP_DEBUG'))->toBe('true');

    unlink($path);
    putenv('APP_DEBUG');
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails (Red)**

```bash
php vendor/bin/pest tests/Unit/LoadEnvTest.php
```

Expected: all 13 tests fail with `Call to undefined function load_env()`.

- [ ] **Step 3: Write minimal implementation in backend/env.php**

Insert this code after line 29 (after `env_bool()` closing brace), before the
vim modeline on line 31:

```php

/**
 * Loads environment variables from a .env file.
 *
 * Parses a file with KEY=VALUE pairs (one per line), skipping blank lines
 * and comment lines (starting with # or ;). Values are trimmed, and
 * surrounding matching single or double quotes are stripped. Keys that
 * already exist in $_ENV or getenv() are never overwritten — server
 * environment variables take priority over file values.
 *
 * If the file does not exist, this function is a silent no-op (production
 * safety: absent .env means debug stays off).
 *
 * @param string $path  Absolute or relative path to the .env file.
 * @return void
 */
function load_env(string $path): void
{
    if (!is_file($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    if ($lines === false) {
        return;
    }

    foreach ($lines as $line) {
        $line = trim($line);

        if ($line === '' || $line[0] === '#' || $line[0] === ';') {
            continue;
        }

        $pos = strpos($line, '=');

        if ($pos === false) {
            continue;
        }

        $key = trim(substr($line, 0, $pos));
        $value = trim(substr($line, $pos + 1));

        if ($key === '') {
            continue;
        }

        // Strip surrounding matching quotes (single or double)
        $len = strlen($value);
        if (
            $len >= 2
            && (($value[0] === '"' && $value[$len - 1] === '"')
                || ($value[0] === "'" && $value[$len - 1] === "'"))
        ) {
            $value = substr($value, 1, -1);
        }

        // Server env wins — never overwrite an already-set key
        if (isset($_ENV[$key]) || getenv($key) !== false) {
            continue;
        }

        $_ENV[$key] = $value;
        putenv("{$key}={$value}");
    }
}
```

**Placement:** after the `env_bool()` function closing brace (line 29), before
the vim modeline (line 31). Do NOT remove or modify `env_bool()`.

- [ ] **Step 4: Run tests to verify they pass (Green)**

```bash
php vendor/bin/pest tests/Unit/LoadEnvTest.php tests/Unit/EnvBoolTest.php
```

Expected: all tests pass (13 new LoadEnvTest + 12 existing EnvBoolTest = 25
passing). The combined run ensures the new function does not break the
existing `env_bool()` contract.

- [ ] **Step 5: Refactor (if needed)**

Review `load_env()` for:
- Indentation: 4-space per PSR-12 ✅
- PHPDoc completeness ✅
- No debug artifacts (`var_dump`, `dd`, `print_r`) ✅
- No unnecessary comments ✅
- `declare(strict_types=1)` already present in file ✅

If clean, proceed to commit.

- [ ] **Step 6: Commit**

```bash
git add tests/Unit/LoadEnvTest.php backend/env.php
git commit -S -m "feat(env): add first-party .env loader via load_env()

Implements ADR 0003. Parses \$_ENV-style files at page bootstrap with
explicit path. Server env vars (both \$_ENV and getenv) take priority
over file values. Absent file is a silent no-op for production safety.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
Closes: #23"
```

---

### Task 2: Update aurora-page skill template

**Files:**
- Modify: `.opencode/skills/aurora-page/SKILL.md` (add `load_env()` call and
  gotchas)

**Interfaces:**
- Consumes: `load_env(string $path): void` from Task 1
- Produces: updated skill doc consumed by aurora-page agents

- [ ] **Step 1: Add load_env() call after the require_once**

Find lines 30-31 in the skill file — the PHP code block after
`require_once(__DIR__ . "/../backend/env.php");` and before the Aurora
constructor. Insert:

```
require_once(__DIR__ . "/../backend/env.php");
load_env(__DIR__ . '/../.env');
```

The updated code block becomes:

```php
$rus = getrusage();
require_once(__DIR__ . "/../aurora/aurora.inc.php");
require_once(__DIR__ . "/../backend/env.php");
load_env(__DIR__ . '/../.env');

$site = new KYAULabs\Aurora(template: "index.html", cdn: "/cdn", status: env_bool('APP_DEBUG'), html: true);
```

- [ ] **Step 2: Add gotcha entry**

In the Gotchas section (after the existing gotchas, before the closing of the
file), add this entry:

```markdown
- *`load_env()` must be called explicitly* — `.env` is not loaded
  automatically. The page template calls `load_env(__DIR__ . '/../.env')`
  after the `require_once` for `backend/env.php`. If debug mode isn't
  activating, verify that: (a) `.env` exists at the expected path, (b)
  `load_env()` is called before `env_bool('APP_DEBUG')`, and (c) the file
  format follows KEY=VALUE with no shell-style `export` prefix.
- *Absent `.env` is silent* — `load_env()` returns void and produces no
  warning if the file is missing. This is by design for production safety.
  If `env_bool('APP_DEBUG')` returns false unexpectedly, check whether `.env`
  exists and is readable.
```

- [ ] **Step 3: Commit**

```bash
git add .opencode/skills/aurora-page/SKILL.md
git commit -S -m "docs(aurora-page): add load_env() call and gotchas to page template

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 3: Update .env.example header

**Files:**
- Modify: `.env.example`

**Interfaces:**
- Consumes: `load_env()` from Task 1
- Produces: updated example consumed by `/setup` and dev onboarding

- [ ] **Step 1: Replace the comment header**

Replace lines 1-3 of `.env.example` (the existing comment block):

```
# Environment variables for <app>
# Copy to .env and fill in values. NEVER commit .env — it is gitignored.
# See AGENTS.md hard boundaries and the security-coding skill.
```

With:

```
# Environment variables for <app>
#
# Loaded by load_env() at page bootstrap if .env is present in the webroot
# directory. Absent or in production — the file is gitignored and load_env()
# silently no-ops, so debug stays off. Server environment variables (FPM
# env[] or real shell env) always win over file values.
#
# Rules:
#   - One KEY=VALUE per line. Split on the first =.
#   - Blank lines and lines starting with # or ; are ignored.
#   - Surrounding single or double quotes are stripped from values.
#   - No variable interpolation, no shell export prefix.
#
# Copy to .env and fill in values. NEVER commit .env — it is gitignored.
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -S -m "docs: update .env.example header with load_env() consumption rules

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 4: Integration smoke test

**Files:**
- Modify: `tests/Integration/AuroraConstructorStatusTest.php`
- Create: (temp `.env` file during test, cleaned up after)

**Interfaces:**
- Consumes: `load_env(string $path): void` and `env_bool()` from Task 1

- [ ] **Step 1: Add integration tests**

Append these tests before the vim modeline (line 65) in
`tests/Integration/AuroraConstructorStatusTest.php`:

```php
test('env_bool returns true after load_env loads APP_DEBUG=true', function () {
    $path = sys_get_temp_dir() . '/test_integration_debug.env';
    file_put_contents($path, "APP_DEBUG=true\n");

    load_env($path);

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeTrue();

    unlink($path);
    putenv('APP_DEBUG');
});

test('env_bool returns false when .env file is absent (prod default)', function () {
    $path = sys_get_temp_dir() . '/definitely_not_a_file.env';

    load_env($path);

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeFalse();
});
```

- [ ] **Step 2: Run integration tests**

```bash
php vendor/bin/pest tests/Integration/AuroraConstructorStatusTest.php
```

Expected: all 3 tests pass (1 existing + 2 new).

- [ ] **Step 3: Commit**

```bash
git add tests/Integration/AuroraConstructorStatusTest.php
git commit -S -m "test(env): add integration smoke tests for load_env + env_bool

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 5: Accept ADR 0003 and update CONTEXT.md

**Files:**
- Modify: `adr/0003-env-delivery-mechanism.md` (status: Proposed → Accepted)
- Modify: `CONTEXT.md` (add ADR 0003 to Architectural Decisions)

- [ ] **Step 1: Accept the ADR**

In `adr/0003-env-delivery-mechanism.md`, change:

```
## Status

Proposed
```

To:

```
## Status

Accepted
```

- [ ] **Step 2: Add ADR to CONTEXT.md**

In `CONTEXT.md`, add under "Architectural Decisions" (after the existing
placeholder line):

```markdown
- `adr/0003-env-delivery-mechanism.md` — First-party .env loader with explicit call pattern, no dependencies, server env precedence
```

- [ ] **Step 3: Commit**

```bash
git add adr/0003-env-delivery-mechanism.md CONTEXT.md
git commit -S -m "docs: accept ADR 0003 and register in CONTEXT.md

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 6: Verification — /check + @code-review

- [ ] **Step 1: Run /check gate**

```bash
php -d pcov.enabled=1 vendor/bin/pest --coverage
```

Expected: ≥80% line coverage on `backend/env.php`, all tests pass.

- [ ] **Step 2: Run php-cs-fixer**

```bash
php vendor/bin/php-cs-fixer fix --dry-run --diff
```

Fix any violations if reported.

- [ ] **Step 3: Dispatch @code-review**

```bash
# Dispatch the @code-review agent on staged changes
```

After @code-review passes, the issue is ready to close.
