# @opencode-ai/plugin Version Parity Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Eliminate the `@opencode-ai/plugin` SDK version skew between the two
`package.json` manifests, pin the unpinned `@slkiser/opencode-quota` plugin,
and add a permanent regression guard so the skew cannot recur silently.

**Architecture:** The root `package.json` (type-checking/tests) and
`.opencode/package.json` (runtime) must resolve the same SDK version. A new
`check_sdk_version_parity()` function in `validate-harness.sh` enforces this
at lint time. The third-party quota plugin moves from an unpinned runtime
config reference to a locked dependency. Dead config keys are removed.

**Tech Stack:** bash (validate-harness.sh), JSONC config, npm lockfiles,
node:test (TS plugin tests).

## Global constraints

- Both `package.json` files must pin `@opencode-ai/plugin` to the **exact same
  version** (currently `1.18.4` — the version the runtime already uses).
- `@slkiser/opencode-quota` must be pinned with an **exact** version string
  (no `^`/`~` ranges) in `.opencode/package.json`.
- All new/modified `.sh` files carry an RCS header + vim modeline (see
  `rcs-header` skill).
- Conventional Commits type: `fix` (issue type is Bug per `labels.md`).
- Branch: `fix/<username>-<hash>-plugin-sdk-version-parity` via
  `bash .github/scripts/new-branch.sh fix plugin-sdk-version-parity`.

## Verified facts (triage)

| Claim in issue | Actual |
| --- | --- |
| Root `package.json` pins `1.17.15` | **Confirmed** — `package.json:8` |
| `.opencode/package.json` pins `1.18.3` | **Stale** — actual is `1.18.4` |
| Quota plugin unpinned | **Confirmed** — not in either lockfile; runtime-resolved |
| Quota plugin declared twice | **Confirmed** — `opencode.jsonc:13` + `tui.jsonc:5` |
| `maintainerAnnouncements.enabled: true` | **Confirmed** — `quota-toast.json:11` |
| `validate-harness.sh` does not exist yet | **Wrong** — it exists (980 lines, 38+ tests); issue means *extend* it |

---

### Task 1: SDK version parity guard + alignment

**Files:**
- Modify: `.github/scripts/validate-harness.sh` (add `check_sdk_version_parity()` section)
- Modify: `tests/Shell/validate-harness_test.sh` (add test cases 39–40)
- Modify: `package.json:8` (`1.17.15` → `1.18.4`)
- Modify: `package-lock.json` (regenerate after version bump)

**Interfaces:**
- Produces: `check_sdk_version_parity()` — reads `@opencode-ai/plugin` from
  both `package.json` and `.opencode/package.json`, calls `err()` on mismatch.

- [ ] **Step 1: Write the failing test (mismatch → ERROR)**

Add to the end of `tests/Shell/validate-harness_test.sh`, before the summary
line (`print_summary "validate-harness"`). Follow the existing temp-repo
pattern:

```bash
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
```

- [ ] **Step 2: Write the failing test (match → PASS)**

Add immediately after Test 39:

```bash
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: Test 39 FAILS ("Did not detect SDK version mismatch") — the parity
check does not exist yet. Test 40 PASSES trivially (nothing flags it).

- [ ] **Step 4: Implement the parity check**

Add a new section to `.github/scripts/validate-harness.sh`, placed before the
final summary section (after the existing "Checking git add/git stage verdict
parity" block near line 850). Follow the existing echo/err/warn pattern:

```bash
# ── Check @opencode-ai/plugin SDK version parity ──────────────────────────────

echo "── Checking @opencode-ai/plugin SDK version parity ──"

ROOT_PKG="${REPO_ROOT}/package.json"
SUB_PKG="${HARNESS_DIR}/package.json"

if [ -f "$ROOT_PKG" ] && [ -f "$SUB_PKG" ]; then
	# Extract the @opencode-ai/plugin version from each manifest.
	# Uses node for reliable JSON parsing (node is already a prerequisite).
	root_ver=$(node -e "
		const p = require('$ROOT_PKG');
		const deps = { ...(p.dependencies||{}), ...(p.devDependencies||{}) };
		process.stdout.write(deps['@opencode-ai/plugin'] || '');
	" 2>/dev/null || echo "")
	sub_ver=$(node -e "
		const p = require('$SUB_PKG');
		const deps = { ...(p.dependencies||{}), ...(p.devDependencies||{}) };
		process.stdout.write(deps['@opencode-ai/plugin'] || '');
	" 2>/dev/null || echo "")

	if [ -z "$root_ver" ] && [ -z "$sub_ver" ]; then
		# Neither manifest declares the SDK — skip (not all repos use it).
		ok "Neither manifest declares @opencode-ai/plugin (skipped)"
	elif [ -z "$root_ver" ] || [ -z "$sub_ver" ]; then
		err "SDK version mismatch: @opencode-ai/plugin declared in only one manifest (root='${root_ver:-<missing>}', .opencode='${sub_ver:-<missing>}')"
	elif [ "$root_ver" != "$sub_ver" ]; then
		err "SDK version mismatch: root package.json pins '${root_ver}', .opencode/package.json pins '${sub_ver}' — type-check and runtime must use the same SDK"
	else
		ok "SDK version aligned: @opencode-ai/plugin@${root_ver} in both manifests"
	fi
fi
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: Test 39 PASS, Test 40 PASS.

- [ ] **Step 6: Fix the real manifest**

Change `package.json` line 8 from `"1.17.15"` to `"1.18.4"`:

```diff
-		"@opencode-ai/plugin": "1.17.15",
+		"@opencode-ai/plugin": "1.18.4",
```

Then regenerate the root lockfile:

```bash
npm install
```

- [ ] **Step 7: Verify plugin tests pass against the new SDK**

Run: `npm run test:plugin`
Expected: All 5 plugin test files PASS — the hook names
`experimental.chat.system.transform` and `experimental.session.compacting`
must still be valid `Hooks` keys in the 1.18.4 SDK.

If any test FAILS, a hook was renamed between 1.17.15 and 1.18.4 — this is the
silent-inert bug the issue describes, now made loud. Consult the SDK changelog
and update the plugin source + tests accordingly.

- [ ] **Step 8: Run validate-harness.sh on the real repo**

Run: `bash .github/scripts/validate-harness.sh`
Expected: `OK: SDK version aligned: @opencode-ai/plugin@1.18.4 in both manifests`

- [ ] **Step 9: Commit**

```bash
git add .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh package.json package-lock.json
git commit -S -m $'fix(plugin): align @opencode-ai/plugin SDK version across manifests\n\nRoot package.json pinned 1.17.15 while .opencode/package.json pinned\n1.18.4, causing compile-time hook-name guards to type-check against\nthe wrong SDK. Aligned both to 1.18.4 and added a permanent parity\ncheck to validate-harness.sh.\n\nFixes: #185\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 2: Pin the quota plugin

**Files:**
- Modify: `.opencode/package.json` (add pinned dependency)
- Modify: `.opencode/package-lock.json` (regenerate)
- Test: `tests/Shell/plugin_supply_chain_test.sh` (new file)

**Interfaces:**
- Produces: `@slkiser/opencode-quota` locked at an exact version in
  `.opencode/package.json`.

- [ ] **Step 1: Write the failing test**

Create `tests/Shell/plugin_supply_chain_test.sh`:

```bash
#!/usr/bin/env bash
# $KYAULabs: plugin_supply_chain_test.sh kyau@nova 2026/07/22 -0700 Exp $

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

# ── Test 1: @slkiser/opencode-quota is pinned with an exact version ────────────

echo ""
echo "── Test 1: quota plugin pinned with exact version ──"

SUB_PKG="$REPO_ROOT/.opencode/package.json"
if [ ! -f "$SUB_PKG" ]; then
	fail ".opencode/package.json not found"
else
	# Extract the version string for @slkiser/opencode-quota
	quota_ver=$(node -e "
		const p = require('$SUB_PKG');
		const deps = { ...(p.dependencies||{}), ...(p.devDependencies||{}) };
		process.stdout.write(deps['@slkiser/opencode-quota'] || '');
	" 2>/dev/null || echo "")

	if [ -z "$quota_ver" ]; then
		fail "@slkiser/opencode-quota not declared in .opencode/package.json"
	elif echo "$quota_ver" | grep -qE '^\^|~|>|<' ; then
		fail "@slkiser/opencode-quota uses a range ('$quota_ver') — must be exact"
	else
		pass "@slkiser/opencode-quota pinned at exact version $quota_ver"
	fi
fi

# ── Test 2: lockfile contains the pinned quota plugin ─────────────────────────

echo "── Test 2: lockfile contains pinned quota plugin ──"

SUB_LOCK="$REPO_ROOT/.opencode/package-lock.json"
if grep -q '"@slkiser/opencode-quota"' "$SUB_LOCK" 2>/dev/null; then
	pass "Quota plugin present in .opencode/package-lock.json"
else
	fail "Quota plugin NOT in .opencode/package-lock.json (run npm install in .opencode/)"
fi

print_summary "plugin_supply_chain"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/plugin_supply_chain_test.sh`
Expected: Test 1 FAILS ("not declared in .opencode/package.json").

- [ ] **Step 3: Discover the current published version**

Run: `npm view @slkiser/opencode-quota version`
Expected: prints a version like `X.Y.Z`. Record it.

- [ ] **Step 4: Pin the dependency**

Add the exact version to `.opencode/package.json`:

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "1.18.4",
    "@slkiser/opencode-quota": "<VERSION_FROM_STEP_3>"
  }
}
```

Then regenerate the lockfile:

```bash
cd .opencode && npm install && cd ..
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bash tests/Shell/plugin_supply_chain_test.sh`
Expected: Test 1 PASS, Test 2 PASS.

- [ ] **Step 6: Commit**

```bash
git add .opencode/package.json .opencode/package-lock.json tests/Shell/plugin_supply_chain_test.sh
git commit -S -m $'fix(plugin): pin @slkiser/opencode-quota with exact version\n\nThe quota plugin was referenced unpinned in opencode.jsonc, letting\nthe runtime resolve the latest from npm on every startup. Pinned it\nas an exact-version dependency in .opencode/package.json.\n\nRefs: #185\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 3: Config cleanup — dead plugin key + announcements

**Files:**
- Modify: `tui.jsonc` (remove `plugin` key)
- Modify: `opencode-quota/quota-toast.json:11` (`true` → `false`)
- Test: `tests/Shell/plugin_supply_chain_test.sh` (extend with Tests 3–4)

**Interfaces:**
- None — these are leaf config files consumed by the OpenCode runtime.

- [ ] **Step 1: Write the failing tests**

Append to `tests/Shell/plugin_supply_chain_test.sh`, before `print_summary`:

```bash
# ── Test 3: tui.jsonc has no plugin key ────────────────────────────────────────

echo ""
echo "── Test 3: tui.jsonc contains no plugin key ──"

TUI_JSONC="$REPO_ROOT/tui.jsonc"
if [ ! -f "$TUI_JSONC" ]; then
	fail "tui.jsonc not found"
elif grep -q '"plugin"' "$TUI_JSONC" 2>/dev/null; then
	fail "tui.jsonc still contains a 'plugin' key (dead duplicate of opencode.jsonc)"
else
	pass "tui.jsonc has no plugin key"
fi

# ── Test 4: maintainerAnnouncements.enabled is false ──────────────────────────

echo "── Test 4: maintainerAnnouncements.enabled is false ──"

QUOTA_TOAST="$REPO_ROOT/opencode-quota/quota-toast.json"
announcements=$(node -e "
	const p = require('$QUOTA_TOAST');
	process.stdout.write(String(p.maintainerAnnouncements?.enabled ?? 'undefined'));
" 2>/dev/null || echo "error")

if [ "$announcements" = "false" ]; then
	pass "maintainerAnnouncements.enabled is false"
else
	fail "maintainerAnnouncements.enabled is '$announcements' (expected false)"
fi
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash tests/Shell/plugin_supply_chain_test.sh`
Expected: Test 3 FAILS ("still contains a 'plugin' key"), Test 4 FAILS
("is 'true'").

- [ ] **Step 3: Remove the dead plugin key from tui.jsonc**

Change `tui.jsonc` from:

```jsonc
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["@slkiser/opencode-quota"]
}
```

to:

```jsonc
{
  "$schema": "https://opencode.ai/tui.json"
}
```

- [ ] **Step 4: Disable maintainerAnnouncements**

Change `opencode-quota/quota-toast.json` line 11 from `"enabled": true` to
`"enabled": false`:

```json
  "maintainerAnnouncements": {
    "enabled": false,
    "home": false
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash tests/Shell/plugin_supply_chain_test.sh`
Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add tui.jsonc opencode-quota/quota-toast.json tests/Shell/plugin_supply_chain_test.sh
git commit -S -m $'fix(config): remove dead tui.jsonc plugin key, disable maintainer announcements\n\nThe quota plugin was declared in both opencode.jsonc and tui.jsonc;\nthe tui.jsonc entry is a dead duplicate. Removed it. Disabled\nmaintainerAnnouncements.enabled in quota-toast.json.\n\nRefs: #185\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

## Verification (after all tasks)

- [ ] Run `bash tests/Shell/validate-harness_test.sh` — all tests pass including
      the new SDK parity tests (39–40).
- [ ] Run `bash tests/Shell/plugin_supply_chain_test.sh` — all 4 tests pass.
- [ ] Run `npm run test:plugin` — all 5 plugin test files pass against SDK 1.18.4.
- [ ] Run `bash .github/scripts/validate-harness.sh` on the real repo — clean exit.
- [ ] Confirm both manifests show the same version:
      `grep @opencode-ai/plugin package.json .opencode/package.json`
- [ ] Run `/check` (the pre-push gate).

## Acceptance criteria mapping

| Criterion | Task |
| --- | --- |
| Both package.json files resolve the same @opencode-ai/plugin version | Task 1 |
| The quota plugin is version-pinned or vendored locally | Task 2 |
| tui.jsonc contains no plugin key | Task 3 |
| quota-toast.json has maintainerAnnouncements.enabled: false | Task 3 |
| validate-harness.sh checks for SDK version parity (recommended) | Task 1 |
