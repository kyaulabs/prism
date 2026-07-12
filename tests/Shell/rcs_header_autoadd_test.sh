#!/usr/bin/env bash
# $KYAULabs: rcs_header_autoadd_test.sh kyau@akira.kyaulabs 2026/07/11 -0700 Exp $





# ── Repro-first tests for pre-commit RCS auto-add block ────────────────────────
# Bugs under test (#28):
#   1. The auto-add overwrites the working-tree file from the staged blob; with
#      partial staging (git add -p), unstaged hunks are silently destroyed.
#   2. The trailing vim modeline is appended unconditionally, injecting visible
#      text into PHP pages that end in HTML context (after ?>).
#
# Fix:
#   1. Run `git diff --quiet -- "$file"` before rewriting; if unstaged changes
#      exist, print an actionable error and exit 1.
#   2. Gate the modeline on PHP context via an awk state-machine that tracks
#      <?php/<?=/<? open and ?> close; skip the modeline when the file ends
#      outside PHP context.

set -euo pipefail

RESULT_FILE=$(mktemp)
TEMP_DIRS=""
trap 'rm -f "$RESULT_FILE"; [ -n "$TEMP_DIRS" ] && rm -rf $TEMP_DIRS' EXIT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
RESET=$'\033[0m'

pass() { echo "${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }

# ── Resolve paths BEFORE any cd ────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRE_COMMIT="$REPO_ROOT/.github/hooks/pre-commit"

if [ ! -f "$PRE_COMMIT" ]; then
	fail "Cannot find pre-commit hook at $PRE_COMMIT"
	exit 1
fi

# ── Test 1: Partial-stage blocks commit, working tree preserved ────────────────

echo ""
echo "── Test 1: Partial-stage blocks, working tree preserved ──"
T1=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T1"
(
	cd "$T1"
	git init --quiet
	git config commit.gpgsign false
	git config user.email "test@example.com"
	git config user.name "Test User"

	# Create a PHP file WITHOUT an RCS header
	cat > file.php <<'PHPEOF'
<?php
echo "staged hunk";
PHPEOF
	# Stage the file fully (staged blob = 2 lines)
	git add file.php

	# Append an UNSTAGED hunk to the working tree (simulates git add -p)
	cat >> file.php <<'PHPEOF2'
echo "unstaged hunk";
PHPEOF2
	# Capture working-tree checksum BEFORE the hook runs
	WT_HASH=$(sha256sum file.php | awk '{print $1}')

	set +e
	bash "$PRE_COMMIT" > /dev/null 2>&1
	ret=$?
	set -e

	# Bug 1: Without the guard, the hook overwrites the working tree
	# and exits 0. After the fix, it blocks (exit 1) and the working
	# tree is preserved byte-for-byte.
	if [ "$ret" -ne 0 ]; then
		pass "Partial-stage blocked commit (exit $ret)"
	else
		fail "Partial-stage was NOT blocked (exit 0 — auto-add overwrite bug)"
	fi

	WT_AFTER=$(sha256sum file.php | awk '{print $1}')
	if [ "$WT_HASH" = "$WT_AFTER" ]; then
		pass "Working tree preserved byte-for-byte"
	else
		fail "Working tree CHANGED — unstaged hunk was destroyed"
	fi

	# Staged blob should still have NO header (hook did NOT rewrite it)
	# shellcheck disable=SC2016  # $KYAULabs is a literal RCS marker
	if git show ":file.php" 2>/dev/null | head -10 | grep -qF '$KYAULabs:'; then
		fail "Staged blob gained RCS header (should have been blocked)"
	else
		pass "Staged blob unchanged (no header injected)"
	fi
)
rm -rf "$T1"

# ── Test 2: Fully staged file without header gets header + modeline ────────────

echo "── Test 2: Full-stage adds header and modeline ──"
T2=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T2"
(
	cd "$T2"
	git init --quiet
	git config commit.gpgsign false
	git config user.email "test@example.com"
	git config user.name "Test User"

	# PHP file ending in PHP context (no ?>), no RCS header
	cat > file.php <<'PHPEOF'
<?php
echo "hello";
PHPEOF
	git add file.php

	set +e
	bash "$PRE_COMMIT" > /dev/null 2>&1
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "Full-stage commit proceeds (exit 0)"
	else
		fail "Full-stage commit blocked unexpectedly (exit $ret)"
	fi

	# Staged blob should now have an RCS header
	# shellcheck disable=SC2016  # $KYAULabs is a literal RCS marker
	if git show ":file.php" 2>/dev/null | head -10 | grep -qF '$KYAULabs:'; then
		pass "RCS header added to staged blob"
	else
		fail "RCS header NOT added (missing from staged blob)"
	fi

	# Modeline should be present (file ends in PHP context)
	if git show ":file.php" 2>/dev/null | tail -1 | grep -q 'vim: ft=php'; then
		pass "Vim modeline present"
	else
		fail "Vim modeline missing (expected for PHP-context file)"
	fi
)
rm -rf "$T2"

# ── Test 3: Modeline skipped for ?>-terminated PHP (Bug 2) ─────────────────────

echo "── Test 3: Modeline skipped for ?>-terminated PHP ──"
T3=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T3"
(
	cd "$T3"
	git init --quiet
	git config commit.gpgsign false
	git config user.email "test@example.com"
	git config user.name "Test User"

	# PHP file ending with ?> (outside PHP context), no RCS header
	cat > file.php <<'PHPEOF'
<?php
echo "hello";
?>
PHPEOF
	git add file.php

	set +e
	bash "$PRE_COMMIT" > /dev/null 2>&1
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "Full-stage commit proceeds (exit 0)"
	else
		fail "Full-stage commit blocked unexpectedly (exit $ret)"
	fi

	# Header should still be added
	# shellcheck disable=SC2016  # $KYAULabs is a literal RCS marker
	if git show ":file.php" 2>/dev/null | head -10 | grep -qF '$KYAULabs:'; then
		pass "RCS header added to staged blob"
	else
		fail "RCS header NOT added (missing from staged blob)"
	fi

	# Modeline must NOT be present — file ends outside PHP context (after ?>)
	if git show ":file.php" 2>/dev/null | tail -1 | grep -q 'vim: ft=php'; then
		fail "Vim modeline appended after ?> (visible-text-injection bug)"
	else
		pass "Vim modeline correctly skipped (ends outside PHP context)"
	fi
)
rm -rf "$T3"

# ── Test 4: declare(strict_types=1) preserved exactly once ────────────────────

echo "── Test 4: declare line preserved once, not duplicated ──"
T4=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T4"
(
	cd "$T4"
	git init --quiet
	git config commit.gpgsign false
	git config user.email "test@example.com"
	git config user.name "Test User"

	# PHP file with declare(strict_types=1); on line 2, no RCS header
	cat > file.php <<'PHPEOF'
<?php
declare(strict_types=1);
echo "hello";
PHPEOF
	git add file.php

	set +e
	bash "$PRE_COMMIT" > /dev/null 2>&1
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "Full-stage commit proceeds with declare (exit 0)"
	else
		fail "Full-stage commit blocked unexpectedly with declare (exit $ret)"
	fi

	# Staged blob should have exactly one declare(strict_types=1); line
	declare_count=$(git show ":file.php" 2>/dev/null | grep -cF 'declare(strict_types=1);' || true)
	if [ "$declare_count" -eq 1 ]; then
		pass "declare(strict_types=1) appears exactly once"
	else
		fail "declare(strict_types=1) appears $declare_count time(s) (expected 1)"
	fi

	# RCS header should be present
	# shellcheck disable=SC2016  # $KYAULabs is a literal RCS marker
	if git show ":file.php" 2>/dev/null | head -10 | grep -qF '$KYAULabs:'; then
		pass "RCS header added to staged blob"
	else
		fail "RCS header NOT added (missing from staged blob)"
	fi

	# First line must remain <?php
	first_line=$(git show ":file.php" 2>/dev/null | head -1)
	if [ "$first_line" = '<?php' ]; then
		pass "First line preserved as <?php"
	else
		fail "First line is '$first_line' (expected '<?php')"
	fi
)
rm -rf "$T4"

# ── Test 5: Duplicate headers/modelines are normalized to one each ────────────

echo "── Test 5: Duplicate headers/modelines normalized ──"
T5=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T5"
(
	cd "$T5"
	git init --quiet
	git config commit.gpgsign false
	git config user.email "test@example.com"
	git config user.name "Test User"

	# Broken state: 3 headers, declare after them, 5 modelines
	# shellcheck disable=SC2016  # $KYAULabs is a literal RCS marker
	{
		echo '<?php'
		echo '# $KYAULabs: broken.php t@t.t 2026/07/09 Exp $'
		echo '# $KYAULabs: broken.php t@t.t 2026/07/09 Exp $'
		echo '# $KYAULabs: broken.php t@t.t 2026/07/09 Exp $'
		echo 'declare(strict_types=1);'
		echo 'echo 1;'
		echo '// vim: ft=php sts=4 sw=4 ts=4 et :'
		echo '// vim: ft=php sts=4 sw=4 ts=4 et :'
		echo '// vim: ft=php sts=4 sw=4 ts=4 et :'
		echo '// vim: ft=php sts=4 sw=4 ts=4 et :'
		echo '// vim: ft=php sts=4 sw=4 ts=4 et :'
	} > broken.php

	git add broken.php

	set +e
	bash "$PRE_COMMIT" > /dev/null 2>&1
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "Duplicate normalization commit proceeds (exit 0)"
	else
		fail "Duplicate normalization commit blocked (exit $ret)"
	fi

	# shellcheck disable=SC2016  # $KYAULabs is a literal RCS marker
	header_count=$(grep -cF '$KYAULabs:' broken.php 2>/dev/null || true)
	modeline_count=$(grep -c 'vim: ft=php' broken.php 2>/dev/null || true)
	declare_line=$(grep -n 'declare(strict_types=1);' broken.php | head -1 | cut -d: -f1)
	# shellcheck disable=SC2016  # $KYAULabs is a literal RCS marker
	header_line=$(grep -nF '$KYAULabs:' broken.php | head -1 | cut -d: -f1)

	if [ "$header_count" -eq 1 ]; then
		pass "Exactly 1 header after normalization (was 3)"
	else
		fail "Expected 1 header, got $header_count"
	fi

	if [ "$modeline_count" -eq 1 ]; then
		pass "Exactly 1 modeline after normalization (was 5)"
	else
		fail "Expected 1 modeline, got $modeline_count"
	fi

	if [ "$declare_line" -lt "$header_line" ]; then
		pass "declare(strict_types=1) precedes RCS header"
	else
		fail "declare(strict_types=1) must precede header (declare=$declare_line, header=$header_line)"
	fi
)
rm -rf "$T5"

# ── Test 6: Headerless file with existing modeline keeps exactly one modeline ──

echo "── Test 6: Headerless file with modeline not duplicated ──"
T6=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T6"
(
	cd "$T6"
	git init --quiet
	git config commit.gpgsign false
	git config user.email "test@example.com"
	git config user.name "Test User"

	# File with modeline but NO header
	{
		echo '<?php'
		echo 'declare(strict_types=1);'
		echo 'echo 1;'
		echo '// vim: ft=php sts=4 sw=4 ts=4 et :'
	} > hasml.php

	git add hasml.php

	set +e
	bash "$PRE_COMMIT" > /dev/null 2>&1
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "Modeline-not-duplicated commit proceeds (exit 0)"
	else
		fail "Modeline-not-duplicated commit blocked (exit $ret)"
	fi

	modeline_count=$(grep -c 'vim: ft=php' hasml.php 2>/dev/null || true)
	# shellcheck disable=SC2016  # $KYAULabs is a literal RCS marker
	header_count=$(grep -cF '$KYAULabs:' hasml.php 2>/dev/null || true)

	if [ "$modeline_count" -eq 1 ]; then
		pass "Exactly 1 modeline (not duplicated)"
	else
		fail "Expected 1 modeline, got $modeline_count"
	fi

	if [ "$header_count" -eq 1 ]; then
		pass "RCS header added"
	else
		fail "Expected 1 RCS header, got $header_count"
	fi
)
rm -rf "$T6"

# ── Summary ───────────────────────────────────────────────────────────────────

total_pass=$(grep -c "PASS" "$RESULT_FILE" 2>/dev/null || true)
total_fail=$(grep -c "FAIL" "$RESULT_FILE" 2>/dev/null || true)
: "${total_pass:=0}"
: "${total_fail:=0}"

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$total_fail" -eq 0 ]; then
	echo "✓ rcs-header autoadd tests PASSED — $total_pass assertion(s), 0 failures"
	echo "═══════════════════════════════════════════════════════════"
	exit 0
else
	echo "✗ rcs-header autoadd tests FAILED — $total_pass passed, $total_fail failure(s)"
	echo "═══════════════════════════════════════════════════════════"
	exit 1
fi





# vim: ft=sh sts=4 sw=4 ts=4 et :
