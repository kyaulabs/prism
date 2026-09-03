#!/usr/bin/env bash
# $KYAULabs: prism_review_foundation_contract_test.sh kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"

DOC="$REPO_ROOT/packages/prism-core/docs/review-runtime.md"

printf '%s\n' '── review foundation documentation ──'
if [ -f "$DOC" ]; then
    pass 'review runtime reference exists'
else
    fail 'review runtime reference is missing'
fi
for phrase in 'non-authoritative' 'release, publication, and installation checkpoint' 'prism-review review staged --json' 'INSTALLED_EXTERNAL' 'possible provider cost'; do
    if grep -Fqi "$phrase" "$DOC" 2>/dev/null; then
        pass "runtime reference names $phrase"
    else
        fail "runtime reference omits $phrase"
    fi
done

printf '%s\n' '── OCR authority remains current ──'
if grep -Fq 'prism-tool code-review ocr' "$REPO_ROOT/packages/prism-core/skills/code-review/SKILL.md" \
    && grep -Fq 'code-review chain record' "$REPO_ROOT/packages/prism-core/skills/code-review/SKILL.md" \
    && grep -Fq 'Standing OCR consent' "$REPO_ROOT/packages/prism-core/skills/finishing-a-development-branch/SKILL.md" \
    && ! grep -Fq 'prism-review review authoritative' \
        "$REPO_ROOT/packages/prism-core/skills/finishing-a-development-branch/SKILL.md"; then
    pass 'current review and finalization still use OCR'
else
    fail 'current OCR review authority changed during foundation work'
fi
if grep -Fq "input.schemaVersion !== 1" "$REPO_ROOT/packages/prism-core/scripts/prism-tool/review-chain.js" \
    && grep -Fq 'schemaVersion: 1' "$REPO_ROOT/packages/prism-core/scripts/prism-tool/review-chain.js"; then
    pass 'current review chain remains version one'
else
    fail 'review chain version changed before cutover'
fi
if grep -Fq 'ocr: false' "$REPO_ROOT/packages/prism-core/scripts/prism-tool/consent.js" \
    && grep -Fq 'resolve-ocr-model.sh' "$REPO_ROOT/packages/prism-core/scripts/prism-tool/commit.js" \
    && grep -Fq "component.id === 'ocr'" "$REPO_ROOT/packages/prism-core/scripts/prism-tool/contract.js"; then
    pass 'consent, attribution, and toolchain remain OCR-owned'
else
    fail 'an OCR-owned boundary migrated during foundation work'
fi
if grep -Fq 'code-review' "$REPO_ROOT/packages/prism-core/prompts/pr.md" \
    && grep -Fq 'OCR' "$REPO_ROOT/packages/prism-core/prompts/doctor.md" \
    && grep -Fq 'OCR consent' "$REPO_ROOT/packages/prism-core/prompts/setup.md"; then
    pass 'current prompts retain OCR authority'
else
    fail 'current prompt authority changed before the bridge'
fi

printf '\nprism_review_foundation_contract_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

# vim: ft=sh sts=4 sw=4 ts=4 et :
