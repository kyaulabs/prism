# AGENTS.md Index Cross-Check Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Add a contract test to `validate-harness.sh` that cross-checks all
three AGENTS.md index tables (Skills, Agents, Commands) against their
`.opencode/` directories, then add the missing `/doctor` row.

**Architecture:** Extend `validate-harness.sh` with a new "AGENTS.md index
cross-check" section placed after the existing cross-references block (before
the vacuous-pass guard). Use awk heading-driven table extraction and
`grep -qxF` exact-line name membership to avoid substring false-positives.
Forward check (filesystem → table) as errors; reverse check (table →
filesystem) as warnings. TDD via `tests/Shell/validate-harness_test.sh` using
the existing temp-git-repo repro pattern.

**Tech Stack:** Bash 4+, awk, `grep -qxF`, existing `err()`/`warn()` helpers.

## Global constraints

- All shell code must pass `shellcheck`.
- Bash 4+ associative arrays already in use — no new external dependencies.
- AGENTS.md tables are heading-driven (heading text is the contract).
- Table first-column name extraction skips header + separator rows (first two `|` lines).
- Forward check uses `err()` (increments `ERRORS`, CI fails).
- Reverse check uses `warn()` (increments `WARNINGS`, CI passes).

---
````

### Task 1: Add shell regression tests for the cross-check

**Files:**
- Modify: `tests/Shell/validate-harness_test.sh` — append Tests 5, 6, 7
  before the summary section (after Test 4's cleanup, before `# ── Summary ──`)

**Interfaces:**
- Consumes: `REAL_VALIDATOR` path var (already defined), `pass()`/`fail()` helpers
- Produces: Three new tests that will fail against the current validator (RED state)

- [ ] **Step 1: Identify insertion point**

Read `tests/Shell/validate-harness_test.sh` — the insertion point is after line
`rm -rf "$T4"` (end of Test 4), before `# ── Summary ──`. Tests 1–4 are
unchanged.

- [ ] **Step 2: Write Test 5 — Forward check errors on missing table entry**

Append to `tests/Shell/validate-harness_test.sh`:

```bash
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
```

- [ ] **Step 3: Write Test 6 — Deleting a row from a complete table fails**

Append after Test 5:

```bash
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

	# Delete cmd-b row from table
	sed -i '/\/cmd-b/d' AGENTS.md

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
```

- [ ] **Step 4: Write Test 7 — Reverse check warns on stale table row**

Append after Test 6:

```bash
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

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -eq 0 ] && echo "$output" | grep -q "WARN.*cmd-b"; then
		pass "Reverse check warns on stale table row, exits 0"
	elif [ "${exit_code:-0}" -ne 0 ]; then
		fail "Reverse check should be warning, not error (exited non-zero)"
	else
		fail "Reverse check did not warn on stale table row"
	fi
)
rm -rf "$T7"
```

- [ ] **Step 5: Run tests to verify RED state**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: Tests 1–4 PASS, Tests 5–7 FAIL (validator lacks cross-check logic).
Tests 5 and 6 output `FAIL` because the validator exits 0 (no errors when checking
the temp repo with no cross-check). Test 7 outputs `FAIL` because no warning
is emitted.

- [ ] **Step 6: Commit**

```bash
git add tests/Shell/validate-harness_test.sh
git commit -S -m $'test(harness): add regression tests for AGENTS.md index cross-check\n\nAdd Tests 5, 6, 7 to validate-harness_test.sh covering forward-check\nerrors (missing table entry + deleted row) and reverse-check warnings\n(stale table row without corresponding file). Tests fail against the\ncurrent validator — RED state for TDD.\n\nRefs: #42\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 2: Implement the cross-check in validate-harness.sh

**Files:**
- Modify: `.github/scripts/validate-harness.sh` — insert new section after
  the cross-references block (after line 294, `ok "${CROSSREF_COUNT} cross-reference(s) verified"`),
  before the vacuous-pass guard (current line 296, `# ── Guard: fail on vacuous pass`).

**Interfaces:**
- Consumes: `REPO_ROOT`, `HARNESS_DIR`, `SKILLS_DIR`, `AGENTS_DIR`, `COMMANDS_DIR` (already defined)
- Consumes: `err()`, `warn()`, `ok()` helpers (already defined)
- Produces: new `AGENTS_MD` var, `extract_table()` helper, `extract_first_column_names()` helper,
  forward check (errors), reverse check (warnings)

- [ ] **Step 1: Insert the section header and AGENTS_MD guard**

Insert after `ok "${CROSSREF_COUNT} cross-reference(s) verified"` (current line 294):

```bash

# ── AGENTS.md index cross-check ──────────────────────────────────────────────

echo "── Checking AGENTS.md index tables ──"
AGENTS_MD="${REPO_ROOT}/AGENTS.md"

if [ ! -f "$AGENTS_MD" ]; then
	err "AGENTS.md not found at $AGENTS_MD — cannot validate index tables"
else
	INDEX_OK=0
	INDEX_WARN=0
```

- [ ] **Step 2: Insert the extract_table helper**

Continue inside the `else` block:

```bash

	# Extract markdown table rows under a given ## heading.
	# Matches the heading line exactly ($0 == "## " h), then collects all
	# | -prefixed rows until the next ## heading or EOF.
	# Non-| lines (description paragraphs between heading and table) are
	# silently skipped.
	extract_table() {
		local heading="$1"
		awk -v h="$heading" '
			$0 == "## " h { in_section = 1; next }
			in_section && /^## / { exit }
			in_section && /^\|/ { print }
		' "$AGENTS_MD"
	}

	# Extract first-column names from a pipe-delimited markdown table (stdin).
	# Splits on |, takes field 2, trims whitespace, strips backtick/@//
	# decoration. Skips the first two rows (header + separator) so table
	# header labels like "Skill" or "Command" are not treated as names.
	extract_first_column_names() {
		awk -F'|' '
			/^\|/ {
				line_num++
				if (line_num <= 2) next
				cell = $2
				gsub(/^[ \t]+|[ \t]+$/, "", cell)
				gsub(/^`|`$/, "", cell)
				gsub(/^@/, "", cell)
				gsub(/^\//, "", cell)
				if (cell != "") print cell
			}
		'
	}
```

- [ ] **Step 3: Insert the forward check (filesystem → table, errors)**

Continue after the helper definitions:

```bash

	# ── Forward check: every filesystem entry must have a table row ──────────

	# Commands table
	CMD_TABLE_NAMES=$(extract_table "Commands" | extract_first_column_names)
	for cmd_file in "${COMMANDS_DIR}"/*.md; do
		[ -f "$cmd_file" ] || continue
		cmd_name=$(basename "$cmd_file" .md)
		if ! echo "$CMD_TABLE_NAMES" | grep -qxF "$cmd_name"; then
			err "AGENTS.md Commands table missing entry for '/${cmd_name}' (file: .opencode/commands/${cmd_name}.md)"
		fi
	done

	# Agents Available table
	AGENT_TABLE_NAMES=$(extract_table "Agents Available" | extract_first_column_names)
	for agent_file in "${AGENTS_DIR}"/*.md; do
		[ -f "$agent_file" ] || continue
		agent_name=$(basename "$agent_file" .md)
		if ! echo "$AGENT_TABLE_NAMES" | grep -qxF "$agent_name"; then
			err "AGENTS.md Agents Available table missing entry for '@${agent_name}' (file: .opencode/agents/${agent_name}.md)"
		fi
	done

	# Skills Available table
	shopt -s nullglob
	SKILL_TABLE_NAMES=$(extract_table "Skills Available" | extract_first_column_names)
	for skill_dir in "${SKILLS_DIR}"/*/; do
		[ -d "$skill_dir" ] || continue
		skill_name=$(basename "$skill_dir")
		if ! echo "$SKILL_TABLE_NAMES" | grep -qxF "$skill_name"; then
			err "AGENTS.md Skills Available table missing entry for '\`${skill_name}\`' (dir: .opencode/skills/${skill_name}/)"
		fi
	done
	shopt -u nullglob
```

- [ ] **Step 4: Insert the reverse check (table → filesystem, warnings)**

Continue after the forward check:

```bash

	# ── Reverse check: every table row must have a filesystem counterpart ────

	for name in $CMD_TABLE_NAMES; do
		if [ ! -f "${COMMANDS_DIR}/${name}.md" ]; then
			warn "AGENTS.md Commands table has entry '/${name}' but no file at .opencode/commands/${name}.md"
		fi
	done

	for name in $AGENT_TABLE_NAMES; do
		if [ ! -f "${AGENTS_DIR}/${name}.md" ]; then
			warn "AGENTS.md Agents Available table has entry '@${name}' but no file at .opencode/agents/${name}.md"
		fi
	done

	for name in $SKILL_TABLE_NAMES; do
		if [ ! -d "${SKILLS_DIR}/${name}" ]; then
			warn "AGENTS.md Skills Available table has entry '\`${name}\`' but no directory at .opencode/skills/${name}/"
		fi
	done

	# Count how many were added by this section
	INDEX_OK=1
```

- [ ] **Step 5: Close the else block and add ok status**

```bash

fi

if [ -n "${INDEX_OK:-}" ] && [ "${INDEX_OK:-0}" -eq 1 ]; then
	ok "AGENTS.md index tables cross-checked"
fi
```

- [ ] **Step 6: Run shell regression tests to verify GREEN**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: All tests PASS — Tests 1–4 (existing) and Tests 5–7 (new) all green.
The validator now catches missing entries (forward check) and warns on stale
rows (reverse check).

- [ ] **Step 7: Verify real repo detects the missing /doctor row**

Run: `bash .github/scripts/validate-harness.sh` (on the real repo without /doctor yet)
Expected: FAIL (exit non-zero) with error message:
`AGENTS.md Commands table missing entry for '/doctor' (file: .opencode/commands/doctor.md)`
This confirms the validator works on real data. The next task adds the row to
resolve it.

- [ ] **Step 8: Commit**

```bash
git add .github/scripts/validate-harness.sh
git commit -S -m $'test(harness): add AGENTS.md index cross-check to validate-harness\n\nExtend validate-harness.sh with a contract test that cross-checks all\nthree AGENTS.md index tables (Skills, Agents, Commands) against their\n.opencode/ directories. Forward check (filesystem -> table) reports\nerrors for entries missing from the index; reverse check (table ->\nfilesystem) reports warnings for stale rows.\n\nUses awk heading-driven table extraction and grep -qxF exact-line\nmembership to avoid substring false-positives. Skips header row and\nseparator row in first-column extraction.\n\nRefs: #42\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 3: Add /doctor row to AGENTS.md Commands table

**Files:**
- Modify: `AGENTS.md` — insert row after line 247 (`| \`/setup\` | ...`)

**Interfaces:**
- None (pure doc change)

This is the fix for the drift detected in Task 2 Step 7. Adding this row
makes `validate-harness.sh` pass on the real repo.

- [ ] **Step 1: Insert the /doctor row**

After `AGENTS.md` line 247:

```
| `/setup` | Interactive project configurator — replaces `<app>`/`<domain>`/`[EMAIL]` placeholders across the harness, sets accent theme |
```

Insert:

```
| `/doctor` | Toolchain health check — verifies dev tools are installed at version floors; reports PASS/FAIL/SKIPPED table + go/no-go summary |
```

The markdown table row is:

```
| `/doctor` | Toolchain health check — verifies dev tools are installed at version floors; reports PASS/FAIL/SKIPPED table + go/no-go summary |
```

- [ ] **Step 2: Run real-repo validator to verify GREEN**

Run: `bash .github/scripts/validate-harness.sh`
Expected: PASS (exit 0). Output includes:
```
── Checking AGENTS.md index tables ──
  OK:    AGENTS.md index tables cross-checked
```
And no error about `/doctor`.

- [ ] **Step 3: Run full shell test suite**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: All tests PASS (Tests 1–7 green).

- [ ] **Step 4: Run CI-simulating end-to-end check**

```bash
bash .github/scripts/validate-harness.sh && echo "PASS" || echo "FAIL"
bash tests/Shell/validate-harness_test.sh && echo "PASS" || echo "FAIL"
```

Both must output `PASS`.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -S -m $'docs(harness): add /doctor command to AGENTS.md Commands table\n\nThe /doctor command exists in .opencode/commands/doctor.md but was\nmissing from the AGENTS.md Commands table — the index agents load in\nevery session. The validate-harness cross-check (Task 2) now detects\nthis drift class; this commit adds the missing row to satisfy it.\n\nFixes: #42\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 4: Verification & cleanup

**Files:**
- None (verification only)

- [ ] **Step 1: Run /check-equivalent gates**

Since this is a shell-only change (no PHP/JS/SCSS touched), run:

```bash
# Harness validation
bash .github/scripts/validate-harness.sh

# Shell regression tests
bash tests/Shell/validate-harness_test.sh

# Shellcheck on changed files
shellcheck .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh
```

Expected: All three pass clean.

- [ ] **Step 2: Run verify AGENTS.md Commands table count**

Manually confirm the Commands table has 13 rows:

```bash
sed -n '/^## Commands/,/^$/{ /^| \//p }' AGENTS.md | wc -l
```

Expected: `13` (12 existing + 1 `/doctor`).

- [ ] **Step 3: Run `@code-review`**

Dispatch the `@code-review` agent on staged changes before push.

```bash
@code-review
```

- [ ] **Step 4: Verify acceptance criteria**

| Criterion | Check |
|---|---|
| AGENTS.md lists all 13 commands | `sed -n '/^## Commands/,/^$/{ /^\| \//p }' AGENTS.md \| wc -l` → 13 |
| Deleting a row from AGENTS.md makes validator fail | Test 6 covers this |
| Adding a file without a table row makes validator fail | Test 5 covers this |
| Adding a table row without a file produces a warning | Test 7 covers this |
| Real repo passes `validate-harness.sh` | Step 2 of this task |
