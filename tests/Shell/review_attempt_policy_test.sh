#!/usr/bin/env bash
# $KYAULabs: review_attempt_policy_test.sh kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
source "$ROOT/tests/Shell/lib/counter_helpers.sh"
CORE="$ROOT/packages/prism-core"

if grep -Fq 'At most two review attempts run automatically' "$CORE/skills/code-review/SKILL.md" \
    && grep -Fq 'third and every later attempt require fresh explicit approval' "$CORE/skills/code-review/SKILL.md"; then
    pass 'the coordinator permits two automatic attempts and stops before the third'
else
    fail 'the coordinator lacks the approved two-attempt boundary'
fi

POLICY="$CORE/docs/review-attempt-policy.md"
for phrase in \
    'Record the next attempt number before launching' \
    'including a failure' \
    'Two or more attempts used' \
    'approval permits only that attempt' \
    'without inference or consuming an attempt' \
    'Attempt history is missing or uncertain' \
    'Neither do fixes, new commits, changed HEAD or base' \
    'compaction, `/reload`, resuming the task' \
    'coordinator workflow policy' \
    'four complete axes' \
    'no open Blocking findings'; do
    if grep -Fq "$phrase" "$POLICY"; then pass "$phrase"; else fail "$phrase"; fi
done

for file in AGENTS.md skills/code-review/SKILL.md skills/finishing-a-development-branch/SKILL.md prompts/pr.md; do
    if grep -Fq 'review-attempt-policy.md' "$CORE/$file"; then
        pass "$file uses the shared policy"
    else
        fail "$file omits the shared policy"
    fi
done

if grep -Eq 'Every further attempt needs fresh|Every additional review attempt requires|A failed or second review' \
    "$CORE/AGENTS.md" "$CORE/skills/code-review/SKILL.md" \
    "$CORE/skills/finishing-a-development-branch/SKILL.md" "$CORE/prompts/pr.md"; then
    fail 'retired one-attempt approval policy remains active'
else
    pass 'retired one-attempt approval policy is absent from coordinators'
fi

printf '\nreview attempt policy: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

# vim: ft=sh sts=4 sw=4 ts=4 et :
