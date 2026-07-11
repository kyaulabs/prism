#!/usr/bin/env bash
# $KYAULabs: ci_npm_test.sh kyau@akira.kyaulabs 2026/07/10 -0700 Exp $


# ci_npm_test.sh — Verify CI workflow uses `npm ci` (not `npm install`).
#
# `npm install` silently reconciles package.json/lock drift, undermining
# lockfile determinism. `npm ci` fails on drift — the correct CI behavior.
# See: Issue #73.

set -euo pipefail

RESULT_FILE=$(mktemp)
trap 'rm -f "$RESULT_FILE"' EXIT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
RESET=$'\033[0m'

pass() { echo "  ${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "  ${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CI_FILE="${REPO_ROOT}/.github/workflows/ci.yml"

# ── Test 1: ci.yml must not contain `npm install` ─────────────────────
echo ""
echo "── Test 1: ci.yml does not contain npm install ──"

if [ ! -f "$CI_FILE" ]; then
    fail "ci.yml not found at ${CI_FILE}"
else
    # `npm ci` does not contain the substring `npm install`, so this
    # grep has no false positives. Any match means someone used
    # `npm install` instead of `npm ci`.
    matches=$(grep -n 'npm install' "$CI_FILE" 2>/dev/null || true)
    if [ -n "$matches" ]; then
        fail "ci.yml contains 'npm install' (should use 'npm ci'):"
        echo "$matches" >&2
    else
        pass "ci.yml does not contain 'npm install'"
    fi
fi

# ── Test 2: ci.yml must contain `npm ci` ──────────────────────────────
echo ""
echo "── Test 2: ci.yml contains npm ci ──"

if [ ! -f "$CI_FILE" ]; then
    fail "ci.yml not found at ${CI_FILE}"
else
    if grep -q 'npm ci' "$CI_FILE" 2>/dev/null; then
        pass "ci.yml contains 'npm ci'"
    else
        fail "ci.yml does not contain 'npm ci'"
    fi
fi

# ── Summary ────────────────────────────────────────────────────────────
total_pass=$(grep -c "PASS" "$RESULT_FILE" 2>/dev/null || true)
total_fail=$(grep -c "FAIL" "$RESULT_FILE" 2>/dev/null || true)

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$total_fail" -eq 0 ]; then
    echo "✓ CI npm tests PASSED — $total_pass assertion(s), 0 failures"
    echo "═══════════════════════════════════════════════════════════"
    exit 0
else
    echo "✗ CI npm tests FAILED — $total_pass passed, $total_fail failure(s)"
    echo "═══════════════════════════════════════════════════════════"
    exit 1
fi


# vim: ft=sh sts=4 sw=4 ts=4 et :
