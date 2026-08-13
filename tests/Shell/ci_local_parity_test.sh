#!/usr/bin/env bash
# $KYAULabs: ci_local_parity_test.sh kyau@aura.kyaulabs 2026/08/12 -0700 Exp $










# ci_local_parity_test.sh — Harness contract test for ADR-0025 (CI-local parity)
#
# Asserts:
#   1. adr/0025-ci-local-parity-principle.md exists, Status: Accepted
#   2. ADR-0023 documents the --no-verify block
#   3. ADR-0010 deprecates the fail-open consequence (cross-refs ADR-0025)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

# ── 1. ADR-0025 exists and is Accepted ──────────────────────────────────────
ADR0025="$REPO_ROOT/adr/0025-ci-local-parity-principle.md"
if [ -f "$ADR0025" ] && \
   grep -q "^## Status" "$ADR0025" && \
   grep -q "^[Aa]ccepted" "$ADR0025"; then
	pass "adr/0025 exists and Status is Accepted"
else
	fail "adr/0025-ci-local-parity-principle.md missing or not Accepted"
fi

# ── 2. ADR-0023 references the --no-verify block ────────────────────────────
if grep -qi "no-verify" "$REPO_ROOT/adr/0023-safety-hook-for-bash-tool-interception.md"; then
	pass "ADR-0023 documents the --no-verify block"
else
	fail "ADR-0023 does not mention --no-verify"
fi

# ── 3. ADR-0010 deprecates fail-open (cross-refs ADR-0025) ──────────────────
if grep -qi "ADR-0025\|0025" "$REPO_ROOT/adr/0010-issue-closing-keyword-convention.md"; then
	pass "ADR-0010 cross-refs ADR-0025 (fail-open deprecated)"
else
	fail "ADR-0010 does not cross-ref ADR-0025"
fi

# ── 4. conventional-commits warns about literal backslash-n ──────────────────
if grep -qi "literal" "$REPO_ROOT/packages/prism-core/skills/conventional-commits/SKILL.md"; then
	pass "conventional-commits warns about literal backslash-n"
else
	fail "conventional-commits missing literal backslash-n warning"
fi

# ── 5. install-hooks notes the npm prerequisite ──────────────────────────────
if grep -qF "npm install" "$REPO_ROOT/packages/prism-core/scripts/install-hooks.sh"; then
	pass "install-hooks notes npm prerequisite"
else
	fail "install-hooks missing npm note"
fi

# ── 6. pre-commit shellcheck fails on output (version-skew defense) ──────────
if grep -qF 'severity=warning' "$REPO_ROOT/.github/hooks/pre-commit"; then
	pass "pre-commit shellcheck captures output"
else
	fail "pre-commit shellcheck does not capture output"
fi

# ── 7. pre-push runs shellcheck ──────────────────────────────────────────────
if grep -qF 'pre-push: shellcheck' "$REPO_ROOT/.github/hooks/pre-push"; then
	pass "pre-push runs shellcheck"
else
	fail "pre-push missing shellcheck"
fi

# ── 8. writing-plans commit example uses the canonical $'...' form ──────────
if grep -qF "git commit -S -m \$'" "$REPO_ROOT/packages/prism-core/skills/writing-plans/SKILL.md"; then
	pass "writing-plans uses canonical \$'...' commit form"
else
	fail "writing-plans commit example not reconciled to \$'...' form"
fi

# ── 9. doctor verifies local node_modules/commitlint (commit-msg fail-closed) ─
if grep -qF "[ -x ./node_modules/.bin/commitlint ]" "$REPO_ROOT/packages/prism-core/prompts/doctor.md"; then
	pass "doctor checks node_modules/commitlint presence"
else
	fail "doctor missing node_modules/commitlint check"
fi

print_summary "ci_local_parity"









# vim: ft=sh sts=4 sw=4 ts=4 et :
