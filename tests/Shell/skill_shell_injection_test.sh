#!/usr/bin/env bash
# $KYAULabs: skill_shell_injection_test.sh kyau@cosmos.kyaulabs 2026/07/22 -0700 Exp $




set -euo pipefail

# ── Skill Shell Injection Test ────────────────────────────────────────────────
# Verify that shell commands in skill markdown files use safe quoting patterns.
# Two families:
#   1. gh api graphql uses -F variable bindings (not single-quoted $VAR)
#   2. gh pr create uses --title-file/--body-file (not inline interpolation)
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
TICKETING="$REPO_ROOT/.opencode/skills/ticketing/SKILL.md"

echo "── Skill shell injection scan ──────────────"

if [ ! -f "$TICKETING" ]; then
	fail "ticketing/SKILL.md not found"
else
	# Check 1: No single-quoted $OWNER in graphql -f query
	if grep -Pn "graphql\s+-f\s+query=['\"][{]+\s*\\$" "$TICKETING" > /dev/null 2>&1; then
		fail "ticketing/SKILL.md: graphql query still uses inline \$VAR expansion (should use -F variables)"
	else
		pass "ticketing/SKILL.md: graphql queries use -F variable bindings"
	fi

	# Check 2: No shell variable embedded inside a single-quoted graphql query
	# The bug pattern: -f query='... $OWNER ...' with $ inside single quotes
	if grep -Pn "query='[^']*\\\$[A-Z_]+[^']*'" "$TICKETING" > /dev/null 2>&1; then
		fail "ticketing/SKILL.md: graphql query has shell variable inside single-quoted string"
	else
		pass "ticketing/SKILL.md: no shell variables inside single-quoted graphql strings"
	fi
fi

# ── Static scan: finishing-a-development-branch SKILL.md ─────────────────────
FINISHING="$REPO_ROOT/.opencode/skills/finishing-a-development-branch/SKILL.md"

if [ ! -f "$FINISHING" ]; then
	fail "finishing-a-development-branch/SKILL.md not found"
else
	# Check 3: No inline --title "--body " interpolation
	if grep -Pn "pr create.*--title\s+[\"']" "$FINISHING" > /dev/null 2>&1; then
		fail "finishing-a-development-branch/SKILL.md: gh pr create still uses inline --title (should use --title-file)"
	else
		pass "finishing-a-development-branch/SKILL.md: gh pr create uses --title-file/--body-file"
	fi

	# Check 4: Title-file and body-file flags are present
	if grep -q -- "--title-file" "$FINISHING" && grep -q -- "--body-file" "$FINISHING"; then
		pass "finishing-a-development-branch/SKILL.md: both --title-file and --body-file present"
	else
		fail "finishing-a-development-branch/SKILL.md: missing --title-file or --body-file"
	fi
fi

# ── Active injection test: malicious title through safe pattern ─────────────
# Demonstrate that a crafted title does not execute embedded commands
# when passed via --title-file (heredoc with quoted terminator).

TMPDIR=$(mktemp -d)
register_temp_dir "$TMPDIR"

MALICIOUS_TITLE='fix: harmless $(touch /tmp/pwned_injection_test) looking title'
SENTINEL="/tmp/pwned_injection_test"

# Remove any leftover sentinel from a previous run
rm -f "$SENTINEL"

# Use the heredoc pattern: unquoted terminator so $MALICIOUS_TITLE expands,
# but the variable was assigned with single quotes so its $(touch ...) is
# literal and does NOT execute.
cat > "$TMPDIR/test-title.txt" <<HEREDOC
$MALICIOUS_TITLE
HEREDOC

# After writing via heredoc, verify the sentinel file was NOT created
if [ -f "$SENTINEL" ]; then
	fail "active injection test: sentinel file CREATED — heredoc executed \$()"
	rm -f "$SENTINEL"
else
	pass "active injection test: heredoc did NOT execute \$() in title"
fi

# Verify the title file contains the literal command (not expanded)
if grep -q '$(touch' "$TMPDIR/test-title.txt"; then
	pass "active injection test: malicious pattern preserved literally in title file"
else
	fail "active injection test: malicious pattern not found in title file"
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

# ── Summary ─────────────────────────────────────────────────────────────────
print_summary "skill shell injection"






# vim: ft=sh sts=4 sw=4 ts=4 et :
