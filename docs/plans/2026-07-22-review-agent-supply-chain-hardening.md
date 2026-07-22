# Review-Agent Supply-Chain Hardening Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Remove autonomous global `npm`/`pip` install permissions from the
read-only review agents (`@code-review`, `@semgrep`) and add a harness
validator rule that prevents the class from recurring.

**Architecture:** Two `.opencode/agents/*.md` files carry a `"*": deny`
bash catch-all with a scoped read-only allowlist. Today that allowlist
includes `npm install -g*` (code-review) and `pip install semgrep*` (semgrep)
at `allow` — global package installs that execute third-party
pre/postinstall scripts, i.e. standing supply-chain RCE primitives. The fix
removes those two grants (they fall through to the catch-all `deny`), rewrites
the agents' prose to *verify tool presence and STOP* when missing, documents
the `ocr` data-egress axis, extends `validate-harness.sh` to reject any
`npm install*` / `pip install*` grant above `ask`, and amends ADR-0006 which
originally authorized the grants.

**Tech Stack:** Bash (harness validator + shell tests), YAML frontmatter
(`.opencode/agents/*.md`), Markdown (ADR amendment). No PHP, no SCSS, no JS.

## Origin

- **Issue:** #183 — "Review Agents Auto-Install Global Packages"
- **Type:** Security (commit type `fix` per `docs/agents/labels.md`)
- **Root cause:** Known and fully documented. ADR-0006 Decision point 2
  deliberately granted the install permissions; a six-model security review
  (6/6 consensus) flagged them as over-permissive. No `@debug` investigation
  is required — the issue *is* the completed review.

## Global constraints

- **TDD mandatory.** The only new *logic* is the `validate-harness.sh` check
  (Task 2) — it gets Red → Green. The agent-permission + prose edits (Task 1)
  are config/ doc changes with no standalone unit test; they are verified by
  grep + the regression guard added in Task 2.
- **Each commit leaves the repo green.** Task 1 (remove grants) lands first so
  the repo is clean when Task 2 adds the guard. Pre-commit does **not** run
  `validate-harness.sh` (verified: `.github/hooks/pre-commit` runs PHP/SCSS/JS
  linters, shellcheck, gitleaks, RCS + skill checks only), so neither commit
  is blocked by a transient harness failure.
- **Read-only contract preserved.** Both agents keep `edit: deny`, the bash
  catch-all `"*": deny`, `webfetch: deny`, and (for code-review) the scoped
  `task:` allowlist from ADR-0021. Only the two install grants are withdrawn.
  `command -v*` stays so the agents can still *check* tool presence.
- **Commit footers.** `Authored-by: glm-5.2` (from `agent.plan.model` =
  `zai-coding-plan/glm-5.2`), `Tested-by: deepseek-v4-pro` (from
  `agent.code-review.model` = `deepseek/deepseek-v4-pro`), `Signed-off-by:`
  resolved via `bash .github/scripts/resolve-identity.sh`. Closing ref
  `Fixes: #183` on Task 1; `Refs: #183` on Task 2.
- **shellcheck clean** at `--severity=warning` (enforced by pre-commit on
  every staged `.sh`).

## Acceptance criteria (from issue #183)

- [x] No agent `.md` grants `npm install*` or `pip install*` at `allow` — Task 1
- [x] Missing tools are reported with install instructions, not auto-installed — Task 1
- [x] `validate-harness.sh` fails on autonomous package-install grants — Task 2
- [x] The `ocr` axis documents data-egress implications — Task 1

## File structure

| File | Change | Task |
| :--- | :--- | :---: |
| `.opencode/agents/code-review.md` | Remove `npm install -g*` grant; rewrite ocr presence check to STOP; add `ocr` data-egress note | 1 |
| `.opencode/agents/semgrep.md` | Remove `pip install semgrep*` grant; rewrite presence check to STOP | 1 |
| `adr/0006-readonly-agent-permission-contract.md` | Append issue-#183 amendment recording the withdrawal | 1 |
| `.github/scripts/validate-harness.sh` | New check block: reject `npm install*` / `pip install*` above `ask` in agent frontmatter + inline `opencode.jsonc` | 2 |
| `tests/Shell/validate-harness_test.sh` | Tests 31–33: npm-allow caught, pip-allow caught, ask not flagged | 2 |

---

### Task 1: Remove autonomous install grants + update prose + amend ADR-0006

**Files:**
- Modify: `.opencode/agents/code-review.md` (frontmatter `:15-17`; Axis 1 `:64-70`)
- Modify: `.opencode/agents/semgrep.md` (frontmatter `:15-17`; Prerequisites `:30-33`)
- Modify: `adr/0006-readonly-agent-permission-contract.md` (append to `## Amendments`)

**Interfaces:** None — pure config/prose. Consumes ADR-0006 Decision point 2;
produces the amended rationale that Task 2's check message references.

- [x] **Step 1: Remove the `npm install -g*` grant from code-review.md**

In `.opencode/agents/code-review.md`, the bash allowlist (frontmatter) is:

```yaml
    "command -v*": allow
    "npm install -g*": allow
    "ocr*": allow
```

Delete the middle line so it reads:

```yaml
    "command -v*": allow
    "ocr*": allow
```

- [x] **Step 2: Rewrite the ocr presence instruction + add data-egress note**

In `.opencode/agents/code-review.md`, the Axis 1 block currently reads:

```markdown
#### Axis 1 — Ocr (PSR-12, style, lint)

Run `ocr` inline. Same flags and behaviour as before:
- Verify `command -v ocr` first; install via `npm install -g @alibaba-group/open-code-review` if missing.
- Choose `ocr review` (diff) or `ocr scan` (full scan) based on scope.
- Use `--audience agent --format json`.
- If `ocr` fails, report the error and stop — do not fall back to manual review.
```

Replace it with:

```markdown
#### Axis 1 — Ocr (PSR-12, style, lint)

Run `ocr` inline. Same flags and behaviour as before:
- Verify `command -v ocr` first; if missing, STOP and report the install
  command to the user (`npm install -g @alibaba-group/open-code-review`).
  Do NOT install autonomously — global npm installs execute third-party
  pre/postinstall scripts (supply-chain RCE risk; issue #183).
- Choose `ocr review` (diff) or `ocr scan` (full scan) based on scope.
- Use `--audience agent --format json`.
- If `ocr` fails, report the error and stop — do not fall back to manual review.

> **Data egress:** `ocr` transmits diff content to its cloud backend for
> analysis — reviewed code leaves the repo boundary via a third-party AI
> service. Acceptable for review (no secrets should be staged), but the
> coordinator does not control where `ocr` sends data.
```

- [x] **Step 3: Remove the `pip install semgrep*` grant from semgrep.md**

In `.opencode/agents/semgrep.md`, the bash allowlist (frontmatter) is:

```yaml
    "command -v*": allow
    "pip install semgrep*": allow
    "semgrep*": allow
```

Delete the middle line so it reads:

```yaml
    "command -v*": allow
    "semgrep*": allow
```

- [x] **Step 4: Rewrite the semgrep prerequisites**

In `.opencode/agents/semgrep.md`, the Prerequisites block currently reads:

```markdown
## Prerequisites

Verify `command -v semgrep` before running. Install via `pip install semgrep`
or from [semgrep/releases](https://github.com/semgrep/semgrep/releases).
```

Replace it with:

```markdown
## Prerequisites

Verify `command -v semgrep` before running. If missing, STOP and report the
install command to the user (`pip install semgrep` or a release from
[semgrep/releases](https://github.com/semgrep/semgrep/releases)). Do NOT
install autonomously — global pip installs execute third-party setup scripts
(supply-chain RCE risk; issue #183).
```

- [x] **Step 5: Amend ADR-0006**

Append this entry to the `## Amendments` section of
`adr/0006-readonly-agent-permission-contract.md` (after the existing
2026-07-21 issue-#184 entry):

```markdown
- **2026-07-22 (issue #183):** Decision point 2 granted `code-review` the
  `npm install -g*` bash permission and `semgrep` the `pip install semgrep*`
  permission, intending to let each agent auto-provision its toolchain. A
  six-model security review (issue #183, 6/6 consensus) flagged these as
  standing supply-chain RCE primitives — global npm/pip installs run
  third-party pre/postinstall scripts outside the repo boundary, so a
  prompt-injected diff could nudge a read-only agent to install an
  attacker-named package. Both grants are withdrawn; the agents now verify
  tool presence (`command -v`) and STOP with install instructions if the
  tool is missing instead of installing autonomously. The harness validator
  was extended to fail on any `npm install*` / `pip install*` grant above
  `ask`. The read-only contract (edit: deny + bash catch-all deny) is
  unchanged — only the toolchain auto-provision carve-out is withdrawn.
```

- [x] **Step 6: Verify the grants are gone and the read-only contract holds**

Run (expect zero matches for the grant lines, and a clean validator run):

```bash
grep -rnE '"(npm|pip) install[^"]*"[[:space:]]*:[[:space:]]*"?allow"?' .opencode/agents/ opencode.jsonc
# Expected: no output
bash .github/scripts/validate-harness.sh
# Expected: exit 0, no "claims read-only" violations for code-review/semgrep
```

- [ ] **Step 7: Commit**

```bash
git add .opencode/agents/code-review.md .opencode/agents/semgrep.md adr/0006-readonly-agent-permission-contract.md
git commit -S -m $'fix(review): remove autonomous package-install grants from read-only agents\n\nGlobal npm/pip installs execute third-party pre/postinstall scripts —\nstanding supply-chain RCE primitives for a prompt-injected diff (issue #183).\nWithdraw the code-review `npm install -g*` and semgrep `pip install semgrep*`\nallow grants; both agents now verify tool presence and STOP with install\ninstructions when the tool is missing. Documents the ocr data-egress axis.\nAmends ADR-0006 Decision point 2.\n\nFixes: #183\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

> *Use the canonical `$'...\n...'` ANSI-C quoting form — the commit-msg hook
> rejects literal `\n` sequences (ADR-0025). `Signed-off-by:` is filled by the
> value `resolve-identity.sh` prints, not the literal placeholder.*

---

### Task 2: Add the autonomous-install regression guard (TDD)

**Files:**
- Modify: `tests/Shell/validate-harness_test.sh` (add Tests 31–33 before the
  `# ── Summary` section near line 1310)
- Modify: `.github/scripts/validate-harness.sh` (insert a new check block after
  the throwaway-dir check, line ~786, before the stale-plan check, line ~788)

**Interfaces:**
- Consumes: `${AGENT_MD_FILES[@]}` array and `${REPO_ROOT}` (both already
  defined earlier in `validate-harness.sh`); the `err` helper.
- Produces: a validator that exits non-zero when any agent frontmatter or
  inline `opencode.jsonc` entry grants `(npm|pip) install*` at `allow`.

- [x] **Step 1: Write the failing tests (Red)**

In `tests/Shell/validate-harness_test.sh`, insert the following three tests
immediately before the `# ── Summary ──` line:

````bash
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
````

- [x] **Step 2: Run the tests to verify they FAIL**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: Tests 31 & 32 FAIL ("Did not detect …"), Test 33 PASSES (vacuously —
the check does not exist yet, so nothing is flagged).

- [x] **Step 3: Implement the check (Green)**

In `.github/scripts/validate-harness.sh`, insert this block immediately after
the throwaway-dir edit/rm check (the block ending around line 786 with the
`done` that closes the `prototypes/**` / `tests/**` loop) and before the
`# ── Checking for stale plan files ──` comment:

```bash
# ── Check for autonomous package-install grants (npm/pip) ─────────────────────

echo "── Checking for autonomous package-install grants (npm install*/pip install*) ──"

# Global npm/pip installs execute third-party pre/postinstall scripts = arbitrary
# code execution outside the repo boundary. A prompt-injected diff could nudge a
# read-only agent to install an attacker-named package (supply-chain RCE). No
# agent may grant 'npm install*' or 'pip install*' above 'ask'. See issue #183
# and ADR-0006 (amendment).

for agent_file in "${AGENT_MD_FILES[@]}"; do
	fm=$(awk 'NR==1 && /^---$/ { fm=1; next } fm && /^---$/ { exit } fm { print }' "$agent_file")
	pkg=$(echo "$fm" | grep -noE '"(npm|pip) install[^"]*"[[:space:]]*:[[:space:]]*"?allow"?' 2>/dev/null) || true
	if [ -n "$pkg" ]; then
		while IFS= read -r line; do
			err "${agent_file}:${line%%:*}: autonomous package-install grant at 'allow' is a supply-chain RCE risk (issue #183) — remove or downgrade to 'ask'"
		done <<< "$pkg"
	fi
done

# Inline agents defined in opencode.jsonc
OPENCODE_CFG="${REPO_ROOT}/opencode.jsonc"
if [ -f "$OPENCODE_CFG" ]; then
	inline_pkg=$(grep -noE '"(npm|pip) install[^"]*"[[:space:]]*:[[:space:]]*"?allow"?' "$OPENCODE_CFG" 2>/dev/null) || true
	if [ -n "$inline_pkg" ]; then
		while IFS= read -r line; do
			err "opencode.jsonc:${line%%:*}: autonomous package-install grant at 'allow' is a supply-chain RCE risk (issue #183) — remove or downgrade to 'ask'"
		done <<< "$inline_pkg"
	fi
fi
```

- [x] **Step 4: Run the tests to verify they PASS**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: Tests 31, 32, 33 all PASS; full suite reports `0 failed`.

- [x] **Step 5: Confirm the guard passes on the real repo (Task 1 already removed the grants)**

Run: `bash .github/scripts/validate-harness.sh`
Expected: exit 0; the new "Checking for autonomous package-install grants"
section prints with no `ERROR` lines.

- [x] **Step 6: Confirm shellcheck is clean (pre-commit parity)**

Run: `shellcheck --severity=warning .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh`
Expected: no output (clean).

- [x] **Step 7: Commit**

```bash
git add .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh
git commit -S -m $'test(harness): reject autonomous npm/pip install grants\n\nAdd a validate-harness check that fails when any agent frontmatter or\ninline opencode.jsonc entry grants `npm install*` or `pip install*` above\n`ask`. Global package installs run third-party scripts (supply-chain RCE).\nTests 31-33 cover: npm allow caught, pip allow caught, ask not flagged.\n\nRefs: #183\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

## Verification (after both tasks)

1. `bash tests/Shell/validate-harness_test.sh` → all green, 0 failed.
2. `bash .github/scripts/validate-harness.sh` → exit 0, no install-grant errors.
3. `shellcheck --severity=warning .github/scripts/validate-harness.sh` → clean.
4. Grep confirms no `allow`-level install grants remain:
   `grep -rnE '"(npm|pip) install[^"]*"[[:space:]]*:[[:space:]]*"?allow"?' .opencode/agents/ opencode.jsonc` → no output.
5. `/check` (pre-push gate) passes.

## Notes

- **Why not route through `@debug`:** the routing matrix maps Security → the
  bug path, but Step 8 permits writing the fix plan directly when the root
  cause is already known. Here the issue *is* a completed six-model security
  review with exact locations, rationale, and acceptance criteria — there is
  no unknown root cause for `@debug`'s 6-phase loop to discover.
- **Scope is npm/pip only.** The issue names `npm install*` / `pip install*`
  specifically. Broader package-manager coverage (`gem`, `cargo`, `go`, `yarn`)
  is a deliberate YAGNI deferral; the regex `"(npm|pip) install[^"]*"` is
  trivially extensible if a follow-up asks for it.
- **`ask` is the permitted floor.** A future agent that genuinely needs an
  interactive install gate can set `"npm install*": "ask"` and still pass the
  validator. Task 1 removes the grants entirely (→ catch-all `deny`) because
  read-only review agents should never install — they report and STOP.
