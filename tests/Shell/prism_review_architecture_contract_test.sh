#!/usr/bin/env bash
# $KYAULabs: prism_review_architecture_contract_test.sh kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

contains() {
    local file="$1" value="$2" label="$3"
    if grep -qF "$value" "$file" 2>/dev/null; then
        pass "$label"
    else
        fail "$label"
    fi
}

ADR_RUNTIME="$REPO_ROOT/adr/0102-trusted-skill-first-review-runtime.md"
ADR_AUTHORITY="$REPO_ROOT/adr/0103-deterministic-review-authority-and-staged-ocr-cutover.md"
CONTEXT="$REPO_ROOT/CONTEXT.md"
RUNTIME="$REPO_ROOT/packages/prism-core/docs/review-runtime.md"
CORE_README="$REPO_ROOT/packages/prism-core/README.md"
ADAPTER_README="$REPO_ROOT/packages/prism-php-web/README.md"
VALIDATOR="$REPO_ROOT/packages/prism-core/scripts/validate-harness.sh"

contains "$ADR_RUNTIME" 'Accepted' 'runtime ADR accepted'
contains "$ADR_RUNTIME" '### Stable trust root' 'runtime ADR defines trust root'
contains "$ADR_RUNTIME" 'byte exposure' 'runtime ADR names exposure honestly'
contains "$ADR_RUNTIME" 'four axes' 'runtime ADR keeps four axes'
contains "$ADR_AUTHORITY" 'Accepted' 'authority ADR accepted'
contains "$ADR_AUTHORITY" '### Three-stage migration' 'authority ADR requires staged cutover'
contains "$ADR_AUTHORITY" 'Until cutover lands' 'OCR remains active during foundation'
contains "$ADR_RUNTIME" 'separately installed compatible adapter package' 'adapter quality cannot self-approve'
contains "$CONTEXT" '| Prism reviewer |' 'context defines reviewer'
contains "$CONTEXT" '| review profile |' 'context defines review profile'
contains "$CONTEXT" '| byte exposure |' 'context defines byte exposure'
contains "$CONTEXT" '| criteria receipt |' 'context defines criteria receipt'
contains "$CONTEXT" '| check receipt |' 'context defines check receipt'
contains "$CONTEXT" 'adr/0102-trusted-skill-first-review-runtime.md' 'context indexes ADR-0102'
contains "$CONTEXT" 'adr/0103-deterministic-review-authority-and-staged-ocr-cutover.md' 'context indexes ADR-0103'

contains "$RUNTIME" 'after approval and before implementation' \
    'bridge captures immutable criteria at the approved boundary'
contains "$RUNTIME" 'NONE_DECLARED' 'bridge documents explicit criteria absence'
contains "$RUNTIME" 'RUNNING' 'bridge documents prior PASS invalidation'
contains "$RUNTIME" 'external adapter package outside' 'bridge documents adapter trust parity'
contains "$RUNTIME" 'Exact same-HEAD reuse' 'bridge documents no-cost exact reuse'
contains "$RUNTIME" 'continuous repair' 'bridge documents continuous repair authority'
contains "$RUNTIME" 'dual-read preflight' 'bridge documents coherent version selection'
contains "$RUNTIME" 'source blobs, transcripts, or command logs' 'bridge prohibits raw evidence retention'
contains "$RUNTIME" 'Every additional attempt requires fresh' \
    'bridge documents additional-attempt approval'
contains "$RUNTIME" 'OCR and schema version one remain the normal' \
    'bridge preserves release authority'
contains "$RUNTIME" 'Humans publish and install packages, push branches, create pull requests' \
    'bridge preserves human-only mutations'
contains "$RUNTIME" 'cannot author authoritative' 'checkout Core has no authority claim'
contains "$CORE_README" 'dormant authority compatibility bridge' 'Core README identifies dormant bridge'
contains "$CORE_README" 'prism-review criteria record --source ROLE:COMMIT:PATH' \
    'Core README exposes immutable criteria command'
contains "$ADAPTER_README" 'php-web-quality' 'adapter README names quality provider'
contains "$ADAPTER_README" 'matching external' \
    'adapter README requires an external provider'
for module in authority check core-quality criteria criteria-tools quality-provider review-chain-v2 review-state; do
    contains "$VALIDATOR" "${module}.js" "validator inventories $module"
done

print_summary "prism review architecture contract"

# vim: ft=sh sts=4 sw=4 ts=4 et :
