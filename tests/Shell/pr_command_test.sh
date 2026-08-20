#!/usr/bin/env bash
# $KYAULabs: pr_command_test.sh kyau@aura.kyaulabs 2026/08/19 -0700 Exp $

# $KYAULabs$

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

COMMAND_FILE="$REPO_ROOT/packages/prism-core/prompts/pr.md"
TEMPLATE_FILE="$REPO_ROOT/.github/PULL_REQUEST_TEMPLATE.md"
FINISHING_FILE="$REPO_ROOT/packages/prism-core/skills/finishing-a-development-branch/SKILL.md"

WORK_DIR="$(mktemp -d)"
register_temp_dir "$WORK_DIR"
TEST_BIN="$WORK_DIR/bin"
mkdir -p "$TEST_BIN"
ln -s "$REPO_ROOT/packages/prism-core/scripts/prism-tool.js" "$TEST_BIN/prism-tool"
TOOLCHAIN_PATH="$TEST_BIN:$REPO_ROOT/tests/Shell/fixtures/bin:$PATH"
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
	sed -n "/$start_marker/,/$end_marker/p" "$source_file" \
		| sed '1d;$d' \
		| sed '/^```/d' > "$output_file"
	chmod +x "$output_file"
}

assert_heading_parity() {
	local template="$1" command="$2" missing=0 heading line last_line=0 heading_count
	if [ ! -s "$template" ]; then
		return 1
	fi
	heading_count=$(grep -c '^## ' "$template")
	if [ "$heading_count" -eq 0 ]; then
		return 1
	fi
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
	local tree="$1" file matches scan_status
	matches=$(mktemp) || return 2
	if grep -R -l -F -- 'gh pr create' "$tree" > "$matches"; then
		scan_status=0
	else
		scan_status=$?
	fi
	if [ "$scan_status" -gt 1 ]; then
		rm -f "$matches"
		return 2
	fi
	local obsolete=0
	while IFS= read -r file; do
		if ! awk '
			{
				if (!in_gh && index($0, "gh pr create")) in_gh = 1
				if (in_gh && index($0, "--title-file")) exit 1
				if (in_gh && $0 !~ /\\[ \t]*$/) in_gh = 0
			}
		' "$file"; then
			obsolete=1
			break
		fi
	done < "$matches"
	rm -f "$matches"
	[ "$obsolete" -eq 0 ]
}

make_standard_fixture() {
	local fixture="$1"
	mkdir -p "$fixture/packages/prism-core/scripts"
	git_init_test_repo "$fixture"
	cp "$REPO_ROOT/packages/prism-core/scripts/validate-branch-name.sh" "$fixture/packages/prism-core/scripts/"
	chmod +x "$fixture/packages/prism-core/scripts/validate-branch-name.sh"
	(
		cd "$fixture"
		git branch -M develop
		git add packages
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
		PATH="$TOOLCHAIN_PATH" bash "$script"
	) > "$output" 2>&1
}

# new_standard_fixture <varname> — build a standard fixture in its own
# registered temp dir and set <varname> in the CALLER's shell to its path.
# Must be called directly, never via command substitution: a subshell's
# register_temp_dir() is invisible to the parent, so the EXIT-trap cleanup
# would silently skip the dir (same subshell-tracking bug as issue #322).
# The caller variable must not be named 'path' (the function's own local).
new_standard_fixture() {
	local var="$1" path
	path=$(mktemp -d)
	register_temp_dir "$path"
	make_standard_fixture "$path"
	printf -v "$var" '%s' "$path"
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

# ── 2. frontmatter: pi keys only ───────────────────────────────────────────

fm=$(awk 'NR==1 && /^---$/ { fm=1; next } fm && /^---$/ { exit } fm { print }' "$COMMAND_FILE" 2>/dev/null || true)
if echo "$fm" | grep -q '^description:' && echo "$fm" | grep -q '^argument-hint:'; then
	pass 'frontmatter declares pi description and argument hint'
else
	fail 'frontmatter missing pi description or argument hint'
fi
unsupported=0
keys=$(echo "$fm" | grep -oE '^[A-Za-z_][A-Za-z0-9_-]*:' | sed 's/:$//' || true)
while IFS= read -r key; do
	[ -z "$key" ] && continue
	if ! echo ' description argument-hint ' | grep -qF " $key "; then
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
if [ -s "$PREFLIGHT_SCRIPT" ] && [ -x "$PREFLIGHT_SCRIPT" ] && bash -n "$PREFLIGHT_SCRIPT" 2>/dev/null; then
	pass 'preflight block extracts to a non-empty executable script'
else
	fail 'preflight block did not extract to a valid script'
fi
extract_marked_block "$COMMAND_FILE" '<!-- pr-title-validation:start -->' '<!-- pr-title-validation:end -->' "$TITLE_SCRIPT"
if [ -s "$TITLE_SCRIPT" ] && [ -x "$TITLE_SCRIPT" ] && bash -n "$TITLE_SCRIPT" 2>/dev/null; then
	pass 'title-validation block extracts to a non-empty executable script'
else
	fail 'title-validation block did not extract to a valid script'
fi

# ── 5. template heading parity and order ────────────────────────────────────

if assert_heading_parity "$TEMPLATE_FILE" "$COMMAND_FILE"; then
	pass 'every template heading appears in the command in template order'
else
	fail 'template heading missing or out of order in the command'
fi

# ── 6. baseline standard fixture ────────────────────────────────────────────

baseline_fixture=
new_standard_fixture baseline_fixture
case " $TEMP_DIRS " in
	*" $baseline_fixture "*) pass 'standard fixture is tracked in TEMP_DIRS' ;;
	*) fail 'standard fixture was not tracked in TEMP_DIRS' ;;
esac
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

hotfix_fixture=
new_standard_fixture hotfix_fixture
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

release_fixture=
new_standard_fixture release_fixture
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

fixture=
new_standard_fixture fixture
(cd "$fixture" && git switch --quiet --detach HEAD)
assert_preflight_failure 'detached HEAD is rejected' "$fixture" 'detached HEAD; switch to a work branch'

fixture=
new_standard_fixture fixture
(cd "$fixture" && git switch --quiet develop)
assert_preflight_failure 'protected develop is rejected' "$fixture" 'branch is protected or does not satisfy ADR-0028'

fixture=
new_standard_fixture fixture
(cd "$fixture" && git switch --quiet -c feature/tester-abcd-invalid)
assert_preflight_failure 'invalid branch family is rejected' "$fixture" 'branch is protected or does not satisfy ADR-0028'

fixture=
new_standard_fixture fixture
(cd "$fixture" && printf 'dirty\n' >> state.txt)
assert_preflight_failure 'dirty working tree is rejected' "$fixture" 'working tree is not clean'

fixture=
new_standard_fixture fixture
(cd "$fixture" && git update-ref -d refs/remotes/origin/develop)
assert_preflight_failure 'missing remote base ref is rejected' "$fixture" 'missing synchronized remote-tracking ref origin/develop'

fixture=
new_standard_fixture fixture
(cd "$fixture" && git switch --quiet -c feat/tester-abcd-zero-ahead origin/develop)
assert_preflight_failure 'zero-ahead branch is rejected' "$fixture" 'no commits ahead of origin/develop'

fixture=
new_standard_fixture fixture
(
	cd "$fixture"
	parent1=$(git rev-parse 'origin/develop^')
	parent2=$(git rev-parse 'origin/develop^{commit}')
	tree=$(git rev-parse 'origin/develop^{tree}')
	merge_sha=$(git commit-tree "$tree" -p "$parent1" -p "$parent2" -m 'merge: only merge commit')
	git switch --quiet -c feat/tester-abcd-merge-only "$merge_sha"
)
assert_preflight_failure 'merge-only range is rejected' "$fixture" 'branch range contains no non-merge commit'

fixture=
new_standard_fixture fixture
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

export PI_MODEL="${PI_MODEL:-test-model}"

COMMITLINT_AVAILABLE=false
if [ -f "$REPO_ROOT/packages/prism-core/scripts/prism-tool.js" ]; then
	COMMITLINT_AVAILABLE=true
fi
title_dir=$(mktemp -d)
register_temp_dir "$title_dir"
title_file="$title_dir/title.txt"
validation_file="$title_dir/validation.txt"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip 'prism-tool source CLI unavailable — title-validation behavior checks skipped'
else
	printf 'feat(commands): prepare pull request\n' > "$title_file"
	rc=0
	(cd "$REPO_ROOT" && PATH="$TOOLCHAIN_PATH" \
		PRISM_OCR_CONFIG="$REPO_ROOT/tests/Shell/fixtures/ocr-config.json" \
		TITLE_FILE="$title_file" VALIDATION_FILE="$validation_file" \
		bash "$TITLE_SCRIPT") >/dev/null 2>&1 || rc=$?
	validation_title=""
	IFS= read -r validation_title < "$validation_file" 2>/dev/null || true
	if [ "$rc" -eq 0 ] \
		&& [ "$validation_title" = 'feat(commands): prepare pull request' ] \
		&& grep -Fq 'Implemented-by:' "$validation_file" \
		&& grep -Fq 'Tested-by:' "$validation_file" \
		&& grep -Fq 'Signed-off-by:' "$validation_file" \
		&& ! grep -Fq 'Authored-by:' "$validation_file"; then
		pass 'title validation accepts a conventional title with three attribution trailers'
	else
		fail 'title validation rejected a conventional title'
	fi

	printf '%s\n' 'FEAT(COMMANDS): PREPARE PULL REQUEST WITH A VERY LONG UPPERCASE SUBJECT THAT DEFINITELY EXCEEDS THE ONE HUNDRED CHARACTER MAXIMUM HEADER LENGTH FOR COMMITLINT VALIDATION' > "$title_file"
	rm -f "$validation_file"
	rc=0
	(cd "$REPO_ROOT" && PATH="$TOOLCHAIN_PATH" \
		PRISM_OCR_CONFIG="$REPO_ROOT/tests/Shell/fixtures/ocr-config.json" \
		TITLE_FILE="$title_file" VALIDATION_FILE="$validation_file" \
		bash "$TITLE_SCRIPT") >/dev/null 2>&1 || rc=$?
	if [ "$rc" -ne 0 ]; then
		pass 'title validation rejects an uppercase over-length title'
	else
		fail 'title validation accepted an uppercase over-length title'
	fi

	rm -f "$REPO_ROOT/d-canary" "$REPO_ROOT/b-canary"
	cat > "$title_file" <<'PR_TITLE_PAYLOAD'
fix(pr): inert $(touch d-canary) `touch b-canary` "q" -h
PR_TITLE_PAYLOAD
	payload_line=$(cat "$title_file")
	rm -f "$validation_file"
	rc=0
	(cd "$REPO_ROOT" && PATH="$TOOLCHAIN_PATH" \
		PRISM_OCR_CONFIG="$REPO_ROOT/tests/Shell/fixtures/ocr-config.json" \
		TITLE_FILE="$title_file" VALIDATION_FILE="$validation_file" \
		bash "$TITLE_SCRIPT") >/dev/null 2>&1 || rc=$?
	title_after=""
	validation_title=""
	IFS= read -r title_after < "$title_file" 2>/dev/null || true
	IFS= read -r validation_title < "$validation_file" 2>/dev/null || true
	if [ "$rc" -eq 0 ] \
		&& [ "$title_after" = "$payload_line" ] \
		&& [ "$validation_title" = "$payload_line" ] \
		&& [ ! -e "$REPO_ROOT/d-canary" ] \
		&& [ ! -e "$REPO_ROOT/b-canary" ]; then
		pass 'title validation preserves $(), backticks, quotes, and hyphens as inert data'
	else
		fail 'title payload was expanded, altered, or rejected during validation'
	fi
	rm -f "$REPO_ROOT/d-canary" "$REPO_ROOT/b-canary"
fi

assert_contains "$COMMAND_FILE" '--title "$TITLE"' 'displayed gh command passes the title as quoted data'
assert_contains "$COMMAND_FILE" '--body-file /concrete/private/body-file' 'displayed gh command passes the body through --body-file'
if assert_no_obsolete_title_flag "$COMMAND_FILE"; then
	pass 'displayed gh command never emits the obsolete --title-file option'
else
	fail 'displayed gh command emits the obsolete --title-file option'
fi

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

: > "$mutation_dir/empty-template.md"
if assert_heading_parity "$mutation_dir/empty-template.md" "$COMMAND_FILE"; then
	fail 'heading parity accepted an empty template'
else
	pass 'heading parity rejects an empty template'
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

if assert_no_obsolete_title_flag "$REPO_ROOT/packages/prism-core"; then
	pass 'prism-core tree contains no obsolete PR title flag'
else
	fail 'prism-core tree contains the obsolete PR title flag'
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

mkdir -p "$mutation_dir/prompts"
sed 's/--title "$TITLE"/--title-file "$TITLE_FILE"/' \
	"$COMMAND_FILE" > "$mutation_dir/prompts/pr.md"
if cmp -s "$COMMAND_FILE" "$mutation_dir/prompts/pr.md" \
	|| ! grep -Fq -- '--title-file "$TITLE_FILE"' "$mutation_dir/prompts/pr.md"; then
	fail 'obsolete flag mutation could not be applied'
elif assert_no_obsolete_title_flag "$mutation_dir/prompts"; then
	fail 'obsolete flag mutation was not detected'
else
	pass 'obsolete flag mutation is detected'
fi

cat > "$mutation_dir/prompts/fence-forms.md" <<'EOF'
~~~~ shell
gh pr create \
  ~~~~not-a-close \
  --title-file "$TITLE_FILE"
~~~~

    gh pr create \
      --title-file "$TITLE_FILE"

gh pr create --title-file "$TITLE_FILE"
EOF
if assert_no_obsolete_title_flag "$mutation_dir/prompts/fence-forms.md"; then
	fail 'alternate Markdown fence forms evaded obsolete-flag detection'
else
	pass 'alternate Markdown fence forms are inspected'
fi

# ── 13. living-document command index ────────────────────────────────────────

assert_contains "$REPO_ROOT/packages/prism-core/AGENTS.md" '| `/pr` |' \
	'core AGENTS command table indexes /pr'
assert_contains "$REPO_ROOT/README.md" '| `/pr` |' \
	'README slash-command table indexes /pr'
assert_contains "$REPO_ROOT/CODING_HARNESS.md" '`/pr`' \
	'CODING_HARNESS documents /pr branch completion'
assert_contains "$REPO_ROOT/README.md" '/pr' \
	'README GitHub CLI tooling description includes /pr'

# ── 14. no-placeholder / no-fabricated-evidence contract ─────────────────────

assert_contains "$COMMAND_FILE" 'Do not copy template comments' \
	'command forbids copying template comments'
assert_contains "$COMMAND_FILE" 'invent' \
	'command forbids fabricating evidence'
extra_markers=$(grep -oE '<[^>]+>' "$COMMAND_FILE" | sort -u | grep -v '^<!--' | grep -v '^<# total>$' || true)
if [ -z "$extra_markers" ]; then
	pass 'command contains no stray angle-bracket placeholders'
else
	fail "command contains stray angle-bracket placeholders: $extra_markers"
fi

# ── 15. accepted-finalization evidence contract ─────────────────────────────

assert_contains "$COMMAND_FILE" 'latest finalization acceptance' \
	'command requires evidence from the latest accepted finalization attempt'
assert_contains "$COMMAND_FILE" 'fresh finalization acceptance' \
	'command sends repaired or newly waived attempts back through acceptance'
assert_contains "$COMMAND_FILE" 'unresolved Suggested finding' \
	'command blocks unresolved Suggested findings'
assert_contains "$COMMAND_FILE" 'waiver' \
	'command requires explicit eligible waiver evidence'
assert_contains "$COMMAND_FILE" 'incomplete' \
	'command rejects incomplete evidence'
assert_contains "$COMMAND_FILE" 'stale' \
	'command rejects stale evidence'
assert_not_contains "$COMMAND_FILE" 'The review is never re-run solely to refresh evidence' \
	'command does not preserve review evidence across failed attempts'

# ── Summary ─────────────────────────────────────────────────────────────────

print_summary "pr command"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
