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
	[ -n "$TEMP_DIRS" ] && rm -rf $TEMP_DIRS 2>/dev/null || true
}



# vim: ft=sh sts=4 sw=4 ts=4 et :
