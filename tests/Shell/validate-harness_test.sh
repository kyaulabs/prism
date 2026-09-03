#!/usr/bin/env bash
# $KYAULabs: validate-harness_test.sh kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
VALIDATOR="$REPO_ROOT/packages/prism-core/scripts/validate-harness.sh"
source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"

if ! command -v node >/dev/null 2>&1 || ! command -v pi >/dev/null 2>&1 \
	|| ! node -e "require('js-yaml')" 2>/dev/null; then
	skip "node + pi + js-yaml required (run: pnpm install)"
	exit 0
fi

printf '%s\n' '── validate-harness: real package tree ──'
if output=$(bash "$VALIDATOR" 2>&1); then
	printf '%s\n' "$output" | grep -q 'Harness validation PASSED' \
		&& pass 'real package tree passes' \
		|| fail 'success output lacks summary'
else
	fail "real package tree failed: $output"
fi

printf '%s\n' '── validate-harness: required checks are present ──'
for marker in 'Validating skills' 'Checking Distill output-style contract' 'Validating prompt templates' 'Validating extension imports' 'Validating toolchain contracts' 'Validating review runtime foundation' 'Validating shell helpers' 'Checking blank-line policy' 'Checking retired config references' 'Checking instruction-layer script references'; do
	if grep -q "$marker" "$VALIDATOR"; then
		pass "$marker check wired"
	else
		fail "$marker check missing"
	fi
done

printf '%s\n' '── validate-harness: retired opencode permission gate absent ──'
if grep -q 'bash permission patterns' "$VALIDATOR"; then
	fail 'obsolete bash-permission prefix check remains'
else
	pass 'obsolete bash-permission prefix check removed'
fi

printf '%s\n' '── validate-harness: retired config scan remains fail-closed ──'
RETIRED_FIXTURE=$(mktemp "$REPO_ROOT/packages/prism-core/docs/.retired-config-test.XXXXXX")
trap 'rm -f "$RETIRED_FIXTURE"' EXIT
printf '%s\n' 'OPENCODE_MODEL_TEST' > "$RETIRED_FIXTURE"
if output=$(bash "$VALIDATOR" 2>&1); then
	fail 'retired config reference outside the verbatim checker was accepted'
elif printf '%s\n' "$output" | grep -Fq "${RETIRED_FIXTURE#$REPO_ROOT/}:1: retired config reference"; then
	pass 'retired config reference outside the verbatim checker is rejected'
else
	fail "retired config failure did not name fixture: $output"
fi
rm -f "$RETIRED_FIXTURE"
trap - EXIT

printf '%s\n' '── validate-harness: toolchain parity fails closed ──'
TOOLCHAIN_FIXTURE=$(mktemp -d "$REPO_ROOT/packages/.toolchain-test.XXXXXX")
trap 'rm -rf "$TOOLCHAIN_FIXTURE"' EXIT
cp "$REPO_ROOT/packages/prism-core/toolchain.json" "$TOOLCHAIN_FIXTURE/toolchain.json"
cat > "$TOOLCHAIN_FIXTURE/package.json" <<'JSON'
{
  "name": "@kyaulabs/prism-core",
  "dependencies": {
    "@commitlint/config-conventional": "21.2.2",
    "commitlint": "^21",
    "git-cliff": "2.13.1"
  },
  "prism": {"toolchain": "./toolchain.json"}
}
JSON
if output=$(bash "$VALIDATOR" 2>&1); then
	fail 'toolchain package dependency drift was accepted'
elif printf '%s\n' "$output" | grep -Fq 'package dependency drift for commitlint'; then
	pass 'toolchain package dependency drift is rejected'
else
	fail "toolchain parity failure did not name dependency drift: $output"
fi
rm -rf "$TOOLCHAIN_FIXTURE"
trap - EXIT

printf '%s\n' '── validate-harness: review resources reject symlinks ──'
REVIEW_RESOURCE="$REPO_ROOT/packages/prism-core/config/licenses/CC0-1.0.txt"
REVIEW_BACKUP=$(mktemp)
cp "$REVIEW_RESOURCE" "$REVIEW_BACKUP"
cleanup_review_resource() {
    rm -f "$REVIEW_RESOURCE"
    mv "$REVIEW_BACKUP" "$REVIEW_RESOURCE"
}
trap cleanup_review_resource EXIT
rm -f "$REVIEW_RESOURCE"
ln -s "$REVIEW_BACKUP" "$REVIEW_RESOURCE"
if output=$(bash "$VALIDATOR" 2>&1); then
    fail 'symlinked review resource was accepted'
elif printf '%s\n' "$output" | grep -Fq 'review source license'; then
    pass 'symlinked review resource is rejected'
else
    fail "symlinked review resource failure lacked its diagnostic: $output"
fi
cleanup_review_resource
trap - EXIT

printf '%s\n' '── validate-harness: review runtime directories reject symlinks ──'
CORE_REVIEW_DIRECTORY="$REPO_ROOT/packages/prism-core/scripts/prism-review"
ADAPTER_PROVIDER_DIRECTORY="$REPO_ROOT/packages/prism-php-web/scripts/toolchain"
cleanup_review_directories() {
    for directory in "$CORE_REVIEW_DIRECTORY" "$ADAPTER_PROVIDER_DIRECTORY"; do
        backup="${directory}.validator-backup"
        if [ -L "$directory" ]; then rm -f "$directory"; fi
        if [ -d "$backup" ]; then mv "$backup" "$directory"; fi
    done
}
review_directory_rejected() {
    local directory="$1" diagnostic="$2" backup output status
    backup="${directory}.validator-backup"
    mv "$directory" "$backup"
    ln -s "$(basename "$backup")" "$directory"
    if output=$(bash "$VALIDATOR" 2>&1); then
        status=0
    else
        status=$?
    fi
    rm -f "$directory"
    mv "$backup" "$directory"
    [ "$status" -ne 0 ] && printf '%s\n' "$output" | grep -Fq "$diagnostic"
}
trap cleanup_review_directories EXIT
if review_directory_rejected "$CORE_REVIEW_DIRECTORY" 'Core review module directory is missing or unsafe' \
    && review_directory_rejected "$ADAPTER_PROVIDER_DIRECTORY" 'adapter quality provider directory is missing or unsafe'; then
    pass 'symlinked review runtime directories are rejected'
else
    fail 'a symlinked review runtime directory was accepted or lacked its diagnostic'
fi
cleanup_review_directories
trap - EXIT

printf '%s\n' '── validate-harness: tracked blank-line violations fail closed ──'
BLANK_LINE_FIXTURE=$(mktemp "$REPO_ROOT/packages/prism-core/docs/.blank-line-test.XXXXXX")
BLANK_LINE_RELATIVE=${BLANK_LINE_FIXTURE#"$REPO_ROOT"/}
TEST_INDEX=$(mktemp)
GIT_DIR=$(git -C "$REPO_ROOT" rev-parse --absolute-git-dir)
cp "$GIT_DIR/index" "$TEST_INDEX"
cleanup_blank_line_fixture() {
	rm -f "$BLANK_LINE_FIXTURE" "$TEST_INDEX"
}
trap cleanup_blank_line_fixture EXIT
printf 'alpha\n\n\n\nomega\n' > "$BLANK_LINE_FIXTURE"
GIT_INDEX_FILE="$TEST_INDEX" git -C "$REPO_ROOT" add -- "$BLANK_LINE_RELATIVE"
if output=$(GIT_INDEX_FILE="$TEST_INDEX" bash "$VALIDATOR" 2>&1); then
	fail 'tracked blank-line violation was accepted'
elif printf '%s\n' "$output" | grep -Fq "$BLANK_LINE_RELATIVE:2: excessive blank-line run; found 3, maximum 2"; then
	pass 'tracked blank-line violation is rejected with its diagnostic'
else
	fail "blank-line failure did not name fixture and violation: $output"
fi
cleanup_blank_line_fixture
trap - EXIT

printf '\nvalidate-harness_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

# vim: ft=sh sts=4 sw=4 ts=4 et :
