# Pre-Commit Robustness Batch Implementation Plan (#79)

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Fix three robustness defects in `.github/hooks/pre-commit`: unreachable fallbacks under `set -e`, RCS temp files without trap cleanup + predictable names, and non-ASCII filename breakage under `core.quotePath`.

**Architecture:** All changes are in `.github/hooks/pre-commit` (311 lines, bash). A new test file `tests/Shell/pre_commit_robustness_test.sh` provides TDD coverage. No architectural changes — these are targeted bug fixes to the existing hook.

**Tech Stack:** Bash (pre-commit hook), shell test framework (self-contained test scripts matching existing `tests/Shell/` pattern).

## Global constraints

- `set -euo pipefail` is active in the hook (line 4) — all fixes must be safe under it
- Bash ≥ 3.2 required (macOS compatibility)
- Tab indentation in shell scripts (tab-stop 4)
- RCS header + vim modeline on all new source files (see `rcs-header` skill)
- Conventional Commits with `Plan-by: glm-5.2`, `Acked-by: deepseek-v4-pro`, `Signed-off-by: kyau <git@kyaulabs.com>` footers
- `Refs: #79` on commits 1–5; `Fixes: #79` on commit 6 (closes the issue)
- Signed commits (`git commit -S`)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `tests/Shell/pre_commit_robustness_test.sh` | Create (Task 1), extend (Tasks 3, 5) | TDD tests for all three defects |
| `.github/hooks/pre-commit` | Modify (Tasks 2, 4, 6) | Fix the three defects |

The test file follows the same self-contained pattern as `tests/Shell/pre_commit_index_lint_test.sh`: inline `pass()`/`fail()`/`skip()` helpers, `setup_test_repo()` helper, `RESULT_FILE` + `TEMP_DIRS` trap cleanup, summary at end.

---

### Task 1: Red — Failing test for CREATOR/HOSTNAME fallback under `set -e`

**Files:**
- Create: `tests/Shell/pre_commit_robustness_test.sh`

**Interfaces:**
- Produces: `pre_commit_robustness_test.sh` with header, helpers, Test 1, and summary scaffold. Tasks 3 and 5 will insert additional tests before the summary.

- [ ] **Step 1: Write the failing test**

Create `tests/Shell/pre_commit_robustness_test.sh` with RCS header, vim modeline, helpers, and Test 1:

```bash
#!/usr/bin/env bash
# $KYAULabs: pre_commit_robustness_test.sh kyau@nova 2026/07/11 -0700 Exp $




# ── Robustness tests for pre-commit hook (issue #79) ──────────────────────────
# Three defects:
#   1. CREATOR/HOSTNAME fallbacks unreachable under `set -euo pipefail`
#   2. RCS temp files have no trap cleanup; $TMP.mod is predictable
#   3. Non-ASCII filenames arrive quoted/escaped under core.quotePath
#
# Each test creates an isolated git repo, stages a file, runs the hook,
# and verifies the expected behavior.

set -euo pipefail

RESULT_FILE=$(mktemp)
TEMP_DIRS=""
trap 'rm -f "$RESULT_FILE"; [ -n "$TEMP_DIRS" ] && rm -rf $TEMP_DIRS' EXIT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
RESET=$'\033[0m'

pass() { echo "${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }
skip() { echo "SKIP $*"; }

# ── Resolve paths BEFORE any cd ────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRE_COMMIT="$REPO_ROOT/.github/hooks/pre-commit"
VENDOR_DIR="$REPO_ROOT/vendor"
NODE_MODULES_DIR="$REPO_ROOT/node_modules"
CS_FIXER_CONFIG="$REPO_ROOT/.php-cs-fixer.dist.php"
ESLINT_CONFIG="$REPO_ROOT/eslint.config.mjs"
STYLELINT_CONFIG="$REPO_ROOT/.stylelintrc.json"

if [ ! -f "$PRE_COMMIT" ]; then
	fail "Cannot find pre-commit hook at $PRE_COMMIT"
	exit 1
fi

# ── Helper: create an isolated git repo with linter tooling available ──────────

setup_test_repo()
{
	local dir="$1"
	git init --quiet "$dir"
	(
		cd "$dir"
		git config commit.gpgsign false
		git config user.email "test@example.com"
		git config user.name "Test User"

		ln -s "$VENDOR_DIR" vendor
		ln -s "$NODE_MODULES_DIR" node_modules

		[ -f "$CS_FIXER_CONFIG" ] && cp "$CS_FIXER_CONFIG" .php-cs-fixer.dist.php
		[ -f "$ESLINT_CONFIG" ]  && cp "$ESLINT_CONFIG"  eslint.config.mjs
		[ -f "$STYLELINT_CONFIG" ] && cp "$STYLELINT_CONFIG" .stylelintrc.json
	)
}

# ── Linter availability flags ──────────────────────────────────────────────────

HAS_PHP=false
HAS_SHELLCHECK=false
command -v php > /dev/null 2>&1 && HAS_PHP=true
command -v shellcheck > /dev/null 2>&1 && HAS_SHELLCHECK=true

# ==============================================================================
# Test 1: CREATOR/HOSTNAME fallback — hook survives missing user.email
# ==============================================================================

echo ""
echo "── Test 1: Hook survives missing user.email under set -e ──"
if ! $HAS_PHP; then
	skip "php not available"
else
	T1=$(mktemp -d)
	TEMP_DIRS="$TEMP_DIRS $T1"
	setup_test_repo "$T1"
	(
		cd "$T1"

		# Prevent git from reading global/system config for user.email
		export GIT_CONFIG_GLOBAL=/dev/null
		export GIT_CONFIG_SYSTEM=/dev/null

		# Unset user.email so `git config user.email` exits non-zero
		git config --unset user.email

		# Create and stage a clean .sh file (triggers RCS auto-add path)
		cat > test.sh <<'SHEOF'
#!/bin/bash
echo "hello"
SHEOF
		git add test.sh

		set +e
		HOOK_OUT=$(bash "$PRE_COMMIT" 2>&1)
		ret=$?
		set -e

		# Bug: under set -euo pipefail, `git config user.email | cut` fails
		# and set -e aborts the hook before the [ -z "$CREATOR" ] fallback.
		# After fix: `|| true` lets the fallback execute.
		if [ "$ret" -eq 0 ] && echo "$HOOK_OUT" | grep -qF "pre-commit passed"; then
			pass "Hook survives missing user.email (exit $ret)"
		else
			fail "Hook aborted when user.email is missing (exit $ret)"
		fi
	)
	rm -rf "$T1"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

total_pass=$(grep -c "PASS" "$RESULT_FILE" 2>/dev/null || true)
total_fail=$(grep -c "FAIL" "$RESULT_FILE" 2>/dev/null || true)
: "${total_pass:=0}"
: "${total_fail:=0}"

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$total_fail" -eq 0 ]; then
	echo "✓ pre-commit robustness tests PASSED — $total_pass assertion(s), 0 failures"
	echo "═══════════════════════════════════════════════════════════"
	exit 0
else
	echo "✗ pre-commit robustness tests FAILED — $total_pass passed, $total_fail failure(s)"
	echo "═══════════════════════════════════════════════════════════"
	exit 1
fi




# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/pre_commit_robustness_test.sh`
Expected: FAIL — "Hook aborted when user.email is missing (exit 1)" — the hook crashes at line 157 because `git config user.email` fails under `set -e` and the `|| true` fallback hasn't been added yet.

- [ ] **Step 3: Commit (Red)**

```bash
git add tests/Shell/pre_commit_robustness_test.sh
git commit -S -m $'test(hooks): add failing test for CREATOR fallback under set -e\n\nRefs: #79\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 2: Green — Make CREATOR/HOSTNAME fallbacks reachable under `set -e`

**Files:**
- Modify: `.github/hooks/pre-commit:157,159`

**Interfaces:**
- Consumes: Test 1 from `pre_commit_robustness_test.sh`
- Produces: Hook that doesn't abort when `user.email` or `hostname` is unavailable

- [ ] **Step 1: Implement the fix**

In `.github/hooks/pre-commit`, change lines 157 and 159:

**Line 157 — before:**
```bash
	CREATOR=$(git config user.email 2>/dev/null | cut -d@ -f1)
```
**Line 157 — after:**
```bash
	CREATOR=$(git config user.email 2>/dev/null | cut -d@ -f1 || true)
```

**Line 159 — before:**
```bash
	HOSTNAME=$(hostname 2>/dev/null | tr '[:upper:]' '[:lower:]')
```
**Line 159 — after:**
```bash
	HOSTNAME=$(hostname 2>/dev/null | tr '[:upper:]' '[:lower:]' || true)
```

Line 158 is already safe — it has `|| echo "unknown"` which catches pipeline failures.

- [ ] **Step 2: Run test to verify it passes**

Run: `bash tests/Shell/pre_commit_robustness_test.sh`
Expected: PASS — "Hook survives missing user.email (exit 0)"

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `bash tests/Shell/pre_commit_index_lint_test.sh`
Expected: All existing tests still pass.

- [ ] **Step 4: Commit (Green)**

```bash
git add .github/hooks/pre-commit
git commit -S -m $'fix(hooks): make CREATOR/HOSTNAME fallbacks reachable under set -e\n\nUnder set -euo pipefail, a failing \'git config user.email | cut\' aborts\nthe hook before the [ -z ] fallback runs. Add || true inside the command\nsubstitutions so the fallback logic is reachable.\n\nRefs: #79\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 3: Red — Failing tests for RCS temp file cleanup + predictable name

**Files:**
- Modify: `tests/Shell/pre_commit_robustness_test.sh` (insert Tests 2, 3, and 4 before the summary)

**Interfaces:**
- Consumes: Test infrastructure from Task 1
- Produces: Tests 2, 3, and 4 that verify the hook uses `$LINT_TMPDIR` for RCS temp files and doesn't use `$TMP.mod`

- [ ] **Step 1: Write the failing tests**

Insert the following three tests into `pre_commit_robustness_test.sh` **before** the `# ── Summary` section:

```bash
# ==============================================================================
# Test 2: RCS temp files live inside LINT_TMPDIR (no bare mktemp)
# ==============================================================================

echo ""
echo "── Test 2: RCS temp files use LINT_TMPDIR, not bare mktemp ──"
# Static analysis: verify the hook doesn't use bare mktemp for TMP/CLEAN
bare_tmp=$(grep -n 'TMP=\$(mktemp)' "$PRE_COMMIT" || true)
bare_clean=$(grep -n 'CLEAN=\$(mktemp)' "$PRE_COMMIT" || true)
if [ -z "$bare_tmp" ] && [ -z "$bare_clean" ]; then
	pass "No bare mktemp calls for TMP/CLEAN"
else
	fail "Bare mktemp found — TMP: $bare_tmp  CLEAN: $bare_clean"
fi

# ==============================================================================
# Test 3: No predictable $TMP.mod filename
# ==============================================================================

echo ""
echo "── Test 3: No predictable \$TMP.mod filename ──"
# Static analysis: verify the hook doesn't use $TMP.mod (predictable derived name)
tmp_mod=$(grep -n 'TMP\.mod' "$PRE_COMMIT" || true)
if [ -z "$tmp_mod" ]; then
	pass "No \$TMP.mod predictable filename"
else
	fail "Predictable \$TMP.mod found: $tmp_mod"
fi

# ==============================================================================
# Test 4: RCS auto-add regression — still works after temp file migration
# ==============================================================================

echo ""
echo "── Test 4: RCS auto-add regression ──"
if ! $HAS_PHP; then
	skip "php not available"
else
	T4=$(mktemp -d)
	TEMP_DIRS="$TEMP_DIRS $T4"
	setup_test_repo "$T4"
	(
		cd "$T4"

		# Create a clean .sh file without RCS header
		cat > test.sh <<'SHEOF'
#!/bin/bash
echo "hello"
SHEOF
		git add test.sh

		set +e
		HOOK_OUT=$(bash "$PRE_COMMIT" 2>&1)
		ret=$?
		set -e

		if [ "$ret" -eq 0 ] && echo "$HOOK_OUT" | grep -qF "RCS header added"; then
			pass "RCS auto-add works with LINT_TMPDIR-based temp files"
		else
			fail "RCS auto-add broken after temp file migration (exit $ret)"
		fi
	)
	rm -rf "$T4"
fi
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash tests/Shell/pre_commit_robustness_test.sh`
Expected: Tests 2 and 3 FAIL (the hook still uses bare `mktemp` and `$TMP.mod`). Test 4 PASSES (RCS auto-add works with the current code — it's a regression guard).

- [ ] **Step 3: Commit (Red)**

```bash
git add tests/Shell/pre_commit_robustness_test.sh
git commit -S -m $'test(hooks): add failing tests for RCS temp file cleanup\n\nRefs: #79\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 4: Green — Move RCS temp files into LINT_TMPDIR

**Files:**
- Modify: `.github/hooks/pre-commit:200-201,231,246,296,299,300,305`

**Interfaces:**
- Consumes: Tests 2, 3, 4 from `pre_commit_robustness_test.sh`
- Produces: Hook that creates all RCS temp files inside `$LINT_TMPDIR`, cleaned by the existing EXIT trap

- [ ] **Step 1: Implement the fix**

In `.github/hooks/pre-commit`, make the following changes:

**Line 200 — before:**
```bash
		TMP=$(mktemp)
```
**Line 200 — after:**
```bash
		TMP="$LINT_TMPDIR/rcs_blob"
		MOD="$LINT_TMPDIR/rcs_mod"
```

**Line 201 — before:**
```bash
		git show ":$file" > "$TMP" 2>/dev/null || { rm -f "$TMP"; continue; }
```
**Line 201 — after:**
```bash
		git show ":$file" > "$TMP" 2>/dev/null || { rm -f "$TMP" "$MOD"; continue; }
```

**Line 231 — before:**
```bash
		CLEAN=$(mktemp)
```
**Line 231 — after:**
```bash
		CLEAN="$LINT_TMPDIR/rcs_clean"
```

**Line 246 — before:**
```bash
			rm -f "$TMP" "$CLEAN"
```
**Line 246 — after:**
```bash
			rm -f "$TMP" "$CLEAN" "$MOD"
```

**Line 296 — before:**
```bash
		} > "$TMP.mod"
```
**Line 296 — after:**
```bash
		} > "$MOD"
```

**Line 299 — before:**
```bash
		if ! cmp -s "$TMP" "$TMP.mod"; then
```
**Line 299 — after:**
```bash
		if ! cmp -s "$TMP" "$MOD"; then
```

**Line 300 — before:**
```bash
			cp "$TMP.mod" "$file"
```
**Line 300 — after:**
```bash
			cp "$MOD" "$file"
```

**Line 305 — before:**
```bash
		rm -f "$TMP" "$CLEAN" "$TMP.mod"
```
**Line 305 — after:**
```bash
		rm -f "$TMP" "$CLEAN" "$MOD"
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bash tests/Shell/pre_commit_robustness_test.sh`
Expected: All tests PASS — no bare `mktemp`, no `$TMP.mod`, RCS auto-add still works.

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `bash tests/Shell/pre_commit_index_lint_test.sh`
Run: `bash tests/Shell/rcs_header_autoadd_test.sh`
Expected: All existing tests still pass.

- [ ] **Step 4: Commit (Green)**

```bash
git add .github/hooks/pre-commit
git commit -S -m $'fix(hooks): move RCS temp files into LINT_TMPDIR with trap cleanup\n\nReplace bare mktemp calls with paths inside $LINT_TMPDIR so the existing\nEXIT trap cleans them up on abnormal exit. Replace the predictable\n$TMP.mod derived name with $MOD inside the temp directory, eliminating\nthe symlink attack vector.\n\nRefs: #79\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 5: Red — Failing test for non-ASCII filename support

**Files:**
- Modify: `tests/Shell/pre_commit_robustness_test.sh` (insert Test 5 before the summary)

**Interfaces:**
- Consumes: Test infrastructure from Task 1
- Produces: Test 5 that verifies the hook processes files with non-ASCII names

- [ ] **Step 1: Write the failing test**

Insert the following test into `pre_commit_robustness_test.sh` **before** the `# ── Summary` section:

```bash
# ==============================================================================
# Test 5: Non-ASCII filename is processed by the hook
# ==============================================================================

echo ""
echo "── Test 5: Non-ASCII filename processed (quotePath) ──"
if ! $HAS_PHP; then
	skip "php not available"
else
	T5=$(mktemp -d)
	TEMP_DIRS="$TEMP_DIRS $T5"
	setup_test_repo "$T5"
	(
		cd "$T5"

		# Create a PHP file with non-ASCII characters in the name.
		# 'café.php' — the é (U+00E9) is UTF-8: \xc3\xa9.
		# Without fix: git diff --name-only outputs "caf\303\251.php"
		# (quoted/escaped), grep '\.php$' doesn't match (ends with "),
		# file is silently skipped by all linters.
		# With fix: git -c core.quotePath=false outputs café.php (raw),
		# grep matches, file is processed.
		printf '<?php\n\ndeclare(strict_types=1);\n\necho "hello";\n' > 'café.php'
		git add 'café.php'

		set +e
		HOOK_OUT=$(bash "$PRE_COMMIT" 2>&1)
		ret=$?
		set -e

		# The hook should process the file — either lint it or add an RCS
		# header. We check that the filename appears in the output.
		if echo "$HOOK_OUT" | grep -qF 'café.php'; then
			pass "Non-ASCII filename 'café.php' processed by hook"
		else
			fail "Non-ASCII filename not processed (quotePath escaping)"
		fi
	)
	rm -rf "$T5"
fi
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/pre_commit_robustness_test.sh`
Expected: Test 5 FAILS — the filename `café.php` doesn't appear in the hook output because `git diff --cached --name-only` outputs the escaped form `"caf\303\251.php"` which doesn't match `grep '\.php$'` (it ends with `"`).

- [ ] **Step 3: Commit (Red)**

```bash
git add tests/Shell/pre_commit_robustness_test.sh
git commit -S -m $'test(hooks): add failing test for non-ASCII filename support\n\nRefs: #79\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 6: Green — Disable `core.quotePath` for non-ASCII filename support

**Files:**
- Modify: `.github/hooks/pre-commit` — 7 occurrences of `git diff --cached --name-only`

**Interfaces:**
- Consumes: Test 5 from `pre_commit_robustness_test.sh`
- Produces: Hook that correctly processes files with non-ASCII names

- [ ] **Step 1: Implement the fix**

In `.github/hooks/pre-commit`, replace all 7 occurrences of:

```bash
git diff --cached --name-only --diff-filter=ACMR
```

with:

```bash
git -c core.quotePath=false diff --cached --name-only --diff-filter=ACMR
```

The 7 lines to change are: **29, 49, 75, 89, 103, 128, 154**.

**Do NOT change line 169** (`git diff --quiet -- "$file"`) — this doesn't use `--name-only` and doesn't output filenames; it only checks the exit code.

- [ ] **Step 2: Run test to verify it passes**

Run: `bash tests/Shell/pre_commit_robustness_test.sh`
Expected: All 5 tests PASS.

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `bash tests/Shell/pre_commit_index_lint_test.sh`
Run: `bash tests/Shell/rcs_header_autoadd_test.sh`
Run: `bash tests/Shell/hook_portability_test.sh`
Expected: All existing tests still pass.

- [ ] **Step 4: Commit (Green — closes #79)**

```bash
git add .github/hooks/pre-commit
git commit -S -m $'fix(hooks): disable quotePath for non-ASCII filename support\n\nUnder default core.quotePath=true, git escapes non-ASCII bytes in\nfilenames (e.g. café.php → "caf\\303\\251.php"), causing grep filters\nto silently skip them. Add -c core.quotePath=false to all 7\ngit diff --cached --name-only calls so linters receive raw filenames.\n\nFixes: #79\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```
