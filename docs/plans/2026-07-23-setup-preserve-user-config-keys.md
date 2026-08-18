# /setup User-Config Merge (Preserve env Keys) Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Stop `/setup` §3 from destroying the user-level
`~/.config/opencode/setup.json` on re-run by replacing the destructive
full-file `jq -n ... >` overwrite with an extracted script that deep-merges
user-scoped fields, preserving unrelated keys (`env.deepseek_api_key`,
`env.searxng_url`, etc.).

**Architecture:** A new `.github/scripts/setup-write-user-config.sh` reads the
twelve model/variant/identity values from environment variables, builds the
user-scoped object (identity + models + variants — never `env`), and
deep-merges it onto the existing file via `jq`'s `*` operator (missing file →
empty base). Write is atomic (`mktemp` → `mv`) and the script refuses to
clobber on missing values or a corrupt existing file. `/setup` §3 in
`.opencode/commands/setup.md` is reduced to invoking the script with all
twelve values. This mirrors the established repo pattern where every other
`/setup` operation is an extracted script with a sibling
`tests/Shell/*_test.sh` (`migrate-setup.sh`, `setup-scaffold.sh`,
`setup-substitute.sh`, `resolve-identity.sh`).

**Tech Stack:** Bash, `jq`, the `tests/Shell/` shell-test harness
(`tests/Shell/lib/test_helpers.sh`), Conventional Commits + signed commits.

## Global constraints

- New bash scripts: shebang `#!/usr/bin/env bash`, `set -euo pipefail`, RCS
  header on line 2, vim modeline footer `# vim: ft=sh sts=4 sw=4 ts=4 et :`
  (see `rcs-header` skill). Match `.github/scripts/migrate-setup.sh` exactly.
- New scripts MUST be `chmod +x` — enforced by
  `tests/Shell/check-script-executable-bits.sh` and tracked by git.
- Shell tests source `tests/Shell/lib/test_helpers.sh` and use
  `pass` / `fail` / `register_temp_dir` / `setup_result_file` /
  `print_summary`. End with `print_summary "<file>" ; exit $?`.
- Commits are signed (`git commit -S`), Conventional Commits format, type
  `fix`, scope `setup`. Footers: `Refs: #187` (Task 1), `Fixes: #187`
  (Task 2 — final), `Authored-by: glm-5.2`, `Tested-by: deepseek-v4-pro`,
  `Signed-off-by: <resolve via bash .github/scripts/resolve-identity.sh>`.
  Use the `$'...\n...'` ANSI-C quoting form (ADR-0025).
- Do NOT touch `.opencode/setup.json` (project manifest) write in §8 — that is
  an intentional full regeneration of the committed template (empty `env` by
  design) and holds no user secrets. Out of scope.
- No ADR, no `CONTEXT.md` change (bug fix, no domain-term delta).

---

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `.github/scripts/setup-write-user-config.sh` | Create | Read 12 env vars, deep-merge user-scoped fields onto `~/.config/opencode/setup.json`, atomic write, refuse-on-corrupt/empty |
| `tests/Shell/setup_write_user_config_test.sh` | Create | 6 behavior tests + 1 regression guard for the script and its `/setup` wiring |
| `.opencode/commands/setup.md` | Modify (§3, lines 175–203) | Replace inline destructive `jq -n ... >` block with a call to the new script |

---

### Task 1: Extract the user-config write to a merge script

**Files:**
- Create: `.github/scripts/setup-write-user-config.sh`
- Test: `tests/Shell/setup_write_user_config_test.sh`

**Interfaces:**
- Consumes: twelve environment variables — `SIGNED_OFF_BY_NAME`,
  `SIGNED_OFF_BY_EMAIL`, `OPENCODE_MODEL_{PRIMARY,PLANNER,DESIGN,JUDGE,UTILITY}`,
  `OPENCODE_VARIANT_{PRIMARY,PLANNER,DESIGN,JUDGE,UTILITY}`; plus optional
  `SETUP_USER_CONFIG` (path override, defaults to
  `$HOME/.config/opencode/setup.json`).
- Produces: an executable script that, on success, leaves
  `~/.config/opencode/setup.json` (or `$SETUP_USER_CONFIG`) containing the
  merged object and exits `0`; on missing var / corrupt file / missing `jq`,
  exits non-zero and leaves the file untouched.

- [ ] **Step 1: Write the failing test**

Create `tests/Shell/setup_write_user_config_test.sh` (full file, complete code —
no placeholders):

```bash
#!/usr/bin/env bash
# $KYAULabs: setup_write_user_config_test.sh kyau@nova 2026/07/23 -0700 Exp $


set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/.github/scripts/setup-write-user-config.sh"

source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

# Common valid inputs for the twelve env vars. Tests override one or two.
export SIGNED_OFF_BY_NAME="New Name"
export SIGNED_OFF_BY_EMAIL="new@example.com"
export OPENCODE_MODEL_PRIMARY="new/m"
export OPENCODE_MODEL_PLANNER="new/p"
export OPENCODE_MODEL_DESIGN="new/d"
export OPENCODE_MODEL_JUDGE="new/j"
export OPENCODE_MODEL_UTILITY="new/u"
export OPENCODE_VARIANT_PRIMARY="max"
export OPENCODE_VARIANT_PLANNER="high"
export OPENCODE_VARIANT_DESIGN="high"
export OPENCODE_VARIANT_JUDGE="medium"
export OPENCODE_VARIANT_UTILITY="medium"

# ── Test 1: preserves env keys on re-run (core AC) ───────────────────────
echo ""
echo "── Test 1: preserves env.* on re-run ──"
T1=$(mktemp -d); register_temp_dir "$T1"
CFG="$T1/setup.json"
cat > "$CFG" <<'JSON'
{
  "signed_off_by_name": "kyau",
  "signed_off_by_email": "git@kyaulabs.com",
  "models": {"primary":"old/m","planner":"old/p","design":"old/d","judge":"old/j","utility":"old/u"},
  "variants": {"primary":"low","planner":"low","design":"low","judge":"low","utility":"low"},
  "env": {"deepseek_api_key":"sk-KEEP-ME","searxng_url":"http://sx:8080"}
}
JSON
SETUP_USER_CONFIG="$CFG" bash "$SCRIPT" >/dev/null 2>&1
KEY=$(jq -r '.env.deepseek_api_key' "$CFG")
URL=$(jq -r '.env.searxng_url' "$CFG")
PRI=$(jq -r '.models.primary' "$CFG")
if [ "$KEY" = "sk-KEEP-ME" ]; then pass "env.deepseek_api_key preserved"; else fail "env.deepseek_api_key lost: '$KEY'"; fi
if [ "$URL" = "http://sx:8080" ]; then pass "env.searxng_url preserved"; else fail "env.searxng_url lost: '$URL'"; fi
if [ "$PRI" = "new/m" ]; then pass "models.primary updated"; else fail "models.primary not updated: '$PRI'"; fi

# ── Test 2: creates a fresh file when missing (incl. parent dir) ──────────
echo "── Test 2: missing file created fresh ──"
T2=$(mktemp -d); register_temp_dir "$T2"
CFG="$T2/nested/dir/setup.json"   # parent does not exist yet
SETUP_USER_CONFIG="$CFG" bash "$SCRIPT" >/dev/null 2>&1
if [ -f "$CFG" ]; then pass "missing file created (with parent dir)"; else fail "file not created"; fi
PRI=$(jq -r '.models.primary' "$CFG" 2>/dev/null)
if [ "$PRI" = "new/m" ]; then pass "fresh file has correct models.primary"; else fail "wrong primary: '$PRI'"; fi
HAS_ENV=$(jq -r 'has("env")' "$CFG" 2>/dev/null)
if [ "$HAS_ENV" = "false" ]; then pass "fresh file omits env (user has none yet)"; else fail "fresh file unexpectedly has env"; fi

# ── Test 3: preserves unknown/extra keys ─────────────────────────────────
echo "── Test 3: preserves unknown keys ──"
T3=$(mktemp -d); register_temp_dir "$T3"
CFG="$T3/setup.json"
cat > "$CFG" <<'JSON'
{
  "models": {"primary":"old/m","planner":"old/p","design":"old/d","judge":"old/j","utility":"old/u"},
  "variants": {"primary":"low","planner":"low","design":"low","judge":"low","utility":"low"},
  "custom_note": "keep-me",
  "experimental": {"lsp_tool": true}
}
JSON
SETUP_USER_CONFIG="$CFG" bash "$SCRIPT" >/dev/null 2>&1
NOTE=$(jq -r '.custom_note' "$CFG")
LSP=$(jq -r '.experimental.lsp_tool' "$CFG")
if [ "$NOTE" = "keep-me" ]; then pass "unknown top-level key preserved"; else fail "custom_note lost: '$NOTE'"; fi
if [ "$LSP" = "true" ]; then pass "nested unknown key (experimental.lsp_tool) preserved"; else fail "experimental.lsp_tool lost: '$LSP'"; fi

# ── Test 4: updates models/variants/identity on re-run ───────────────────
echo "── Test 4: updates all user-scoped fields ──"
T4=$(mktemp -d); register_temp_dir "$T4"
CFG="$T4/setup.json"
cat > "$CFG" <<'JSON'
{
  "signed_off_by_name": "Old Name",
  "signed_off_by_email": "old@example.com",
  "models": {"primary":"old/m","planner":"old/p","design":"old/d","judge":"old/j","utility":"old/u"},
  "variants": {"primary":"low","planner":"low","design":"low","judge":"low","utility":"low"}
}
JSON
SETUP_USER_CONFIG="$CFG" bash "$SCRIPT" >/dev/null 2>&1
NM=$(jq -r '.signed_off_by_name' "$CFG")
EM=$(jq -r '.signed_off_by_email' "$CFG")
if [ "$NM" = "New Name" ]; then pass "signed_off_by_name updated"; else fail "name not updated: '$NM'"; fi
if [ "$EM" = "new@example.com" ]; then pass "signed_off_by_email updated"; else fail "email not updated: '$EM'"; fi
for tier in primary planner design judge utility; do
    M=$(jq -r ".models.\"$tier\"" "$CFG")
    V=$(jq -r ".variants.\"$tier\"" "$CFG")
    if [ "$M" = "new/${tier:0:1}" ]; then pass "models.$tier updated"; else fail "models.$tier wrong: '$M'"; fi
    case "$tier" in
        primary) EXPV="max";; planner|design) EXPV="high";; judge|utility) EXPV="medium";;
    esac
    if [ "$V" = "$EXPV" ]; then pass "variants.$tier updated"; else fail "variants.$tier wrong: '$V'"; fi
done

# ── Test 5: missing required var → non-zero exit, file untouched ──────────
echo "── Test 5: empty required var aborts cleanly ──"
T5=$(mktemp -d); register_temp_dir "$T5"
CFG="$T5/setup.json"
printf '{"env":{"deepseek_api_key":"sk-KEEP-ME"},"models":{}}' > "$CFG"
set +e
SETUP_USER_CONFIG="$CFG" SIGNED_OFF_BY_NAME="" bash "$SCRIPT" >/dev/null 2>&1
EXIT_CODE=$?
set -e
if [ "$EXIT_CODE" -ne 0 ]; then pass "empty SIGNED_OFF_BY_NAME exits non-zero ($EXIT_CODE)"; else fail "expected non-zero exit, got $EXIT_CODE"; fi
KEY=$(jq -r '.env.deepseek_api_key' "$CFG")
if [ "$KEY" = "sk-KEEP-ME" ]; then pass "file untouched on abort"; else fail "file modified despite abort: '$KEY'"; fi

# ── Test 6: corrupt existing JSON → non-zero exit, file untouched ─────────
echo "── Test 6: corrupt existing JSON aborts cleanly ──"
T6=$(mktemp -d); register_temp_dir "$T6"
CFG="$T6/setup.json"
printf 'not valid json {{{' > "$CFG"
set +e
SETUP_USER_CONFIG="$CFG" bash "$SCRIPT" >/dev/null 2>&1
EXIT_CODE=$?
set -e
if [ "$EXIT_CODE" -ne 0 ]; then pass "corrupt JSON exits non-zero ($EXIT_CODE)"; else fail "expected non-zero, got $EXIT_CODE"; fi
if [ "$(cat "$CFG")" = "not valid json {{{" ]; then pass "corrupt file untouched"; else fail "corrupt file was modified"; fi

# ── Summary ──────────────────────────────────────────────────────────────
print_summary "setup_write_user_config_test.sh"
exit $?


# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run the test to verify it fails (Red)**

Run: `bash tests/Shell/setup_write_user_config_test.sh`
Expected: FAIL — the script `.github/scripts/setup-write-user-config.sh` does
not exist yet (the harness `fail`s on the first invocation, or bash errors on
the missing file). Confirm the failure is "no such script", not a syntax error
in the test.

- [ ] **Step 3: Write the script (Green)**

Create `.github/scripts/setup-write-user-config.sh` (complete code):

```bash
#!/usr/bin/env bash
# $KYAULabs: setup-write-user-config.sh kyau@nova 2026/07/23 -0700 Exp $


# setup-write-user-config.sh — Merge user-scoped /setup fields into the
# user-level ~/.config/opencode/setup.json WITHOUT destroying unrelated keys
# (env.deepseek_api_key, env.searxng_url, etc.). Replaces the destructive
# full-file `jq -n ... >` overwrite previously inlined in /setup §3 (#187).
#
# Reads model/variant/identity values from environment variables, builds the
# new user-scoped object (identity + models + variants — never `env`), and
# deep-merges it onto the existing file (missing file → empty base). Atomic
# write via mktemp + mv. Refuses to clobber on a missing required value, a
# missing jq, or a corrupt existing file (exits non-zero, leaves file intact).

set -euo pipefail

CONFIG="${SETUP_USER_CONFIG:-$HOME/.config/opencode/setup.json}"

REQUIRED_VARS=(
    SIGNED_OFF_BY_NAME SIGNED_OFF_BY_EMAIL
    OPENCODE_MODEL_PRIMARY OPENCODE_MODEL_PLANNER OPENCODE_MODEL_DESIGN OPENCODE_MODEL_JUDGE OPENCODE_MODEL_UTILITY
    OPENCODE_VARIANT_PRIMARY OPENCODE_VARIANT_PLANNER OPENCODE_VARIANT_DESIGN OPENCODE_VARIANT_JUDGE OPENCODE_VARIANT_UTILITY
)

# Refuse to write a partial object.
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        echo "✗ required env var $var is empty or unset; aborting (no write)" >&2
        exit 1
    fi
done

if ! command -v jq >/dev/null 2>&1; then
    echo "✗ jq required to merge $CONFIG" >&2
    exit 1
fi

# Existing base: read + validate as JSON (refuse to clobber a corrupt file).
if [ -f "$CONFIG" ]; then
    if ! EXISTING=$(jq '.' "$CONFIG" 2>/dev/null); then
        echo "✗ existing $CONFIG is not valid JSON; aborting (no write)" >&2
        exit 1
    fi
else
    EXISTING='{}'
fi

# New user-scoped object (identity + models + variants — never env).
NEW_OBJ=$(jq -n \
    --arg name "$SIGNED_OFF_BY_NAME" --arg email "$SIGNED_OFF_BY_EMAIL" \
    --arg p "$OPENCODE_MODEL_PRIMARY" --arg pl "$OPENCODE_MODEL_PLANNER" \
    --arg d "$OPENCODE_MODEL_DESIGN" --arg j "$OPENCODE_MODEL_JUDGE" --arg u "$OPENCODE_MODEL_UTILITY" \
    --arg pv "$OPENCODE_VARIANT_PRIMARY" --arg plv "$OPENCODE_VARIANT_PLANNER" \
    --arg dv "$OPENCODE_VARIANT_DESIGN" --arg jv "$OPENCODE_VARIANT_JUDGE" --arg uv "$OPENCODE_VARIANT_UTILITY" \
    '{
        signed_off_by_name: $name,
        signed_off_by_email: $email,
        models: {primary: $p, planner: $pl, design: $d, judge: $j, utility: $u},
        variants: {primary: $pv, planner: $plv, design: $dv, judge: $jv, utility: $uv}
    }')

# Deep merge: existing base is preserved for unknown keys (env.*, experimental,
# custom), new values override the user-scoped fields. Atomic write.
mkdir -p "$(dirname "$CONFIG")"
TMP=$(mktemp "${CONFIG}.tmp.XXXXXX")
jq -n --argjson existing "$EXISTING" --argjson new "$NEW_OBJ" '$existing * $new' > "$TMP"
mv "$TMP" "$CONFIG"

echo "✓ Merged user-scoped /setup fields into $CONFIG (env preserved)" >&2


# vim: ft=sh sts=4 sw=4 ts=4 et :
```

Then make both files executable:

```bash
chmod +x .github/scripts/setup-write-user-config.sh tests/Shell/setup_write_user_config_test.sh
```

- [ ] **Step 4: Run the test to verify it passes (Green)**

Run: `bash tests/Shell/setup_write_user_config_test.sh`
Expected: PASS — all 6 tests green (`print_summary` reports 0 failures).

- [ ] **Step 5: Refactor** — none needed; the script is already minimal and
  mirrors `migrate-setup.sh`. Re-run the test to confirm still green.

Run: `bash tests/Shell/setup_write_user_config_test.sh` → Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/setup-write-user-config.sh tests/Shell/setup_write_user_config_test.sh
git commit -S -m $'fix(setup): extract user-config write to merge script\n\nReplace the destructive inline jq -n ... > full-file overwrite in /setup\n§3 with an extracted .github/scripts/setup-write-user-config.sh that\ndeep-merges user-scoped fields (identity, models, variants) onto the\nexisting ~/.config/opencode/setup.json, preserving env.deepseek_api_key\nand env.searxng_url. Atomic write; refuses to clobber on missing values\nor corrupt input.\n\nRefs: #187\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

### Task 2: Wire the merge script into /setup §3 + regression guard

**Files:**
- Modify: `.opencode/commands/setup.md` (§3 write block, lines 175–203)
- Modify: `tests/Shell/setup_write_user_config_test.sh` (append Test 7)

**Interfaces:**
- Consumes: `setup-write-user-config.sh` from Task 1.
- Produces: `/setup` §3 that no longer contains a bare redirect overwrite of
  the user config, and a regression guard test asserting the wiring stays safe.

- [ ] **Step 1: Edit `/setup` §3 to call the script**

In `.opencode/commands/setup.md`, replace the entire code-fence block (the
`mkdir -p ~/.config/opencode` line through the closing `}` `>` redirect line,
i.e. the block under "If the user changed any model or variant, write …")
with a call to the script. Use the Edit tool with this old/new pair:

oldString (the inline destructive block):

```
```bash
mkdir -p ~/.config/opencode
jq -n \
  --arg p "$OPENCODE_MODEL_PRIMARY" --arg pl "$OPENCODE_MODEL_PLANNER" \
  --arg d "$OPENCODE_MODEL_DESIGN" --arg j "$OPENCODE_MODEL_JUDGE" \
  --arg u "$OPENCODE_MODEL_UTILITY" \
  --arg pv "$OPENCODE_VARIANT_PRIMARY" --arg plv "$OPENCODE_VARIANT_PLANNER" \
  --arg dv "$OPENCODE_VARIANT_DESIGN" --arg jv "$OPENCODE_VARIANT_JUDGE" \
  --arg uv "$OPENCODE_VARIANT_UTILITY" \
  --arg name "$SIGNED_OFF_BY_NAME" --arg email "$SIGNED_OFF_BY_EMAIL" \
  '{
    signed_off_by_name: $name,
    signed_off_by_email: $email,
    models: {primary: $p, planner: $pl, design: $d, judge: $j, utility: $u},
    variants: {primary: $pv, planner: $plv, design: $dv, judge: $jv, utility: $uv}
  }' > ~/.config/opencode/setup.json
```
```

newString (the script invocation + an explanatory note):

```
```bash
SIGNED_OFF_BY_NAME="$SIGNED_OFF_BY_NAME" \
SIGNED_OFF_BY_EMAIL="$SIGNED_OFF_BY_EMAIL" \
OPENCODE_MODEL_PRIMARY="$OPENCODE_MODEL_PRIMARY" \
OPENCODE_MODEL_PLANNER="$OPENCODE_MODEL_PLANNER" \
OPENCODE_MODEL_DESIGN="$OPENCODE_MODEL_DESIGN" \
OPENCODE_MODEL_JUDGE="$OPENCODE_MODEL_JUDGE" \
OPENCODE_MODEL_UTILITY="$OPENCODE_MODEL_UTILITY" \
OPENCODE_VARIANT_PRIMARY="$OPENCODE_VARIANT_PRIMARY" \
OPENCODE_VARIANT_PLANNER="$OPENCODE_VARIANT_PLANNER" \
OPENCODE_VARIANT_DESIGN="$OPENCODE_VARIANT_DESIGN" \
OPENCODE_VARIANT_JUDGE="$OPENCODE_VARIANT_JUDGE" \
OPENCODE_VARIANT_UTILITY="$OPENCODE_VARIANT_UTILITY" \
bash .github/scripts/setup-write-user-config.sh
```

The script deep-merges the user-scoped fields (identity, models, variants)
onto any existing `~/.config/opencode/setup.json`, preserving unrelated keys
such as `env.deepseek_api_key` and `env.searxng_url` (#187). It writes
atomically (tmp + mv), creates the parent directory, and refuses to clobber on
a missing value or a corrupt existing file.
```

Then verify the surrounding prose still reads correctly: the line before
("If the user changed any model or variant, write `~/.config/opencode/setup.json`:")
still introduces the code fence, and the "After writing, instruct:" block
immediately after is unchanged.

- [ ] **Step 2: Append the regression-guard test (Test 7)**

Append this block to `tests/Shell/setup_write_user_config_test.sh`,
immediately before the `# ── Summary ──` section:

```bash
# ── Test 7: /setup §3 invokes the script (regression guard) ──────────────
echo "── Test 7: setup.md wires the merge script ──"
SETUP_MD="$REPO_ROOT/.opencode/commands/setup.md"
if grep -qF 'bash .github/scripts/setup-write-user-config.sh' "$SETUP_MD"; then
    pass "setup.md invokes the merge script"
else
    fail "setup.md does not invoke setup-write-user-config.sh"
fi
if grep -qF "}' > ~/.config/opencode/setup.json" "$SETUP_MD"; then
    fail "setup.md still contains destructive full-file overwrite of user config"
else
    pass "no destructive bare overwrite of user config in setup.md"
fi
```

- [ ] **Step 3: Run the full test file**

Run: `bash tests/Shell/setup_write_user_config_test.sh`
Expected: PASS — all 7 tests green (the new Test 7 asserts the wiring).

- [ ] **Step 4: Verify no regression in the shell suite**

Run the broader shell suite (at minimum the sibling setup tests + the
executable-bit guard, since a new script was added):

```bash
bash tests/Shell/setup_substitution_test.sh
bash tests/Shell/migrate_setup_test.sh
bash tests/Shell/check-script-executable-bits.sh
```

Expected: all PASS. (The executable-bit guard confirms the new script is
`chmod +x` and git-tracked as executable.)

- [ ] **Step 5: Commit**

```bash
git add .opencode/commands/setup.md tests/Shell/setup_write_user_config_test.sh
git commit -S -m $'fix(setup): wire merge script into /setup §3\n\nReplace the inline destructive jq -n ... > overwrite of\n~/.config/opencode/setup.json in /setup §3 with a call to\nsetup-write-user-config.sh, and add a regression guard test asserting the\nwiring stays safe. Completes the fix for the silent env-key wipe.\n\nFixes: #187\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

## Verification (after both tasks)

1. Re-run the new test file: `bash tests/Shell/setup_write_user_config_test.sh` → 7/7 green.
2. Run `/check` (pre-push gate: php-cs-fixer + stylelint + eslint + pest --coverage). The shell suite is part of the broader gate; confirm no regressions.
3. Load the `verification-before-completion` skill and confirm: no debug artifacts, the original repro (a `/setup` re-run that previously wiped `env`) no longer reproduces — manually trace by seeding a `~/.config/opencode/setup.json` with an `env` block, running the script with changed model values, and confirming `env` survives.
4. Run `@code-review` on the branch before push.

## Notes

- Branch (created at execution time, post-approval):
  `bash .github/scripts/new-branch.sh fix setup-preserve-user-config-keys`
- The fix is scoped to the user-level file. The project-level
  `.opencode/setup.json` write in §8 is intentionally a full regeneration
  (empty `env` template) and is left untouched.
