#!/usr/bin/env bash
# $KYAULabs: fixture_helpers.sh kyau@aura.kyaulabs 2026/08/16 -0700 Exp $


# ── Temp-dir fixture helpers for tests/Shell/*_test.sh ─────────────────────────
#
# Source this file after REPO_ROOT is set:
#   source "$REPO_ROOT/tests/Shell/lib/fixture_helpers.sh"
#
# Provides:
#   - TMP_DIRS: array of directories to remove on exit
#   - cleanup: rm -rf every tracked dir (installed via `trap cleanup EXIT`)
#   - fixture: mktemp -d, git init -q inside it, track it, print its path
#
# Note: test_helpers.sh's register_temp_dir is a separate RESULT_FILE-style
# contract; this module serves the counter-style tests.

TMP_DIRS=()

cleanup() {
	for dir in "${TMP_DIRS[@]}"; do rm -rf "$dir"; done
}
trap cleanup EXIT

fixture() { local d; d=$(mktemp -d); TMP_DIRS+=("$d"); git -C "$d" init -q; printf '%s' "$d"; }



# vim: ft=sh sts=4 sw=4 ts=4 et :
