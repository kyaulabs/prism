#!/usr/bin/env bash
# $KYAULabs: check_blank_lines_test.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECKER="$REPO_ROOT/packages/prism-core/scripts/check-blank-lines.sh"
PRE_COMMIT="$REPO_ROOT/.github/hooks/pre-commit"
FAKE_PRISM_TOOL="$REPO_ROOT/tests/Shell/fixtures/fake-prism-tool.sh"
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

printf '%s\n' '── tracked metadata-like source text ──'
T5B=$(mktemp -d)
register_temp_dir "$T5B"
git_init_test_repo "$T5B"
cat > "$T5B/fixture-builder.sh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' '// $KYAULabs: fixture.js test@example.test 2026/08/18 +0000 Exp $'
printf '%s\n' '// vim: ft=javascript sts=4 sw=4 ts=4 et :'
EOF
git -C "$T5B" add fixture-builder.sh
run_checker "$T5B" --tracked
if [ "$CHECK_STATUS" -eq 0 ]; then
    pass 'tracked mode ignores metadata markers embedded in source text'
else
    fail "metadata-like source text was treated as file metadata (exit=$CHECK_STATUS): $CHECK_OUTPUT"
fi

printf '%s\n' '── tracked exclusions ──'
T6=$(mktemp -d)
register_temp_dir "$T6"
git_init_test_repo "$T6"
cat > "$T6/.gitattributes" <<'EOF'
generated.txt linguist-generated
vendored.txt linguist-vendored
immutable.txt prism-blank-lines-exempt
EOF
for file in generated.txt vendored.txt immutable.txt; do
    printf 'alpha\n\n\n\nbeta\n' > "$T6/$file"
done
printf 'binary\0payload\n\n\n\n' > "$T6/binary.dat"
printf 'seed\n' > "$T6/seed.txt"
git -C "$T6" add .
git -C "$T6" commit --quiet -m seed
seed_oid=$(git -C "$T6" rev-parse HEAD)
git -C "$T6" update-index --add --cacheinfo "160000,$seed_oid,submodule"
if can_symlink; then
    ln -s generated.txt "$T6/link.txt"
    git -C "$T6" add link.txt
fi
run_checker "$T6" --tracked
if [ "$CHECK_STATUS" -eq 0 ]; then
    pass 'tracked mode skips attributed, binary, symlink, and gitlink entries'
else
    fail "tracked exclusions were analyzed (exit=$CHECK_STATUS): $CHECK_OUTPUT"
fi

printf '%s\n' '── tracked unusual paths and aggregation ──'
T7=$(mktemp -d)
register_temp_dir "$T7"
git_init_test_repo "$T7"
printf 'alpha\n\n\n\nbeta\n' > "$T7/space name.txt"
newline_path=$'line\nbreak.txt'
printf 'alpha\n\n\n\nbeta\n' > "$T7/$newline_path"
git -C "$T7" add .
run_checker "$T7" --tracked
path_ok=1
printf '%s\n' "$CHECK_OUTPUT" | grep -Fq 'space name.txt:2: excessive blank-line run' || path_ok=0
printf '%s\n' "$CHECK_OUTPUT" | grep -Fq $'line\\nbreak.txt:2: excessive blank-line run' || path_ok=0
if [ "$CHECK_STATUS" -eq 1 ] && [ "$path_ok" -eq 1 ]; then
    pass 'tracked mode aggregates and safely escapes unusual paths'
else
    fail "unusual paths were not safely aggregated (exit=$CHECK_STATUS): $CHECK_OUTPUT"
fi

printf '%s\n' '── cached staged violation ignores working-tree repair ──'
T8=$(mktemp -d)
register_temp_dir "$T8"
git_init_test_repo "$T8"
printf 'alpha\n\n\n\nbeta\n' > "$T8/staged.txt"
git -C "$T8" add staged.txt
printf 'alpha\nbeta\n' > "$T8/staged.txt"
run_checker "$T8" --cached
if [ "$CHECK_STATUS" -eq 1 ] && printf '%s\n' "$CHECK_OUTPUT" | grep -Fq 'staged.txt:2: excessive blank-line run'; then
    pass 'cached mode rejects staged violations despite working-tree repairs'
else
    fail "cached mode did not inspect the staged blob (exit=$CHECK_STATUS): $CHECK_OUTPUT"
fi

printf '%s\n' '── cached mode ignores unstaged regressions and attributes ──'
T9=$(mktemp -d)
register_temp_dir "$T9"
git_init_test_repo "$T9"
printf 'clean\n' > "$T9/clean.txt"
printf 'alpha\n\n\n\nbeta\n' > "$T9/generated.txt"
printf '%s\n' 'generated.txt linguist-generated' > "$T9/.gitattributes"
git -C "$T9" add .
printf 'clean\n\n\n\nbroken\n' > "$T9/clean.txt"
: > "$T9/.gitattributes"
run_checker "$T9" --cached
if [ "$CHECK_STATUS" -eq 0 ]; then
    pass 'cached mode uses staged content and staged attributes exclusively'
else
    fail "unstaged state affected cached mode (exit=$CHECK_STATUS): $CHECK_OUTPUT"
fi

printf '%s\n' '── cached renamed path ──'
T10=$(mktemp -d)
register_temp_dir "$T10"
git_init_test_repo "$T10"
printf 'clean\n' > "$T10/old.txt"
git -C "$T10" add old.txt
git -C "$T10" commit --quiet -m seed
git -C "$T10" mv old.txt new.txt
printf 'alpha\n\n\n\nbeta\n' > "$T10/new.txt"
git -C "$T10" add new.txt
run_checker "$T10" --cached
if [ "$CHECK_STATUS" -eq 1 ] && printf '%s\n' "$CHECK_OUTPUT" | grep -Fq 'new.txt:2: excessive blank-line run'; then
    pass 'cached mode reports the destination of a staged rename'
else
    fail "cached rename was not reported by destination (exit=$CHECK_STATUS): $CHECK_OUTPUT"
fi

printf '%s\n' '── pre-commit cached enforcement ──'
T11=$(mktemp -d)
register_temp_dir "$T11"
git_init_test_repo "$T11"
printf 'alpha\n\n\n\nbeta\n' > "$T11/staged.md"
git -C "$T11" add staged.md
printf 'alpha\nbeta\n' > "$T11/staged.md"
set +e
HOOK_OUTPUT=$(cd "$T11" && PRISM_TOOL="$FAKE_PRISM_TOOL" bash "$PRE_COMMIT" 2>&1)
HOOK_STATUS=$?
set -e
if [ "$HOOK_STATUS" -eq 1 ] && printf '%s\n' "$HOOK_OUTPUT" | grep -Fq 'staged.md:2: excessive blank-line run; found 3, maximum 2'; then
    pass 'pre-commit rejects staged blank-line violations despite working-tree repairs'
else
    fail "pre-commit did not enforce the staged blank-line policy (exit=$HOOK_STATUS): $HOOK_OUTPUT"
fi

printf '%s\n' '── operational failures ──'
set +e
bash "$CHECKER" --unknown > /dev/null 2>&1
invalid_status=$?
(cd "${TMPDIR:-/tmp}" && bash "$CHECKER" --tracked > /dev/null 2>&1)
outside_status=$?
set -e
if [ "$invalid_status" -eq 2 ] && [ "$outside_status" -eq 2 ]; then
    pass 'invalid invocation and missing Git context return status 2'
else
    fail "operational statuses were invalid=$invalid_status outside=$outside_status"
fi

print_summary "check_blank_lines_test.sh"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
