# validate-harness.sh opencode.jsonc Filename Fix Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Make the two `opencode.json`-reading checks in
`.github/scripts/validate-harness.sh` read the real config file
`opencode.jsonc`, and fail loudly when no opencode config file is present — so
the bash-`" *"`-suffix check and the `git add*`/`git stage*` verdict-parity
check stop reporting vacuous clean passes against a non-existent file.

**Architecture:** This is a bug fix in a single shell script. The script already
resolves `REPO_ROOT` via `git rev-parse --show-toplevel` and already defines
`OPENCODE_JSONC="${REPO_ROOT}/opencode.jsonc"` (currently only inside the inline
read-only section at line 712). The fix hoists that definition into the
top-level configuration block so both buggy checks reference a single
`$OPENCODE_JSONC` variable (DRY — one source of truth for the filename), and
adds one fail-loud guard. Existing shell tests in
`tests/Shell/validate-harness_test.sh` use a fixture-worktree pattern
(`setup_validator_env` + `git_init_test_repo` + `register_temp_dir`); the same
pattern is reused. Two existing tests (22 & 23) currently plant the wrong
filename `opencode.json` and therefore *encode the bug* — they are corrected.

**Tech Stack:** Bash 4+ (`set -euo pipefail`), the shell-test harness in
`tests/Shell/lib/test_helpers.sh` (ADR-0018), shellcheck. No PHP, no Node
runtime change (the script already shells out to `node` for frontmatter
parsing; that is untouched).

## Global constraints

- **Single source of truth for the filename.** After this change, the literal
  string `opencode.jsonc` appears exactly once in the script — as the value of
  `OPENCODE_JSONC` in the configuration block. Both fixed checks reference
  `"$OPENCODE_JSONC"`, never a re-typed path. The duplicate definition at line
  712 is removed.
- **No behavior change to correct checks.** The inline read-only agent section
  (lines 705–742) already uses `opencode.jsonc` via `[ -f "$OPENCODE_JSONC" ]`
  and is NOT modified (it loses only its now-redundant local re-definition of
  `OPENCODE_JSONC`). The agent-`.md` frontmatter checks (lines 633–651,
  758–766) are untouched.
- **`2>/dev/null || true` is preserved on the two grep lines** (lines 625,
  752–753). Swallowing grep's "no match" exit 1 is correct and necessary; what
  was wrong was the *filename*. The new fail-loud guard (not these greps) is
  what surfaces an absent file.
- **Fail-loud uses the existing `err()` helper** (line 59), which increments
  `ERRORS`. The script already exits non-zero when `ERRORS > 0` at its tail.
  Do not add a new `exit 1`.
- **Ripple discipline.** The new absent-config guard makes the validator exit
  non-zero in any temp-repo fixture that lacks `opencode.jsonc`. Any existing
  test that asserts a *clean* run (exit 0) in a config-less temp repo must be
  repaired by planting a minimal valid config `echo '{}' > opencode.jsonc`.
  Tests that only assert on specific error substrings (most of the suite) are
  unaffected and must NOT be touched.
- **Real repo must stay green.** The real repository ships `opencode.jsonc`, so
  after the fix `bash .github/scripts/validate-harness.sh` run from the real
  repo root must still exit 0.
- **Commit type is `fix`** (Bug → `fix` per `docs/agents/labels.md`). Branch is
  created via `bash .github/scripts/new-branch.sh fix validator-jsonc-filename`.
  Commits are signed (`-S`) and carry `Authored-by` / `Tested-by` /
  `Signed-off-by` footers; the closing reference is `Fixes: #197`.

---

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `.github/scripts/validate-harness.sh` | The harness validator (buggy). Hoist `OPENCODE_JSONC`, fix two greps + labels, add absent-config guard, remove duplicate definition. | Modify |
| `tests/Shell/validate-harness_test.sh` | Repro-first tests for the validator. Correct Tests 22 & 23 (plant `opencode.jsonc`), add new Red tests for config-based `*`-suffix + absent-config fail-loud, repair clean-exit ripple. | Modify |

No new files. No dependencies change.

---

### Task 1: Config-based `" *"`-suffix check reads opencode.jsonc

**Files:**
- Modify: `.github/scripts/validate-harness.sh` — hoist `OPENCODE_JSONC`
  (config block ~line 48–51), fix the `" *"` grep (line 625), its comment
  (line 624) and error label (line 628).
- Test: `tests/Shell/validate-harness_test.sh` — append one new test that
  plants a bad `" *"` bash key in `opencode.jsonc` and asserts it is flagged.

**Interfaces:**
- Consumes: `setup_validator_env`, `git_init_test_repo`, `register_temp_dir`,
  `pass`, `fail` from `tests/Shell/lib/test_helpers.sh`.
- Produces: a hoisted `OPENCODE_JSONC` shell variable in the top-level config
  block, consumed by Tasks 2 and 3.

- [ ] **Step 1: Write the failing test (Red)**

Append a new test block immediately before the final
`print_summary "validate-harness"` line (currently the last test is around
Test 30+; use the next sequential number). The test plants a bad `" *"`-suffix
bash permission key directly in `opencode.jsonc` — a fixture that today is
never inspected because the validator greps the wrong filename.

```bash
# ── Test N: bash " *" pattern inside opencode.jsonc is caught ────────────────

echo "── Test N: bash ' *' pattern in opencode.jsonc is caught ──"
TN=$(mktemp -d)
register_temp_dir "$TN"
git_init_test_repo "$TN"
(
	cd "$TN"
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
```

- [ ] **Step 2: Run the test to verify it fails (Red)**

Run: `bash tests/Shell/validate-harness_test.sh 2>&1 | grep -A1 "Test N"`
Expected: FAIL — "Did not detect ' *' bash pattern inside opencode.jsonc".
The validator greps `opencode.json` (absent), so the planted `opencode.jsonc`
key is never inspected. (Confirm with `echo $?` that the suite exits non-zero.)

- [ ] **Step 3: Hoist OPENCODE_JSONC and fix the `" *"` grep (Green)**

In `.github/scripts/validate-harness.sh`, add `OPENCODE_JSONC` to the
top-level configuration block. Current (lines 48–51):

```bash
HARNESS_DIR="${REPO_ROOT}/.opencode"
SKILLS_DIR="${HARNESS_DIR}/skills"
AGENTS_DIR="${HARNESS_DIR}/agents"
COMMANDS_DIR="${HARNESS_DIR}/commands"
```

After:

```bash
HARNESS_DIR="${REPO_ROOT}/.opencode"
SKILLS_DIR="${HARNESS_DIR}/skills"
AGENTS_DIR="${HARNESS_DIR}/agents"
COMMANDS_DIR="${HARNESS_DIR}/commands"
OPENCODE_JSONC="${REPO_ROOT}/opencode.jsonc"
```

Then fix the `" *"` check. Current (lines 624–625):

```bash
# Check opencode.json for bash permission keys ending in " *"
JSON_BAD=$(grep -noE '"[^"]* \*"[[:space:]]*:' "${REPO_ROOT}/opencode.json" 2>/dev/null) || true
```

After:

```bash
# Check opencode.jsonc for bash permission keys ending in " *"
JSON_BAD=$(grep -noE '"[^"]* \*"[[:space:]]*:' "$OPENCODE_JSONC" 2>/dev/null) || true
```

And fix the error label on line 628. Current:

```bash
		err "opencode.json:${line%%:*}: bash permission pattern ends in ' *' (cannot match bare command): ${line#*:}"
```

After:

```bash
		err "opencode.jsonc:${line%%:*}: bash permission pattern ends in ' *' (cannot match bare command): ${line#*:}"
```

- [ ] **Step 4: Run the test to verify it passes (Green)**

Run: `bash tests/Shell/validate-harness_test.sh 2>&1 | grep -A1 "Test N"`
Expected: PASS — "Caught ' *' bash pattern inside opencode.jsonc".

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh
git commit -S -m $'fix(validate-harness): read opencode.jsonc for bash " *" check\n\nThe bash-permission " *"-suffix check grepped opencode.json, which does not\nexist in this repo (the config is opencode.jsonc). grep returned nothing,\n2>/dev/null || true swallowed it, and the check reported clean without ever\ninspecting the real config. Hoist OPENCODE_JSONC into the config block and\npoint the grep at it. Adds a repro test planting a bad " *" key in\nopencode.jsonc.\n\nRefs: #197\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

> Resolve `Signed-off-by` with `bash .github/scripts/resolve-identity.sh` before
> committing. Use `Refs: #197` (not `Fixes:`) here because the issue closes
> only when the full fix lands across all tasks.

---

### Task 2: git add/stage verdict-parity check reads opencode.jsonc; correct bug-encoding tests

**Files:**
- Modify: `.github/scripts/validate-harness.sh` — fix the parity greps
  (lines 752–753), the comment (line 751) and the error label (line 755);
  remove the now-duplicate `OPENCODE_JSONC` definition (line 712) since it was
  hoisted in Task 1.
- Test: `tests/Shell/validate-harness_test.sh` — correct Tests 22 (mismatch
  caught) and 23 (match not flagged) to plant `opencode.jsonc` instead of
  `opencode.json`.

**Interfaces:**
- Consumes: the hoisted `OPENCODE_JSONC` variable from Task 1.
- Produces: the two corrected parity tests that no longer encode the bug.

- [ ] **Step 1: Correct the bug-encoding tests (Red)**

In `tests/Shell/validate-harness_test.sh`, change the fixture filename in
**both** Test 22 and Test 23 from `opencode.json` to `opencode.jsonc`. Each
test currently opens its heredoc with `cat > opencode.json <<'EOF'`; change it
to `cat > opencode.jsonc <<'EOF'`. Leave the JSON bodies unchanged. After this
edit, Test 22 becomes Red: the (still-unfixed-at-752) validator greps
`opencode.json`, finds no fixture there, and fails to flag the mismatch.

- [ ] **Step 2: Run Test 22 to verify it fails (Red)**

Run: `bash tests/Shell/validate-harness_test.sh 2>&1 | grep -A1 "Test 22"`
Expected: FAIL — "Did not detect git add/stage verdict mismatch". (Test 23
remains vacuously green and is only validated after Step 3.)

- [ ] **Step 3: Fix the parity greps + label + remove duplicate (Green)**

In `.github/scripts/validate-harness.sh`, fix lines 751–755. Current:

```bash
# opencode.json (inline agent permission blocks)
add_v=$(grep -oE '"git add\*"[[:space:]]*:[[:space:]]*"?[a-z]+"?' "${REPO_ROOT}/opencode.json" 2>/dev/null | grep -oE '(allow|ask|deny)' | head -1) || true
stage_v=$(grep -oE '"git stage\*"[[:space:]]*:[[:space:]]*"?[a-z]+"?' "${REPO_ROOT}/opencode.json" 2>/dev/null | grep -oE '(allow|ask|deny)' | head -1) || true
if [ -n "$add_v" ] && [ -n "$stage_v" ] && [ "$add_v" != "$stage_v" ]; then
	err "opencode.json: 'git add*' ($add_v) and 'git stage*' ($stage_v) are git synonyms with different verdicts"
fi
```

After:

```bash
# opencode.jsonc (inline agent permission blocks)
add_v=$(grep -oE '"git add\*"[[:space:]]*:[[:space:]]*"?[a-z]+"?' "$OPENCODE_JSONC" 2>/dev/null | grep -oE '(allow|ask|deny)' | head -1) || true
stage_v=$(grep -oE '"git stage\*"[[:space:]]*:[[:space:]]*"?[a-z]+"?' "$OPENCODE_JSONC" 2>/dev/null | grep -oE '(allow|ask|deny)' | head -1) || true
if [ -n "$add_v" ] && [ -n "$stage_v" ] && [ "$add_v" != "$stage_v" ]; then
	err "opencode.jsonc: 'git add*' ($add_v) and 'git stage*' ($stage_v) are git synonyms with different verdicts"
fi
```

Then remove the duplicate definition at line 712 (it was hoisted to the config
block in Task 1). Current:

```bash
INLINE_HELPERS="${REPO_ROOT}/.github/scripts/inline-agent-permissions.js"
OPENCODE_JSONC="${REPO_ROOT}/opencode.jsonc"

if [ -f "$INLINE_HELPERS" ] && [ -f "$OPENCODE_JSONC" ]; then
```

After:

```bash
INLINE_HELPERS="${REPO_ROOT}/.github/scripts/inline-agent-permissions.js"

if [ -f "$INLINE_HELPERS" ] && [ -f "$OPENCODE_JSONC" ]; then
```

- [ ] **Step 4: Run Tests 22 & 23 to verify they pass (Green)**

Run: `bash tests/Shell/validate-harness_test.sh 2>&1 | grep -A1 -E "Test 2[23]"`
Expected: Test 22 PASS ("Caught git add/stage verdict mismatch") and Test 23
PASS ("Matching git add/stage verdicts not flagged").

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh
git commit -S -m $'fix(validate-harness): read opencode.jsonc for git add/stage parity\n\nThe git add*/git stage* verdict-parity check greped the non-existent\nopencode.json, so mismatched synonyms passed silently. Point both greps at\nthe hoisted $OPENCODE_JSONC. Remove the now-duplicate local definition of\nOPENCODE_JSONC. Corrects Tests 22 & 23, which planted opencode.json and so\nencoded the bug.\n\nRefs: #197\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 3: Fail loud when opencode.jsonc is absent; absorb test ripple

**Files:**
- Modify: `.github/scripts/validate-harness.sh` — add one absent-config guard
  in the configuration block (immediately after the hoisted `OPENCODE_JSONC`
  definition from Task 1).
- Test: `tests/Shell/validate-harness_test.sh` — add a new Red test asserting
  the validator errors when no config file is present; then run the FULL suite
  and repair any clean-exit test that the new guard breaks by planting
  `echo '{}' > opencode.jsonc`.

**Interfaces:**
- Consumes: the hoisted `OPENCODE_JSONC` variable and the `err()` helper.
- Produces: an absent-config error path; satisfies acceptance criterion #3
  ("The script errors if no opencode config file is present").

- [ ] **Step 1: Write the failing test (Red)**

Append a new test before `print_summary "validate-harness"`:

```bash
# ── Test M: absent opencode.jsonc is a loud error ────────────────────────────

echo "── Test M: absent opencode.jsonc fails loud ──"
TM=$(mktemp -d)
register_temp_dir "$TM"
git_init_test_repo "$TM"
(
	cd "$TM"
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
```

- [ ] **Step 2: Run the test to verify it fails (Red)**

Run: `bash tests/Shell/validate-harness_test.sh 2>&1 | grep -A1 "Test M"`
Expected: FAIL — "Absent opencode.jsonc did not error".

- [ ] **Step 3: Add the absent-config guard (Green)**

In `.github/scripts/validate-harness.sh`, immediately after the hoisted
`OPENCODE_JSONC` definition (end of the configuration block, after the
`COMMANDS_DIR=...` line you edited in Task 1), add:

```bash
# Fail loud if the opencode config is absent — the bash-permission and
# git add/stage-parity checks below would otherwise pass vacuously (issue #197).
if [ ! -f "$OPENCODE_JSONC" ]; then
	err "opencode.jsonc not found at ${OPENCODE_JSONC} — cannot validate inline permission patterns (issue #197)"
fi
```

- [ ] **Step 4: Run Test M to verify it passes, then run the FULL suite**

Run: `bash tests/Shell/validate-harness_test.sh 2>&1 | grep -A1 "Test M"`
Expected: PASS — "Absent opencode.jsonc produces a loud error".

Then run the whole file and capture failures:

```bash
bash tests/Shell/validate-harness_test.sh 2>&1 | grep "FAIL" || true
```

Expected before ripple repair: zero or more FAIL lines on tests that asserted a
*clean* run (exit 0) in a config-less temp repo (the README-clean test around
line 880–900 is the prime suspect).

- [ ] **Step 5: Repair clean-exit ripple (Refactor)**

For each failing clean-exit test, plant a minimal valid config at the top of
its fixture (right after `setup_validator_env`):

```bash
	echo '{}' > opencode.jsonc
```

`{}` is valid JSON, contains no `" *"` keys, and no `git add*`/`git stage*`
entries, so every config-based check passes cleanly. Do NOT touch tests that
only assert on specific error substrings — they are unaffected. Re-run the full
suite until the FAIL grep is empty.

Run: `bash tests/Shell/validate-harness_test.sh; echo "exit=$?"`
Expected: suite exits 0, summary line "✓ validate-harness: N passed, 0 failed".

- [ ] **Step 6: Verify the real repo stays green + lint**

```bash
bash .github/scripts/validate-harness.sh; echo "exit=$?"
shellcheck .github/scripts/validate-harness.sh
```

Expected: validator exits 0 against the real repo (which ships
`opencode.jsonc`); shellcheck reports clean for the edited regions.

- [ ] **Step 7: Commit (issue-closing)**

```bash
git add .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh
git commit -S -m $'fix(validate-harness): fail loud when opencode.jsonc absent\n\nAdd a guard that errors when opencode.jsonc is missing, so the inline\npermission checks can no longer pass vacuously. Absorbs test ripple: clean-\nexit fixtures now plant a minimal {} config. Completes the fix for the\nopencode.json-vs-opencode.jsonc dead-check triad.\n\nFixes: #197\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

> This final commit carries `Fixes: #197` (sentence-case, with colon, placed
> immediately above `Authored-by:` per ADR-0010). The earlier two commits use
> `Refs: #197` because the issue is only resolved once all three land.

---

## Verification (acceptance criteria mapping)

After all three tasks land, verify against the issue's acceptance criteria:

- [ ] **AC1 — "The validator reads opencode.jsonc"**: `grep -n 'opencode\.json'`
  must show zero bare-`opencode.json` path references in the script; only the
  `opencode.jsonc` literal (in the `OPENCODE_JSONC` definition) and comment
  prose remain.
- [ ] **AC2 — bad pattern / mismatched verdicts cause failure**: Task 1's
  `" *"`-in-config test and Task 2's corrected Test 22 both PASS (validator
  exits non-zero and prints the expected error).
- [ ] **AC3 — absent config errors**: Task 3's Test M PASSes; the validator
  prints `opencode.jsonc not found ...` and exits non-zero when the file is
  missing.

Final gate before push: run `/check` (the suite includes shellcheck +
`tests/Shell/*`), then `@code-review` on the staged diff.

## Notes

- The issue's cited line numbers (608; 696–697) are slightly stale relative to
  the current file; the real locations are 625 (bash `" *"` check) and 752–755
  (parity check). The substance of the report is exactly correct.
- No ADR is required: this restores existing intended behavior; it does not
  introduce a new architectural decision.
