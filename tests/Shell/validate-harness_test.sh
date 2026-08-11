#!/usr/bin/env bash
# $KYAULabs: validate-harness_test.sh kyau@cosmos.kyaulabs 2026/08/03 -0700 Exp $


































# ── Repro-first tests for validate-harness.sh ──────────────────────────────────
# Bugs under test (from Fable 5 audit):
#   3. Vacuous PASS on empty/missing .opencode (HARNESS_DIR is relative)
#   4. Frontmatter parser re-enters on --- in Markdown body
#   6. Unescaped name in grep regex causes false collisions
#   9. grep -c || echo 0 yields 0\n0, breaking integer test

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file
REAL_VALIDATOR="$REPO_ROOT/.github/scripts/validate-harness.sh"

if [ ! -f "$REAL_VALIDATOR" ]; then
	fail "Cannot find validate-harness.sh at $REAL_VALIDATOR"
	exit 1
fi

# Copy the validator, frontmatter parser, and symlink node_modules into the
# current temp repo so the validator runs with a working frontmatter parser.
# Must be called from inside the temp repo's root directory (after cd).
# Usage: setup_validator_env
setup_validator_env() {
	mkdir -p .github/scripts
	cp "$REAL_VALIDATOR" .github/scripts/validate-harness.sh
	cp "$REPO_ROOT/.github/scripts/frontmatter-parser.js" .github/scripts/
	cp "$REPO_ROOT/.github/scripts/jsonc-strip.js" .github/scripts/
	cp "$REPO_ROOT/.github/scripts/inline-agent-permissions.js" .github/scripts/
	cp "$REPO_ROOT/.github/scripts/check-frontend-agent-contract.js" .github/scripts/
	cp "$REPO_ROOT/.github/scripts/prism_manifest.php" .github/scripts/
	cp "$REPO_ROOT/.github/scripts/PrismManifest.php" .github/scripts/
	cp "$REPO_ROOT/.github/scripts/PrismJsoncDocument.php" .github/scripts/
	cp "$REPO_ROOT/.github/scripts/PrismJsoncException.php" .github/scripts/
	cp "$REPO_ROOT/.github/scripts/PrismOpenCodeConfig.php" .github/scripts/
	ln -s "$REPO_ROOT/node_modules" node_modules
}

# Seed the FRONTEND routing-contract fixtures: the real project manifest,
# OpenCode config, and frontend/tdd agent files. Contract-specific fixtures
# copy prism.jsonc so a missing checker or agent input fails loudly instead of
# passing vacuously; the manifest guard keeps generic fixtures without the
# FRONTEND tier out of scope. Must be called from inside the temp repo root.
# Usage: setup_contract_env
setup_contract_env() {
	setup_validator_env
	cp "$REPO_ROOT/prism.jsonc" prism.jsonc
	cp "$REPO_ROOT/opencode.jsonc" opencode.jsonc
	mkdir -p .opencode/agents
	cp "$REPO_ROOT/.opencode/agents/frontend.md" .opencode/agents/frontend.md
	cp "$REPO_ROOT/.opencode/agents/tdd.md" .opencode/agents/tdd.md
	# Real skill directories: the checker derives the ordered frontend skill
	# set from their self-declared metadata, so the fixtures must ship them.
	for skill in frontend-design frontend-architecture scss-mobile-first accessibility; do
		mkdir -p ".opencode/skills/$skill"
		cp "$REPO_ROOT/.opencode/skills/$skill/SKILL.md" ".opencode/skills/$skill/SKILL.md"
	done
}

# ── Test 1: Finding 3 — vacuous PASS on relative HARNESS_DIR ──────────────────

echo ""
echo "── Test 1: Vacuous PASS when run from non-repo-root ──"
T1=$(mktemp -d)
register_temp_dir "$T1"
git_init_test_repo "$T1"
(
	cd "$T1"
	mkdir -p .opencode/skills/test-skill
	cat > .opencode/skills/test-skill/SKILL.md <<'EOF'
---
name: test-skill
description: A valid test skill with all required fields.
---
EOF
	git add -A
	git commit --quiet -m "init"

	setup_validator_env

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

# ── Test 2: Finding 4 — frontmatter parser re-enters on body '---' ──────────────

echo "── Test 2: Frontmatter parser re-enters on body '---' ──"
T2=$(mktemp -d)
register_temp_dir "$T2"
git_init_test_repo "$T2"
(
	cd "$T2"
	setup_validator_env

	# Negative control: an AGENT file missing mode: in frontmatter, but
	# with a --- horizontal rule in the body followed by text that says
	# "mode: subagent". A buggy parser that re-enters frontmatter mode on
	# the body --- would read that line as mode: subagent and NOT report
	# it as missing.
	mkdir -p .opencode/agents
	cat > .opencode/agents/missing-mode-agent.md <<'EOF'
---
description: An agent file missing the mode field
---

## Instructions

Some body text.

---

Then a horizontal rule followed by text that happens to say:
mode: subagent — this is NOT frontmatter, it's body prose.
EOF

	# Positive control: a fully valid agent with mode in frontmatter.
	# If the parser is working, this file must NOT be flagged for missing
	# mode. If the parser is absent/broken, it WILL be falsely flagged —
	# catching the vacuous-pass regression.
	cat > .opencode/agents/valid-agent.md <<'EOF'
---
description: A fully valid agent with all required fields
mode: subagent
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	# Negative control: missing-mode agent must be flagged
	if echo "$output" | grep -qF "missing-mode-agent.md: missing or empty 'mode'"; then
		pass "Negative control: missing-mode agent correctly flagged"
	else
		fail "Negative control: missing-mode agent not flagged (parser may have re-entered on body '---')"
	fi

	# Positive control: valid agent must NOT be flagged for missing mode
	if echo "$output" | grep -qF "valid-agent.md: missing or empty 'mode'"; then
		fail "Positive control: valid agent falsely flagged (parser broken or absent)"
	else
		pass "Positive control: valid agent not flagged (parser working)"
	fi
)

# ── Test 3: Finding 6 — dotted name causes false collision ────────────────────

echo "── Test 3: Dotted name causes false regex collision ──"
T3=$(mktemp -d)
register_temp_dir "$T3"
git_init_test_repo "$T3"
(
	cd "$T3"
	mkdir -p .opencode/agents
	setup_validator_env

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

# ── Test 4: Finding 9 — grep -c || echo 0 yields 0\n0 ────────────────────────

echo "── Test 4: grep -c || echo 0 integer expression error ──"
T4=$(mktemp -d)
register_temp_dir "$T4"
git_init_test_repo "$T4"
(
	cd "$T4"
	mkdir -p .opencode/agents
	setup_validator_env

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

# ── Test 5: Forward check — command file exists, AGENTS.md row missing ───────

echo "── Test 5: Forward check — command file without AGENTS.md row ──"
T5=$(mktemp -d)
register_temp_dir "$T5"
git_init_test_repo "$T5"
(
	cd "$T5"

	mkdir -p .opencode/commands
	setup_validator_env

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

# ── Test 6: Forward check — deleted row from complete table ──────────────────

echo "── Test 6: Forward check — row deleted from AGENTS.md ──"
T6=$(mktemp -d)
register_temp_dir "$T6"
git_init_test_repo "$T6"
(
	cd "$T6"

	mkdir -p .opencode/commands
	setup_validator_env

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

# ── Test 7: Reverse check — stale table row without file ─────────────────────

echo "── Test 7: Reverse check — stale table row, no file ──"
T7=$(mktemp -d)
register_temp_dir "$T7"
git_init_test_repo "$T7"
(
	cd "$T7"

	mkdir -p .opencode/commands
	setup_validator_env

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

# ── Test 8: Bash permission pattern ends in " *" regression check ────────────

echo "── Test 8: Bash permission pattern ending in ' *' is caught ──"
T8=$(mktemp -d)
register_temp_dir "$T8"
git_init_test_repo "$T8"
(
	cd "$T8"

	mkdir -p .opencode/agents
	setup_validator_env

	# Create an agent with a buggy pattern
	cat > .opencode/agents/test-agent.md <<'EOF'
---
description: An agent with a buggy space-asterisk pattern
mode: subagent
permission:
  bash:
    "git push *": "deny"
    "git status*": "allow"
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

# ── Test 9: Read-only agent without edit: deny is caught ─────────────────────

echo "── Test 9: Read-only contract — agent claims read-only but lacks edit: deny ──"
T9=$(mktemp -d)
register_temp_dir "$T9"
git_init_test_repo "$T9"
(
	cd "$T9"

	mkdir -p .opencode/agents
	setup_validator_env

	# Agent whose description claims read-only but has NO permission block
	cat > .opencode/agents/rogue-auditor.md <<'EOF'
---
description: Audit tests and produce a report only; makes no code changes.
mode: subagent
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "claims read-only"; then
		pass "Caught read-only agent missing edit: deny"
	elif echo "$output" | grep -qF "claims read-only"; then
		fail "Detected read-only violation but exited 0"
	else
		fail "Did not detect read-only agent missing edit: deny"
	fi
)

# ── Test 10: Read-only agent with edit: deny but no bash restriction is caught

echo "── Test 10: Read-only contract — agent has edit: deny but no bash restriction ──"
T10=$(mktemp -d)
register_temp_dir "$T10"
git_init_test_repo "$T10"
(
	cd "$T10"

	mkdir -p .opencode/agents
	setup_validator_env

	# Agent with edit: deny but bash fully open (no catch-all deny)
	cat > .opencode/agents/leaky-auditor.md <<'EOF'
---
description: Review code; does not auto-fix anything.
mode: subagent
permission:
  edit: deny
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

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

# ── Test 11: Properly locked-down read-only agent passes

echo "── Test 11: Read-only contract — properly locked-down agent passes ──"
T11=$(mktemp -d)
register_temp_dir "$T11"
git_init_test_repo "$T11"
(
	cd "$T11"

	mkdir -p .opencode/agents
	setup_validator_env

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

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	# Should NOT flag safe-auditor for read-only contract violation
	if echo "$output" | grep -F "safe-auditor" | grep -qF "claims read-only"; then
		fail "Properly locked-down agent was flagged as read-only violation"
	else
		pass "Properly locked-down agent not flagged"
	fi
)

# ── Test 12: Command file referencing nonexistent file via sed -i / git add ──

echo "── Test 12: Command file path reference check — nonexistent file WARN ──"
T12=$(mktemp -d)
register_temp_dir "$T12"
git_init_test_repo "$T12"
(
	cd "$T12"

	mkdir -p .opencode/commands
	setup_validator_env

	# Command file with sed -i and git add targeting a nonexistent file
	cat > .opencode/commands/test-release.md <<'CMDEOF'
---
description: Test release command
---

## 1. Update version

```bash
sed -i "s/define('VERSION', '[^']*');/define('VERSION', 'v1.0.0');/" version.inc.php
git add version.inc.php
```
CMDEOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	# Should WARN about version.inc.php (nonexistent)
	if echo "$output" | grep -qF "version.inc.php" && echo "$output" | grep -q "WARN"; then
		pass "Caught sed -i / git add targeting nonexistent file"
	else
		fail "Did not warn about nonexistent file reference"
	fi
)

# ── Test 13: Command file referencing existing file does not WARN ──────────────

echo "── Test 13: Command file path reference check — existing file no WARN ──"
T13=$(mktemp -d)
register_temp_dir "$T13"
git_init_test_repo "$T13"
(
	cd "$T13"

	mkdir -p .opencode/commands
	setup_validator_env

	# Create an existing file in the repo root
	echo "<?php" > existing.php

	# Command file referencing the existing file
	cat > .opencode/commands/test-cmd.md <<'CMDEOF'
---
description: Test command
---

## 1. Update

```bash
sed -i "s/foo/bar/" existing.php
git add existing.php
```
CMDEOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	# Should NOT warn about existing.php
	if echo "$output" | grep -qF "existing.php" && echo "$output" | grep -q "WARN"; then
		fail "Warned about existing file reference (false positive)"
	else
		pass "No false warning for existing file reference"
	fi
)

# ── Test 14: Variables, placeholders, and paths are skipped ───────────────────

echo "── Test 14: Command file path reference check — edge cases skipped ──"
T14=$(mktemp -d)
register_temp_dir "$T14"
git_init_test_repo "$T14"
(
	cd "$T14"

	mkdir -p .opencode/commands
	setup_validator_env

	cat > .opencode/commands/test-cmd.md <<'CMDEOF'
---
description: Test command
---

## 1. Various references

```bash
sed -i "s/foo/bar/" $VARFILE
sed -i "s/foo/bar/" <placeholder>
sed -i "s/foo/bar/" path/to/file.php
git add -A
git add .
```
CMDEOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	# Should NOT warn about any of these (all skipped by filters)
	if echo "$output" | grep -q 'WARN.*VARFILE'; then
		fail "Warned about variable reference \$VARFILE"
	elif echo "$output" | grep -q 'WARN.*placeholder'; then
		fail "Warned about placeholder reference"
	elif echo "$output" | grep -q 'WARN.*path/to/file'; then
		fail "Warned about path reference"
	else
		pass "Variables, placeholders, and paths correctly skipped"
	fi
)

# ── Test 15: Validator fails loudly when js-yaml is unresolvable ──────────────

echo "── Test 15: Validator fails loudly when js-yaml is unresolvable ──"
T15=$(mktemp -d)
register_temp_dir "$T15"
git_init_test_repo "$T15"
(
	cd "$T15"

	# Copy validator + parser but DO NOT symlink node_modules
	# (simulates a fresh clone without npm install)
	mkdir -p .github/scripts
	cp "$REAL_VALIDATOR" .github/scripts/validate-harness.sh
	cp "$REPO_ROOT/.github/scripts/frontmatter-parser.js" .github/scripts/

	# Create a valid skill so the validator has something to parse
	mkdir -p .opencode/skills/test-skill
	cat > .opencode/skills/test-skill/SKILL.md <<'EOF'
---
name: test-skill
description: A valid test skill.
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	# The validator must fail loudly with a clear js-yaml message, NOT
	# silently swallow the error and report vacuous "missing field" errors
	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qi "js-yaml"; then
		pass "Validator fails loudly when js-yaml is unresolvable"
	elif [ "${exit_code:-0}" -eq 0 ]; then
		fail "Validator did not fail when js-yaml is missing (exit 0)"
	else
		fail "Validator failed but message did not mention js-yaml"
	fi
)

# ── Test 16: README.md forward check — command file exists, README table missing ──

echo "── Test 16: README.md forward check — command without README table entry ──"
T16=$(mktemp -d)
register_temp_dir "$T16"
git_init_test_repo "$T16"
(
	cd "$T16"

	mkdir -p .opencode/commands .opencode/agents .opencode/skills
	setup_validator_env

	# Create a command file
	cat > .opencode/commands/test-cmd.md <<'EOF'
---
description: A test command
---
EOF

	# AGENTS.md with the command listed (so AGENTS.md check passes)
	cat > AGENTS.md <<'EOF'
# Test

## Commands

| Command | Purpose |
| --- | --- |
| `/test-cmd` | Test command |
EOF

	# README.md with Slash commands table NOT containing test-cmd
	cat > README.md <<'EOF'
# Test README

## Some Section

### Slash commands

| Command | Purpose |
| --- | --- |
| `/other` | Other command |
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "README.md Slash commands table missing entry" && echo "$output" | grep -qF "test-cmd"; then
		pass "README forward check errors on missing Slash commands table entry"
	elif [ "${exit_code:-0}" -eq 0 ]; then
		fail "README forward check did not error on missing Slash commands entry (exit 0)"
	else
		fail "README forward check exited non-zero but unexpected output"
	fi
)

# ── Test 17: README.md forward check — skill exists, README category table missing ──

echo "── Test 17: README.md forward check — skill without README table entry ──"
T17=$(mktemp -d)
register_temp_dir "$T17"
git_init_test_repo "$T17"
(
	cd "$T17"

	mkdir -p .opencode/skills/test-skill
	setup_validator_env

	# Create a valid skill
	cat > .opencode/skills/test-skill/SKILL.md <<'EOF'
---
name: test-skill
description: A test skill.
---
EOF

	# AGENTS.md with the skill listed
	cat > AGENTS.md <<'EOF'
# Test

## Skills Available

| Skill | When to use |
| --- | --- |
| `test-skill` | Testing |
EOF

	# README.md with Skills table NOT containing test-skill
	cat > README.md <<'EOF'
# Test README

### Skills (on-demand)

| Category | Skills |
| --- | --- |
| Other | `other-skill` |
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "README.md Skills table missing entry" && echo "$output" | grep -qF "test-skill"; then
		pass "README forward check errors on missing Skills table entry (category format)"
	elif [ "${exit_code:-0}" -eq 0 ]; then
		fail "README forward check did not error on missing Skills entry (exit 0)"
	else
		fail "README forward check exited non-zero but unexpected output"
	fi
)

# ── Test 18: README.md reverse check — stale table entry, no file ──

echo "── Test 18: README.md reverse check — stale Slash commands entry ──"
T18=$(mktemp -d)
register_temp_dir "$T18"
git_init_test_repo "$T18"
(
	cd "$T18"

	mkdir -p .opencode/commands
	setup_validator_env

	# AGENTS.md (empty commands table)
	cat > AGENTS.md <<'EOF'
# Test

## Commands

| Command | Purpose |
| --- | --- |
EOF

	# README.md with a stale command entry
	cat > README.md <<'EOF'
# Test README

### Slash commands

| Command | Purpose |
| --- | --- |
| `/fake-cmd` | Does not exist |
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -qF "README.md Slash commands table has entry" && echo "$output" | grep -qF "fake-cmd"; then
		pass "README reverse check warns on stale Slash commands entry"
	else
		fail "README reverse check did not warn on stale entry"
	fi
)

# ── Test 19: README.md clean — all entries match filesystem ──

echo "── Test 19: README.md clean — all tables in sync ──"
T19=$(mktemp -d)
register_temp_dir "$T19"
git_init_test_repo "$T19"
(
	cd "$T19"

	mkdir -p .opencode/commands .opencode/agents .opencode/skills .opencode/plugins
	setup_validator_env

	# Minimal valid config — {} is valid JSON, contains no '*' patterns,
	# no git add*/git stage* entries; every config-based check passes cleanly.
	echo '{}' > opencode.jsonc

	# Sensitive-path matcher wiring (ADR-0047) so the plugin-wiring check passes.
	cat > .opencode/plugins/pre-tool-use.ts <<'EOF'
import { sensitiveOperandCheck } from "./sensitive-paths.ts";
export const probe = sensitiveOperandCheck;
EOF

	# Create one command, one agent, one skill
	cat > .opencode/commands/my-cmd.md <<'EOF'
---
description: A command.
---
EOF

	cat > .opencode/agents/my-agent.md <<'EOF'
---
description: An agent.
mode: subagent
permission:
  edit: deny
---
EOF

	mkdir -p .opencode/skills/my-skill
	cat > .opencode/skills/my-skill/SKILL.md <<'EOF'
---
name: my-skill
description: A skill.
---
EOF

	# AGENTS.md with all entries (plus the ADR-0047 Hard Boundary marker so
	# the sensitive-path marker check passes)
	cat > AGENTS.md <<'EOF'
# Test

## Hard Boundaries

> - never read or exfiltrate credential files (test fixture marker).

## Commands

| Command | Purpose |
| --- | --- |
| `/my-cmd` | A command |

## Agents Available

| Agent | When to use |
| --- | --- |
| `@my-agent` | An agent |

## Skills Available

| Skill | When to use |
| --- | --- |
| `my-skill` | A skill |
EOF

	# README.md with all entries in sync
	cat > README.md <<'EOF'
# Test README

### Slash commands

| Command | Purpose |
| --- | --- |
| `/my-cmd` | A command |

### Custom agents

| Agent | When to use |
| --- | --- |
| `@my-agent` | An agent |

### Skills (on-demand)

| Category | Skills |
| --- | --- |
| Test | `my-skill` |
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -eq 0 ] && echo "$output" | grep -qF "README.md index tables cross-checked"; then
		pass "README clean — all tables in sync, validator passes"
	else
		fail "README clean — validator failed or did not confirm cross-check (exit ${exit_code:-0})"
	fi
)

# ── Test 20: Stale plan files with unchecked boxes trigger WARN ──

echo ""
echo "── Test 20: Stale plan files with unchecked boxes trigger WARN ──"
T20=$(mktemp -d)
register_temp_dir "$T20"
git_init_test_repo "$T20"
(
	cd "$T20"

	mkdir -p .opencode/commands .opencode/skills .opencode/agents docs/plans
	setup_validator_env

	# Create a valid command so the vacuity guard doesn't fire
	cat > .opencode/commands/some-cmd.md <<'EOF'
---
description: Placeholder command
---
EOF

	# Create a stale plan file with unchecked boxes
	cat > docs/plans/20260101T120000-old-feature.md <<'EOF'
# Old Feature Plan
- [ ] Task 1
- [ ] Task 2
EOF
	make_file_stale docs/plans/20260101T120000-old-feature.md 8

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -qF "Stale plan" && echo "$output" | grep -qF "20260101T120000-old-feature.md"; then
		pass "Detected stale plan file as WARN"
	else
		fail "Did not detect stale plan file"
	fi
)

# ── Test 21: Recent plans and fully-checked old plans do not WARN ──

echo ""
echo "── Test 21: Recent plans and fully-checked old plans do not WARN ──"
T21=$(mktemp -d)
register_temp_dir "$T21"
git_init_test_repo "$T21"
(
	cd "$T21"

	mkdir -p .opencode/commands .opencode/skills .opencode/agents docs/plans
	setup_validator_env

	# Create a valid command so the vacuity guard doesn't fire
	cat > .opencode/commands/some-cmd.md <<'EOF'
---
description: Placeholder command
---
EOF

	# Recent plan with unchecked boxes (should NOT warn — too new)
	cat > docs/plans/20260712T120000-recent-feature.md <<'EOF'
# Recent Feature Plan
- [ ] Task 1
EOF

	# Old plan with all boxes checked (should NOT warn — complete)
	cat > docs/plans/20260101T120000-old-complete.md <<'EOF'
# Old Complete Plan
- [x] Task 1
- [x] Task 2
EOF
	make_file_stale docs/plans/20260101T120000-old-complete.md 30

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -qF "Stale plan"; then
		fail "Warned on recent or fully-checked plan"
	else
		pass "No false positive on recent or fully-checked plans"
	fi
)

# ── Test 22: git add/stage verdict mismatch in opencode.json is caught ────────

echo "── Test 22: git add/stage verdict mismatch is caught ──"
T22=$(mktemp -d)
register_temp_dir "$T22"
git_init_test_repo "$T22"
(
	cd "$T22"

	mkdir -p .opencode/agents
	setup_validator_env

	cat > opencode.jsonc <<'EOF'
{
	"agents": {
		"build": {
			"permission": {
				"bash": {
					"*": "allow",
					"git add*": "ask",
					"git stage*": "deny"
				}
			}
		}
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -qF "git synonyms with different verdicts"; then
		pass "Caught git add/stage verdict mismatch in opencode.jsonc"
	else
		fail "Did not detect git add/stage verdict mismatch"
	fi
)

# ── Test 23: matching git add/stage verdicts are not flagged ──────────────────

echo "── Test 23: matching git add/stage verdicts not flagged ──"
T23=$(mktemp -d)
register_temp_dir "$T23"
git_init_test_repo "$T23"
(
	cd "$T23"

	mkdir -p .opencode/agents
	setup_validator_env

	cat > opencode.jsonc <<'EOF'
{
	"agents": {
		"build": {
			"permission": {
				"bash": {
					"*": "allow",
					"git add*": "ask",
					"git stage*": "ask"
				}
			}
		}
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -qF "git synonyms with different verdicts"; then
		fail "Matching git add/stage verdicts were falsely flagged"
	else
		pass "Matching git add/stage verdicts not flagged"
	fi
)

# ── Test 24: bare "git status" without wildcard is caught ─────────────────────

echo "── Test 24: bare 'git status' permission is caught ──"
T24=$(mktemp -d)
register_temp_dir "$T24"
git_init_test_repo "$T24"
(
	cd "$T24"

	mkdir -p .opencode/agents
	setup_validator_env

	cat > .opencode/agents/auditor.md <<'EOF'
---
description: Read-only evaluation; does not modify files.
mode: subagent
permission:
  edit: deny
  bash:
    "*": deny
    "git status": "allow"
  webfetch: deny
  task: deny
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -qF "bare 'git status' permission cannot match"; then
		pass "Caught bare 'git status' permission pattern"
	else
		fail "Did not detect bare 'git status' permission pattern"
	fi
)

# ── Test 25: "git status*" wildcard is not flagged ────────────────────────────

echo "── Test 25: 'git status*' wildcard not flagged ──"
T25=$(mktemp -d)
register_temp_dir "$T25"
git_init_test_repo "$T25"
(
	cd "$T25"

	mkdir -p .opencode/agents
	setup_validator_env

	cat > .opencode/agents/auditor.md <<'EOF'
---
description: Read-only evaluation; does not modify files.
mode: subagent
permission:
  edit: deny
  bash:
    "*": deny
    "git status*": "allow"
  webfetch: deny
  task: deny
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -qF "bare 'git status' permission cannot match"; then
		fail "'git status*' wildcard was falsely flagged as bare"
	else
		pass "'git status*' wildcard not flagged"
	fi
)

# ── Test 26: edit-allow on prototypes/** without rm permission is caught ─────

echo "── Test 26: edit-allow prototypes/** without rm is caught ──"
T26=$(mktemp -d)
register_temp_dir "$T26"
git_init_test_repo "$T26"
(
	cd "$T26"

	mkdir -p .opencode/agents
	setup_validator_env

	cat > .opencode/agents/debugger.md <<'EOF'
---
description: Investigates bugs with scoped write access.
mode: subagent
permission:
  edit:
    "*": "ask"
    "prototypes/**": "allow"
  bash:
    "*": "deny"
    "php prototypes/*": "allow"
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -qF "cleanup blocked"; then
		pass "Caught edit-allow prototypes/** without rm permission"
	else
		fail "Did not detect edit-allow prototypes/** without rm permission"
	fi
)

# ── Test 27: edit-allow on prototypes/** with rm permission not flagged ───────

echo "── Test 27: edit-allow prototypes/** with rm not flagged ──"
T27=$(mktemp -d)
register_temp_dir "$T27"
git_init_test_repo "$T27"
(
	cd "$T27"

	mkdir -p .opencode/agents
	setup_validator_env

	cat > .opencode/agents/debugger.md <<'EOF'
---
description: Investigates bugs with scoped write access.
mode: subagent
permission:
  edit:
    "*": "ask"
    "prototypes/**": "allow"
  bash:
    "*": "deny"
    "php prototypes/*": "allow"
    "rm prototypes/*": "ask"
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -qF "cleanup blocked"; then
		fail "edit-allow prototypes/** with rm permission was falsely flagged"
	else
		pass "edit-allow prototypes/** with rm permission not flagged"
	fi
)

# ── Test 28: Inline agent claiming read-only without edit: deny is caught ────

echo "── Test 28: Inline read-only contract — agent in opencode.jsonc lacks edit: deny ──"
T28=$(mktemp -d)
register_temp_dir "$T28"
git_init_test_repo "$T28"
(
	cd "$T28"

	mkdir -p .opencode/agents .github/scripts
	setup_validator_env

	# opencode.jsonc with an inline agent whose description claims read-only
	# but whose permission block omits edit: deny entirely.
	cat > opencode.jsonc <<'EOF'
{
  "agent": {
    "rogue-inline": {
      "description": "Audit tests and produce a report only; makes no code changes.",
      "mode": "primary",
      "permission": {
        "bash": { "*": "deny" }
      }
    }
  }
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "claims read-only" && echo "$output" | grep -qF "rogue-inline"; then
		pass "Caught inline read-only agent missing edit: deny"
	elif echo "$output" | grep -qF "claims read-only" && echo "$output" | grep -qF "rogue-inline"; then
		fail "Detected inline read-only violation but exited 0"
	else
		fail "Did not detect inline read-only agent missing edit: deny"
	fi
)

# ── Test 29: Inline agent with edit: deny but no bash restriction is caught ──

echo "── Test 29: Inline read-only contract — agent has edit: deny but no bash restriction ──"
T29=$(mktemp -d)
register_temp_dir "$T29"
git_init_test_repo "$T29"
(
	cd "$T29"

	mkdir -p .opencode/agents .github/scripts
	setup_validator_env

	cat > opencode.jsonc <<'EOF'
{
  "agent": {
    "leaky-inline": {
      "description": "Review code; does not auto-fix anything.",
      "mode": "primary",
      "permission": {
        "edit": "deny"
      }
    }
  }
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "leaky-inline"; then
		pass "Caught inline read-only agent missing bash restriction"
	elif echo "$output" | grep -qF "claims read-only" && echo "$output" | grep -qF "leaky-inline"; then
		pass "Caught inline read-only agent missing bash restriction (no ERROR prefix)"
	else
		fail "Did not detect inline read-only agent missing bash restriction"
	fi
)

# ── Test 30: Properly locked-down inline agent passes ─────────────────────────

echo "── Test 30: Inline read-only contract — properly locked-down inline agent passes ──"
T30=$(mktemp -d)
register_temp_dir "$T30"
git_init_test_repo "$T30"
(
	cd "$T30"

	mkdir -p .opencode/agents .github/scripts
	setup_validator_env

	cat > opencode.jsonc <<'EOF'
{
  "agent": {
    "safe-inline": {
      "description": "Read-only evaluation; does not modify files.",
      "mode": "primary",
      "permission": {
        "edit": "deny",
        "bash": { "*": "deny", "ls*": "allow" },
        "webfetch": "deny",
        "task": "deny"
      }
    }
  }
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -F "safe-inline" | grep -qF "claims read-only"; then
		fail "Properly locked-down inline agent was flagged as read-only violation"
	else
		pass "Properly locked-down inline agent not flagged"
	fi
)

# ── Test 31: Autonomous npm install grant at 'allow' is caught ───────────────

echo ""
echo "── Test 31: Autonomous npm install grant at 'allow' is caught ──"
T31=$(mktemp -d)
register_temp_dir "$T31"
git_init_test_repo "$T31"
(
	cd "$T31"
	mkdir -p .opencode/agents
	setup_validator_env

	cat > .opencode/agents/installer-agent.md <<'EOF'
---
description: Read-only evaluation; does not modify files.
mode: subagent
permission:
  edit: deny
  bash:
    "*": deny
    "ls*": allow
    "npm install -g*": allow
  webfetch: deny
  task: deny
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "package-install grant"; then
		pass "Caught autonomous npm install grant at 'allow'"
	elif echo "$output" | grep -qF "package-install grant"; then
		fail "Detected npm install grant but exited 0"
	else
		fail "Did not detect autonomous npm install grant"
	fi
)

# ── Test 32: Autonomous pip install grant at 'allow' is caught ───────────────

echo "── Test 32: Autonomous pip install grant at 'allow' is caught ──"
T32=$(mktemp -d)
register_temp_dir "$T32"
git_init_test_repo "$T32"
(
	cd "$T32"
	mkdir -p .opencode/agents
	setup_validator_env

	cat > .opencode/agents/installer-agent.md <<'EOF'
---
description: Read-only evaluation; does not modify files.
mode: subagent
permission:
  edit: deny
  bash:
    "*": deny
    "ls*": allow
    "pip install semgrep*": allow
  webfetch: deny
  task: deny
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "package-install grant"; then
		pass "Caught autonomous pip install grant at 'allow'"
	else
		fail "Did not detect autonomous pip install grant"
	fi
)

# ── Test 33: npm/pip install grant at 'ask' is not flagged ───────────────────

echo "── Test 33: npm/pip install grant at 'ask' is not flagged ──"
T33=$(mktemp -d)
register_temp_dir "$T33"
git_init_test_repo "$T33"
(
	cd "$T33"
	mkdir -p .opencode/agents
	setup_validator_env

	cat > .opencode/agents/gated-installer.md <<'EOF'
---
description: Read-only evaluation; does not modify files.
mode: subagent
permission:
  edit: deny
  bash:
    "*": deny
    "ls*": allow
    "npm install -g*": "ask"
    "pip install*": "ask"
  webfetch: deny
  task: deny
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -F "gated-installer" | grep -qF "package-install grant"; then
		fail "npm/pip install at 'ask' was falsely flagged"
	else
		pass "npm/pip install grant at 'ask' not flagged"
	fi
)

# ── Test 34: bash " *" pattern inside opencode.jsonc is caught ────────────────

echo ""
echo "── Test 34: bash ' *' pattern in opencode.jsonc is caught ──"
T34=$(mktemp -d)
register_temp_dir "$T34"
git_init_test_repo "$T34"
(
	cd "$T34"
	mkdir -p .opencode/skills/dummy
	cat > .opencode/skills/dummy/SKILL.md <<'EOF'
---
name: dummy
description: A valid placeholder skill so the vacuous-pass guard stays happy.
---
EOF
	setup_validator_env

	# Bad pattern lives in the INLINE config (opencode.jsonc), not an agent .md.
	cat > opencode.jsonc <<'EOF'
{
	"agents": {
		"build": {
			"permission": {
				"bash": {
					"git status *": "allow"
				}
			}
		}
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -qF "pattern ends in ' *'"; then
		pass "Caught ' *' bash pattern inside opencode.jsonc"
	else
		fail "Did not detect ' *' bash pattern inside opencode.jsonc (validator may be reading the wrong filename)"
	fi
)

# ── Test 35: absent opencode.jsonc is a loud error ────────────────────────────

echo ""
echo "── Test 35: absent opencode.jsonc fails loud ──"
T35=$(mktemp -d)
register_temp_dir "$T35"
git_init_test_repo "$T35"
(
	cd "$T35"
	# Minimal valid harness so the vacuous-pass guard does not fire first; but
	# deliberately NO opencode.jsonc.
	mkdir -p .opencode/skills/dummy
	cat > .opencode/skills/dummy/SKILL.md <<'EOF'
---
name: dummy
description: Placeholder skill so the empty-harness guard stays quiet.
---
EOF
	setup_validator_env

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -qF "opencode.jsonc not found"; then
		pass "Absent opencode.jsonc produces a loud error"
	else
		fail "Absent opencode.jsonc did not error (false-clean pass)"
	fi
)

# ── Test 36: Write-capable agent with absent edit is flagged ─────────────────

echo ""
echo "── Test 36: Write-capable agent (absent edit) flagged as unscoped ──"
T36=$(mktemp -d)
register_temp_dir "$T36"
git_init_test_repo "$T36"
(
	cd "$T36"
	mkdir -p .opencode/agents
	setup_validator_env

	# Non-read-only agent with a permission block but NO edit key
	# (the docs-writer drift class). Must be flagged.
	cat > .opencode/agents/doc-bot.md <<'EOF'
---
description: Generates documentation and headers for source files.
mode: subagent
permission:
  bash: deny
  lsp: allow
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "unscoped edit"; then
		pass "Caught write-capable agent with absent edit (unscoped)"
	elif echo "$output" | grep -qF "unscoped edit"; then
		fail "Detected unscoped edit but exited 0"
	else
		fail "Did not detect write-capable agent with absent edit"
	fi
)

# ── Test 37: Write-capable agent with scoped edit (catch-all deny) passes ────

echo "── Test 37: Write-capable agent with scoped edit not flagged ──"
T37=$(mktemp -d)
register_temp_dir "$T37"
git_init_test_repo "$T37"
(
	cd "$T37"
	mkdir -p .opencode/agents
	setup_validator_env

	# Same agent but with a properly scoped edit (catch-all deny + allows).
	cat > .opencode/agents/doc-bot.md <<'EOF'
---
description: Generates documentation and headers for source files.
mode: subagent
permission:
  edit:
    "*": deny
    "*.php": allow
    "docs/**": allow
  bash: deny
  webfetch: deny
  task: deny
  lsp: allow
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -F "doc-bot" | grep -qF "unscoped edit"; then
		fail "Scoped write-capable agent was falsely flagged as unscoped"
	else
		pass "Scoped write-capable agent not flagged"
	fi
)

# ── Test 38: Allowlisted general-write agent (tdd) with absent edit passes ───

echo "── Test 38: Allowlisted general-write agent (tdd) not flagged ──"
T38=$(mktemp -d)
register_temp_dir "$T38"
git_init_test_repo "$T38"
(
	cd "$T38"
	mkdir -p .opencode/agents
	setup_validator_env

	# tdd is a general-purpose write agent — intentionally unscoped (allowlisted).
	cat > .opencode/agents/tdd.md <<'EOF'
---
description: Write tests first, then implement. Edits arbitrary source files.
mode: subagent
permission:
  bash:
    "git add*": "allow"
    "git commit*": "allow"
  lsp: allow
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -F "tdd.md" | grep -qF "unscoped edit"; then
		fail "Allowlisted general-write agent (tdd) was falsely flagged"
	else
		pass "Allowlisted general-write agent (tdd) not flagged"
	fi
)

# ── Test: inline agent with no bash (inherits default) flagged (issue #202) ────

echo "── Test: inline agent (no bash) flagged for ungated git commit ──"
T_GC1=$(mktemp -d)
register_temp_dir "$T_GC1"
git_init_test_repo "$T_GC1"
(
	cd "$T_GC1"
	mkdir -p .opencode/agents
	setup_validator_env

	# general drift class: only lsp set, bash inherited (no git-commit gate).
	cat > opencode.jsonc <<'EOF'
{
	"agent": {
		"general": {
			"permission": {
				"lsp": "allow"
			}
		}
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -qF "git commit without a gate"; then
		pass "Caught inline agent with inherited/ungated git commit (issue #202)"
	else
		fail "Did not detect inline agent with ungated git commit"
	fi
)

# ── Test: inline agent with bash allow + git commit ask NOT flagged ────────────

echo "── Test: inline agent (git commit: ask) not flagged ──"
T_GC2=$(mktemp -d)
register_temp_dir "$T_GC2"
git_init_test_repo "$T_GC2"
(
	cd "$T_GC2"
	mkdir -p .opencode/agents
	setup_validator_env

	# build/design posture: "*" allow + git commit gated at ask.
	cat > opencode.jsonc <<'EOF'
{
	"agent": {
		"build": {
			"permission": {
				"bash": {
					"*": "allow",
					"git add*": "ask",
					"git stage*": "ask",
					"git commit*": "ask",
					"git push*": "deny"
				}
			}
		}
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -F "build" | grep -qF "git commit without a gate"; then
		fail "Gated inline agent (git commit: ask) was falsely flagged"
	else
		pass "Gated inline agent (git commit: ask) not flagged"
	fi
)

# ── Test: inline agent with bash fully denied NOT flagged (skipped) ────────────

echo "── Test: inline agent (bash: deny) not flagged (skipped) ──"
T_GC3=$(mktemp -d)
register_temp_dir "$T_GC3"
git_init_test_repo "$T_GC3"
(
	cd "$T_GC3"
	mkdir -p .opencode/agents
	setup_validator_env

	# judge posture: bash fully denied — no commit possible, skip the check.
	cat > opencode.jsonc <<'EOF'
{
	"agent": {
		"judge": {
			"permission": {
				"bash": "deny"
			}
		}
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -F "judge" | grep -qF "git commit without a gate"; then
		fail "Fully-denied inline agent was falsely flagged"
	else
		pass "Fully-denied inline agent (bash: deny) not flagged"
	fi
)

# ── Test 39: SDK version parity — mismatched manifests ERROR ──────────────────

echo ""
echo "── Test 39: SDK version parity — mismatched versions ERROR ──"
T39=$(mktemp -d)
register_temp_dir "$T39"
git_init_test_repo "$T39"
(
	cd "$T39"
	mkdir -p .opencode .opencode/skills/dummy
	cat > .opencode/skills/dummy/SKILL.md <<'EOF'
---
name: dummy
description: Placeholder skill so the empty-harness guard stays quiet.
---
EOF
	setup_validator_env

	# Root package.json pins 1.17.15
	cat > package.json <<'EOF'
{
	"devDependencies": {
		"@opencode-ai/plugin": "1.17.15"
	}
}
EOF

	# .opencode/package.json pins 1.18.4
	cat > .opencode/package.json <<'EOF'
{
	"dependencies": {
		"@opencode-ai/plugin": "1.18.4"
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "SDK version mismatch"; then
		pass "Caught SDK version mismatch between manifests"
	else
		fail "Did not detect SDK version mismatch (exit ${exit_code:-0})"
	fi
)

# ── Test 40: SDK version parity — matched manifests PASS ──────────────────────

echo "── Test 40: SDK version parity — matched versions PASS ──"
T40=$(mktemp -d)
register_temp_dir "$T40"
git_init_test_repo "$T40"
(
	cd "$T40"
	mkdir -p .opencode .opencode/skills/dummy
	cat > .opencode/skills/dummy/SKILL.md <<'EOF'
---
name: dummy
description: Placeholder skill so the empty-harness guard stays quiet.
---
EOF
	setup_validator_env

	# Both pin the same version
	cat > package.json <<'EOF'
{
	"devDependencies": {
		"@opencode-ai/plugin": "1.18.4"
	}
}
EOF
	cat > .opencode/package.json <<'EOF'
{
	"dependencies": {
		"@opencode-ai/plugin": "1.18.4"
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -qF "SDK version mismatch"; then
		fail "False positive — matched versions flagged as mismatch"
	else
		pass "Matched SDK versions not flagged"
	fi
)

# ── Test 41: Command file with invalid frontmatter keys ERRORs (issue #204) ────

echo ""
echo "── Test 41: Invalid command frontmatter keys ERROR ──"
T41=$(mktemp -d)
register_temp_dir "$T41"
git_init_test_repo "$T41"
(
	cd "$T41"
	mkdir -p .opencode/commands
	setup_validator_env

	# Command carrying agent-only keys (mode/temperature/permission) — the exact
	# router.md drift class. These are silently ignored by the command runtime,
	# so the permission block is a false sandbox claim.
	cat > .opencode/commands/bad-cmd.md <<'EOF'
---
description: A command that falsely claims sandbox isolation.
mode: subagent
temperature: 0.1
permission:
  edit: deny
  bash: deny
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "invalid command frontmatter key" && echo "$output" | grep -qF "bad-cmd"; then
		pass "Caught invalid command frontmatter keys (mode/temperature/permission)"
	elif echo "$output" | grep -qF "invalid command frontmatter key"; then
		fail "Detected invalid keys but exited 0"
	else
		fail "Did not detect invalid command frontmatter keys"
	fi
)

# ── Test 42: Command file with only valid keys is not flagged (issue #204) ─────

echo "── Test 42: Valid command frontmatter keys not flagged ──"
T42=$(mktemp -d)
register_temp_dir "$T42"
git_init_test_repo "$T42"
(
	cd "$T42"
	mkdir -p .opencode/commands
	setup_validator_env

	# Command using only valid keys: description + agent + subtask.
	cat > .opencode/commands/good-cmd.md <<'EOF'
---
description: A well-formed command.
agent: build
subtask: true
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	# good-cmd must NOT be flagged for invalid keys. (Other unrelated errors —
	# e.g. missing AGENTS.md/README.md table rows — may fire and are fine; we
	# only assert the absence of the invalid-key message for good-cmd.)
	if echo "$output" | grep -F "good-cmd" | grep -qF "invalid command frontmatter key"; then
		fail "Valid command keys (agent/subtask) were falsely flagged"
	else
		pass "Valid command keys (agent/subtask) not flagged"
	fi
)

# ── Test: bare unpinned npx command array (no -y, no pin) is caught ──────────

echo ""
echo "── Test: bare unpinned npx command array is caught ──"
T_NPX1=$(mktemp -d)
register_temp_dir "$T_NPX1"
git_init_test_repo "$T_NPX1"
(
	cd "$T_NPX1"
	mkdir -p .opencode/agents .opencode/skills/dummy
	cat > .opencode/skills/dummy/SKILL.md <<'EOF'
---
name: dummy
description: Placeholder skill so the empty-harness guard stays quiet.
---
EOF
	setup_validator_env

	cat > opencode.jsonc <<'EOF'
{
	"lsp": {
		"stylelint": {
			"command": ["npx", "@stylelint/language-server", "--stdio"]
		}
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "npx command array"; then
		pass "Caught bare unpinned npx command array (issue #205)"
	else
		fail "Did not detect bare unpinned npx command array"
	fi
)

# ── Test: pinned + -y npx command array is NOT flagged ───────────────────────

echo "── Test: pinned -y npx command array not flagged ──"
T_NPX2=$(mktemp -d)
register_temp_dir "$T_NPX2"
git_init_test_repo "$T_NPX2"
(
	cd "$T_NPX2"
	mkdir -p .opencode/agents .opencode/skills/dummy
	cat > .opencode/skills/dummy/SKILL.md <<'EOF'
---
name: dummy
description: Placeholder skill so the empty-harness guard stays quiet.
---
EOF
	setup_validator_env

	cat > opencode.jsonc <<'EOF'
{
	"mcp": {
		"searxng": {
			"command": ["npx", "-y", "mcp-searxng@1.2.3"]
		}
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -F "npx command array" | grep -qF "searxng"; then
		fail "Pinned -y npx command array was falsely flagged"
	else
		pass "Pinned -y npx command array not flagged"
	fi
)

# ── Test: pinned but missing -y is caught (the -y axis is independent) ───────

echo "── Test: pinned npx without -y is caught ──"
T_NPX3=$(mktemp -d)
register_temp_dir "$T_NPX3"
git_init_test_repo "$T_NPX3"
(
	cd "$T_NPX3"
	mkdir -p .opencode/agents .opencode/skills/dummy
	cat > .opencode/skills/dummy/SKILL.md <<'EOF'
---
name: dummy
description: Placeholder skill so the empty-harness guard stays quiet.
---
EOF
	setup_validator_env

	cat > opencode.jsonc <<'EOF'
{
	"mcp": {
		"deepseek-websearch": {
			"command": ["npx", "@kyaulabs/deepseek-websearch@4.0.1"]
		}
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "missing '-y'"; then
		pass "Caught pinned npx missing -y (issue #205)"
	else
		fail "Did not detect pinned npx missing -y"
	fi
)

# ── Test 43: Skill citing a missing references/*.md file ERRORs (issue #207) ──

echo ""
echo "── Test 43: Skill missing-reference citation ERROR ──"
T43=$(mktemp -d)
register_temp_dir "$T43"
git_init_test_repo "$T43"
(
	cd "$T43"
	mkdir -p .opencode/skills/broken-skill
	setup_validator_env
	cat > .opencode/skills/broken-skill/SKILL.md <<'EOF'
---
name: broken-skill
description: A skill citing a reference that does not exist.
---
See `references/missing.md` for details.
EOF
	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?
	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "references/missing.md" && echo "$output" | grep -qF "broken-skill"; then
		pass "Caught skill citing missing references/*.md (issue #207)"
	else
		fail "Did not detect missing references/*.md citation"
	fi
)

# ── Test 44: Skill citing a present references/*.md file passes ──

echo "── Test 44: Skill present-reference citation passes ──"
T44=$(mktemp -d)
register_temp_dir "$T44"
git_init_test_repo "$T44"
(
	cd "$T44"
	mkdir -p .opencode/skills/good-skill/references
	setup_validator_env
	cat > .opencode/skills/good-skill/SKILL.md <<'EOF'
---
name: good-skill
description: A skill citing a reference that exists.
---
See `references/present.md` for details.
EOF
	cat > .opencode/skills/good-skill/references/present.md <<'EOF'
# present reference
EOF
	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true
	if echo "$output" | grep -F "good-skill" | grep -qF "references/present.md"; then
		fail "Present reference was falsely flagged"
	else
		pass "Present reference not flagged"
	fi
)

# ── Test 45: --break-system-packages in a skill code block is caught ──────────

echo ""
echo "── Test 45: --break-system-packages in skill code block is caught ──"
T45=$(mktemp -d)
register_temp_dir "$T45"
git_init_test_repo "$T45"
(
	cd "$T45"
	mkdir -p .opencode/skills/demo
	setup_validator_env

	cat > .opencode/skills/demo/SKILL.md <<'EOF'
---
name: demo
description: Demo skill.
---
## Install

```bash
pip install graphifyy -q --break-system-packages
```
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "break-system-packages"; then
		pass "Caught --break-system-packages in skill code block"
	elif echo "$output" | grep -qF "break-system-packages"; then
		fail "Detected --break-system-packages but exited 0"
	else
		fail "Did not detect --break-system-packages in skill code block"
	fi
)

# ── Test 46: --break-system-packages in prose (outside code blocks) is OK ─────

echo "── Test 46: --break-system-packages in prose not flagged ──"
T46=$(mktemp -d)
register_temp_dir "$T46"
git_init_test_repo "$T46"
(
	cd "$T46"
	mkdir -p .opencode/skills/demo
	setup_validator_env

	cat > .opencode/skills/demo/SKILL.md <<'EOF'
---
name: demo
description: Demo skill.
---
## Policy

Never use the `--break-system-packages` flag — it overrides PEP 668 (issue #208).
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -F "demo/SKILL.md" | grep -qF "break-system-packages"; then
		fail "--break-system-packages in prose was falsely flagged"
	else
		pass "--break-system-packages in prose not flagged"
	fi
)

# ── Test 47: a pinned pip install in a code block is not flagged ──────────────

echo "── Test 47: pinned pip install in code block not flagged ──"
T47=$(mktemp -d)
register_temp_dir "$T47"
git_init_test_repo "$T47"
(
	cd "$T47"
	mkdir -p .opencode/skills/demo
	setup_validator_env

	cat > .opencode/skills/demo/SKILL.md <<'EOF'
---
name: demo
description: Demo skill.
---
## Install

```bash
pip install 'graphifyy==1.2.3'
```
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -F "demo/SKILL.md" | grep -qF "break-system-packages"; then
		fail "Pinned pip install was falsely flagged"
	else
		pass "Pinned pip install not flagged"
	fi
)

# ── Test: .md agent with ungated git commit flagged (issue #210) ──────────────

echo ""
echo "── Test: .md agent (git commit: allow) flagged ──"
T_MGC1=$(mktemp -d)
register_temp_dir "$T_MGC1"
git_init_test_repo "$T_MGC1"
(
	cd "$T_MGC1"
	mkdir -p .opencode/agents
	setup_validator_env

	# tdd/resolve-merge-conflicts drift class: bash open + git commit: allow
	# (prose-gated, not permission-gated).
	cat > .opencode/agents/workhorse.md <<'EOF'
---
description: A write-capable agent that commits in a tight loop.
mode: subagent
permission:
  bash:
    "git add*": "allow"
    "git commit*": "allow"
    "git push*": "deny"
  lsp: allow
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -qF "git commit without a gate"; then
		pass "Caught .md agent with ungated git commit (issue #210)"
	else
		fail "Did not detect .md agent with ungated git commit"
	fi
)

# ── Test: .md agent with git commit: ask NOT flagged ──────────────────────────

echo "── Test: .md agent (git commit: ask) not flagged ──"
T_MGC2=$(mktemp -d)
register_temp_dir "$T_MGC2"
git_init_test_repo "$T_MGC2"
(
	cd "$T_MGC2"
	mkdir -p .opencode/agents
	setup_validator_env

	cat > .opencode/agents/gated-worker.md <<'EOF'
---
description: A write-capable agent that gates commits at ask.
mode: subagent
permission:
  bash:
    "git add*": "allow"
    "git commit*": "ask"
    "git push*": "deny"
  lsp: allow
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -F "gated-worker" | grep -qF "git commit without a gate"; then
		fail "Gated .md agent (git commit: ask) was falsely flagged"
	else
		pass "Gated .md agent (git commit: ask) not flagged"
	fi
)

# ── Test: .md agent with bash fully denied NOT flagged (skipped) ──────────────

echo "── Test: .md agent (bash catch-all deny) not flagged (skipped) ──"
T_MGC3=$(mktemp -d)
register_temp_dir "$T_MGC3"
git_init_test_repo "$T_MGC3"
(
	cd "$T_MGC3"
	mkdir -p .opencode/agents
	setup_validator_env

	# read-only posture: bash catch-all deny — no commit possible, skip.
	cat > .opencode/agents/auditor.md <<'EOF'
---
description: Read-only evaluation; does not modify files.
mode: subagent
permission:
  edit: deny
  bash:
    "*": deny
    "ls*": allow
  webfetch: deny
  task: deny
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -F "auditor" | grep -qF "git commit without a gate"; then
		fail "Fully-denied .md agent was falsely flagged"
	else
		pass "Fully-denied .md agent (catch-all deny) not flagged"
	fi
)

# ── Test: GNU-only `sed -i -e` in shell tests flagged (BSD sed parity) ───────

echo "── Test: sed -i -e (GNU-only) flagged in tests/Shell ──"
T_SED_I_E=$(mktemp -d)
register_temp_dir "$T_SED_I_E"
git_init_test_repo "$T_SED_I_E"
(
	cd "$T_SED_I_E"

	mkdir -p tests/Shell
	setup_validator_env

	cat > tests/Shell/bad_test.sh <<'BADEOF'
#!/usr/bin/env bash
set -euo pipefail
sed -i -e "s|@@A@@|one|g" -e "s|@@B@@|two|g" "$tmp_file"
BADEOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -q "sed -i -e" && echo "$output" | grep -q "bad_test.sh"; then
		pass "GNU-only sed -i -e flagged as ERROR"
	else
		fail "sed -i -e was not flagged as ERROR"
	fi
)

# ── Test: portable `sed -i.bak` in shell tests NOT flagged ────────────────────

echo "── Test: sed -i.bak (portable) not flagged in tests/Shell ──"
T_SED_BAK=$(mktemp -d)
register_temp_dir "$T_SED_BAK"
git_init_test_repo "$T_SED_BAK"
(
	cd "$T_SED_BAK"

	mkdir -p tests/Shell
	setup_validator_env

	cat > tests/Shell/ok_test.sh <<'OKEOF'
#!/usr/bin/env bash
set -euo pipefail
sed -i.bak 's/foo/bar/' "$tmp_file"
rm -f "$tmp_file.bak"
OKEOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -q "ERROR: GNU-only 'sed -i -e'"; then
		fail "Portable sed -i.bak was falsely flagged as GNU-only"
	else
		pass "Portable sed -i.bak not flagged"
	fi
)

# ── Test: sensitive-path plugin wiring — unwired pre-tool-use.ts is caught ──

echo ""
echo "── Test: sensitive-path matcher wiring — unwired pre-tool-use.ts caught ──"
T_SP1=$(mktemp -d)
register_temp_dir "$T_SP1"
git_init_test_repo "$T_SP1"
(
	cd "$T_SP1"
	mkdir -p .opencode/plugins .opencode/agents
	setup_validator_env

	# Fixture: pre-tool-use.ts exists but never imports or calls the
	# sensitive-path matcher (ADR-0047 wiring drift).
	cat > .opencode/plugins/pre-tool-use.ts <<'EOF'
import type { Plugin } from "@opencode-ai/plugin";
export const PreToolUse: Plugin = async () => { return {}; };
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "sensitive-path matcher not wired"; then
		pass "Caught unwired pre-tool-use.ts (missing sensitive-path import/call)"
	else
		fail "Did not detect unwired pre-tool-use.ts (exit ${exit_code:-0})"
	fi
)

# ── Test: AGENTS.md missing the sensitive-path Hard Boundary marker ─────────

echo ""
echo "── Test: AGENTS.md missing sensitive-path Hard Boundary marker caught ──"
T_SP2=$(mktemp -d)
register_temp_dir "$T_SP2"
git_init_test_repo "$T_SP2"
(
	cd "$T_SP2"
	mkdir -p .opencode/plugins .opencode/agents
	setup_validator_env

	# Wire the plugin so the wiring check passes — this fixture isolates the
	# AGENTS.md marker check.
	cat > .opencode/plugins/pre-tool-use.ts <<'EOF'
import { sensitiveOperandCheck } from "./sensitive-paths.ts";
export const probe = sensitiveOperandCheck;
EOF

	# AGENTS.md WITHOUT the ADR-0047 Hard Boundary marker phrase.
	cat > AGENTS.md <<'EOF'
# Test

## Commands

| Command | Purpose |
| --- | --- |
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "never read or exfiltrate credential files"; then
		pass "Caught AGENTS.md without sensitive-path Hard Boundary marker"
	else
		fail "Did not detect missing AGENTS.md Hard Boundary marker (exit ${exit_code:-0})"
	fi
)

# ── Test: reader allowance without the sensitive-path deny set is caught ────

echo ""
echo "── Test: reader allowance without sensitive-path deny set caught ──"
T_SP3=$(mktemp -d)
register_temp_dir "$T_SP3"
git_init_test_repo "$T_SP3"
(
	cd "$T_SP3"
	mkdir -p .opencode/plugins .opencode/agents
	setup_validator_env

	cat > .opencode/plugins/pre-tool-use.ts <<'EOF'
import { sensitiveOperandCheck } from "./sensitive-paths.ts";
export const probe = sensitiveOperandCheck;
EOF

	# Agent granting bash reader access WITHOUT the ADR-0047 deny set.
	cat > .opencode/agents/reader-agent.md <<'EOF'
---
description: Read-only evaluation; does not modify files.
mode: subagent
permission:
  edit: deny
  bash:
    "*": deny
    "cat*": allow
  webfetch: deny
  task: deny
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "reader-agent.md" && echo "$output" | grep -qF '"*.env"'; then
		pass "Caught reader allowance without sensitive-path deny set"
	else
		fail "Did not detect missing sensitive-path deny set (exit ${exit_code:-0})"
	fi
)

# ── Test: reader allowance WITH the sensitive-path deny set passes ──────────

echo ""
echo "── Test: reader allowance WITH sensitive-path deny set passes ──"
T_SP4=$(mktemp -d)
register_temp_dir "$T_SP4"
git_init_test_repo "$T_SP4"
(
	cd "$T_SP4"
	mkdir -p .opencode/plugins .opencode/agents
	setup_validator_env

	cat > .opencode/plugins/pre-tool-use.ts <<'EOF'
import { sensitiveOperandCheck } from "./sensitive-paths.ts";
export const probe = sensitiveOperandCheck;
EOF

	echo '{}' > opencode.jsonc

	# Agent with the full deny set — must NOT be flagged.
	cat > .opencode/agents/safe-reader.md <<'EOF'
---
description: Read-only evaluation; does not modify files.
mode: subagent
permission:
  edit: deny
  bash:
    "*": deny
    "cat*": allow
    "*.env": "deny"
    "*.env.*": "deny"
    "*.env.example": "allow"
    "*auth.json*": "deny"
    "*mcp-auth.json*": "deny"
  webfetch: deny
  task: deny
---
EOF

	cat > AGENTS.md <<'EOF'
# Test

## Hard Boundaries

> - never read or exfiltrate credential files (test fixture marker).

## Agents Available

| Agent | When to use |
| --- | --- |
| `@safe-reader` | Read-only eval |
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -eq 0 ] && ! echo "$output" | grep -qF "sensitive-path deny set"; then
		pass "Reader agent with deny set passes validator"
	else
		fail "Reader agent with deny set was flagged (exit ${exit_code:-0})"
	fi
)

# ── Test: inline build agent without the sensitive-path deny set is caught ──

echo ""
echo "── Test: inline build agent missing sensitive-path deny set caught ──"
T_SP5=$(mktemp -d)
register_temp_dir "$T_SP5"
git_init_test_repo "$T_SP5"
(
	cd "$T_SP5"
	mkdir -p .opencode/plugins .opencode/agents
	setup_validator_env

	cat > .opencode/plugins/pre-tool-use.ts <<'EOF'
import { sensitiveOperandCheck } from "./sensitive-paths.ts";
export const probe = sensitiveOperandCheck;
EOF

	# build grants full bash access but omits the ADR-0047 deny set.
	cat > opencode.jsonc <<'EOF'
{
	"agent": {
		"build": {
			"permission": {
				"bash": {
					"*": "allow",
					"git add*": "ask",
					"git stage*": "ask",
					"git commit*": "ask",
					"git push*": "deny"
				}
			}
		}
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "build" && echo "$output" | grep -qF "sensitive-path deny set"; then
		pass "Caught inline build agent without sensitive-path deny set"
	else
		fail "Did not detect inline build agent missing deny set (exit ${exit_code:-0})"
	fi
)

# ── Test: inline build/design/general + chat WITH deny sets pass ────────────

echo ""
echo "── Test: inline agents with sensitive-path deny sets pass ──"
T_SP6=$(mktemp -d)
register_temp_dir "$T_SP6"
git_init_test_repo "$T_SP6"
(
	cd "$T_SP6"
	mkdir -p .opencode/plugins .opencode/agents .opencode/skills/dummy
	setup_validator_env

	cat > .opencode/plugins/pre-tool-use.ts <<'EOF'
import { sensitiveOperandCheck } from "./sensitive-paths.ts";
export const probe = sensitiveOperandCheck;
EOF

	cat > .opencode/skills/dummy/SKILL.md <<'EOF'
---
name: dummy
description: Placeholder skill so the empty-harness guard stays quiet.
---
EOF

	cat > AGENTS.md <<'EOF'
# Test

## Hard Boundaries

> - never read or exfiltrate credential files (test fixture marker).

## Skills Available

| Skill | When to use |
| --- | --- |
| `dummy` | Guard |
EOF

	# build/design/general carry the five-pattern bash deny set; chat carries
	# env-class denies in read/glob/grep/list with .env.example allow-last.
	cat > opencode.jsonc <<'EOF'
{
	"agent": {
		"build": {
			"permission": {
				"bash": {
					"*": "allow",
					"git add*": "ask",
					"git stage*": "ask",
					"git commit*": "ask",
					"git push*": "deny",
					"*auth.json*": "deny",
					"*mcp-auth.json*": "deny",
					"*.env": "deny",
					"*.env.*": "deny",
					"*.env.example": "allow"
				}
			}
		},
		"design": {
			"permission": {
				"bash": {
					"*": "allow",
					"git add*": "ask",
					"git stage*": "ask",
					"git commit*": "ask",
					"git push*": "deny",
					"*auth.json*": "deny",
					"*mcp-auth.json*": "deny",
					"*.env": "deny",
					"*.env.*": "deny",
					"*.env.example": "allow"
				}
			}
		},
		"general": {
			"permission": {
				"bash": {
					"*": "allow",
					"git add*": "ask",
					"git stage*": "ask",
					"git commit*": "ask",
					"git push*": "deny",
					"*auth.json*": "deny",
					"*mcp-auth.json*": "deny",
					"*.env": "deny",
					"*.env.*": "deny",
					"*.env.example": "allow"
				}
			}
		},
		"chat": {
			"permission": {
				"edit": "deny",
				"bash": "deny",
				"read": {
					"*": "allow",
					"*.env": "deny",
					"*.env.*": "deny",
					"*.env.example": "allow",
					"*auth.json*": "deny",
					"*mcp-auth.json*": "deny"
				},
				"glob": {
					"*": "allow",
					"*.env*": "deny",
					"*.env.example*": "allow"
				},
				"grep": {
					"*": "allow",
					"*.env*": "deny",
					"*.env.example*": "allow"
				},
				"list": {
					"*": "allow",
					"*.env*": "deny",
					"*.env.example*": "allow"
				}
			}
		}
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -eq 0 ] && ! echo "$output" | grep -qF "sensitive-path deny set"; then
		pass "Inline agents with deny sets pass validator"
	else
		fail "Inline agents with deny sets were flagged (exit ${exit_code:-0})"
	fi
)

# ── Test: bash-object agent without the sensitive-path deny set is caught ──

echo ""
echo "── Test: bash-object agent without sensitive-path deny set caught (ADR-0048 §4) ──"
T_SP7=$(mktemp -d)
register_temp_dir "$T_SP7"
git_init_test_repo "$T_SP7"
(
	cd "$T_SP7"
	mkdir -p .opencode/plugins .opencode/agents
	setup_validator_env

	cat > .opencode/plugins/pre-tool-use.ts <<'EOF'
import { sensitiveOperandCheck } from "./sensitive-paths.ts";
export const probe = sensitiveOperandCheck;
EOF

	echo '{}' > opencode.jsonc

	cat > AGENTS.md <<'EOF'
# Test

## Hard Boundaries

> - never read or exfiltrate credential files (test fixture marker).

## Agents Available

| Agent | When to use |
| --- | --- |
| `@tdd` | Write agent |
EOF

	# Agent with a bash OBJECT but NO reader allowances and NO deny set —
	# the pre-Task-14 tdd.md drift class. ADR-0048 §4: every bash-object
	# agent must carry the deny set, not only reader-allowance agents.
	cat > .opencode/agents/tdd.md <<'EOF'
---
description: Write tests first, then implement. Edits arbitrary source files.
mode: subagent
permission:
  bash:
    "git add*": "allow"
    "git commit*": "ask"
    "git push*": "deny"
  lsp: allow
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "tdd.md" && echo "$output" | grep -qF '"*.env"'; then
		pass "Caught bash-object agent without sensitive-path deny set"
	else
		fail "Did not detect bash-object agent missing deny set (exit ${exit_code:-0})"
	fi
)

# ── Test: bash-object agent WITH the sensitive-path deny set passes ─────────

echo ""
echo "── Test: bash-object agent with sensitive-path deny set passes (ADR-0048 §4) ──"
T_SP8=$(mktemp -d)
register_temp_dir "$T_SP8"
git_init_test_repo "$T_SP8"
(
	cd "$T_SP8"
	mkdir -p .opencode/plugins .opencode/agents
	setup_validator_env

	cat > .opencode/plugins/pre-tool-use.ts <<'EOF'
import { sensitiveOperandCheck } from "./sensitive-paths.ts";
export const probe = sensitiveOperandCheck;
EOF

	echo '{}' > opencode.jsonc

	cat > AGENTS.md <<'EOF'
# Test

## Hard Boundaries

> - never read or exfiltrate credential files (test fixture marker).

## Agents Available

| Agent | When to use |
| --- | --- |
| `@tdd` | Write agent |
EOF

	# Same tdd-style agent but carrying the full ADR-0048 §4 deny set.
	cat > .opencode/agents/tdd.md <<'EOF'
---
description: Write tests first, then implement. Edits arbitrary source files.
mode: subagent
permission:
  bash:
    "git add*": "allow"
    "git commit*": "ask"
    "git push*": "deny"
    "*.env": "deny"
    "*.env.*": "deny"
    "*.env.example": "allow"
    "*auth.json*": "deny"
    "*mcp-auth.json*": "deny"
  lsp: allow
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -eq 0 ] && ! echo "$output" | grep -F "tdd.md" | grep -qF "sensitive-path deny set"; then
		pass "Bash-object agent with deny set passes validator"
	else
		fail "Bash-object agent with deny set was flagged (exit ${exit_code:-0})"
	fi
)

# ── Test: explicit external_directory allow in agent frontmatter is caught ──

echo ""
echo "── Test: explicit external_directory allow caught (ADR-0048 §4) ──"
T_SP9=$(mktemp -d)
register_temp_dir "$T_SP9"
git_init_test_repo "$T_SP9"
(
	cd "$T_SP9"
	mkdir -p .opencode/plugins .opencode/agents
	setup_validator_env

	cat > .opencode/plugins/pre-tool-use.ts <<'EOF'
import { sensitiveOperandCheck } from "./sensitive-paths.ts";
export const probe = sensitiveOperandCheck;
EOF

	echo '{}' > opencode.jsonc

	cat > AGENTS.md <<'EOF'
# Test

## Hard Boundaries

> - never read or exfiltrate credential files (test fixture marker).

## Agents Available

| Agent | When to use |
| --- | --- |
| `@extdir-agent` | External dir agent |
EOF

	# Config-level external_directory rules cannot express paths — the
	# plugin layer is the only path-level enforcement (ADR-0048 §4).
	cat > .opencode/agents/extdir-agent.md <<'EOF'
---
description: An agent with an explicit external_directory allowance.
mode: subagent
permission:
  external_directory: allow
  edit: deny
  bash: deny
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "external_directory allow" && echo "$output" | grep -qF "extdir-agent.md"; then
		pass "Caught explicit external_directory allow in agent frontmatter"
	else
		fail "Did not detect explicit external_directory allow (exit ${exit_code:-0})"
	fi
)

# ── Test: agent without external_directory allowance passes ─────────────────

echo ""
echo "── Test: agent without external_directory allow passes (ADR-0048 §4) ──"
T_SP10=$(mktemp -d)
register_temp_dir "$T_SP10"
git_init_test_repo "$T_SP10"
(
	cd "$T_SP10"
	mkdir -p .opencode/plugins .opencode/agents
	setup_validator_env

	cat > .opencode/plugins/pre-tool-use.ts <<'EOF'
import { sensitiveOperandCheck } from "./sensitive-paths.ts";
export const probe = sensitiveOperandCheck;
EOF

	echo '{}' > opencode.jsonc

	cat > AGENTS.md <<'EOF'
# Test

## Hard Boundaries

> - never read or exfiltrate credential files (test fixture marker).

## Agents Available

| Agent | When to use |
| --- | --- |
| `@extdir-agent` | External dir agent |
EOF

	# Same agent shape as the D-red fixture but WITHOUT external_directory.
	cat > .opencode/agents/extdir-agent.md <<'EOF'
---
description: An agent without any external_directory allowance.
mode: subagent
permission:
  edit: deny
  bash: deny
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -eq 0 ] && ! echo "$output" | grep -qF "external_directory allow"; then
		pass "Agent without external_directory allow passes validator"
	else
		fail "Agent without external_directory was flagged (exit ${exit_code:-0})"
	fi
)

# ── Test: chat permission objects with catch-all AFTER denies are caught ────

echo ""
echo "── Test: chat catch-all-after-denies ordering caught (ADR-0048 §3) ──"
T_SP11=$(mktemp -d)
register_temp_dir "$T_SP11"
git_init_test_repo "$T_SP11"
(
	cd "$T_SP11"
	mkdir -p .opencode/plugins .opencode/agents .opencode/skills/dummy
	setup_validator_env

	cat > .opencode/plugins/pre-tool-use.ts <<'EOF'
import { sensitiveOperandCheck } from "./sensitive-paths.ts";
export const probe = sensitiveOperandCheck;
EOF

	cat > .opencode/skills/dummy/SKILL.md <<'EOF'
---
name: dummy
description: Placeholder skill so the empty-harness guard stays quiet.
---
EOF

	cat > AGENTS.md <<'EOF'
# Test

## Hard Boundaries

> - never read or exfiltrate credential files (test fixture marker).

## Skills Available

| Skill | When to use |
| --- | --- |
| `dummy` | Guard |
EOF

	# chat's read/glob/grep/list objects in the pre-Task-14 buggy order:
	# "*": "allow" LAST, so every deny is dead under last-match-wins.
	cat > opencode.jsonc <<'EOF'
{
	"agent": {
		"chat": {
			"permission": {
				"edit": "deny",
				"bash": "deny",
				"read": {
					"*.env": "deny",
					"*.env.*": "deny",
					"*.env.example": "allow",
					"*auth.json*": "deny",
					"*mcp-auth.json*": "deny",
					"*": "allow"
				},
				"glob": {
					"*.env*": "deny",
					"*.env.example*": "allow",
					"*": "allow"
				},
				"grep": {
					"*.env*": "deny",
					"*.env.example*": "allow",
					"*": "allow"
				},
				"list": {
					"*.env*": "deny",
					"*.env.example*": "allow",
					"*": "allow"
				}
			}
		}
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "catch-all ordering" && echo "$output" | grep -qF "chat"; then
		pass "Caught chat catch-all-after-denies ordering violation"
	else
		fail "Did not detect chat catch-all ordering violation (exit ${exit_code:-0})"
	fi
)

# ── FRONTEND routing contract (ADR-0049) ─────────────────────────────────────
# The dedicated checker mechanically pins the frontend routing contract:
# subagent_depth 3, catch-all-first global skill denies, the @tdd task
# allowlist, and the terminal @frontend edit/bash/task/web/skill permissions.
# Each mutation case begins from copies of the real project manifest, OpenCode
# config, and frontend/tdd agent files, mutates one property, and asserts
# nonzero exit plus the exact stable diagnostic.

# ── Test: positive control — valid contract fixtures emit no diagnostics ────

echo ""
echo "── Test: FRONTEND contract positive control (valid fixtures) ──"
T_CTR_POS=$(mktemp -d)
register_temp_dir "$T_CTR_POS"
git_init_test_repo "$T_CTR_POS"
(
	cd "$T_CTR_POS"
	setup_contract_env

	# Run the checker directly and assert exit 0. Grepping the harness output
	# for the "frontend-contract:" prefix alone would let a checker crash
	# (unprefixed stack lines, non-zero exit) pass silently.
	exit_code=0
	output=$(node .github/scripts/check-frontend-agent-contract.js opencode.jsonc .opencode/agents/frontend.md .opencode/agents/tdd.md .opencode/skills prism 2>&1) || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "Positive control: contract checker exited $exit_code on valid fixtures (checker crash or contract drift)"
	elif echo "$output" | grep -q "frontend-contract:"; then
		fail "Positive control: valid contract fixtures emitted a frontend-contract diagnostic"
	else
		pass "Positive control: valid contract fixtures emit no frontend-contract diagnostics"
	fi
)

# ── Test: missing checker fails loud when the manifest advertises FRONTEND ──

echo "── Test: FRONTEND contract — missing checker fails loud ──"
T_CTR_MISSING=$(mktemp -d)
register_temp_dir "$T_CTR_MISSING"
git_init_test_repo "$T_CTR_MISSING"
(
	cd "$T_CTR_MISSING"
	setup_contract_env
	rm .github/scripts/check-frontend-agent-contract.js

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: checker and agent inputs must all exist"; then
		pass "Missing checker fails loud with the missing-inputs diagnostic"
	else
		fail "Missing checker did not fail loud (exit ${exit_code:-0})"
	fi
)

# ── Test: generic fixture without the FRONTEND manifest stays out of scope ──

echo "── Test: FRONTEND contract — no manifest keeps generic fixtures out of scope ──"
T_CTR_NOMANIFEST=$(mktemp -d)
register_temp_dir "$T_CTR_NOMANIFEST"
git_init_test_repo "$T_CTR_NOMANIFEST"
(
	cd "$T_CTR_NOMANIFEST"
	# Validator + checker copied, but deliberately NO prism.jsonc and a
	# DRIFTED opencode.jsonc: the manifest guard must skip the contract
	# section entirely. If the guard regressed, the checker would flag the
	# drifted fixture — so the test only passes when the guard really skips
	# (valid fixtures would have made a removed guard undetectable).
	setup_validator_env
	mkdir -p .opencode/agents
	cp "$REPO_ROOT/opencode.jsonc" opencode.jsonc
	sed -i.bak 's/"subagent_depth": 3/"subagent_depth": 2/' opencode.jsonc
	rm -f opencode.jsonc.bak
	cp "$REPO_ROOT/.opencode/agents/frontend.md" .opencode/agents/frontend.md
	cp "$REPO_ROOT/.opencode/agents/tdd.md" .opencode/agents/tdd.md

	if grep -qF '"subagent_depth": 2' opencode.jsonc; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

		if echo "$output" | grep -q "frontend-contract:"; then
			fail "Fixture without prism.jsonc was pulled into the FRONTEND contract scope"
		else
			pass "Fixture without prism.jsonc stays out of the FRONTEND contract scope"
		fi
	else
		fail "no-manifest fixture mutation did not apply — test is vacuous"
	fi
)

# ── Test: subagent_depth drift is caught ────────────────────────────────────

echo "── Test: FRONTEND contract — subagent_depth drift caught ──"
T_CTR_DEPTH=$(mktemp -d)
register_temp_dir "$T_CTR_DEPTH"
git_init_test_repo "$T_CTR_DEPTH"
(
	cd "$T_CTR_DEPTH"
	setup_contract_env
	sed -i.bak 's/"subagent_depth": 3/"subagent_depth": 2/' opencode.jsonc
	rm -f opencode.jsonc.bak

	if grep -qF '"subagent_depth": 2' opencode.jsonc; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: subagent_depth must be exactly 3"; then
			pass "Caught subagent_depth drift with the exact diagnostic"
		else
			fail "Did not detect subagent_depth drift (exit ${exit_code:-0})"
		fi
	else
		fail "subagent_depth mutation did not apply — test is vacuous"
	fi
)

# ── Test: global skill rule drift is caught ─────────────────────────────────

echo "── Test: FRONTEND contract — global skill rule drift caught ──"
T_CTR_SKILL_GLOBAL=$(mktemp -d)
register_temp_dir "$T_CTR_SKILL_GLOBAL"
git_init_test_repo "$T_CTR_SKILL_GLOBAL"
(
	cd "$T_CTR_SKILL_GLOBAL"
	setup_contract_env
	sed -i.bak 's/"accessibility": "deny"/"accessibility": "allow"/' opencode.jsonc
	rm -f opencode.jsonc.bak

	if grep -qF '"accessibility": "allow"' opencode.jsonc; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: global skill rules must allow '*' first and deny exactly the four frontend skills"; then
			pass "Caught global skill rule drift with the exact diagnostic"
		else
			fail "Did not detect global skill rule drift (exit ${exit_code:-0})"
		fi
	else
		fail "global skill rule mutation did not apply — test is vacuous"
	fi
)

# ── Test: @tdd task allowlist drift is caught ───────────────────────────────

echo "── Test: FRONTEND contract — @tdd task allowlist drift caught ──"
T_CTR_TDD_TASK=$(mktemp -d)
register_temp_dir "$T_CTR_TDD_TASK"
git_init_test_repo "$T_CTR_TDD_TASK"
(
	cd "$T_CTR_TDD_TASK"
	setup_contract_env
	sed -i.bak 's/"frontend": allow/"frontend": deny/' .opencode/agents/tdd.md
	rm -f .opencode/agents/tdd.md.bak

	if grep -qF '"frontend": deny' .opencode/agents/tdd.md; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: @tdd task rules must deny '*' first and allow only frontend"; then
			pass "Caught @tdd task allowlist drift with the exact diagnostic"
		else
			fail "Did not detect @tdd task allowlist drift (exit ${exit_code:-0})"
		fi
	else
		fail "@tdd task allowlist mutation did not apply — test is vacuous"
	fi
)

# ── Test: @frontend tier config drift is caught ─────────────────────────────

echo "── Test: FRONTEND contract — @frontend tier config drift caught ──"
T_CTR_CONFIG=$(mktemp -d)
register_temp_dir "$T_CTR_CONFIG"
git_init_test_repo "$T_CTR_CONFIG"
(
	cd "$T_CTR_CONFIG"
	setup_contract_env
	sed -i.bak 's|{env:OPENCODE_MODEL_FRONTEND}|{env:OPENCODE_MODEL_PRIMARY}|' opencode.jsonc
	rm -f opencode.jsonc.bak

	# Guard: OPENCODE_MODEL_PRIMARY appears elsewhere in the config, so scope
	# the check to the @frontend agent block — the mutation must have landed
	# there for this test to mean anything.
	if grep -A4 '"frontend": {' opencode.jsonc | grep -qF '{env:OPENCODE_MODEL_PRIMARY}'; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: @frontend config must be exactly model, variant, temperature 0.3, and hidden true with no permission override"; then
			pass "Caught @frontend tier config drift with the exact diagnostic"
		else
			fail "Did not detect @frontend tier config drift (exit ${exit_code:-0})"
		fi
	else
		fail "@frontend tier config mutation did not apply — test is vacuous"
	fi
)

# ── Test: @frontend frontmatter mode/temperature/lsp drift is caught ────────

echo "── Test: FRONTEND contract — @frontend frontmatter drift caught ──"
T_CTR_FRONTMATTER=$(mktemp -d)
register_temp_dir "$T_CTR_FRONTMATTER"
git_init_test_repo "$T_CTR_FRONTMATTER"
(
	cd "$T_CTR_FRONTMATTER"
	setup_contract_env
	sed -i.bak 's/lsp: allow/lsp: deny/' .opencode/agents/frontend.md
	rm -f .opencode/agents/frontend.md.bak

	if grep -qF 'lsp: deny' .opencode/agents/frontend.md; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: @frontend frontmatter must set mode subagent, temperature 0.3, and lsp allow and omit model and variant"; then
			pass "Caught @frontend frontmatter drift with the exact diagnostic"
		else
			fail "Did not detect @frontend frontmatter drift (exit ${exit_code:-0})"
		fi
	else
		fail "@frontend frontmatter mutation did not apply — test is vacuous"
	fi
)

# ── Test: @frontend terminal flags drift is caught ──────────────────────────

echo "── Test: FRONTEND contract — @frontend terminal flag drift caught ──"
T_CTR_TERMINAL=$(mktemp -d)
register_temp_dir "$T_CTR_TERMINAL"
git_init_test_repo "$T_CTR_TERMINAL"
(
	cd "$T_CTR_TERMINAL"
	setup_contract_env
	sed -i.bak 's/webfetch: deny/webfetch: allow/' .opencode/agents/frontend.md
	rm -f .opencode/agents/frontend.md.bak

	if grep -qF 'webfetch: allow' .opencode/agents/frontend.md; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: @frontend must deny task, webfetch, websearch, and external_directory"; then
			pass "Caught @frontend terminal flag drift with the exact diagnostic"
		else
			fail "Did not detect @frontend terminal flag drift (exit ${exit_code:-0})"
		fi
	else
		fail "@frontend terminal flag mutation did not apply — test is vacuous"
	fi
)

# ── Test: @frontend edit scoping drift is caught ────────────────────────────

echo "── Test: FRONTEND contract — @frontend edit scoping drift caught ──"
T_CTR_EDIT=$(mktemp -d)
register_temp_dir "$T_CTR_EDIT"
git_init_test_repo "$T_CTR_EDIT"
(
	cd "$T_CTR_EDIT"
	setup_contract_env
	sed -i.bak 's|"cdn/css/\*\*": deny|"cdn/css/\*\*": allow|' .opencode/agents/frontend.md
	rm -f .opencode/agents/frontend.md.bak

	if grep -qF '"cdn/css/**": allow' .opencode/agents/frontend.md; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: @frontend edit rules must keep '*' first and generated assets denied"; then
			pass "Caught @frontend edit scoping drift with the exact diagnostic"
		else
			fail "Did not detect @frontend edit scoping drift (exit ${exit_code:-0})"
		fi
	else
		fail "@frontend edit scoping mutation did not apply — test is vacuous"
	fi
)

# ── Test: @frontend bash git-write drift is caught ──────────────────────────

echo "── Test: FRONTEND contract — @frontend bash git-write drift caught ──"
T_CTR_BASH=$(mktemp -d)
register_temp_dir "$T_CTR_BASH"
git_init_test_repo "$T_CTR_BASH"
(
	cd "$T_CTR_BASH"
	setup_contract_env
	sed -i.bak 's|"git tag\*": deny|"git tag\*": allow|' .opencode/agents/frontend.md
	rm -f .opencode/agents/frontend.md.bak

	if grep -qF '"git tag*": allow' .opencode/agents/frontend.md; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: @frontend bash rules must be exactly the focused-check allowlist (catch-all deny first; only git status/diff, php -l, pest, stylelint, eslint allows; exact git-write and credential denies)"; then
			pass "Caught @frontend bash git-write drift with the exact diagnostic"
		else
			fail "Did not detect @frontend bash git-write drift (exit ${exit_code:-0})"
		fi
	else
		fail "@frontend bash git-write mutation did not apply — test is vacuous"
	fi
)

# ── Test: @frontend skill allowlist drift is caught ─────────────────────────

echo "── Test: FRONTEND contract — @frontend skill allowlist drift caught ──"
T_CTR_SKILL_FRONTEND=$(mktemp -d)
register_temp_dir "$T_CTR_SKILL_FRONTEND"
git_init_test_repo "$T_CTR_SKILL_FRONTEND"
(
	cd "$T_CTR_SKILL_FRONTEND"
	setup_contract_env
	sed -i.bak 's/accessibility: allow/accessibility: deny/' .opencode/agents/frontend.md
	rm -f .opencode/agents/frontend.md.bak

	if grep -qF 'accessibility: deny' .opencode/agents/frontend.md; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: @frontend must allow exactly the four frontend skills"; then
			pass "Caught @frontend skill allowlist drift with the exact diagnostic"
		else
			fail "Did not detect @frontend skill allowlist drift (exit ${exit_code:-0})"
		fi
	else
		fail "@frontend skill allowlist mutation did not apply — test is vacuous"
	fi
)

# ── Test: unrelated bash allow is rejected (exact allowlist) ─────────────────

echo "── Test: FRONTEND contract — unrelated bash allow rejected ──"
T_CTR_BASH_EXTRA=$(mktemp -d)
register_temp_dir "$T_CTR_BASH_EXTRA"
git_init_test_repo "$T_CTR_BASH_EXTRA"
(
	cd "$T_CTR_BASH_EXTRA"
	setup_contract_env
	awk '/npx --no-install eslint\*/ { print; print "    \"curl *\": allow"; next } { print }' .opencode/agents/frontend.md > .opencode/agents/frontend.md.tmp && mv .opencode/agents/frontend.md.tmp .opencode/agents/frontend.md

	if grep -qF '"curl *": allow' .opencode/agents/frontend.md; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: @frontend bash rules must be exactly the focused-check allowlist (catch-all deny first; only git status/diff, php -l, pest, stylelint, eslint allows; exact git-write and credential denies)"; then
			pass "Caught unrelated bash allow with the exact-allowlist diagnostic"
		else
			fail "Did not reject unrelated bash allow (exit ${exit_code:-0})"
		fi
	else
		fail "unrelated bash allow mutation did not apply — test is vacuous"
	fi
)

# ── Test: reordered bash keys are rejected (exact order) ────────────────────

echo "── Test: FRONTEND contract — reordered bash keys rejected ──"
T_CTR_BASH_REORDER=$(mktemp -d)
register_temp_dir "$T_CTR_BASH_REORDER"
git_init_test_repo "$T_CTR_BASH_REORDER"
(
	cd "$T_CTR_BASH_REORDER"
	setup_contract_env
	awk '{
		if ($0 ~ /"git add\*": deny/) { last = $0; next }
		if ($0 ~ /"git stage\*": deny/) { print $0; print last; next }
		print
	}' .opencode/agents/frontend.md > .opencode/agents/frontend.md.tmp && mv .opencode/agents/frontend.md.tmp .opencode/agents/frontend.md

	# Guard: the reorder must actually have happened — "git stage*": deny must
	# now precede "git add*": deny (the fixture ships the reverse order).
	if awk 'BEGIN{s=0; a=0} /"git stage\*": deny/{s=NR} /"git add\*": deny/{a=NR} END{exit !(s>0 && a>s)}' .opencode/agents/frontend.md; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: @frontend bash rules must be exactly the focused-check allowlist (catch-all deny first; only git status/diff, php -l, pest, stylelint, eslint allows; exact git-write and credential denies)"; then
			pass "Caught reordered bash keys with the exact-allowlist diagnostic"
		else
			fail "Did not reject reordered bash keys (exit ${exit_code:-0})"
		fi
	else
		fail "bash reorder mutation did not apply — test is vacuous"
	fi
)

# ── Test: inline frontend permission override is rejected ───────────────────

echo "── Test: FRONTEND contract — inline permission override rejected ──"
T_CTR_CONFIG_PERM=$(mktemp -d)
register_temp_dir "$T_CTR_CONFIG_PERM"
git_init_test_repo "$T_CTR_CONFIG_PERM"
(
	cd "$T_CTR_CONFIG_PERM"
	setup_contract_env
	awk '/^      "hidden": true$/ { print "      \"hidden\": true,"; print "      \"permission\": { \"task\": \"allow\" }"; next } { print }' opencode.jsonc > opencode.jsonc.tmp && mv opencode.jsonc.tmp opencode.jsonc

	# Guard: the inline permission override must have landed under @frontend
	# (the first "hidden": true block — judge's carries a trailing comma and
	# does not match the awk pattern).
	if grep -A4 '"hidden": true' opencode.jsonc | grep -qF '"permission": { "task": "allow" }'; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: @frontend config must be exactly model, variant, temperature 0.3, and hidden true with no permission override"; then
			pass "Caught inline frontend permission override with the exact-config diagnostic"
		else
			fail "Did not reject inline frontend permission override (exit ${exit_code:-0})"
		fi
	else
		fail "inline permission override mutation did not apply — test is vacuous"
	fi
)

# ── Test: model/variant in frontend frontmatter is rejected ─────────────────

echo "── Test: FRONTEND contract — frontmatter model/variant rejected ──"
T_CTR_FRONTMATTER_MODEL=$(mktemp -d)
register_temp_dir "$T_CTR_FRONTMATTER_MODEL"
git_init_test_repo "$T_CTR_FRONTMATTER_MODEL"
(
	cd "$T_CTR_FRONTMATTER_MODEL"
	setup_contract_env
	awk '/^mode: subagent$/ { print; print "model: openai/gpt-5.6-sol"; print "variant: xhigh"; next } { print }' .opencode/agents/frontend.md > .opencode/agents/frontend.md.tmp && mv .opencode/agents/frontend.md.tmp .opencode/agents/frontend.md

	if grep -qF 'model: openai/gpt-5.6-sol' .opencode/agents/frontend.md; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: @frontend frontmatter must set mode subagent, temperature 0.3, and lsp allow and omit model and variant"; then
			pass "Caught frontmatter model/variant with the exact-frontmatter diagnostic"
		else
			fail "Did not reject frontmatter model/variant (exit ${exit_code:-0})"
		fi
	else
		fail "frontmatter model/variant mutation did not apply — test is vacuous"
	fi
)

# ── Test: frontend skill metadata order drift is caught ────────────────────

echo "── Test: FRONTEND contract — frontend skill metadata order drift caught ──"
T_CTR_META_ORDER=$(mktemp -d)
register_temp_dir "$T_CTR_META_ORDER"
git_init_test_repo "$T_CTR_META_ORDER"
(
	cd "$T_CTR_META_ORDER"
	setup_contract_env
	sed -i.bak 's/^  prism.frontend-skill-order: "40"/  prism.frontend-skill-order: "5"/' .opencode/skills/accessibility/SKILL.md
	rm -f .opencode/skills/accessibility/SKILL.md.bak

	if grep -qF 'prism.frontend-skill-order: "5"' .opencode/skills/accessibility/SKILL.md; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: global skill rules must allow '*' first and deny exactly the four frontend skills" && echo "$output" | grep -qF "frontend-contract: @frontend must allow exactly the four frontend skills"; then
			pass "Caught metadata order drift with the exact global and frontend skill diagnostics"
		else
			fail "Did not detect metadata order drift (exit ${exit_code:-0})"
		fi
	else
		fail "metadata order mutation did not apply — test is vacuous"
	fi
)

# ── Test: duplicated frontend skill metadata order fails loud ───────────────

echo "── Test: FRONTEND contract — duplicated skill metadata order fails loud ──"
T_CTR_META_DUP=$(mktemp -d)
register_temp_dir "$T_CTR_META_DUP"
git_init_test_repo "$T_CTR_META_DUP"
(
	cd "$T_CTR_META_DUP"
	setup_contract_env
	sed -i.bak 's/^  prism.frontend-skill-order: "40"/  prism.frontend-skill-order: "10"/' .opencode/skills/accessibility/SKILL.md
	rm -f .opencode/skills/accessibility/SKILL.md.bak

	# Guard scoped to the accessibility file: frontend-design already ships "10".
	if [ "$(grep -cF 'prism.frontend-skill-order: "10"' .opencode/skills/accessibility/SKILL.md)" -eq 1 ]; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: cannot derive ordered frontend skills from"; then
			pass "Caught duplicate metadata order with the fail-loud source diagnostic"
		else
			fail "Did not fail loud on duplicate metadata order (exit ${exit_code:-0})"
		fi
	else
		fail "duplicate metadata mutation did not apply — test is vacuous"
	fi
)

# ── Test: missing skills root fails loud with the source diagnostic ─────────

echo "── Test: FRONTEND contract — missing skills root fails loud ──"
T_CTR_META_MISSING=$(mktemp -d)
register_temp_dir "$T_CTR_META_MISSING"
git_init_test_repo "$T_CTR_META_MISSING"
(
	cd "$T_CTR_META_MISSING"
	setup_contract_env
	rm -rf .opencode/skills

	if [ ! -d .opencode/skills ]; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: cannot derive ordered frontend skills from"; then
			pass "Missing skills root fails loud with the source diagnostic"
		else
			fail "Missing skills root did not fail loud (exit ${exit_code:-0})"
		fi
	else
		fail "skills root removal did not apply — test is vacuous"
	fi
)

# ── Test: reordered @frontend config keys pass (order-insensitive record) ───

echo "── Test: FRONTEND contract — reordered @frontend config keys pass ──"
T_CTR_CONFIG_REORDER=$(mktemp -d)
register_temp_dir "$T_CTR_CONFIG_REORDER"
git_init_test_repo "$T_CTR_CONFIG_REORDER"
(
	cd "$T_CTR_CONFIG_REORDER"
	setup_contract_env
	awk '
		/^    "frontend": \{$/ {
			print "    \"frontend\": {"
			print "      \"hidden\": true,"
			print "      \"temperature\": 0.3,"
			print "      \"variant\": \"{env:OPENCODE_VARIANT_FRONTEND}\","
			print "      \"model\": \"{env:OPENCODE_MODEL_FRONTEND}\""
			in_frontend = 1
			next
		}
		in_frontend && /^    \},$/ {
			print
			in_frontend = 0
			next
		}
		in_frontend { next }
		{ print }
	' opencode.jsonc > opencode.jsonc.tmp && mv opencode.jsonc.tmp opencode.jsonc

	# Guard: the reorder must have landed — "hidden": true now leads the block.
	if grep -A1 '"frontend": {' opencode.jsonc | grep -qF '"hidden": true'; then
		exit_code=0
		output=$(node .github/scripts/check-frontend-agent-contract.js opencode.jsonc .opencode/agents/frontend.md .opencode/agents/tdd.md .opencode/skills prism 2>&1) || exit_code=$?

		if [ "$exit_code" -eq 0 ] && [ -z "$output" ]; then
			pass "Reordered @frontend config keys pass the contract check"
		else
			fail "Reordered @frontend config keys were rejected (exit ${exit_code}, output: ${output})"
		fi
	else
		fail "frontend config reorder mutation did not apply — test is vacuous"
	fi
)

# ── Test: reinserted <app> placeholder in frontend edit rules is caught ─────

echo "── Test: FRONTEND contract — unresolved <app> edit placeholder caught ──"
T_CTR_TEMPLATE=$(mktemp -d)
register_temp_dir "$T_CTR_TEMPLATE"
git_init_test_repo "$T_CTR_TEMPLATE"
(
	cd "$T_CTR_TEMPLATE"
	setup_contract_env
	# Re-insert the shape 2a placeholder right after the edit catch-all.
	# Pre-existing <app> copies are removed first so the frontmatter never
	# carries duplicate mapping keys (the YAML parser rejects those).
	awk '
		/"<app>\/[^"]*"/ { next }
		/^    "\*": deny$/ && !inserted { print; print "    \"<app>/*.php\": allow"; inserted=1; next }
		{ print }
	' .opencode/agents/frontend.md > .opencode/agents/frontend.md.tmp && mv .opencode/agents/frontend.md.tmp .opencode/agents/frontend.md

	if [ "$(grep -cF '"<app>/*.php"' .opencode/agents/frontend.md)" -eq 1 ]; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: permission patterns must not contain unresolved template tokens"; then
			pass "Caught unresolved <app> edit placeholder with the exact template-token diagnostic"
		else
			fail "Did not detect unresolved <app> edit placeholder (exit ${exit_code:-0})"
		fi
	else
		fail "<app> placeholder mutation did not apply — test is vacuous"
	fi
)

# ── Test: build prompt loading a denied frontend skill is caught ────────────

echo "── Test: FRONTEND contract — build skill-load prompt drift caught ──"
T_CTR_PROMPT=$(mktemp -d)
register_temp_dir "$T_CTR_PROMPT"
git_init_test_repo "$T_CTR_PROMPT"
(
	cd "$T_CTR_PROMPT"
	setup_contract_env
	# Replace the @tdd → @frontend routing handoff with a direct denied
	# skill-load instruction.
	sed -i.bak 's/route through @tdd → @frontend/load the frontend-design skill first/' opencode.jsonc
	rm -f opencode.jsonc.bak

	# Guard: the bad instruction must be present and the routing handoff gone.
	if grep -qF 'load the frontend-design skill first' opencode.jsonc && ! grep -qF 'route through @tdd' opencode.jsonc; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: agent prompts must not instruct loading frontend skills denied by effective permissions"; then
			pass "Caught build skill-load prompt drift with the exact prompt diagnostic"
		else
			fail "Did not detect build skill-load prompt drift (exit ${exit_code:-0})"
		fi
	else
		fail "build skill-load prompt mutation did not apply — test is vacuous"
	fi
)

# ── Test: build handoff without @frontend is caught ─────────────────────────

echo "── Test: FRONTEND contract — build handoff missing @frontend caught ──"
T_CTR_ROUTE=$(mktemp -d)
register_temp_dir "$T_CTR_ROUTE"
git_init_test_repo "$T_CTR_ROUTE"
(
	cd "$T_CTR_ROUTE"
	setup_contract_env
	# Strip the @frontend half of the @tdd → @frontend routing handoff.
	sed -i.bak 's/@tdd → @frontend/@tdd/' opencode.jsonc
	rm -f opencode.jsonc.bak

	# Guard: the routing handoff must be gone while @tdd remains in the prompt.
	if grep -qF '@tdd' opencode.jsonc && ! grep -qF '@tdd → @frontend' opencode.jsonc; then
		output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

		if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: build prompt must route frontend work through @tdd → @frontend"; then
			pass "Caught build handoff missing @frontend with the exact route diagnostic"
		else
			fail "Did not detect build handoff missing @frontend (exit ${exit_code:-0})"
		fi
	else
		fail "build handoff mutation did not apply — test is vacuous"
	fi
)

# ── Test: protected app argument to the checker is caught ───────────────────

echo "── Test: FRONTEND contract — protected app argument rejected ──"
T_CTR_APP=$(mktemp -d)
register_temp_dir "$T_CTR_APP"
git_init_test_repo "$T_CTR_APP"
(
	cd "$T_CTR_APP"
	setup_contract_env

	if [ -f opencode.jsonc ] && [ -f .opencode/agents/frontend.md ]; then
		exit_code=0
		output=$(node .github/scripts/check-frontend-agent-contract.js opencode.jsonc .opencode/agents/frontend.md .opencode/agents/tdd.md .opencode/skills backend 2>&1) || exit_code=$?

		if [ "$exit_code" -ne 0 ] && echo "$output" | grep -qF "frontend-contract: configured app must be a safe project-local webroot name"; then
			pass "Rejected protected app argument with the exact app-safety diagnostic"
		else
			fail "Did not reject protected app argument (exit ${exit_code})"
		fi
	else
		fail "contract fixture setup failed — test is vacuous"
	fi
)

# ── Summary ─────────────────────────────────────────────────────────────────────────────

print_summary "validate-harness"
exit $?

























# vim: ft=sh sts=4 sw=4 ts=4 et :
