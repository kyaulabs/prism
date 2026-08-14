#!/usr/bin/env bash
# $KYAULabs: commit_template_footer_test.sh kyau@aura.kyaulabs 2026/08/14 -0700 Exp $












# commit_template_footer_test.sh — contract test that first-party commit
# templates produce messages the fail-closed commit-msg hook accepts
# (ADR-0025). Pure grep/sed: no commitlint dependency, always runs.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

# ── 1. /release changelog commit carries required footers ───────────────────
# The release commit is a normal chore(release): commit (not a merge/revert),
# so commitlint's trailers-exist rule requires Implemented-by/Tested-by/
# Signed-off-by (ADR-0064). The old footerless double-quoted form must be gone.
RELEASE="$REPO_ROOT/packages/prism-core/prompts/release.md"
if grep -qF 'git commit -S -m "chore(release): vX.Y.Z"' "$RELEASE"; then
	fail "release.md still uses footerless double-quoted commit form"
else
	if grep -qF "Implemented-by:" "$RELEASE" \
		&& grep -qF "Tested-by:" "$RELEASE" \
		&& grep -qF "Signed-off-by:" "$RELEASE" \
		&& ! grep -qF "Authored-by:" "$RELEASE"; then
		pass "release.md changelog commit includes three required footers"
	else
		fail "release.md changelog commit missing Implemented-by/Tested-by/Signed-off-by (or still has Authored-by)"
	fi
fi

# ── 2. /release never creates a local tag ──────────────────────────────────
# Under pi the old per-agent permission matrix is gone. The release prompt
# itself carries the instruction-only safety contract: CI owns tag creation.
if grep -qF 'Never create a tag' "$RELEASE" && ! grep -qE '^[[:space:]]*git tag' "$RELEASE"; then
	pass "/release leaves tag creation to CI"
else
	fail "/release contains a local tag creation path"
fi

# ── 3. @resolve-merge-conflicts merge subject is Merge-prefixed (exempt) ─────
# commitlint inspects only the message text (not git parents). A `chore: merge`
# subject matches neither the Merge-/Revert- exemption nor carries trailers, so
# the hook rejects it. Use a `Merge `-prefixed subject to trigger the exemption.
RMC="$REPO_ROOT/packages/prism-core/skills/resolve-merge-conflicts/SKILL.md"
if grep -qF 'Merge branch' "$RMC" && ! grep -qF 'chore: merge' "$RMC"; then
	pass "resolve-merge-conflicts uses Merge-prefixed merge subject"
else
	fail "resolve-merge-conflicts merge subject not Merge-prefixed (hook-rejected)"
fi

print_summary "commit_template_footer"











# vim: ft=sh sts=4 sw=4 ts=4 et :
