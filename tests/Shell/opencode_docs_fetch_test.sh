#!/usr/bin/env bash
# $KYAULabs: opencode_docs_fetch_test.sh kyau@cosmos.kyaulabs 2026/07/26 -0700 Exp $





# opencode_docs_fetch_test.sh — Structural/grep-based assertions against
# .opencode/skills/opencode-docs/fetch.sh (supply-chain hardening, #209).
#
# Asserts that fetch.sh pins to an immutable commit SHA, carries a
# documented branch comment, has a zero-match guard that fires before
# any destructive operation, and stages docs on the same filesystem for
# an atomic mv swap. No network calls — CI-safe.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

FETCH_SH="${REPO_ROOT}/.opencode/skills/opencode-docs/fetch.sh"

if [ ! -f "$FETCH_SH" ]; then
    fail "fetch.sh not found at ${FETCH_SH}"
    print_summary "opencode_docs_fetch_test.sh"
    exit $?
fi

# ── Test 1: PINNED_REF is a 40-hex SHA, not a branch name ───────────────

echo ""
echo "── Test 1: PINNED_REF is a 40-hex SHA ──"

if grep -qE 'PINNED_REF="[0-9a-f]{40}"' "$FETCH_SH"; then
    pinned_val=$(grep -oE 'PINNED_REF="[0-9a-f]{40}"' "$FETCH_SH" | head -1)
    if echo "$pinned_val" | grep -qE 'refs/heads|origin/'; then
        fail "PINNED_REF contains branch-like content (refs/heads or origin/): $pinned_val"
    else
        pass "PINNED_REF is a 40-hex SHA: $pinned_val"
    fi
else
    fail "PINNED_REF not found or not a 40-hex SHA in fetch.sh"
fi

# ── Test 2: # branch: comment present ──────────────────────────────────

echo ""
echo "── Test 2: branch comment documented ──"

if grep -qE '^# branch: dev$' "$FETCH_SH"; then
    pass "branch comment '# branch: dev' present"
else
    fail "branch comment '# branch: dev' not found in fetch.sh"
fi

# ── Test 3: clone pinned to the SHA ────────────────────────────────────

echo ""
echo "── Test 3: clone pinned to immutable SHA ──"

if grep -qE '(fetch|checkout).*\$\{?PINNED_REF' "$FETCH_SH"; then
    pass "clone pinned via fetch/checkout to \$PINNED_REF"
else
    fail "no fetch/checkout to \$PINNED_REF (clone not pinned to SHA)"
fi

# ── Test 4: zero-match guard precedes any DOCS_DIR deletion ─────────────

echo ""
echo "── Test 4: zero-match guard before DOCS_DIR removal ──"

# Find the zero-match guard: an exit 1 preceded (within 10 lines) by a
# matched/count zero-check — the multi-line if block pattern.
guard_found=false
if grep -B10 'exit 1' "$FETCH_SH" 2>/dev/null | grep -qE '(matched|count).*-eq 0'; then
    guard_found=true
fi

# Find line of the zero-match exit (for comparison with any rm -rf DOCS_DIR).
guard_line=$(grep -nB10 'exit 1' "$FETCH_SH" 2>/dev/null | grep -E '(matched|count).*-eq 0' | tail -1 | grep -oE '^[0-9]+' || true)
# If guard_line is empty but guard_found is true, use the exit 1 line itself.
if [ -z "$guard_line" ] && $guard_found; then
    guard_line=$(grep -nE '\bexit 1\b' "$FETCH_SH" 2>/dev/null | tail -1 | cut -d: -f1 || true)
fi
# Find any rm -rf targeting DOCS_DIR (literal or via variable).
rm_line=$(grep -nE 'rm -rf.*(DOCS_DIR|\$\{DOCS_DIR\})' "$FETCH_SH" 2>/dev/null | head -1 | cut -d: -f1 || true)

if ! $guard_found; then
    fail "no zero-match guard (exit 1 after matched/count zero-check) found"
elif [ -z "$rm_line" ]; then
    # No rm -rf DOCS_DIR — guard is sufficient (staged swap).
    pass "zero-match guard present; no rm -rf DOCS_DIR (staged swap)"
elif [ -n "$guard_line" ] && [ "$guard_line" -lt "$rm_line" ]; then
    pass "zero-match guard (line $guard_line) before rm -rf DOCS_DIR (line $rm_line)"
elif [ -n "$guard_line" ]; then
    fail "rm -rf DOCS_DIR (line $rm_line) before zero-match guard (line $guard_line)"
else
    pass "zero-match guard present; no rm -rf DOCS_DIR (staged swap)"
fi

# ── Test 5: atomic swap via staging directory + mv ──────────────────────

echo ""
echo "── Test 5: staging under SCRIPT_DIR (same fs) + mv swap ──"

# 5a — STAGE_DIR variable exists
if grep -qE 'STAGE_DIR=' "$FETCH_SH"; then
    pass "STAGE_DIR variable declared"
else
    fail "STAGE_DIR variable not found"
fi

# 5b — mktemp under SCRIPT_DIR (same filesystem, not /tmp)
if grep -qE 'mktemp.*(\$\{SCRIPT_DIR\}|SCRIPT_DIR)' "$FETCH_SH"; then
    pass "staging dir created via mktemp under SCRIPT_DIR (same fs)"
else
    fail "staging dir not created via mktemp under SCRIPT_DIR"
fi

# 5c — mv used for atomic swap into DOCS_DIR
if grep -qE 'mv\b.*(\$|\$\{)(DOCS_DIR)' "$FETCH_SH" 2>/dev/null; then
    pass "mv used for atomic swap into DOCS_DIR"
else
    fail "no mv swap into DOCS_DIR found"
fi

print_summary "opencode_docs_fetch_test.sh"
exit $?





# vim: ft=sh sts=4 sw=4 ts=4 et :
