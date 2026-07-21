#!/usr/bin/env bash
# $KYAULabs: ci_no_composer_scripts_test.sh kyau@nova 2026/07/21 -0700 Exp $




# ci_no_composer_scripts_test.sh — Verify every `composer install` in CI
# disables lifecycle scripts.
#
# Issue #179 (hardening): `composer install` without `--no-scripts` runs any
# post-install-cmd / post-autoload-dump hooks defined in composer.json. There
# are none today, but adding `--no-scripts` is defense-in-depth so a future
# hook cannot execute install-time code in CI without an explicit decision.
# See ADR-0035.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

CI_FILE="${REPO_ROOT}/.github/workflows/ci.yml"

# ── Test 1: at least one composer install exists ──────────────────────
echo ""
echo "── Test 1: ci.yml has at least one composer install ──"

installs=$(grep -cE 'composer install' "$CI_FILE" 2>/dev/null || true)
if [ "${installs:-0}" -ge 1 ]; then
    pass "found ${installs} composer install step(s)"
else
    fail "no composer install step found in ci.yml"
fi

# ── Test 2: every composer install passes --no-scripts ────────────────
echo ""
echo "── Test 2: every composer install uses --no-scripts ──"

# `--` guards against --no-scripts being parsed as a grep flag.
unguarded=$(grep -E 'composer install' "$CI_FILE" 2>/dev/null \
    | grep -vE -- '--no-scripts' || true)
if [ -n "$unguarded" ]; then
    fail "composer install step(s) missing --no-scripts:"
    echo "$unguarded" >&2
else
    pass "all composer install steps use --no-scripts"
fi

# ── Summary ────────────────────────────────────────────────────────────

print_summary "ci_no_composer_scripts_test.sh"
exit $?




# vim: ft=sh sts=4 sw=4 ts=4 et :
