#!/usr/bin/env bash
# $KYAULabs: pr_command_test.sh kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

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
REVIEW_PREFLIGHT_SCRIPT="$WORK_DIR/review_preflight.sh"
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

extract_marked_block "$COMMAND_FILE" '<!-- pr-review-preflight:start -->' '<!-- pr-review-preflight:end -->' "$REVIEW_PREFLIGHT_SCRIPT"
if [ -s "$REVIEW_PREFLIGHT_SCRIPT" ] && [ -x "$REVIEW_PREFLIGHT_SCRIPT" ] && bash -n "$REVIEW_PREFLIGHT_SCRIPT" 2>/dev/null; then
	pass 'review-preflight block extracts to a non-empty executable script'
else
	fail 'review-preflight block did not extract to a valid script'
fi
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
assert_contains "$COMMAND_FILE" 'Use only unchecked TODO task-list items' \
	'Test Plan requires unchecked TODO task-list items'
assert_contains "$COMMAND_FILE" '- [ ] `command` — reason to run' \
	'Test Plan documents the required command and reason format'

# ── 6. version-two preflight behavior ────────────────────────────────────────

if node --test "$REPO_ROOT/tests/Node/prism-tool-pr.test.js" >/dev/null; then
    pass 'PR preflight verifies exact version-two evidence and rejects legacy recovery'
else
    fail 'version-two preflight regressions'
fi

# ── 10. title validation behavior ───────────────────────────────────────────

assert_contains "$COMMAND_FILE" 'openssl rand -hex 4 | {' \
	'command sources the PR directory suffix from openssl without shell substitution'
assert_contains "$COMMAND_FILE" 'PR_DIR="/tmp/prism-pr.${PR_SUFFIX}"' \
	'command creates the exact randomized PR directory under /tmp'
assert_contains "$COMMAND_FILE" 'mkdir -m 700 -- "$PR_DIR"' \
	'command creates the PR directory with private permissions'
assert_contains "$COMMAND_FILE" 'TITLE_FILE="$PR_DIR/title.txt"' \
	'command names the title artifact title.txt'
assert_contains "$COMMAND_FILE" 'BODY_FILE="$PR_DIR/body.md"' \
	'command names the body artifact body.md'
assert_not_contains "$COMMAND_FILE" 'title.log' \
	'command never names the title artifact title.log'
assert_not_contains "$COMMAND_FILE" 'title.md' \
	'command never names the title artifact title.md'

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

assert_contains "$COMMAND_FILE" 'prism-tool pr review-preflight' \
	'pr probes review-chain state before strict preflight'
review_probe_line=$(grep -nF 'prism-tool pr review-preflight' "$COMMAND_FILE" | head -1 | cut -d: -f1)
strict_preflight_line=$(grep -nF 'prism-tool pr preflight' "$COMMAND_FILE" | head -1 | cut -d: -f1)
if [ "$review_probe_line" -lt "$strict_preflight_line" ]; then
	pass 'review-chain probe precedes strict preflight'
else
	fail 'review-chain probe does not precede strict preflight'
fi
assert_contains "$COMMAND_FILE" 'authorize one complete initial four-axis review' \
	'pr invocation authorizes one absent-chain review'
assert_contains "$COMMAND_FILE" 'REVIEW_CHAIN=ABSENT' \
	'pr recognizes only an absent chain as recoverable'
assert_contains "$COMMAND_FILE" 'Load `code-review`' \
	'pr delegates missing-chain review to code-review'
assert_contains "$COMMAND_FILE" 'repair, migrate legacy state, or authorize a second attempt' \
	'pr forbids automatic review retries'
assert_contains "$COMMAND_FILE" 'Strict `prism-tool pr preflight`' \
	'pr reruns strict preflight after review'
assert_contains "$COMMAND_FILE" 'active finalization authorization' \
	'command requires evidence from the active authorized finalization path'
assert_contains "$COMMAND_FILE" 'valid review chain ending at the attested HEAD' \
	'command requires review-chain evidence at exact HEAD'
assert_contains "$COMMAND_FILE" 'no unresolved diff-causal Blocking finding' \
	'command blocks unresolved concrete findings'
assert_contains "$COMMAND_FILE" 'Advisory findings require no waiver' \
	'command allows Advisory findings without waivers'
assert_contains "$COMMAND_FILE" 'ordinary repair may preserve a valid chain' \
	'command preserves continuous review evidence after repairs'
assert_contains "$COMMAND_FILE" 'review of only the continuous repair delta' \
	'command scopes repair review to the delta'
assert_contains "$COMMAND_FILE" 'V2_RECOVERY=READY' \
	'absent state with exact receipts selects version-two recovery'
assert_contains "$COMMAND_FILE" 'prism-review review authoritative --base-ref origin/develop --json' \
	'version-two recovery consumes one installed authoritative attempt'
assert_contains "$COMMAND_FILE" 'or stale state stops preparation' \
	'partial or invalid version-two evidence stops without fallback'
assert_contains "$COMMAND_FILE" 'REVIEW_CHAIN_VERSION=2' \
	'valid version-two chains select engine Advisory inspection'
assert_contains "$COMMAND_FILE" 'prism-review chain inspect --json' \
	'command inspects version-two Advisory evidence for disclosure'
assert_not_contains "$COMMAND_FILE" 'prism-review criteria' \
	'pr recovery never selects criteria'
assert_not_contains "$COMMAND_FILE" 'prism-review check' \
	'pr recovery never runs deterministic checks'
assert_contains "$COMMAND_FILE" 'changed SHA or dirty tree invalidates' \
	'command consumes drifted or dirty attempts'
assert_not_contains "$COMMAND_FILE" '--force-review' \
	'command has no blanket review bypass'


# ── Summary ─────────────────────────────────────────────────────────────────

print_summary "pr command"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
