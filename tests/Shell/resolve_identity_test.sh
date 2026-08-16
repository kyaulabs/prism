#!/usr/bin/env bash
# $KYAULabs: resolve_identity_test.sh kyau@aura.kyaulabs 2026/08/16 -0700 Exp $







set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$REPO_ROOT/packages/prism-core/scripts/resolve-identity.sh"
source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"
source "$REPO_ROOT/tests/Shell/lib/fixture_helpers.sh"

printf '%s\n' '── resolve-identity: git fallback ──'
dir=$(fixture)
git -C "$dir" config user.name 'Git User'
git -C "$dir" config user.email 'git@example.com'
out=$(cd "$dir" && HOME="$dir/home" bash "$SCRIPT")
[ "$out" = 'Git User <git@example.com>' ] && pass 'complete git identity resolves' || fail "unexpected git identity: $out"

printf '%s\n' '── resolve-identity: user override ──'
dir=$(fixture)
git -C "$dir" config user.name 'Git User'
git -C "$dir" config user.email 'git@example.com'
mkdir -p "$dir/home/.config/prism"
printf 'SIGNED_OFF_BY_NAME=Override User\nSIGNED_OFF_BY_EMAIL=override@example.com\n' > "$dir/home/.config/prism/identity"
out=$(cd "$dir" && HOME="$dir/home" bash "$SCRIPT")
[ "$out" = 'Override User <override@example.com>' ] && pass 'complete override wins' || fail "unexpected override identity: $out"

printf '%s\n' '── resolve-identity: malformed override fails closed ──'
dir=$(fixture)
git -C "$dir" config user.name 'Git User'
git -C "$dir" config user.email 'git@example.com'
mkdir -p "$dir/home/.config/prism"
printf 'SIGNED_OFF_BY_NAME=Partial User\n' > "$dir/home/.config/prism/identity"
set +e
out=$(cd "$dir" && HOME="$dir/home" bash "$SCRIPT" 2>"$dir/error")
rc=$?
set -e
if [ "$rc" -eq 3 ] && [ -z "$out" ] && grep -q 'must contain a valid name and email' "$dir/error"; then
	pass 'partial override does not mix with git fallback'
else
	fail "partial override: rc=$rc out=$out"
fi

printf '%s\n' '── resolve-identity: unknown key fails closed ──'
dir=$(fixture)
mkdir -p "$dir/home/.config/prism"
printf 'NAME=Wrong Key\n' > "$dir/home/.config/prism/identity"
set +e
(cd "$dir" && HOME="$dir/home" bash "$SCRIPT" >/dev/null 2>"$dir/error")
rc=$?
set -e
[ "$rc" -eq 3 ] && grep -q 'Invalid key' "$dir/error" && pass 'unknown override key rejected' || fail "unknown key rc=$rc"

printf '%s\n' '── resolve-identity: all sources absent ──'
dir=$(fixture)
set +e
out=$(cd "$dir" && HOME="$dir/home" bash "$SCRIPT" 2>"$dir/error")
rc=$?
set -e
if [ "$rc" -eq 3 ] && [ -z "$out" ] && grep -q 'Set git config user.name/user.email' "$dir/error"; then
	pass 'all sources absent exits 3 with remediation'
else
	fail "all sources absent: rc=$rc out=$out"
fi

printf '\nresolve_identity_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]







# vim: ft=sh sts=4 sw=4 ts=4 et :
