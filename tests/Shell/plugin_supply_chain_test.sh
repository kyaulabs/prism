#!/usr/bin/env bash
# $KYAULabs: plugin_supply_chain_test.sh kyau@cosmos.kyaulabs 2026/07/22 -0700 Exp $


set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

# ── Test 1: @slkiser/opencode-quota is pinned with an exact version ────────────

echo ""
echo "── Test 1: quota plugin pinned with exact version ──"

SUB_PKG="$REPO_ROOT/.opencode/package.json"
if [ ! -f "$SUB_PKG" ]; then
	fail ".opencode/package.json not found"
else
	# Extract the version string for @slkiser/opencode-quota
	quota_ver=$(node -e "
		const p = require('$SUB_PKG');
		const deps = { ...(p.dependencies||{}), ...(p.devDependencies||{}) };
		process.stdout.write(deps['@slkiser/opencode-quota'] || '');
	" 2>/dev/null || echo "")

	if [ -z "$quota_ver" ]; then
		fail "@slkiser/opencode-quota not declared in .opencode/package.json"
	elif echo "$quota_ver" | grep -qE '^\^|~|>|<' ; then
		fail "@slkiser/opencode-quota uses a range ('$quota_ver') — must be exact"
	else
		pass "@slkiser/opencode-quota pinned at exact version $quota_ver"
	fi
fi

# ── Test 2: lockfile contains the pinned quota plugin ─────────────────────────

echo "── Test 2: lockfile contains pinned quota plugin ──"

SUB_LOCK="$REPO_ROOT/.opencode/package-lock.json"
if grep -q '"@slkiser/opencode-quota"' "$SUB_LOCK" 2>/dev/null; then
	pass "Quota plugin present in .opencode/package-lock.json"
else
	fail "Quota plugin NOT in .opencode/package-lock.json (run npm install in .opencode/)"
fi

print_summary "plugin_supply_chain"
exit $?


# vim: ft=sh sts=4 sw=4 ts=4 et :
