#!/usr/bin/env bash
# $KYAULabs: coverage_gate_test.sh kyau@nova 2026/07/17 -0700 Exp $





# ── Tests for coverage-gate.php changed-file coverage gate ───────────────────
# Verifies that the script correctly parses Clover XML, intersects with
# changed files from stdin, and enforces >=80% per-file coverage.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file
SCRIPT="$REPO_ROOT/.github/scripts/coverage-gate.php"

if [ ! -f "$SCRIPT" ]; then
	fail "Cannot find coverage-gate.php at $SCRIPT"
	exit 1
fi

# ── Helper: build a minimal Clover XML fixture ───────────────────────────────
# Usage: build_clover <out-file> <base-dir> "path:covered:total" ...
# The base-dir is used as the file name prefix in the Clover XML (the
# script's --root will relativize it back). Pass "$T1", "$T2", etc.
build_clover() {
	local out="$1"; shift
	local base_dir
	base_dir="$(native_path "$1")"; shift
	{
		echo '<?xml version="1.0" encoding="UTF-8"?>'
		echo '<coverage generated="1234567890">'
		echo '  <project timestamp="1234567890">'
		for spec in "$@"; do
			local path="${spec%%:*}"
			local rest="${spec#*:}"
			local covered="${rest%%:*}"
			local total="${rest#*:}"
			echo "    <file name=\"$base_dir/$path\">"
			local i=0
			while [ "$i" -lt "$covered" ]; do
				echo "      <line num=\"$((i + 1))\" type=\"stmt\" count=\"1\"/>"
				i=$((i + 1))
			done
			while [ "$i" -lt "$total" ]; do
				echo "      <line num=\"$((i + 1))\" type=\"stmt\" count=\"0\"/>"
				i=$((i + 1))
			done
			echo "    </file>"
		done
		echo '  </project>'
		echo '</coverage>'
	} > "$out"
}

# ── Test 1: Changed file at 100% coverage → PASS, exit 0 ────────────────────
echo ""
echo "── Test 1: 100% covered changed file passes ──"
T1=$(mktemp -d)
register_temp_dir "$T1"
(
	cd "$T1"
	mkdir -p backend
	echo '<?php' > backend/env.php
	CLOVER=$(mktemp)
	build_clover "$CLOVER" "$T1" "backend/env.php:10:10"
	printf 'backend/env.php\n' | php "$SCRIPT" "$CLOVER" --root="$T1" >out.txt 2>&1 || rc=$?
	if [ "${rc:-0}" -eq 0 ] && grep -q 'PASS' out.txt; then
		pass "100% covered file passes (exit 0)"
	else
		fail "expected exit 0 + PASS, got rc=${rc:-0}"
	fi
)

# ── Test 2: Changed file at 50% coverage → FAIL, exit 1 ────────────────────
echo ""
echo "── Test 2: 50% covered changed file fails ──"
T2=$(mktemp -d)
register_temp_dir "$T2"
(
	cd "$T2"
	mkdir -p backend
	echo '<?php' > backend/env.php
	CLOVER=$(mktemp)
	build_clover "$CLOVER" "$T2" "backend/env.php:5:10"
	printf 'backend/env.php\n' | php "$SCRIPT" "$CLOVER" --root="$T2" >out.txt 2>&1 || rc=$?
	if [ "${rc:-1}" -eq 1 ] && grep -q 'FAIL' out.txt; then
		pass "50% covered file fails (exit 1)"
	else
		fail "expected exit 1 + FAIL, got rc=${rc:-0}"
	fi
)

# ── Test 3: Changed file not in clover → SKIP, exit 0 ───────────────────────
echo ""
echo "── Test 3: file outside coverage source is skipped ──"
T3=$(mktemp -d)
register_temp_dir "$T3"
(
	cd "$T3"
	mkdir -p backend
	echo '<?php' > backend/env.php
	echo '<?php' > backend/other.php
	CLOVER=$(mktemp)
	build_clover "$CLOVER" "$T3" "backend/env.php:10:10"
	printf 'backend/other.php\n' | php "$SCRIPT" "$CLOVER" --root="$T3" >out.txt 2>&1 || rc=$?
	if [ "${rc:-0}" -eq 0 ] && grep -q 'SKIP' out.txt; then
		pass "file outside source set is skipped (exit 0)"
	else
		fail "expected exit 0 + SKIP, got rc=${rc:-0}"
	fi
)

# ── Test 4: No changed files (empty stdin) → exit 0 ────────────────────────
echo ""
echo "── Test 4: empty stdin → exit 0 ──"
T4=$(mktemp -d)
register_temp_dir "$T4"
(
	cd "$T4"
	CLOVER=$(mktemp)
	build_clover "$CLOVER" "$T4" "backend/env.php:10:10"
	printf '' | php "$SCRIPT" "$CLOVER" --root="$T4" >out.txt 2>&1 || rc=$?
	if [ "${rc:-0}" -eq 0 ]; then
		pass "empty stdin exits 0"
	else
		fail "expected exit 0, got rc=${rc:-0}"
	fi
)

# ── Test 5: Deleted file (path doesn't exist) → SKIP, exit 0 ────────────────
echo ""
echo "── Test 5: deleted file is skipped ──"
T5=$(mktemp -d)
register_temp_dir "$T5"
(
	cd "$T5"
	CLOVER=$(mktemp)
	build_clover "$CLOVER" "$T5" "backend/env.php:10:10"
	printf 'backend/gone.php\n' | php "$SCRIPT" "$CLOVER" --root="$T5" >out.txt 2>&1 || rc=$?
	if [ "${rc:-0}" -eq 0 ] && grep -q 'SKIP' out.txt; then
		pass "deleted file is skipped (exit 0)"
	else
		fail "expected exit 0 + SKIP, got rc=${rc:-0}"
	fi
)

# ── Test 6: File with 0 executable lines → SKIP, exit 0 ────────────────────
echo ""
echo "── Test 6: file with 0 executable lines is skipped ──"
T6=$(mktemp -d)
register_temp_dir "$T6"
(
	cd "$T6"
	mkdir -p backend
	echo '<?php' > backend/empty.php
	CLOVER=$(mktemp)
	build_clover "$CLOVER" "$T6" "backend/empty.php:0:0"
	printf 'backend/empty.php\n' | php "$SCRIPT" "$CLOVER" --root="$T6" >out.txt 2>&1 || rc=$?
	if [ "${rc:-0}" -eq 0 ] && grep -q 'SKIP' out.txt; then
		pass "0-line file is skipped (exit 0)"
	else
		fail "expected exit 0 + SKIP, got rc=${rc:-0}"
	fi
)

# ── Test 7: Multiple files, one fails → exit 1 ─────────────────────────────
echo ""
echo "── Test 7: mixed pass/fail → exit 1 ──"
T7=$(mktemp -d)
register_temp_dir "$T7"
(
	cd "$T7"
	mkdir -p backend
	echo '<?php' > backend/good.php
	echo '<?php' > backend/bad.php
	CLOVER=$(mktemp)
	build_clover "$CLOVER" "$T7" "backend/good.php:10:10" "backend/bad.php:2:10"
	printf 'backend/good.php\nbackend/bad.php\n' | php "$SCRIPT" "$CLOVER" --root="$T7" >out.txt 2>&1 || rc=$?
	if [ "${rc:-1}" -eq 1 ] && grep -q 'PASS' out.txt && grep -q 'FAIL' out.txt; then
		pass "mixed pass/fail exits 1 with both in output"
	else
		fail "expected exit 1 with PASS+FAIL, got rc=${rc:-0}"
	fi
)

# ── Test 8: Custom --min threshold ──────────────────────────────────────────
echo ""
echo "── Test 8: custom --min=90 threshold ──"
T8=$(mktemp -d)
register_temp_dir "$T8"
(
	cd "$T8"
	mkdir -p backend
	echo '<?php' > backend/env.php
	CLOVER=$(mktemp)
	# 85% coverage — passes default 80 but fails 90
	build_clover "$CLOVER" "$T8" "backend/env.php:85:100"
	printf 'backend/env.php\n' | php "$SCRIPT" "$CLOVER" --root="$T8" --min=90 >out.txt 2>&1 || rc=$?
	if [ "${rc:-1}" -eq 1 ] && grep -q 'FAIL' out.txt; then
		pass "85% fails under --min=90"
	else
		fail "expected exit 1 + FAIL under --min=90, got rc=${rc:-0}"
	fi
)

# ── Test 9: Missing clover path → exit 2 ───────────────────────────────────
echo ""
echo "── Test 9: missing clover path → exit 2 ──"
T9=$(mktemp -d)
register_temp_dir "$T9"
(
	cd "$T9"
	printf 'backend/env.php\n' | php "$SCRIPT" >out.txt 2>&1 || rc=$?
	if [ "${rc:-2}" -eq 2 ]; then
		pass "missing clover path exits 2"
	else
		fail "expected exit 2, got rc=${rc:-0}"
	fi
)

# ── Test 10: Unreadable clover file → exit 2 ───────────────────────────────
echo ""
echo "── Test 10: unreadable clover file → exit 2 ──"
T10=$(mktemp -d)
register_temp_dir "$T10"
(
	cd "$T10"
	printf 'backend/env.php\n' | php "$SCRIPT" /nonexistent/clover.xml --root="$T10" >out.txt 2>&1 || rc=$?
	if [ "${rc:-2}" -eq 2 ]; then
		pass "unreadable clover exits 2"
	else
		fail "expected exit 2, got rc=${rc:-0}"
	fi
)

# ── Test 11: Symlinked --root still relativizes Clover paths ────────────────
# Reproduces the macOS /tmp -> /private/tmp asymmetry on Linux: --root points
# through a symlink whose realpath target lives under a different prefix, so
# the literal str_starts_with match fails and the script must fall back to
# realpath() on the Clover path to relativize correctly.
echo ""
echo "── Test 11: symlinked root relativizes correctly ──"
if ! can_symlink; then
	skip "symlinks not supported on this platform"
else
	T11_REAL=$(mktemp -d)
	register_temp_dir "$T11_REAL"
	T11_LINK_DIR=$(mktemp -d)
	register_temp_dir "$T11_LINK_DIR"
	T11_LINK="$T11_LINK_DIR/root"
	ln -s "$T11_REAL" "$T11_LINK"
	(
		cd "$T11_LINK"
		mkdir -p backend
		echo '<?php' > backend/env.php
		CLOVER=$(mktemp)
		build_clover "$CLOVER" "$T11_LINK" "backend/env.php:5:10"
		printf 'backend/env.php\n' | php "$SCRIPT" "$CLOVER" --root="$T11_LINK" >out.txt 2>&1 || rc=$?
		if [ "${rc:-1}" -eq 1 ] && grep -q 'FAIL' out.txt; then
			pass "symlinked root still fails under-threshold file (exit 1)"
		else
			fail "expected exit 1 + FAIL under symlinked root, got rc=${rc:-0}"
		fi
	)
fi

# ── Summary ────────────────────────────────────────────────────────────

print_summary "coverage_gate_test.sh"
exit $?






# vim: ft=sh sts=4 sw=4 ts=4 et :
