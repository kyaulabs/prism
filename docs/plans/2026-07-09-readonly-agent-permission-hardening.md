# Read-Only Agent Permission Hardening Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Lock down all agents advertised as read-only so their effective permissions match their prose contracts, and add a validate-harness check that prevents future drift.

**Architecture:** Three read-only agents (test-audit, code-review, semgrep) get the architect permission pattern (`edit: deny` + `bash: "*": deny` with scoped allowlist + `webfetch: deny` + `task: deny`). docs-writer is removed from Plan mode's task allowlist, making Plan mode truly read-only. A new validate-harness check scans agent descriptions for read-only keywords and asserts `edit: deny` + bash restriction. ADR-0006 documents the contract.

**Tech Stack:** Bash (validate-harness.sh), YAML frontmatter, opencode.json config, Nygard-format ADR.

## Global constraints

- Agent frontmatter follows the `writing-skills` convention: read-only agents deny `edit` and restrict `bash` to safe read patterns.
- The `architect.md` agent is the canonical read-only pattern — all read-only agents match its structure.
- `validate-harness.sh` uses `frontmatter_key` (Node.js + js-yaml) for top-level keys and raw awk+grep extraction for nested permission fields (consistent with the existing bash pattern check at lines 416-435).
- Shell tests follow the repro-first pattern in `tests/Shell/validate-harness_test.sh` — temp git repo, copy validator, assert on output.
- Every modified `.md` and `.sh` file retains its RCS header and vim modeline.
- Commits are signed (`git commit -S`) with Conventional Commits format + `Plan-by` / `Acked-by` / `Signed-off-by` footers.

---

### Task 1: Add read-only-contract check to validate-harness.sh + Tests 9-11 (TDD)

**Files:**
- Modify: `.github/scripts/validate-harness.sh` (insert new section after line 435, before the Summary section at line 437)
- Modify: `tests/Shell/validate-harness_test.sh` (append Tests 9-11 after line 392, before the Summary at line 394)

**Interfaces:**
- Consumes: `frontmatter_key` helper (line 48 of validate-harness.sh), `awk` frontmatter extraction pattern (line 427), `err`/`ok` helpers (lines 39-41)
- Produces: A new validator section that errors when an agent's description claims read-only but the agent lacks `edit: deny` or a bash catch-all deny (`"*": deny`)

**Read-only keyword set (case-insensitive):** `read-only`, `report only`, `does not modify`, `makes no code changes`, `does not auto-fix`, `does not automatically fix`

- [ ] **Step 1: Write the failing tests (Tests 9-11)**

Append this after line 392 of `tests/Shell/validate-harness_test.sh` (after Test 8's `rm -rf "$T8"`, before the `# ── Summary` section):

```bash
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

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "bash"; then
		pass "Caught read-only agent missing bash restriction"
	elif echo "$output" | grep -qF "bash"; then
		fail "Detected bash violation but exited 0"
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
rm -rf "$T11"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: FAIL — Tests 9 and 10 fail ("Did not detect..."), Test 11 passes (no violation to detect).

- [ ] **Step 3: Implement the read-only-contract check in validate-harness.sh**

Insert this new section after line 435 (after the existing bash permission pattern check, before the `# ── Summary` section at line 437):

```bash
# ── Check read-only agent permission contract ────────────────────────────────

echo "── Checking read-only agent permission contracts ──"
RO_CHECKED=0
RO_VIOLATIONS=0

# Read-only keyword set — agents whose description contains any of these
# (case-insensitive) must carry edit: deny AND a bash catch-all deny.
RO_KEYWORDS='read-only|report only|does not modify|makes no code changes|does not auto-fix|does not automatically fix'

for agent_file in "${AGENT_MD_FILES[@]}"; do
	desc=$(frontmatter_key "$agent_file" "description")

	# Skip if description doesn't claim read-only
	if [ -z "$desc" ] || ! echo "$desc" | grep -qiE "$RO_KEYWORDS"; then
		continue
	fi

	RO_CHECKED=$((RO_CHECKED + 1))
	agent_name=$(basename "$agent_file" .md)

	# Extract frontmatter text (between first two --- delimiters)
	fm=$(awk 'NR==1 && /^---$/ { fm=1; next } fm && /^---$/ { exit } fm { print }' "$agent_file")

	# Check 1: edit: deny must be present
	if ! echo "$fm" | grep -qE '^[[:space:]]*edit:[[:space:]]*"?deny"?[[:space:]]*$'; then
		err "${agent_file}: agent '${agent_name}' claims read-only in description but lacks 'edit: deny' in permission block"
		RO_VIOLATIONS=$((RO_VIOLATIONS + 1))
		continue
	fi

	# Check 2: bash must be restricted — either "bash: deny" (full deny)
	# or a catch-all deny entry ("*": deny or "*": "deny")
	bash_restricted=0
	if echo "$fm" | grep -qE '^[[:space:]]*bash:[[:space:]]*"?deny"?[[:space:]]*$'; then
		bash_restricted=1
	fi
	if echo "$fm" | grep -qE '"\*"[[:space:]]*:[[:space:]]*"?deny"?'; then
		bash_restricted=1
	fi
	if [ "$bash_restricted" -eq 0 ]; then
		err "${agent_file}: agent '${agent_name}' claims read-only in description but bash is not restricted (needs '\"*\": deny' catch-all or 'bash: deny')"
		RO_VIOLATIONS=$((RO_VIOLATIONS + 1))
	fi
done

if [ "$RO_CHECKED" -eq 0 ]; then
	warn "No read-only agents found — keyword detection may need updating"
else
	ok "${RO_CHECKED} read-only agent(s) checked, ${RO_VIOLATIONS} violation(s)"
fi
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: PASS — all 11 tests pass.

- [ ] **Step 5: Run validator against the real repo to confirm it catches the gaps (Red for Tasks 2-4)**

Run: `bash .github/scripts/validate-harness.sh`
Expected: FAIL — 3 errors for test-audit, code-review, semgrep.

- [ ] **Step 6: Commit**

```
feat(harness): add read-only agent permission contract check
```

---

### Task 2: Lock down test-audit agent

**Files:**
- Modify: `.opencode/agents/test-audit.md` (frontmatter)

- [ ] **Step 1: Add permission block to test-audit.md frontmatter**
- [ ] **Step 2: Run validator to verify test-audit is no longer flagged**
- [ ] **Step 3: Commit**

---

### Task 3: Lock down code-review agent

**Files:**
- Modify: `.opencode/agents/code-review.md` (frontmatter)

- [ ] **Step 1: Add bash allowlist to code-review.md frontmatter**
- [ ] **Step 2: Run validator to verify code-review is no longer flagged**
- [ ] **Step 3: Commit**

---

### Task 4: Lock down semgrep agent

**Files:**
- Modify: `.opencode/agents/semgrep.md` (frontmatter)

- [ ] **Step 1: Add bash allowlist to semgrep.md frontmatter**
- [ ] **Step 2: Run validator to verify all agents pass**
- [ ] **Step 3: Commit**

---

### Task 5: Remove docs-writer from Plan allowlist + update prompt + CODING_HARNESS.md

**Files:**
- Modify: `opencode.json` (task allowlist + prompt)
- Modify: `CODING_HARNESS.md` (lines 49-54)

- [ ] **Step 1: Remove docs-writer from Plan's task allowlist**
- [ ] **Step 2: Update Plan prompt to remove docs-writer delegation references**
- [ ] **Step 3: Update CODING_HARNESS.md**
- [ ] **Step 4: Run validator to confirm no regressions**
- [ ] **Step 5: Commit**

---

### Task 6: Write ADR-0006

**Files:**
- Create: `adr/0006-readonly-agent-permission-contract.md`

- [ ] **Step 1: Create the ADR file**
- [ ] **Step 2: Commit**

---

### Task 7: Final verification

- [ ] **Step 1: Run the full validator**
- [ ] **Step 2: Run the full shell test suite**
- [ ] **Step 3: Run /check**
