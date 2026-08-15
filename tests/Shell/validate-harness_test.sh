#!/usr/bin/env bash
# $KYAULabs: validate-harness_test.sh kyau@aura.kyaulabs 2026/08/14 -0700 Exp $










set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
VALIDATOR="$REPO_ROOT/packages/prism-core/scripts/validate-harness.sh"
PASS=0
FAIL=0

pass() { printf '  PASS %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL %s\n' "$1" >&2; FAIL=$((FAIL + 1)); }

printf '%s\n' '── validate-harness: real package tree ──'
if output=$(bash "$VALIDATOR" 2>&1); then
	printf '%s\n' "$output" | grep -q 'Harness validation PASSED' \
		&& pass 'real package tree passes' \
		|| fail 'success output lacks summary'
else
	fail "real package tree failed: $output"
fi

printf '%s\n' '── validate-harness: required checks are present ──'
for marker in 'Validating skills' 'Validating prompt templates' 'Validating extension imports' 'Validating toolchain contracts' 'Validating shell helpers' 'Checking retired config references' 'Checking instruction-layer script references'; do
	if grep -q "$marker" "$VALIDATOR"; then
		pass "$marker check wired"
	else
		fail "$marker check missing"
	fi
done

printf '%s\n' '── validate-harness: retired opencode permission gate absent ──'
if grep -q 'bash permission patterns' "$VALIDATOR"; then
	fail 'obsolete bash-permission prefix check remains'
else
	pass 'obsolete bash-permission prefix check removed'
fi

printf '%s\n' '── validate-harness: retired config scan remains fail-closed ──'
RETIRED_FIXTURE=$(mktemp "$REPO_ROOT/packages/prism-core/docs/.retired-config-test.XXXXXX")
trap 'rm -f "$RETIRED_FIXTURE"' EXIT
printf '%s\n' 'OPENCODE_MODEL_TEST' > "$RETIRED_FIXTURE"
if output=$(bash "$VALIDATOR" 2>&1); then
	fail 'retired config reference outside the verbatim checker was accepted'
elif printf '%s\n' "$output" | grep -Fq "${RETIRED_FIXTURE#$REPO_ROOT/}:1: retired config reference"; then
	pass 'retired config reference outside the verbatim checker is rejected'
else
	fail "retired config failure did not name fixture: $output"
fi
rm -f "$RETIRED_FIXTURE"
trap - EXIT

printf '%s\n' '── validate-harness: toolchain parity fails closed ──'
TOOLCHAIN_FIXTURE=$(mktemp -d "$REPO_ROOT/packages/.toolchain-test.XXXXXX")
trap 'rm -rf "$TOOLCHAIN_FIXTURE"' EXIT
cp "$REPO_ROOT/packages/prism-core/toolchain.json" "$TOOLCHAIN_FIXTURE/toolchain.json"
cat > "$TOOLCHAIN_FIXTURE/package.json" <<'JSON'
{
  "name": "@kyaulabs/prism-core",
  "dependencies": {
    "@commitlint/config-conventional": "21.2.2",
    "commitlint": "^21",
    "git-cliff": "2.13.1"
  },
  "prism": {"toolchain": "./toolchain.json"}
}
JSON
if output=$(bash "$VALIDATOR" 2>&1); then
	fail 'toolchain package dependency drift was accepted'
elif printf '%s\n' "$output" | grep -Fq 'package dependency drift for commitlint'; then
	pass 'toolchain package dependency drift is rejected'
else
	fail "toolchain parity failure did not name dependency drift: $output"
fi
rm -rf "$TOOLCHAIN_FIXTURE"
trap - EXIT

printf '\nvalidate-harness_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]










# vim: ft=sh sts=4 sw=4 ts=4 et :
