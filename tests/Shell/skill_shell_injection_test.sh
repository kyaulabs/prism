#!/usr/bin/env bash
# $KYAULabs: skill_shell_injection_test.sh kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

set -euo pipefail

# ── Skill Shell Injection Test ────────────────────────────────────────────────
# Verify that tracker mutations use inert project-local GraphQL input files
# and that pull-request title/body transport remains injection-safe.
#
# Fixes: #200
# ─────────────────────────────────────────────────────────────────────────────

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
LIB="$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

# shellcheck source=tests/Shell/lib/test_helpers.sh
source "$LIB"
setup_result_file

has_obsolete_pr_title_flag() {
	local tree="$1" file matches scan_status
	matches=$(mktemp) || return 0
	if grep -R -l -F -- 'gh pr create' "$tree" > "$matches"; then
		scan_status=0
	else
		scan_status=$?
	fi
	if [ "$scan_status" -gt 1 ]; then
		rm -f "$matches"
		return 0
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
	[ "$obsolete" -eq 1 ]
}

tracker_transport_is_canonical() {
	local file="$1"
	awk '
		/^[[:space:]]*gh api graphql([[:space:]]|$)/ {
			seen = 1
			if ($0 !~ /^[[:space:]]*gh api graphql --input \.pi\/tmp\/[[:alnum:]_.\/-]+\.json[[:space:]]*$/) unsafe = 1
		}
		END { exit !(seen && !unsafe) }
	' "$file"
}

TMPDIR=$(mktemp -d)
register_temp_dir "$TMPDIR"

cat > "$TMPDIR/tracker-canonical.md" <<'TRACKER_CANONICAL'
gh api graphql --input .pi/tmp/tracker-mutation.json
TRACKER_CANONICAL
cat > "$TMPDIR/tracker-inline.md" <<'TRACKER_INLINE'
gh api graphql --input .pi/tmp/tracker-mutation.json
gh api graphql -f query=mutation
TRACKER_INLINE
cat > "$TMPDIR/tracker-appended.md" <<'TRACKER_APPENDED'
gh api graphql --input .pi/tmp/tracker-mutation.json -f query=mutation
TRACKER_APPENDED
if tracker_transport_is_canonical "$TMPDIR/tracker-canonical.md" \
	&& ! tracker_transport_is_canonical "$TMPDIR/tracker-inline.md" \
	&& ! tracker_transport_is_canonical "$TMPDIR/tracker-appended.md"; then
	pass "tracker transport contract rejects inline GraphQL mutation arguments"
else
	fail "tracker transport contract accepts inline GraphQL mutation arguments"
fi

# ── Static scan: tracker mutation transport ─────────────────────────────────
echo "── Skill shell injection scan ──────────────"

TRACKER_SKILLS=(
	"$REPO_ROOT/packages/prism-core/skills/tracker-operator/SKILL.md"
	"$REPO_ROOT/packages/prism-core/skills/ticketing/SKILL.md"
	"$REPO_ROOT/packages/prism-core/skills/from-issue/SKILL.md"
	"$REPO_ROOT/packages/prism-core/skills/wayfinder/SKILL.md"
)

for tracker_skill in "${TRACKER_SKILLS[@]}"; do
	if [ ! -r "$tracker_skill" ]; then
		fail "$tracker_skill is missing or unreadable"
		continue
	fi
	if tracker_transport_is_canonical "$tracker_skill"; then
		pass "$tracker_skill uses only project-local GraphQL input files"
	else
		fail "$tracker_skill contains a non-canonical GraphQL mutation"
	fi
	if grep -qE 'gh issue (create|edit|comment|close)' "$tracker_skill"; then
		fail "$tracker_skill contains a convenience mutation"
	else
		pass "$tracker_skill contains no convenience mutation"
	fi
done

# ── Static scan: finishing-a-development-branch SKILL.md + pr command ────────
FINISHING="$REPO_ROOT/packages/prism-core/skills/finishing-a-development-branch/SKILL.md"
PR_COMMAND="$REPO_ROOT/packages/prism-core/prompts/pr.md"

if [ ! -f "$FINISHING" ]; then
	fail "finishing-a-development-branch/SKILL.md not found"
else
	# Check 3: No inline --title interpolation in the finishing skill
	if grep -nE "pr create.*--title[[:space:]]+[\"']" "$FINISHING" > /dev/null 2>&1; then
		fail "finishing-a-development-branch/SKILL.md: still interpolates a literal title"
	else
		pass "finishing-a-development-branch/SKILL.md: no inline title interpolation"
	fi

	# Check 4: gh pr create is absent from the finishing skill (single /pr path)
	if grep -qF 'gh pr create' "$FINISHING"; then
		fail "finishing-a-development-branch/SKILL.md: still contains a duplicate gh pr create recipe"
	else
		pass "finishing-a-development-branch/SKILL.md: no duplicate gh pr create recipe"
	fi
fi

if [ ! -f "$PR_COMMAND" ]; then
	fail "packages/prism-core/prompts/pr.md not found"
else
	# Check 4b: pr command reads the one-line title without substitution and passes it quoted.
	if grep -Fq 'IFS= read -r TITLE <' "$PR_COMMAND" \
		&& grep -Fq -- '--title "$TITLE"' "$PR_COMMAND"; then
		pass "pr command: title is read into TITLE and passed as quoted --title"
	else
		fail "pr command: missing quoted TITLE variable transport"
	fi

	# Check 4c: body transport via a concrete --body-file path in the displayed command.
	if grep -F -A1 -- "gh pr create --repo OWNER/REPO --base TARGET_BRANCH --head WORK_BRANCH" "$PR_COMMAND" \
		| grep -Fq -- "    --title \"\$TITLE\" --body-file /concrete/private/body-file"; then
		pass "pr command: body transport uses --body-file"
	else
		fail "pr command: missing --body-file transport"
	fi

	# Check 4d: the displayed gh command never uses obsolete --title-file.
	if has_obsolete_pr_title_flag "$REPO_ROOT/packages/prism-core"; then
		fail "prism-core: displayed gh command still uses obsolete --title-file"
	else
		pass "prism-core: displayed gh command has no obsolete --title-file"
	fi
fi

# ── Active injection test: malicious title through safe pattern ─────────────
# Demonstrate that a crafted title does not execute embedded commands
# when passed via quoted heredoc and read into a quoted variable.

injection_sentinel="$TMPDIR/pr_command_injection"
backtick_sentinel="$TMPDIR/pr_command_backtick"
rm -f "$injection_sentinel" "$backtick_sentinel"

# The full adversarial payload, written via a QUOTED heredoc so nothing in it
# expands: command substitution, backticks, quotes, a leading hyphen, and a
# literal HEREDOC line that must survive transport unchanged. The sentinel
# paths are substituted afterward with sed, so the payload stays inert.
cat > "$TMPDIR/test-title.txt" <<'PAYLOAD_END'
$(touch @@SENTINEL1@@)
`touch @@SENTINEL2@@`
"'; leading-and-quotes
HEREDOC
PAYLOAD_END
sed -e "s|@@SENTINEL1@@|$injection_sentinel|g" \
	-e "s|@@SENTINEL2@@|$backtick_sentinel|g" "$TMPDIR/test-title.txt" > "$TMPDIR/test-title.txt.tmp" \
	&& mv "$TMPDIR/test-title.txt.tmp" "$TMPDIR/test-title.txt"

# Verify no sentinel file was created by the write
if [ -f "$injection_sentinel" ] || [ -f "$backtick_sentinel" ]; then
	fail "active injection test: sentinel CREATED — heredoc executed \$() or backticks"
	rm -f "$injection_sentinel" "$backtick_sentinel"
else
	pass "active injection test: quoted heredoc did NOT execute \$() or backticks"
fi

# Verify the payload bytes survive the file transport unchanged
payload_bytes=$(cat "$TMPDIR/test-title.txt")
expected_bytes=$(printf '%s\n%s\n%s\n%s' \
	"\$(touch $injection_sentinel)" \
	"\`touch $backtick_sentinel\`" \
	"\"'; leading-and-quotes" \
	'HEREDOC')
if [ "$payload_bytes" = "$expected_bytes" ]; then
	pass "active injection test: payload preserved literally in title file"
else
	fail "active injection test: payload bytes altered in title file"
fi

# Verify the payload survives read-into-variable transport unchanged
TITLE_VAR=$(cat "$TMPDIR/test-title.txt")
if [ "$TITLE_VAR" = "$expected_bytes" ]; then
	pass "active injection test: payload preserved literally in quoted variable"
else
	fail "active injection test: payload bytes altered in variable transport"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
print_summary "skill shell injection"

# vim: ft=sh sts=4 sw=4 ts=4 et :
