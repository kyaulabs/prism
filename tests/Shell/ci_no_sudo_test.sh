#!/usr/bin/env bash
# $KYAULabs: ci_no_sudo_test.sh kyau@nova 2026/07/21 -0700 Exp $




# ci_no_sudo_test.sh — Verify the CI workflow contains no workflow-source
# `sudo` command invocation.
#
# Issue #179: the self-hosted runner granted passwordless sudo, used by the
# pinned shellcheck and gitleaks install steps. The fix installs both tools
# into a user-writable directory instead. This test asserts no `sudo` token
# appears on any non-comment line of ci.yml — i.e. fork-PR-controlled `run:`
# source cannot elevate.
#
# NOTE (ADR-0035): this asserts workflow-source sudo only. `npx playwright
# install --with-deps chromium` invokes the platform package manager via sudo
# transitively on the ephemeral runner; that invocation is internal to a
# trusted action and is acceptable on an ephemeral VM.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

CI_FILE="${REPO_ROOT}/.github/workflows/ci.yml"

# ── Test 1: no sudo command token on any non-comment line ─────────────
echo ""
echo "── Test 1: no sudo command token on non-comment lines ──"

if [ ! -f "$CI_FILE" ]; then
    fail "ci.yml not found at ${CI_FILE}"
else
    # grep -n gives "LINENUM:content". Exclude comment lines (optional
    # leading whitespace then #). \bsudo\b avoids false positives like
    # "pseudo".
    matches=$(grep -nE '\bsudo\b' "$CI_FILE" 2>/dev/null \
        | grep -vE '^[0-9]+:[[:space:]]*#' || true)
    if [ -n "$matches" ]; then
        fail "ci.yml contains workflow-source sudo invocation(s):"
        echo "$matches" >&2
    else
        pass "no sudo command token on non-comment lines"
    fi
fi

# ── Summary ────────────────────────────────────────────────────────────

print_summary "ci_no_sudo_test.sh"
exit $?




# vim: ft=sh sts=4 sw=4 ts=4 et :
