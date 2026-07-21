#!/usr/bin/env bash
# $KYAULabs: ci_runner_isolation_adr_test.sh kyau@nova 2026/07/21 -0700 Exp $




# ci_runner_isolation_adr_test.sh — Contract test for ADR-0035 (CI runner
# fork-isolation).
#
# ADR-0035 records a load-bearing interpretive claim (ADR-0025's parity is
# gate-equivalence, not runner-equivalence) plus required content flagged by
# the @architect review. This test machine-checks that the ADR exists, is
# Accepted, and contains each required element — so a future edit cannot
# silently erode the decision's rationale. See issue #179.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

ADR0035="$REPO_ROOT/adr/0035-ci-runner-fork-isolation.md"
CONTEXT="$REPO_ROOT/CONTEXT.md"

# ── 1. ADR-0035 exists and is Accepted ──────────────────────────────────────
echo ""
echo "── Test 1: ADR-0035 exists and Status is Accepted ──"

if [ -f "$ADR0035" ] && \
   grep -q "^## Status" "$ADR0035" && \
   grep -q "^[Aa]ccepted" "$ADR0035"; then
    pass "adr/0035 exists and Status is Accepted"
else
    fail "adr/0035-ci-runner-fork-isolation.md missing or not Accepted"
fi

# ── 2. Load-bearing interpretive claim is present ───────────────────────────
echo ""
echo "── Test 2: ADR-0035 records the parity-is-gate-equivalence claim ──"

# The sentence that prevents a future maintainer re-litigating ADR-0025.
# ("out of scope of the parity" is the claim's operative conclusion, on one
# line; the full sentence spans lines, so grep line-by-line.)
if grep -qi "out of scope of the parity" "$ADR0035"; then
    pass "ADR-0035 records that the runner is out of scope of the parity contract"
else
    fail "ADR-0035 missing the load-bearing parity interpretive claim"
fi

# ── 3. Transitive-sudo caveat is documented ─────────────────────────────────
echo ""
echo "── Test 3: ADR-0035 documents the transitive-sudo (Playwright) caveat ──"

if grep -qi "playwright" "$ADR0035" && grep -qi "transitively" "$ADR0035"; then
    pass "ADR-0035 documents the transitive-sudo caveat"
else
    fail "ADR-0035 missing the transitive-sudo caveat"
fi

# ── 4. Reversal conditions are documented ───────────────────────────────────
echo ""
echo "── Test 4: ADR-0035 documents reversal conditions ──"

if grep -qi "## Reversal conditions" "$ADR0035"; then
    pass "ADR-0035 documents reversal conditions"
else
    fail "ADR-0035 missing reversal conditions section"
fi

# ── 5. CONTEXT.md lists ADR-0035 in Architectural Decisions ─────────────────
echo ""
echo "── Test 5: CONTEXT.md lists ADR-0035 ──"

if grep -q "adr/0035-ci-runner-fork-isolation.md" "$CONTEXT"; then
    pass "CONTEXT.md lists ADR-0035"
else
    fail "CONTEXT.md missing the ADR-0035 entry"
fi

# ── Summary ────────────────────────────────────────────────────────────────

print_summary "ci_runner_isolation_adr_test.sh"
exit $?




# vim: ft=sh sts=4 sw=4 ts=4 et :
