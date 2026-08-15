#!/usr/bin/env bash
# $KYAULabs: pre_push_parity_test.sh kyau@aura.kyaulabs 2026/08/14 -0700 Exp $








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
harness_line=$(grep -nF 'validate-harness.sh" >"$HLOG"' "$HOOK" | head -1 | cut -d: -f1)
if [ -n "$doctor_line" ] && [ -n "$harness_line" ] && [ "$doctor_line" -lt "$harness_line" ]; then
	pass "pre-push runs local doctor before harness checks"
else
	fail "pre-push doctor is not positioned before the harness checks"
fi

# ── Pi-native CI contract linkage (Task 11) ──────────────────────────────
# The local pre-push gate and the CI verify job share the same toolchain
# boundary; the consolidated contract test is authoritative over the legacy
# per-concern CI tests.
if [ -f "$REPO_ROOT/tests/Shell/pi_ci_contract_test.sh" ]; then
	pass "Pi-native CI contract test is present"
else
	fail "Pi-native CI contract test is missing"
fi
if grep -qF 'validate-harness.sh' "$REPO_ROOT/.github/workflows/ci.yml" 2>/dev/null; then
	pass "CI verify job runs the same harness validation as pre-push"
else
	fail "CI verify job does not run validate-harness"
fi
legacy_ci_tests=(
	ci_download_integrity_test.sh
	ci_no_composer_scripts_test.sh
	ci_no_sudo_test.sh
	ci_npm_test.sh
	ci_persist_credentials_test.sh
	ci_runner_hosted_test.sh
	ci_runner_isolation_adr_test.sh
	semgrep_ci_test.sh
)
legacy_present=0
for legacy_test in "${legacy_ci_tests[@]}"; do
	if [ -e "$REPO_ROOT/tests/Shell/$legacy_test" ]; then
		legacy_present=1
	fi
done
if [ "$legacy_present" -eq 0 ]; then
	pass "no legacy per-concern CI test file remains"
else
	fail "legacy per-concern CI test file remains"
fi

print_summary "pre_push_parity"







# vim: ft=sh sts=4 sw=4 ts=4 et :
