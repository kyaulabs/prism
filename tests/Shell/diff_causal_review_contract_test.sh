#!/usr/bin/env bash
# $KYAULabs: diff_causal_review_contract_test.sh kyau@aura.kyaulabs 2026/08/23 -0700 Exp $

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

CODE_REVIEW="$REPO_ROOT/packages/prism-core/skills/code-review/SKILL.md"
RECEIVING="$REPO_ROOT/packages/prism-core/skills/receiving-code-review/SKILL.md"
STANDARDS="$REPO_ROOT/packages/prism-core/skills/standards-review/SKILL.md"
SPEC="$REPO_ROOT/packages/prism-core/skills/spec-review/SKILL.md"

assert_file_contains() {
	local file="$1" text="$2" label="$3"
	if grep -qF "$text" "$file"; then pass "$label"; else fail "$label"; fi
}

assert_file_not_contains() {
	local file="$1" text="$2" label="$3"
	if grep -qF "$text" "$file"; then fail "$label"; else pass "$label"; fi
}

assert_file_contains "$CODE_REVIEW" 'introduced or materially worsened by the reviewed delta' 'Blocking requires diff causality'
assert_file_contains "$CODE_REVIEW" 'deterministic reproduction, violated invariant, or direct security or data-loss path' 'Blocking requires concrete evidence'
assert_file_contains "$CODE_REVIEW" 'record.headSha' 'repair review starts at the prior reviewed HEAD'
assert_file_contains "$CODE_REVIEW" 'prism-tool code-review chain record' 'review records continuous chain evidence'
assert_file_contains "$RECEIVING" 'If any condition is not established, classify the finding Advisory' 'receiving review fails toward Advisory'
assert_file_contains "$RECEIVING" 'falsely pass, falsely fail, or omit evidence for a changed acceptance criterion' 'test findings block only when evidence is invalidated'
assert_file_contains "$STANDARDS" 'Advisory' 'structural smells are advisory'
assert_file_contains "$SPEC" 'COMPLETE_NO_SPEC' 'missing spec is a completed informational outcome'
assert_file_not_contains "$RECEIVING" 'Re-run `code-review` after fixes' 'full review restart wording is retired'

print_summary "diff causal review contract"

# vim: ft=sh sts=4 sw=4 ts=4 et :
