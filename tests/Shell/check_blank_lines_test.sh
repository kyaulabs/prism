#!/usr/bin/env bash
# $KYAULabs: check_blank_lines_test.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECKER="$REPO_ROOT/packages/prism-core/scripts/check-blank-lines.sh"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

run_checker() {
    local repo="$1"
    local mode="$2"
    set +e
    CHECK_OUTPUT=$(cd "$repo" && bash "$CHECKER" "$mode" 2>&1)
    CHECK_STATUS=$?
    set -e
}

printf '%s\n' '── tracked canonical text ──'
T1=$(mktemp -d)
register_temp_dir "$T1"
git_init_test_repo "$T1"
printf 'alpha\n\n\nbeta\n' > "$T1/canonical.txt"
git -C "$T1" add canonical.txt
run_checker "$T1" --tracked
if [ "$CHECK_STATUS" -eq 0 ]; then
    pass 'tracked mode accepts two internal blank lines'
else
    fail "canonical tracked text failed (exit=$CHECK_STATUS): $CHECK_OUTPUT"
fi

printf '%s\n' '── tracked excessive blank run ──'
T2=$(mktemp -d)
register_temp_dir "$T2"
git_init_test_repo "$T2"
printf 'alpha\n\n\n\nbeta\n' > "$T2/excessive.txt"
git -C "$T2" add excessive.txt
run_checker "$T2" --tracked
if [ "$CHECK_STATUS" -eq 1 ] && printf '%s\n' "$CHECK_OUTPUT" | grep -Fq 'excessive.txt:2: excessive blank-line run; found 3, maximum 2'; then
    pass 'tracked mode rejects three internal blank lines'
else
    fail "excessive blank run was not diagnosed (exit=$CHECK_STATUS): $CHECK_OUTPUT"
fi

printf '%s\n' '── tracked boundary whitespace ──'
T3=$(mktemp -d)
register_temp_dir "$T3"
git_init_test_repo "$T3"
printf '\nalpha\n' > "$T3/leading.txt"
printf 'alpha\n\n' > "$T3/trailing.txt"
printf 'alpha' > "$T3/missing-final.txt"
printf 'alpha\n \nbeta\n' > "$T3/whitespace.txt"
git -C "$T3" add .
run_checker "$T3" --tracked
boundary_ok=1
for expected in \
    'leading.txt:1: leading blank line' \
    'trailing.txt:2: trailing blank line' \
    'missing-final.txt:1: missing final line feed' \
    'whitespace.txt:2: blank line contains spaces or tabs'; do
    printf '%s\n' "$CHECK_OUTPUT" | grep -Fq "$expected" || boundary_ok=0
done
if [ "$CHECK_STATUS" -eq 1 ] && [ "$boundary_ok" -eq 1 ]; then
    pass 'tracked mode rejects noncanonical boundary whitespace'
else
    fail "boundary whitespace was not fully diagnosed (exit=$CHECK_STATUS): $CHECK_OUTPUT"
fi

printf '%s\n' '── tracked RCS boundaries ──'
T4=$(mktemp -d)
register_temp_dir "$T4"
git_init_test_repo "$T4"
{
    printf '%s\n' '// $KYAULabs: bad.js test@example.test 2026/08/18 +0000 Exp $'
    printf '\n\n\n'
    printf '%s\n' 'const value = 1;'
    printf '\n\n\n'
    printf '%s\n' '// vim: ft=javascript sts=4 sw=4 ts=4 et :'
} > "$T4/bad.js"
git -C "$T4" add bad.js
run_checker "$T4" --tracked
metadata_ok=1
printf '%s\n' "$CHECK_OUTPUT" | grep -Fq 'bad.js:2: RCS header must be followed by exactly one blank line; found 3' || metadata_ok=0
printf '%s\n' "$CHECK_OUTPUT" | grep -Fq 'bad.js:6: vim modeline must be preceded by exactly one blank line; found 3' || metadata_ok=0
if printf '%s\n' "$CHECK_OUTPUT" | grep -Fq 'excessive blank-line run'; then
    metadata_ok=0
fi
if [ "$CHECK_STATUS" -eq 1 ] && [ "$metadata_ok" -eq 1 ]; then
    pass 'tracked mode enforces exact RCS boundary spacing'
else
    fail "RCS boundary spacing was not diagnosed (exit=$CHECK_STATUS): $CHECK_OUTPUT"
fi

printf '%s\n' '── tracked canonical special cases ──'
T5=$(mktemp -d)
register_temp_dir "$T5"
git_init_test_repo "$T5"
printf 'first line  \nsecond line\n' > "$T5/hard-break.md"
{
    printf '%s\n' '// $KYAULabs: canonical.js test@example.test 2026/08/18 +0000 Exp $'
    printf '\n'
    printf '%s\n' 'const value = 1;'
    printf '\n'
    printf '%s\n' '// vim: ft=javascript sts=4 sw=4 ts=4 et :'
} > "$T5/canonical.js"
git -C "$T5" add .
run_checker "$T5" --tracked
if [ "$CHECK_STATUS" -eq 0 ]; then
    pass 'tracked mode accepts Markdown hard breaks and canonical RCS spacing'
else
    fail "canonical special cases failed (exit=$CHECK_STATUS): $CHECK_OUTPUT"
fi

print_summary "check_blank_lines_test.sh"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
