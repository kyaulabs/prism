#!/usr/bin/env bash
# $KYAULabs: gitleaks_test.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

set -euo pipefail

# ── gitleaks pre-commit block test ───────────────────────────────────────────
# Static scan of .github/hooks/pre-commit to verify the gitleaks block uses
# the supported `gitleaks git --pre-commit --staged` invocation (not the
# deprecated `detect`/`protect` commands) and prints a warning when gitleaks
# is absent.
# ─────────────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

HOOK="$REPO_ROOT/.github/hooks/pre-commit"

# 1. Hook must use the supported `gitleaks git --pre-commit --staged` invocation
if ! grep -qE 'gitleaks git --pre-commit --staged' "$HOOK"; then
	fail "hook does not use 'gitleaks git --pre-commit --staged' (supported invocation)"
fi

# 2. Hook must NOT use the deprecated 'gitleaks detect' command
if grep -qE '\bgitleaks detect\b' "$HOOK"; then
	fail "deprecated 'gitleaks detect' command found in hook"
	grep -nE '\bgitleaks detect\b' "$HOOK"
fi

# 3. Hook must NOT use the deprecated 'gitleaks protect' command
if grep -qE '\bgitleaks protect\b' "$HOOK"; then
	fail "deprecated 'gitleaks protect' command found in hook"
	grep -nE '\bgitleaks protect\b' "$HOOK"
fi

# 4. Hook must NOT contain the inverted version-detection comment
if grep -qE "v8\+ uses 'detect'" "$HOOK"; then
	fail "inverted version-detection comment still present in hook"
	grep -nE "v8\+ uses 'detect'" "$HOOK"
fi

# 5. Hook must print a warning when gitleaks is absent (else branch)
if ! grep -qE 'gitleaks not installed' "$HOOK"; then
	fail "no 'gitleaks not installed' warning found (absent-gitleaks is silent)"
fi

print_summary "gitleaks_test"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
