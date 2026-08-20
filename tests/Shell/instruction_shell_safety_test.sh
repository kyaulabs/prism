#!/usr/bin/env bash
# $KYAULabs: instruction_shell_safety_test.sh kyau@aura.kyaulabs 2026/08/19 -0700 Exp $

set -euo pipefail

SCRIPT_DIR=${BASH_SOURCE[0]%/*}
cd "$SCRIPT_DIR/../.."
REPO_ROOT=$PWD

resources=(
    "$REPO_ROOT/AGENTS.md"
    "$REPO_ROOT/CODING_HARNESS.md"
    "$REPO_ROOT/packages/prism-core/AGENTS.md"
    "$REPO_ROOT/packages/prism-core/APPEND_SYSTEM.md"
    "$REPO_ROOT"/packages/*/skills/*/SKILL.md
    "$REPO_ROOT"/packages/*/prompts/*.md
)

failures=0

printf '%s\n' '── instruction shell safety ──'

for file in "${resources[@]}"; do
    if [ ! -e "$file" ]; then
        printf 'FAIL: missing instruction resource %s\n' "${file#"$REPO_ROOT"/}" >&2
        failures=$((failures + 1))
        continue
    fi
    if [ ! -f "$file" ] || [ ! -r "$file" ]; then
        printf 'FAIL: cannot read instruction resource %s\n' "${file#"$REPO_ROOT"/}" >&2
        failures=$((failures + 1))
        continue
    fi

    grep_status=0
    grep -nHE "[$][(]|[$][']" "$file" || grep_status=$?
    if [ "$grep_status" -eq 0 ]; then
        printf 'FAIL: prohibited raw shell syntax in %s\n' "${file#"$REPO_ROOT"/}" >&2
        failures=$((failures + 1))
    elif [ "$grep_status" -gt 1 ]; then
        printf 'FAIL: cannot scan instruction resource %s\n' "${file#"$REPO_ROOT"/}" >&2
        failures=$((failures + 1))
    fi

    awk_status=0
    awk '
        function has_prohibited_shell_syntax(line, i, ch, quote, visible) {
            quote = ""
            visible = ""
            for (i = 1; i <= length(line); i++) {
                ch = substr(line, i, 1)
                if (quote == "single") {
                    if (ch == tick) return 1
                    if (ch == "\047") quote = ""
                    visible = visible " "
                    continue
                }
                if (quote == "double") {
                    if (ch == tick) return 1
                    if (ch == "\\") {
                        visible = visible "  "
                        i++
                        continue
                    }
                    if (ch == "\"") quote = ""
                    visible = visible " "
                    continue
                }
                if (ch == "\\") {
                    visible = visible "  "
                    i++
                    continue
                }
                if (ch == "\047") {
                    quote = "single"
                    visible = visible " "
                    continue
                }
                if (ch == "\"") {
                    quote = "double"
                    visible = visible " "
                    continue
                }
                if (ch == tick) return 1
                visible = visible ch
            }
            return visible ~ /^[[:space:]]*\(/ ||
                visible ~ /[;&|!][[:space:]]*\(/ ||
                visible ~ /[<>]\(/ || index(visible, "<<<") > 0
        }
        BEGIN {
            tick = sprintf("%c", 96)
            in_shell = 0
            found = 0
        }
        {
            trimmed = $0
            sub(/^[[:space:]]+/, "", trimmed)
            sub(/[[:space:]]+$/, "", trimmed)

            if (!in_shell) {
                fence_char = ""
                if (substr(trimmed, 1, 3) == tick tick tick) fence_char = tick
                if (substr(trimmed, 1, 3) == "~~~") fence_char = "~"
                if (fence_char != "") {
                    fence_length = 0
                    while (substr(trimmed, fence_length + 1, 1) == fence_char) fence_length++
                    language = substr(trimmed, fence_length + 1)
                    sub(/^[[:space:]]+/, "", language)
                    sub(/[[:space:]].*$/, "", language)
                    language = tolower(language)
                    if (language == "bash" || language == "sh" || language == "shell") {
                        in_shell = 1
                        opening_char = fence_char
                        opening_length = fence_length
                    }
                }
                next
            }

            closing_length = 0
            while (substr(trimmed, closing_length + 1, 1) == opening_char) closing_length++
            closing_tail = substr(trimmed, closing_length + 1)
            sub(/^[[:space:]]+/, "", closing_tail)
            sub(/[[:space:]]+$/, "", closing_tail)
            if (closing_length >= opening_length && closing_tail == "") {
                in_shell = 0
                next
            }
            if (has_prohibited_shell_syntax(trimmed)) {
                printf "%s:%d:%s\n", FILENAME, FNR, $0
                found = 1
            }
        }
        END {
            if (in_shell) {
                printf "%s:unterminated shell fence\n", FILENAME
                exit 2
            }
            exit found ? 0 : 1
        }
    ' "$file" || awk_status=$?
    if [ "$awk_status" -eq 0 ]; then
        printf 'FAIL: prohibited shell-fence syntax in %s\n' "${file#"$REPO_ROOT"/}" >&2
        failures=$((failures + 1))
    elif [ "$awk_status" -gt 1 ]; then
        printf 'FAIL: cannot parse shell fences in %s\n' "${file#"$REPO_ROOT"/}" >&2
        failures=$((failures + 1))
    fi
done

if [ "$failures" -ne 0 ]; then
    printf 'instruction_shell_safety_test.sh: %d resource checks failed\n' "$failures" >&2
    exit 1
fi

printf '%s\n' 'PASS: instruction resources use safety-compatible shell syntax'

# vim: ft=sh sts=4 sw=4 ts=4 et :
