#!/usr/bin/env bash
# $KYAULabs: ci_persist_credentials_test.sh kyau@nova 2026/07/21 -0700 Exp $




# ci_persist_credentials_test.sh — Verify every actions/checkout step disables
# credential persistence.
#
# Issue #179: with the default `persist-credentials: true`, the GITHUB_TOKEN
# is written to the local git config, where a malicious step can reuse it.
# Every checkout must set `persist-credentials: false`. See ADR-0035.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

CI_FILE="${REPO_ROOT}/.github/workflows/ci.yml"

# Counts — tolerate grep's exit 1 on zero matches under set -e.
checkouts=$(grep -cE 'uses: actions/checkout@' "$CI_FILE" 2>/dev/null || true)
guarded=$(grep -cE 'persist-credentials:[[:space:]]*false' "$CI_FILE" 2>/dev/null || true)

# ── Test 1: the workflow has at least one checkout ────────────────────
echo ""
echo "── Test 1: ci.yml has at least one actions/checkout ──"

if [ "${checkouts:-0}" -ge 1 ]; then
    pass "found ${checkouts} checkout step(s)"
else
    fail "no actions/checkout@ step found in ci.yml"
fi

# ── Test 2: every checkout sets persist-credentials: false ────────────
echo ""
echo "── Test 2: every checkout sets persist-credentials: false ──"

if [ "${checkouts:-0}" -ge 1 ] && [ "${checkouts}" -eq "${guarded:-0}" ]; then
    pass "all ${checkouts} checkout(s) set persist-credentials: false"
else
    fail "expected ${checkouts} persist-credentials: false, found ${guarded:-0}"
fi

# ── Summary ────────────────────────────────────────────────────────────

print_summary "ci_persist_credentials_test.sh"
exit $?




# vim: ft=sh sts=4 sw=4 ts=4 et :
