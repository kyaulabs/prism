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
CLIFF="$REPO_ROOT/node_modules/.bin/git-cliff"

if [ ! -x "$CLIFF" ]; then
	skip "bundled git-cliff is not installed"
	print_summary "cliff_changelog_edges_test"
	exit $?
fi

echo "── generated changelog satisfies the blank-line policy ──"
T=$(mktemp -d)
register_temp_dir "$T"
git_init_test_repo "$T"
(
	cd "$T"
	git commit --quiet --allow-empty -m "feat: fixture feature"
	git commit --quiet --allow-empty -m "fix: fixture fix"
	"$CLIFF" --config "$REPO_ROOT/cliff.toml" --unreleased --tag v9.9.9 --output CHANGELOG.md >/dev/null 2>&1
	git add CHANGELOG.md
)

set +e
CHECK_OUTPUT=$(cd "$T" && bash "$CHECKER" --tracked 2>&1)
CHECK_STATUS=$?
set -e

if [ "$CHECK_STATUS" -eq 0 ]; then
	pass 'generated changelog satisfies the blank-line policy'
else
	fail "generated changelog violates the blank-line policy: $CHECK_OUTPUT"
fi

print_summary "cliff_changelog_edges_test"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
