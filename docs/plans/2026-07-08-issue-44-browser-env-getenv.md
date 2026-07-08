# Browser Env `getenv()` Fix — Issue #44 Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Replace `$_ENV['PEST_BROWSER_BASE_URL']` with `getenv()` in browser tests for `variables_order`-independent env resolution, and add a curl-based server readiness check in CI before Pest runs.

**Architecture:** Extract a `browser_base_url()` helper function into `tests/Pest.php` (the idiomatic Pest location for test helpers) so the env resolution logic is unit-testable. Write unit tests proving `getenv()` override works and fallback is correct. Update `tests/Browser/SmokeTest.php` to call the helper. Add a `timeout` + `curl -sf` readiness loop (≤10s) to the CI workflow after `php -S` starts.

**Tech Stack:** PHP 8.5+ (Pest v4), GitHub Actions YAML, curl.

## Global constraints

- PHP 8.5+ (typed return types, `declare(strict_types=1)`)
- No dependencies added — Pest v4 already in `composer.json`
- RCS headers follow `rcs-header` skill: `# $KYAULabs: <filename> kyau@nova 2026/07/08 -0700 Exp $`
- Vim modeline on every new or modified source file (per `rcs-header` skill)
- Tests run via Pest: `php vendor/bin/pest`
- Exclude `aurora/` submodule — it is a separate repo; companion issue to be filed separately
- Commit footers: `Plan-by: glm-5.2`, `Acked-by: deepseek-v4-pro`, `Signed-off-by: kyau <[EMAIL]>`

---

### Task 1: Add `browser_base_url()` helper + unit tests + update SmokeTest

**Files:**
- Create: `tests/Unit/BrowserBaseUrlTest.php`
- Modify: `tests/Pest.php:47-50` (Functions section — uncomment and add function)
- Modify: `tests/Browser/SmokeTest.php:7-13` (replace `$_ENV` with `browser_base_url()`)

**Interfaces:**
- Produces: `browser_base_url(): string` — a global Pest helper function available to all test suites. Returns `getenv('PEST_BROWSER_BASE_URL') ?: 'http://localhost:8080'`.

- [ ] **Step 1: Write the failing test (Red)**

Create `tests/Unit/BrowserBaseUrlTest.php`:

```php
<?php

declare(strict_types=1);

# $KYAULabs: BrowserBaseUrlTest.php kyau@nova 2026/07/08 -0700 Exp $

test('browser_base_url returns getenv value when env var is set', function () {
    putenv('PEST_BROWSER_BASE_URL=http://test.example.com:9999');

    expect(browser_base_url())->toBe('http://test.example.com:9999');

    putenv('PEST_BROWSER_BASE_URL');
});

test('browser_base_url falls back to localhost when env var is unset', function () {
    putenv('PEST_BROWSER_BASE_URL');

    expect(browser_base_url())->toBe('http://localhost:8080');
});

test('browser_base_url falls back to localhost when env var is empty string', function () {
    putenv('PEST_BROWSER_BASE_URL=');

    expect(browser_base_url())->toBe('http://localhost:8080');

    putenv('PEST_BROWSER_BASE_URL');
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails (Red)**

```bash
php vendor/bin/pest tests/Unit/BrowserBaseUrlTest.php
```

Expected: **FAIL** — `Error: Call to undefined function browser_base_url()`.

- [ ] **Step 3: Add `browser_base_url()` function to Pest.php (Green)**

In `tests/Pest.php`, replace the commented-out Functions section (lines 47–50):

```php
// function something()
// {
//     // ..
// }
```

with:

```php
function browser_base_url(): string
{
    return getenv('PEST_BROWSER_BASE_URL') ?: 'http://localhost:8080';
}
```

- [ ] **Step 4: Run test to verify it passes (Green)**

```bash
php vendor/bin/pest tests/Unit/BrowserBaseUrlTest.php
```

Expected: **PASS** — 3 tests, 3 assertions.

- [ ] **Step 5: Update SmokeTest.php to use `browser_base_url()` (Refactor)**

In `tests/Browser/SmokeTest.php`, replace the entire file content with:

```php
<?php

declare(strict_types=1);

# $KYAULabs: SmokeTest.php kyau@nova 2026/07/08 -0700 Exp $

test('smoke test verifies browser testing infrastructure works', function () {
    visit(browser_base_url() . '/smoke.html')
        ->assertSee('Smoke Test')
        ->assertSee('Browser testing infrastructure is working.');
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

Key changes:
- Removed `$baseUrl = $_ENV['PEST_BROWSER_BASE_URL'] ?? 'http://localhost:8080';` (line 7)
- Removed `use ($baseUrl)` from the test closure
- Call `browser_base_url()` inline in the `visit()` call

- [ ] **Step 6: Run full Pest suite to verify no regressions**

```bash
php vendor/bin/pest --coverage --min=80
```

Expected: **PASS** — all tests green, coverage ≥ 80%.

- [ ] **Step 7: Commit**

```bash
git add tests/Unit/BrowserBaseUrlTest.php tests/Pest.php tests/Browser/SmokeTest.php
git commit -S -m "fix(browser): use getenv() for PEST_BROWSER_BASE_URL resolution

Replaces \$_ENV['PEST_BROWSER_BASE_URL'] with getenv() in browser
tests. \$_ENV is subject to variables_order (may exclude E),
masking whether the CI env override works at all. getenv() always
reads from the process environment regardless of variables_order.

Extracts browser_base_url() helper into tests/Pest.php for
unit testability. Adds 3 unit tests covering getenv override,
unset fallback, and empty-string fallback.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <[EMAIL]>"
```

---

### Task 2: Add CI server readiness check

**Files:**
- Modify: `.github/workflows/ci.yml:91-95` (add curl readiness loop after server start)

**Interfaces:**
- No interface contracts — pure CI YAML change. No consumed or produced types.

- [ ] **Step 1: Add readiness check to CI workflow**

In `.github/workflows/ci.yml`, replace the "Start PHP dev server" step (lines 91–95):

```yaml
      - name: Start PHP dev server
        if: hashFiles('tests/Browser/**/*.php') != ''
        run: |
          php -S localhost:8080 -t tests/Browser/fixtures/ > /dev/null 2>&1 &
          echo "PHP_SERVER_PID=$!" >> $GITHUB_ENV
```

with:

```yaml
      - name: Start PHP dev server
        if: hashFiles('tests/Browser/**/*.php') != ''
        run: |
          php -S localhost:8080 -t tests/Browser/fixtures/ > /dev/null 2>&1 &
          echo "PHP_SERVER_PID=$!" >> $GITHUB_ENV
          timeout 10 bash -c 'until curl -sf http://localhost:8080/smoke.html > /dev/null 2>&1; do sleep 0.5; done'
```

The new line (`timeout 10 bash -c '...'`) polls `/smoke.html` every 0.5s until it returns HTTP 200, or fails the step after 10s.

- [ ] **Step 2: Verify YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML OK"
```

Expected: `YAML OK` — no parse errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -S -m "ci(browser): add server readiness check before Pest run

Adds a curl-based readiness loop (≤10s) after php -S starts,
polling /smoke.html for HTTP 200 before Pest runs. Prevents
race condition where browser tests execute before the dev
server is ready to accept connections.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <[EMAIL]>"
```

---

### Verification

After both tasks are committed:

- [ ] `verification-before-completion`: re-run `php vendor/bin/pest --coverage --min=80` — all green, coverage ≥ 80%
- [ ] `/check` (php-cs-fixer + stylelint + eslint + pest --coverage 80% + shell tests)
- [ ] `@code-review` on the feature branch
- [ ] File companion issue against `kyaulabs/aurora`:

```bash
gh issue create --repo kyaulabs/aurora \
  --title "Browser test env via getenv(); add CI server readiness wait" \
  --body "Companion to kyaulabs/template#44. Aurora's tests/Browser/SmokeTest.php
  uses \$_ENV['PEST_BROWSER_BASE_URL'] (subject to variables_order) and CI
  starts php -S with no readiness check. Apply same fix: getenv() + curl
  readiness loop."
```
