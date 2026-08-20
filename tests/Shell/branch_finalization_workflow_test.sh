#!/usr/bin/env bash
# $KYAULabs: branch_finalization_workflow_test.sh kyau@aura.kyaulabs 2026/08/19 -0700 Exp $

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

SKILL="$REPO_ROOT/packages/prism-core/skills/finishing-a-development-branch/SKILL.md"

marker_line() {
	local marker="$1" count line
	count=$(grep -cF "<!-- finalization-$marker -->" "$SKILL" || true)
	if [ "$count" -ne 1 ]; then
		return 1
	fi
	line=$(grep -nF "<!-- finalization-$marker -->" "$SKILL" | cut -d: -f1)
	printf '%s\n' "$line"
}

markers=(
	artifact-cleanup
	clean-tree
	acceptance
	target-sync
	attestation
	check
	code-review
	sha-revalidation
	pr
)
last=0
ordered=true
for marker in "${markers[@]}"; do
	line=$(marker_line "$marker") || {
		fail "finalization marker is unique: $marker"
		ordered=false
		continue
	}
	pass "finalization marker is unique: $marker"
	if [ "$line" -le "$last" ]; then
		ordered=false
	fi
	last="$line"
done
if [ "$ordered" = true ]; then
	pass 'finalization stages appear in the required order'
else
	fail 'finalization stages are missing, duplicated, or out of order'
fi

if grep -qF 'prism-tool commit create' "$SKILL" \
	&& grep -qF 'artifact cleanup' "$SKILL"; then
	pass 'artifact cleanup uses atomic commit creation'
else
	fail 'artifact cleanup does not use atomic commit creation'
fi

if grep -qF 'git fetch origin' "$SKILL" \
	&& grep -qiF 'merge commit' "$SKILL" \
	&& grep -qiF 'one attempt' "$SKILL" \
	&& grep -qF 'automatically invoke `/pr`' "$SKILL" \
	&& grep -qF 'Standing OCR consent' "$SKILL"; then
	pass 'the single acceptance discloses fetch, merge mutation, automatic PR preparation, and OCR boundary'
else
	fail 'finalization acceptance disclosure is incomplete'
fi

failure_cases=(
	'synchronization conflict'
	'`/check` failure'
	'incomplete review axis'
	'Blocking finding'
	'unresolved Suggested finding'
)
for failure_case in "${failure_cases[@]}"; do
	if grep -qF "$failure_case must stop before \`/pr\` and requires fresh finalization acceptance" "$SKILL"; then
		pass "$failure_case stops the attempt and requires fresh acceptance"
	else
		fail "$failure_case lacks stop-before-PR and fresh-acceptance semantics"
	fi
done

if ! grep -qF 'What would you like to do?' "$SKILL" \
	&& ! grep -qF '## Option responses' "$SKILL" \
	&& ! grep -qF 'Prepare a pull request' "$SKILL" \
	&& ! grep -qF 'Keep branch for further work' "$SKILL" \
	&& ! grep -qF 'Discard branch' "$SKILL"; then
	pass 'the post-gate PR/keep/discard menu is absent'
else
	fail 'the obsolete post-gate disposal menu remains'
fi

if ! grep -qF 'gh pr create' "$SKILL" \
	&& ! grep -qE '^[[:space:]]*git push([[:space:]]|$)' "$SKILL" \
	&& grep -qF '`/pr` remains preparation-only' "$SKILL"; then
	pass 'finalization neither pushes nor creates the PR'
else
	fail 'finalization offers publication or GitHub mutation'
fi

print_summary "branch_finalization_workflow"

# vim: ft=sh sts=4 sw=4 ts=4 et :
