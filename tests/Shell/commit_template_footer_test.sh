#!/usr/bin/env bash
# $KYAULabs: commit_template_footer_test.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# commit_template_footer_test.sh — contract test that first-party commit
# templates produce messages the fail-closed commit-msg hook accepts
# (ADR-0025). Pure grep/sed: no commitlint dependency, always runs.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

# ── 1. /release delegates its ordinary commit to prism-tool ────────────────
RELEASE="$REPO_ROOT/packages/prism-core/prompts/release.md"
if grep -qF 'prism-tool commit prepare --type chore --scope release' "$RELEASE" \
	&& grep -qF 'prism-tool commit apply --plan' "$RELEASE" \
	&& grep -qiF 'exact commit message' "$RELEASE" \
	&& ! grep -qE '^[[:space:]]*git commit([[:space:]]|$)' "$RELEASE" \
	&& ! grep -qF 'resolve-ocr-model.sh' "$RELEASE" \
	&& ! grep -qF 'resolve-identity.sh' "$RELEASE"; then
	pass "release.md delegates its ordinary signed commit to prism-tool"
else
	fail "release.md does not use the launcher-owned commit approval workflow"
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
