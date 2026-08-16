#!/usr/bin/env bash
# $KYAULabs: counter_helpers.sh kyau@aura.kyaulabs 2026/08/16 -0700 Exp $




# ── Counter-style test reporters for tests/Shell/*_test.sh ─────────────────────
#
# Source this file after REPO_ROOT is set:
#   source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"
#
# Provides:
#   - PASS/FAIL counters, initialized to 0
#   - pass <msg>: print '  PASS <msg>', increment PASS
#   - fail <msg>: print '  FAIL <msg>' to stderr, increment FAIL
#
# The test file owns its summary line and exit status
# (printf '\n<name>: %d passed, %d failed\n' "$PASS" "$FAIL"; [ "$FAIL" -eq 0 ]).
# This is a different contract from test_helpers.sh (RESULT_FILE + EXIT trap).

# Idempotent: re-sourcing must not reset already-recorded tallies.
[ -n "${_COUNTER_HELPERS_LOADED:-}" ] && return
_COUNTER_HELPERS_LOADED=1

PASS=0
FAIL=0

pass() { printf '  PASS %s\n' "$*"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL %s\n' "$*" >&2; FAIL=$((FAIL + 1)); }





# vim: ft=sh sts=4 sw=4 ts=4 et :
