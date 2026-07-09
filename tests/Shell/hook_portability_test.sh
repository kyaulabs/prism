#!/usr/bin/env bash
# $KYAULabs: hook_portability_test.sh kyau@nova 2026/07/08 -0700 Exp $

set -euo pipefail

# ── hook portability test ────────────────────────────────────────────────────
# Static scan of .github/hooks/pre-commit for constructs that are incompatible
# with BSD sed (macOS) or bash 3.2 (macOS system bash).
# Catches regressions on Linux CI that would otherwise only fail on macOS.
# ─────────────────────────────────────────────────────────────────────────────

HERE="$(cd "$(dirname "$0")" && pwd)"
HOOK="$HERE/../../.github/hooks/pre-commit"

fail=0

# 1. sed brace-grouping syntax '{ ... }' (BSD sed parses unreliably across
#    -e args and rejects forms without ';' before '}'). Banned entirely —
#    use awk or portable alternatives. Conservative: flags any '{' inside a
#    sed quoted argument (single-quote or -e form).
if grep -nE "sed[^|]*'[^']*\{[^']*'" "$HOOK" > /dev/null; then
	echo "FAIL: sed brace-grouping '{...}' found (BSD sed incompatible):"
	grep -nE "sed[^|]*'[^']*\{[^']*'" "$HOOK"
	fail=1
fi

# 2. mapfile / readarray (bash 4+ only; macOS ships bash 3.2)
if grep -nE '\b(mapfile|readarray)\b' "$HOOK" > /dev/null; then
	echo "FAIL: 'mapfile'/'readarray' usage found (bash 4+ only, not portable to bash 3.2):"
	grep -nE '\b(mapfile|readarray)\b' "$HOOK"
	fail=1
fi

# 3. declare -A (bash 4+ associative arrays)
if grep -nE '\bdeclare -A\b' "$HOOK" > /dev/null; then
	echo "FAIL: associative array 'declare -A' found (bash 4+ only):"
	grep -nE '\bdeclare -A\b' "$HOOK"
	fail=1
fi

if [ "$fail" -ne 0 ]; then
	echo ""
	echo "✗ hook portability test FAILED"
	exit 1
fi

echo "✓ hook portability test PASSED"
# vim: ft=sh sts=4 sw=4 ts=4 et :
