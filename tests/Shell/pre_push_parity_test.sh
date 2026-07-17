#!/usr/bin/env bash
# $KYAULabs: pre_push_parity_test.sh kyau@nova 2026/07/16 -0700 Exp $


# pre_push_parity_test.sh — verifies pre-push runs the CI-parity backstop
# (validate-harness + shell tests) before allowing a push (ADR-0025).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file
HOOK="$REPO_ROOT/.github/hooks/pre-push"

if grep -qF "validate-harness.sh" "$HOOK"; then
	pass "pre-push runs validate-harness"
else
	fail "pre-push missing validate-harness"
fi

if grep -qiF "CI-parity" "$HOOK"; then
	pass "pre-push documents CI-parity intent"
else
	fail "pre-push missing CI-parity note"
fi

print_summary "pre_push_parity"

# vim: ft=sh sts=4 sw=4 ts=4 et :
