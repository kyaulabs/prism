#!/usr/bin/env bash
# $KYAULabs: commit_template_footer_test.sh kyau@cosmos.kyaulabs 2026/07/23 -0700 Exp $




# commit_template_footer_test.sh — contract test that first-party commit
# templates produce messages the fail-closed commit-msg hook accepts
# (ADR-0025). Pure grep/sed: no commitlint dependency, always runs.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

# ── 1. /release changelog commit carries required footers ───────────────────
# The release commit is a normal chore(release): commit (not a merge/revert),
# so commitlint's trailers-exist rule requires Authored-by/Tested-by/
# Signed-off-by. The old footerless double-quoted form must be gone.
RELEASE="$REPO_ROOT/.opencode/commands/release.md"
if grep -qF 'git commit -S -m "chore(release): vX.Y.Z"' "$RELEASE"; then
	fail "release.md still uses footerless double-quoted commit form"
else
	if grep -qF "Authored-by:" "$RELEASE" \
		&& grep -qF "Tested-by:" "$RELEASE" \
		&& grep -qF "Signed-off-by:" "$RELEASE"; then
		pass "release.md changelog commit includes required footers"
	else
		fail "release.md changelog commit missing Authored-by/Tested-by/Signed-off-by"
	fi
fi

print_summary "commit_template_footer"



# vim: ft=sh sts=4 sw=4 ts=4 et :
