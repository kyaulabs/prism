#!/usr/bin/env bash
# $KYAULabs: prism_review_foundation_contract_test.sh kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

set -euo pipefail
REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"
CORE="$REPO_ROOT/packages/prism-core"

contains() {
    if grep -Fqi "$2" "$1"; then pass "$3"; else fail "$3"; fi
}

contains "$CORE/docs/review-runtime.md" 'only finalization authority' 'installed reviewer owns authority'
contains "$CORE/docs/review-runtime.md" 'non-authoritative' 'ad hoc review cannot finalize'
contains "$CORE/skills/code-review/SKILL.md" 'prism-review review authoritative' 'review invokes installed authority'
contains "$CORE/skills/code-review/SKILL.md" 'third and every later attempt require fresh explicit approval' 'inference beyond two attempts requires approval'
contains "$CORE/skills/code-review/SKILL.md" 'all four axes' 'repairs retain complete axis coverage'
contains "$CORE/prompts/check.md" 'prism-review check --base-ref' 'check uses deterministic receipt publisher'
contains "$CORE/prompts/pr.md" 'REVIEW_CHAIN_VERSION=2' 'PR requires version-two evidence'
contains "$CORE/prompts/pr.md" 'V2_RECOVERY=READY' 'absent-chain recovery requires matching receipts'
contains "$CORE/prompts/setup.md" 'consent migrate --approval=yes' 'setup requires explicit consent migration'
contains "$CORE/prompts/doctor.md" 'makes no live inference request' 'doctor is local-only readiness'
contains "$CORE/scripts/prism-tool/commit.js" 'Tested-by: ${attribution.modelId}' 'both commit trailers use active Pi metadata'
contains "$CORE/skills/finishing-a-development-branch/SKILL.md" 'Before implementation and before artifact cleanup' 'criteria precede cleanup'

printf '\nreview authority contract: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

# vim: ft=sh sts=4 sw=4 ts=4 et :
