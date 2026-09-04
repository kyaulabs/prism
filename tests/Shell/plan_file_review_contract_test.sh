#!/usr/bin/env bash
# $KYAULabs: plan_file_review_contract_test.sh kyau@aura.kyaulabs 2026/08/31 -0700 Exp $

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

WRITING_PLANS="$REPO_ROOT/packages/prism-core/skills/writing-plans/SKILL.md"
FROM_ISSUE="$REPO_ROOT/packages/prism-core/skills/from-issue/SKILL.md"

assert_contains() {
    local file="$1" pattern="$2" message="$3"
    if grep -qiF -- "$pattern" "$file"; then
        pass "$message"
    else
        fail "$message"
    fi
}

assert_not_contains() {
    local file="$1" pattern="$2" message="$3"
    if grep -qiF -- "$pattern" "$file"; then
        fail "$message"
    else
        pass "$message"
    fi
}

printf '%s\n' '── Plan file review contract ──'
assert_contains "$WRITING_PLANS" \
    'Write every complete draft directly to' \
    'writing-plans creates the canonical file before review'
assert_contains "$WRITING_PLANS" \
    'Do not reproduce the plan body in the conversation.' \
    'writing-plans forbids duplicate conversation rendering'
assert_contains "$WRITING_PLANS" \
    'Do not emit a task-title outline' \
    'writing-plans omits unsolicited partial restatements'
assert_contains "$WRITING_PLANS" \
    'Apply requested changes directly to the same plan file.' \
    'writing-plans revises the canonical file in place'
assert_contains "$WRITING_PLANS" \
    'If writing or self-review fails' \
    'writing-plans blocks review of an incomplete file'
assert_not_contains "$WRITING_PLANS" \
    'Present the plan as text in the conversation for user review.' \
    'writing-plans removes conversation-first delivery'
assert_contains "$FROM_ISSUE" \
    'and (3) the exact plan path, but' \
    'from-issue reviews the canonical file by path'
assert_not_contains "$FROM_ISSUE" \
    '(3) the full plan. Then ask:' \
    'from-issue removes duplicate full-plan presentation'
assert_contains "$FROM_ISSUE" \
    "Reply 'go' to create the branch" \
    'from-issue preserves explicit execution approval'

print_summary "plan file review contract"

# vim: ft=sh sts=4 sw=4 ts=4 et :
