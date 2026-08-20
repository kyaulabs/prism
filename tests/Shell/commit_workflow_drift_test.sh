#!/usr/bin/env bash
# $KYAULabs: commit_workflow_drift_test.sh kyau@aura.kyaulabs 2026/08/19 -0700 Exp $

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

CHECKER="$REPO_ROOT/packages/prism-core/scripts/check-commit-workflows.js"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
setup_result_file

fixture() {
	local name="$1"
	local root="$TMP_ROOT/$name"
	mkdir -p "$root/packages/prism-core/skills/example" "$root/packages/prism-core/prompts"
	printf '%s' "$root"
}

DIRECT_ROOT="$(fixture direct)"
printf '%s\n' '```bash' 'git commit -S -m "unsafe"' '```' \
	> "$DIRECT_ROOT/packages/prism-core/skills/example/SKILL.md"
if node "$CHECKER" "$DIRECT_ROOT" >"$DIRECT_ROOT/output" 2>&1; then
	fail "direct ordinary git commit recipe was accepted"
elif grep -qF 'packages/prism-core/skills/example/SKILL.md:2: direct ordinary git commit recipe' "$DIRECT_ROOT/output"; then
	pass "direct ordinary git commit recipe is rejected with a stable diagnostic"
else
	fail "direct ordinary git commit rejection lacked its stable diagnostic"
fi

ANSI_ROOT="$(fixture ansi)"
printf '%s\n' 'Use git commit -S -m $'"'"'header\n\nfooter'"'"' for messages.' \
	> "$ANSI_ROOT/packages/prism-core/skills/example/SKILL.md"
if node "$CHECKER" "$ANSI_ROOT" >"$ANSI_ROOT/output" 2>&1; then
	fail "ANSI-C commit guidance was accepted"
elif grep -qF 'ANSI-C commit-message guidance' "$ANSI_ROOT/output"; then
	pass "ANSI-C commit guidance is rejected"
else
	fail "ANSI-C commit guidance lacked its specific diagnostic"
fi

RESOLVER_ROOT="$(fixture resolver)"
printf '%s\n' 'OCR_MODEL=$(bash "$(prism-tool resolve scripts)/resolve-ocr-model.sh")' \
	> "$RESOLVER_ROOT/packages/prism-core/prompts/example.md"
if node "$CHECKER" "$RESOLVER_ROOT" >"$RESOLVER_ROOT/output" 2>&1; then
	fail "direct attribution resolver recipe was accepted"
elif grep -qF 'direct attribution resolver recipe' "$RESOLVER_ROOT/output"; then
	pass "direct attribution resolver recipe is rejected"
else
	fail "direct attribution resolver rejection lacked its diagnostic"
fi

retired_names=(prepare apply discard plan approval)
retired_recipes=(
	'prism-tool commit prepare --type fix --subject "old"'
	'prism-tool commit apply --plan 0123456789abcdef0123456789abcdef --approval=yes'
	'prism-tool commit discard --plan 0123456789abcdef0123456789abcdef'
	'prism-tool commit create --type fix --subject "old" --plan deadbeef'
	'prism-tool commit create --type fix --subject "old" --approval=yes'
)
retired_diagnostics=(
	'retired commit prepare operation'
	'retired commit apply operation'
	'retired commit discard operation'
	'retired commit plan control'
	'retired commit approval control'
)
for index in "${!retired_names[@]}"; do
	name="${retired_names[$index]}"
	recipe="${retired_recipes[$index]}"
	diagnostic="${retired_diagnostics[$index]}"
	root="$(fixture "retired-$name")"
	printf '%s\n' "$recipe" > "$root/packages/prism-core/skills/example/SKILL.md"
	if node "$CHECKER" "$root" >"$root/output" 2>&1; then
		fail "retired commit $name workflow was accepted"
	elif grep -qF "packages/prism-core/skills/example/SKILL.md:1: $diagnostic" "$root/output"; then
		pass "retired commit $name workflow has a stable diagnostic"
	else
		fail "retired commit $name rejection lacked its stable diagnostic"
	fi
done

CONTINUATION_ROOT="$(fixture continuation)"
printf '%s\n' \
	'prism-tool commit \' \
	'prepare --type fix --subject "old"' \
	> "$CONTINUATION_ROOT/packages/prism-core/skills/example/SKILL.md"
if node "$CHECKER" "$CONTINUATION_ROOT" >"$CONTINUATION_ROOT/output" 2>&1; then
	fail "continued retired commit workflow was accepted"
elif grep -qF 'packages/prism-core/skills/example/SKILL.md:1: retired commit prepare operation' \
	"$CONTINUATION_ROOT/output"; then
	pass "continued retired commit workflow is rejected with its logical start line"
else
	fail "continued retired commit rejection lacked its diagnostic"
fi

CLEAN_ROOT="$(fixture clean)"
printf '%s\n' \
	'prism-tool commit create --type fix --scope core --subject "safe subject"' \
	> "$CLEAN_ROOT/packages/prism-core/skills/example/SKILL.md"
if node "$CHECKER" "$CLEAN_ROOT" >"$CLEAN_ROOT/output" 2>&1; then
	pass "atomic launcher-owned commit workflow is accepted"
else
	fail "atomic launcher-owned commit workflow was rejected: $(tr '\n' ' ' < "$CLEAN_ROOT/output")"
fi

MERGE_ROOT="$(fixture merge)"
mkdir -p "$MERGE_ROOT/packages/prism-core/skills/resolve-merge-conflicts"
printf '%s\n' '```bash' 'git commit -S' '```' \
	> "$MERGE_ROOT/packages/prism-core/skills/resolve-merge-conflicts/SKILL.md"
if node "$CHECKER" "$MERGE_ROOT" >"$MERGE_ROOT/output" 2>&1; then
	pass "exact merge completion command is accepted"
else
	fail "exact merge completion command was rejected"
fi

printf '%s\n' '```bash' 'git commit -S -m "ordinary payload"' '```' \
	> "$MERGE_ROOT/packages/prism-core/skills/resolve-merge-conflicts/SKILL.md"
if node "$CHECKER" "$MERGE_ROOT" >"$MERGE_ROOT/output" 2>&1; then
	fail "near-miss merge commit recipe was accepted"
else
	pass "near-miss merge commit recipe is rejected"
fi

WRAPPED_ROOT="$(fixture wrapped)"
printf '%s\n' '```bash' 'sudo git commit -S' '```' \
	> "$WRAPPED_ROOT/packages/prism-core/skills/example/SKILL.md"
if node "$CHECKER" "$WRAPPED_ROOT" >"$WRAPPED_ROOT/output" 2>&1; then
	fail "wrapped direct commit recipe was accepted"
elif grep -qF 'direct ordinary git commit recipe' "$WRAPPED_ROOT/output"; then
	pass "wrapped direct commit recipe is rejected"
else
	fail "wrapped direct commit rejection lacked its diagnostic"
fi

if grep -qF 'check-commit-workflows.js' "$REPO_ROOT/packages/prism-core/scripts/validate-harness.sh"; then
	pass "harness validation invokes the commit-workflow checker"
else
	fail "harness validation does not invoke the commit-workflow checker"
fi

HOOK="$REPO_ROOT/.github/hooks/commit-msg"
if grep -qF 'prism-tool commit create' "$HOOK" \
	&& ! grep -qF 'prism-tool commit prepare' "$HOOK" \
	&& ! grep -qF "git commit -S -m \$'" "$HOOK"; then
	pass "commit-msg hook recommends atomic creation without ANSI-C guidance"
else
	fail "commit-msg hook does not recommend the atomic launcher workflow"
fi

CONVENTIONAL="$REPO_ROOT/packages/prism-core/skills/conventional-commits/SKILL.md"
if grep -qF 'only tool call in its assistant batch' "$CONVENTIONAL" \
	&& grep -qF "Pi's" "$CONVENTIONAL" \
	&& grep -qF '`write` tool' "$CONVENTIONAL" \
	&& grep -qF 'exact rendered message and commit' "$CONVENTIONAL" \
	&& grep -qF 'fatal safety' "$CONVENTIONAL" \
	&& grep -qF '/reload' "$CONVENTIONAL" \
	&& ! grep -qF 'prism-tool commit prepare' "$CONVENTIONAL" \
	&& ! grep -qF 'prism-tool commit apply' "$CONVENTIONAL" \
	&& ! grep -qF 'prism-tool commit discard' "$CONVENTIONAL"; then
	pass "conventional-commits owns the exclusive atomic workflow and failure recovery"
else
	fail "conventional-commits atomic workflow contract is incomplete"
fi

WRITING_PLAN="$REPO_ROOT/packages/prism-core/skills/writing-plans/SKILL.md"
writing_plan_commit=$(awk '
	/- \[ \] \*\*Step 5: Create the commit\*\*/ { step = 1; next }
	step && /^```bash$/ { block = 1; next }
	block && /^```/ { exit }
	block { print }
' "$WRITING_PLAN")
expected_plan_commit=$(printf '%s\n%s' \
	'git add exact/files' \
	'prism-tool commit create --type feat --scope exact-scope --subject "exact subject"')
if [ "$writing_plan_commit" = "$expected_plan_commit" ] \
	&& grep -qF 'run these as separate tool calls' "$WRITING_PLAN"; then
	pass "writing-plans emits separate staging and atomic commit steps"
else
	fail "writing-plans commit template is stale"
fi

for relative in \
	packages/prism-core/skills/tdd/SKILL.md \
	packages/prism-core/skills/executing-plans/SKILL.md \
	packages/prism-core/skills/brainstorming/SKILL.md \
	packages/prism-core/skills/finishing-a-development-branch/SKILL.md; do
	if grep -qE 'single atomic|standalone atomic|atomic launcher|atomic `prism-tool commit create`' "$REPO_ROOT/$relative" \
		&& ! grep -qE 'commit (prepare|apply|discard)|prepare/approval/apply' "$REPO_ROOT/$relative"; then
		pass "$relative delegates to atomic commit creation"
	else
		fail "$relative retains a stale commit workflow"
	fi
done

CORE_AGENTS="$REPO_ROOT/packages/prism-core/AGENTS.md"
if grep -qF 'one standalone `prism-tool commit create` operation' "$CORE_AGENTS" \
	&& grep -qF 'tool call in its assistant batch' "$CORE_AGENTS" \
	&& grep -qF 'blocks every tool until `/reload`' "$CORE_AGENTS"; then
	pass "AGENTS policy requires exclusive atomic creation and fatal recovery"
else
	fail "AGENTS commit policy is incomplete"
fi

print_summary "commit_workflow_drift"

# vim: ft=sh sts=4 sw=4 ts=4 et :
