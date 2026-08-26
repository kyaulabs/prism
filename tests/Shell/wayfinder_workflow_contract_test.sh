#!/usr/bin/env bash
# $KYAULabs: wayfinder_workflow_contract_test.sh kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
WAYFINDER="$REPO_ROOT/packages/prism-core/skills/wayfinder/SKILL.md"
TRACKER="$REPO_ROOT/packages/prism-core/skills/tracker-operator/SKILL.md"
TICKETING="$REPO_ROOT/packages/prism-core/skills/ticketing/SKILL.md"
TO_SPEC="$REPO_ROOT/packages/prism-core/skills/to-spec/SKILL.md"
FROM_ISSUE="$REPO_ROOT/packages/prism-core/skills/from-issue/SKILL.md"
CORE_AGENTS="$REPO_ROOT/packages/prism-core/AGENTS.md"
source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"

assert_contains() {
    local file="$1"
    local pattern="$2"
    local message="$3"

    if grep -Fq -- "$pattern" "$file"; then pass "$message"; else fail "$message"; fi
}

assert_not_contains() {
    local file="$1"
    local pattern="$2"
    local message="$3"

    if grep -Fq -- "$pattern" "$file"; then fail "$message"; else pass "$message"; fi
}

printf '%s\n' '── Wayfinder workflow contract ──'
assert_contains "$WAYFINDER" '## 🧭 Destination' 'map destination header uses an emoji'
assert_contains "$WAYFINDER" '## 📝 Notes' 'map notes header uses an emoji'
assert_contains "$WAYFINDER" '## ✅ Decisions so far' 'map decisions header uses an emoji'
assert_contains "$WAYFINDER" '## 🌫️ Not yet specified' 'map fog header uses an emoji'
assert_contains "$WAYFINDER" '## 🚫 Out of scope' 'map out-of-scope header uses an emoji'
assert_contains "$WAYFINDER" '## ❓ Question' 'child issue question header uses an emoji'
assert_contains "$WAYFINDER" '## ✅ Resolution' 'child issue resolution header uses an emoji'
assert_contains "$WAYFINDER" 'Claiming is automatic and requires no approval.' 'frontier claims are approval-free'
assert_contains "$WAYFINDER" 'Continue through successive frontier tickets in the current session' 'frontiers continue in the current session'
assert_not_contains "$WAYFINDER" 'never resolve more than one ticket per session' 'one-ticket-per-session limit is removed'
assert_contains "$WAYFINDER" 'Routine map lifecycle mutations are pre-authorized' 'Wayfinder lifecycle mutations are pre-authorized'
assert_contains "$WAYFINDER" 'Corrective close operations are part of that authorization' 'corrective closes are approval-free'
assert_contains "$WAYFINDER" 'Do not stop merely to announce the next skill or workflow step.' 'Wayfinder exit continues automatically'
assert_contains "$TO_SPEC" 'A completed Wayfinder map supplies that confirmation.' 'Wayfinder synthesis does not add a seam approval pause'
assert_contains "$FROM_ISSUE" 'continue in the current session when context remains reliable' 'oversized issue handoff preserves the current session'
assert_not_contains "$FROM_ISSUE" 'Start a fresh focused session and load' 'oversized issue handoff does not force a fresh session'
assert_contains "$CORE_AGENTS" 'process eligible frontiers continuously' 'global skill index describes continuous Wayfinder work'
assert_contains "$CORE_AGENTS" 'workflow-authorized issues/labels/fields scope (ADR-0085)' 'global skill index describes tracker workflow authorization'

printf '%s\n' '── Tracker authorization contract ──'
assert_contains "$TRACKER" 'workflow-scoped mutation authorization' 'tracker operator supports workflow-scoped authorization'
assert_not_contains "$TRACKER" 'requires approval for every mutation' 'tracker operator does not require per-mutation approval'
assert_not_contains "$TRACKER" 'Every mutation is human-approved.' 'tracker rules do not require every mutation approval'
assert_contains "$TICKETING" 'The full-preview confirmation authorizes the complete mutation batch' 'ticketing confirmation authorizes the full batch'
assert_not_contains "$TICKETING" 'Present every mutation and wait for explicit human approval' 'ticketing does not pause for every mutation'

printf '\nwayfinder_workflow_contract_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

# vim: ft=sh sts=4 sw=4 ts=4 et :
