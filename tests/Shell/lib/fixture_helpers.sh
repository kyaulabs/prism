#!/usr/bin/env bash
# $KYAULabs: fixture_helpers.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# ── Temp-dir fixture helpers for tests/Shell/*_test.sh ─────────────────────────
#
# Source this file after REPO_ROOT is set:
#   source "$REPO_ROOT/tests/Shell/lib/fixture_helpers.sh"
#
# Provides:
#   - TMP_DIRS: array of directories to remove on exit
#   - cleanup: rm -rf every tracked dir (installed via `trap cleanup EXIT INT TERM`)
#   - fixture <varname>: mktemp -d, git init -q inside it, track it, then set
#     <varname> in the CALLER's shell to the new path (printf -v)
#
# fixture must be called directly (fixture dir), never via command
# substitution (dir=$(fixture)): a subshell's TMP_DIRS+=() is invisible to the
# parent, so the EXIT-trap cleanup would silently skip the dir (issue #322).
# On mktemp failure fixture returns non-zero and registers nothing. The caller
# variable must not be named 'd' (the function's own local).
#
# The fixture repo disables commit.gpgsign (matches git_init_test_repo)
# but deliberately sets NO git identity: resolve_identity_test asserts
# fixture repos have no resolvable identity, so callers that commit must
# pass -c user.name/-c user.email themselves.
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
trap cleanup EXIT INT TERM

fixture() {
	local d
	d=$(mktemp -d) || return 1
	TMP_DIRS+=("$d")
	git -C "$d" init -q
	git -C "$d" config commit.gpgsign false
	printf -v "$1" '%s' "$d"
}

# vim: ft=sh sts=4 sw=4 ts=4 et :
