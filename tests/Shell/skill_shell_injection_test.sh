#!/usr/bin/env bash
# $KYAULabs: skill_shell_injection_test.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

set -euo pipefail

# ── Skill Shell Injection Test ────────────────────────────────────────────────
# Verify that shell commands in skill markdown files use safe quoting patterns.
# Two families:
#   1. gh api graphql uses -F variable bindings (not single-quoted $VAR)
#   2. gh pr create uses a quoted title variable and --body-file.
#
# Also demonstrates that a crafted malicious title does not execute embedded
# commands when passed through the safe patterns (active injection test).
#
# Fixes: #200
# ─────────────────────────────────────────────────────────────────────────────

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
LIB="$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

# shellcheck source=tests/Shell/lib/test_helpers.sh
source "$LIB"
setup_result_file

# ── Static scan: ticketing SKILL.md ──────────────────────────────────────────
TICKETING="$REPO_ROOT/packages/prism-core/skills/ticketing/SKILL.md"

echo "── Skill shell injection scan ──────────────"

if [ ! -f "$TICKETING" ]; then
	fail "ticketing/SKILL.md not found"
else
	# Check 1: No single-quoted $OWNER in graphql -f query
	if grep -nE "graphql[[:space:]]+-f[[:space:]]+query=['\"][{]+[[:space:]]*\\$" "$TICKETING" > /dev/null 2>&1; then
		fail "ticketing/SKILL.md: graphql query still uses inline \$VAR expansion (should use -F variables)"
	else
		pass "ticketing/SKILL.md: graphql queries use -F variable bindings"
	fi

	# Check 2: No shell variable embedded inside a single-quoted graphql query
	# The bug pattern: -f query='... $OWNER ...' with $ inside single quotes
	if grep -nE "query='[^']*\\\$[A-Z_]+[^']*'" "$TICKETING" > /dev/null 2>&1; then
		fail "ticketing/SKILL.md: graphql query has shell variable inside single-quoted string"
	else
		pass "ticketing/SKILL.md: no shell variables inside single-quoted graphql strings"
	fi

	# Check 5: No gh issue create with inline --title "<literal>" or --body "<literal>"
	# Bug:   --title "<title>" or --body "<body>"   (inline interpolation)
	# Safe:  --title "$TITLE" and --body-file FILE   (variable + file)
	if grep -nE 'issue create.*--title[[:space:]]+"[^$]' "$TICKETING" > /dev/null 2>&1; then
		fail "ticketing/SKILL.md: gh issue create uses inline --title (should use heredoc + variable)"
	else
		pass "ticketing/SKILL.md: gh issue create uses safe title pattern (variable)"
	fi

	# Check 6: gh issue create must use --body-file, not inline --body
	if grep -nE 'issue create.*--body[[:space:]]+"' "$TICKETING" > /dev/null 2>&1; then
		fail "ticketing/SKILL.md: gh issue create uses inline --body (should use --body-file)"
	else
		pass "ticketing/SKILL.md: gh issue create uses --body-file"
	fi

	# Check 7: No <UPPERCASE_PLACEHOLDER> inside single-quoted graphql queries
	# All values must be -F variables, not inline-interpolated placeholders
	if grep -nE "query='[^']*<[A-Z][A-Z_]*>[^']*'" "$TICKETING" > /dev/null 2>&1; then
		fail "ticketing/SKILL.md: graphql query has inline <PLACEHOLDER> (should use -F variables)"
	else
		pass "ticketing/SKILL.md: graphql queries use -F variables for all placeholders"
	fi
fi

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
	# Check 4b: pr command reads title into a variable and passes it quoted
	if grep -Fq 'TITLE=$(cat "$TITLE_FILE")' "$PR_COMMAND" \
		&& grep -Fq -- '--title "$TITLE"' "$PR_COMMAND"; then
		pass "pr command: title is read into TITLE and passed as quoted --title"
	else
		fail "pr command: missing quoted TITLE variable transport"
	fi

	# Check 4c: body transport via --body-file
	if grep -Fq -- '--body-file "$BODY_FILE"' "$PR_COMMAND"; then
		pass "pr command: body transport uses --body-file"
	else
		fail "pr command: missing --body-file transport"
	fi

	# Check 4d: the displayed gh command never uses obsolete --title-file.
	if grep -R -A1 -F -- 'gh pr create' "$REPO_ROOT/packages/prism-core" \
		| grep -Fq -- '--title-file'; then
		fail "prism-core: displayed gh command still uses obsolete --title-file"
	else
		pass "prism-core: displayed gh command has no obsolete --title-file"
	fi
fi

# ── Active injection test: malicious title through safe pattern ─────────────
# Demonstrate that a crafted title does not execute embedded commands
# when passed via quoted heredoc and read into a quoted variable.

TMPDIR=$(mktemp -d)
register_temp_dir "$TMPDIR"

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

# ── Active injection test: graphql -F variables ──────────────────────────────
# Demonstrate that shell variables with crafty content don't execute
# when passed via -F (simulate the variable assignment pattern).

MALVAR='$(id > /tmp/pwned_injection_test)'
SENTINEL2="/tmp/pwned_injection_test"
rm -f "$SENTINEL2"

# Assign the variable (no expansion — assignment is safe)
INJECTED="$MALVAR"

# The actual pattern: gh api graphql -F owner="$OWNER" ...
# Simulate: just verify that the variable assignment itself is safe
if [ -f "$SENTINEL2" ]; then
	fail "active injection test: graphql -F variable assignment executed \$()"
	rm -f "$SENTINEL2"
else
	pass "active injection test: graphql -F variable assignment does not execute \$()"
fi

# Verify the literal value is stored
EXPECTED='$(id > /tmp/pwned_injection_test)'
if [ "$INJECTED" = "$EXPECTED" ]; then
	pass "active injection test: malicious content stored literally in graphql variable"
else
	fail "active injection test: malicious content was modified or expanded"
fi

# ── Active injection test: issue-create title via variable ───────────────────
# Demonstrate that a malicious title written to a file via quoted heredoc,
# read into a variable via $(cat), and passed as --title "$TITLE" does NOT
# execute embedded commands. This is the safe pattern for gh issue create
# (which lacks --title-file).
SENTINEL3="/tmp/issue_pwn_test"
rm -f "$SENTINEL3"
touch "$SENTINEL3"

# Write malicious title via quoted-heredoc (no expansion inside the body)
cat > "$TMPDIR/issue-title.txt" <<'HEREDOC'
fix: bug"; rm -rf /tmp/issue_pwn_test; # injected
HEREDOC

# Read into variable — command substitution reads file content as DATA
ISSUE_TITLE=$(cat "$TMPDIR/issue-title.txt")

# Verify sentinel still exists — reading file content into a variable via
# $(cat) must NOT execute embedded commands (rm -rf in this case).
if [ -f "$SENTINEL3" ]; then
	pass "active injection test: issue-title via variable did NOT execute embedded command"
else
	fail "active injection test: issue-title variable assignment executed rm"
fi
rm -f "$SENTINEL3"

# Verify the malicious pattern is preserved literally in the variable
case "$ISSUE_TITLE" in
	*rm\ -rf*) pass "active injection test: malicious pattern preserved literally in variable" ;;
	*)         fail "active injection test: malicious pattern missing from variable" ;;
esac

# ── Summary ─────────────────────────────────────────────────────────────────
print_summary "skill shell injection"

# vim: ft=sh sts=4 sw=4 ts=4 et :
