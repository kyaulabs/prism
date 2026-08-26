#!/usr/bin/env bash
# $KYAULabs: check-distill-contract.sh kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

set -euo pipefail

if [ "$#" -ne 1 ]; then
    printf 'Usage: check-distill-contract.sh <repository-root>\n' >&2
    exit 2
fi

ROOT=${1%/}
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PARSER="$SCRIPT_DIR/frontmatter-parser.js"
ERRORS=0

if [ ! -d "$ROOT" ] || [ ! -r "$ROOT" ]; then
    printf '%s: repository root is not a readable directory\n' "$ROOT" >&2
    exit 2
fi
if [ ! -f "$PARSER" ] || [ ! -r "$PARSER" ]; then
    printf '%s: frontmatter parser is not readable\n' "$PARSER" >&2
    exit 2
fi

err() {
    printf '%s\n' "$1" >&2
    ERRORS=$((ERRORS + 1))
}

required_files=(
    packages/prism-core/AGENTS.md
    packages/prism-core/APPEND_SYSTEM.md
    packages/prism-core/skills/distill/SKILL.md
    packages/prism-core/skills/distill/references/patterns.md
    packages/prism-core/NOTICE
    CODING_HARNESS.md
)

for relative in "${required_files[@]}"; do
    [ -f "$ROOT/$relative" ] || err "$relative: required Distill contract file is missing"
done

skill_file="$ROOT/packages/prism-core/skills/distill/SKILL.md"
if [ -f "$skill_file" ]; then
    skill_name=$(node "$PARSER" "$skill_file" name 2>/dev/null || true)
    [ "$skill_name" = 'distill' ] \
        || err "packages/prism-core/skills/distill/SKILL.md: expected skill name 'distill'; found '$skill_name'"
    skill_description=$(node "$PARSER" "$skill_file" description 2>/dev/null || true)
    description_lower=$(printf '%s' "$skill_description" | tr '[:upper:]' '[:lower:]')
    description_valid=true
    for trigger in durable rewrit tone substantial; do
        [[ "$description_lower" == *"$trigger"* ]] || description_valid=false
    done
    [ "$description_valid" = true ] \
        || err 'packages/prism-core/skills/distill/SKILL.md: description must name durable, rewrite, tone, and substantial triggers'
    derived_from=$(node "$PARSER" "$skill_file" derived-from 2>/dev/null || true)
    [ "$derived_from" = 'cursor/plugins pstack/skills/unslop (MIT, © Lauren Tan)' ] \
        || err 'packages/prism-core/skills/distill/SKILL.md: derived-from attribution does not match pstack unslop'
    skill_headings=(
        '## When to use'
        '## Process'
        '## Rules'
        '## Cross-refs'
        '## Gotchas'
    )
    for heading in "${skill_headings[@]}"; do
        grep -qFx "$heading" "$skill_file" \
            || err "packages/prism-core/skills/distill/SKILL.md: missing required heading $heading"
    done
fi

patterns_file="$ROOT/packages/prism-core/skills/distill/references/patterns.md"
if [ -f "$patterns_file" ]; then
    pattern_headings=(
        '## Content'
        '## Language'
        '## Style'
        '## Communication artifacts'
        '## Filler'
        '## Jargon'
        '## Plain speech'
        '## Prism exceptions'
    )
    for heading in "${pattern_headings[@]}"; do
        grep -qFx "$heading" "$patterns_file" \
            || err "packages/prism-core/skills/distill/references/patterns.md: missing required heading $heading"
    done
fi

coding_harness="$ROOT/CODING_HARNESS.md"
if [ -f "$coding_harness" ]; then
    grep -Fqi 'distill' "$coding_harness" \
        || err 'CODING_HARNESS.md: Distill orientation is missing'
fi

append_system="$ROOT/packages/prism-core/APPEND_SYSTEM.md"
if [ -f "$append_system" ]; then
    if grep -Fqi 'distill' "$append_system" \
        || grep -qFx '## Output style' "$append_system"; then
        err 'packages/prism-core/APPEND_SYSTEM.md: Distill guidance must not be duplicated here'
    fi
fi

notice_file="$ROOT/packages/prism-core/NOTICE"
if [ -f "$notice_file" ]; then
    notice_fields=(
        'https://github.com/cursor/plugins/tree/main/pstack'
        'Copyright (c) 2026 Lauren Tan'
        'License: MIT'
        'packages/prism-core/skills/distill/SKILL.md'
    )
    for field in "${notice_fields[@]}"; do
        grep -Fq "$field" "$notice_file" \
            || err "packages/prism-core/NOTICE: missing pstack attribution field: $field"
    done
fi

if [ -f "$ROOT/packages/prism-core/AGENTS.md" ]; then
    agents_file="$ROOT/packages/prism-core/AGENTS.md"
    heading_count=$(grep -cFx '## Output style' "$agents_file" || true)
    [ "$heading_count" -eq 1 ] \
        || err "packages/prism-core/AGENTS.md: expected exactly one ## Output style heading; found $heading_count"
    if [ "$heading_count" -eq 1 ]; then
        output_body=$(awk '
            $0 == "## Output style" { capture = 1; next }
            capture && /^## / { exit }
            capture { print }
        ' "$agents_file")
        word_count=$(printf '%s\n' "$output_body" | wc -w | tr -d '[:space:]')
        [ "$word_count" -le 80 ] \
            || err "packages/prism-core/AGENTS.md: output style body has $word_count words; maximum 80"
    fi
    grep -Eq '^\| `distill` \|' "$agents_file" \
        || err 'packages/prism-core/AGENTS.md: Distill skill table entry is missing'
fi

[ "$ERRORS" -eq 0 ] || exit 1
exit 0

# vim: ft=sh sts=4 sw=4 ts=4 et :
