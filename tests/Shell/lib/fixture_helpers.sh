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
# contract; this module serves the counter-style tests. This module owns the
# EXIT trap — do not source alongside another trap-installing helper.

# Idempotent: re-sourcing must not drop already-tracked dirs or re-claim the trap.
[ -n "${_FIXTURE_HELPERS_LOADED:-}" ] && return
_FIXTURE_HELPERS_LOADED=1

TMP_DIRS=()

cleanup() {
	if [ "${#TMP_DIRS[@]}" -gt 0 ]; then
		for dir in "${TMP_DIRS[@]}"; do rm -rf "$dir"; done
	fi
}
trap cleanup EXIT

fixture() { local d; d=$(mktemp -d); TMP_DIRS+=("$d"); git -C "$d" init -q; git -C "$d" config commit.gpgsign false; printf '%s' "$d"; }





# vim: ft=sh sts=4 sw=4 ts=4 et :
