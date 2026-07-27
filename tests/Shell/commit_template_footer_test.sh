#!/usr/bin/env bash
# $KYAULabs: commit_template_footer_test.sh kyau@cosmos.kyaulabs 2026/07/27 -0700 Exp $







# commit_template_footer_test.sh — contract test that first-party commit
# templates produce messages the fail-closed commit-msg hook accepts
# (ADR-0025). Pure grep/sed: no commitlint dependency, always runs.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

# ── 1. /release changelog commit carries required footers ───────────────────
# The release commit is a normal chore(release): commit (not a merge/revert),
# so commitlint's trailers-exist rule requires Authored-by/Implemented-by/
# Tested-by/Signed-off-by. The old footerless double-quoted form must be gone.
RELEASE="$REPO_ROOT/.opencode/commands/release.md"
if grep -qF 'git commit -S -m "chore(release): vX.Y.Z"' "$RELEASE"; then
	fail "release.md still uses footerless double-quoted commit form"
else
	if grep -qF "Authored-by:" "$RELEASE" \
		&& grep -qF "Implemented-by:" "$RELEASE" \
		&& grep -qF "Tested-by:" "$RELEASE" \
		&& grep -qF "Signed-off-by:" "$RELEASE"; then
		pass "release.md changelog commit includes required footers"
	else
		fail "release.md changelog commit missing Authored-by/Implemented-by/Tested-by/Signed-off-by"
	fi
fi

# ── 2. build agent gates git tag* behind confirmation ───────────────────────
# /release runs as the build agent and creates a signed tag via `git tag -s`.
# build's bash has "*": "allow", so without an explicit "git tag*": "ask" the
# tag is created with no confirmation — unlike git add/commit which are "ask".
build_block=$(sed -n '/"build": {/,/"plan": {/p' "$REPO_ROOT/opencode.jsonc")
if echo "$build_block" | grep -qF '"git tag*": "ask"'; then
	pass "build agent gates git tag* at ask"
else
	fail "build agent does not gate git tag* (release tag ungated)"
fi

# ── 3. @resolve-merge-conflicts merge subject is Merge-prefixed (exempt) ─────
# commitlint inspects only the message text (not git parents). A `chore: merge`
# subject matches neither the Merge-/Revert- exemption nor carries trailers, so
# the hook rejects it. Use a `Merge `-prefixed subject to trigger the exemption.
RMC="$REPO_ROOT/.opencode/agents/resolve-merge-conflicts.md"
if grep -qF 'Merge branch' "$RMC" && ! grep -qF 'chore: merge' "$RMC"; then
	pass "resolve-merge-conflicts uses Merge-prefixed merge subject"
else
	fail "resolve-merge-conflicts merge subject not Merge-prefixed (hook-rejected)"
fi

print_summary "commit_template_footer"






# vim: ft=sh sts=4 sw=4 ts=4 et :
