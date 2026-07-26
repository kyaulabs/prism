# router.md Invalid Frontmatter Keys Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Remove `router.md`'s invalid command frontmatter keys (which
falsely advertise a security sandbox the OpenCode runtime silently ignores)
and add a `validate-harness.sh` check that ERRORs on any invalid command
frontmatter key, with TDD coverage.

**Architecture:** Two vertical slices. Task 1 adds the validator check first
(TDD against a synthetic fixture) so the regression guard exists before the
production file is touched. Task 2 fixes `router.md` itself — strip to
`description:` only and add a prose note that the router runs with the
caller's full permissions. The validator allowlist for markdown command files
is `{description, agent, model, subtask}` per the vendored OpenCode command
schema (`.opencode/skills/opencode-docs/docs/commands.mdx`); `template` is
the body in markdown, not a frontmatter key, and `mode`/`temperature`/
`permission` are agent-only keys that commands silently ignore.

**Tech Stack:** Bash (`validate-harness.sh`), shell repro tests
(`tests/Shell/validate-harness_test.sh` + `tests/Shell/lib/test_helpers.sh`),
Markdown frontmatter.

**Issue:** #204 (Type: Bug → commit type `fix`).

## Global constraints

- Markdown command frontmatter allowlist: `description`, `agent`, `model`,
  `subtask` — nothing else is valid (vendored schema).
- The new check applies ONLY to `.opencode/commands/*.md`. Agent files
  (`.opencode/agents/*.md`) legitimately use `mode`/`permission` and MUST NOT
  be flagged by this check.
- Invalid command keys are an ERROR (not a WARN): a frontmatter block that
  looks like a security control but is silently ignored is a correctness
  defect and must fail the gate.
- Signed commits (`git commit -S`), Conventional Commits format, footers in
  the order `Fixes/Refs: #NN` → `Authored-by` → `Tested-by` → `Signed-off-by`
  (ADR-0010). Use `$'...\n...'` ANSI-C quoting (ADR-0025).
- No new dependencies. Bash only; must be shellcheck-clean.
- New `.sh` lines follow existing tab indentation (tab-stop 4) in
  `validate-harness.sh`.

---

### Task 1: validate-harness check for invalid command frontmatter keys

**Files:**
- Modify: `.github/scripts/validate-harness.sh` — add `check_command_frontmatter_keys()` helper near the other frontmatter helpers (after `check_required_field`, ~line 145) and call it inside the command-validation loop (~line 259, after the `description` check).
- Test: `tests/Shell/validate-harness_test.sh` — append Test 41 (negative) and Test 42 (positive) before the `print_summary` block (~line 1801).

**Interfaces:**
- Consumes: the existing `err()` helper (`.github/scripts/validate-harness.sh:66`) which prints `  ERROR: <msg>` to stderr and increments `ERRORS`; a non-zero `ERRORS` count makes the script exit non-zero. Also consumes the established frontmatter-extraction awk idiom used at lines 656/688.
- Produces: a new function `check_command_frontmatter_keys <file>` that ERRORs once per invalid top-level frontmatter key. Later (Task 2) running the validator on the real repo confirms `router.md` is clean.

- [ ] **Step 1: Write the failing tests (Test 41 + Test 42)**

Append to `tests/Shell/validate-harness_test.sh`, immediately before the
`# ── Summary ──` block (currently ~line 1801):

```bash
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
```

- [ ] **Step 2: Run the new tests to verify they fail (Red)**

Run: `bash tests/Shell/validate-harness_test.sh 2>&1 | grep -E "Test 4[12]|PASS|FAIL"`
Expected: Test 41 FAIL ("Did not detect invalid command frontmatter keys" — the
check does not exist yet); Test 42 PASS (no false positive, trivially).

- [ ] **Step 3: Implement `check_command_frontmatter_keys()`**

In `.github/scripts/validate-harness.sh`, add this helper immediately after
the `check_required_field()` function (which ends ~line 145, before the
`# ── Validate skills ──` section). Match the file's tab indentation:

```bash
# Validate that a command file's frontmatter uses only command-legal keys.
# Markdown command files support: description, agent, model, subtask (per the
# vendored OpenCode command schema). mode/temperature/permission are agent-only
# keys that the command runtime silently ignores — a frontmatter block that
# looks like a security sandbox but does nothing is a correctness defect.
# Usage: check_command_frontmatter_keys <file>
check_command_frontmatter_keys() {
	local file="$1"
	local fm keys key
	local allowed=" description agent model subtask "
	# Extract frontmatter (between first two ---) and collect TOP-LEVEL keys
	# only — column-1 "key:" lines. Indented block children (e.g. under
	# permission:) are values of their parent key, not separate keys.
	fm=$(awk 'NR==1 && /^---$/ { fm=1; next } fm && /^---$/ { exit } fm { print }' "$file")
	keys=$(echo "$fm" | grep -oE '^[A-Za-z_][A-Za-z0-9_-]*:' 2>/dev/null) || true
	while IFS= read -r key; do
		[ -z "$key" ] && continue
		key="${key%:}"   # strip trailing colon
		if ! echo "$allowed" | grep -qF " $key "; then
			err "${file}: invalid command frontmatter key '${key}' — commands allow only: description, agent, model, subtask (issue #204)"
		fi
	done <<< "$keys"
}
```

- [ ] **Step 4: Wire the check into the command-validation loop**

In `.github/scripts/validate-harness.sh`, inside the `for cmd_file in
"${CMD_FILES[@]}"` loop (~lines 248–264), add the call right after the
`description` required-field check (after line 259, before the `# Register the
command name` comment):

```bash
		# Validate frontmatter keys against the command allowlist (issue #204)
		check_command_frontmatter_keys "$cmd_file"
```

- [ ] **Step 5: Run the new tests to verify they pass (Green)**

Run: `bash tests/Shell/validate-harness_test.sh 2>&1 | grep -E "Test 4[12]|invalid command"`
Expected: Test 41 PASS, Test 42 PASS.

- [ ] **Step 6: Run the FULL shell suite to confirm no regression**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: summary reports all PASS (Tests 1–42). Existing tests that create
command fixtures (5, 6, 12, 13, 14, 16, 19) use only `description:` (and
optionally valid keys) so they are unaffected.

- [ ] **Step 7: shellcheck the modified script**

Run: `shellcheck .github/scripts/validate-harness.sh`
Expected: no new warnings/errors from the added function (SC2086 on
`echo "$allowed" | grep` is intentional fixed-string match; if shellcheck flags
it, the existing file already suppresses similarly — match the surrounding style).

- [ ] **Step 8: Commit (referencing the issue, non-closing)**

```bash
git add .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh
git commit -S -m $'fix(harness): flag invalid command frontmatter keys\n\nAdd check_command_frontmatter_keys() to validate-harness.sh: command\nmarkdown files may use only description, agent, model, subtask. mode,\ntemperature, and permission are agent-only keys the command runtime\nsilently ignores, so a permission block is a false sandbox claim.\n\nRefs: #204\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via .github/scripts/resolve-identity.sh>'
```

> Footers resolved at commit time: `Signed-off-by` via
> `bash .github/scripts/resolve-identity.sh`; `Authored-by`/`Tested-by` from
> `opencode.jsonc` `agent.plan.model`/`agent.code-review.model`. `Refs:` (not
> `Fixes:`) because the production bug is closed by Task 2.

---

### Task 2: Fix router.md — strip invalid keys, document permission inheritance

**Files:**
- Modify: `.opencode/commands/router.md` — frontmatter (lines 1–8) and body (add one prose line).

**Interfaces:**
- Consumes: the Task 1 validator (`check_command_frontmatter_keys`). After this task, running `validate-harness.sh` on the real repo must report `router.md` clean.
- Produces: a `router.md` whose frontmatter contains only `description`. The router remains a plain command that inherits the invoking agent's permissions and routes-and-stops.

- [ ] **Step 1: Replace router.md frontmatter + add permission-inheritance note**

In `.opencode/commands/router.md`, replace the entire frontmatter block
(lines 1–8):

```markdown
---
description: "Route a request to the right entry point. Reads the user's intent and points them at @consult, the design tab, @from-issue, @debug, the wayfinder, or the fast-path. Routes and stops — does not do the work. Runs as a plain command with the invoking agent's full permissions (commands cannot declare their own permission scope)."
mode: subagent
temperature: 0.1
permission:
  edit: deny
  bash: deny
---
```

with:

```markdown
---
description: "Route a request to the right entry point. Reads the user's intent and points them at @consult, the design tab, @from-issue, @debug, the wayfinder, or the fast-path. Routes and stops — does not do the work. Runs as a plain command with the invoking agent's full permissions (commands cannot declare their own permission scope)."
---
```

Then, immediately after the opening body paragraph (the line beginning
`You are a wayfinding router.`), insert this one-line note so the
permission model is stated in prose, not just the description:

```markdown
> **Permissions:** `/router` is a plain command — it runs with whatever
> permissions the invoking agent has. It does not (and cannot) declare its
> own `mode`/`permission` scope; any such keys in command frontmatter are
> silently ignored by the runtime.
```

Leave the decision table, signal heuristics, and closing `Arguments: $ARGUMENTS`
line unchanged.

- [ ] **Step 2: Run the validator on the real repo (integration confirmation)**

Run: `bash .github/scripts/validate-harness.sh`
Expected: exit 0, and NO line containing `router.md` + `invalid command
frontmatter key`. (router.md now has only `description`, which is allowed.)

- [ ] **Step 3: Re-run the full shell suite (regression)**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: all PASS (Tests 1–42).

- [ ] **Step 4: Verify acceptance criteria**

- [x] router.md frontmatter contains only valid command keys (`description`).
- [x] The routing isolation claim is removed (no `mode`/`permission`); the file now explicitly states it inherits caller permissions.
- [x] `validate-harness.sh` flags invalid keys in command frontmatter (Test 41).

- [ ] **Step 5: Commit (issue-closing)**

```bash
git add .opencode/commands/router.md
git commit -S -m $'fix(router): remove invalid frontmatter keys (false sandbox)\n\nrouter.md declared mode/temperature/permission, which are agent-only\nkeys the command runtime silently ignores — so the permission block\nadvertised a sandbox that did not exist. Strip to description only and\nstate in prose that /router runs with the invoking agent\'s permissions.\n\nFixes: #204\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via .github/scripts/resolve-identity.sh>'
```

> `Fixes: #204` at the top of the footer closes the issue (ADR-0010). Escaped
> apostrophe (`agent\'s`) inside the ANSI-C `$'...'` string.

---

## Verification (after both tasks)

1. `bash .github/scripts/validate-harness.sh` → exit 0, router.md clean.
2. `bash tests/Shell/validate-harness_test.sh` → all PASS (1–42).
3. `shellcheck .github/scripts/validate-harness.sh` → no new findings.
4. `/check` (pre-push gate) — note: `/check` covers PHP/SCSS/JS + pest coverage;
   this change is bash/markdown, so the relevant gates are the shell suite +
   shellcheck above. Run `/check` to confirm no incidental breakage.

## Execution handoff

On approval, the orchestrator:
1. Creates the branch off `develop`:
   `bash .github/scripts/new-branch.sh fix router-command-frontmatter`
   (Bug → `fix` prefix per ADR-0028).
2. Loads the `executing-plans` skill and dispatches Task 1 then Task 2 to
   `@tdd` (Red → Green → Refactor per task, review between tasks).
3. After Task 2: `verification-before-completion` → `/check` → `@code-review`
   (manual gates). `git push` is human-only.
