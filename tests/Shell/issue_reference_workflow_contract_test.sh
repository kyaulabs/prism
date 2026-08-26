#!/usr/bin/env bash
# $KYAULabs: issue_reference_workflow_contract_test.sh kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

FROM_ISSUE="$REPO_ROOT/packages/prism-core/skills/from-issue/SKILL.md"
WRITING_PLANS="$REPO_ROOT/packages/prism-core/skills/writing-plans/SKILL.md"
EXECUTING_PLANS="$REPO_ROOT/packages/prism-core/skills/executing-plans/SKILL.md"
CONVENTIONAL="$REPO_ROOT/packages/prism-core/skills/conventional-commits/SKILL.md"

assert_contains() {
    local file="$1" pattern="$2" message="$3"
    if grep -qiE -- "$pattern" "$file"; then
        pass "$message"
    else
        fail "$message"
    fi
}

printf '%s\n' '── Issue reference workflow contract ──'
assert_contains "$FROM_ISSUE" 'Originating issue' 'from-issue passes immutable issue provenance into planning'
assert_contains "$WRITING_PLANS" '\*\*Originating issue:\*\* #NN \| none' 'plans declare originating issue metadata'
assert_contains "$WRITING_PLANS" '--refs NN' 'intermediate issue-derived plan commits use refs'
assert_contains "$WRITING_PLANS" '--fixes NN' 'terminal issue-derived plan commit uses fixes'
assert_contains "$WRITING_PLANS" 'exactly one.*--fixes' 'plan self-review requires one closing commit'
assert_contains "$EXECUTING_PLANS" 'immutable originating issue' 'execution retains plan issue provenance'
assert_contains "$EXECUTING_PLANS" 'non-terminal.*--refs' 'execution uses refs before the terminal task'
assert_contains "$EXECUTING_PLANS" 'terminal logical implementation commit.*--fixes' 'execution closes on the terminal logical implementation commit'
assert_contains "$CONVENTIONAL" 'plan.*originating issue' 'commit selection consumes plan provenance'
assert_contains "$CONVENTIONAL" 'exactly one.*closing reference' 'commit workflow rejects duplicate closure'

print_summary "issue reference workflow"

# vim: ft=sh sts=4 sw=4 ts=4 et :
