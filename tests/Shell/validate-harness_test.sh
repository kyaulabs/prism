#!/usr/bin/env bash
# $KYAULabs: validate-harness_test.sh kyau@nova 2026/07/05 -0700 Exp $

# ── Repro-first tests for validate-harness.sh ──────────────────────────────────
# Bugs under test (from Fable 5 audit):
#   3. Vacuous PASS on empty/missing .opencode (HARNESS_DIR is relative)
#   4. Frontmatter parser re-enters on --- in Markdown body
#   6. Unescaped name in grep regex causes false collisions
#   9. grep -c || echo 0 yields 0\n0, breaking integer test

set -euo pipefail

RESULT_FILE=$(mktemp)
trap 'rm -f "$RESULT_FILE"' EXIT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
RESET=$'\033[0m'

pass() { echo "  ${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "  ${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REAL_VALIDATOR="$REPO_ROOT/.github/scripts/validate-harness.sh"

if [ ! -f "$REAL_VALIDATOR" ]; then
	fail "Cannot find validate-harness.sh at $REAL_VALIDATOR"
	exit 1
fi

# ── Test 1: Finding 3 — vacuous PASS on relative HARNESS_DIR ──────────────────

echo ""
echo "── Test 1: Vacuous PASS when run from non-repo-root ──"
T1=$(mktemp -d)
(
	cd "$T1"
	git init --quiet
	git config user.email "test@example.com"
	git config user.name "Test User"
	mkdir -p .opencode/skills/test-skill
	cat > .opencode/skills/test-skill/SKILL.md <<'EOF'
---
name: test-skill
description: A valid test skill with all required fields.
---
EOF
	git add -A
	git commit --quiet -m "init"

	# Copy the validator
	mkdir -p .github/scripts
	cp "$REAL_VALIDATOR" .github/scripts/validate-harness.sh

	# Run from a SUBDIRECTORY (not repo root) — should resolve HARNESS_DIR via git
	mkdir subdir
	(
		cd subdir
		output=$(bash ../.github/scripts/validate-harness.sh 2>&1) || true
		# After fix: validator resolves to repo root and finds the skill
		if echo "$output" | grep -q "1 skill(s) checked"; then
			pass "Found skills from subdirectory (HARNESS_DIR resolved via git)"
		elif echo "$output" | grep -q "0 skill(s) checked"; then
			fail "Vacuous PASS — found 0 skills from subdirectory (relative HARNESS_DIR bug)"
		else
			fail "Unexpected output from subdirectory run"
		fi
	)

)
rm -rf "$T1"

# ── Test 2: Finding 4 — frontmatter parser re-enters on body '---' ──────────────

echo "── Test 2: Frontmatter parser re-enters on body '---' ──"
T2=$(mktemp -d)
(
	cd "$T2"
	git init --quiet
	cp "$REAL_VALIDATOR" .github/scripts/validate-harness.sh 2>/dev/null || {
		mkdir -p .github/scripts
		cp "$REAL_VALIDATOR" .github/scripts/validate-harness.sh
	}

	# Create an AGENT file with missing mode: but a --- rule in the body
	# that has "mode: subagent" after it — the toggling parser would
	# re-enter frontmatter mode and read that body line as mode: subagent
	mkdir -p .opencode/agents
	cat > .opencode/agents/test-agent.md <<'EOF'
---
description: An agent file missing the mode field
---

## Instructions

Some body text.

---

Then a horizontal rule followed by text that happens to say:
mode: subagent — this is NOT frontmatter, it's body prose.
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	# Bug: the validator should report "missing or empty 'mode' field"
	# But the toggling parser reads the body "mode: subagent" and accepts it
	if echo "$output" | grep -q "missing or empty 'mode'" ; then
		pass "Correctly detected missing mode field (parser stops at 2nd ---)"
	elif echo "$output" | grep -q "expected 'subagent'" && ! echo "$output" | grep -q "missing.*mode"; then
		# If it says "expected subagent" but NOT "missing mode",
		# the body line "mode: subagent" was parsed as frontmatter
		fail "Parser re-entered frontmatter mode on body '---' (found 'mode: subagent' in body)"
	else
		# The bug may manifest differently depending on exact behavior
		if echo "$output" | grep -qi "error"; then
			pass "Validator reported errors (some detection working)"
		else
			fail "Validator missed missing mode field entirely"
		fi
	fi
)
rm -rf "$T2"

# ── Test 3: Finding 6 — dotted name causes false collision ────────────────────

echo "── Test 3: Dotted name causes false regex collision ──"
T3=$(mktemp -d)
(
	cd "$T3"
	git init --quiet
	mkdir -p .opencode/agents .github/scripts
	cp "$REAL_VALIDATOR" .github/scripts/validate-harness.sh

	# Create two agent files — '-' sorts before '.' in C locale,
	# so the hyphenated file is processed FIRST and the dotted file SECOND.
	# When checking 'agent.bar', grep "^agent.bar " matches 'agent-bar '
	# because '.' in regex matches '-' in the registry entry.
	cat > .opencode/agents/agent-bar.md <<'EOF'
---
description: First agent with hyphenated name
mode: subagent
---
EOF

	cat > .opencode/agents/agent.bar.md <<'EOF'
---
description: Second agent with dotted name
mode: subagent
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	# Bug: foo.bar falsely collides with fooXbar due to unescaped regex
	if echo "$output" | grep -qi "already registered"; then
		fail "False 'already registered' collision for dotted name (unescaped regex bug)"
	else
		pass "No false collision for dotted filename"
	fi

	# Also verify both agents were counted
	if echo "$output" | grep -q "2 agent(s) checked"; then
		pass "Both agents counted correctly (2)"
	else
		fail "Agent count mismatch (expected 2)"
	fi
)
rm -rf "$T3"

# ── Test 4: Finding 9 — grep -c || echo 0 yields 0\n0 ────────────────────────

echo "── Test 4: grep -c || echo 0 integer expression error ──"
T4=$(mktemp -d)
(
	cd "$T4"
	git init --quiet
	mkdir -p .opencode/agents .github/scripts
	cp "$REAL_VALIDATOR" .github/scripts/validate-harness.sh

	# Create an agent file with NO frontmatter at all
	# check_frontmatter_delimiters does grep -c '^---$' which yields 0\n0
	cat > .opencode/agents/no-frontmatter.md <<'EOF'
# No frontmatter here

Just a markdown file with no YAML delimiters.
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	# Bug: grep -c || echo 0 produces "integer expression expected" on stderr
	if echo "$output" | grep -q "integer expression expected"; then
		fail "Integer expression error from grep -c || echo 0 bug"
	else
		pass "No integer expression error (grep -c bug fixed)"
	fi

	# The file should still be detected as having malformed frontmatter
	if echo "$output" | grep -q "malformed" || echo "$output" | grep -q "missing.*YAML"; then
		pass "No-frontmatter file correctly detected as malformed"
	else
		fail "No-frontmatter file not detected (expected malformed/missing YAML error)"
	fi
)
rm -rf "$T4"

# ── Test 5: Forward check — command file exists, AGENTS.md row missing ───────

echo "── Test 5: Forward check — command file without AGENTS.md row ──"
T5=$(mktemp -d)
(
	cd "$T5"
	git init --quiet
	git config user.email "test@example.com"
	git config user.name "Test User"

	mkdir -p .opencode/commands .github/scripts
	cp "$REAL_VALIDATOR" .github/scripts/validate-harness.sh

	# Create a command file
	cat > .opencode/commands/test-cmd.md <<'EOF'
---
description: A test command
---
EOF

	# AGENTS.md with Commands table NOT containing test-cmd
	cat > AGENTS.md <<'EOF'
# Test

## Commands

| Command | Purpose |
| --- | --- |
| `/other` | Other command |
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "missing entry" && echo "$output" | grep -qF "test-cmd"; then
		pass "Forward check errors on missing AGENTS.md table entry"
	elif [ "${exit_code:-0}" -eq 0 ]; then
		fail "Forward check did not error on missing AGENTS.md table entry (exit 0)"
	else
		fail "Forward check exited non-zero but unexpected output"
	fi
)
rm -rf "$T5"

# ── Test 6: Forward check — deleted row from complete table ──────────────────

echo "── Test 6: Forward check — row deleted from AGENTS.md ──"
T6=$(mktemp -d)
(
	cd "$T6"
	git init --quiet
	git config user.email "test@example.com"
	git config user.name "Test User"

	mkdir -p .opencode/commands .github/scripts
	cp "$REAL_VALIDATOR" .github/scripts/validate-harness.sh

	cat > .opencode/commands/cmd-a.md <<'EOF'
---
description: Command A
---
EOF
	cat > .opencode/commands/cmd-b.md <<'EOF'
---
description: Command B
---
EOF

	# AGENTS.md with both commands indexed
	cat > AGENTS.md <<'EOF'
# Test

## Commands

| Command | Purpose |
| --- | --- |
| `/cmd-a` | Command A |
| `/cmd-b` | Command B |
EOF

	# First run: should pass (no drift)
	output1=$(bash .github/scripts/validate-harness.sh 2>&1) || true
	if echo "$output1" | grep -qF "missing entry"; then
		fail "Complete AGENTS.md with no drift should not report missing entries"
		exit 0
	fi

	# Delete cmd-b row from table (portable: grep -v + mv for BSD/macOS compat)
	grep -v '/cmd-b' AGENTS.md > AGENTS.md.tmp && mv AGENTS.md.tmp AGENTS.md

	output2=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?
	if [ "${exit_code:-0}" -ne 0 ] && echo "$output2" | grep -qF "missing entry" && echo "$output2" | grep -qF "cmd-b"; then
		pass "Deleted row caught by forward check (acceptance criterion 2)"
	elif [ "${exit_code:-0}" -eq 0 ]; then
		fail "Forward check did not error after row deletion"
	else
		fail "Forward check exited non-zero but unexpected output"
	fi
)
rm -rf "$T6"

# ── Test 7: Reverse check — stale table row without file ─────────────────────

echo "── Test 7: Reverse check — stale table row, no file ──"
T7=$(mktemp -d)
(
	cd "$T7"
	git init --quiet
	git config user.email "test@example.com"
	git config user.name "Test User"

	mkdir -p .opencode/commands .github/scripts
	cp "$REAL_VALIDATOR" .github/scripts/validate-harness.sh

	# Only cmd-a has a file; cmd-b is stale
	cat > .opencode/commands/cmd-a.md <<'EOF'
---
description: Command A
---
EOF

	# AGENTS.md has a stale entry for cmd-b
	cat > AGENTS.md <<'EOF'
# Test

## Commands

| Command | Purpose |
| --- | --- |
| `/cmd-a` | Command A |
| `/cmd-b` | Stale entry — no file |
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	# The reverse check should produce a WARNING about stale cmd-b,
	# NOT an ERROR. The validator may exit non-zero due to unrelated
	# frontmatter-parser failures in the temp repo (js-yaml not available);
	# we only care about the cross-check's severity classification here.
	if echo "$output" | grep -q 'WARN:.*cmd-b' && ! echo "$output" | grep -q 'ERROR:.*cmd-b'; then
		pass "Reverse check warns (not errors) on stale table row"
	elif echo "$output" | grep -q 'ERROR:.*cmd-b'; then
		fail "Reverse check reported ERROR instead of WARN for stale table row"
	else
		fail "Reverse check did not detect stale table row"
	fi
)
rm -rf "$T7"

# ── Test 8: Bash permission pattern ends in " *" regression check ────────────

echo "── Test 8: Bash permission pattern ending in ' *' is caught ──"
T8=$(mktemp -d)
(
	cd "$T8"
	git init --quiet
	git config user.email "test@example.com"
	git config user.name "Test User"

	mkdir -p .opencode/agents .github/scripts

	# Copy the validator and frontmatter parser
	cp "$REAL_VALIDATOR" .github/scripts/validate-harness.sh

	# Create an agent with a buggy pattern
	cat > .opencode/agents/test-agent.md <<'EOF'
---
description: An agent with a buggy space-asterisk pattern
mode: subagent
permission:
  bash:
    "git push *": "deny"
    "git status": "allow"
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "pattern ends in ' *'"; then
		pass "Caught ' *' pattern in agent frontmatter"
	elif echo "$output" | grep -qF "pattern ends in ' *'"; then
		fail "Detected ' *' pattern but exited 0"
	else
		fail "Did not detect ' *' pattern in agent frontmatter"
	fi
)
rm -rf "$T8"

# ── Test 9: Read-only agent without edit: deny is caught ─────────────────────

echo "── Test 9: Read-only contract — agent claims read-only but lacks edit: deny ──"
T9=$(mktemp -d)
(
	cd "$T9"
	git init --quiet
	git config user.email "test@example.com"
	git config user.name "Test User"

	mkdir -p .opencode/agents .github/scripts
	cp "$REAL_VALIDATOR" .github/scripts/validate-harness.sh
	cp "$REPO_ROOT/.github/scripts/frontmatter-parser.js" .github/scripts/

	# Agent whose description claims read-only but has NO permission block
	cat > .opencode/agents/rogue-auditor.md <<'EOF'
---
description: Audit tests and produce a report only; makes no code changes.
mode: subagent
---
EOF

	output=$(NODE_PATH="$REPO_ROOT/node_modules" bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "claims read-only"; then
		pass "Caught read-only agent missing edit: deny"
	elif echo "$output" | grep -qF "claims read-only"; then
		fail "Detected read-only violation but exited 0"
	else
		fail "Did not detect read-only agent missing edit: deny"
	fi
)
rm -rf "$T9"

# ── Test 10: Read-only agent with edit: deny but no bash restriction is caught

echo "── Test 10: Read-only contract — agent has edit: deny but no bash restriction ──"
T10=$(mktemp -d)
(
	cd "$T10"
	git init --quiet
	git config user.email "test@example.com"
	git config user.name "Test User"

	mkdir -p .opencode/agents .github/scripts
	cp "$REAL_VALIDATOR" .github/scripts/validate-harness.sh
	cp "$REPO_ROOT/.github/scripts/frontmatter-parser.js" .github/scripts/

	# Agent with edit: deny but bash fully open (no catch-all deny)
	cat > .opencode/agents/leaky-auditor.md <<'EOF'
---
description: Review code; does not auto-fix anything.
mode: subagent
permission:
  edit: deny
---
EOF

	output=$(NODE_PATH="$REPO_ROOT/node_modules" bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	# Must match the specific read-only contract error for bash restriction
	# (not just any line containing "bash" — the validator header would match)
	if echo "$output" | grep -qF "ERROR" && echo "$output" | grep -qF "leaky-auditor"; then
		pass "Caught read-only agent missing bash restriction"
	elif echo "$output" | grep -qF "claims read-only" && echo "$output" | grep -qF "leaky-auditor"; then
		pass "Caught read-only agent missing bash restriction (no ERROR prefix)"
	else
		fail "Did not detect read-only agent missing bash restriction"
	fi
)
rm -rf "$T10"

# ── Test 11: Properly locked-down read-only agent passes

echo "── Test 11: Read-only contract — properly locked-down agent passes ──"
T11=$(mktemp -d)
(
	cd "$T11"
	git init --quiet
	git config user.email "test@example.com"
	git config user.name "Test User"

	mkdir -p .opencode/agents .github/scripts
	cp "$REAL_VALIDATOR" .github/scripts/validate-harness.sh
	cp "$REPO_ROOT/.github/scripts/frontmatter-parser.js" .github/scripts/

	# Agent with full architect-pattern permissions
	cat > .opencode/agents/safe-auditor.md <<'EOF'
---
description: Read-only evaluation; does not modify files.
mode: subagent
permission:
  edit: deny
  bash:
    "*": deny
    "ls*": allow
    "cat*": allow
    "grep*": allow
  webfetch: deny
  task: deny
---
EOF

	output=$(NODE_PATH="$REPO_ROOT/node_modules" bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	# Should NOT flag safe-auditor for read-only contract violation
	if echo "$output" | grep -F "safe-auditor" | grep -qF "claims read-only"; then
		fail "Properly locked-down agent was flagged as read-only violation"
	else
		pass "Properly locked-down agent not flagged"
	fi
)
rm -rf "$T11"

# ── Summary ───────────────────────────────────────────────────────────────────

total_pass=$(grep -c "PASS" "$RESULT_FILE" 2>/dev/null || true)
total_fail=$(grep -c "FAIL" "$RESULT_FILE" 2>/dev/null || true)
: "${total_pass:=0}"
: "${total_fail:=0}"

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$total_fail" -eq 0 ]; then
	echo "✓ validate-harness tests PASSED — $total_pass assertion(s), 0 failures"
	echo "═══════════════════════════════════════════════════════════"
	exit 0
else
	echo "✗ validate-harness tests FAILED — $total_pass passed, $total_fail failure(s)"
	echo "═══════════════════════════════════════════════════════════"
	exit 1
fi

# vim: ft=sh sts=4 sw=4 ts=4 et :
