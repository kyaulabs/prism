#!/usr/bin/env bash
# $KYAULabs: architect_adr_contract_test.sh kyau@nova 2026/07/16 -0700 Exp $




set -euo pipefail

# ── ADR-required contract test ────────────────────────────────────────────────
# Validates the ADR-required contract between the @architect agent (producer)
# and the ticketing skill (consumer):
#   1. @architect's agent template emits a parseable ADR-required: line.
#   2. Ticketing skill references the ADR-required contract.
# ─────────────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

ARCHITECT="$REPO_ROOT/.opencode/agents/architect.md"
TICKETING="$REPO_ROOT/.opencode/skills/ticketing/SKILL.md"

# Test 1: @architect agent emits a parseable ADR-required: line
if grep -qE 'ADR-required:' "$ARCHITECT"; then
	pass "@architect emits ADR-required: line"
else
	fail "@architect is missing ADR-required: line in $ARCHITECT"
fi

# Test 2: ticketing skill references the ADR-required contract
if grep -q 'ADR-required' "$TICKETING"; then
	pass "ticketing skill references ADR-required contract"
else
	fail "ticketing skill is missing ADR-required reference in $TICKETING"
fi

print_summary "architect-adr-contract"
exit $?



# vim: ft=sh sts=4 sw=4 ts=4 et :
