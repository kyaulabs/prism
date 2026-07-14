#!/usr/bin/env bash
# $KYAULabs: test_helpers.sh kyau@nova 2026/07/13 -0700 Exp $









# ── Shared helpers for tests/Shell/*_test.sh ────────────────────────────────────
#
# Source this file at the top of shell test files:
#   source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
#
# Provides:
#   - REPO_ROOT: absolute path to repository root
#   - pass <msg>: print green PASS, append to $RESULT_FILE
#   - fail <msg>: print red FAIL, append to $RESULT_FILE
#   - setup_result_file: create RESULT_FILE, install EXIT trap
#   - register_temp_dir <dir>: track dir for EXIT-trap cleanup
#   - make_file_stale <file> <days>: set file mtime to N days ago (portable)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
export REPO_ROOT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
# shellcheck disable=SC2034  # consumed by sourcing test files (commit-msg_test.sh, lib_test.sh)
YELLOW=$'\033[1;33m'
RESET=$'\033[0m'

pass() { echo "  ${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "  ${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }

# make_file_stale <file> <days>
# Sets the file's modification time to <days> days in the past.
# Portable: tries BSD date (-v) first, falls back to GNU date (-d).
make_file_stale() {
	local file="$1"
	local days="$2"
	local old_ts
	old_ts=$(date -v-"${days}"d +%Y%m%d%H%M 2>/dev/null || date -d "${days} days ago" +%Y%m%d%H%M)
	touch -t "$old_ts" "$file"
}

# ── RESULT_FILE lifecycle ──────────────────────────────────────────────────
# Call setup_result_file() EXACTLY ONCE near the top of a test file (after
# sourcing this lib). Creates RESULT_FILE and installs an EXIT trap that
# removes RESULT_FILE plus every directory registered via register_temp_dir().
RESULT_FILE=""
TEMP_DIRS=""

setup_result_file() {
	RESULT_FILE=$(mktemp)
	TEMP_DIRS=""
	trap 'shell_test_cleanup' EXIT
}

# register_temp_dir <dir> — track a temp directory for EXIT-trap cleanup.
register_temp_dir() {
	TEMP_DIRS="$TEMP_DIRS $1"
}

# shell_test_cleanup — internal; invoked by the EXIT trap installed by
# setup_result_file. Removes RESULT_FILE and all registered directories.
# shellcheck disable=SC2317  # called via trap, not reachable directly
shell_test_cleanup() {
	[ -n "$RESULT_FILE" ] && rm -f "$RESULT_FILE"
	if [ -n "$TEMP_DIRS" ]; then
		# shellcheck disable=SC2086  # intentional word-splitting of space-separated dir list
		rm -rf $TEMP_DIRS 2>/dev/null || true
	fi
}

# print_summary <label> — tally RESULT_FILE (PASS / FAIL), print a boxed
# summary, and return non-zero if any FAIL line is present. The guards are
# belt-and-suspenders default-value assignments that prevent unset-variable
# aborts under `set -u` (some consumers omit them; this function fixes that).
print_summary() {
	local label="${1:-tests}"
	: "${total_pass:=0}"
	: "${total_fail:=0}"
	total_pass=$(grep -c "PASS" "$RESULT_FILE" || true)
	total_fail=$(grep -c "FAIL" "$RESULT_FILE" || true)
	echo ""
	echo "════════════════════════════════════════"
	if [ "$total_fail" -eq 0 ]; then
		echo "✓ ${label}: ${total_pass} passed, ${total_fail} failed"
	else
		echo "✗ ${label}: ${total_pass} passed, ${total_fail} failed"
	fi
	echo "════════════════════════════════════════"
	[ "$total_fail" -eq 0 ]
}

# git_init_test_repo <dir> — init a disposable git repo with gpgsign disabled
# and a test identity. Fixes Issue #29 (global commit.gpgsign=true hangs).
git_init_test_repo() {
	local dir="$1"
	git init --quiet "$dir"
	(
		cd "$dir" || exit 1
		git config commit.gpgsign false
		git config user.email "test@example.com"
		git config user.name "Test User"
	)
}

# setup_linter_repo <dir> — git_init_test_repo + symlink vendor/node_modules +
# copy linter configs. Used by pre-commit lint tests that invoke the real hook.
setup_linter_repo() {
	local dir="$1"
	git_init_test_repo "$dir"
	(
		cd "$dir" || exit 1
		ln -s "$REPO_ROOT/vendor" vendor
		ln -s "$REPO_ROOT/node_modules" node_modules
		[ -f "$REPO_ROOT/.php-cs-fixer.dist.php" ] && cp "$REPO_ROOT/.php-cs-fixer.dist.php" .php-cs-fixer.dist.php
		[ -f "$REPO_ROOT/eslint.config.mjs" ] && cp "$REPO_ROOT/eslint.config.mjs" eslint.config.mjs
		[ -f "$REPO_ROOT/.stylelintrc.json" ] && cp "$REPO_ROOT/.stylelintrc.json" .stylelintrc.json
	)
}









# vim: ft=sh sts=4 sw=4 ts=4 et :
