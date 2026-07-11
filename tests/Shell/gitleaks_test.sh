#!/usr/bin/env bash
# $KYAULabs: gitleaks_test.sh kyau@akira.kyaulabs 2026/07/10 -0700 Exp $


set -euo pipefail

# ── gitleaks pre-commit block test ───────────────────────────────────────────
# Static scan of .github/hooks/pre-commit to verify the gitleaks block uses
# the supported `gitleaks git --pre-commit --staged` invocation (not the
# deprecated `detect`/`protect` commands) and prints a warning when gitleaks
# is absent.
# ─────────────────────────────────────────────────────────────────────────────

HERE="$(cd "$(dirname "$0")" && pwd)"
HOOK="$HERE/../../.github/hooks/pre-commit"

fail=0

# 1. Hook must use the supported `gitleaks git --pre-commit --staged` invocation
if ! grep -qE 'gitleaks git --pre-commit --staged' "$HOOK"; then
	echo "FAIL: hook does not use 'gitleaks git --pre-commit --staged' (supported invocation)"
	fail=1
fi

# 2. Hook must NOT use the deprecated 'gitleaks detect' command
if grep -qE '\bgitleaks detect\b' "$HOOK"; then
	echo "FAIL: deprecated 'gitleaks detect' command found in hook:"
	grep -nE '\bgitleaks detect\b' "$HOOK"
	fail=1
fi

# 3. Hook must NOT use the deprecated 'gitleaks protect' command
if grep -qE '\bgitleaks protect\b' "$HOOK"; then
	echo "FAIL: deprecated 'gitleaks protect' command found in hook:"
	grep -nE '\bgitleaks protect\b' "$HOOK"
	fail=1
fi

# 4. Hook must NOT contain the inverted version-detection comment
if grep -qE "v8\+ uses 'detect'" "$HOOK"; then
	echo "FAIL: inverted version-detection comment still present in hook:"
	grep -nE "v8\+ uses 'detect'" "$HOOK"
	fail=1
fi

# 5. Hook must print a warning when gitleaks is absent (else branch)
if ! grep -qE 'gitleaks not installed' "$HOOK"; then
	echo "FAIL: no 'gitleaks not installed' warning found (absent-gitleaks is silent)"
	fail=1
fi

if [ "$fail" -ne 0 ]; then
	echo ""
	echo "✗ gitleaks pre-commit test FAILED"
	exit 1
fi

echo "✓ gitleaks pre-commit test PASSED"

# vim: ft=sh sts=4 sw=4 ts=4 et :
