#!/usr/bin/env bash
# $KYAULabs: commit_workflow_drift_test.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

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

CLEAN_ROOT="$(fixture clean)"
printf '%s\n' \
	'prism-tool commit prepare --type fix --scope core --subject "safe subject"' \
	'prism-tool commit apply --plan 0123456789abcdef0123456789abcdef --approval=yes' \
	'prism-tool commit discard --plan 0123456789abcdef0123456789abcdef' \
	> "$CLEAN_ROOT/packages/prism-core/skills/example/SKILL.md"
if node "$CHECKER" "$CLEAN_ROOT" >"$CLEAN_ROOT/output" 2>&1; then
	pass "launcher-owned commit workflow is accepted"
else
	fail "launcher-owned commit workflow was rejected: $(tr '\n' ' ' < "$CLEAN_ROOT/output")"
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

if grep -qF 'check-commit-workflows.js' "$REPO_ROOT/packages/prism-core/scripts/validate-harness.sh"; then
	pass "harness validation invokes the commit-workflow checker"
else
	fail "harness validation does not invoke the commit-workflow checker"
fi

HOOK="$REPO_ROOT/.github/hooks/commit-msg"
if grep -qF 'prism-tool commit prepare' "$HOOK" \
	&& ! grep -qF "git commit -S -m \$'" "$HOOK"; then
	pass "commit-msg hook recommends the launcher without ANSI-C guidance"
else
	fail "commit-msg hook does not recommend the launcher-owned workflow"
fi

print_summary "commit_workflow_drift"

# vim: ft=sh sts=4 sw=4 ts=4 et :
