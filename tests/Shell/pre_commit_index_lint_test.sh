#!/usr/bin/env bash
# $KYAULabs: pre_commit_index_lint_test.sh kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

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

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

skip() { echo "SKIP $*"; }

PRE_COMMIT="$REPO_ROOT/.github/hooks/pre-commit"

if [ ! -f "$PRE_COMMIT" ]; then
	fail "Cannot find pre-commit hook at $PRE_COMMIT"
	exit 1
fi

# Route declared tools through the fake prism-tool boundary (Task 8). The fake
# delegates to the fixture's real linters via the symlinked vendor/node_modules;
# fake in-range Semgrep/OCR sit on PATH for the mandatory doctor check.
export PRISM_TOOL="$REPO_ROOT/tests/Shell/fixtures/fake-prism-tool.sh"
export PATH="$REPO_ROOT/tests/Shell/fixtures/bin:$PATH"

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
	register_temp_dir "$T1"
	setup_linter_repo "$T1"
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
fi

# ==============================================================================
# Test 2: False positive — PHP syntax
# ==============================================================================

echo "── Test 2: False positive — PHP syntax ──"
if ! $HAS_PHP; then
	skip "php not available"
else
	T2=$(mktemp -d)
	register_temp_dir "$T2"
	setup_linter_repo "$T2"
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
fi

# ==============================================================================
# Test 3: False negative — php-cs-fixer
# ==============================================================================

echo "── Test 3: False negative — php-cs-fixer ──"
if ! $HAS_CS_FIXER; then
	skip "php-cs-fixer not available"
else
	T3=$(mktemp -d)
	register_temp_dir "$T3"
	setup_linter_repo "$T3"
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
fi

# ==============================================================================
# Test 4: False positive — php-cs-fixer
# ==============================================================================

echo "── Test 4: False positive — php-cs-fixer ──"
if ! $HAS_CS_FIXER; then
	skip "php-cs-fixer not available"
else
	T4=$(mktemp -d)
	register_temp_dir "$T4"
	setup_linter_repo "$T4"
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
fi

# ==============================================================================
# Test 5: False negative — Stylelint
# ==============================================================================

echo "── Test 5: False negative — Stylelint ──"
if ! $HAS_STYLELINT; then
	skip "stylelint not available"
else
	T5=$(mktemp -d)
	register_temp_dir "$T5"
	setup_linter_repo "$T5"
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
fi

# ==============================================================================
# Test 6: False positive — Stylelint
# ==============================================================================

echo "── Test 6: False positive — Stylelint ──"
if ! $HAS_STYLELINT; then
	skip "stylelint not available"
else
	T6=$(mktemp -d)
	register_temp_dir "$T6"
	setup_linter_repo "$T6"
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
fi

# ==============================================================================
# Test 7: False negative — ESLint
# ==============================================================================

echo "── Test 7: False negative — ESLint ──"
if ! $HAS_ESLINT; then
	skip "eslint not available"
else
	T7=$(mktemp -d)
	register_temp_dir "$T7"
	setup_linter_repo "$T7"
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
fi

# ==============================================================================
# Test 8: False positive — ESLint
# ==============================================================================

echo "── Test 8: False positive — ESLint ──"
if ! $HAS_ESLINT; then
	skip "eslint not available"
else
	T8=$(mktemp -d)
	register_temp_dir "$T8"
	setup_linter_repo "$T8"
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
fi

# ==============================================================================
# Test 9: False negative — Shellcheck
# ==============================================================================

echo "── Test 9: False negative — Shellcheck ──"
if ! $HAS_SHELLCHECK; then
	skip "shellcheck not available"
else
	T9=$(mktemp -d)
	register_temp_dir "$T9"
	setup_linter_repo "$T9"
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
fi

# ==============================================================================
# Test 10: False positive — Shellcheck
# ==============================================================================

echo "── Test 10: False positive — Shellcheck ──"
if ! $HAS_SHELLCHECK; then
	skip "shellcheck not available"
else
	T10=$(mktemp -d)
	register_temp_dir "$T10"
	setup_linter_repo "$T10"
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
fi

# ==============================================================================
# Test 11: Regression — clean PHP, WT matches index, hook passes
# ==============================================================================

echo "── Test 11: Regression — clean PHP, WT == index ──"
if ! $HAS_PHP; then
	skip "php not available"
else
	T11=$(mktemp -d)
	register_temp_dir "$T11"
	setup_linter_repo "$T11"
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
fi

# ==============================================================================
# Test 12: False negative — Markdown
# ==============================================================================

echo "── Test 12: False negative — Markdown ──"
T12=$(mktemp -d)
register_temp_dir "$T12"
setup_linter_repo "$T12"
(
	cd "$T12"
	mkdir -p docs
	printf '# Guide\n\n### Broken jump\n' > docs/guide.md
	git add docs/guide.md
	printf '# Guide\n\n## Fixed\n' > docs/guide.md

	set +e
	HOOK_OUT=$(bash "$PRE_COMMIT" 2>&1)
	ret=$?
	set -e

	if [ "$ret" -ne 0 ] && echo "$HOOK_OUT" | grep -qF "MD001"; then
		pass "Hook blocked for staged Markdown heading jump (exit $ret, MD001 found)"
	else
		fail "False negative: staged Markdown violation not caught (exit $ret, no MD001 in output)"
	fi
)

# ── Summary ────────────────────────────────────────────────────────────

print_summary "pre-commit index lint"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
