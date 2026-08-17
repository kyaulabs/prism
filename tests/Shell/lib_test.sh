#!/usr/bin/env bash
# $KYAULabs: lib_test.sh kyau@aura.kyaulabs 2026/08/16 -0700 Exp $














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

# Test 10: setup_linter_repo symlinks deps and calls git_init_test_repo
test_setup_linter_repo() {
	local d
	d=$(mktemp -d)
	register_temp_dir "$d"
	setup_linter_repo "$d"
	if [ -L "$d/vendor" ] && [ -L "$d/node_modules" ] \
		&& [ "$(git -C "$d" config commit.gpgsign)" = "false" ]; then
		pass "setup_linter_repo symlinked deps + disabled gpgsign"
	else
		fail "setup_linter_repo did not set up repo correctly"
	fi
}

# Test 11: skip() prints SKIP and writes to RESULT_FILE
test_skip_helper() {
	local rf
	rf=$(mktemp)
	RESULT_FILE="$rf" skip "platform not supported"
	if grep -q "SKIP" "$rf"; then
		pass "skip() wrote SKIP to RESULT_FILE"
	else
		fail "skip() did not write SKIP to RESULT_FILE"
	fi
	rm -f "$rf"
}

# Test 12: can_symlink returns a valid exit code (0 or 1) without error
test_can_symlink() {
	if can_symlink; then
		pass "can_symlink works (symlinks supported on this platform)"
	else
		pass "can_symlink works (symlinks NOT supported on this platform)"
	fi
}

# Test 13: native_path returns a non-empty normalized path
test_native_path() {
	local result
	result=$(native_path "/tmp")
	if [ -n "$result" ]; then
		pass "native_path returned non-empty result: $result"
	else
		fail "native_path returned empty string"
	fi
}

# Test 14: path_without_prism_tool strips a host-installed launcher dir
# (no-op when absent) — hook tests rely on this to simulate a machine
# without the launcher on dogfooding machines.
test_path_without_prism_tool() {
	local fake_dir stripped original_path
	original_path="$PATH"
	fake_dir=$(mktemp -d)
	register_temp_dir "$fake_dir"
	touch "$fake_dir/prism-tool"
	chmod +x "$fake_dir/prism-tool"

	PATH="$fake_dir:/usr/bin:/bin"
	stripped=$(path_without_prism_tool)
	PATH="$original_path"
	if [[ ":$stripped:" != *":$fake_dir:"* ]] && [[ ":$stripped:" == *":/usr/bin:"* ]]; then
		pass "path_without_prism_tool strips the launcher dir"
	else
		fail "path_without_prism_tool kept launcher dir: $stripped"
	fi

	# No-op when no prism-tool is on PATH (controlled empty dirs only —
	# never /usr/bin:/bin, which could hold a real launcher on some hosts).
	local noop_a noop_b
	noop_a=$(mktemp -d)
	register_temp_dir "$noop_a"
	noop_b=$(mktemp -d)
	register_temp_dir "$noop_b"
	PATH="$noop_a:$noop_b"
	stripped=$(path_without_prism_tool)
	PATH="$original_path"
	if [ "$stripped" = "$noop_a:$noop_b" ]; then
		pass "path_without_prism_tool is a no-op without a launcher"
	else
		fail "path_without_prism_tool altered PATH without a launcher: $stripped"
	fi

	# Empty PATH components (POSIX: empty = current dir) must survive.
	PATH=":$noop_a:"
	stripped=$(path_without_prism_tool)
	PATH="$original_path"
	if [ "$stripped" = ":$noop_a:" ]; then
		pass "path_without_prism_tool preserves empty PATH components"
	else
		fail "path_without_prism_tool dropped empty PATH components: $stripped"
	fi

	# Launcher as the only non-empty component: empty cwd entries survive
	# and the launcher dir is removed (no external dirname dependency).
	PATH=":$fake_dir:"
	stripped=$(path_without_prism_tool)
	PATH="$original_path"
	if [ "$stripped" = ":" ]; then
		pass "path_without_prism_tool strips launcher-only PATH"
	else
		fail "path_without_prism_tool mishandled launcher-only PATH: $stripped"
	fi

	# Launcher adjacent to a lone empty component (leading or trailing)
	# must round-trip the empty cwd entry as ':'.
	PATH=":$fake_dir"
	stripped=$(path_without_prism_tool)
	PATH="$original_path"
	if [ "$stripped" = ":" ]; then
		pass "path_without_prism_tool preserves leading empty beside launcher"
	else
		fail "path_without_prism_tool lost leading empty: $stripped"
	fi
	PATH="$fake_dir:"
	stripped=$(path_without_prism_tool)
	PATH="$original_path"
	if [ "$stripped" = ":" ]; then
		pass "path_without_prism_tool preserves trailing empty beside launcher"
	else
		fail "path_without_prism_tool lost trailing empty: $stripped"
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
test_setup_linter_repo
test_skip_helper
test_can_symlink
test_native_path
test_path_without_prism_tool

# Summary
print_summary "lib_test.sh"
exit $?













# vim: ft=sh sts=4 sw=4 ts=4 et :
