# RCS Header Normalization — Issue #41 Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Normalize 9 eval-subsystem RCS headers (3 `SEANBR~1` foreign stamps + 6 `creator@host` placeholders) to `kyau@nova 2026/07/05 -0700`, rename 2 `2025-07-05-*` docs to `2026-07-05-*`, and add enforcement checks (Pest test + pre-commit content validation) to prevent recurrence.

**Architecture:** Pest test scans working-tree source files (`.php`, `.js`, `.scss`, `.sh`, `.ts` excluding `vendor/`, `node_modules/`, `aurora/`, `cdn/css/`, `cdn/javascript/`) and asserts RCS header lines contain none of `creator@host`, `YYYY/MM/DD`, or `SEANBR~1`. Pre-commit hook gains a content-validation block after the existing auto-add block that scans staged source file headers and rejects the same pattern literals. Shell regression test validates the hook behavior.

**Tech Stack:** PHP 8.5+ (Pest v4), Bash (pre-commit hook), git-submodule-aware path exclusions.

## Global constraints

- PHP 8.5+ (typed properties, match expressions, named arguments)
- No dependencies added — Pest v4 already in composer.json
- RCS headers follow `rcs-header` skill: `creator@host YYYY/MM/DD ±TZ Exp $`
- Vim modeline on every new or modified source file (per `rcs-header` skill)
- Tests run via Pest; shell tests in `tests/Shell/` run via `/check` step 7
- Exclude `aurora/` submodule from all scans — it is a separate repo (kyaulabs/aurora); companion issue to be filed there separately
- Acceptance criteria: no `SEANBR~1`, `creator@host`, or `YYYY/MM/DD` strings in committed source-file RCS headers

---

### Task 1: Pest test rejecting placeholder/foreign RCS headers + rewrite 9 headers

**Files:**
- Create: `tests/Unit/Harness/RcsHeaderConventionTest.php`
- Modify: `.opencode/evals/bin/run-eval.php:3`
- Modify: `.opencode/evals/bin/run-suite.php:3`
- Modify: `.opencode/evals/bin/includes/EvalRunner.php:3`
- Modify: `tests/Unit/Eval/RunSuiteTest.php:3`
- Modify: `tests/Unit/Eval/RunnerTest.php:3`
- Modify: `tests/Unit/Eval/RunEvalCliTest.php:3`
- Modify: `tests/Unit/Eval/JudgeTest.php:3`
- Modify: `tests/Unit/Eval/EvalCaseTest.php:3`
- Modify: `tests/Integration/Eval/RunEvalIntegrationTest.php:3`

**Interfaces:**
- Produces: `RcsHeaderConventionTest` — a Pest test that scans the working tree; no consumed types from other tasks.

- [ ] **Step 1: Write the failing test (Red)**

Create `tests/Unit/Harness/RcsHeaderConventionTest.php`. Uses a `RecursiveIteratorIterator` to discover all source files, reads the `$KYAULabs:` header line (first 10 lines), and asserts it contains none of `creator@host`, `YYYY/MM/DD`, or `SEANBR~1`. Missing headers are skipped (that's the pre-commit hook's job). The test produces a detailed failure message listing each offending file and the pattern found.

```php
<?php

declare(strict_types=1);

# $KYAULabs: RcsHeaderConventionTest.php kyau@nova 2026/07/07 -0700 Exp $

use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

test('source file RCS headers contain no placeholder or foreign literals', function (): void {
    $repoRoot = dirname(__DIR__, 3);
    $exclude = [
        DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'node_modules' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'aurora' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'cdn' . DIRECTORY_SEPARATOR . 'css' . DIRECTORY_SEPARATOR,
        DIRECTORY_SEPARATOR . 'cdn' . DIRECTORY_SEPARATOR . 'javascript' . DIRECTORY_SEPARATOR,
    ];
    $badPatterns = ['creator@host', 'YYYY/MM/DD', 'SEANBR~1'];
    $failures = [];

    $dirIter = new RecursiveDirectoryIterator($repoRoot, RecursiveDirectoryIterator::SKIP_DOTS);
    $iter = new RecursiveIteratorIterator($dirIter);

    foreach ($iter as $file) {
        $path = $file->getPathname();
        $relative = substr($path, strlen($repoRoot) + 1);
        $ext = strtolower($file->getExtension());

        if (!in_array($ext, ['php', 'js', 'scss', 'sh', 'ts'], true)) {
            continue;
        }

        $skip = false;
        foreach ($exclude as $ex) {
            if (str_contains($path, $ex)) {
                $skip = true;
                break;
            }
        }
        if ($skip) {
            continue;
        }

        $handle = fopen($path, 'r');
        if ($handle === false) {
            continue;
        }

        for ($i = 0; $i < 10; $i++) {
            $line = fgets($handle);
            if ($line === false) {
                break;
            }
            if (str_contains($line, '$KYAULabs:')) {
                foreach ($badPatterns as $pattern) {
                    if (str_contains($line, $pattern)) {
                        $failures[] = sprintf('  %s: contains "%s"', $relative, $pattern);
                    }
                }
                break;
            }
        }
        fclose($handle);
    }

    if ($failures !== []) {
        \Pest\fail(sprintf(
            "Found %d file(s) with placeholder or foreign RCS headers:\n\n%s\n\n"
            . "Fix: replace with kyau@nova YYYY/MM/DD -0700 convention.",
            count($failures),
            implode("\n", $failures),
        ));
    }

    expect($failures)->toBeEmpty();
});
```

- [ ] **Step 2: Run test to verify it fails (Red)**

```bash
php vendor/bin/pest tests/Unit/Harness/RcsHeaderConventionTest.php
```

Expected: **FAIL** — reports 9 files with `creator@host` or `SEANBR~1` in their RCS headers.

- [ ] **Step 3: Rewrite the 9 RCS headers (Green)**

Change the 3 `SEANBR~1` headers (evals/bin) and 6 `creator@host` placeholder headers (tests/Eval) to the convention `kyau@nova 2026/07/05 -0700`.

The three evals/bin files:

`.opencode/evals/bin/run-eval.php:3` — change from:
```php
# $KYAULabs: run-eval.php SEANBR~1@KYAU-DEV 2025/07/05 -0500 Exp $
```
to:
```php
# $KYAULabs: run-eval.php kyau@nova 2026/07/05 -0700 Exp $
```

`.opencode/evals/bin/run-suite.php:3` — change from:
```php
# $KYAULabs: run-suite.php SEANBR~1@KYAU-DEV 2025/07/05 -0500 Exp $
```
to:
```php
# $KYAULabs: run-suite.php kyau@nova 2026/07/05 -0700 Exp $
```

`.opencode/evals/bin/includes/EvalRunner.php:3` — change from:
```php
# $KYAULabs: EvalRunner.php SEANBR~1@KYAU-DEV 2025/07/05 -0500 Exp $
```
to:
```php
# $KYAULabs: EvalRunner.php kyau@nova 2026/07/05 -0700 Exp $
```

The six test files (all on line 3):

`tests/Unit/Eval/RunSuiteTest.php:3` — change from `creator@host YYYY/MM/DD ±TZ` to `kyau@nova 2026/07/05 -0700`
`tests/Unit/Eval/RunnerTest.php:3` — same
`tests/Unit/Eval/RunEvalCliTest.php:3` — same
`tests/Unit/Eval/JudgeTest.php:3` — same
`tests/Unit/Eval/EvalCaseTest.php:3` — same
`tests/Integration/Eval/RunEvalIntegrationTest.php:3` — same

- [ ] **Step 4: Run test to verify it passes (Green)**

```bash
php vendor/bin/pest tests/Unit/Harness/RcsHeaderConventionTest.php
```

Expected: **PASS** — 0 failures.

- [ ] **Step 5: Commit**

```bash
git add tests/Unit/Harness/RcsHeaderConventionTest.php \
        .opencode/evals/bin/run-eval.php \
        .opencode/evals/bin/run-suite.php \
        .opencode/evals/bin/includes/EvalRunner.php \
        tests/Unit/Eval/RunSuiteTest.php \
        tests/Unit/Eval/RunnerTest.php \
        tests/Unit/Eval/RunEvalCliTest.php \
        tests/Unit/Eval/JudgeTest.php \
        tests/Unit/Eval/EvalCaseTest.php \
        tests/Integration/Eval/RunEvalIntegrationTest.php
git commit -S -m "test(eval): add Pest test rejecting placeholder RCS headers

Adds RcsHeaderConventionTest that scans source files for
creator@host, YYYY/MM/DD, and SEANBR~1 literals in RCS
headers. Rewrites 9 eval-subsystem headers to kyau@nova
2026/07/05 -0700 convention (3 foreign SEANBR~1 stamps, 6
creator@host placeholders).

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 2: Pre-commit content check + shell regression test

**Files:**
- Create: `tests/Shell/rcs_header_placeholder_test.sh`
- Modify: `.github/hooks/pre-commit:207` (insert new block before `echo "✓ pre-commit passed"`)

**Interfaces:**
- Consumes: Task 1's header rewrites (all 9 files now have valid headers, so the new hook check won't flag legitimate files)
- Produces: Content-validation block in pre-commit hook; `rcs_header_placeholder_test.sh` shell regression test

- [ ] **Step 1: Write the failing shell test (Red)**

Create `tests/Shell/rcs_header_placeholder_test.sh`. Models the pattern from `tests/Shell/rcs_header_autoadd_test.sh`: creates isolated temp git repos, copies the REAL pre-commit hook into each, stages test files, and asserts commit success/failure.

```bash
#!/usr/bin/env bash
# $KYAULabs: rcs_header_placeholder_test.sh kyau@nova 2026/07/07 -0700 Exp $

# ── Repro-first tests for pre-commit RCS placeholder rejection ──────────────
# Verifies that the pre-commit hook blocks source files with placeholder
# or foreign RCS headers (creator@host, YYYY/MM/DD, SEANBR~1).

set -euo pipefail

RESULT_FILE=$(mktemp)
trap 'rm -f "$RESULT_FILE"' EXIT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
RESET=$'\033[0m'

pass() { echo "  ${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "  ${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REAL_HOOK="$REPO_ROOT/.github/hooks/pre-commit"

if [ ! -f "$REAL_HOOK" ]; then
	fail "Cannot find pre-commit hook at $REAL_HOOK"
	exit 1
fi

# ── Test 1: Placeholder header (creator@host YYYY/MM/DD) rejected ────────

echo ""
echo "── Test 1: Placeholder (creator@host YYYY/MM/DD) header rejected ──"
T1=$(mktemp -d)
(
	cd "$T1"
	git init --quiet
	git config user.email "kyau@nova.local"
	git config user.name "kyau"
	cp "$REAL_HOOK" .git/hooks/pre-commit
	chmod +x .git/hooks/pre-commit

	cat > "file.php" <<'EOF'
<?php

# $KYAULabs: file.php creator@host YYYY/MM/DD ±TZ Exp $

declare(strict_types=1);

echo "hi";
// vim: ft=php sts=4 sw=4 ts=4 et :
EOF
	git add file.php
	if git commit --quiet -m "test: placeholder header" 2>&1; then
		fail "commit with placeholder header was NOT rejected"
	else
		pass "placeholder header blocked"
	fi
)
rm -rf "$T1"

# ── Test 2: SEANBR~1 foreign header rejected ─────────────────────────────

echo ""
echo "── Test 2: SEANBR~1 foreign header rejected ──"
T2=$(mktemp -d)
(
	cd "$T2"
	git init --quiet
	git config user.email "kyau@nova.local"
	git config user.name "kyau"
	cp "$REAL_HOOK" .git/hooks/pre-commit
	chmod +x .git/hooks/pre-commit

	cat > "file.php" <<'EOF'
<?php

# $KYAULabs: file.php SEANBR~1@KYAU-DEV 2025/07/05 -0500 Exp $

declare(strict_types=1);

echo "hi";
// vim: ft=php sts=4 sw=4 ts=4 et :
EOF
	git add file.php
	if git commit --quiet -m "test: foreign header" 2>&1; then
		fail "commit with SEANBR~1 header was NOT rejected"
	else
		pass "SEANBR~1 header blocked"
	fi
)
rm -rf "$T2"

# ── Test 3: Valid header (kyau@nova) passes ──────────────────────────────

echo ""
echo "── Test 3: Valid header passes ──"
T3=$(mktemp -d)
(
	cd "$T3"
	git init --quiet
	git config user.email "kyau@nova.local"
	git config user.name "kyau"
	cp "$REAL_HOOK" .git/hooks/pre-commit
	chmod +x .git/hooks/pre-commit

	cat > "file.php" <<'EOF'
<?php

# $KYAULabs: file.php kyau@nova 2026/07/07 -0700 Exp $

declare(strict_types=1);

echo "hi";
// vim: ft=php sts=4 sw=4 ts=4 et :
EOF
	git add file.php
	if git commit --quiet -m "test: valid header passes" 2>&1; then
		pass "valid header accepted"
	else
		fail "valid header blocked incorrectly"
	fi
)
rm -rf "$T3"

# ── Summary ──────────────────────────────────────────────────────────────

echo ""
passed=$(grep -c "PASS" "$RESULT_FILE" 2>/dev/null || echo 0)
failed=$(grep -c "FAIL" "$RESULT_FILE" 2>/dev/null || echo 0)
total=$((passed + failed))
echo "Results: ${passed}/${total} passed, ${failed}/${total} failed"
[ "$failed" -eq 0 ] || exit 1

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run shell test to verify it fails (Red)**

```bash
bash tests/Shell/rcs_header_placeholder_test.sh
```

Expected: **FAIL** — Tests 1 and 2 fail because the pre-commit hook does NOT yet block placeholder/foreign header content. (The auto-add block passes because the headers already contain `$KYAULabs:`.)

- [ ] **Step 3: Add content-validation block to pre-commit hook (Green)**

In `.github/hooks/pre-commit`, insert a new block **after** the existing RCS auto-add block (after the `fi` on line 207, before `echo "✓ pre-commit passed"` on line 209). The new block re-derives `STAGED_SRC` independently, scans the `$KYAULabs:` header line from each staged source file, and rejects `creator@host`, `YYYY/MM/DD`, or `SEANBR~1` literals.

Replace lines 207-209:

```bash
fi

echo "✓ pre-commit passed"
```

with:

```bash
fi

# ── RCS placeholder/foreign header check ──────────────────────────────────────
STAGED_SRC=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(php|js|scss|sh|ts)$' || true)
STAGED_SRC=$(echo "$STAGED_SRC" | grep -vE '^(vendor/|node_modules/|aurora/|cdn/css/|cdn/javascript/)' || true)
if [ -n "$STAGED_SRC" ]; then
	while IFS= read -r file; do
		[ -z "$file" ] && continue

		# shellcheck disable=SC2016  # $KYAULabs is a literal RCS marker
		HDR_LINE=$(git show ":$file" 2>/dev/null | head -10 | grep -F '$KYAULabs:' || true)
		[ -z "$HDR_LINE" ] && continue

		if echo "$HDR_LINE" | grep -qF 'creator@host'; then
			echo "✗ RCS placeholder in '$file': 'creator@host' — replace with real identity." >&2
			exit 1
		fi
		if echo "$HDR_LINE" | grep -qF 'YYYY/MM/DD'; then
			echo "✗ RCS placeholder in '$file': 'YYYY/MM/DD' — replace with real date." >&2
			exit 1
		fi
		if echo "$HDR_LINE" | grep -qF 'SEANBR~1'; then
			echo "✗ RCS foreign header in '$file': 'SEANBR~1' — replace with kyau@nova." >&2
			exit 1
		fi
	done <<< "$STAGED_SRC"
fi

echo "✓ pre-commit passed"
```

- [ ] **Step 4: Run shell test to verify it passes (Green)**

```bash
bash tests/Shell/rcs_header_placeholder_test.sh
```

Expected: **PASS** — 3/3 passed (placeholder blocked, SEANBR~1 blocked, valid accepted).

- [ ] **Step 5: Run the Pest test again to confirm it still passes**

```bash
php vendor/bin/pest tests/Unit/Harness/RcsHeaderConventionTest.php
```

Expected: **PASS** — 0 failures (no regressions from hook modification).

- [ ] **Step 6: Commit**

```bash
git add tests/Shell/rcs_header_placeholder_test.sh .github/hooks/pre-commit
git commit -S -m "feat(pre-commit): block commits with placeholder RCS header content

Adds content-validation block to pre-commit hook that scans
staged source file RCS headers and rejects creator@host,
YYYY/MM/DD, and SEANBR~1 literals. Includes shell regression
test (3 cases: placeholder rejected, foreign rejected, valid
accepted).

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 3: Rename 2025-07-05 docs to 2026-07-05 + update references

**Files:**
- Rename: `docs/plans/2025-07-05-eval-runner-plan.md` → `docs/plans/2026-07-05-eval-runner-plan.md`
- Rename: `docs/specs/2025-07-05-eval-runner-spec.md` → `docs/specs/2026-07-05-eval-runner-spec.md`
- Modify: `docs/specs/2026-07-05-eval-runner-spec.md:3` (`**Date:** 2025-07-05` → `2026-07-05`)
- Modify: `docs/plans/2026-07-07-check-deterministic-semantics.md:30,446,546,583` (4 refs to `2025-07-05-eval-runner-spec.md` → `2026-07-05-eval-runner-spec.md`)

**Interfaces:**
- No interface contracts — pure mechanical rename + reference updates. No consumed or produced types.

- [ ] **Step 1: Rename the plan and spec files**

```bash
git mv docs/plans/2025-07-05-eval-runner-plan.md docs/plans/2026-07-05-eval-runner-plan.md
git mv docs/specs/2025-07-05-eval-runner-spec.md docs/specs/2026-07-05-eval-runner-spec.md
```

- [ ] **Step 2: Update the spec's internal Date line**

In `docs/specs/2026-07-05-eval-runner-spec.md:3`, change:
```
**Date:** 2025-07-05
```
to:
```
**Date:** 2026-07-05
```

- [ ] **Step 3: Update the 4 cross-references in check-deterministic-semantics.md**

In `docs/plans/2026-07-07-check-deterministic-semantics.md`, replace all 4 occurrences of:
```
2025-07-05-eval-runner-spec.md
```
with:
```
2026-07-05-eval-runner-spec.md
```

The 4 occurrences are at lines 30, 446, 546, and 583.

- [ ] **Step 4: Verify no remaining references**

```bash
grep -r "2025-07-05-eval-runner" docs/ --include="*.md" 2>/dev/null || echo "(none)"
```

Expected: **empty** — no remaining references to the old filename.

- [ ] **Step 5: Verify no `2025-07-05-eval-runner` in source files**

```bash
grep -r "2025-07-05-eval-runner" --include="*.php" --include="*.sh" . 2>/dev/null | grep -v vendor/ | grep -v node_modules/ | grep -v aurora/ || echo "(none)"
```

Expected: **empty** — no code references to the old filename.

- [ ] **Step 6: Commit**

```bash
git add docs/plans/2026-07-05-eval-runner-plan.md \
        docs/plans/2025-07-05-eval-runner-plan.md \
        docs/specs/2026-07-05-eval-runner-spec.md \
        docs/specs/2025-07-05-eval-runner-spec.md \
        docs/plans/2026-07-07-check-deterministic-semantics.md
git commit -S -m "docs(eval): rename 2025-07-05 eval plan/spec to 2026-07-05

Renames docs/{plans,specs}/2025-07-05-eval-runner-*.md to 2026-07-05-*
and updates the spec's internal Date line and 4 cross-references in
check-deterministic-semantics.md. The 2025 year was a typo — eval
subsystem work was done in 2026.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Verification

After all three tasks are committed:

- [ ] `verification-before-completion`: re-run Pest test + shell test + confirm zero `SEANBR~1`/`creator@host`/`YYYY/MM/DD` in source-file RCS headers
- [ ] `/check` (php-cs-fixer + stylelint + eslint + pest --coverage 80% + shell tests)
- [ ] `@code-review` on the feature branch
- [ ] Prepare aurora companion issue command:

```bash
gh issue create --repo kyaulabs/aurora \
  --title "Normalize eval-subsystem RCS headers (companion to template#41)" \
  --body "Companion to kyaulabs/template#41. Aurora's .opencode/evals/bin/*.php
  and tests/Eval/*.php carry SEANBR~1@KYAU-DEV 2025/07/05 headers and
  creator@host YYYY/MM/DD placeholders. Rewrite to kyau@nova convention."
```
