#!/usr/bin/env bash
# $KYAULabs: pre_commit_index_lint_test.sh kyau@akira.kyaulabs 2026/07/11 -0700 Exp $





# ── Repro-first tests for pre-commit index-based linting ──────────────────────
# Bug under test (#77):
#   The pre-commit hook selects staged files via `git diff --cached
#   --name-only`, but passes those paths to linters which read the
#   working-tree versions.  This creates two failure modes:
#     1. False negative:  broken code is staged, then fixed in the working
#        tree.  Linters read the clean WT and pass; the broken staged blob
#        lands in the commit undetected.
#     2. False positive:  clean code is staged, then broken in the working
#        tree.  Linters read the broken WT and block the commit even though
#        the staged blob is clean.
#
# Fix:
#   All five linters (php -l, php-cs-fixer, stylelint, eslint, shellcheck)
#   must lint the staged (index) blob rather than the working-tree file.
#
# Each test creates an isolated git repo, symlinks vendor/ and node_modules/
# from the project so linters are available, copies linter configs, then stages
# a file, mutates the working tree opposite to the staged version, and
# verifies that the linter inspects the correct (staged) version.

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

# Usage:  setup_test_repo <tmpdir_var>
# Sets up a git repo in the named temp directory with:
#   - git config (no gpgsign, test user)
#   - symlinked vendor/ and node_modules/ (so linters are callable)
#   - copied linter configs (.php-cs-fixer.dist.php, eslint.config.mjs,
#     .stylelintrc.json)
# Caller must still create and stage the test file(s).
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

# ── Linter availability flags (computed once) ──────────────────────────────────

HAS_PHP=false
HAS_CS_FIXER=false
HAS_STYLELINT=false
HAS_ESLINT=false
HAS_SHELLCHECK=false

command -v php > /dev/null 2>&1 && HAS_PHP=true
[ -x "$REPO_ROOT/vendor/bin/php-cs-fixer" ] && HAS_CS_FIXER=true
[ -d "$REPO_ROOT/node_modules/stylelint" ] && HAS_STYLELINT=true
[ -d "$REPO_ROOT/node_modules/eslint" ] && HAS_ESLINT=true
command -v shellcheck > /dev/null 2>&1 && HAS_SHELLCHECK=true

# ==============================================================================
# Test 1: False negative — PHP syntax
# ==============================================================================

echo ""
echo "── Test 1: False negative — PHP syntax ──"
if ! $HAS_PHP; then
	skip "php not available"
else
	T1=$(mktemp -d)
	TEMP_DIRS="$TEMP_DIRS $T1"
	setup_test_repo "$T1"
	(
		cd "$T1"

		# Stage broken PHP (missing semicolon = syntax error; has
		# declare(strict_types=1) so php-cs-fixer does not interfere)
		cat > test.php <<'PHPEOF'
<?php

declare(strict_types=1);

echo "test"
PHPEOF
		git add test.php

		# Fix in working tree (add semicolon — now valid)
		cat > test.php <<'PHPEOF'
<?php

declare(strict_types=1);

echo "test";
PHPEOF

		set +e
		HOOK_OUT=$(bash "$PRE_COMMIT" 2>&1)
		ret=$?
		set -e

		# Bug: hook lints working tree (clean), so php -l passes.
		# The staged blob is broken but goes undetected.
		# After fix: hook must lint staged (broken) version → exit non-zero
		# AND report PHP parse error.
		if [ "$ret" -ne 0 ] && echo "$HOOK_OUT" | grep -qF "Parse error"; then
			pass "Hook blocked for staged syntax error (exit $ret, parse error found)"
		else
			fail "False negative: broken staged PHP not caught (exit $ret, no parse error in output)"
		fi
	)
	rm -rf "$T1"
fi

# ==============================================================================
# Test 2: False positive — PHP syntax
# ==============================================================================

echo "── Test 2: False positive — PHP syntax ──"
if ! $HAS_PHP; then
	skip "php not available"
else
	T2=$(mktemp -d)
	TEMP_DIRS="$TEMP_DIRS $T2"
	setup_test_repo "$T2"
	(
		cd "$T2"

		# Stage clean PHP (valid syntax, has declare(strict_types=1))
		cat > test.php <<'PHPEOF'
<?php

declare(strict_types=1);

echo "test";
PHPEOF
		git add test.php

		# Break in working tree (remove semicolon = syntax error)
		cat > test.php <<'PHPEOF'
<?php

declare(strict_types=1);

echo "test"
PHPEOF

		set +e
		HOOK_OUT=$(bash "$PRE_COMMIT" 2>&1)
		ret=$?
		set -e

		# Bug: hook lints working tree (broken), so php -l fails and
		# blocks the commit even though the staged blob is clean.
		# After fix: hook must lint staged (clean) version → no parse error.
		if echo "$HOOK_OUT" | grep -qF "Parse error"; then
			fail "False positive: clean staged PHP blocked by WT syntax error (parse error found in output)"
		else
			pass "No false-positive parse error for clean staged PHP"
		fi
	)
	rm -rf "$T2"
fi

# ==============================================================================
# Test 3: False negative — php-cs-fixer
# ==============================================================================

echo "── Test 3: False negative — php-cs-fixer ──"
if ! $HAS_CS_FIXER; then
	skip "php-cs-fixer not available"
else
	T3=$(mktemp -d)
	TEMP_DIRS="$TEMP_DIRS $T3"
	setup_test_repo "$T3"
	(
		cd "$T3"

		# Stage PHP with PSR-12 violation (missing space before brace,
		# wrong indent)
		cat > test.php <<'PHPEOF'
<?php

declare(strict_types=1);
if(true){
echo "test";
}
PHPEOF
		git add test.php

		# Fix in working tree (PSR-12 compliant)
		cat > test.php <<'PHPEOF'
<?php

declare(strict_types=1);

if (true) {
    echo "test";
}
PHPEOF

		set +e
		HOOK_OUT=$(bash "$PRE_COMMIT" 2>&1)
		ret=$?
		set -e

		# Bug: hook lints working tree (clean), so php-cs-fixer passes.
		# After fix: hook must lint staged (broken) version → exit non-zero
		# AND report diff.
		if [ "$ret" -ne 0 ] && echo "$HOOK_OUT" | grep -qF "begin diff"; then
			pass "Hook blocked for staged CS violation (exit $ret, diff found)"
		else
			fail "False negative: staged CS violation not caught (exit $ret, no diff in output)"
		fi
	)
	rm -rf "$T3"
fi

# ==============================================================================
# Test 4: False positive — php-cs-fixer
# ==============================================================================

echo "── Test 4: False positive — php-cs-fixer ──"
if ! $HAS_CS_FIXER; then
	skip "php-cs-fixer not available"
else
	T4=$(mktemp -d)
	TEMP_DIRS="$TEMP_DIRS $T4"
	setup_test_repo "$T4"
	(
		cd "$T4"

		# Stage PSR-12 compliant PHP
		cat > test.php <<'PHPEOF'
<?php

declare(strict_types=1);

if (true) {
    echo "test";
}
PHPEOF
		git add test.php

		# Break in working tree (violate PSR-12 formatting)
		cat > test.php <<'PHPEOF'
<?php

declare(strict_types=1);
if(true){
echo "test";
}
PHPEOF

		set +e
		HOOK_OUT=$(bash "$PRE_COMMIT" 2>&1)
		ret=$?
		set -e

		# Bug: hook lints working tree (broken), so cs-fixer fails and
		# blocks the commit even though the staged blob is clean.
		# After fix: hook must lint staged (clean) version → no diff.
		if echo "$HOOK_OUT" | grep -qF "begin diff"; then
			fail "False positive: clean staged PHP blocked by WT CS violation (diff found in output)"
		else
			pass "No false-positive CS diff for clean staged PHP"
		fi
	)
	rm -rf "$T4"
fi

# ==============================================================================
# Test 5: False negative — Stylelint
# ==============================================================================

echo "── Test 5: False negative — Stylelint ──"
if ! $HAS_STYLELINT; then
	skip "stylelint not available"
else
	T5=$(mktemp -d)
	TEMP_DIRS="$TEMP_DIRS $T5"
	setup_test_repo "$T5"
	(
		cd "$T5"

		# Stage SCSS with stylelint violation (missing empty line before rule)
		cat > test.scss <<'SCSSEOF'
$color: red;
.test {
  color: red;
}
SCSSEOF
		git add test.scss

		# Fix in working tree (add empty line before rule)
		cat > test.scss <<'SCSSEOF'
$color: red;

.test {
  color: red;
}
SCSSEOF

		set +e
		HOOK_OUT=$(bash "$PRE_COMMIT" 2>&1)
		ret=$?
		set -e

		# Bug: hook lints working tree (clean), so stylelint passes.
		# After fix: hook must lint staged (broken) version → exit non-zero
		# AND report rule-empty-line-before.
		if [ "$ret" -ne 0 ] && echo "$HOOK_OUT" | grep -qF "rule-empty-line-before"; then
			pass "Hook blocked for staged stylelint violation (exit $ret)"
		else
			fail "False negative: staged stylelint violation not caught (exit $ret, no rule-empty-line-before in output)"
		fi
	)
	rm -rf "$T5"
fi

# ==============================================================================
# Test 6: False positive — Stylelint
# ==============================================================================

echo "── Test 6: False positive — Stylelint ──"
if ! $HAS_STYLELINT; then
	skip "stylelint not available"
else
	T6=$(mktemp -d)
	TEMP_DIRS="$TEMP_DIRS $T6"
	setup_test_repo "$T6"
	(
		cd "$T6"

		# Stage SCSS with correct formatting (empty line before rule)
		cat > test.scss <<'SCSSEOF'
$color: red;

.test {
  color: red;
}
SCSSEOF
		git add test.scss

		# Break in working tree (remove empty line)
		cat > test.scss <<'SCSSEOF'
$color: red;
.test {
  color: red;
}
SCSSEOF

		set +e
		HOOK_OUT=$(bash "$PRE_COMMIT" 2>&1)
		ret=$?
		set -e

		# Bug: hook lints working tree (broken), so stylelint fails and
		# blocks the commit even though the staged blob is clean.
		# After fix: hook must lint staged (clean) version → no stylelint error.
		if echo "$HOOK_OUT" | grep -qF "rule-empty-line-before"; then
			fail "False positive: clean staged SCSS blocked by WT stylelint violation"
		else
			pass "No false-positive stylelint error for clean staged SCSS"
		fi
	)
	rm -rf "$T6"
fi

# ==============================================================================
# Test 7: False negative — ESLint
# ==============================================================================

echo "── Test 7: False negative — ESLint ──"
if ! $HAS_ESLINT; then
	skip "eslint not available"
else
	T7=$(mktemp -d)
	TEMP_DIRS="$TEMP_DIRS $T7"
	setup_test_repo "$T7"
	(
		cd "$T7"
		mkdir -p cdn/js

		# Stage JS with indent violation (spaces instead of tabs)
		cat > cdn/js/test.js <<'JSEOF'
function hello() {
    var x = 1;
}
JSEOF
		git add cdn/js/test.js

		# Fix in working tree (tabs)
		printf 'function hello() {\n\tvar x = 1;\n}\n' > cdn/js/test.js

		set +e
		HOOK_OUT=$(bash "$PRE_COMMIT" 2>&1)
		ret=$?
		set -e

		# Bug: hook lints working tree (clean), so eslint passes (warnings only).
		# After fix: hook must lint staged (broken) version → exit non-zero
		# AND report indent error.
		if [ "$ret" -ne 0 ] && echo "$HOOK_OUT" | grep -qF "indent"; then
			pass "Hook blocked for staged eslint indent violation (exit $ret)"
		else
			fail "False negative: staged eslint violation not caught (exit $ret, no indent error in output)"
		fi
	)
	rm -rf "$T7"
fi

# ==============================================================================
# Test 8: False positive — ESLint
# ==============================================================================

echo "── Test 8: False positive — ESLint ──"
if ! $HAS_ESLINT; then
	skip "eslint not available"
else
	T8=$(mktemp -d)
	TEMP_DIRS="$TEMP_DIRS $T8"
	setup_test_repo "$T8"
	(
		cd "$T8"
		mkdir -p cdn/js

		# Stage JS with correct tab indentation
		printf 'function hello() {\n\tvar x = 1;\n}\n' > cdn/js/test.js
		git add cdn/js/test.js

		# Break in working tree (spaces instead of tabs)
		cat > cdn/js/test.js <<'JSEOF'
function hello() {
    var x = 1;
}
JSEOF

		set +e
		HOOK_OUT=$(bash "$PRE_COMMIT" 2>&1)
		ret=$?
		set -e

		# Bug: hook lints working tree (broken), so eslint fails and
		# blocks the commit even though the staged blob is clean.
		# After fix: hook must lint staged (clean) version → no indent error.
		if echo "$HOOK_OUT" | grep -qF "indent"; then
			fail "False positive: clean staged JS blocked by WT eslint indent error"
		else
			pass "No false-positive eslint indent error for clean staged JS"
		fi
	)
	rm -rf "$T8"
fi

# ==============================================================================
# Test 9: False negative — Shellcheck
# ==============================================================================

echo "── Test 9: False negative — Shellcheck ──"
if ! $HAS_SHELLCHECK; then
	skip "shellcheck not available"
else
	T9=$(mktemp -d)
	TEMP_DIRS="$TEMP_DIRS $T9"
	setup_test_repo "$T9"
	(
		cd "$T9"

		# Stage shell script with shellcheck issue (semicolon after 'do')
		cat > test.sh <<'SHEOF'
#!/bin/bash
for f in *; do; echo "$f"; done
SHEOF
		git add test.sh

		# Fix in working tree (remove stray semicolon)
		cat > test.sh <<'SHEOF'
#!/bin/bash
for f in *; do echo "$f"; done
SHEOF

		set +e
		HOOK_OUT=$(bash "$PRE_COMMIT" 2>&1)
		ret=$?
		set -e

		# Bug: hook lints working tree (clean), so shellcheck finds nothing.
		# Note: shellcheck exits 0 even for errors, so we check for SC1059
		# in the output rather than exit status.
		# After fix: hook must lint staged (broken) version → output contains SC1059.
		if echo "$HOOK_OUT" | grep -qF "SC1059"; then
			pass "Hook reported shellcheck SC1059 for staged violation"
		else
			fail "False negative: staged shellcheck violation not caught (no SC1059 in output)"
		fi
	)
	rm -rf "$T9"
fi

# ==============================================================================
# Test 10: False positive — Shellcheck
# ==============================================================================

echo "── Test 10: False positive — Shellcheck ──"
if ! $HAS_SHELLCHECK; then
	skip "shellcheck not available"
else
	T10=$(mktemp -d)
	TEMP_DIRS="$TEMP_DIRS $T10"
	setup_test_repo "$T10"
	(
		cd "$T10"

		# Stage clean shell script
		cat > test.sh <<'SHEOF'
#!/bin/bash
echo "hello"
SHEOF
		git add test.sh

		# Break in working tree (add stray semicolon after 'do')
		cat > test.sh <<'SHEOF'
#!/bin/bash
for f in *; do; echo "$f"; done
SHEOF

		set +e
		HOOK_OUT=$(bash "$PRE_COMMIT" 2>&1)
		ret=$?
		set -e

		# Bug: hook lints working tree (broken), so shellcheck reports
		# SC1059 even though the staged blob is clean.
		# After fix: hook must lint staged (clean) version → no SC1059.
		if echo "$HOOK_OUT" | grep -qF "SC1059"; then
			fail "False positive: clean staged shell blocked by WT shellcheck SC1059"
		else
			pass "No false-positive shellcheck SC1059 for clean staged shell"
		fi
	)
	rm -rf "$T10"
fi

# ==============================================================================
# Test 11: Regression — clean PHP, WT matches index, hook passes
# ==============================================================================

echo "── Test 11: Regression — clean PHP, WT == index ──"
if ! $HAS_PHP; then
	skip "php not available"
else
	T11=$(mktemp -d)
	TEMP_DIRS="$TEMP_DIRS $T11"
	setup_test_repo "$T11"
	(
		cd "$T11"

		# PSR-12 compliant PHP with declare(strict_types=1) — all linters pass
		cat > test.php <<'PHPEOF'
<?php

declare(strict_types=1);

echo "hello";
PHPEOF
		git add test.php
		# WT matches index (no unstaged changes)

		set +e
		bash "$PRE_COMMIT" > /dev/null 2>&1
		ret=$?
		set -e

		if [ "$ret" -eq 0 ]; then
			pass "Regression: hook passes for clean staged PHP (exit 0)"
		else
			fail "Regression: hook blocked clean staged PHP unexpectedly (exit $ret)"
		fi
	)
	rm -rf "$T11"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

total_pass=$(grep -c "PASS" "$RESULT_FILE" 2>/dev/null || true)
total_fail=$(grep -c "FAIL" "$RESULT_FILE" 2>/dev/null || true)
: "${total_pass:=0}"
: "${total_fail:=0}"

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$total_fail" -eq 0 ]; then
	echo "✓ pre-commit index lint tests PASSED — $total_pass assertion(s), 0 failures"
	echo "═══════════════════════════════════════════════════════════"
	exit 0
else
	echo "✗ pre-commit index lint tests FAILED — $total_pass passed, $total_fail failure(s)"
	echo "═══════════════════════════════════════════════════════════"
	exit 1
fi





# vim: ft=sh sts=4 sw=4 ts=4 et :
