#!/usr/bin/env bash
# $KYAULabs: ci_local_parity_test.sh kyau@nova 2026/07/16 -0700 Exp $


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

print_summary "ci_local_parity"

# vim: ft=sh sts=4 sw=4 ts=4 et :
