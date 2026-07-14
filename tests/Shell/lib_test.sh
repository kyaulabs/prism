#!/usr/bin/env bash
# $KYAULabs: lib_test.sh kyau@nova 2026/07/13 -0700 Exp $






# ── Tests for tests/Shell/lib/test_helpers.sh ──────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

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
	if (
		setup_result_file
		local d
		d=$(mktemp -d)
		register_temp_dir "$d"
		shell_test_cleanup
		[ ! -d "$d" ] || { rm -rf "$d"; exit 1; }
	); then
		pass "shell_test_cleanup removed registered temp dir"
	else
		fail "shell_test_cleanup did not remove temp dir"
	fi
}

# Test 7: print_summary exits 0 when all tests pass
test_print_summary_pass_only() {
	if (
		setup_result_file
		RESULT_FILE="$RESULT_FILE" pass "ok1"
		RESULT_FILE="$RESULT_FILE" pass "ok2"
		print_summary "unit" >/dev/null 2>&1
	); then
		pass "print_summary exits 0 when no failures"
	else
		fail "print_summary exited non-zero with no failures"
	fi
}

# Test 8: print_summary exits non-zero on failure
test_print_summary_with_fail() {
	if (
		setup_result_file
		RESULT_FILE="$RESULT_FILE" pass "ok"
		RESULT_FILE="$RESULT_FILE" fail "bad"
		! print_summary "unit" >/dev/null 2>&1
	); then
		pass "print_summary exits non-zero on failure"
	else
		fail "print_summary exited 0 despite a failure"
	fi
}

# Test 9: git_init_test_repo creates a repo with gpgsign disabled
test_git_init_test_repo() {
	local d fails
	d=$(mktemp -d)
	register_temp_dir "$d"
	fails=0
	git_init_test_repo "$d"
	[ "$(git -C "$d" config commit.gpgsign)" = "false" ] || fails=1
	[ "$(git -C "$d" config user.email)" = "test@example.com" ] || fails=1
	if [ "$fails" -eq 0 ]; then
		pass "git_init_test_repo set gpgsign=false and test identity"
	else
		fail "git_init_test_repo produced wrong config"
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
test_print_summary_pass_only
test_print_summary_with_fail
test_git_init_test_repo

# Summary
print_summary "lib_test.sh"
exit $?





# vim: ft=sh sts=4 sw=4 ts=4 et :
