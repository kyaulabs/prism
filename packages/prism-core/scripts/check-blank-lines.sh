#!/usr/bin/env bash
# $KYAULabs: check-blank-lines.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

set -uo pipefail

if [ "$#" -ne 1 ] || [ "$1" != "--tracked" ]; then
    printf 'Usage: %s --tracked|--cached\n' "${0##*/}" >&2
    exit 2
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
    printf 'check-blank-lines: not inside a Git checkout\n' >&2
    exit 2
}
cd "$REPO_ROOT" || exit 2

TMPDIR_CHECK=$(mktemp -d) || exit 2
trap 'rm -rf "$TMPDIR_CHECK"' EXIT
ENTRIES="$TMPDIR_CHECK/entries"
if ! git ls-files -s -z > "$ENTRIES"; then
    printf 'check-blank-lines: unable to enumerate tracked files\n' >&2
    exit 2
fi

violations=0
while IFS= read -r -d '' record; do
    metadata=${record%%$'\t'*}
    path=${record#*$'\t'}
    file_mode=${metadata%% *}
    case "$file_mode" in
        100644|100755) ;;
        *) continue ;;
    esac
    [ -f "$path" ] || {
        printf 'check-blank-lines: unable to read %q\n' "$path" >&2
        exit 2
    }
    [ -s "$path" ] || continue
    if ! LC_ALL=C grep -Iq '' "$path"; then
        continue
    fi
    DIAGNOSTICS="$TMPDIR_CHECK/diagnostics"
    : > "$DIAGNOSTICS"
    awk '
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
                if (line[i] ~ /\$KYAULabs:/) {
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
                if (line[i] ~ /vim: ft=/) {
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
            exit bad
        }
    ' "$path" >> "$DIAGNOSTICS"
    analyzer_status=$?
    if [ -n "$(tail -c 1 "$path")" ]; then
        line_number=$(awk 'END { print NR }' "$path")
        printf '%d: missing final line feed\n' "$line_number" >> "$DIAGNOSTICS"
        analyzer_status=1
    fi
    if [ "$analyzer_status" -ne 0 ]; then
        violations=1
        while IFS= read -r diagnostic; do
            printf '%s:%s\n' "$path" "$diagnostic"
        done < "$DIAGNOSTICS"
    fi
done < "$ENTRIES"

exit "$violations"

# vim: ft=sh sts=4 sw=4 ts=4 et :
