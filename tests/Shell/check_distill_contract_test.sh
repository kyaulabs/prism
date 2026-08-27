#!/usr/bin/env bash
# $KYAULabs: check_distill_contract_test.sh kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
CHECKER="$REPO_ROOT/packages/prism-core/scripts/check-distill-contract.sh"
source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"

make_valid_fixture() {
    local root="$1"
    mkdir -p "$root/packages/prism-core/skills/distill/references"

    cat > "$root/packages/prism-core/AGENTS.md" <<'MARKDOWN'
# Core

## Output style

Write directly and concretely. Preserve exact technical language. Load the `distill` skill for substantial prose.

## Skills Available

| Skill | When to use |
| --- | --- |
| `distill` | Use for durable prose |
MARKDOWN

    cat > "$root/packages/prism-core/APPEND_SYSTEM.md" <<'MARKDOWN'
# Pipeline bootstrap
MARKDOWN

    cat > "$root/packages/prism-core/skills/distill/SKILL.md" <<'MARKDOWN'
---
name: distill
description: Use when writing durable prose, rewriting supplied text, changing tone, or producing a substantial explanation.
derived-from: cursor/plugins pstack/skills/unslop (MIT, © Lauren Tan)
---

# Distill

## When to use

Use for durable prose.

## Process

Draft, edit, and audit.

## Rules

Preserve exact technical language.

## Cross-refs

See AGENTS.md.

## Gotchas

Do not invent personality.
MARKDOWN

    cat > "$root/packages/prism-core/skills/distill/references/patterns.md" <<'MARKDOWN'
# Distill pattern reference

## Content
## Language
## Style
## Communication artifacts
## Filler
## Jargon
## Plain speech
## Prism exceptions
MARKDOWN

    cat > "$root/packages/prism-core/NOTICE" <<'TEXT'
cursor/plugins pstack
  URL: https://github.com/cursor/plugins/tree/main/pstack
  Copyright: Copyright (c) 2026 Lauren Tan
  License: MIT
  Used in:
    - packages/prism-core/skills/distill/SKILL.md
TEXT

    cat > "$root/CODING_HARNESS.md" <<'MARKDOWN'
The `distill` skill handles substantial prose.
MARKDOWN
}

printf '%s\n' '── Distill contract checker ──'
set +e
usage_output=$(bash "$CHECKER" 2>&1)
usage_status=$?
set -e
if [ "$usage_status" -eq 2 ] && printf '%s\n' "$usage_output" | grep -Fq 'Usage: check-distill-contract.sh <repository-root>'; then
    pass 'invalid invocation exits 2'
else
    fail "invalid invocation contract mismatch: rc=$usage_status output=$usage_output"
fi

FIXTURE=$(mktemp -d "$REPO_ROOT/.distill-contract-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
MISSING_ROOT="$FIXTURE/missing-repository-root"
mkdir "$MISSING_ROOT"
rmdir "$MISSING_ROOT"

set +e
root_output=$(bash "$CHECKER" "$MISSING_ROOT" 2>&1)
root_status=$?
set -e
if [ "$root_status" -eq 2 ] && printf '%s\n' "$root_output" | grep -Fq 'repository root is not a readable directory'; then
    pass 'unreadable repository root exits 2'
else
    fail "unreadable-root contract mismatch: rc=$root_status output=$root_output"
fi

make_valid_fixture "$FIXTURE"

if output=$(bash "$CHECKER" "$FIXTURE" 2>&1); then
    pass 'valid Distill contract passes'
else
    fail "valid Distill contract failed: $output"
fi

MISSING_HEADING="$FIXTURE/missing-heading"
make_valid_fixture "$MISSING_HEADING"
awk '{ if ($0 == "## Output style") print "## Style"; else print }' \
    "$MISSING_HEADING/packages/prism-core/AGENTS.md" \
    > "$MISSING_HEADING/packages/prism-core/AGENTS.md.tmp"
mv "$MISSING_HEADING/packages/prism-core/AGENTS.md.tmp" \
    "$MISSING_HEADING/packages/prism-core/AGENTS.md"
if output=$(bash "$CHECKER" "$MISSING_HEADING" 2>&1); then
    fail 'missing output-style heading was accepted'
elif printf '%s\n' "$output" | grep -Fq 'AGENTS.md: expected exactly one ## Output style heading; found 0'; then
    pass 'missing output-style heading is rejected'
else
    fail "missing heading diagnostic mismatch: $output"
fi

DUPLICATE_HEADING="$FIXTURE/duplicate-heading"
make_valid_fixture "$DUPLICATE_HEADING"
printf '\n## Output style\n\nDuplicate.\n' >> "$DUPLICATE_HEADING/packages/prism-core/AGENTS.md"
if output=$(bash "$CHECKER" "$DUPLICATE_HEADING" 2>&1); then
    fail 'duplicate output-style heading was accepted'
elif printf '%s\n' "$output" | grep -Fq 'AGENTS.md: expected exactly one ## Output style heading; found 2'; then
    pass 'duplicate output-style heading is rejected'
else
    fail "duplicate heading diagnostic mismatch: $output"
fi

OVER_LIMIT="$FIXTURE/over-limit"
make_valid_fixture "$OVER_LIMIT"
{
    printf '# Core\n\n## Output style\n\n'
    for ((word = 1; word <= 81; word++)); do printf 'word '; done
    printf '\n\n## Skills Available\n\n| `distill` | Use for durable prose |\n'
} > "$OVER_LIMIT/packages/prism-core/AGENTS.md"
if output=$(bash "$CHECKER" "$OVER_LIMIT" 2>&1); then
    fail 'over-limit output-style section was accepted'
elif printf '%s\n' "$output" | grep -Fq 'AGENTS.md: output style body has 81 words; maximum 80'; then
    pass 'output-style word cap is enforced'
else
    fail "word-cap diagnostic mismatch: $output"
fi

MISSING_REFERENCE="$FIXTURE/missing-reference"
make_valid_fixture "$MISSING_REFERENCE"
rm "$MISSING_REFERENCE/packages/prism-core/skills/distill/references/patterns.md"
if output=$(bash "$CHECKER" "$MISSING_REFERENCE" 2>&1); then
    fail 'missing pattern reference was accepted'
elif printf '%s\n' "$output" | grep -Fq 'patterns.md: required Distill contract file is missing'; then
    pass 'missing pattern reference is rejected'
else
    fail "missing-reference diagnostic mismatch: $output"
fi

BAD_FRONTMATTER="$FIXTURE/bad-frontmatter"
make_valid_fixture "$BAD_FRONTMATTER"
awk '{ if ($0 == "name: distill") print "name: unslop"; else print }' \
    "$BAD_FRONTMATTER/packages/prism-core/skills/distill/SKILL.md" \
    > "$BAD_FRONTMATTER/packages/prism-core/skills/distill/SKILL.md.tmp"
mv "$BAD_FRONTMATTER/packages/prism-core/skills/distill/SKILL.md.tmp" \
    "$BAD_FRONTMATTER/packages/prism-core/skills/distill/SKILL.md"
if output=$(bash "$CHECKER" "$BAD_FRONTMATTER" 2>&1); then
    fail 'incorrect Distill skill name was accepted'
elif printf '%s\n' "$output" | grep -Fq "SKILL.md: expected skill name 'distill'; found 'unslop'"; then
    pass 'Distill skill name is enforced'
else
    fail "frontmatter diagnostic mismatch: $output"
fi

BAD_DESCRIPTION="$FIXTURE/bad-description"
make_valid_fixture "$BAD_DESCRIPTION"
awk '{ if ($0 ~ /^description:/) print "description: Helps with writing."; else print }' \
    "$BAD_DESCRIPTION/packages/prism-core/skills/distill/SKILL.md" \
    > "$BAD_DESCRIPTION/packages/prism-core/skills/distill/SKILL.md.tmp"
mv "$BAD_DESCRIPTION/packages/prism-core/skills/distill/SKILL.md.tmp" \
    "$BAD_DESCRIPTION/packages/prism-core/skills/distill/SKILL.md"
if output=$(bash "$CHECKER" "$BAD_DESCRIPTION" 2>&1); then
    fail 'non-triggering Distill description was accepted'
elif printf '%s\n' "$output" | grep -Fq 'SKILL.md: description must name durable, rewrite, tone, and substantial triggers'; then
    pass 'Distill description triggers are enforced'
else
    fail "description diagnostic mismatch: $output"
fi

BAD_ATTRIBUTION="$FIXTURE/bad-attribution"
make_valid_fixture "$BAD_ATTRIBUTION"
awk '{ if ($0 ~ /^derived-from:/) print "derived-from: unknown"; else print }' \
    "$BAD_ATTRIBUTION/packages/prism-core/skills/distill/SKILL.md" \
    > "$BAD_ATTRIBUTION/packages/prism-core/skills/distill/SKILL.md.tmp"
mv "$BAD_ATTRIBUTION/packages/prism-core/skills/distill/SKILL.md.tmp" \
    "$BAD_ATTRIBUTION/packages/prism-core/skills/distill/SKILL.md"
if output=$(bash "$CHECKER" "$BAD_ATTRIBUTION" 2>&1); then
    fail 'incorrect pstack attribution was accepted'
elif printf '%s\n' "$output" | grep -Fq 'SKILL.md: derived-from attribution does not match pstack unslop'; then
    pass 'pstack attribution is enforced'
else
    fail "attribution diagnostic mismatch: $output"
fi

MISSING_SKILL_HEADING="$FIXTURE/missing-skill-heading"
make_valid_fixture "$MISSING_SKILL_HEADING"
awk '{ if ($0 == "## Gotchas") print "## Notes"; else print }' \
    "$MISSING_SKILL_HEADING/packages/prism-core/skills/distill/SKILL.md" \
    > "$MISSING_SKILL_HEADING/packages/prism-core/skills/distill/SKILL.md.tmp"
mv "$MISSING_SKILL_HEADING/packages/prism-core/skills/distill/SKILL.md.tmp" \
    "$MISSING_SKILL_HEADING/packages/prism-core/skills/distill/SKILL.md"
if output=$(bash "$CHECKER" "$MISSING_SKILL_HEADING" 2>&1); then
    fail 'missing Distill skill heading was accepted'
elif printf '%s\n' "$output" | grep -Fq 'SKILL.md: missing required heading ## Gotchas'; then
    pass 'Distill skill headings are enforced'
else
    fail "skill-heading diagnostic mismatch: $output"
fi

MISSING_PATTERN_HEADING="$FIXTURE/missing-pattern-heading"
make_valid_fixture "$MISSING_PATTERN_HEADING"
awk '{ if ($0 == "## Jargon") print "## Terminology"; else print }' \
    "$MISSING_PATTERN_HEADING/packages/prism-core/skills/distill/references/patterns.md" \
    > "$MISSING_PATTERN_HEADING/packages/prism-core/skills/distill/references/patterns.md.tmp"
mv "$MISSING_PATTERN_HEADING/packages/prism-core/skills/distill/references/patterns.md.tmp" \
    "$MISSING_PATTERN_HEADING/packages/prism-core/skills/distill/references/patterns.md"
if output=$(bash "$CHECKER" "$MISSING_PATTERN_HEADING" 2>&1); then
    fail 'missing pattern heading was accepted'
elif printf '%s\n' "$output" | grep -Fq 'patterns.md: missing required heading ## Jargon'; then
    pass 'pattern reference headings are enforced'
else
    fail "pattern-heading diagnostic mismatch: $output"
fi

MISSING_INDEX="$FIXTURE/missing-index"
make_valid_fixture "$MISSING_INDEX"
awk '{ if ($0 ~ /^\| `distill` \|/) print "| `other` | Use for durable prose |"; else print }' \
    "$MISSING_INDEX/packages/prism-core/AGENTS.md" \
    > "$MISSING_INDEX/packages/prism-core/AGENTS.md.tmp"
mv "$MISSING_INDEX/packages/prism-core/AGENTS.md.tmp" \
    "$MISSING_INDEX/packages/prism-core/AGENTS.md"
if output=$(bash "$CHECKER" "$MISSING_INDEX" 2>&1); then
    fail 'missing Distill skill index was accepted'
elif printf '%s\n' "$output" | grep -Fq 'AGENTS.md: Distill skill table entry is missing'; then
    pass 'Distill skill index is enforced'
else
    fail "skill-index diagnostic mismatch: $output"
fi

MISSING_ORIENTATION="$FIXTURE/missing-orientation"
make_valid_fixture "$MISSING_ORIENTATION"
printf '%s\n' 'Harness orientation.' > "$MISSING_ORIENTATION/CODING_HARNESS.md"
if output=$(bash "$CHECKER" "$MISSING_ORIENTATION" 2>&1); then
    fail 'missing Distill orientation was accepted'
elif printf '%s\n' "$output" | grep -Fq 'CODING_HARNESS.md: Distill orientation is missing'; then
    pass 'Distill orientation is enforced'
else
    fail "orientation diagnostic mismatch: $output"
fi

BAD_NOTICE="$FIXTURE/bad-notice"
make_valid_fixture "$BAD_NOTICE"
awk '{ if ($0 ~ /Lauren Tan/) next; print }' "$BAD_NOTICE/packages/prism-core/NOTICE" \
    > "$BAD_NOTICE/packages/prism-core/NOTICE.tmp"
mv "$BAD_NOTICE/packages/prism-core/NOTICE.tmp" "$BAD_NOTICE/packages/prism-core/NOTICE"
if output=$(bash "$CHECKER" "$BAD_NOTICE" 2>&1); then
    fail 'incomplete pstack NOTICE was accepted'
elif printf '%s\n' "$output" | grep -Fq 'NOTICE: missing pstack attribution field: Copyright (c) 2026 Lauren Tan'; then
    pass 'pstack NOTICE attribution is enforced'
else
    fail "NOTICE diagnostic mismatch: $output"
fi

DUPLICATE_APPEND="$FIXTURE/duplicate-append"
make_valid_fixture "$DUPLICATE_APPEND"
printf '\nLoad distill for prose.\n' >> "$DUPLICATE_APPEND/packages/prism-core/APPEND_SYSTEM.md"
if output=$(bash "$CHECKER" "$DUPLICATE_APPEND" 2>&1); then
    fail 'Distill duplication in APPEND_SYSTEM.md was accepted'
elif printf '%s\n' "$output" | grep -Fq 'APPEND_SYSTEM.md: Distill guidance must not be duplicated here'; then
    pass 'APPEND_SYSTEM.md duplication is rejected'
else
    fail "APPEND_SYSTEM diagnostic mismatch: $output"
fi

printf '\ncheck_distill_contract_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

# vim: ft=sh sts=4 sw=4 ts=4 et :
