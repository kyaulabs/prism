#!/usr/bin/env bash
# $KYAULabs: pr_command_test.sh kyau@cosmos.kyaulabs 2026/08/01 -0700 Exp $


# $KYAULabs$

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

COMMAND_FILE="$REPO_ROOT/.opencode/commands/pr.md"
TEMPLATE_FILE="$REPO_ROOT/.github/PULL_REQUEST_TEMPLATE.md"
FINISHING_FILE="$REPO_ROOT/.opencode/skills/finishing-a-development-branch/SKILL.md"

WORK_DIR="$(mktemp -d)"
register_temp_dir "$WORK_DIR"
PREFLIGHT_SCRIPT="$WORK_DIR/preflight.sh"
TITLE_SCRIPT="$WORK_DIR/title_validation.sh"

assert_contains() {
	local file="$1" needle="$2" label="$3"
	if grep -Fq -- "$needle" "$file"; then
		pass "$label"
	else
		fail "$label — missing: $needle"
	fi
}

assert_not_contains() {
	local file="$1" needle="$2" label="$3"
	if grep -Fq -- "$needle" "$file"; then
		fail "$label — forbidden: $needle"
	else
		pass "$label"
	fi
}

extract_marked_block() {
	local source_file="$1" start_marker="$2" end_marker="$3" output_file="$4"
	sed -n "/$start_marker/,/$end_marker/p" "$source_file" 2>/dev/null \
		| sed '1d;$d' \
		| sed '/^```/d' > "$output_file" || true
	chmod +x "$output_file"
}

assert_heading_parity() {
	local template="$1" command="$2" missing=0 heading line last_line=0
	while IFS= read -r heading; do
		[ -n "$heading" ] || continue
		line=$(grep -nF -- "$heading" "$command" | head -1 | cut -d: -f1 || true)
		if [ -z "$line" ] || [ "$line" -le "$last_line" ]; then
			missing=$((missing + 1))
		else
			last_line="$line"
		fi
	done < <(grep '^## ' "$template")
	[ "$missing" -eq 0 ]
}

assert_delegates_to_pr() {
	local skill_file="$1"
	grep -Fq '/pr' "$skill_file" && ! grep -Fq 'gh pr create' "$skill_file"
}

assert_no_obsolete_title_flag() {
	local tree="$1"
	! grep -R -Fq -- '--title-file' "$tree"
}

make_standard_fixture() {
	local fixture="$1"
	mkdir -p "$fixture/.github/scripts"
	git_init_test_repo "$fixture"
	cp "$REPO_ROOT/.github/scripts/validate-branch-name.sh" "$fixture/.github/scripts/"
	chmod +x "$fixture/.github/scripts/validate-branch-name.sh"
	(
		cd "$fixture"
		git branch -M develop
		git add .github
		git commit --quiet -m 'chore: add branch validator'
		printf 'base-1\n' > state.txt
		git add state.txt
		git commit --quiet -m 'chore: first base'
		printf 'base-2\n' >> state.txt
		git add state.txt
		git commit --quiet -m 'chore: second base'
		git update-ref refs/remotes/origin/develop HEAD
		git branch main HEAD
		git update-ref refs/remotes/origin/main HEAD
		git switch --quiet -c feat/tester-abcd-pr-command
		printf 'feature\n' > feature.txt
		git add feature.txt
		git commit --quiet -m 'feat(commands): prepare pull request'
	)
}

run_preflight() {
	local fixture="$1" script="$2" output="$3"
	(
		cd "$fixture"
		bash "$script"
	) > "$output" 2>&1
}

# new_standard_fixture — build a standard fixture in its own registered temp dir.
new_standard_fixture() {
	local fixture
	fixture=$(mktemp -d)
	register_temp_dir "$fixture"
	make_standard_fixture "$fixture"
	echo "$fixture"
}

# preflight_value <key> <output> — extract a tab-delimited preflight field.
preflight_value() {
	local key="$1" output="$2"
	awk -F'\t' -v key="$key" '$1 == key { print $2 }' "$output"
}

assert_preflight_field() {
	local label="$1" output="$2" key="$3" expected="$4" actual
	actual=$(preflight_value "$key" "$output")
	if [ "$actual" = "$expected" ]; then
		pass "$label"
	else
		fail "$label — expected '$expected', got '$actual'"
	fi
}

assert_preflight_failure() {
	local label="$1" fixture="$2" diagnostic="$3" output rc
	output=$(mktemp)
	rc=0
	run_preflight "$fixture" "$PREFLIGHT_SCRIPT" "$output" || rc=$?
	if [ "$rc" -ne 0 ] && grep -Fq -- "$diagnostic" "$output"; then
		pass "$label"
	else
		fail "$label — exit=$rc, missing diagnostic '$diagnostic'"
	fi
	rm -f "$output"
}

# ── 1. command file exists ─────────────────────────────────────────────────

if [ -f "$COMMAND_FILE" ]; then
	pass 'pr command file exists'
else
	fail 'pr command file missing'
fi

# ── 2. frontmatter: agent: build and no unsupported key ─────────────────────

fm=$(awk 'NR==1 && /^---$/ { fm=1; next } fm && /^---$/ { exit } fm { print }' "$COMMAND_FILE" 2>/dev/null || true)
if echo "$fm" | grep -Fq 'agent: build'; then
	pass 'frontmatter declares agent: build'
else
	fail 'frontmatter missing agent: build'
fi
unsupported=0
keys=$(echo "$fm" | grep -oE '^[A-Za-z_][A-Za-z0-9_-]*:' | sed 's/:$//' || true)
while IFS= read -r key; do
	[ -z "$key" ] && continue
	if ! echo ' description agent model subtask ' | grep -qF " $key "; then
		unsupported=1
	fi
done <<< "$keys"
if [ "$unsupported" -eq 0 ]; then
	pass 'frontmatter contains no unsupported command key'
else
	fail 'frontmatter contains an unsupported command key'
fi

# ── 3. untrusted-data and preparation-only rules ────────────────────────────

assert_contains "$COMMAND_FILE" 'untrusted data' 'command declares repository text untrusted'
assert_contains "$COMMAND_FILE" 'Never push' 'command is preparation-only'

# ── 4. marked blocks extract to non-empty executable scripts ────────────────

extract_marked_block "$COMMAND_FILE" '<!-- pr-preflight:start -->' '<!-- pr-preflight:end -->' "$PREFLIGHT_SCRIPT"
if [ -s "$PREFLIGHT_SCRIPT" ] && [ -x "$PREFLIGHT_SCRIPT" ]; then
	pass 'preflight block extracts to a non-empty executable script'
else
	fail 'preflight block did not extract to a non-empty executable script'
fi
extract_marked_block "$COMMAND_FILE" '<!-- pr-title-validation:start -->' '<!-- pr-title-validation:end -->' "$TITLE_SCRIPT"
if [ -s "$TITLE_SCRIPT" ] && [ -x "$TITLE_SCRIPT" ]; then
	pass 'title-validation block extracts to a non-empty executable script'
else
	fail 'title-validation block did not extract to a non-empty executable script'
fi

# ── 5. template heading parity and order ────────────────────────────────────

if assert_heading_parity "$TEMPLATE_FILE" "$COMMAND_FILE"; then
	pass 'every template heading appears in the command in template order'
else
	fail 'template heading missing or out of order in the command'
fi

# ── 6. baseline standard fixture ────────────────────────────────────────────

baseline_fixture=$(new_standard_fixture)
baseline_output=$(mktemp)
rc=0
run_preflight "$baseline_fixture" "$PREFLIGHT_SCRIPT" "$baseline_output" || rc=$?
if [ "$rc" -eq 0 ]; then
	pass 'standard fixture passes preflight'
else
	fail "standard fixture preflight exited $rc"
fi
expected_base=$(cd "$baseline_fixture" && git rev-parse 'origin/develop^{commit}')
expected_head=$(cd "$baseline_fixture" && git rev-parse HEAD)
assert_preflight_field 'preflight reports BRANCH' "$baseline_output" BRANCH 'feat/tester-abcd-pr-command'
assert_preflight_field 'preflight reports TARGET_BRANCH develop' "$baseline_output" TARGET_BRANCH develop
assert_preflight_field 'preflight reports BASE_REF origin/develop' "$baseline_output" BASE_REF origin/develop
assert_preflight_field 'preflight reports exact BASE_SHA' "$baseline_output" BASE_SHA "$expected_base"
assert_preflight_field 'preflight reports exact HEAD_SHA' "$baseline_output" HEAD_SHA "$expected_head"
assert_preflight_field 'preflight reports exact MERGE_BASE' "$baseline_output" MERGE_BASE "$expected_base"
assert_preflight_field 'preflight reports non-zero COMMIT_COUNT' "$baseline_output" COMMIT_COUNT 1
assert_preflight_field 'preflight reports non-zero NON_MERGE_COUNT' "$baseline_output" NON_MERGE_COUNT 1
rm -f "$baseline_output"

# ── 7. hotfix branch targets main ───────────────────────────────────────────

hotfix_fixture=$(new_standard_fixture)
(
	cd "$hotfix_fixture"
	git switch --quiet -c hotfix/tester-abcd-urgent
)
hotfix_output=$(mktemp)
rc=0
run_preflight "$hotfix_fixture" "$PREFLIGHT_SCRIPT" "$hotfix_output" || rc=$?
hotfix_target=$(preflight_value TARGET_BRANCH "$hotfix_output")
hotfix_base=$(preflight_value BASE_REF "$hotfix_output")
if [ "$rc" -eq 0 ] && [ "$hotfix_target" = main ] && [ "$hotfix_base" = origin/main ]; then
	pass 'hotfix branch targets main'
else
	fail 'hotfix branch does not target main'
fi
rm -f "$hotfix_output"

# ── 8. release branch targets main despite develop origin ───────────────────

release_fixture=$(new_standard_fixture)
(
	cd "$release_fixture"
	git switch --quiet -c release/1.2.3-rc.1
)
release_output=$(mktemp)
rc=0
run_preflight "$release_fixture" "$PREFLIGHT_SCRIPT" "$release_output" || rc=$?
release_target=$(preflight_value TARGET_BRANCH "$release_output")
release_base=$(preflight_value BASE_REF "$release_output")
if [ "$rc" -eq 0 ] && [ "$release_target" = main ] && [ "$release_base" = origin/main ]; then
	pass 'release branch targets main despite develop origin'
else
	fail 'release branch does not target main'
fi
rm -f "$release_output"

# ── 9. preflight failures with specific diagnostics ─────────────────────────

fixture=$(new_standard_fixture)
(cd "$fixture" && git switch --quiet --detach HEAD)
assert_preflight_failure 'detached HEAD is rejected' "$fixture" 'detached HEAD; switch to a work branch'

fixture=$(new_standard_fixture)
(cd "$fixture" && git switch --quiet develop)
assert_preflight_failure 'protected develop is rejected' "$fixture" 'branch is protected or does not satisfy ADR-0028'

fixture=$(new_standard_fixture)
(cd "$fixture" && git switch --quiet -c feature/tester-abcd-invalid)
assert_preflight_failure 'invalid branch family is rejected' "$fixture" 'branch is protected or does not satisfy ADR-0028'

fixture=$(new_standard_fixture)
(cd "$fixture" && printf 'dirty\n' >> state.txt)
assert_preflight_failure 'dirty working tree is rejected' "$fixture" 'working tree is not clean'

fixture=$(new_standard_fixture)
(cd "$fixture" && git update-ref -d refs/remotes/origin/develop)
assert_preflight_failure 'missing remote base ref is rejected' "$fixture" 'missing synchronized remote-tracking ref origin/develop'

fixture=$(new_standard_fixture)
(cd "$fixture" && git switch --quiet -c feat/tester-abcd-zero-ahead origin/develop)
assert_preflight_failure 'zero-ahead branch is rejected' "$fixture" 'no commits ahead of origin/develop'

fixture=$(new_standard_fixture)
(
	cd "$fixture"
	parent1=$(git rev-parse 'origin/develop^')
	parent2=$(git rev-parse 'origin/develop^{commit}')
	tree=$(git rev-parse 'origin/develop^{tree}')
	merge_sha=$(git commit-tree "$tree" -p "$parent1" -p "$parent2" -m 'merge: only merge commit')
	git switch --quiet -c feat/tester-abcd-merge-only "$merge_sha"
)
assert_preflight_failure 'merge-only range is rejected' "$fixture" 'branch range contains no non-merge commit'

fixture=$(new_standard_fixture)
(
	cd "$fixture"
	git switch --quiet -c feat/tester-abcd-net-empty origin/develop
	printf 'net\n' > net.txt
	git add net.txt
	git commit --quiet -m 'feat: add transient file'
	git rm --quiet net.txt
	git commit --quiet -m 'feat: remove transient file'
)
assert_preflight_failure 'net-empty range is rejected' "$fixture" 'branch has no net diff against its merge-base'

# ── 10. title validation behavior ───────────────────────────────────────────

export OPENCODE_MODEL_PLANNER="${OPENCODE_MODEL_PLANNER:-test-planner}"
export OPENCODE_MODEL_PRIMARY="${OPENCODE_MODEL_PRIMARY:-test-primary}"
export OPENCODE_MODEL_JUDGE="${OPENCODE_MODEL_JUDGE:-test-judge}"

title_dir=$(mktemp -d)
register_temp_dir "$title_dir"
title_file="$title_dir/title.txt"
validation_file="$title_dir/validation.txt"

printf 'feat(commands): prepare pull request\n' > "$title_file"
rc=0
(cd "$REPO_ROOT" && TITLE_FILE="$title_file" VALIDATION_FILE="$validation_file" bash "$TITLE_SCRIPT") >/dev/null 2>&1 || rc=$?
validation_title=""
IFS= read -r validation_title < "$validation_file" 2>/dev/null || true
if [ "$rc" -eq 0 ] \
	&& [ "$validation_title" = 'feat(commands): prepare pull request' ] \
	&& grep -Fq 'Signed-off-by:' "$validation_file"; then
	pass 'title validation accepts a conventional title with attribution trailers'
else
	fail 'title validation rejected a conventional title'
fi

printf '%s\n' 'FEAT(COMMANDS): PREPARE PULL REQUEST WITH A VERY LONG UPPERCASE SUBJECT THAT DEFINITELY EXCEEDS THE ONE HUNDRED CHARACTER MAXIMUM HEADER LENGTH FOR COMMITLINT VALIDATION' > "$title_file"
rc=0
(cd "$REPO_ROOT" && TITLE_FILE="$title_file" VALIDATION_FILE="$validation_file" bash "$TITLE_SCRIPT") >/dev/null 2>&1 || rc=$?
if [ "$rc" -ne 0 ]; then
	pass 'title validation rejects an uppercase over-length title'
else
	fail 'title validation accepted an uppercase over-length title'
fi

rm -f /tmp/pr_command_injection /tmp/pr_command_backtick
cat > "$title_file" <<'PR_TITLE_PAYLOAD'
-$(touch /tmp/pr_command_injection) `touch /tmp/pr_command_backtick` "'; leading-and-quotes
PR_TITLE_PAYLOAD
payload_line=$(cat "$title_file")
rc=0
(cd "$REPO_ROOT" && TITLE_FILE="$title_file" VALIDATION_FILE="$validation_file" bash "$TITLE_SCRIPT") >/dev/null 2>&1 || rc=$?
preserved=1
if [ "$rc" -eq 0 ]; then preserved=0; fi
if [ -e /tmp/pr_command_injection ]; then preserved=0; fi
if [ -e /tmp/pr_command_backtick ]; then preserved=0; fi
title_after=""
IFS= read -r title_after < "$title_file" 2>/dev/null || true
if [ "$title_after" != "$payload_line" ]; then preserved=0; fi
validation_first=""
IFS= read -r validation_first < "$validation_file" 2>/dev/null || true
if [ "$validation_first" != "$payload_line" ]; then preserved=0; fi
if [ "$preserved" -eq 1 ]; then
	pass 'title validation preserves $(), backticks, quotes, and leading hyphen as inert data'
else
	fail 'title payload was expanded or altered during validation'
fi

assert_contains "$COMMAND_FILE" '--title "$TITLE"' 'displayed gh command passes the title as quoted data'
assert_contains "$COMMAND_FILE" '--body-file "$BODY_FILE"' 'displayed gh command passes the body through --body-file'
assert_not_contains "$COMMAND_FILE" '--title-file' 'command never emits the obsolete --title-file option'

# ── 11. heading parity mutation proof ────────────────────────────────────────

mutation_dir=$(mktemp -d)
register_temp_dir "$mutation_dir"
cp "$TEMPLATE_FILE" "$mutation_dir/mutated-template.md"
printf '\n## 🔒 Security Review\n' >> "$mutation_dir/mutated-template.md"
if assert_heading_parity "$mutation_dir/mutated-template.md" "$COMMAND_FILE"; then
	fail 'heading parity accepted a template with an added section'
else
	pass 'heading parity rejects a template with an added section'
fi

# ── 12. finishing workflow delegation and lifecycle ──────────────────────────

assert_contains "$FINISHING_FILE" '/pr' \
	'finishing workflow delegates PR preparation to /pr'
assert_contains "$FINISHING_FILE" 'HEAD_SHA' \
	'finishing workflow records exact HEAD SHA'
assert_contains "$FINISHING_FILE" 'BASE_SHA' \
	'finishing workflow records exact base SHA'
assert_contains "$FINISHING_FILE" 'all four' \
	'finishing workflow requires all four review axes'

if assert_delegates_to_pr "$FINISHING_FILE"; then
	pass 'finishing delegation has no duplicate gh recipe'
else
	fail 'finishing delegation still duplicates PR creation'
fi

if assert_no_obsolete_title_flag "$REPO_ROOT/.opencode"; then
	pass 'opencode tree contains no obsolete PR title flag'
else
	fail 'opencode tree contains the obsolete PR title flag'
fi

mutation_dir=$(mktemp -d)
register_temp_dir "$mutation_dir"
cp "$FINISHING_FILE" "$mutation_dir/finishing.md"
sed 's|/pr|/removed-pr|g' "$mutation_dir/finishing.md" > "$mutation_dir/no-delegation.md"
if assert_delegates_to_pr "$mutation_dir/no-delegation.md"; then
	fail 'delegation mutation was not detected'
else
	pass 'delegation mutation is detected'
fi

mkdir -p "$mutation_dir/opencode"
cp "$COMMAND_FILE" "$mutation_dir/opencode/pr.md"
printf '\n%s\n' 'obsolete-title-file-token' >> "$mutation_dir/opencode/pr.md"
sed -i.bak 's/obsolete-title-file-token/--title-file/' "$mutation_dir/opencode/pr.md"
rm -f "$mutation_dir/opencode/pr.md.bak"
if assert_no_obsolete_title_flag "$mutation_dir/opencode"; then
	fail 'obsolete flag mutation was not detected'
else
	pass 'obsolete flag mutation is detected'
fi

# ── Summary ─────────────────────────────────────────────────────────────────

print_summary "pr command"
exit $?



# vim: ft=sh sts=4 sw=4 ts=4 et :
