# Unpinned npx Supply-Chain Hardening Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Pin the three unpinned `npx` invocations in `opencode.jsonc` (add
`-y` + `pkg@version`) and add a permanent regression guard so unpinned `npx`
in a command array cannot recur.

**Architecture:** Three `"command": ["npx", …]` arrays in `opencode.jsonc`
spawn third-party code at runtime (the active `stylelint` LSP server + the two
commented-out MCP servers `deepseek-websearch` and `mcp-searxng`). Each is
pinned to an exact version and given the `-y` flag. A new
`validate-harness.sh` check scans `opencode.jsonc` for `npx` command arrays
and fails when one lacks `-y` or a `pkg@x.y.z` pin — closing the class the way
#183 closed the autonomous-install-grant class. The quota plugin is **already
pinned by #185** and is explicitly not touched.

**Tech Stack:** JSONC config (`opencode.jsonc`), Markdown doc
(`.opencode/docs/mcp.md`), Bash (`validate-harness.sh` + shell tests). No PHP,
no SCSS, no JS application code.

## Origin

- **Issue:** #205 — "Unpinned MCP Servers / npx Packages"
- **Type:** Security (commit type `fix` per `docs/agents/labels.md`)
- **Root cause:** Known and fully documented. #205 is itself a completed
  4/6-sub-review security audit with exact line locations, rationale, and
  acceptance criteria. No `@debug` investigation is required (same routing
  decision as #183 and #202 — see Notes).

## Acceptance criteria status (triage-verified)

| # | Criterion (from issue #205) | Status | Owner |
| :--- | :--- | :--- | :--- |
| 1 | Every npx invocation is pinned and passes `-y` | ❌ **NOT done** | **This plan** (Task 1) |
| 2 | The quota plugin is version-pinned or vendored | ✅ **DONE** | #185 (commit `0f16624`) — `.opencode/package.json:4` pins `@slkiser/opencode-quota: 4.0.1`; lockfile committed; `tests/Shell/plugin_supply_chain_test.sh` Tests 1–2 guard it |
| 3 | `tui.jsonc` has no plugin key | ✅ **DONE** | #185 (commit `5dad628`) — `tui.jsonc` is `$schema`-only; `plugin_supply_chain_test.sh` Test 3 guards it |

**This plan addresses criterion #1 only.** Criteria #2 and #3 are already
satisfied and guarded by #185; this plan must not regress them (do not touch
`.opencode/package.json`, the quota lockfile, or `tui.jsonc`).

## Global constraints

- **TDD mandatory.** The only new *logic* is the `validate-harness.sh` check
  (Task 2) — it gets Red → Green. The `opencode.jsonc` + `mcp.md` edits
  (Task 1) are config/doc changes with no standalone unit test; they are
  verified by grep + the Task 2 guard run against the real repo.
- **Each commit leaves the repo green.** Task 1 (pin the sites) lands first so
  the repo is clean when Task 2 adds the guard. Pre-commit does **not** run
  `validate-harness.sh` (it runs PHP/SCSS/JS linters, shellcheck, gitleaks,
  RCS + skill checks only — verified in the #183 plan), so neither commit is
  blocked by a transient harness failure.
- **Do not touch the quota plugin.** #185 pinned `@slkiser/opencode-quota` to
  `4.0.1` in `.opencode/package.json` with a committed lockfile and a
  regression test. Re-pinning, re-versioning, or vendoring it here would risk
  regressing #185's working guard. The `opencode.jsonc:13`
  `"plugin": ["@slkiser/opencode-quota"]` entry stays bare-name — opencode
  resolves it from `node_modules` (locked at 4.0.1), not via runtime fetch.
- **Conventional Commits type `fix`** (issue type Security → `fix`). Branch:
  `fix/<username>-<hash>-unpinned-npx-supply-chain` via
  `bash .github/scripts/new-branch.sh fix unpinned-npx-supply-chain`.
- **Commit footers.** `Authored-by: glm-5.2` (from `agent.plan.model` =
  `zai-coding-plan/glm-5.2`), `Tested-by: deepseek-v4-pro` (from
  `agent.code-review.model` = `deepseek/deepseek-v4-pro`), `Signed-off-by:`
  resolved via `bash .github/scripts/resolve-identity.sh`. Closing ref
  `Fixes: #205` on Task 1 (the criterion-#1 fix); `Refs: #205` on Task 2 (the
  guard). `Fixes:` sits at the top of the footer, immediately above
  `Authored-by:` (ADR-0010).
- **Commit quoting:** use the canonical `$'...\n...'` ANSI-C quoting form (the
  `commit-msg` hook rejects literal `\n` per ADR-0025). Never use multiple
  `-m` flags.
- **shellcheck clean** at `--severity=warning` (enforced by pre-commit on
  every staged `.sh`).
- **Version strings are registry-dependent.** The three concrete versions must
  be discovered via `npm view` (Task 1 Step 1). This hits the npm registry —
  gated by `AGENTS.md` ("Do not access external APIs without explicit
  permission"). The user's approval to run those three `npm view` commands is
  captured at the plan-approval gate before execution begins. If approval is
  withheld, the user supplies the three version strings manually.

## File structure

| File | Change | Task |
| :--- | :--- | :---: |
| `opencode.jsonc` | Pin the 3 `npx` command arrays (`:35`, `:51`, `:62`) — add `-y` + `pkg@version` | 1 |
| `.opencode/docs/mcp.md` | Note the pinning policy + `-y` rationale (`:21`) | 1 |
| `.github/scripts/validate-harness.sh` | New check block: reject unpinned/`-y`-less `npx` command arrays in `opencode.jsonc` | 2 |
| `tests/Shell/validate-harness_test.sh` | 3 new tests for the guard (Red → Green) | 2 |

**Not in scope (do not touch):**
- `.opencode/package.json`, `.opencode/package-lock.json` — #185's quota-plugin
  pin (criterion #2).
- `tui.jsonc` — already clean (criterion #3, guarded by #185's test).
- `opencode-quota/quota-toast.json` — #185's config cleanup.

---

### Task 1: Pin the three npx invocations + update mcp.md

**Files:**
- Modify: `opencode.jsonc:35` (stylelint LSP command — **active**)
- Modify: `opencode.jsonc:51` (deepseek-websearch MCP command — commented-out)
- Modify: `opencode.jsonc:62` (mcp-searxng MCP command — commented-out)
- Modify: `.opencode/docs/mcp.md:21` (pinning note)

**Interfaces:** None — pure config/doc. Produces the pinned state that Task 2's
guard verifies (must pass with 0 violations).

- [ ] **Step 1: Versions confirmed at plan approval**

> ✅ The user supplied all three versions at the approval gate:
> `@stylelint/language-server` → `1.1.1`, `@kyaulabs/deepseek-websearch` →
> `1.0.4`, `mcp-searxng` → `1.12.0`. The `deepseek-websearch` contingency
> below did **not** fire (it is published under that name). The `npm view`
> block and contingency text are retained for audit provenance only;
> **do not run them** — bake the versions above directly into Steps 2–4.

### Original discovery step (audit provenance — superseded, do not run)

- [ ] **Step 1 (original): Discover the three current published versions**

> ⚠️ **This step hits the npm registry.** It is gated on the user's explicit
> approval captured at the plan-approval gate. Do not run until approval is
> confirmed.

Run each command and record the printed version:

```bash
npm view @stylelint/language-server version
npm view @kyaulabs/deepseek-websearch version
npm view mcp-searxng version
```

Record three values — call them `1.1.1`, `1.0.4`,
`1.12.0` (each `X.Y.Z`).

> **Contingency — `@kyaulabs/deepseek-websearch` may not be published under
> that exact name.** The `opencode.jsonc` comment says "Upstream:
> kyaulabs/deepseek-websearch-mcp". If `npm view @kyaulabs/deepseek-websearch`
> returns a 404 / exits non-zero, check the GitHub repo
> `kyaulabs/deepseek-websearch-mcp` `package.json` for the published npm name
> (it may be unscoped or differently scoped). If the package is GitHub-only
> (not on the npm registry at all), it cannot be `npx`-pinned — STOP and
> escalate to the user (the fix for that one site may need to switch from
> `npx` to a `node`/path-based spawn, which is out of scope for this plan).
> Do **not** guess a name or version.

- [ ] **Step 2: Pin the stylelint LSP command (opencode.jsonc:35)**

In `opencode.jsonc`, the `lsp.stylelint.command` array currently reads:

```jsonc
      "command": ["npx", "@stylelint/language-server", "--stdio"],
```

Change it to (insert `"-y"` after `"npx"` and pin the package):

```jsonc
      "command": ["npx", "-y", "@stylelint/language-server@1.1.1", "--stdio"],
```

- [ ] **Step 3: Pin the deepseek-websearch MCP command (opencode.jsonc:51)**

The commented-out `deepseek-websearch` block's command line currently reads:

```jsonc
//   "command": ["npx", "@kyaulabs/deepseek-websearch"],
```

Change it to:

```jsonc
//   "command": ["npx", "-y", "@kyaulabs/deepseek-websearch@1.0.4"],
```

- [ ] **Step 4: Pin the mcp-searxng MCP command (opencode.jsonc:62)**

The commented-out `searxng` block's command line currently reads:

```jsonc
//   "command": ["npx", "mcp-searxng"],
```

Change it to:

```jsonc
//   "command": ["npx", "-y", "mcp-searxng@1.12.0"],
```

- [ ] **Step 5: Update the mcp.md pinning note (`.opencode/docs/mcp.md:21`)**

The "Available Servers" section currently contains the line:

```markdown
Both servers run as `type: "local"` MCP servers, spawned via `npx`.
```

Replace it with:

```markdown
Both servers run as `type: "local"` MCP servers, spawned via `npx`. Each
`npx` invocation is version-pinned (`pkg@x.y.z`) and passes `-y` so the
non-interactive runtime spawn auto-installs the exact pinned version instead
of hanging on an install prompt — see `opencode.jsonc` for the current
versions. Pinning closes the supply-chain typosquat / moving-target risk
(issue #205). The two servers ship commented-out by default; uncommenting a
block inherits the pinned, `-y`-flagged command (safe-by-default).
```

- [ ] **Step 6: Verify the three sites are pinned and carry `-y`**

Run:

```bash
grep -nE '"command"[[:space:]]*:[[:space:]]*\[[[:space:]]*"npx"' opencode.jsonc
```

Expected: exactly **3** lines printed (one per `npx` command array). Each line
must contain the literal `"-y"` **and** an `@<digit>` version pin. If any line
is missing either, fix it before committing.

```bash
# Belt-and-suspenders: confirm no bare npx command array lacks -y or a pin.
grep -nE '"command"[[:space:]]*:[[:space:]]*\[[[:space:]]*"npx"' opencode.jsonc \
  | grep -vE '"-y"' && echo "MISSING -y" || echo "all carry -y"
grep -nE '"command"[[:space:]]*:[[:space:]]*\[[[:space:]]*"npx"' opencode.jsonc \
  | grep -vE '@[0-9]' && echo "MISSING pin" || echo "all pinned"
```

Expected: `all carry -y` and `all pinned` (the `&& echo MISSING` branches must
not fire).

- [ ] **Step 7: Commit**

```bash
git add opencode.jsonc .opencode/docs/mcp.md
git commit -S -m $'fix(security): pin npx invocations in opencode.jsonc\n\nThree npx command arrays spawned third-party code at runtime with no\nversion pin and no -y flag: the active stylelint LSP server plus the two\ncommented-out MCP servers (deepseek-websearch, mcp-searxng). A compromised\nor typosquatted release would execute with plugin/LSP privileges on every\nstartup. Each is now pinned to an exact version (pkg@x.y.z) and passes -y\nso the non-interactive spawn auto-installs the pinned version instead of\nhanging on the install prompt. The two commented-out MCP blocks are pinned\ntoo so the documented opt-in path (mcp.md) is safe-by-default when\nuncommented. The quota plugin was already pinned by #185 and is untouched.\n\nFixes: #205\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

> *Use the canonical `$'...\n...'` ANSI-C quoting form — the commit-msg hook
> rejects literal `\n` sequences (ADR-0025). `Signed-off-by:` is filled by the
> value `resolve-identity.sh` prints, not the literal placeholder.*

---

### Task 2: Add the unpinned-npx regression guard (TDD)

**Files:**
- Modify: `tests/Shell/validate-harness_test.sh` (add 3 tests before the
  `# ── Summary` section / final `print_summary` invocation)
- Modify: `.github/scripts/validate-harness.sh` (insert a new check block after
  the autonomous package-install grants block)

**Interfaces:**
- Consumes: `${REPO_ROOT}` and the `err` helper (both already defined earlier
  in `validate-harness.sh`); the `opencode.jsonc` at repo root.
- Produces: a validator that exits non-zero when any `npx` command array in
  `opencode.jsonc` lacks `"-y"` or a `pkg@x.y.z` pin.

**The check rule (encode exactly):**

For every line in `opencode.jsonc` matching
`"command"[[:space:]]*:[[:space:]]*\[[[:space:]]*"npx"` (an `npx` command
array — these appear only under `lsp.*.command` and `mcp.*.command`): the line
MUST contain the literal `"-y"` AND match `@[0-9]` (an `@` immediately
followed by a digit = the version pin; this ignores the `@scope` prefix of
scoped packages, which is always `@<letter>). Commented-out blocks (`// …`)
are checked too — they are the documented opt-in template and must be
safe-by-default when uncommented.

- [ ] **Step 1: Write the failing tests (Red)**

In `tests/Shell/validate-harness_test.sh`, insert the following three tests
immediately before the final `print_summary` invocation (search for
`print_summary` and insert above it). Each test builds a throwaway repo with
an `opencode.jsonc` containing an `npx` command array and asserts on the
validator's output.

````bash
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
````

- [ ] **Step 2: Run the tests to verify they FAIL**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: Test 1 FAILS ("Did not detect bare unpinned npx command array") and
Test 3 FAILS ("Did not detect pinned npx missing -y") — the check does not
exist yet. Test 2 PASSES vacuously (nothing is flagged either way). The Red
signal is Tests 1 and 3.

- [ ] **Step 3: Implement the check (Green)**

In `.github/scripts/validate-harness.sh`, insert this block immediately AFTER
the autonomous package-install grants block — search for the section that
prints `Checking for autonomous package-install grants` (added by #183) and
insert this new block right after that block's closing `fi`, before whatever
check follows it (the stale-plan check):

```bash
# ── Check for unpinned npx invocations in opencode.jsonc ─────────────────────

echo "── Checking for unpinned npx in opencode.jsonc command arrays ──"

# npx command arrays (lsp.*.command, mcp.*.command) spawn third-party code at
# runtime with plugin/LSP privileges. Each MUST (a) pass -y so a non-interactive
# spawn does not hang on the install prompt, and (b) pin the package to an exact
# version (pkg@x.y.z) so a compromised or typosquatted release cannot execute.
# See issue #205. Commented-out blocks are checked too — they are the documented
# opt-in template (mcp.md) and must be safe-by-default when uncommented. The
# check is line-local (command arrays are single-line per opencode config
# convention); @[0-9] matches the version pin and ignores the @scope prefix.

NPX_CFG="${REPO_ROOT}/opencode.jsonc"
if [ -f "$NPX_CFG" ]; then
	while IFS= read -r hit; do
		[ -z "$hit" ] && continue
		lineno="${hit%%:*}"
		line="${hit#*:}"
		if ! printf '%s' "$line" | grep -qF '"-y"'; then
			err "opencode.jsonc:${lineno}: npx command array missing '-y' (issue #205) — add \"-y\" after \"npx\" so the non-interactive spawn does not hang on the install prompt"
		fi
		if ! printf '%s' "$line" | grep -qE '@[0-9]'; then
			err "opencode.jsonc:${lineno}: npx command array unpinned (issue #205) — pin the package as pkg@x.y.z so a compromised/typosquatted release cannot execute"
		fi
	done < <(grep -nE '"command"[[:space:]]*:[[:space:]]*\[[[:space:]]*"npx"' "$NPX_CFG" 2>/dev/null)
fi
```

> *The process-substitution `< <(grep …)` form means grep's non-zero exit
> (no matches) does not trip `set -e`; the loop body simply does not run.
> `err` accumulates a violation and the script exits non-zero at its final
> summary — it does not abort mid-loop, so both axes (`-y` and pin) are
> reported per line.*

- [ ] **Step 4: Run the tests to verify they PASS**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: all three new tests PASS; full suite reports `0 failed`.

- [ ] **Step 5: Run the validator against the REAL repo (Task 1 already pinned everything)**

Run: `bash .github/scripts/validate-harness.sh`
Expected: the new "Checking for unpinned npx in opencode.jsonc command arrays"
section prints with **no** `ERROR` lines (Task 1 pinned all three sites). If
any `ERROR` prints, do NOT suppress it — Task 1 missed a site or a version
string is malformed; investigate.

- [ ] **Step 6: Confirm shellcheck is clean (pre-commit parity)**

Run: `shellcheck --severity=warning .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh`
Expected: no output (clean).

- [ ] **Step 7: Commit**

```bash
git add .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh
git commit -S -m $'test(harness): reject unpinned npx in opencode.jsonc command arrays\n\nAdd a validate-harness check that fails when any npx command array in\nopencode.jsonc (lsp.*.command / mcp.*.command) lacks -y or a pkg@x.y.z pin.\nUnpinned npx spawns third-party code at runtime with plugin/LSP privileges;\n-y prevents an interactive install prompt from hanging the non-interactive\nspawn. Three tests cover: bare unpinned caught, pinned+-y not flagged,\npinned-without--y caught. Commented-out blocks are checked too (the opt-in\ntemplate must be safe-by-default).\n\nRefs: #205\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

## Verification (after both tasks)

1. `bash tests/Shell/validate-harness_test.sh` → all green, 0 failed (incl. the
   3 new npx tests).
2. `bash .github/scripts/validate-harness.sh` → exit 0; the new "Checking for
   unpinned npx" section prints with no `ERROR` lines.
3. `shellcheck --severity=warning .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh` → clean.
4. Grep confirms every `npx` command array carries `-y` and a pin:
   `grep -nE '"command"[[:space:]]*:[[:space:]]*\[[[:space:]]*"npx"' opencode.jsonc`
   → 3 lines, each with `"-y"` and `@[0-9]`.
5. `bash tests/Shell/plugin_supply_chain_test.sh` → still green (confirms #185's
   quota-plugin + tui.jsonc guards were not regressed — neither file touched).
6. `/check` (pre-push gate: php-cs-fixer + stylelint + eslint + pest --coverage)
   passes. (No PHP changed, so pest coverage is a no-op for this diff; the real
   gates are the shell tests + shellcheck.)

## Notes

- **Why not route through `@debug`:** the routing matrix maps Security → the
  bug path, but the root cause is already fully known. #205 is itself a
  completed 4/6-sub-review security audit with exact line locations,
  rationale, and acceptance criteria — there is no unknown root cause for
  `@debug`'s 6-phase loop to discover. Same decision as #183 and #202.
- **Scope is npx only.** Two of #205's three acceptance criteria (#2 plugin
  pin, #3 tui.jsonc) were already satisfied by #185 and are guarded by
  `tests/Shell/plugin_supply_chain_test.sh`. This plan deliberately does not
  touch them; Task 2 Step 5 + Verification step 5 re-run that test to prove no
  regression.
- **No ADR amendment.** Unlike #183 (which *withdrew* a permission that
  ADR-0006 had explicitly granted), there is no prior ADR authorizing
  unpinned `npx`. This is additive hardening + a validator guard, matching
  #185 (which also added no ADR).
- **Why grep-based, not node-based.** The check is line-local because command
  arrays are single-line per opencode config convention (and all three current
  sites are single-line). This mirrors #183's npm/pip `grep -noE` approach for
  scanning `opencode.jsonc` for a forbidden config pattern. A more
  formatting-robust node-based variant (reusing the JSONC-stripper in
  `.github/scripts/inline-agent-permissions.js:40-72`, then walking
  `lsp.*.command` / `mcp.*.command`) is a deliberate YAGNI deferral — adopt it
  only if a multi-line command array ever appears.
- **`@[0-9]` is the pin discriminator.** A scoped package is `@scope/name`
  (`@` + letter); a version pin is `pkg@x.y.z` (`@` + digit). Matching
  `@[0-9]` therefore finds the pin and ignores the scope prefix, for both
  scoped (`@stylelint/language-server@1.2.3`) and unscoped (`mcp-searxng@1.2.3`)
  packages.
- **Commented-out blocks are checked deliberately.** The two MCP `npx` sites
  are inside `//`-commented blocks today, but `.opencode/docs/mcp.md` documents
  uncommenting them as the canonical opt-in path. A grep over the raw file
  matches commented lines too — which is the desired defense-in-depth: the
  template a user uncomments is already pinned.
