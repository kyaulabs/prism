#!/usr/bin/env bash
# $KYAULabs: branch_finalization_workflow_test.sh kyau@aura.kyaulabs 2026/08/19 -0700 Exp $

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

SKILL="$REPO_ROOT/packages/prism-core/skills/finishing-a-development-branch/SKILL.md"

section_between() {
	local start="$1" end="$2"
	awk -v start="$start" -v end="$end" '
		$0 == start { active = 1; found_start = 1; next }
		active && $0 == end { found_end = 1; exit }
		active { print; found_content = 1 }
		END { if (!found_start || !found_end || !found_content) exit 1 }
	' "$SKILL"
}

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
	for index in "${!markers[@]}"; do
		start="<!-- finalization-${markers[$index]} -->"
		if [ "$index" -lt "$((${#markers[@]} - 1))" ]; then
			end="<!-- finalization-${markers[$((index + 1))]} -->"
		else
			end='## Stop conditions'
		fi
		if ! section_between "$start" "$end" >/dev/null; then
			fail "finalization section is missing or empty: ${markers[$index]}"
			ordered=false
		fi
	done
fi
if [ "$ordered" = true ]; then
	pass 'finalization stages appear in the required order and are non-empty'
else
	fail 'finalization stages are missing, duplicated, out of order, or empty'
fi

if ! artifact_cleanup=$(section_between \
	'<!-- finalization-artifact-cleanup -->' \
	'<!-- finalization-clean-tree -->'); then
	fail 'artifact-cleanup section is missing or empty'
	artifact_cleanup=''
fi
if ! acceptance=$(section_between \
	'<!-- finalization-acceptance -->' \
	'<!-- finalization-target-sync -->'); then
	fail 'acceptance section is missing or empty'
	acceptance=''
fi
if ! stop_conditions=$(section_between '## Stop conditions' '## Post-merge local cleanup'); then
	fail 'stop-conditions section is missing or empty'
	stop_conditions=''
fi
if ! pr_section=$(section_between '<!-- finalization-pr -->' '## Stop conditions'); then
	fail 'PR section is missing or empty'
	pr_section=''
fi

if grep -qF 'prism-tool commit create --type chore --scope docs --subject "remove completed development artifacts"' <<< "$artifact_cleanup" \
	&& grep -qF 'Stage the exact deleted' <<< "$artifact_cleanup" \
	&& grep -qF 'paths, load `conventional-commits`' <<< "$artifact_cleanup" \
	&& grep -qF 'only tool call' <<< "$artifact_cleanup"; then
	pass 'artifact cleanup uses atomic commit creation'
else
	fail 'artifact cleanup does not use atomic commit creation'
fi

if grep -qF 'git fetch origin' <<< "$acceptance" \
	&& grep -qiF 'merge commit' <<< "$acceptance" \
	&& grep -qiF 'one attempt' <<< "$acceptance" \
	&& grep -qF 'automatically invoke `/pr`' <<< "$acceptance" \
	&& grep -qF 'Standing OCR consent' <<< "$acceptance"; then
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
	'changed attestation or dirty tree'
)
for failure_case in "${failure_cases[@]}"; do
	if grep -qF "$failure_case must stop before \`/pr\` and requires fresh finalization acceptance" <<< "$stop_conditions"; then
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

if ! grep -qE '(^|[[:space:]`])(command[[:space:]]+)?gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)' \
	<<< "$pr_section" \
	&& ! grep -qE '(^|[[:space:]`])(command[[:space:]]+)?git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push([[:space:]]|$)' \
	<<< "$pr_section" \
	&& grep -qF 'preparation-only' <<< "$pr_section"; then
	pass 'finalization neither pushes nor creates the PR'
else
	fail 'finalization offers publication or GitHub mutation'
fi

print_summary "branch_finalization_workflow"

# vim: ft=sh sts=4 sw=4 ts=4 et :
