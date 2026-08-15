#!/usr/bin/env bash
# $KYAULabs: prism_tool_resolve_test.sh kyau@aura.kyaulabs 2026/08/14 -0700 Exp $




# ── prism-tool resolve contract (script resolution) ───────────────────────
# Instruction-layer script references resolve through the launcher:
#   prism-tool resolve scripts|skills
# An ancestor checkout's packages/prism-core/<kind> wins (dogfooding);
# otherwise the running package's own <kind> directory is printed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

PRISM_TOOL="$REPO_ROOT/packages/prism-core/scripts/prism-tool.js"
CORE_SCRIPTS="$REPO_ROOT/packages/prism-core/scripts"
CORE_SKILLS="$REPO_ROOT/packages/prism-core/skills"
T=$(mktemp -d)
register_temp_dir "$T"

failures=0
assert_eq() {
	local actual="$1" expected="$2" label="$3"
	if [ "$actual" = "$expected" ]; then
		pass "$label"
	else
		fail "$label (expected '$expected', got '$actual')"
		failures=$((failures + 1))
	fi
}

# 1. Own-install fallback from a consumer-like CWD (no ancestor checkout).
mkdir -p "$T/consumer"
out=$(cd "$T/consumer" && node "$PRISM_TOOL" resolve scripts 2>/dev/null) || {
	fail "resolve scripts from consumer CWD exited non-zero"
	failures=$((failures + 1))
}
assert_eq "$out" "$CORE_SCRIPTS" "resolve scripts falls back to own install"

# 2. Checkout walk wins from a nested directory of a fake checkout.
mkdir -p "$T/fake/packages/prism-core/scripts" "$T/fake/packages/prism-core/skills"
mkdir -p "$T/fake/deep/nested"
out=$(cd "$T/fake/deep/nested" && node "$PRISM_TOOL" resolve scripts 2>/dev/null) || {
	fail "resolve scripts from fake checkout exited non-zero"
	failures=$((failures + 1))
}
assert_eq "$out" "$T/fake/packages/prism-core/scripts" "resolve scripts prefers ancestor checkout"
out=$(cd "$T/fake/deep/nested" && node "$PRISM_TOOL" resolve skills 2>/dev/null) || {
	fail "resolve skills from fake checkout exited non-zero"
	failures=$((failures + 1))
}
assert_eq "$out" "$T/fake/packages/prism-core/skills" "resolve skills prefers ancestor checkout"

# 3. Real checkout walk from a nested repository directory.
out=$(cd "$REPO_ROOT/backend" && node "$PRISM_TOOL" resolve scripts 2>/dev/null) || {
	fail "resolve scripts from checkout subdir exited non-zero"
	failures=$((failures + 1))
}
assert_eq "$out" "$CORE_SCRIPTS" "resolve scripts walks the real checkout"
out=$(cd "$REPO_ROOT/backend" && node "$PRISM_TOOL" resolve skills 2>/dev/null) || {
	fail "resolve skills from checkout subdir exited non-zero"
	failures=$((failures + 1))
}
assert_eq "$out" "$CORE_SKILLS" "resolve skills walks the real checkout"

# 4. Usage errors exit 2 with the usage line on stderr.
for bad in "" "bogus" "scripts extra"; do
	# shellcheck disable=SC2086
	if (cd "$T/consumer" && node "$PRISM_TOOL" resolve $bad >/dev/null 2>&1); then
		fail "resolve $bad should exit non-zero"
		failures=$((failures + 1))
	else
		pass "resolve $bad rejected"
	fi
done
usage_err=$(cd "$T/consumer" && node "$PRISM_TOOL" resolve bogus 2>&1 >/dev/null || true)
case "$usage_err" in
	*"usage: prism-tool resolve scripts|skills"*)
		pass "usage error names the contract" ;;
	*)
		fail "usage error missing contract (got: $usage_err)"
		failures=$((failures + 1)) ;;
esac

# 5. Resolved scripts dir actually contains the harness scripts.
if [ -x "$(cd "$T/consumer" && node "$PRISM_TOOL" resolve scripts 2>/dev/null)/install-hooks.sh" ]; then
	pass "resolved scripts dir contains install-hooks.sh"
else
	fail "resolved scripts dir missing install-hooks.sh"
	failures=$((failures + 1))
fi

if [ "$failures" -gt 0 ]; then
	print_summary "prism-tool resolve"
	exit 1
fi
print_summary "prism-tool resolve"
exit $?



# vim: ft=sh sts=4 sw=4 ts=4 et :
