#!/usr/bin/env bash
# $KYAULabs: test_helpers.sh kyau@akira.kyaulabs 2026/07/12 -0700 Exp $


# ── Shared helpers for tests/Shell/*_test.sh ────────────────────────────────────
#
# Source this file at the top of shell test files:
#   source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
#
# Provides:
#   - REPO_ROOT: absolute path to repository root
#   - pass <msg>: print green PASS, append to $RESULT_FILE
#   - fail <msg>: print red FAIL, append to $RESULT_FILE
#   - make_file_stale <file> <days>: set file mtime to N days ago (portable)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
export REPO_ROOT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
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

# vim: ft=sh sts=4 sw=4 ts=4 et :
