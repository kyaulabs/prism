# Temp Leak and Unpinned Skill Versions Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor where behavior is testable.

**Goal:** Guarantee temporary Aurora test scripts are removed after assertion
failures and replace moving or implicit dependency versions in skill guidance
with explicit, repository-verified versions and lockfile instructions.

**Architecture:** Keep the test cleanup behavior local to
`AuroraConstructorDisplayErrorsTest.php`: a small, tested helper owns temporary
script creation, callback execution, and unconditional deletion, while each
subprocess path is shell-quoted. The skill hardening remains documentation-only:
pin browser-test dependencies to versions already locked by this repository,
replace generic moving-tag remediation with an advisory-derived fixed-version
placeholder, and require manifests and lockfiles to be committed together.

**Tech Stack:** PHP 8.5, Pest PHP v4, PHPUnit exceptions, Markdown OpenCode
skills, Composer, npm.

## Origin

- Issue #225 — `Temp File Leaked on Assertion Failure`; Type `Test`.
- Issue #226 — `Unpinned @latest in Skills (pest-browser, audit-deps)`; Type
  `Security`.
- Both issues are intentionally delivered on one `fix` branch from `develop`,
  with one atomic implementation commit per issue.
- Issue #226 has a known root cause and exact affected documentation sites;
  no runtime reproduction or instrumentation is needed before planning.

## Global constraints

- After this plan is approved, create the shared branch with
  `bash .github/scripts/new-branch.sh fix temp-leak-and-unpinned-skill-versions`.
- Do not create the branch or dispatch `@tdd` before plan approval.
- Task 1 uses `@tdd` and Red → Green → Refactor. Task 2 is the brainstorming
  fast-path because it changes only Markdown guidance and has zero application
  behavior delta.
- Before editing the PHP test, load the `rcs-header` skill. Preserve its
  existing one-time RCS header and final vim modeline; do not update the header.
- Before editing the skills, load `writing-skills` and `security-coding`.
- No dependencies or lockfiles are changed by this work. The skill examples
  use exact versions already present in the repository lockfiles.
- Do not edit generated `cdn/css/*.min.css` or `cdn/javascript/*.min.js`, and
  do not create or commit an `.env` file.
- Never push. Present each full signed Conventional Commit message before the
  gated `git commit` call.
- Commit footers use `Authored-by: gpt-5.6-sol`,
  `Implemented-by: glm-5.2`, `Tested-by: deepseek-v4-pro`, and
  `Signed-off-by: kyau <git@kyaulabs.com>`.

## File structure

| File | Responsibility | Task |
| :--- | :--- | :---: |
| `tests/Integration/AuroraConstructorDisplayErrorsTest.php` | Own the temporary-script lifecycle, quote subprocess paths, and prove cleanup after an assertion exception | 1 |
| `.opencode/skills/pest-browser/SKILL.md` | Provide exact Composer/npm browser-test installation versions and lockfile guidance | 2 |
| `.opencode/skills/audit-deps/SKILL.md` | Recommend an explicit advisory-derived remediation version and lockfile handling | 2 |

---

### Task 1: Guarantee Aurora display-errors test cleanup

**Files:**
- Modify and test: `tests/Integration/AuroraConstructorDisplayErrorsTest.php`

**Interfaces:**
- Consumes: `sys_get_temp_dir()`, `tempnam()`, `file_put_contents()`,
  `escapeshellarg()`, Pest expectations, and
  `PHPUnit\Framework\ExpectationFailedException`.
- Produces: `withAuroraDisplayErrorsScript(string $prefix, string $source,
  Closure $assertions): void`, which creates and writes one temporary script,
  invokes `$assertions($script)`, and deletes the script in `finally`.

- [ ] **Step 1: Write the cleanup regression test (Red)**

Append this test immediately before the vim modeline. It intentionally triggers
and catches an assertion failure inside the planned helper, then checks the
captured path after stack unwinding:

```php
test('temporary display_errors scripts are removed after assertion failures', function () {
    $script = null;

    try {
        withAuroraDisplayErrorsScript(
            'aurora_de_failure_',
            '<?php declare(strict_types=1);',
            function (string $path) use (&$script): void {
                $script = $path;
                expect('actual')->toBe('expected');
            },
        );
    } catch (PHPUnit\Framework\ExpectationFailedException) {
    }

    expect($script)->not->toBeNull()
        ->and(is_file($script))->toBeFalse();
});
```

- [ ] **Step 2: Run the focused test and verify Red**

Run:

```bash
vendor/bin/pest tests/Integration/AuroraConstructorDisplayErrorsTest.php \
  --filter='temporary display_errors scripts are removed after assertion failures'
```

Expected: FAIL because `withAuroraDisplayErrorsScript()` is undefined. Confirm
the failure is the missing helper rather than an environment or Aurora-submodule
failure.

- [ ] **Step 3: Add the minimal temporary-script helper (Green)**

Insert this function after `beforeEach()` and before the first test. Its PHPDoc
is required by the repository conventions:

```php
/**
 * Execute assertions against a temporary PHP script and remove it afterward.
 *
 * @param  string $prefix  Prefix used by tempnam().
 * @param  string $source  PHP source written to the temporary script.
 * @param  Closure(string): void $assertions  Assertions that consume the path.
 * @return void
 * @throws RuntimeException  If the script cannot be created or written.
 */
function withAuroraDisplayErrorsScript(string $prefix, string $source, Closure $assertions): void
{
    $script = tempnam(sys_get_temp_dir(), $prefix);
    if ($script === false) {
        throw new RuntimeException('Unable to create temporary Aurora display_errors script');
    }

    try {
        if (file_put_contents($script, $source) === false) {
            throw new RuntimeException('Unable to write temporary Aurora display_errors script');
        }

        $assertions($script);
    } finally {
        if (is_file($script)) {
            unlink($script);
        }
    }
}
```

- [ ] **Step 4: Run the focused cleanup test and verify Green**

Run the Step 2 command again.

Expected: PASS. The caught Pest/PHPUnit assertion exception must unwind through
the helper's `finally`, and `is_file($script)` must be false afterward.

- [ ] **Step 5: Refactor both existing tests through the helper**

Replace the two existing test bodies with the following complete versions.
Both subprocess commands use `escapeshellarg($script)` so a `TMPDIR` containing
spaces remains one shell argument:

```php
test('display_errors remains off when Aurora throws with status=false', function () {
    $auroraPath = dirname(__DIR__, 2) . '/aurora/aurora.inc.php';
    $source = <<<PHP
<?php
declare(strict_types=1);
require_once '{$auroraPath}';
ob_start();
try {
    new KYAULabs\\Aurora(template: 'nonexistent.html', cdn: '/cdn', status: false);
} catch (KYAULabs\\AuroraException \$e) {
    ob_end_clean();
    echo ini_get('display_errors');
}
PHP;

    withAuroraDisplayErrorsScript('aurora_de_false_', $source, function (string $script): void {
        $output = [];
        $exitCode = 0;
        exec('php ' . escapeshellarg($script) . ' 2>&1', $output, $exitCode);

        $stdout = implode("\n", $output);
        expect($stdout)->toBe('0');
        expect($exitCode)->toBe(0);
    });
});

test('display_errors is enabled when Aurora throws with status=true', function () {
    $auroraPath = dirname(__DIR__, 2) . '/aurora/aurora.inc.php';
    $source = <<<PHP
<?php
declare(strict_types=1);
require_once '{$auroraPath}';
ob_start();
try {
    new KYAULabs\\Aurora(template: 'nonexistent.html', cdn: '/cdn', status: true);
} catch (KYAULabs\\AuroraException \$e) {
    ob_end_clean();
    echo ini_get('display_errors');
}
PHP;

    withAuroraDisplayErrorsScript('aurora_de_true_', $source, function (string $script): void {
        $output = [];
        $exitCode = 0;
        exec('php ' . escapeshellarg($script) . ' 2>&1', $output, $exitCode);

        $stdout = implode("\n", $output);
        expect($stdout)->toBe('1');
        expect($exitCode)->toBe(0);
    });
});
```

- [ ] **Step 6: Verify all three tests, including a TMPDIR with spaces**

Run the file normally:

```bash
vendor/bin/pest tests/Integration/AuroraConstructorDisplayErrorsTest.php
```

Expected: 3 tests PASS.

Then run it with an isolated temporary directory whose name contains spaces and
verify that no `aurora_de_*` files remain:

```bash
tmp_dir=$(mktemp -d '/tmp/prism temp.XXXXXX')
trap 'rm -rf "$tmp_dir"' EXIT
TMPDIR="$tmp_dir" vendor/bin/pest tests/Integration/AuroraConstructorDisplayErrorsTest.php
if compgen -G "$tmp_dir/aurora_de_*" > /dev/null; then
    printf '%s\n' 'FAIL: leaked aurora_de_* temporary script' >&2
    exit 1
fi
```

Expected: 3 tests PASS and the leak check exits zero without printing `FAIL`.

- [ ] **Step 7: Review and present the atomic commit**

Confirm the pre-existing RCS header and final vim modeline remain in place,
there are no debug calls or temporary artifacts, and only the target test file
is staged. Present this full message before invoking the gated commit:

```text
test(aurora): clean temp scripts after assertion failures

Own temporary display-errors scripts through a try/finally helper so Pest
assertion exceptions cannot bypass deletion. Quote each subprocess path so
TMPDIR values containing spaces remain valid shell arguments.

Fixes: #225
Authored-by: gpt-5.6-sol
Implemented-by: glm-5.2
Tested-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

After approval, stage only
`tests/Integration/AuroraConstructorDisplayErrorsTest.php` and commit with one
signed `git commit -S -m $'...'` argument.

---

### Task 2: Pin dependency versions in browser and audit skills

**Files:**
- Modify: `.opencode/skills/pest-browser/SKILL.md:11-23`
- Modify: `.opencode/skills/audit-deps/SKILL.md:57-73`

**Interfaces:**
- Consumes: repository-locked `pestphp/pest-plugin-browser` version `4.3.1`
  from `composer.lock` and Playwright version `1.61.1` from
  `package-lock.json`.
- Produces: exact installation guidance with no moving distribution tag, plus
  explicit manifest/lockfile handling after an approved dependency change.

- [ ] **Step 1: Pin the pest-browser installation guidance**

Replace the Installation section's command block with:

```bash
composer require pestphp/pest-plugin-browser:4.3.1 --dev
npm install --save-dev --save-exact playwright@1.61.1
npx playwright install
```

Immediately after the block, add:

```markdown
These versions match the repository's committed lockfiles. After changing a
dependency version, commit each manifest with its regenerated lockfile:
`composer.json` with `composer.lock`, and `package.json` with
`package-lock.json`.
```

Do not edit any manifest or lockfile; this task changes guidance only.

- [ ] **Step 2: Make audit remediation advisory-specific and lockfile-aware**

Replace the npm finding bullet at current line 60 with:

```markdown
- Suggested fix: `npm install --save-exact <package>@<first-non-vulnerable-version>`
```

Add these bullets under `## Rules`, immediately after the read-only rule:

```markdown
- Select the first non-vulnerable version identified by the advisory; never
  recommend a moving distribution tag.
- After a human approves dependency remediation, regenerate and commit the
  corresponding manifest and lockfile together (`composer.json` with
  `composer.lock`, or `package.json` with `package-lock.json`). The audit
  itself remains read-only.
```

The fixed-version token is intentionally advisory-derived: `audit-deps` reports
arbitrary affected packages, so hard-coding one package's version there would
be incorrect.

- [ ] **Step 3: Verify the documentation hardening**

Run:

```bash
grep -R -nF '@latest' .opencode/skills
```

Expected: no output and exit status 1, proving no skill recommends the moving
tag.

Validate both skill frontmatter blocks:

```bash
bash .github/scripts/check-skill-frontmatter.sh \
  "$PWD/.opencode/skills/pest-browser/SKILL.md" \
  "$PWD/.opencode/skills/audit-deps/SKILL.md"
```

Expected: exit 0 with no output.

Finally, verify the two concrete versions still match the committed dependency
state:

```bash
grep -n 'pestphp/pest-plugin-browser' composer.json composer.lock
grep -n 'playwright' package.json package-lock.json
```

Expected: the lockfiles show `pestphp/pest-plugin-browser` `v4.3.1` and
Playwright `1.61.1`; the root manifests remain unchanged.

- [ ] **Step 4: Review and present the atomic commit**

Confirm only the two `SKILL.md` files are staged and present this full message
before invoking the gated commit:

```text
fix(security): pin dependency guidance in skills

Pin Pest Browser and Playwright examples to versions already verified by the
repository lockfiles. Make audit remediation select an advisory-derived fixed
version and require manifests and regenerated lockfiles to be committed
together.

Fixes: #226
Authored-by: gpt-5.6-sol
Implemented-by: glm-5.2
Tested-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

After approval, stage only `.opencode/skills/pest-browser/SKILL.md` and
`.opencode/skills/audit-deps/SKILL.md`, then commit with one signed
`git commit -S -m $'...'` argument.

---

## Final verification

- [ ] Re-run
  `vendor/bin/pest tests/Integration/AuroraConstructorDisplayErrorsTest.php`
  and the isolated `TMPDIR`-with-spaces command from Task 1.
- [ ] Confirm the intentionally failing nested assertion is caught only by the
  regression test and leaves no `aurora_de_*` file.
- [ ] Re-run the moving-tag and skill-frontmatter checks from Task 2.
- [ ] Inspect `git diff develop...HEAD` and `git status --short`; confirm no
  generated assets, lockfiles, manifests, `.env` files, debug artifacts, or
  unrelated changes are present.
- [ ] Load `verification-before-completion` and execute its checklist.
- [ ] Run `/check` in full: php-cs-fixer dry-run, stylelint, eslint, Pest with
  coverage and the changed-file 80% gate, plugin tests, PHP syntax checks, and
  shell regression tests. Report PASS/FAIL/SKIPPED per tool and a final GO or
  NO-GO.
- [ ] Do not push. Stop with the branch name, both commit hashes, detailed test
  evidence, and the `/check` result so the human can review and push.
