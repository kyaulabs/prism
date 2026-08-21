#!/usr/bin/env bash
# $KYAULabs: cliff_changelog_edges_test.sh kyau@aura.kyaulabs 2026/08/21 -0700 Exp $

set -euo pipefail

# ── git-cliff changelog edge test ─────────────────────────────────────────────
# Renders a changelog from the real cliff.toml against a disposable fixture
# repository and asserts the generated file passes the repository blank-line
# policy (regression: the release template used to emit a trailing blank line,
# which the pre-commit hook rejected during the release commit).
# ─────────────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

CHECKER="$REPO_ROOT/packages/prism-core/scripts/check-blank-lines.sh"
CLIFF="${CLIFF_BIN:-$REPO_ROOT/node_modules/.bin/git-cliff}"
if [[ "$CLIFF" == */* && "$CLIFF" != /* ]]; then
	CLIFF="$PWD/$CLIFF"
fi

if [ -n "${CLIFF_BIN:-}" ]; then
	if [[ "$CLIFF" == */* ]]; then
		if [ ! -x "$CLIFF" ]; then
			fail "CLIFF_BIN is not executable: $CLIFF"
			print_summary "cliff_changelog_edges_test"
			exit 1
		fi
	elif ! command -v "$CLIFF" >/dev/null 2>&1; then
		fail "CLIFF_BIN is not on PATH: $CLIFF"
		print_summary "cliff_changelog_edges_test"
		exit 1
	fi
elif [ ! -x "$CLIFF" ]; then
	fail "bundled git-cliff is not installed; install dependencies before running this required regression test"
	print_summary "cliff_changelog_edges_test"
	exit 1
fi

echo "── generated changelog satisfies the blank-line policy ──"
T=$(mktemp -d)
register_temp_dir "$T"
git_init_test_repo "$T"
git -C "$T" commit --quiet --allow-empty -m "feat: fixture feature"
git -C "$T" commit --quiet --allow-empty -m "fix: fixture fix"

set +e
CLIFF_OUTPUT=$(cd "$T" && "$CLIFF" --config "$REPO_ROOT/cliff.toml" --unreleased --tag v9.9.9 --output CHANGELOG.md 2>&1)
CLIFF_STATUS=$?
set -e
if [ "$CLIFF_STATUS" -ne 0 ]; then
	fail "git-cliff failed (exit=$CLIFF_STATUS): $CLIFF_OUTPUT"
	print_summary "cliff_changelog_edges_test"
	exit 1
fi
if [ ! -s "$T/CHANGELOG.md" ]; then
	fail "git-cliff generated an empty changelog"
	print_summary "cliff_changelog_edges_test"
	exit 1
fi
for expected in 'Fixture feature' 'Fixture fix'; do
	if ! grep -Fq "$expected" "$T/CHANGELOG.md"; then
		fail "generated changelog is missing the entry: $expected"
		print_summary "cliff_changelog_edges_test"
		exit 1
	fi
done
git -C "$T" add CHANGELOG.md

set +e
CHECK_OUTPUT=$(cd "$T" && bash "$CHECKER" --cached 2>&1)
CHECK_STATUS=$?
set -e

if [ "$CHECK_STATUS" -eq 0 ] \
	&& [ "$(tail -c 2 "$T/CHANGELOG.md" | od -An -t x1 | tr -d '[:space:]')" != "0a0a" ]; then
	pass 'generated changelog satisfies the blank-line policy'
else
	fail "generated changelog violates the blank-line policy: $CHECK_OUTPUT"
fi

print_summary "cliff_changelog_edges_test"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
