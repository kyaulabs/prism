#!/usr/bin/env bash
# $KYAULabs: branch_finalization_workflow_test.sh kyau@aura.kyaulabs 2026/08/23 -0700 Exp $

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
		active {
			print
			if ($0 ~ /[^[:space:]]/) found_content = 1
		}
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
	authorization
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
			end='## Stop and retry conditions'
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
if ! authorization=$(section_between \
	'<!-- finalization-authorization -->' \
	'<!-- finalization-target-sync -->'); then
	fail 'authorization section is missing or empty'
	authorization=''
fi
if ! target_sync=$(section_between \
	'<!-- finalization-target-sync -->' \
	'<!-- finalization-attestation -->'); then
	fail 'target-sync section is missing or empty'
	target_sync=''
fi
if ! attestation=$(section_between \
	'<!-- finalization-attestation -->' \
	'<!-- finalization-check -->'); then
	fail 'attestation section is missing or empty'
	attestation=''
fi
if ! check_section=$(section_between \
	'<!-- finalization-check -->' \
	'<!-- finalization-code-review -->'); then
	fail 'check section is missing or empty'
	check_section=''
fi
if ! review_section=$(section_between \
	'<!-- finalization-code-review -->' \
	'<!-- finalization-sha-revalidation -->'); then
	fail 'code-review section is missing or empty'
	review_section=''
fi
if ! revalidation=$(section_between \
	'<!-- finalization-sha-revalidation -->' \
	'<!-- finalization-pr -->'); then
	fail 'SHA-revalidation section is missing or empty'
	revalidation=''
fi
if ! stop_conditions=$(section_between '## Stop and retry conditions' '## Post-merge local cleanup'); then
	fail 'stop-and-retry section is missing or empty'
	stop_conditions=''
fi
if ! pr_section=$(section_between '<!-- finalization-pr -->' '## Stop and retry conditions'); then
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

if grep -qF 'approved plan authorizes' <<< "$authorization" \
	&& grep -qF '`git fetch origin`' <<< "$authorization" \
	&& grep -qF 'required target merge' <<< "$authorization" \
	&& grep -qF 'unlimited local `/check` runs' <<< "$authorization" \
	&& grep -qF 'one four-axis review' <<< "$authorization" \
	&& grep -qF 'automatic preparation-only `/pr`' <<< "$authorization" \
	&& grep -qF 'Standing OCR consent' <<< "$authorization"; then
	pass 'plan approval discloses synchronization, unlimited checks, one review, automatic PR preparation, and OCR boundary'
else
	fail 'plan-approved finalization disclosure is incomplete'
fi

if grep -qF 'git fetch origin' <<< "$target_sync" \
	&& grep -qF 'git merge origin/<validated-target-branch>' <<< "$target_sync" \
	&& grep -qF 'main' <<< "$target_sync" \
	&& grep -qF 'develop' <<< "$target_sync"; then
	pass 'target synchronization derives, fetches, and merges the validated base'
else
	fail 'target synchronization contract is incomplete'
fi

attestation_fields=(BRANCH HEAD_SHA BASE_REF BASE_SHA)
attestation_complete=true
for field in "${attestation_fields[@]}"; do
	if ! grep -qF "$field=" <<< "$attestation"; then
		attestation_complete=false
	fi
done
if [ "$attestation_complete" = true ]; then
	pass 'attestation records branch, head, base ref, and base SHA'
else
	fail 'attestation omits required evidence fields'
fi

if grep -qF 'Invoke `/check`' <<< "$check_section" \
	&& grep -qiF 'complete successful result' <<< "$check_section" \
	&& grep -qF 'unlimited local `/check` executions' <<< "$check_section" \
	&& grep -qF 'a failure is within the' <<< "$check_section" \
	&& grep -qF 'approved spec and plan' <<< "$check_section" \
	&& grep -qF 'hard halts stop' <<< "$check_section" \
	&& grep -qF 'rerun `/check` without asking' <<< "$check_section"; then
	pass 'check stage requires a complete green gate and permits unlimited local reruns'
else
	fail 'check-stage gate contract is incomplete'
fi

if grep -qF '`code-review` skill' <<< "$review_section" \
	&& grep -qF 'tooling/style' <<< "$review_section" \
	&& grep -qF 'Fowler structural smells' <<< "$review_section" \
	&& grep -qF 'requirement coverage' <<< "$review_section" \
	&& grep -qF 'static security analysis' <<< "$review_section" \
	&& grep -qF 'review chain' <<< "$review_section" \
	&& grep -qF 'record.headSha' <<< "$review_section" \
	&& grep -qF 'no unresolved' <<< "$review_section" \
	&& grep -qF 'Advisory findings remain' <<< "$review_section" \
	&& grep -qF "plan's one initial review authorization" <<< "$review_section" \
	&& grep -qF 'Each fresh approval authorizes one chain-selected review attempt only' <<< "$review_section"; then
	pass 'review stage requires all four axes, one initial authorization, continuous chain evidence, and fresh approval for reruns'
else
	fail 'four-axis review contract is incomplete'
fi

if grep -qF 'require a clean tree' <<< "$revalidation" \
	&& grep -qF 're-read `BRANCH`, `HEAD_SHA`,' <<< "$revalidation" \
	&& grep -qF '`BASE_REF`, and `BASE_SHA`' <<< "$revalidation" \
	&& grep -qF 'exactly match the attestation' <<< "$revalidation"; then
	pass 'revalidation binds a clean tree to all attested values'
else
	fail 'SHA-revalidation contract is incomplete'
fi

if grep -qF 'synchronization conflict stops before attestation' <<< "$stop_conditions" \
	&& grep -qF '`resolve-merge-conflicts`' <<< "$stop_conditions"; then
	pass 'synchronization conflicts halt before attestation and route to conflict resolution'
else
	fail 'synchronization conflict handling is incomplete'
fi
if grep -qF '`/check` failure stays inside the unlimited local check loop' <<< "$stop_conditions"; then
	pass '/check failures remain inside the unlimited local loop when plan-scoped'
else
	fail '/check retry semantics are incomplete'
fi
if grep -qF 'incomplete review axis or unresolved diff-causal Blocking finding consumes' <<< "$stop_conditions" \
	&& grep -qF 'obtain fresh approval' <<< "$stop_conditions"; then
	pass 'incomplete or Blocking reviews require fresh approval before rerun'
else
	fail 'review rerun authorization semantics are incomplete'
fi
if grep -qF 'invalid, stale, discontinuous, or wrong-base review chain requires' <<< "$stop_conditions" \
	&& grep -qF 'new complete initial review' <<< "$stop_conditions"; then
	pass 'invalid review chains require a newly approved complete initial review'
else
	fail 'invalid review-chain retry semantics are incomplete'
fi
if grep -qF 'changed attestation or dirty tree after a successful review stops before' <<< "$stop_conditions" \
	&& grep -qF 'rerun `/check`' <<< "$stop_conditions" \
	&& grep -qF 'obtain fresh approval' <<< "$stop_conditions" \
	&& grep -qF 'reviewed identity is stale' <<< "$stop_conditions"; then
	pass 'changed attestation stops PR preparation and requires a newly approved review'
else
	fail 'changed-attestation retry semantics are incomplete'
fi

if ! grep -qF 'What would you like to do?' "$SKILL" \
	&& ! grep -qF '## Option responses' "$SKILL" \
	&& ! grep -qF 'Prepare a pull request' "$SKILL" \
	&& ! grep -qF 'Keep branch for further work' "$SKILL" \
	&& ! grep -qF 'Discard branch' "$SKILL"; then
	pass 'the post-gate PR/keep/discard menu is absent'
else
	fail 'the obsolete post-gate disposal menu remains'
fi

if ! grep -qE '(^|[[:space:]`])(gh|curl|wget)([[:space:]]|$)' <<< "$pr_section" \
	&& ! grep -qE '(^|[[:space:]`])git([^`[:space:]]|[[:space:]]+[^`[:space:]]+)*[[:space:]]+push([[:space:]]|$)' \
	<<< "$pr_section" \
	&& ! grep -qE 'prism-tool[[:space:]]+pr[[:space:]]+(publish|create|merge)([[:space:]]|$)' <<< "$pr_section" \
	&& grep -qF 'preparation-only' <<< "$pr_section"; then
	pass 'finalization neither pushes nor creates the PR'
else
	fail 'finalization offers publication or GitHub mutation'
fi

print_summary "branch_finalization_workflow"

# vim: ft=sh sts=4 sw=4 ts=4 et :
