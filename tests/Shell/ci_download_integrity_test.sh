#!/usr/bin/env bash
# $KYAULabs: ci_download_integrity_test.sh kyau@cosmos.kyaulabs 2026/07/22 -0700 Exp $





# ci_download_integrity_test.sh — Verify the CI workflow verifies a pinned
# SHA-256 checksum before extracting every curl-downloaded tool, downloads
# to mktemp paths (not fixed /tmp/<name>), never pipes curl into
# tar/sh/python, and no longer ships the unsigned get-pip.py fallback.
#
# Issue #182: shellcheck, gitleaks, and the get-pip.py fallback were
# installed from curl downloads with version pinning but no integrity
# verification, and extracted to predictable /tmp paths (TOCTOU). The fix
# (decision (A) in triage) removes get-pip.py entirely and adds inline
# SHA-256 verification + mktemp download paths to the two remaining curl
# downloads. semgrep continues to install via pip (TLS + PyPI hash
# verification), so it is out of the checksum-gate scope. See ADR-0035
# (runner isolation) for the broader CI supply-chain context.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

CI_FILE="${REPO_ROOT}/.github/workflows/ci.yml"

if [ ! -f "$CI_FILE" ]; then
    fail "ci.yml not found at ${CI_FILE}"
    print_summary "ci_download_integrity_test.sh"
    exit $?
fi

# noncomment — emit ci.yml lines (with line numbers) that are not YAML
# comments. Tolerates grep exit 1 under set -e via `|| true`.
noncomment() {
    grep -nE -v '^[0-9]+:[[:space:]]*#' "$CI_FILE" || true
}

# ── Test 1: shellcheck install pins a 64-hex SHA-256 (AC1) ────────────
echo ""
echo "── Test 1: shellcheck install pins a 64-hex SHA-256 ──"

if grep -qE 'SC_SHA256:[[:space:]]*"[0-9a-f]{64}"' "$CI_FILE"; then
    pass "shellcheck SC_SHA256 pinned (64 hex)"
else
    fail "shellcheck install missing SC_SHA256:<64-hex> env var"
fi

# ── Test 2: gitleaks install pins a 64-hex SHA-256 (AC1) ──────────────
echo ""
echo "── Test 2: gitleaks install pins a 64-hex SHA-256 ──"

if grep -qE 'GL_SHA256:[[:space:]]*"[0-9a-f]{64}"' "$CI_FILE"; then
    pass "gitleaks GL_SHA256 pinned (64 hex)"
else
    fail "gitleaks install missing GL_SHA256:<64-hex> env var"
fi

# ── Test 3: sha256sum -c invoked at least twice (AC1) ─────────────────
echo ""
echo "── Test 3: sha256sum -c invoked for each pinned download ──"

sha_checks=$(grep -cE 'sha256sum -c --strict' "$CI_FILE" 2>/dev/null || true)
if [ "${sha_checks:-0}" -ge 2 ]; then
    pass "sha256sum -c --strict invoked ${sha_checks} time(s) (>= 2)"
else
    fail "expected >= 2 'sha256sum -c --strict', found ${sha_checks:-0}"
fi

# ── Test 4: no curl piped into tar/sh/bash/python (AC2) ───────────────
echo ""
echo "── Test 4: no curl piped into tar/sh/bash/python ──"

pipes=$(noncomment | grep -E '\|[[:space:]]*(tar|sh|bash|python[0-9.]*)\b' || true)
if [ -n "$pipes" ]; then
    fail "ci.yml pipes curl into a tar/sh/python interpreter:"
    echo "$pipes" >&2
else
    pass "no curl|tar / curl|sh / curl|python pipe"
fi

# ── Test 5: downloads use mktemp, not fixed /tmp/<name> (AC3) ─────────
echo ""
echo "── Test 5: downloads use mktemp paths ──"

if grep -qE '\bmktemp\b' "$CI_FILE"; then
    pass "mktemp used for download destinations"
else
    fail "no mktemp usage in ci.yml"
fi

fixed_tmp=$(noncomment \
    | grep -E '(-C[[:space:]]+/tmp([[:space:]]|$)|-o[[:space:]]+/tmp/|/tmp/semgrep-venv|/tmp/get-pip)' \
    || true)
if [ -n "$fixed_tmp" ]; then
    fail "ci.yml uses a fixed /tmp download/extract destination:"
    echo "$fixed_tmp" >&2
else
    pass "no fixed /tmp download/extract destination"
fi

# ── Test 6: unsigned get-pip.py fallback removed (AC4) ───────────────
echo ""
echo "── Test 6: get-pip.py / bootstrap.pypa.io fallback removed ──"

getpip=$(noncomment | grep -E '(bootstrap\.pypa\.io|get-pip\.py)' || true)
if [ -n "$getpip" ]; then
    fail "ci.yml still references the unsigned get-pip.py bootstrap:"
    echo "$getpip" >&2
else
    pass "get-pip.py / bootstrap.pypa.io fallback removed"
fi

# ── Summary ────────────────────────────────────────────────────────────

print_summary "ci_download_integrity_test.sh"
exit $?




# vim: ft=sh sts=4 sw=4 ts=4 et :
