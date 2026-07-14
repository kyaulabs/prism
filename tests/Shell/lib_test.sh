#!/usr/bin/env bash
# $KYAULabs: lib_test.sh kyau@nova 2026/07/13 -0700 Exp $




# ── Tests for tests/Shell/lib/test_helpers.sh ──────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

RESULT_FILE=$(mktemp)
trap 'rm -f "$RESULT_FILE"' EXIT

# Test 1: make_file_stale sets mtime to approximately N days ago
test_make_file_stale() {
	local tmpfile
	tmpfile=$(mktemp)

	make_file_stale "$tmpfile" 8

	# Check that the file's mtime is older than 7 days from now
	local file_mtime now
	file_mtime=$(stat -c %Y "$tmpfile" 2>/dev/null || stat -f %m "$tmpfile" 2>/dev/null)
	now=$(date +%s)
	local age_days=$(( (now - file_mtime) / 86400 ))

	if [ "$age_days" -ge 7 ] && [ "$age_days" -le 9 ]; then
		pass "make_file_stale set mtime to ~8 days ago (age: ${age_days}d)"
	else
		fail "make_file_stale produced wrong age: ${age_days}d (expected 7-9)"
	fi

	rm -f "$tmpfile"
}

# Test 2: make_file_stale works with 30 days
test_make_file_stale_30() {
	local tmpfile
	tmpfile=$(mktemp)

	make_file_stale "$tmpfile" 30

	local file_mtime now
	file_mtime=$(stat -c %Y "$tmpfile" 2>/dev/null || stat -f %m "$tmpfile" 2>/dev/null)
	now=$(date +%s)
	local age_days=$(( (now - file_mtime) / 86400 ))

	if [ "$age_days" -ge 29 ] && [ "$age_days" -le 31 ]; then
		pass "make_file_stale set mtime to ~30 days ago (age: ${age_days}d)"
	else
		fail "make_file_stale produced wrong age: ${age_days}d (expected 29-31)"
	fi

	rm -f "$tmpfile"
}

# Test 3: pass and fail functions write to RESULT_FILE
test_pass_fail_helpers() {
	local setup_result_file
	setup_result_file=$(mktemp)

	RESULT_FILE="$setup_result_file" pass "test pass only"
	if ! grep -q "PASS" "$setup_result_file"; then
		fail "pass() did not write to RESULT_FILE"
		rm -f "$setup_result_file"
		return
	fi

	RESULT_FILE="$setup_result_file" fail "test fail only"
	if ! grep -q "FAIL" "$setup_result_file"; then
		fail "fail() did not write to RESULT_FILE"
		rm -f "$setup_result_file"
		return
	fi

	rm -f "$setup_result_file"
	pass "pass/fail helpers wrote to RESULT_FILE"
}

# Test 4: YELLOW color variable is defined
test_yellow_color_defined() {
	if [ "${YELLOW:-}" != "" ] && [ "${YELLOW:0:3}" = $'\033[1' ]; then
		pass "YELLOW color variable defined"
	else
		fail "YELLOW color variable not defined (got: ${YELLOW:-<unset>})"
	fi
}

# Test 5: setup_result_file creates RESULT_FILE and installs trap
test_setup_result_file() {
	if ( setup_result_file && [ -n "$RESULT_FILE" ] && [ -f "$RESULT_FILE" ]; ); then
		pass "setup_result_file created RESULT_FILE"
	else
		fail "setup_result_file did not create RESULT_FILE"
	fi
}

# Test 6: register_temp_dir tracks dirs for cleanup
test_register_temp_dir_cleanup() {
	(
		setup_result_file
		local d
		d=$(mktemp -d)
		register_temp_dir "$d"
		shell_test_cleanup
		if [ ! -d "$d" ]; then
			exit 0
		fi
		rm -rf "$d"
		exit 1
	)
	if [ $? -eq 0 ]; then
		pass "shell_test_cleanup removed registered temp dir"
	else
		fail "shell_test_cleanup did not remove temp dir"
	fi
}

# Run tests
echo "── lib_test.sh ──"
test_make_file_stale
test_make_file_stale_30
test_pass_fail_helpers
test_yellow_color_defined
test_setup_result_file
test_register_temp_dir_cleanup

# Summary
total=$(wc -l < "$RESULT_FILE")
fails=$(grep -c "FAIL" "$RESULT_FILE" || true)
passes=$((total - fails))

echo ""
echo "Results: ${passes} passed, ${fails} failed"

if [ "$fails" -gt 0 ]; then
	exit 1
fi



# vim: ft=sh sts=4 sw=4 ts=4 et :
