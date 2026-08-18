# setup.json Secret-Slot Guard Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Mechanically enforce ADR-0032's "empty defaults in the tracked
`.opencode/setup.json`" contract so that any non-empty `env.*` value in the
committed file is rejected at commit time and in CI — closing the secret-leak
footgun identified in issue #194.

**Architecture:** A small, dependency-free bash guard
(`.github/scripts/check-setup-secrets.sh`) uses `jq` (already a hard prereq via
`.envrc`, ADR-0029) to scan a `setup.json` path for non-empty `env.*` values and
exits non-zero with a named-key report when it finds any. The guard is invoked
from the `pre-commit` hook on the **staged blob** (ADR-0015) and mirrored as a
CI step in both the linux and macOS jobs (ADR-0025 CI↔local parity). A
`tests/Shell/setup_secrets_test.sh` covers guard logic (happy + failure +
fail-closed) and static wiring of the hook + CI. Documentation in `mcp.md`
directs secrets exclusively to the user-level file (AC-2).

**Tech Stack:** Bash 3.2+ (macOS floor, per `pre-commit` shebang guard), `jq`,
the existing `tests/Shell/` harness (`test_helpers.sh`:
`pass`/`fail`/`skip`/`register_temp_dir`/`print_summary`), YAML CI in
`.github/workflows/ci.yml`.

## Global constraints

- **Security model (issue #194):** the tracked `.opencode/setup.json` is the
  canonical config manifest (ADR-0029/0032) and **must** ship empty `env`
  defaults. Real API keys/URLs belong **exclusively** in the user-level
  `~/.config/opencode/setup.json`. The guard mechanizes this — it is fail-closed
  (missing `jq`, malformed JSON, and unparseable `env` schema all exit 1).
- **Uniform rule:** block **any** non-empty `env.*` value. No carve-outs, no
  allow-list — `searxng_url` (a URL, not a credential) is blocked too. A single
  rule needs no maintenance and auto-covers future env slots.
- **CI↔local parity (ADR-0025):** the guard runs in `pre-commit` (staged blob)
  **and** as a CI step in both jobs. The standalone CI step also verifies the
  repo's own tracked file is clean (defense in depth, like
  `check-script-executable-bits.sh`).
- **jq is a hard prerequisite** (`.envrc` requires it; ADR-0029). The guard
  **does not** add a new dependency — it reuses `jq`. Missing `jq` → fail-closed.
- **Conventional commit type:** `ci` (issue type CI/CD → `ci` per
  `docs/agents/labels.md`). Branch:
  `ci/<user>-<hash>-setup-secrets-guard` (created via
  `bash .github/scripts/new-branch.sh ci setup-secrets-guard` after plan
  approval).
- **No explanatory comments** unless requested (AGENTS.md). Every new/modified
  `.sh` keeps its RCS header + vim modeline (the `pre-commit` RCS auto-adder
  normalizes headers on first commit; new files must start with a shebang on
  line 1).
- **Signed commits** (`git commit -S`). Footer model IDs: `Authored-by:
  glm-5.2`, `Tested-by: deepseek-v4-pro`, `Signed-off-by:` via
  `bash .github/scripts/resolve-identity.sh`. References use `Refs: #194`
  (matching the #193 plan precedent; the issue closes at merge).
- **shellcheck --severity=warning** must be clean on the new script and the
  edited hook (CI parity, ADR-0025).
- **Executable bit:** `.github/scripts/check-setup-secrets.sh` must carry the
  executable bit — enforced by `check-script-executable-bits.sh` (create with
  `chmod +x`; the guard catches a missed bit).

---

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `.github/scripts/check-setup-secrets.sh` | Create | jq guard: exits 1 if any non-empty `env.*` value in the given `setup.json` path; fail-closed on missing jq / bad JSON / bad env schema. |
| `tests/Shell/setup_secrets_test.sh` | Create | Section A: guard logic (happy/failure/fail-closed + repo file clean). Section B: pre-commit wiring (static). Section C: CI wiring (static). Section D: docs (static, AC-2). |
| `.github/hooks/pre-commit` | Modify | Invoke the guard on the staged `.opencode/setup.json` blob, after the gitleaks block. |
| `.github/workflows/ci.yml` | Modify | Add a "Check setup.json secret hygiene" step in the linux `check` job and the `check-macos` job. |
| `.opencode/docs/mcp.md` | Modify | Warn that the tracked file is mechanically guarded; secrets go only in the user-level file (AC-2). |
| `adr/0032-mcp-server-onboarding.md` | Modify | Additive consequence note: empty-default contract is now mechanically enforced (issue #194). Optional — `mcp.md` alone satisfies AC-2. |

---

## Task 1: Guard script + logic tests (AC-1)

**Files:**
- Create: `.github/scripts/check-setup-secrets.sh`
- Create: `tests/Shell/setup_secrets_test.sh` (Section A only — wiring sections added in Tasks 2–4)

**Interfaces:**
- Produces: `check-setup-secrets.sh [path]` — `path` defaults to
  `.opencode/setup.json`; exit `0` when every `env.*` value is empty (or the
  file/env is absent); exit `1` on any non-empty `env.*` value, missing `jq`,
  invalid JSON, or an unparseable `env` schema. Prints a named-key violation
  report to stderr on failure.

- [ ] **Step 1: Write the failing tests (Red)**

Create `tests/Shell/setup_secrets_test.sh` with the header, the `run_guard_out`
helper, and **Section A** only (Sections B/C/D are appended by later tasks).
The pre-commit RCS auto-adder will normalize the header on first commit — start
the file with a shebang on line 1.

```bash
#!/usr/bin/env bash
# $KYAULabs: setup_secrets_test.sh kyau@nova 2026/07/25 -0700 Exp $


set -euo pipefail

# ── check-setup-secrets.sh guard test (issue #194) ──────────────────────────
# Verifies the tracked-.opencode/setup.json secret-slot guard:
#   Section A — guard logic (empty/absent env pass; non-empty env.* fails;
#               malformed JSON fails closed; multiple violations all reported;
#               the repo's own tracked file is clean).
#   Section B — pre-commit invokes the guard on the staged blob (Task 2).
#   Section C — CI runs the guard as a step in both jobs (Task 3).
#   Section D — mcp.md documents the guarded-file rule (Task 4, AC-2).
# ─────────────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

SCRIPT="$REPO_ROOT/.github/scripts/check-setup-secrets.sh"

# run_guard_out <json-string> → sets GUARD_RC (exit status) and GUARD_OUT
# (combined stdout+stderr). Uses a temp file so the guard sees a real path.
run_guard_out() {
	local content="$1"
	local tmpf
	tmpf=$(mktemp)
	printf '%s' "$content" > "$tmpf"
	GUARD_OUT=$(bash "$SCRIPT" "$tmpf" 2>&1) && GUARD_RC=0 || GUARD_RC=$?
	rm -f "$tmpf"
}

# ── Section A: guard logic ──────────────────────────────────────────────────

echo ""
echo "── Section A: guard logic ──"

# A1: empty env values pass
run_guard_out '{"env":{"deepseek_api_key":"","searxng_url":""}}'
if [ "$GUARD_RC" -eq 0 ]; then
	pass "empty env values → pass"
else
	fail "empty env values should pass (exit $GUARD_RC): $GUARD_OUT"
fi

# A2: absent env section passes
run_guard_out '{"setup_version":4,"models":{"primary":"x"}}'
if [ "$GUARD_RC" -eq 0 ]; then
	pass "absent env section → pass"
else
	fail "absent env section should pass (exit $GUARD_RC): $GUARD_OUT"
fi

# A3: absent file passes (graceful skip)
GUARD_RC=0
bash "$SCRIPT" "/nonexistent/setup-$$-nope.json" >/dev/null 2>&1 || GUARD_RC=$?
if [ "$GUARD_RC" -eq 0 ]; then
	pass "absent file → graceful skip (exit 0)"
else
	fail "absent file should exit 0 (exit $GUARD_RC)"
fi

# A4: non-empty deepseek_api_key fails + names the key.
# NOTE: fixture value is an obviously-non-secret placeholder ("nonempty") so it
# does not trip gitleaks' generic-API-key rule. The guard checks non-emptiness
# only and reports the KEY name (never the value), so the value is irrelevant
# to the assertion.
run_guard_out '{"env":{"deepseek_api_key":"nonempty","searxng_url":""}}'
if [ "$GUARD_RC" -eq 0 ]; then
	fail "non-empty deepseek_api_key should fail"
elif ! echo "$GUARD_OUT" | grep -q "env.deepseek_api_key"; then
	fail "failure did not name env.deepseek_api_key: $GUARD_OUT"
else
	pass "non-empty deepseek_api_key → blocked + named"
fi

# A5: non-empty searxng_url fails (uniform rule, NO carve-out for URLs)
run_guard_out '{"env":{"deepseek_api_key":"","searxng_url":"https://searxng.example.com"}}'
if [ "$GUARD_RC" -eq 0 ]; then
	fail "non-empty searxng_url should fail (uniform rule)"
elif ! echo "$GUARD_OUT" | grep -q "env.searxng_url"; then
	fail "failure did not name env.searxng_url: $GUARD_OUT"
else
	pass "non-empty searxng_url → blocked (uniform rule, no carve-out)"
fi

# A6: multiple non-empty values → exit 1, output names BOTH keys
run_guard_out '{"env":{"deepseek_api_key":"nonempty","searxng_url":"https://s.example.test"}}'
if [ "$GUARD_RC" -eq 0 ]; then
	fail "multiple non-empty values should fail"
elif ! echo "$GUARD_OUT" | grep -q "env.deepseek_api_key" || ! echo "$GUARD_OUT" | grep -q "env.searxng_url"; then
	fail "multiple violations not all reported: $GUARD_OUT"
else
	pass "multiple non-empty values → both reported"
fi

# A7: malformed JSON fails closed
run_guard_out '{ this is not valid json'
if [ "$GUARD_RC" -eq 0 ]; then
	fail "malformed JSON should fail closed"
else
	pass "malformed JSON → fail closed"
fi

# A8: the repo's own tracked setup.json must pass (it ships empty env)
GUARD_RC=0
bash "$SCRIPT" "$REPO_ROOT/.opencode/setup.json" >/dev/null 2>&1 || GUARD_RC=$?
if [ "$GUARD_RC" -eq 0 ]; then
	pass "tracked .opencode/setup.json passes (empty env)"
else
	fail "tracked .opencode/setup.json should pass (it ships empty env)"
fi

print_summary "setup_secrets_test (Section A)"
exit $?


# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash tests/Shell/setup_secrets_test.sh`
Expected: the script aborts early — `$SCRIPT` does not exist yet. Every Section
A assertion is unreachable / fails. (Under `set -e`, the missing-script
invocation inside `run_guard_out` sets `GUARD_RC=127`, so A1/A2 would falsely
"fail" with exit 127; the real signal is "file not found" noise. This confirms
Red — nothing passes until the guard exists.)

- [ ] **Step 3: Implement the guard (Green)**

Create `.github/scripts/check-setup-secrets.sh` (start with shebang on line 1;
the `pre-commit` RCS auto-adder normalizes the header on first commit):

```bash
#!/usr/bin/env bash
# $KYAULabs: check-setup-secrets.sh kyau@nova 2026/07/25 -0700 Exp $


# ── Secret-slot guard for tracked .opencode/setup.json (issue #194) ──────────
# Enforces ADR-0032's contract: the committed project setup.json ships EMPTY
# env defaults; real API keys/URLs belong in the user-level
# ~/.config/opencode/setup.json. A non-empty env.* value here means a secret
# is about to be committed.
#
# Usage: check-setup-secrets.sh [path]    (path defaults to .opencode/setup.json)
# Exit 0: every env.* value is empty (or file/env absent).
# Exit 1: any env.* value is non-empty, jq is missing, the file is not valid
#         JSON, or the env section has an unexpected schema (fail-closed).

set -euo pipefail

SETUP_JSON="${1:-.opencode/setup.json}"

# No file in this checkout — nothing to guard (e.g. scaffold skip mode).
[ -f "$SETUP_JSON" ] || exit 0

# jq is a hard prerequisite of .envrc (ADR-0029). Fail closed if absent — a
# missing dependency must not silently disable a secret guard.
if ! command -v jq >/dev/null 2>&1; then
	echo "ERROR: jq required by check-setup-secrets.sh but not found." >&2
	exit 1
fi

# Fail closed on malformed JSON: cannot verify hygiene of an unparseable file.
if ! jq -e . "$SETUP_JSON" >/dev/null 2>&1; then
	echo "ERROR: $SETUP_JSON is not valid JSON — cannot verify secret hygiene." >&2
	exit 1
fi

# Uniform rule (issue #194): ANY non-empty env.* value is a violation. The
# `if ! VAR=$(...)` form makes a jq schema error (e.g. non-object env) fail
# closed instead of silently passing.
if ! VIOLATIONS=$(jq -r '
	(.env // {})
	| to_entries[]
	| select(.value != null and .value != "")
	| "  env.\(.key)"
' "$SETUP_JSON" 2>/dev/null); then
	echo "ERROR: could not evaluate the env section of $SETUP_JSON (unexpected schema)." >&2
	exit 1
fi

if [ -n "$VIOLATIONS" ]; then
	echo "✗ Non-empty secret/env values found in tracked $SETUP_JSON:" >&2
	printf '%s\n' "$VIOLATIONS" >&2
	echo "  Real values belong in ~/.config/opencode/setup.json (user-level)," >&2
	echo "  not the tracked project file (ADR-0032, issue #194)." >&2
	echo "  Move them out and re-stage." >&2
	exit 1
fi

exit 0


# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 4: Make the script executable**

```bash
chmod +x .github/scripts/check-setup-secrets.sh
```

(The `check-script-executable-bits.sh` guard, wired into pre-commit + CI,
enforces the git index mode is `100755`. If `git add` stages it without the bit,
run `git update-index --chmod=+x .github/scripts/check-setup-secrets.sh`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash tests/Shell/setup_secrets_test.sh`
Expected: Section A — **8 passed, 0 failed** (A1 empty env, A2 absent env, A3
absent file, A4 deepseek_api_key, A5 searxng_url, A6 multiple, A7 malformed
JSON, A8 repo file clean).

- [ ] **Step 6: Lint**

Run: `shellcheck --severity=warning .github/scripts/check-setup-secrets.sh tests/Shell/setup_secrets_test.sh`
Expected: no output (clean).

- [ ] **Step 7: Commit**

```bash
git add .github/scripts/check-setup-secrets.sh tests/Shell/setup_secrets_test.sh
git update-index --chmod=+x .github/scripts/check-setup-secrets.sh 2>/dev/null || true
git commit -S -m $'ci(setup-secrets): add check-setup-secrets.sh guard + logic tests\n\nA jq-based guard that exits 1 when any non-empty env.* value is present in\nthe tracked .opencode/setup.json, enforcing ADR-0032\'s empty-default\ncontract. Fail-closed on missing jq, malformed JSON, and unexpected env\nschema. Uniform rule: no carve-outs (searxng_url blocked too). Covered by\ntests/Shell/setup_secrets_test.sh Section A.\n\nRefs: #194\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

## Task 2: Wire the guard into pre-commit (AC-1, local enforcement)

**Files:**
- Modify: `.github/hooks/pre-commit` (insert after the gitleaks block, ~line 142)
- Modify: `tests/Shell/setup_secrets_test.sh` (append Section B before the summary)

**Interfaces:**
- Consumes: `check-setup-secrets.sh` (Task 1) and the hook's existing
  `checkout_staged <path>` helper (sets `$TMPF` to the staged blob temp path,
  defined at `pre-commit:21-25`).
- Produces: a pre-commit section that runs the guard against the **staged**
  `.opencode/setup.json` blob whenever that file is staged.

- [ ] **Step 1: Append the failing wiring tests (Red)**

In `tests/Shell/setup_secrets_test.sh`, **remove** the current
`print_summary`/`exit $?` lines at the end of Section A, then append Section B
and a new combined summary. (The summary moves to the end of the file and is
re-pointed each task.)

```bash

# ── Section B: pre-commit wiring ────────────────────────────────────────────

echo ""
echo "── Section B: pre-commit wiring ──"
HOOK="$REPO_ROOT/.github/hooks/pre-commit"

# B1: hook invokes the guard script
if grep -qF 'check-setup-secrets.sh' "$HOOK"; then
	pass "pre-commit invokes check-setup-secrets.sh"
else
	fail "pre-commit does not invoke check-setup-secrets.sh"
fi

# B2: hook runs the guard on the STAGED blob ($TMPF), not the working-tree file
if grep -qF 'check-setup-secrets.sh "$TMPF"' "$HOOK"; then
	pass "pre-commit checks the staged setup.json blob (\$TMPF)"
else
	fail "pre-commit should run the guard on the staged blob (\$TMPF)"
fi

# B3: hook only fires when .opencode/setup.json is staged (no spurious runs)
if grep -qF "grep -Fx '.opencode/setup.json'" "$HOOK"; then
	pass "pre-commit gates the guard on staged .opencode/setup.json"
else
	fail "pre-commit should gate the guard on staged .opencode/setup.json"
fi

print_summary "setup_secrets_test (Sections A+B)"
exit $?
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash tests/Shell/setup_secrets_test.sh`
Expected: Section A passes (8); Section B **fails** (B1/B2/B3 — the hook does
not reference the guard yet).

- [ ] **Step 3: Add the guard section to pre-commit (Green)**

In `.github/hooks/pre-commit`, insert this block **immediately after the
gitleaks block** (after the `fi` closing `if command -v gitleaks ...`, ~line
142), and **before** the `# ── RCS placeholder/foreign header check` comment
(~line 144):

```bash

# ── Tracked setup.json secret-slot guard (issue #194) ────────────────────────
# Enforces ADR-0032's "empty defaults in the committed file" contract: a
# non-empty env.* value in the tracked .opencode/setup.json means a secret is
# about to be committed. Checks the STAGED blob (ADR-0015), not the working
# tree. Mirrors check-script-executable-bits.sh (local guard + CI parity).
STAGED_SETUP=$(git -c core.quotePath=false diff --cached --name-only --diff-filter=ACMR | grep -Fx '.opencode/setup.json' || true)
if [ -n "$STAGED_SETUP" ]; then
	echo "→ setup.json secret-slot guard"
	checkout_staged ".opencode/setup.json"
	bash .github/scripts/check-setup-secrets.sh "$TMPF"
fi
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash tests/Shell/setup_secrets_test.sh`
Expected: Sections A+B — **11 passed, 0 failed**.

- [ ] **Step 5: Lint + manual repro**

Run: `shellcheck --severity=warning .github/hooks/pre-commit`
Expected: clean.

Manual staged-blob repro (proves it inspects the index, not the working tree):

```bash
# Poison a COPY, stage the real (clean) file, confirm the hook reads the index.
cp .opencode/setup.json /tmp/setup-clean-backup.json
jq '.env.deepseek_api_key = "nonempty"' .opencode/setup.json > /tmp/setup-poisoned.json
cp /tmp/setup-poisoned.json .opencode/setup.json
git add .opencode/setup.json            # stages the poisoned blob
bash .github/hooks/pre-commit 2>&1 | grep -q "env.deepseek_api_key" && echo "BLOCKED ✓" || echo "NOT BLOCKED ✗"
# Restore + unstage:
cp /tmp/setup-clean-backup.json .opencode/setup.json
git reset -q HEAD .opencode/setup.json
git checkout -- .opencode/setup.json
rm -f /tmp/setup-clean-backup.json /tmp/setup-poisoned.json
```
Expected: prints `BLOCKED ✓`.

- [ ] **Step 6: Commit**

```bash
git add .github/hooks/pre-commit tests/Shell/setup_secrets_test.sh
git commit -S -m $'ci(setup-secrets): wire guard into pre-commit on staged blob\n\nInvoke check-setup-secrets.sh against the staged .opencode/setup.json blob\n(ADR-0015 index-based linting) whenever that file is staged. Sits after the\ngitleaks block. Covered by tests/Shell/setup_secrets_test.sh Section B.\n\nRefs: #194\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

## Task 3: Run the guard in CI (AC-1, ADR-0025 parity)

**Files:**
- Modify: `.github/workflows/ci.yml` (add a step after "Check script executable bits" in the linux `check` job ~line 130, and in the `check-macos` job ~line 328)
- Modify: `tests/Shell/setup_secrets_test.sh` (append Section C before the summary)

**Interfaces:**
- Consumes: `check-setup-secrets.sh` (Task 1). The step runs the guard with no
  path argument, so it checks the checked-out (committed)
  `.opencode/setup.json` in the working tree — i.e. the repo's own tracked file.

- [ ] **Step 1: Append the failing CI wiring test (Red)**

In `tests/Shell/setup_secrets_test.sh`, remove the Section B
`print_summary`/`exit $?` lines, then append Section C and a new combined
summary:

```bash

# ── Section C: CI wiring ────────────────────────────────────────────────────

echo ""
echo "── Section C: CI wiring ──"
CI="$REPO_ROOT/.github/workflows/ci.yml"

# C1: ci.yml invokes the guard
if grep -qF 'check-setup-secrets.sh' "$CI"; then
	pass "ci.yml invokes check-setup-secrets.sh"
else
	fail "ci.yml should invoke check-setup-secrets.sh"
fi

# C2: guard runs in BOTH jobs (linux check + check-macos) — ≥2 occurrences
count=$(grep -cF 'check-setup-secrets.sh' "$CI" || true)
if [ "$count" -ge 2 ]; then
	pass "ci.yml runs the guard in both jobs ($count occurrences)"
else
	fail "ci.yml should run the guard in both jobs (found $count)"
fi

print_summary "setup_secrets_test (Sections A+B+C)"
exit $?
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash tests/Shell/setup_secrets_test.sh`
Expected: Sections A+B pass (11); Section C **fails** (C1/C2 — ci.yml does not
reference the guard yet).

- [ ] **Step 3: Add the CI step in the linux `check` job (Green)**

In `.github/workflows/ci.yml`, insert **immediately after** the existing step
(~lines 129-130):

```yaml
      - name: Check script executable bits
        run: bash .github/scripts/check-script-executable-bits.sh
```

add:

```yaml

      - name: Check setup.json secret hygiene
        run: bash .github/scripts/check-setup-secrets.sh
```

- [ ] **Step 4: Add the CI step in the `check-macos` job (Green)**

In the `check-macos` job, insert **immediately after** the existing step
(~lines 326-328):

```yaml
      - name: Check script executable bits
        shell: bash
        run: bash .github/scripts/check-script-executable-bits.sh
```

add (note `shell: bash` — the macOS runner default is zsh; match the neighbor):

```yaml

      - name: Check setup.json secret hygiene
        shell: bash
        run: bash .github/scripts/check-setup-secrets.sh
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash tests/Shell/setup_secrets_test.sh`
Expected: Sections A+B+C — **13 passed, 0 failed** (C2 reports 2 occurrences).

- [ ] **Step 6: Validate the YAML parses**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK`
Expected: `OK` (no YAML syntax errors introduced). If python3/pyyaml is absent,
`npx --yes yaml-lint .github/workflows/ci.yml` or rely on the CI run itself.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/ci.yml tests/Shell/setup_secrets_test.sh
git commit -S -m $'ci(setup-secrets): run guard in CI (linux + macOS jobs)\n\nMirror the pre-commit guard as a "Check setup.json secret hygiene" step in\nboth the check and check-macos jobs, right after the executable-bits check\n(ADR-0025 CI↔local parity). The CI step also verifies the repo\'s own tracked\nfile is clean. Covered by Section C.\n\nRefs: #194\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

## Task 4: Documentation (AC-2)

**Files:**
- Modify: `.opencode/docs/mcp.md` (warn the tracked file is guarded; secrets only in user-level file)
- Modify: `adr/0032-mcp-server-onboarding.md` (additive consequence note — optional)
- Modify: `tests/Shell/setup_secrets_test.sh` (append Section D before the summary)

**Interfaces:**
- Consumes: the guard from Task 1. AC-2 ("Documentation directs secrets
  exclusively to the user-level file") is satisfied by the `mcp.md` warning;
  the ADR-0032 note is additive traceability only.

- [ ] **Step 1: Append the failing docs test (Red)**

In `tests/Shell/setup_secrets_test.sh`, remove the Section C
`print_summary`/`exit $?` lines, then append Section D and the final summary:

```bash

# ── Section D: documentation (AC-2) ─────────────────────────────────────────

echo ""
echo "── Section D: documentation (AC-2) ──"
MCP="$REPO_ROOT/.opencode/docs/mcp.md"

# D1: mcp.md mentions the guard AND directs secrets to the user-level file
if echo "$(grep -siE 'check-setup-secrets|guarded|pre-commit hook' "$MCP")" | grep -q . \
	&& grep -qiF '~/.config/opencode/setup.json' "$MCP"; then
	pass "mcp.md documents the guard + user-level-file rule (AC-2)"
else
	fail "mcp.md should document the guard and the user-level-file rule (AC-2)"
fi

print_summary "setup_secrets_test (Sections A+B+C+D)"
exit $?
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash tests/Shell/setup_secrets_test.sh`
Expected: Sections A+B+C pass (13); Section D **fails** (D1 — `mcp.md` does not
yet mention the guard; the `~/.config/...` half already passes).

- [ ] **Step 3: Add the guarded-file warning to mcp.md (Green)**

In `.opencode/docs/mcp.md`, in the "## Enabling a Server" section, replace
**step 2** (currently ~lines 28-40):

```markdown
2. **Set the key or URL** in `~/.config/opencode/setup.json` under the `"env"`
   section. This is the user-level override (project-level
   `.opencode/setup.json` ships with empty defaults). Example:

   ```json
   {
     "env": {
       "deepseek_api_key": "sk-...",
       "searxng_url": "https://searxng.example.com"
     }
   }
   ```
```

with:

```markdown
2. **Set the key or URL** in `~/.config/opencode/setup.json` under the `"env"`
   section. This is the user-level override (project-level
   `.opencode/setup.json` ships with empty defaults). Example:

   ```json
   {
     "env": {
       "deepseek_api_key": "sk-...",
       "searxng_url": "https://searxng.example.com"
     }
   }
   ```

   > ⚠️ **Never paste real keys or URLs into the tracked
   > `.opencode/setup.json`.** A pre-commit hook and CI check
   > (`check-setup-secrets.sh`) reject **any** non-empty `env.*` value in the
   > committed file. Secrets belong **exclusively** in the user-level
   > `~/.config/opencode/setup.json` (ADR-0032, issue #194).
```

- [ ] **Step 4: Add an additive consequence note to ADR-0032 (optional)**

In `adr/0032-mcp-server-onboarding.md`, in the `### Positive` consequences list
(~line 53), append this bullet after the existing "secrets never enter
committed files" bullet:

```markdown
- **Empty-default contract enforced** — `check-setup-secrets.sh` (pre-commit +
  CI, issue #194) rejects any non-empty `env.*` value in the tracked
  `.opencode/setup.json`, mechanizing the "secrets never enter committed files"
  consequence above.
```

> This is a purely additive annotation (it records a later enforcement
> mechanism; it does not reverse or alter ADR-0032's decision). If the
> implementer prefers to leave accepted ADRs untouched, **skip this step** —
> the `mcp.md` warning alone satisfies AC-2. Skipping is non-blocking.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash tests/Shell/setup_secrets_test.sh`
Expected: Sections A+B+C+D — **14 passed, 0 failed**.

- [ ] **Step 6: Commit**

```bash
git add .opencode/docs/mcp.md adr/0032-mcp-server-onboarding.md tests/Shell/setup_secrets_test.sh
git commit -S -m $'ci(setup-secrets): document guarded-file rule in mcp.md + ADR-0032 note\n\nWarn in mcp.md that the tracked .opencode/setup.json is mechanically\nguarded (pre-commit + CI) and that secrets belong exclusively in the\nuser-level file (AC-2). Add an additive enforcement note to ADR-0032.\nCovered by Section D.\n\nRefs: #194\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

## Verification (after all tasks)

- [ ] `bash tests/Shell/setup_secrets_test.sh` — **14/14 PASS** (Sections A+B+C+D).
- [ ] `shellcheck --severity=warning .github/scripts/check-setup-secrets.sh
      .github/hooks/pre-commit tests/Shell/setup_secrets_test.sh` — clean.
- [ ] `/check` — full pre-push gate green (php-cs-fixer + stylelint + eslint +
      pest --coverage 80% + the shell suite, which now includes this test).
- [ ] `@code-review` — clean before push.
- [ ] Manual end-to-end:
  - `bash .github/scripts/check-setup-secrets.sh .opencode/setup.json; echo "exit=$?"` → `exit=0`.
  - `jq '.env.deepseek_api_key="nonempty"' .opencode/setup.json > /tmp/p.json && bash .github/scripts/check-setup-secrets.sh /tmp/p.json; echo "exit=$?"` → non-zero, message names `env.deepseek_api_key`. (Clean up `/tmp/p.json`.)

## Self-review

- **Issue/AC coverage:** AC-1 ("a non-empty `env.deepseek_api_key` in tracked
  `.opencode/setup.json` fails a pre-commit hook or CI check") → Task 1 (guard
  + logic tests), Task 2 (pre-commit), Task 3 (CI). The guard also covers
  `searxng_url` and any future env slot (uniform rule). AC-2 ("Documentation
  directs secrets exclusively to the user-level file") → Task 4 (`mcp.md`
  warning + optional ADR-0032 note). Both acceptance criteria covered.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code
  (guard script, test sections, hook diff, ci.yml diffs, mcp.md/ADR edits);
  every commit message carries full footers + `Refs: #194`.
- **Type consistency:** script name `check-setup-secrets.sh`, default path
  `.opencode/setup.json`, helper `run_guard_out` sets `GUARD_RC`/`GUARD_OUT`
  uniformly across Section A; the staged-blob variable `$TMPF` (from the hook's
  `checkout_staged`) matches the B2 assertion `check-setup-secrets.sh "$TMPF"`;
  the `grep -Fx '.opencode/setup.json'` matches the B3 assertion verbatim.
- **Behavior change flagged:** none for runtime — the only new enforcement is
  rejecting commits/CI that put a real value in the tracked `env` block, which
  is the intended security hardening (issue #194). The repo's own current
  `setup.json` ships empty env, so it passes (asserted by A8).
