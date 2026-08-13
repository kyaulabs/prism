#!/usr/bin/env bash
# $KYAULabs: classify_greenfield_test.sh kyau@aura.kyaulabs 2026/08/12 -0700 Exp $





set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$REPO_ROOT/packages/prism-core/scripts/classify-greenfield.sh"
PASS=0
FAIL=0
TMP_DIRS=()

cleanup() {
	for dir in "${TMP_DIRS[@]}"; do rm -rf "$dir"; done
}
trap cleanup EXIT

pass() { printf '  PASS %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL %s\n' "$1" >&2; FAIL=$((FAIL + 1)); }
fixture() { local d; d=$(mktemp -d); TMP_DIRS+=("$d"); git -C "$d" init -q; printf '%s' "$d"; }

assert_result() {
	local label="$1" dir="$2" expected_out="$3" expected_rc="$4"
	local out rc
	set +e
	out=$(bash "$SCRIPT" "$dir" 2>"$dir/error")
	rc=$?
	set -e
	if [ "$out" = "$expected_out" ] && [ "$rc" -eq "$expected_rc" ]; then
		pass "$label → $expected_out/$expected_rc"
	else
		fail "$label: got '$out'/$rc, expected '$expected_out'/$expected_rc"
	fi
}

printf '%s\n' '── classify-greenfield: empty repository ──'
dir=$(fixture)
assert_result 'no commits or project evidence' "$dir" greenfield 0

printf '%s\n' '── classify-greenfield: history ──'
dir=$(fixture)
git -C "$dir" -c user.name=fixture -c user.email=fixture@example.com commit --allow-empty -q -m initial
assert_result 'one commit' "$dir" established 1

printf '%s\n' '── classify-greenfield: language-agnostic evidence ──'
for path in CONTEXT.md docs/plans adr src lib app composer.json package.json Cargo.toml go.mod pyproject.toml; do
	dir=$(fixture)
	mkdir -p "$(dirname "$dir/$path")"
	if [[ "$path" == */* ]] || [[ "$path" != *.* ]]; then
		mkdir -p "$dir/$path"
	else
		: > "$dir/$path"
	fi
	assert_result "$path present" "$dir" established 1
done

printf '%s\n' '── classify-greenfield: invalid root ──'
dir=$(mktemp -d)
TMP_DIRS+=("$dir")
assert_result 'not a Git worktree' "$dir" indeterminate 2
if grep -q 'not a Git worktree' "$dir/error"; then
	pass 'indeterminate diagnostic is explicit'
else
	fail 'indeterminate diagnostic missing'
fi

printf '\nclassify_greenfield_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]





# vim: ft=sh sts=4 sw=4 ts=4 et :
