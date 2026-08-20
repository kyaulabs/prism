#!/usr/bin/env bash
# $KYAULabs: fixture_helpers_test.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# ── Tests for tests/Shell/lib/fixture_helpers.sh ──────────────────────────────
#
# Exercises the subshell-safe fixture contract (issue #322): fixture <varname>
# must set the caller's variable and register the dir in TMP_DIRS so the
# EXIT-trap cleanup actually removes it; a failed mktemp must return non-zero
# and register nothing.
#
# fixture_helpers.sh owns the EXIT trap — do not source another
# trap-installing helper (e.g. test_helpers.sh) alongside it.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"
source "$REPO_ROOT/tests/Shell/lib/fixture_helpers.sh"

# Test 1: fixture sets the caller's variable to an existing directory
dir=
fixture dir
if [ -n "$dir" ] && [ -d "$dir" ]; then
	pass 'fixture sets caller variable to an existing directory'
else
	fail "fixture did not set caller variable (dir='${dir:-unset}')"
fi

# Test 2: fixture registers the created dir in TMP_DIRS
case " ${TMP_DIRS[*]} " in
	*" $dir "*) pass 'fixture registers created dir in TMP_DIRS' ;;
	*) fail 'fixture did not register created dir in TMP_DIRS' ;;
esac

# Test 3: fixture initializes a git repo with gpgsign disabled
if [ -d "$dir/.git" ] && [ "$(git -C "$dir" config commit.gpgsign)" = 'false' ]; then
	pass 'fixture git-inits the dir and disables gpgsign'
else
	fail 'fixture did not git-init with gpgsign disabled'
fi

# Test 4: mktemp failure returns non-zero and registers nothing
shim=$(mktemp -d)
TMP_DIRS+=("$shim")
cat > "$shim/mktemp" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
chmod +x "$shim/mktemp"
before=${#TMP_DIRS[@]}
set +e
PATH="$shim:$PATH" fixture d2 >/dev/null 2>&1
rc=$?
set -e
if [ "$rc" -ne 0 ] && [ "${#TMP_DIRS[@]}" -eq "$before" ]; then
	pass 'mktemp failure returns non-zero and registers nothing'
else
	fail "mktemp failure: rc=$rc tracked_delta=$(( ${#TMP_DIRS[@]} - before ))"
fi

# Test 5: cleanup removes every tracked dir (runs last — the EXIT trap then
# re-runs cleanup on already-removed paths, which is a silent no-op)
last=
fixture last
[ -d "$last" ] && cleanup
if [ ! -d "$dir" ] && [ ! -d "$last" ] && [ ! -d "$shim" ]; then
	pass 'cleanup removes all tracked dirs'
else
	fail 'cleanup left tracked dirs behind'
fi

printf '\nfixture_helpers_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

# vim: ft=sh sts=4 sw=4 ts=4 et :
