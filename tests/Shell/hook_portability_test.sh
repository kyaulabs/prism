#!/usr/bin/env bash
# $KYAULabs: hook_portability_test.sh kyau@nova 2026/07/13 -0700 Exp $


set -euo pipefail

# ── hook portability test ────────────────────────────────────────────────────
# Static scan of .github/hooks/pre-commit for constructs that are incompatible
# with BSD sed (macOS) or bash 3.2 (macOS system bash).
# Catches regressions on Linux CI that would otherwise only fail on macOS.
# ─────────────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

HOOK="$REPO_ROOT/.github/hooks/pre-commit"

# 1. sed brace-grouping syntax '{ ... }' (BSD sed parses unreliably across
#    -e args and rejects forms without ';' before '}'). Banned entirely —
#    use awk or portable alternatives. Conservative: flags any '{' inside a
#    sed quoted argument (single-quote or -e form).
if grep -nE "sed[^|]*'[^']*\{[^']*'" "$HOOK" > /dev/null; then
	fail "sed brace-grouping '{...}' found (BSD sed incompatible):"
	grep -nE "sed[^|]*'[^']*\{[^']*'" "$HOOK"
fi

# 2. mapfile / readarray (bash 4+ only; macOS ships bash 3.2)
if grep -nE '\b(mapfile|readarray)\b' "$HOOK" > /dev/null; then
	fail "'mapfile'/'readarray' usage found (bash 4+ only, not portable to bash 3.2):"
	grep -nE '\b(mapfile|readarray)\b' "$HOOK"
fi

# 3. declare -A (bash 4+ associative arrays)
if grep -nE '\bdeclare -A\b' "$HOOK" > /dev/null; then
	fail "associative array 'declare -A' found (bash 4+ only):"
	grep -nE '\bdeclare -A\b' "$HOOK"
fi

print_summary "hook_portability_test"
exit $?


# vim: ft=sh sts=4 sw=4 ts=4 et :
