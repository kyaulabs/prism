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

assert_between_contains() {
    local file="$1"
    local start="$2"
    local end="$3"
    local pattern="$4"
    local message="$5"

    if awk -v start="$start" -v end="$end" -v pattern="$pattern" '
        $0 == start { inside = 1; started = 1; next }
        inside && $0 == end { inside = 0; ended = 1; next }
        inside && index($0, pattern) { found = 1 }
        END { exit !(started && ended && found) }
    ' "$file"; then pass "$message"; else fail "$message"; fi
}

assert_between_ordered() {
    local file="$1"
    local start="$2"
    local end="$3"
    local message="$4"
    local first="$5"
    local second="$6"
    local third="$7"
    local fourth="${8:-}"
    local fifth="${9:-}"

    if awk -v start="$start" -v end="$end" -v p1="$first" -v p2="$second" -v p3="$third" -v p4="$fourth" -v p5="$fifth" '
        BEGIN {
            expected = 1
            count = 3
            patterns[1] = p1
            patterns[2] = p2
            patterns[3] = p3
            if (p4 != "") { patterns[++count] = p4 }
            if (p5 != "") { patterns[++count] = p5 }
        }
        $0 == start { inside = 1; started = 1; next }
        inside && $0 == end { inside = 0; ended = 1; next }
        inside && expected <= count && index($0, patterns[expected]) {
            expected++
            next
        }
        END { exit !(started && ended && expected == count + 1) }
    ' "$file"; then pass "$message"; else fail "$message"; fi
}

assert_not_contains() {
    local file="$1"
    local pattern="$2"
    local message="$3"

    if grep -Fq -- "$pattern" "$file"; then fail "$message"; else pass "$message"; fi
}

printf '%s\n' '── Wayfinder workflow contract ──'
assert_between_contains "$WAYFINDER" '### The map body' '### Child tickets' '## 🧭 Destination' 'map destination header uses an emoji'
assert_between_contains "$WAYFINDER" '### The map body' '### Child tickets' '## 📝 Notes' 'map notes header uses an emoji'
assert_between_contains "$WAYFINDER" '### The map body' '### Child tickets' '## ✅ Decisions so far' 'map decisions header uses an emoji'
assert_between_contains "$WAYFINDER" '### The map body' '### Child tickets' '## 🌫️ Not yet specified' 'map fog header uses an emoji'
assert_between_contains "$WAYFINDER" '### The map body' '### Child tickets' '## 🚫 Out of scope' 'map out-of-scope header uses an emoji'
assert_between_contains "$WAYFINDER" '### Child tickets' '## Ticket Types' '## ❓ Question' 'child issue question header uses an emoji'
assert_between_contains "$WAYFINDER" '### Child tickets' '## Ticket Types' '## ✅ Resolution' 'child issue resolution header uses an emoji'
assert_between_contains "$WAYFINDER" '### Child tickets' '## Ticket Types' 'Claiming is automatic and requires no approval.' 'frontier claims are approval-free'
assert_between_contains "$WAYFINDER" '## Workflow authorization' '## The Map' 'Routine map lifecycle mutations are pre-authorized' 'Wayfinder lifecycle mutations are pre-authorized'
assert_between_contains "$WAYFINDER" '## Workflow authorization' '## The Map' 'Corrective close operations are part of that authorization' 'corrective closes are approval-free'
assert_between_contains "$WAYFINDER" '## Session continuity' '## Invocation' 'Continue through successive frontier tickets in the current session' 'frontiers continue in the current session'
assert_between_ordered "$WAYFINDER" '### Chart the map' '### Work through the map' 'charting advances directly into the first frontier' '3. **Create the map**' '4. **Create sharp tickets**' '5. **Advance immediately.**'
assert_between_ordered "$WAYFINDER" '### Work through the map' '### Exit handoff' 'resolution flows through frontier reassessment to exit' '4. Post the **✅ Resolution** comment' '5. Apply consequences:' '6. Reassess:' 'eligible frontier remains' 'no tickets or fog remain'
assert_between_ordered "$WAYFINDER" '### Exit handoff' '## Cross-refs' 'exit handoff executes in workflow order' "1. Load \`to-spec\`" '2. If the spec is non-trivial or cross-cutting' '3. If the review requires ADRs' '4. Continue to the destination' 'Do not stop merely to announce the next skill or workflow step.'
assert_not_contains "$WAYFINDER" 'never resolve more than one ticket per session' 'one-ticket-per-session limit is removed'
assert_between_ordered "$TO_SPEC" '## Process' '## Spec template' 'Wayfinder synthesis reports seams and writes without another pause' 'A completed Wayfinder map supplies that confirmation.' 'status and continue without another approval pause.' '3. **Write the spec**'
assert_between_contains "$FROM_ISSUE" '### 7. Analyze the codebase (enhancement path)' '### 8. Plan' 'continue in the current session when context remains reliable' 'oversized issue handoff preserves the current session'
assert_not_contains "$FROM_ISSUE" 'Start a fresh focused session and load' 'oversized issue handoff does not force a fresh session'
assert_between_contains "$CORE_AGENTS" '## Skills Available' '## Commands' 'process eligible frontiers continuously' 'global skill index describes continuous Wayfinder work'
assert_between_contains "$CORE_AGENTS" '## Skills Available' '## Commands' 'workflow-authorized issues/labels/fields scope (ADR-0085)' 'global skill index describes tracker workflow authorization'

printf '%s\n' '── Tracker authorization contract ──'
assert_between_contains "$TRACKER" '## Authorization contract' '## Least-privilege command scope' 'workflow-scoped mutation authorization' 'tracker operator supports workflow-scoped authorization'
assert_between_contains "$TRACKER" '## Authorization contract' '## Least-privilege command scope' 'Read-only GitHub repository and tracker metadata is standing-authorized' 'tracker reads are standing-authorized'
assert_between_contains "$TRACKER" '## Authorization contract' '## Least-privilege command scope' 'Do not ask for network permission for those reads.' 'tracker reads require no permission prompt'
assert_between_contains "$WAYFINDER" '## Workflow authorization' '## The Map' 'Invocation or continuation is the complete authorization' 'Wayfinder invocation is the complete lifecycle authorization'
assert_between_contains "$WAYFINDER" '## Workflow authorization' '## The Map' 'Do not ask to claim, display exact mutations, or reconfirm' 'Wayfinder has no repeated claim or mutation confirmation'
assert_between_contains "$CORE_AGENTS" '## Hard Boundaries' '## File Naming' 'Read-only GitHub repository and tracker metadata accessed by an active Prism workflow is standing-authorized' 'global API boundary recognizes standing GitHub reads'
assert_not_contains "$CORE_AGENTS" '- Do not access external APIs without explicit permission' 'global API boundary no longer contradicts standing GitHub reads'
assert_between_contains "$TRACKER" '## Rules' '## Cross-refs' "caller's active workflow authorization" 'tracker rules consume workflow authorization'
assert_between_contains "$TRACKER" '## Rules' '## Cross-refs' 'not require per-command approval.' 'tracker rules avoid per-command prompts'
assert_not_contains "$TRACKER" 'requires approval for every mutation' 'tracker operator does not require per-mutation approval'
assert_not_contains "$TRACKER" 'Every mutation is human-approved.' 'tracker rules do not require every mutation approval'
assert_between_contains "$TICKETING" '## Execution topology' '## Mode detection' 'The full-preview confirmation authorizes the complete mutation batch' 'ticketing confirmation authorizes the full batch'
assert_between_ordered "$TICKETING" '## From-spec decomposition workflow' '## Wide-refactor path' 'epic creation uses one confirmation and no per-command pause' 'This single confirmation' '### Step 9: Create epic + task issues' 'without further'
assert_not_contains "$TICKETING" 'Present every mutation and wait for explicit human approval' 'ticketing does not pause for every mutation'

printf '%s\n' '── GraphQL-first tracker transport ──'
assert_between_contains "$TRACKER" '## GraphQL mutation transport' '## Untrusted content' 'gh api graphql --input .pi/tmp/tracker-mutation.json' 'tracker mutations use a literal project-local GraphQL payload'
assert_between_contains "$TICKETING" '## GraphQL issue mutation pattern' '## Single-issue workflow' 'createIssue' 'ticketing creates issues through GraphQL'
assert_between_contains "$TICKETING" '## GraphQL issue mutation pattern' '## Single-issue workflow' 'issueFields' 'ticketing creates issue fields atomically where supported'
assert_between_contains "$FROM_ISSUE" '### 5. Apply Type + Progress + triage label' '### 6. Route' 'updateIssue' 'from-issue updates existing issues through GraphQL'
assert_between_contains "$WAYFINDER" '## The Map' '### Labels (idempotent)' 'addComment' 'Wayfinder comments use GraphQL'
assert_not_contains "$TICKETING" 'issue-field-values' 'ticketing removes the REST field-values endpoint'
assert_not_contains "$FROM_ISSUE" 'issue-field-values' 'from-issue removes the REST field-values endpoint'
assert_not_contains "$TICKETING" 'gh issue create' 'ticketing removes convenience issue creation'
assert_not_contains "$TICKETING" 'gh issue edit' 'ticketing removes convenience issue mutation'
assert_not_contains "$FROM_ISSUE" 'gh issue edit' 'from-issue removes convenience issue mutation'
assert_not_contains "$WAYFINDER" 'gh issue edit' 'Wayfinder removes convenience relationship mutation'

printf '\nwayfinder_workflow_contract_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

# vim: ft=sh sts=4 sw=4 ts=4 et :
