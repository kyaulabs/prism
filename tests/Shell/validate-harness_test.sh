#!/usr/bin/env bash
# $KYAULabs: validate-harness_test.sh kyau@aura.kyaulabs 2026/08/12 -0700 Exp $





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
for marker in 'Validating skills' 'Validating prompt templates' 'Validating extension imports' 'Validating shell helpers' 'Checking retired config references'; do
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

printf '\nvalidate-harness_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]





# vim: ft=sh sts=4 sw=4 ts=4 et :
