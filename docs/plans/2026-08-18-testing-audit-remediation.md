# Testing Audit Remediation Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Remediate the 2026-08-16 external testing audit: skip guards for
dep-dependent shell tests, temp-file/env test hygiene, dead-config removal,
honest coverage labeling, composer test entry points with CI parity, and two
gap tests.

**Architecture:** All changes are in test infrastructure (`tests/`, shell
helpers) plus three config files (`phpunit.xml`, `composer.json`,
`ci.yml`). No production code changes. One new runner script
(`tests/Shell/run-all.sh`) becomes the single source of truth for the shell
suite, invoked by both composer and CI.

**Tech Stack:** Bash (shell tests + helpers), Pest 5 (PHP unit tests),
composer scripts, GitHub Actions.

## Global constraints

- Spec: `docs/specs/2026-08-18-testing-audit-remediation-spec.md` (approved 2026-08-18).
- Branch: `fix/kyau-07d7-testing-audit-remediation` (already created; work in progress: spec commit `9d280a2` present).
- RCS headers + vim modelines are hook-normalized (ADR-0041): new source files
  (`.sh`, `.php`) include the vim modeline as the last line; the pre-commit
  hook inserts/refreshes the `$KYAULabs:` header. Never hand-edit headers.
- No new dependencies. No production code changes (`backend/`, `packages/`,
  `.github/hooks/` logic untouched).
- Finding 3 (Browser E2E) is out of scope — deferred until real pages exist.
- Commit footers in pipeline order: `Authored-by: deepseek-v4-flash`,
  `Implemented-by: deepseek-v4-flash`, `Tested-by: deepseek-v4-flash`,
  `Signed-off-by:` resolved via
  `bash packages/prism-core/scripts/resolve-identity.sh`.
- Signed commits (`git commit -S`). Commit messages use the canonical
  `$'...\n...'` ANSI-C quoting form.

---

### Task 1: `skip()` in counter_helpers + guards in the two validator-based tests

**Files:**
- Modify: `tests/Shell/lib/counter_helpers.sh` (add `skip()`)
- Modify: `tests/Shell/check_skill_frontmatter_test.sh` (guard after `source counter_helpers.sh`)
- Modify: `tests/Shell/validate-harness_test.sh` (guard after `source counter_helpers.sh`)

**Interfaces:**
- Consumes: existing `pass`/`fail` in counter_helpers.
- Produces: `skip <msg>` in counter_helpers (prints SKIP to stderr, does not
  exit — guard sites follow with `exit 0`). No SKIP counter, no summary
  changes (guards exit before summaries print).

- [ ] **Step 1: Reproduce Red — hide js-yaml, watch both tests FAIL**

```bash
cd /home/kyau/projects/kyaulabs/prism
mv node_modules/js-yaml /tmp/js-yaml.bak
bash tests/Shell/check_skill_frontmatter_test.sh; echo "rc=$?"
bash tests/Shell/validate-harness_test.sh; echo "rc=$?"
mv /tmp/js-yaml.bak node_modules/js-yaml
```

Expected: both FAIL (validator cannot parse frontmatter without js-yaml).
This is the bug: a fresh clone without `node_modules/` produces false
negatives instead of skips.

- [ ] **Step 2: Add `skip()` to counter_helpers**

Edit `tests/Shell/lib/counter_helpers.sh` — add after the `fail()` function:

```bash
skip() { printf '  SKIP %s\n' "$*" >&2; }
```

Also update the "Provides:" list in the file's header comment block to add
`- skip <msg>: print '  SKIP <msg>' to stderr` (mirroring the pass/fail
lines above it).

- [ ] **Step 3: Add prerequisite guards to both tests**

In `tests/Shell/check_skill_frontmatter_test.sh`, immediately after
`source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"`:

```bash
if ! command -v node >/dev/null 2>&1 || ! command -v pi >/dev/null 2>&1 \
	|| ! node -e "require('js-yaml')" 2>/dev/null; then
	skip "node + pi + js-yaml required (run: pnpm install)"
	exit 0
fi
```

In `tests/Shell/validate-harness_test.sh`, immediately after
`source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"`, insert the
identical block above. (These mirror `validate-harness.sh`'s own hard
prerequisites: Bash 4+, node, pi.)

- [ ] **Step 4: Green with deps present**

```bash
bash tests/Shell/check_skill_frontmatter_test.sh
bash tests/Shell/validate-harness_test.sh
```

Expected: both PASS (6 passed / 11 passed), rc=0.

- [ ] **Step 5: Verify SKIP path (hide js-yaml again)**

```bash
mv node_modules/js-yaml /tmp/js-yaml.bak
bash tests/Shell/check_skill_frontmatter_test.sh; echo "rc=$?"
bash tests/Shell/validate-harness_test.sh; echo "rc=$?"
mv /tmp/js-yaml.bak node_modules/js-yaml
```

Expected: each prints `  SKIP node + pi + js-yaml required (run: pnpm install)` and rc=0.

- [ ] **Step 6: Commit**

```bash
git add tests/Shell/lib/counter_helpers.sh tests/Shell/check_skill_frontmatter_test.sh tests/Shell/validate-harness_test.sh
git commit -S -m $'test(shell): skip validator-dependent tests when prerequisites missing\n\nThe two counter-style tests invoke validate-harness.sh, which hard-exits\nwithout node, pi, and js-yaml. A fresh clone without node_modules/ now\nSKIPs these instead of failing; counter_helpers gains a skip() mirroring\ntest_helpers.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 2: Skip guard for `check_resolution_test.sh`

**Files:**
- Modify: `tests/Shell/check_resolution_test.sh` (guard after `setup_result_file`, before the `HOOK=` assignment)

**Interfaces:**
- Consumes: `skip()` from `test_helpers.sh` (already sourced) and `$REPO_ROOT`.
- Produces: nothing — guard exits 0 when `vendor/bin/php-cs-fixer` is absent.

- [ ] **Step 1: Reproduce Red — hide php-cs-fixer**

```bash
cd /home/kyau/projects/kyaulabs/prism
mv vendor/bin/php-cs-fixer /tmp/php-cs-fixer.bak
bash tests/Shell/check_resolution_test.sh; echo "rc=$?"
mv /tmp/php-cs-fixer.bak vendor/bin/php-cs-fixer
```

Expected: FAIL ("output missing '→ php-cs-fixer'") — the fake prism-tool
delegates to the fixture's symlinked `vendor/bin/php-cs-fixer`, which is
gone. This is the audit-reproduced false negative.

- [ ] **Step 2: Add the guard**

Insert after `setup_result_file` and before `HOOK="$REPO_ROOT/.github/hooks/pre-commit"`:

```bash
if [ ! -x "$REPO_ROOT/vendor/bin/php-cs-fixer" ]; then
	skip "php-cs-fixer not installed (run: composer install)"
	exit 0
fi
```

- [ ] **Step 3: Green with deps present**

```bash
bash tests/Shell/check_resolution_test.sh
```

Expected: PASS, rc=0.

- [ ] **Step 4: Verify SKIP path**

```bash
mv vendor/bin/php-cs-fixer /tmp/php-cs-fixer.bak
bash tests/Shell/check_resolution_test.sh; echo "rc=$?"
mv /tmp/php-cs-fixer.bak vendor/bin/php-cs-fixer
```

Expected: `  SKIP php-cs-fixer not installed (run: composer install)`, rc=0.

- [ ] **Step 5: Commit**

```bash
git add tests/Shell/check_resolution_test.sh
git commit -S -m $'test(shell): skip hook CS tests when php-cs-fixer missing\n\nThe pre-commit hook silently no-ops without vendor/bin/php-cs-fixer, so the\nresolution assertions fail on a fresh clone. Guard SKIPs instead.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 3: Skip guard for `frontmatter_parser_stdin_test.sh`

**Files:**
- Modify: `tests/Shell/frontmatter_parser_stdin_test.sh` (guard after `setup_result_file`, before `P="$REPO_ROOT/..."`)

**Interfaces:**
- Consumes: `skip()` from `test_helpers.sh`, `$REPO_ROOT`.
- Produces: nothing — guard exits 0 when node + js-yaml are absent.

- [ ] **Step 1: Reproduce Red — hide js-yaml**

```bash
cd /home/kyau/projects/kyaulabs/prism
mv node_modules/js-yaml /tmp/js-yaml.bak
bash tests/Shell/frontmatter_parser_stdin_test.sh; echo "rc=$?"
mv /tmp/js-yaml.bak node_modules/js-yaml
```

Expected: FAIL with `MODULE_NOT_FOUND` (frontmatter-parser.js requires
js-yaml) — the audit-reproduced false negative.

- [ ] **Step 2: Add the guard**

Insert after `setup_result_file` and before `P="$REPO_ROOT/packages/prism-core/scripts/frontmatter-parser.js"`:

```bash
if ! command -v node >/dev/null 2>&1 || ! node -e "require('js-yaml')" 2>/dev/null; then
	skip "node + js-yaml required (run: pnpm install)"
	exit 0
fi
```

- [ ] **Step 3: Green with deps present**

```bash
bash tests/Shell/frontmatter_parser_stdin_test.sh
```

Expected: PASS (5 assertions), rc=0.

- [ ] **Step 4: Verify SKIP path**

```bash
mv node_modules/js-yaml /tmp/js-yaml.bak
bash tests/Shell/frontmatter_parser_stdin_test.sh; echo "rc=$?"
mv /tmp/js-yaml.bak node_modules/js-yaml
```

Expected: `  SKIP node + js-yaml required (run: pnpm install)`, rc=0.

- [ ] **Step 5: Commit**

```bash
git add tests/Shell/frontmatter_parser_stdin_test.sh
git commit -S -m $'test(shell): skip frontmatter parser tests when js-yaml missing\n\nfrontmatter-parser.js requires js-yaml; without node_modules/ the stdin\nmode dies with MODULE_NOT_FOUND. Guard SKIPs instead.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 4: Unique temp env fixtures in `LoadEnvTest.php`

**Files:**
- Modify: `tests/Unit/LoadEnvTest.php` (452 lines; 19 fixed-path sites)

**Interfaces:**
- Consumes: existing `load_env()` / `env_bool()` from `backend/env.php`.
- Produces: file-local `env_fixture(string $contents): string` helper —
  returns a unique temp path; caller unlinks it.

- [ ] **Step 1: Add the `env_fixture()` helper**

After the `require_once`/`beforeEach` block at the top of the file, add:

```php
/**
 * Write $contents to a unique temp file for load_env() fixtures.
 *
 * tempnam() guarantees a fresh path per call, so parallel Pest workers and
 * concurrent checkouts never collide. The caller must unlink() the returned
 * path (tests wrap their body in try/finally).
 *
 * @param  string $contents  .env file contents.
 * @return string            Path to the created temp file.
 */
function env_fixture(string $contents): string
{
    $path = tempnam(sys_get_temp_dir(), 'prism_env_');
    file_put_contents($path, $contents);

    return $path;
}
```

- [ ] **Step 2: Convert all 19 fixed-path sites (mechanical transform)**

For each site below, replace the line
`$path = sys_get_temp_dir() . '/test_env_XXX.env';` with
`$path = env_fixture("...");` (same string literal as today's
`file_put_contents` call, which is then deleted), and wrap the statements
between the fixture creation and `unlink($path);` in `try { ... } finally {
unlink($path); }`.

Worked example — site 1 (`test_env_true.env`, line 74):

Before:

```php
test('load_env parses .env with APP_DEBUG=true and env_bool returns true', function () {
    $path = sys_get_temp_dir() . '/test_env_true.env';
    file_put_contents($path, "APP_DEBUG=true\n");

    load_env($path);

    expect(env_bool('APP_DEBUG'))->toBeTrue();

    unlink($path);
});
```

After:

```php
test('load_env parses .env with APP_DEBUG=true and env_bool returns true', function () {
    $path = env_fixture("APP_DEBUG=true\n");

    try {
        load_env($path);

        expect(env_bool('APP_DEBUG'))->toBeTrue();
    } finally {
        unlink($path);
    }
});
```

Worked example — dangerous-name site (`test_env_dangerous.env`, line 290):

```php
test('load_env refuses to load dangerous env names from a file', function () {
    $path = env_fixture("LD_PRELOAD=/tmp/x.so\n");

    try {
        load_env($path);

        expect(env_bool('APP_DEBUG'))->toBeFalse();
        expect(getenv('LD_PRELOAD'))->toBeFalse();
    } finally {
        unlink($path);
    }
});
```

Full site list (line numbers from current file; verify each by its test
name — the constant being replaced is in parentheses):

1. L75 `test_env_true.env` — 'load_env parses .env with APP_DEBUG=true…'
2. L86 `test_env_false.env` — '…APP_DEBUG=false…'
3. L107 `test_env_precedence.env` — 'does not overwrite pre-set $_ENV key'
4. L121 `test_env_getenv_precedence.env` — '…pre-set getenv key…'
5. L132 `test_env_hash_comment.env` — 'skips hash comment lines'
6. L143 `test_env_semicolon_comment.env` — 'skips semicolon comment lines'
7. L154 `test_env_blank_lines.env` — 'skips blank lines'
8. L165 `test_env_quoted.env` — 'strips surrounding double quotes'
9. L176 `test_env_single_quoted.env` — 'strips surrounding single quotes'
10. L187 `test_env_equals_split.env` — 'splits only on first ='
11. L198 `test_env_dual_population.env` — 'sets both $_ENV and getenv'
12. L211 `test_env_export.env` — 'strips a leading `export ` prefix'
13. L224 `test_env_bom.env` — 'strips a leading UTF-8 BOM'
14. L236 `test_env_inline_comment.env` — 'strips an inline `#` comment'
15. L247 `test_env_hash_in_quotes.env` — 'preserves a `#` inside a quoted value'
16. L258 `test_env_trailing_comment.env` — 'drops a trailing comment after a closing quote'
17. L269 `test_env_invalid_key.env` — 'skips lines with invalid key names'
18. L291 `test_env_dangerous.env` — 'refuses to load dangerous env names'
19. L308 `test_env_unterminated_quote.env` — 'returns raw value when a quoted value has no closing quote'

Untouched: the nonexistent-path test (L96-103, creates no file) and
`is_dangerous_env_name` (L281, no file).

- [ ] **Step 3: Green — run the unit file**

```bash
cd /home/kyau/projects/kyaulabs/prism
php vendor/bin/pest tests/Unit/LoadEnvTest.php
```

Expected: all 23 tests PASS (assertions unchanged — pure fixture-hygiene
refactor). Also confirm no `sys_get_temp_dir() . '/test_env_` remains:
`grep -c "test_env_.*\.env" tests/Unit/LoadEnvTest.php` → 0.

- [ ] **Step 4: Commit**

```bash
git add tests/Unit/LoadEnvTest.php
git commit -S -m $'test(unit): unique temp env fixtures in LoadEnvTest\n\nFixed /tmp/test_env_*.env names race under parallel workers and leak on\nassertion failure. tempnam() + try/finally unlink per site; the\nnonexistent-path test is untouched.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 5: Pin `env_bool` empty-string fallback against ambient env

**Files:**
- Modify: `tests/Unit/EnvBoolTest.php` (test at line 47)

**Interfaces:**
- Consumes: `env_bool()` from `backend/env.php`.
- Produces: nothing — test-only change.

- [ ] **Step 1: Write the fix**

The test at line 47 (`'env_bool returns false when value is an empty string'`)
sets only `$_ENV['APP_DEBUG'] = ''`; `env_bool` falls back to `getenv()`, so
a machine with `APP_DEBUG=1` exported makes the assertion fail. Add the
`putenv` pin as the first statement of the test body:

```php
test('env_bool returns false when value is an empty string', function () {
    putenv('APP_DEBUG');
    $_ENV['APP_DEBUG'] = '';

    $result = env_bool('APP_DEBUG');

    expect($result)->toBeFalse();
});
```

The adjacent fallback-direction test (line 129, sets
`putenv('APP_DEBUG=true')`) already pins the other direction and needs no
change.

- [ ] **Step 2: Green**

```bash
php vendor/bin/pest tests/Unit/EnvBoolTest.php
```

Expected: all cases PASS. (Red is environmental — only reproducible on a
machine with `APP_DEBUG` exported; the pin makes the test machine-proof.)

- [ ] **Step 3: Commit**

```bash
git add tests/Unit/EnvBoolTest.php
git commit -S -m $'test(unit): pin env_bool empty-string case against ambient env\n\nenv_bool treats an empty $_ENV value as unset and consults getenv(); the\ntest set only $_ENV, so an exported APP_DEBUG made it fail. putenv() pin\ncloses the ambient dependency (audit finding 5).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 6: phpunit.xml — drop dead `slow` exclusion, document coverage scope

**Files:**
- Modify: `phpunit.xml`

**Interfaces:**
- Consumes: nothing.
- Produces: config comment documenting why the source set is `backend/` only.

- [ ] **Step 1: Edit phpunit.xml**

Remove the `<groups>` block (lines 9-13, the dead `slow` exclusion — no test
tags `slow`; grep `group.*slow` in `tests/` returns nothing) and add a scope
comment to the `<source>` block:

```xml
    <source>
        <include>
            <!-- Scope: backend/ only. .github/scripts and
                 packages/*/scripts are covered behaviorally
                 (tests/Shell/*_test.sh), not via clover; widening here
                 would collapse the aggregate gate. -->
            <directory>backend</directory>
        </include>
    </source>
```

- [ ] **Step 2: Verify**

```bash
php vendor/bin/pest --testsuite Unit --no-coverage 2>&1 | tail -3
```

Expected: suite runs green (config parses; no group filter applied).

- [ ] **Step 3: Commit**

```bash
git add phpunit.xml
git commit -S -m $'chore(phpunit): drop dead slow-group exclusion, document coverage scope\n\nNo test tags the slow group; the exclusion silently pre-armed a mechanism\nfor removing tests from CI. The source-scope comment records why the\ninstrumented set is backend/ only (audit findings 1 and 6).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 7: Shell-suite runner + composer test scripts

**Files:**
- Create: `tests/Shell/run-all.sh`
- Modify: `composer.json` (add `scripts` after `autoload-dev`)

**Interfaces:**
- Consumes: existing `tests/Shell/*_test.sh` files.
- Produces: `bash tests/Shell/run-all.sh` — runs every shell test, exits
  non-zero if any failed; `composer test|test:coverage|test:shell|test:all`.

- [ ] **Step 1: Create `tests/Shell/run-all.sh`**

```bash
#!/usr/bin/env bash
# $KYAULabs: run-all.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $






# Single entry point for the shell regression suite (composer test:shell,
# ci.yml "Shell regression tests"). Iterates tests/Shell/*_test.sh, runs
# every file even if some fail, and aggregates the exit code — mirrors CI
# semantics. Not matched by the *_test.sh glob itself.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

shopt -s nullglob
tests=( tests/Shell/*_test.sh )
if [ ${#tests[@]} -eq 0 ]; then
	echo "No shell tests found in tests/Shell/" >&2
	exit 1
fi

rc=0
for t in "${tests[@]}"; do
	bash "$t" || rc=1
done
exit "$rc"

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

(The pre-commit hook normalizes the `$KYAULabs:` header on commit — ADR-0041.)

- [ ] **Step 2: Add composer scripts**

Edit `composer.json`, after the `autoload-dev` block:

```json
	"scripts": {
		"test": "pest",
		"test:coverage": "pest --coverage --min=80",
		"test:shell": "bash tests/Shell/run-all.sh",
		"test:all": "composer test:shell && npm run test:node && composer test:coverage"
	},
```

- [ ] **Step 3: Green — full shell suite via the runner**

```bash
bash tests/Shell/run-all.sh
```

Expected: all 46 shell test files PASS, rc=0.

- [ ] **Step 4: Green — composer entry points + validate**

```bash
composer test:shell; echo "rc=$?"
composer test -- --no-coverage 2>&1 | tail -3
composer validate --strict --no-check-publish
```

Expected: shell suite rc=0; pest suite green; `validate` exits 0
(`composer_validate_test.sh` also covers this).

- [ ] **Step 5: Commit**

```bash
git add tests/Shell/run-all.sh composer.json
git commit -S -m $'build(composer): add test entry-point scripts\n\ntest / test:coverage / test:shell / test:all give contributors one\ncommand per layer plus a full-suite command; run-all.sh is the single\nsource of truth for the shell loop (audit finding 7).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 8: CI parity — route shell tests through `composer test:shell`

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/Shell/pi_ci_contract_test.sh`

**Interfaces:**
- Consumes: Task 7's `composer test:shell` script.
- Produces: single-copy shell loop (composer), CI invokes it; contract test
  accepts both forms.

- [ ] **Step 1: Edit ci.yml**

Replace the `- name: Shell regression tests` step body (the inline
`shopt -s nullglob` … `done` block) with:

```yaml
      - name: Shell regression tests
        run: composer test:shell
```

Rename the Pest step (currently `- name: Pest (coverage >= 80%)`) to:

```yaml
      - name: Pest (backend/ coverage >= 80%)
```

- [ ] **Step 2: Relax the contract assertion**

In `tests/Shell/pi_ci_contract_test.sh`, change:

```bash
assert_ci_contains 'tests/Shell/.*_test\.sh' 'Shell regression tests run'
```

to:

```bash
assert_ci_contains 'composer test:shell|tests/Shell/.*_test\.sh' 'Shell regression tests run (composer test:shell or inline loop)'
```

- [ ] **Step 3: Green**

```bash
bash tests/Shell/pi_ci_contract_test.sh
```

Expected: all assertions PASS (the two forms pattern matches the new CI
step; `prism-tool.js run pest` assertion is unaffected by the step rename).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml tests/Shell/pi_ci_contract_test.sh
git commit -S -m $'ci(workflow): route shell tests through composer test:shell\n\nCI and local devs now run the same shell loop (run-all.sh), closing the\ndrift risk the audit flagged; the CI-contract test accepts both forms.\nThe Pest step is relabeled to name the instrumented scope (backend/).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 9: Pin `strip_jsonc_comments` edge cases

**Files:**
- Create: `tests/Unit/StripJsoncTest.php`

**Interfaces:**
- Consumes: `strip_jsonc_comments()` from `tests/Pest.php` (loaded in every
  Pest run via the Pest bootstrap, same as `restoreEnvVars` in
  `RestoreEnvVarsTest.php`).
- Produces: unit pinning for the unterminated-comment edge (audit gap A).

- [ ] **Step 1: Create the test file**

```php
<?php

declare(strict_types=1);

# $KYAULabs: StripJsoncTest.php kyau@aura.kyaulabs 2026/08/18 -0700 Exp $






test('strip_jsonc_comments strips an unterminated block comment', function () {
    expect(strip_jsonc_comments('{"a":1} /* x'))->toBe('{"a":1} ');
});

test('strip_jsonc_comments strips an unterminated line comment', function () {
    expect(strip_jsonc_comments('{"a":1} // note'))->toBe('{"a":1} ');
});

test('strip_jsonc_comments leaves // inside a quoted string', function () {
    expect(strip_jsonc_comments('{"url":"https://x.test/a"}'))->toBe('{"url":"https://x.test/a"}');
});

test('strip_jsonc_comments strips a terminated block comment', function () {
    expect(strip_jsonc_comments('{"a":1} /* c */ {"b":2}'))->toBe('{"a":1}  {"b":2}');
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

Expected outputs traced from the implementation: the block-comment branch
advances `$i += 2` past `$len` on an unterminated `/*` (loop exits safely);
the terminated case leaves the two separators around the comment intact
(`'  '`).

- [ ] **Step 2: Red first (probe)**

```bash
php -r 'require "tests/Pest.php"; var_dump(strip_jsonc_comments("{\"a\":1} /* x"));'
```

Expected: `string(8) "{"a":1} "` — confirms the pinned expectation before
writing assertions (the audit marked this path untested). The other three
cases trace to: `'{"a":1} // note'` → `'{"a":1} '`,
`'{"url":"https://x.test/a"}'` → unchanged, and
`'{"a":1} /* c */ {"b":2}'` → `'{"a":1}  {"b":2}'` (both spaces around
the removed comment remain).

- [ ] **Step 3: Green**

```bash
php vendor/bin/pest tests/Unit/StripJsoncTest.php
```

Expected: all 4 tests PASS. Re-run `tests/Shell/jsonc_strip_parity_test.sh`
to confirm the PHP-side change of heart (none — implementation untouched)
keeps parity green.

- [ ] **Step 4: Commit**

```bash
git add tests/Unit/StripJsoncTest.php
git commit -S -m $'test(unit): pin strip_jsonc_comments edge cases\n\nThe unterminated block-comment path (advances past the buffer end, safe\nbut untested) and adjacent comment/string cases now have a unit home\n(audit gap A).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 10: Pin coverage-gate exit-2 degenerate paths

**Files:**
- Modify: `tests/Shell/coverage_gate_test.sh` (append three cases before the
  `# ── Summary ──` block)

**Interfaces:**
- Consumes: `.github/scripts/coverage-gate.php` shim → canonical
  `packages/prism-php-web/scripts/coverage-gate.php`; existing `build_clover`
  helper and `register_temp_dir`.
- Produces: exit-2 pinning for missing/malformed/empty clover (audit gap B).

- [ ] **Step 1: Probe — confirm the documented exit-2 behavior**

```bash
cd /home/kyau/projects/kyaulabs/prism
T=$(mktemp -d)
echo 'not xml at all' > "$T/bad.xml"
printf 'backend/env.php\n' | php .github/scripts/coverage-gate.php "$T/bad.xml" --root="$T"; echo "rc=$?"
printf 'backend/env.php\n' | php .github/scripts/coverage-gate.php "$T/missing.xml" --root="$T"; echo "rc=$?"
printf '<?xml version="1.0" encoding="UTF-8"?><coverage generated="1"><project timestamp="1"/></coverage>' > "$T/empty.xml"
printf 'backend/env.php\n' | php .github/scripts/coverage-gate.php "$T/empty.xml" --root="$T"; echo "rc=$?"
rm -rf "$T"
```

Expected: rc=2 for all three (malformed → "could not parse clover XML";
missing → usage; empty → "contains no <file> entries"), matching the
docblock's exit-2 contract.

- [ ] **Step 2: Add the three cases**

Append before the `# ── Summary ──` block:

```bash
# ── Test 9: Malformed clover XML → exit 2 ─────────────────────────────────
echo ""
echo "── Test 9: malformed clover XML exits 2 ──"
T9=$(mktemp -d)
register_temp_dir "$T9"
(
	cd "$T9"
	CLOVER="${T9}/clover.xml"
	printf '%s\n' 'not xml at all' > "$CLOVER"
	printf 'backend/env.php\n' | php "$SCRIPT" "$CLOVER" --root="$T9" >out.txt 2>&1 || rc=$?
	if [ "${rc:-0}" -eq 2 ] && grep -q 'could not parse clover XML' out.txt; then
		pass "malformed clover XML exits 2"
	else
		fail "expected exit 2 + parse error, got rc=${rc:-0}"
	fi
)

# ── Test 10: Missing clover file → exit 2 (usage) ─────────────────────────
echo ""
echo "── Test 10: missing clover file exits 2 ──"
T10=$(mktemp -d)
register_temp_dir "$T10"
(
	cd "$T10"
	printf 'backend/env.php\n' | php "$SCRIPT" "${T10}/missing.xml" --root="$T10" >out.txt 2>&1 || rc=$?
	if [ "${rc:-0}" -eq 2 ] && grep -q '^Usage:' out.txt; then
		pass "missing clover file exits 2 with usage"
	else
		fail "expected exit 2 + usage, got rc=${rc:-0}"
	fi
)

# ── Test 11: Clover with no <file> entries → exit 2 ───────────────────────
echo ""
echo "── Test 11: empty clover (no instrumented files) exits 2 ──"
T11=$(mktemp -d)
register_temp_dir "$T11"
(
	cd "$T11"
	CLOVER="${T11}/clover.xml"
	printf '%s\n' '<?xml version="1.0" encoding="UTF-8"?>' '<coverage generated="1">' '  <project timestamp="1"/>' '</coverage>' > "$CLOVER"
	printf 'backend/env.php\n' | php "$SCRIPT" "$CLOVER" --root="$T11" >out.txt 2>&1 || rc=$?
	if [ "${rc:-0}" -eq 2 ] && grep -q 'contains no <file> entries' out.txt; then
		pass "empty clover exits 2"
	else
		fail "expected exit 2 + no-file diagnostic, got rc=${rc:-0}"
	fi
)
```

- [ ] **Step 3: Green**

```bash
bash tests/Shell/coverage_gate_test.sh
```

Expected: existing 8 cases + 3 new cases all PASS, rc=0.

- [ ] **Step 4: Commit**

```bash
git add tests/Shell/coverage_gate_test.sh
git commit -S -m $'test(shell): pin coverage-gate exit-2 degenerate paths\n\nMalformed XML, missing clover, and empty clover (no instrumented files)\nnow pin the documented exit-2 contract (audit gap B).\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

## Final verification (after Task 10)

Run the verification-before-completion checklist, then `/check`:

```bash
cd /home/kyau/projects/kyaulabs/prism
bash tests/Shell/run-all.sh                                    # 46 shell files green
composer test -- --no-coverage 2>&1 | tail -3                  # pest green
composer test:coverage 2>&1 | tail -5                          # backend/ >= 80%
npm run test:node 2>&1 | tail -3                               # node suite green
composer validate --strict --no-check-publish                  # composer schema
git status --short                                             # no strays, no debug artifacts
```

Then `/check` (php-cs-fixer, stylelint, eslint, Pest coverage on changed
files) as the pre-push gate.
