#!/usr/bin/env bash
# $KYAULabs: pre_push_parity_test.sh git@aura.kyaulabs 2026/08/14 -0700 Exp $





# pre_push_parity_test.sh — verifies pre-push runs the CI-parity backstop
# (validate-harness + shell tests) before allowing a push (ADR-0025),
# and asserts the protected-ref gate uses remote_ref (ADR-0044).

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

# ── Protected-ref parity assertions (ADR-0044) ────────────────────────

if grep -qF 'remote_ref' "$HOOK"; then
	pass "pre-push references remote_ref"
else
	fail "pre-push missing remote_ref"
fi

if grep -qF 'refs/heads/main' "$HOOK" && grep -qF 'refs/heads/develop' "$HOOK"; then
	pass "pre-push gates both protected refs (main and develop)"
else
	fail "pre-push missing one or both protected refs"
fi

if grep -qF 'is_initial_protected_push' "$HOOK"; then
	pass "pre-push defines is_initial_protected_push helper"
else
	fail "pre-push missing is_initial_protected_push helper"
fi

# ── Toolchain boundary (Task 8) ────────────────────────────────────────
# The mandatory local doctor must run before the harness checks so a failed
# readiness stops the push before validate-harness.
if grep -qF 'doctor --local-only' "$HOOK"; then
	pass "pre-push runs prism-tool local doctor"
else
	fail "pre-push missing prism-tool local doctor"
fi
doctor_line=$(grep -nF 'doctor --local-only' "$HOOK" | head -1 | cut -d: -f1)
# shellcheck disable=SC2016  # $HLOG is a literal hook source pattern, not an expansion
harness_line=$(grep -nF 'validate-harness.sh >"$HLOG"' "$HOOK" | head -1 | cut -d: -f1)
if [ -n "$doctor_line" ] && [ -n "$harness_line" ] && [ "$doctor_line" -lt "$harness_line" ]; then
	pass "pre-push runs local doctor before harness checks"
else
	fail "pre-push doctor is not positioned before the harness checks"
fi

print_summary "pre_push_parity"




# vim: ft=sh sts=4 sw=4 ts=4 et :
