#!/usr/bin/env bash
# $KYAULabs: ci_runner_hosted_test.sh kyau@nova 2026/07/21 -0700 Exp $




# ci_runner_hosted_test.sh — Verify the CI `check` job runs on a GitHub-hosted
# ephemeral runner, never on a self-hosted runner.
#
# Issue #179: a public repo's self-hosted runner executes fork-PR code on a
# persistent, privileged machine. The fix migrates `check` to `ubuntu-latest`.
# This test asserts both halves: no `runs-on:` line references `self-hosted`,
# and the `check` job runs on `ubuntu-latest`. See ADR-0035.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

CI_FILE="${REPO_ROOT}/.github/workflows/ci.yml"

# ── Test 1: no runs-on: line references self-hosted ───────────────────
echo ""
echo "── Test 1: no runs-on: line references self-hosted ──"

if [ ! -f "$CI_FILE" ]; then
    fail "ci.yml not found at ${CI_FILE}"
else
    # Match only runs-on: lines (not comments), then look for self-hosted.
    self_hosted=$(grep -E '^[[:space:]]*runs-on:' "$CI_FILE" 2>/dev/null \
        | grep -E 'self-hosted' || true)
    if [ -n "$self_hosted" ]; then
        fail "ci.yml has a runs-on: line referencing self-hosted:"
        echo "$self_hosted" >&2
    else
        pass "no runs-on: line references self-hosted"
    fi
fi

# ── Test 2: the check job runs on ubuntu-latest ───────────────────────
echo ""
echo "── Test 2: check job runs on ubuntu-latest ──"

if [ ! -f "$CI_FILE" ]; then
    fail "ci.yml not found at ${CI_FILE}"
else
    if grep -E '^[[:space:]]*runs-on:' "$CI_FILE" 2>/dev/null \
        | grep -Eq 'ubuntu-latest'; then
        pass "a runs-on: line references ubuntu-latest"
    else
        fail "no runs-on: line references ubuntu-latest"
    fi
fi

# ── Summary ────────────────────────────────────────────────────────────

print_summary "ci_runner_hosted_test.sh"
exit $?




# vim: ft=sh sts=4 sw=4 ts=4 et :
