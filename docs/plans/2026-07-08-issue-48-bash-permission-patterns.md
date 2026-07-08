# Issue #48: Bash Permission Pattern Fix — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Close the bash permission bypass where patterns like `"git push *"`
(with a literal trailing space) cannot match the bare command form, allowing
agents to silently execute `git push`, `git commit`, and `git tag`.

**Architecture:** Fix all `" *"` space-asterisk patterns to `"*"` space-less
prefix form across `opencode.json` and all `.opencode/agents/*.md` frontmatter.
Add a harness-wide `permission.bash` block in `opencode.json` denying `git push*`
for all agents (defense-in-depth for agents without explicit bash blocks).
Add a regression check to `validate-harness.sh` + a test to
`validate-harness_test.sh` that asserts no bash permission pattern ends in `" *"`.

**Tech Stack:** bash (shell tests, validate-harness.sh), JSON, YAML frontmatter,
Node.js (frontmatter-parser.js for YAML parsing in tests).

## Global constraints

- All agent `.md` files use `permission.bash` YAML frontmatter blocks with
  quoted keys.
- JSON in `opencode.json` uses double-quoted string keys.
- Shell tests follow the existing `validate-harness_test.sh` pattern: temp
  repos, `pass()`/`fail()` helpers, `mktemp -d` + cleanup.
- No new dependencies.
- Commit: conventional commits, signed, Plan-by/Acked-by/Signed-off-by.

---

### Task 1: Add ` *` pattern regression check to validate-harness.sh (RED)

**Files:**
- Modify: `.github/scripts/validate-harness.sh`
- Modify: `tests/Shell/validate-harness_test.sh`

**Interfaces:**
- Produces: A new `── Checking bash permission patterns ──` section in
  validate-harness.sh that errors on any `" *"` pattern. Test 8 in
  validate-harness_test.sh verifies the check works.

- [ ] **Step 1: Add the ` *` pattern check to validate-harness.sh**

Insert a new section BEFORE the "── Summary ──" line (before line 404),
after the vacuous-pass guard. Use `awk` to extract frontmatter from agent
`.md` files (first two `---` delimiters) and `grep` for patterns.

```bash
# ── Check bash permission patterns ────────────────────────────────────────────

echo "── Checking bash permission patterns ──"

# Check opencode.json for bash permission keys ending in " *"
json_bad=$(grep -noE '"[^"]* \*"\s*:' "${REPO_ROOT}/opencode.json" 2>/dev/null) || true
if [ -n "$json_bad" ]; then
	while IFS= read -r line; do
		err "opencode.json:${line%%:*}: bash permission pattern ends in ' *' (cannot match bare command): $(echo "$line" | sed 's/^[0-9]*://')"
	done <<< "$json_bad"
fi

# Check agent .md file frontmatter for bash permission keys ending in " *"
AGENTS_DIR_LOCAL="${HARNESS_DIR}/agents"
shopt -s nullglob
AGENT_MD_FILES=( "${AGENTS_DIR_LOCAL}"/*.md )
shopt -u nullglob

if [ ${#AGENT_MD_FILES[@]} -eq 0 ]; then
	warn "No agent files found in ${AGENTS_DIR_LOCAL}/"
else
	for agent_file in "${AGENT_MD_FILES[@]}"; do
		# Extract frontmatter only (lines between first and second ---)
		fm=$(awk 'NR==1 && /^---$/ { fm=1; next } fm && /^---$/ { exit } fm { print }' "$agent_file")
		bad=$(echo "$fm" | grep -noE '"[^"]* \*"' 2>/dev/null) || true
		if [ -n "$bad" ]; then
			while IFS= read -r line; do
				err "${agent_file}:${line%%:*}: bash permission pattern ends in ' *' (cannot match bare command): $(echo "$line" | sed 's/^[0-9]*://')"
			done <<< "$bad"
		fi
	done
fi
```

- [ ] **Step 2: Add Test 8 to validate-harness_test.sh**

Insert BEFORE the "── Summary ──" section (before line 355). The test creates
a temp repo with a `"git push *"` pattern in an agent file and asserts the
validator catches it.

```bash
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
	mkdir -p .github/scripts
	cp "${REPO_ROOT}/.github/scripts/frontmatter-parser.js" .github/scripts/frontmatter-parser.js 2>/dev/null || true

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
```

- [ ] **Step 3: Run validate-harness_test.sh — Test 8 should PASS (check works)**

```bash
bash tests/Shell/validate-harness_test.sh
```

Expected: Test 8 PASSES (the check catches the buggy pattern in the temp repo).

- [ ] **Step 4: Run validate-harness.sh against the real repo — should FAIL (RED)**

```bash
bash .github/scripts/validate-harness.sh
```

Expected: FAIL with errors about patterns ending in ` *` in opencode.json,
tdd.md, resolve-merge-conflicts.md, architect.md, and debug.md. This is the
RED state — the buggy patterns exist in the real repo.

- [ ] **Step 5: Commit (RED state)**

```bash
git add .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh docs/plans/2026-07-08-issue-48-bash-permission-patterns.md
git commit -S -m $'test(harness): add bash permission pattern regression check\n\nAdd a validate-harness.sh check that scans opencode.json and all agent\nfrontmatter for bash permission patterns ending in \" *\" — patterns\nthat cannot match the bare command form (e.g., \"git push *\" misses\nbare \"git push\").\n\nAdd Test 8 to validate-harness_test.sh verifying the check catches a\nbuggy pattern in agent frontmatter.\n\nRefs: #48\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 2: Fix all `" *"` patterns to `"*"` (GREEN)

**Files:**
- Modify: `opencode.json`
- Modify: `.opencode/agents/tdd.md`
- Modify: `.opencode/agents/resolve-merge-conflicts.md`
- Modify: `.opencode/agents/architect.md`
- Modify: `.opencode/agents/debug.md`

**Interfaces:**
- Consumes: The validate-harness.sh regression check from Task 1 (currently RED).
- Produces: All bash permission patterns use space-less prefix form, validate-harness.sh passes.

- [ ] **Step 1: Fix opencode.json — add top-level permission.bash block**

Add a top-level `permission` key after `"model"` and before `"instructions"`:

```json
"permission": {
  "bash": {
    "git push*": "deny"
  }
},
```

The build agent bash block (lines 13-19) — fix patterns:
Change:
```json
"git add *": "ask",
"git stage *": "deny",
"git commit *": "ask",
"git push *": "deny"
```
To:
```json
"git add*": "ask",
"git stage*": "deny",
"git commit*": "ask",
"git push*": "deny"
```

- [ ] **Step 2: Fix .opencode/agents/tdd.md — lines 9-12**

Change:
```yaml
"git add *": "allow"
"git commit *": "allow"
"git push *": "deny"
"git tag *": "deny"
```
To:
```yaml
"git add*": "allow"
"git commit*": "allow"
"git push*": "deny"
"git tag*": "deny"
```

- [ ] **Step 3: Fix .opencode/agents/resolve-merge-conflicts.md — lines 9-12**

Same change as tdd.md:
```yaml
"git add*": "allow"
"git commit*": "allow"
"git push*": "deny"
"git tag*": "deny"
```

- [ ] **Step 4: Fix .opencode/agents/architect.md — lines 10-20**

Change all `" *"` patterns:
```yaml
bash:
  "*": deny
  "ls*": allow
  "cat*": allow
  "tail*": allow
  "head*": allow
  "grep*": allow
  "find*": allow
  "git log*": allow
  "git show*": allow
  "git status": allow
  "git diff*": allow
```

(`"git status"` has no wildcard — stays as-is.)

- [ ] **Step 5: Fix .opencode/agents/debug.md — lines 12-40**

Change all `" *"` patterns (11 patterns). The following patterns have no
wildcard and stay as-is: `"php -v"`, `"git status"`, `"git stash list"`,
`"gh issue list"`. The pattern `"php prototypes/*"` ends in `/*` not ` *`
and stays as-is.

```yaml
bash:
  "*": "deny"
  "ls*": "allow"
  "cat*": "allow"
  "tail*": "allow"
  "head*": "allow"
  "grep*": "allow"
  "find*": "allow"
  "which*": "allow"
  "php -l*": "allow"
  "php -v": "allow"
  "php vendor/bin/pest*": "allow"
  "php prototypes/*": "allow"
  "curl*": "ask"
  "git checkout*": "deny"
  "git log*": "allow"
  "git diff*": "allow"
  "git show*": "allow"
  "git status": "allow"
  "git stash list": "allow"
  "git stash show*": "allow"
  "git blame*": "allow"
  # git bisect mutates the working tree by checking out old commits.
  # Use only for major regressions between known-good and known-bad commits.
  "git bisect*": "allow"
  "gh*": "deny"
  "gh issue list": "allow"
  "gh issue list*": "allow"
  "gh issue view*": "allow"
```

- [ ] **Step 6: Run validate-harness.sh — should PASS (GREEN)**

```bash
bash .github/scripts/validate-harness.sh
```

Expected: PASS — no ` *` patterns found, 0 errors.

- [ ] **Step 7: Run validate-harness_test.sh — should PASS**

```bash
bash tests/Shell/validate-harness_test.sh
```

Expected: All tests PASS (Test 8 verifies the check catches buggy patterns,
but the real repo now has none).

- [ ] **Step 8: Commit (GREEN state)**

```bash
git add opencode.json .opencode/agents/tdd.md .opencode/agents/resolve-merge-conflicts.md .opencode/agents/architect.md .opencode/agents/debug.md
git commit -S -m $'fix(security): close bash permission bypass for bare git push/commit/tag\n\nFix all bash permission patterns ending in \" *\" to use space-less\nprefix form (\"*\" per vendored permissions.mdx:97-99). Patterns like\n\"git push *\" required a literal trailing space and could not match\nthe bare command form, allowing agents to silently:\n  - git push  (build, tdd, resolve-merge-conflicts, code-review,\n    semgrep, utility agents)\n  - git commit (build bypassed \"ask\" prompt)\n  - git tag   (tdd, resolve-merge-conflicts bypassed \"deny\")\n  - git add/stage (build bypassed \"ask\"/\"deny\")\n\nAdd a top-level permission.bash block with \"git push*\": \"deny\" for\nharness-wide defense-in-depth — protects agents without explicit bash\nblocks (code-review, semgrep, general, explore, etc.).\n\nFix architect and debug allow-patterns (\"ls *\", \"cat *\", \"grep *\",\netc.) for consistency; the deny catch-all already blocked their bare\nforms, but the new prefix form also allows bare invocations.\n\nCloses: #48\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 3: Document the space-less prefix convention (REFACTOR)

**Files:**
- Modify: `.opencode/skills/writing-skills/SKILL.md`

**Interfaces:**
- Consumes: The fixed patterns from Task 2 (now using space-less prefix form).
- Produces: Documented convention that all bash permission patterns use
  space-less prefix form (e.g., `"git push*"`, not `"git push *"`).

- [ ] **Step 1: Add a gotchas entry to writing-skills/SKILL.md**

Add to the existing Gotchas section (after line 155, before line 157):

```
- *Bash permission pattern ends in " *" (space-asterisk)* — the vendored
  OpenCode permission semantics treat space as a literal character
  (permissions.mdx:99). `"git push *"` matches `git push origin main` but
  NOT bare `git push` — the bare form falls through to the catch-all.
  Always use the space-less prefix form: `"git push*"`, `"ls*"`, `"grep*"`.
  The `validate-harness.sh` regression check enforces this.
```

- [ ] **Step 2: Update the permission block example in the Agent frontmatter section**

Change the example pattern in the Agent frontmatter section (line 46):
```
    "<pattern>": allow
```
To:
```
    "git status*": allow      # space-less prefix form — NEVER "git status *"
```

- [ ] **Step 3: Commit**

```bash
git add .opencode/skills/writing-skills/SKILL.md
git commit -S -m $'docs(skills): document space-less prefix convention for bash permissions\n\nAdd a gotchas entry explaining that bash permission patterns must use\nthe space-less prefix form (\"git push*\", not \"git push *\") because\npermissions.mdx treats space as a literal character — the \" *\" form\ncannot match the bare command and falls through to the catch-all.\n\nUpdate the Agent frontmatter example to show correct form.\n\nRefs: #48\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Verification

After all tasks are committed:

- [ ] Run `bash .github/scripts/validate-harness.sh` → PASS
- [ ] Run `bash tests/Shell/validate-harness_test.sh` → all tests PASS
- [ ] Run `/check` → PASS
- [ ] Run `@code-review` on staged changes
- [ ] File a follow-up issue for the same fix in the aurora submodule
