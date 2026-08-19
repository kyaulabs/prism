#!/usr/bin/env bash
# $KYAULabs: check-blank-lines.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

set -uo pipefail

if [ "$#" -ne 1 ]; then
    printf 'Usage: %s --tracked|--cached\n' "${0##*/}" >&2
    exit 2
fi
MODE="$1"
case "$MODE" in
    --tracked|--cached) ;;
    *)
        printf 'Usage: %s --tracked|--cached\n' "${0##*/}" >&2
        exit 2
        ;;
esac

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
    printf 'check-blank-lines: not inside a Git checkout\n' >&2
    exit 2
}
cd "$REPO_ROOT" || exit 2

TMPDIR_CHECK=$(mktemp -d) || exit 2
trap 'rm -rf "$TMPDIR_CHECK"' EXIT
ENTRIES="$TMPDIR_CHECK/entries"
if [ "$MODE" = "--tracked" ]; then
    if ! git ls-files -s -z > "$ENTRIES"; then
        printf 'check-blank-lines: unable to enumerate tracked files\n' >&2
        exit 2
    fi
else
    CANDIDATES="$TMPDIR_CHECK/candidates"
    if ! git diff --cached --name-only --diff-filter=ACMRT -z > "$CANDIDATES"; then
        printf 'check-blank-lines: unable to enumerate cached files\n' >&2
        exit 2
    fi
    : > "$ENTRIES"
    while IFS= read -r -d '' candidate; do
        if ! git ls-files -s -z -- "$candidate" >> "$ENTRIES"; then
            printf 'check-blank-lines: unable to resolve cached mode for %q\n' "$candidate" >&2
            exit 2
        fi
    done < "$CANDIDATES"
fi

PATHS="$TMPDIR_CHECK/paths"
ATTRS="$TMPDIR_CHECK/attributes"
: > "$PATHS"
while IFS= read -r -d '' record; do
    metadata=${record%%$'\t'*}
    path=${record#*$'\t'}
    file_mode=${metadata%% *}
    case "$file_mode" in
        100644|100755) printf '%s\0' "$path" >> "$PATHS" ;;
    esac
done < "$ENTRIES"

if [ "$MODE" = "--cached" ]; then
    git check-attr --cached --stdin -z \
        linguist-generated \
        linguist-vendored \
        prism-blank-lines-exempt < "$PATHS" > "$ATTRS"
    attribute_status=$?
else
    git check-attr --stdin -z \
        linguist-generated \
        linguist-vendored \
        prism-blank-lines-exempt < "$PATHS" > "$ATTRS"
    attribute_status=$?
fi
if [ "$attribute_status" -ne 0 ]; then
    printf 'check-blank-lines: unable to resolve file attributes\n' >&2
    exit 2
fi

violations=0
exec 3< "$PATHS"
exec 4< "$ATTRS"
while IFS= read -r -d '' path <&3; do
    excluded=0
    for expected_attribute in linguist-generated linguist-vendored prism-blank-lines-exempt; do
        if ! IFS= read -r -d '' attribute_path <&4 \
            || ! IFS= read -r -d '' attribute_name <&4 \
            || ! IFS= read -r -d '' attribute_value <&4; then
            printf 'check-blank-lines: incomplete attribute output\n' >&2
            exit 2
        fi
        if [ "$attribute_path" != "$path" ] || [ "$attribute_name" != "$expected_attribute" ]; then
            printf 'check-blank-lines: mismatched attribute output\n' >&2
            exit 2
        fi
        case "$attribute_value" in
            unspecified|unset|false) ;;
            *) excluded=1 ;;
        esac
    done
    [ "$excluded" -eq 0 ] || continue
    if [ "$MODE" = "--cached" ]; then
        CONTENT="$TMPDIR_CHECK/blob"
        if ! git show ":$path" > "$CONTENT" 2>/dev/null; then
            printf 'check-blank-lines: unable to read cached blob %q\n' "$path" >&2
            exit 2
        fi
    else
        CONTENT="$path"
        [ -f "$CONTENT" ] || {
            printf 'check-blank-lines: unable to read %q\n' "$path" >&2
            exit 2
        }
    fi
    [ -s "$CONTENT" ] || continue
    LC_ALL=C grep -Iq '' "$CONTENT"
    text_status=$?
    case "$text_status" in
        0) ;;
        1) continue ;;
        *)
            printf 'check-blank-lines: unable to classify %q\n' "$path" >&2
            exit 2
            ;;
    esac
    DIAGNOSTICS="$TMPDIR_CHECK/diagnostics"
    : > "$DIAGNOSTICS"
    metadata_rules=0
    case "$path" in
        *.php|*.js|*.scss|*.sh|*.ts) metadata_rules=1 ;;
    esac
    awk -v metadata_rules="$metadata_rules" '
        { sub(/\r$/, "") }
        /^[ \t]*$/ {
            line[NR] = $0
            blank[NR] = 1
            if (NR == 1) {
                print "1: leading blank line"
                bad = 1
            }
            if (length($0) > 0) {
                printf "%d: blank line contains spaces or tabs\n", NR
                bad = 1
            }
            next
        }
        {
            line[NR] = $0
            last_content = NR
        }
        END {
            if (blank[NR]) {
                start = NR
                while (start > 1 && blank[start - 1]) start--
                printf "%d: trailing blank line\n", start
                bad = 1
            }
            for (i = 1; i <= NR; i++) {
                if (metadata_rules && line[i] ~ /^[ \t]*(#|\/\/)[ \t]*\$KYAULabs:/) {
                    count = 0
                    for (j = i + 1; j <= NR && blank[j]; j++) {
                        metadata_blank[j] = 1
                        count++
                    }
                    if (count != 1) {
                        printf "%d: RCS header must be followed by exactly one blank line; found %d\n", i + 1, count
                        bad = 1
                    }
                }
                if (metadata_rules && line[i] ~ /^[ \t]*(#|\/\/)[ \t]*vim: ft=/) {
                    count = 0
                    for (j = i - 1; j >= 1 && blank[j]; j--) {
                        metadata_blank[j] = 1
                        count++
                    }
                    if (count != 1) {
                        printf "%d: vim modeline must be preceded by exactly one blank line; found %d\n", i - count, count
                        bad = 1
                    }
                    if (i != last_content) {
                        printf "%d: vim modeline must be the final content line\n", i
                        bad = 1
                    }
                }
            }
            i = 1
            while (i <= NR) {
                if (!blank[i]) {
                    i++
                    continue
                }
                start = i
                covered = 0
                while (i <= NR && blank[i]) {
                    if (metadata_blank[i]) covered = 1
                    i++
                }
                count = i - start
                if (count > 2 && start != 1 && i - 1 != NR && !covered) {
                    printf "%d: excessive blank-line run; found %d, maximum 2\n", start, count
                    bad = 1
                }
            }
        }
    ' "$CONTENT" >> "$DIAGNOSTICS"
    analyzer_status=$?
    if [ "$analyzer_status" -ne 0 ]; then
        printf 'check-blank-lines: analyzer failed for %q\n' "$path" >&2
        exit 2
    fi
    if [ -n "$(tail -c 1 "$CONTENT")" ]; then
        line_number=$(awk 'END { print NR }' "$CONTENT")
        printf '%d: missing final line feed\n' "$line_number" >> "$DIAGNOSTICS"
    fi
    if [ -s "$DIAGNOSTICS" ]; then
        violations=1
        display_path=${path//$'\n'/\\n}
        display_path=${display_path//$'\r'/\\r}
        display_path=${display_path//$'\t'/\\t}
        while IFS= read -r diagnostic; do
            printf '%s:%s\n' "$display_path" "$diagnostic"
        done < "$DIAGNOSTICS"
    fi
done

exit "$violations"

# vim: ft=sh sts=4 sw=4 ts=4 et :
