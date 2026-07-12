#!/usr/bin/env bash
# $KYAULabs: pre_commit_robustness_test.sh kyau@akira.kyaulabs 2026/07/12 -0700 Exp $










# ── Robustness tests for pre-commit hook (issue #79) ──────────────────────────
# Three defects:
#   1. CREATOR/HOSTNAME fallbacks unreachable under `set -euo pipefail`
#   2. RCS temp files have no trap cleanup; $TMP.mod is predictable
#   3. Non-ASCII filenames arrive quoted/escaped under core.quotePath
#
# Each test creates an isolated git repo, stages a file, runs the hook,
# and verifies the expected behavior.

set -euo pipefail

RESULT_FILE=$(mktemp)
TEMP_DIRS=""
trap 'rm -f "$RESULT_FILE"; [ -n "$TEMP_DIRS" ] && rm -rf $TEMP_DIRS' EXIT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
RESET=$'\033[0m'

pass() { echo "${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }
skip() { echo "SKIP $*"; }

# ── Resolve paths BEFORE any cd ────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRE_COMMIT="$REPO_ROOT/.github/hooks/pre-commit"
VENDOR_DIR="$REPO_ROOT/vendor"
NODE_MODULES_DIR="$REPO_ROOT/node_modules"
CS_FIXER_CONFIG="$REPO_ROOT/.php-cs-fixer.dist.php"
ESLINT_CONFIG="$REPO_ROOT/eslint.config.mjs"
STYLELINT_CONFIG="$REPO_ROOT/.stylelintrc.json"

if [ ! -f "$PRE_COMMIT" ]; then
	fail "Cannot find pre-commit hook at $PRE_COMMIT"
	exit 1
fi

# ── Helper: create an isolated git repo with linter tooling available ──────────

setup_test_repo()
{
	local dir="$1"
	git init --quiet "$dir"
	(
		cd "$dir"
		git config commit.gpgsign false
		git config user.email "test@example.com"
		git config user.name "Test User"

		ln -s "$VENDOR_DIR" vendor
		ln -s "$NODE_MODULES_DIR" node_modules

		[ -f "$CS_FIXER_CONFIG" ] && cp "$CS_FIXER_CONFIG" .php-cs-fixer.dist.php
		[ -f "$ESLINT_CONFIG" ]  && cp "$ESLINT_CONFIG"  eslint.config.mjs
		[ -f "$STYLELINT_CONFIG" ] && cp "$STYLELINT_CONFIG" .stylelintrc.json
	)
}

# ── Linter availability flags ──────────────────────────────────────────────────

HAS_PHP=false
HAS_SHELLCHECK=false
command -v php > /dev/null 2>&1 && HAS_PHP=true
command -v shellcheck > /dev/null 2>&1 && HAS_SHELLCHECK=true

# ==============================================================================
# Test 1: CREATOR/HOSTNAME fallback — hook survives missing user.email
# ==============================================================================

echo ""
echo "── Test 1: Hook survives missing user.email under set -e ──"
if ! $HAS_PHP; then
	skip "php not available"
else
	T1=$(mktemp -d)
	TEMP_DIRS="$TEMP_DIRS $T1"
	setup_test_repo "$T1"
	(
		cd "$T1"

		# Prevent git from reading global/system config for user.email
		export GIT_CONFIG_GLOBAL=/dev/null
		export GIT_CONFIG_SYSTEM=/dev/null

		# Unset user.email so `git config user.email` exits non-zero
		git config --unset user.email

		# Create and stage a clean .sh file (triggers RCS auto-add path)
		cat > test.sh <<'SHEOF'
#!/bin/bash
echo "hello"
SHEOF
		git add test.sh

		set +e
		HOOK_OUT=$(bash "$PRE_COMMIT" 2>&1)
		ret=$?
		set -e

		# Bug: under set -euo pipefail, `git config user.email | cut` fails
		# and set -e aborts the hook before the [ -z "$CREATOR" ] fallback.
		# After fix: `|| true` lets the fallback execute.
		if [ "$ret" -eq 0 ] && echo "$HOOK_OUT" | grep -qF "pre-commit passed"; then
			pass "Hook survives missing user.email (exit $ret)"
		else
			fail "Hook aborted when user.email is missing (exit $ret)"
		fi
	)
	rm -rf "$T1"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

total_pass=$(grep -c "PASS" "$RESULT_FILE" 2>/dev/null || true)
total_fail=$(grep -c "FAIL" "$RESULT_FILE" 2>/dev/null || true)
: "${total_pass:=0}"
: "${total_fail:=0}"

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$total_fail" -eq 0 ]; then
	echo "✓ pre-commit robustness tests PASSED — $total_pass assertion(s), 0 failures"
	echo "═══════════════════════════════════════════════════════════"
	exit 0
else
	echo "✗ pre-commit robustness tests FAILED — $total_pass passed, $total_fail failure(s)"
	echo "═══════════════════════════════════════════════════════════"
	exit 1
fi










# vim: ft=sh sts=4 sw=4 ts=4 et :
