#!/usr/bin/env bash
# $KYAULabs: setup_write_user_config_test.sh kyau@cosmos.kyaulabs 2026/08/03 -0700 Exp $










# Behavior tests for setup-write-user-config.sh (ADR-0043).
#
# Verifies the script writes ~/.config/opencode/prism.jsonc via the prism
# manifest CLI `patch` command: JSONC (comment-preserving), mode 0600, atomic,
# symlink-refusing, fail-closed on malformed input. Every test runs against a
# throwaway temp file pinned via SETUP_USER_CONFIG; the real $HOME is never
# touched. Field reads go through the CLI `decode` command (which strips
# comments) so JSONC is never fed straight to jq.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/.github/scripts/setup-write-user-config.sh"
MANIFEST_CLI="$REPO_ROOT/.github/scripts/prism_manifest.php"

source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

# decode_field <file> <jq-expr> — read one field from a JSONC manifest via the
# shared CLI (strips comments) then jq. Never feed JSONC straight to jq.
decode_field() {
    php "$MANIFEST_CLI" decode "$1" | jq -r "$2"
}

# file_mode <file> — portable octal mode (GNU stat -c / BSD stat -f).
file_mode() {
    stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

# run_writer [mode] — invoke the writer script without aborting under set -e;
# captures the exit status in WR_RC. Mode defaults to "all" (backward compat);
# pass "toggles" for the toggle-only path. Env vars are inherited from the caller,
# including inline assignment-prefix overrides.
WR_RC=0
run_writer() {
    local mode="${1:-all}"
    set +e
    bash "$SCRIPT" "$mode" >/dev/null 2>&1
    WR_RC=$?
    set -e
}

# Twelve valid env vars; individual tests override one or two for edge cases.
export SIGNED_OFF_BY_NAME="New Name"
export SIGNED_OFF_BY_EMAIL="new@example.com"
export OPENCODE_MODEL_PRIMARY="new/m"
export OPENCODE_MODEL_PLANNER="new/p"
export OPENCODE_MODEL_DESIGN="new/d"
export OPENCODE_MODEL_JUDGE="new/j"
export OPENCODE_MODEL_UTILITY="new/u"
export OPENCODE_MODEL_FRONTEND="new/f"
export OPENCODE_VARIANT_PRIMARY="max"
export OPENCODE_VARIANT_PLANNER="high"
export OPENCODE_VARIANT_DESIGN="high"
export OPENCODE_VARIANT_JUDGE="medium"
export OPENCODE_VARIANT_UTILITY="medium"
export OPENCODE_VARIANT_FRONTEND="high"

# ── Test 1: missing file created as JSONC at 0600 ─────────────────────────
echo ""
echo "── Test 1: missing file created as JSONC at 0600 ──"
T1=$(mktemp -d); register_temp_dir "$T1"
CFG="$T1/nested/dir/prism.jsonc"   # parent does not exist yet
SETUP_USER_CONFIG="$CFG" run_writer
if [ "$WR_RC" -eq 0 ]; then pass "writer exited 0"; else fail "writer exited $WR_RC (expected 0)"; fi
if [ -f "$CFG" ]; then pass "missing file created (with parent dir)"; else fail "file not created"; fi
PRI=$(decode_field "$CFG" '.models.primary' 2>/dev/null)
NM=$(decode_field "$CFG" '.signed_off_by_name' 2>/dev/null)
FR=$(decode_field "$CFG" '.models.frontend' 2>/dev/null)
VF=$(decode_field "$CFG" '.variants.frontend' 2>/dev/null)
if [ "$PRI" = "new/m" ]; then pass "fresh file has correct models.primary"; else fail "wrong primary: '$PRI'"; fi
if [ "$NM" = "New Name" ]; then pass "fresh file has correct signed_off_by_name"; else fail "wrong name: '$NM'"; fi
if [ "$FR" = "new/f" ]; then pass "fresh file has correct models.frontend"; else fail "wrong frontend model: '$FR'"; fi
if [ "$VF" = "high" ]; then pass "fresh file has correct variants.frontend"; else fail "wrong frontend variant: '$VF'"; fi
if grep -q '//' "$CFG"; then pass "fresh file is genuine JSONC (carries comments)"; else fail "fresh file is not JSONC"; fi
if php "$MANIFEST_CLI" validate "$CFG" user >/dev/null 2>&1; then pass "fresh file validates as user v6"; else fail "fresh file fails user validation"; fi

# ── Test 2: empty required var aborts without writing ─────────────────────
echo "── Test 2: empty required var aborts without writing ──"
T2=$(mktemp -d); register_temp_dir "$T2"
CFG="$T2/prism.jsonc"
SETUP_USER_CONFIG="$CFG" SIGNED_OFF_BY_NAME="" run_writer
if [ "$WR_RC" -ne 0 ]; then pass "empty SIGNED_OFF_BY_NAME exits non-zero ($WR_RC)"; else fail "expected non-zero exit, got $WR_RC"; fi
if [ ! -e "$CFG" ]; then pass "no file created on abort"; else fail "file created despite abort"; fi

# ── Test 3: nested patch is field-by-field (siblings survive) ─────────────
echo "── Test 3: nested patch is field-by-field (siblings survive) ──"
T3=$(mktemp -d); register_temp_dir "$T3"
CFG="$T3/prism.jsonc"
cat > "$CFG" <<'JSON'
{
  "setup_version": 6,
  "models": {
    "primary": "old/m",
    "custom_model": "KEEP-ME"
  }
}
JSON
SETUP_USER_CONFIG="$CFG" run_writer
if [ "$WR_RC" -eq 0 ]; then pass "writer exited 0"; else fail "writer exited $WR_RC (expected 0)"; fi
PRI=$(decode_field "$CFG" '.models.primary')
CUST=$(decode_field "$CFG" '.models.custom_model')
JUDGE=$(decode_field "$CFG" '.models.judge')
FRONT=$(decode_field "$CFG" '.models.frontend')
VFRONT=$(decode_field "$CFG" '.variants.frontend')
if [ "$PRI" = "new/m" ]; then pass "models.primary updated"; else fail "models.primary not updated: '$PRI'"; fi
if [ "$CUST" = "KEEP-ME" ]; then pass "custom sibling models.custom_model preserved"; else fail "sibling lost: '$CUST'"; fi
if [ "$JUDGE" = "new/j" ]; then pass "missing sibling models.judge added"; else fail "models.judge not added: '$JUDGE'"; fi
if [ "$FRONT" = "new/f" ]; then pass "models.frontend override written"; else fail "models.frontend not written: '$FRONT'"; fi
if [ "$VFRONT" = "high" ]; then pass "variants.frontend override written"; else fail "variants.frontend not written: '$VFRONT'"; fi

# ── Test 4: env/experimental/custom fields preserved ──────────────────────
echo "── Test 4: env/experimental/custom fields preserved ──"
T4=$(mktemp -d); register_temp_dir "$T4"
CFG="$T4/prism.jsonc"
cat > "$CFG" <<'JSON'
{
  "setup_version": 6,
  "env": {
    "deepseek_api_key": "sk-KEEP-ME",
    "searxng_url": "http://sx:8080"
  },
  "experimental": {
    "scout": true
  },
  "custom_note": "keep-me"
}
JSON
SETUP_USER_CONFIG="$CFG" run_writer
if [ "$WR_RC" -eq 0 ]; then pass "writer exited 0"; else fail "writer exited $WR_RC (expected 0)"; fi
KEY=$(decode_field "$CFG" '.env.deepseek_api_key')
URL=$(decode_field "$CFG" '.env.searxng_url')
SCOUT=$(decode_field "$CFG" '.experimental.scout')
NOTE=$(decode_field "$CFG" '.custom_note')
PRI=$(decode_field "$CFG" '.models.primary')
if [ "$KEY" = "sk-KEEP-ME" ]; then pass "env.deepseek_api_key preserved"; else fail "env.deepseek_api_key lost: '$KEY'"; fi
if [ "$URL" = "http://sx:8080" ]; then pass "env.searxng_url preserved"; else fail "env.searxng_url lost: '$URL'"; fi
if [ "$SCOUT" = "true" ]; then pass "experimental.scout preserved"; else fail "experimental.scout lost: '$SCOUT'"; fi
if [ "$NOTE" = "keep-me" ]; then pass "custom top-level custom_note preserved"; else fail "custom_note lost: '$NOTE'"; fi
if [ "$PRI" = "new/m" ]; then pass "models.primary written"; else fail "models.primary not written: '$PRI'"; fi

# ── Test 5: JSONC comments byte-preserved ─────────────────────────────────
echo "── Test 5: JSONC comments byte-preserved ──"
T5=$(mktemp -d); register_temp_dir "$T5"
CFG="$T5/prism.jsonc"
cat > "$CFG" <<'JSON'
// top-of-file header KEEP
{
  // standalone line comment KEEP
  "setup_version": 6,
  "models": {
    "primary": "old/m"
  }
}
JSON
SETUP_USER_CONFIG="$CFG" run_writer
if [ "$WR_RC" -eq 0 ]; then pass "writer exited 0"; else fail "writer exited $WR_RC (expected 0)"; fi
if grep -qF '// top-of-file header KEEP' "$CFG"; then pass "top-of-file comment preserved"; else fail "top-of-file comment lost"; fi
if grep -qF '// standalone line comment KEEP' "$CFG"; then pass "standalone line comment preserved"; else fail "standalone line comment lost"; fi
PRI=$(decode_field "$CFG" '.models.primary')
if [ "$PRI" = "new/m" ]; then pass "models.primary updated alongside comments"; else fail "models.primary not updated: '$PRI'"; fi

# ── Test 6: malformed existing file fails closed ──────────────────────────
echo "── Test 6: malformed existing file fails closed ──"
T6=$(mktemp -d); register_temp_dir "$T6"
CFG="$T6/prism.jsonc"
printf 'not valid json {{{' > "$CFG"
SETUP_USER_CONFIG="$CFG" run_writer
if [ "$WR_RC" -ne 0 ]; then pass "malformed file exits non-zero ($WR_RC)"; else fail "expected non-zero, got $WR_RC"; fi
if [ "$(cat "$CFG")" = "not valid json {{{" ]; then pass "malformed file untouched"; else fail "malformed file was modified"; fi

# ── Test 7: written file mode is exactly 0600 ─────────────────────────────
echo "── Test 7: written file mode is exactly 0600 ──"
T7=$(mktemp -d); register_temp_dir "$T7"
CFG="$T7/prism.jsonc"
SETUP_USER_CONFIG="$CFG" run_writer
MODE=$(file_mode "$CFG")
if [ "$MODE" = "600" ]; then pass "fresh file mode is 0600"; else fail "fresh file mode $MODE, expected 600"; fi
# Mode must remain 0600 after patching an existing file too.
SETUP_USER_CONFIG="$CFG" OPENCODE_MODEL_PRIMARY="newer/m" run_writer
MODE2=$(file_mode "$CFG")
if [ "$MODE2" = "600" ]; then pass "patched file mode stays 0600"; else fail "patched file mode $MODE2, expected 600"; fi

# ── Test 8: atomic — identical re-run is byte-identical, result valid ─────
echo "── Test 8: atomic — identical re-run is byte-identical, result valid ──"
T8=$(mktemp -d); register_temp_dir "$T8"
CFG="$T8/prism.jsonc"
SETUP_USER_CONFIG="$CFG" run_writer
SNAP=$(cat "$CFG")
# Second run with identical inputs: withValues skips matching values, so the
# file is rewritten byte-identically (no partial/torn artifacts).
SETUP_USER_CONFIG="$CFG" run_writer
if [ "$(cat "$CFG")" = "$SNAP" ]; then pass "identical re-run is byte-identical"; else fail "file changed on identical re-run"; fi
if php "$MANIFEST_CLI" validate "$CFG" user >/dev/null 2>&1; then pass "file validates after every operation"; else fail "file invalid after re-run"; fi

# ── Test 9: symlink target refused ────────────────────────────────────────
echo "── Test 9: symlink target refused ──"
if ! can_symlink; then
    skip "symlink refusal — platform lacks symlink support"
else
    T9=$(mktemp -d); register_temp_dir "$T9"
    TRAP="$T9/should-not-exist.json"
    CFG="$T9/prism.jsonc"
    ln -s "$TRAP" "$CFG"
    SETUP_USER_CONFIG="$CFG" run_writer
    if [ "$WR_RC" -ne 0 ]; then pass "symlink target exits non-zero ($WR_RC)"; else fail "expected non-zero exit, got $WR_RC"; fi
    if [ ! -e "$TRAP" ]; then pass "symlink target not written through"; else fail "content written through symlink"; fi
    if [ -L "$CFG" ]; then pass "symlink left intact"; else fail "symlink was removed/replaced"; fi
fi

# ── Toggle writer env vars ────────────────────────────────────────────────
export OPENCODE_MCP_DEEPSEEK_WEBSEARCH="false"
export OPENCODE_MCP_SEARXNG="false"
export OPENCODE_PLUGIN_OPENCODE_QUOTA="false"

# ── Test 10: toggles mode creates mode-0600 manifest with only setup_version,
#    mcp, and plugins (no identity/model/variant fields) ────────────────────
echo "── Test 10: toggles mode is user-only (no identity/model/variant fields) ──"
T10=$(mktemp -d); register_temp_dir "$T10"
CFG="$T10/prism.jsonc"
SETUP_USER_CONFIG="$CFG" run_writer toggles
if [ "$WR_RC" -eq 0 ]; then pass "toggles writer exited 0"; else fail "toggles writer exited $WR_RC (expected 0)"; fi
if [ -f "$CFG" ]; then pass "toggles file created"; else fail "toggles file not created"; fi
MODE10=$(file_mode "$CFG")
if [ "$MODE10" = "600" ]; then pass "toggles file mode is 0600"; else fail "toggles file mode $MODE10, expected 600"; fi
DS10=$(decode_field "$CFG" '.mcp.deepseek_websearch')
SX10=$(decode_field "$CFG" '.mcp.searxng')
QT10=$(decode_field "$CFG" '.plugins.opencode_quota')
if [ "$DS10" = "false" ]; then pass "mcp.deepseek_websearch is false"; else fail "mcp.deepseek_websearch: '$DS10' (expected false)"; fi
if [ "$SX10" = "false" ]; then pass "mcp.searxng is false"; else fail "mcp.searxng: '$SX10' (expected false)"; fi
if [ "$QT10" = "false" ]; then pass "plugins.opencode_quota is false"; else fail "plugins.opencode_quota: '$QT10' (expected false)"; fi

# Prove values decode as JSON Booleans, not strings (jq type check)
DS_TYPE=$(php "$MANIFEST_CLI" decode "$CFG" | jq -r '.mcp.deepseek_websearch | type')
SX_TYPE=$(php "$MANIFEST_CLI" decode "$CFG" | jq -r '.mcp.searxng | type')
QT_TYPE=$(php "$MANIFEST_CLI" decode "$CFG" | jq -r '.plugins.opencode_quota | type')
if [ "$DS_TYPE" = "boolean" ]; then pass "mcp.deepseek_websearch is JSON boolean"; else fail "mcp.deepseek_websearch type: '$DS_TYPE' (expected boolean)"; fi
if [ "$SX_TYPE" = "boolean" ]; then pass "mcp.searxng is JSON boolean"; else fail "mcp.searxng type: '$SX_TYPE' (expected boolean)"; fi
if [ "$QT_TYPE" = "boolean" ]; then pass "plugins.opencode_quota is JSON boolean"; else fail "plugins.opencode_quota type: '$QT_TYPE' (expected boolean)"; fi

# Verify no identity/model/variant fields are materialized
FULL_DECODED=$(php "$MANIFEST_CLI" decode "$CFG")
if echo "$FULL_DECODED" | jq -e '.signed_off_by_name' >/dev/null 2>&1; then
    fail "toggles mode materialized signed_off_by_name"; else pass "no signed_off_by_name in toggles write"; fi
if echo "$FULL_DECODED" | jq -e '.models' >/dev/null 2>&1; then
    fail "toggles mode materialized models"; else pass "no models in toggles write"; fi
if echo "$FULL_DECODED" | jq -e '.variants' >/dev/null 2>&1; then
    fail "toggles mode materialized variants"; else pass "no variants in toggles write"; fi
# The FRONTEND overrides must stay absent in toggle-only mode — the user
# manifest keeps inheriting project defaults rather than pinning personal keys.
if echo "$FULL_DECODED" | jq -e '.models.frontend' >/dev/null 2>&1; then
    fail "toggles mode materialized models.frontend"; else pass "no models.frontend in toggles write"; fi
if echo "$FULL_DECODED" | jq -e '.variants.frontend' >/dev/null 2>&1; then
    fail "toggles mode materialized variants.frontend"; else pass "no variants.frontend in toggles write"; fi

# ── Test 11: toggles mode preserves existing comments, env secrets, and
#    unrelated keys ─────────────────────────────────────────────────────
echo "── Test 11: toggles mode preserves comments, env, and unrelated keys ──"
T11=$(mktemp -d); register_temp_dir "$T11"
CFG="$T11/prism.jsonc"
cat > "$CFG" <<'JSON'
// User manifest KEEP
{
  "setup_version": 6,
  // deepseek key KEEP
  "env": {
    "deepseek_api_key": "sk-CANARY",
    "searxng_url": "http://search:8080"
  },
  "custom_note": "keep-me",
  // existing mcp — should be patched
  "mcp": {
    "deepseek_websearch": false
  }
}
JSON
OPENCODE_MCP_DEEPSEEK_WEBSEARCH="true" OPENCODE_MCP_SEARXNG="true" \
    OPENCODE_PLUGIN_OPENCODE_QUOTA="true" SETUP_USER_CONFIG="$CFG" run_writer toggles
if [ "$WR_RC" -eq 0 ]; then pass "toggles writer exited 0 on existing file"; else fail "toggles writer exited $WR_RC (expected 0)"; fi
DS11=$(decode_field "$CFG" '.mcp.deepseek_websearch')
SX11=$(decode_field "$CFG" '.mcp.searxng')
QT11=$(decode_field "$CFG" '.plugins.opencode_quota')
KEY11=$(decode_field "$CFG" '.env.deepseek_api_key')
NOTE11=$(decode_field "$CFG" '.custom_note')
if [ "$DS11" = "true" ]; then pass "mcp.deepseek_websearch updated to true"; else fail "mcp.deepseek_websearch: '$DS11' (expected true)"; fi
if [ "$SX11" = "true" ]; then pass "mcp.searxng updated to true"; else fail "mcp.searxng: '$SX11' (expected true)"; fi
if [ "$QT11" = "true" ]; then pass "plugins.opencode_quota updated to true"; else fail "plugins.opencode_quota: '$QT11' (expected true)"; fi
if [ "$KEY11" = "sk-CANARY" ]; then pass "env.deepseek_api_key preserved"; else fail "env.deepseek_api_key lost: '$KEY11'"; fi
if [ "$NOTE11" = "keep-me" ]; then pass "custom_note preserved"; else fail "custom_note lost: '$NOTE11'"; fi
if grep -qF '// User manifest KEEP' "$CFG"; then pass "top-of-file comment preserved"; else fail "top-of-file comment lost"; fi

# ── Test 12: values other than exact true/false fail without writing ───────
echo "── Test 12: non-boolean toggle values fail without writing ──"
T12=$(mktemp -d); register_temp_dir "$T12"
CFG="$T12/prism.jsonc"
OPENCODE_MCP_DEEPSEEK_WEBSEARCH="yes" OPENCODE_MCP_SEARXNG="false" \
    OPENCODE_PLUGIN_OPENCODE_QUOTA="false" SETUP_USER_CONFIG="$CFG" run_writer toggles
if [ "$WR_RC" -ne 0 ]; then pass "non-boolean 'yes' exits non-zero ($WR_RC)"; else fail "expected non-zero exit, got $WR_RC"; fi
if [ ! -e "$CFG" ]; then pass "no file created on bad value"; else fail "file created despite bad value"; fi

# Also test "1" (not a valid boolean string)
OPENCODE_MCP_DEEPSEEK_WEBSEARCH="false" OPENCODE_MCP_SEARXNG="1" \
    OPENCODE_PLUGIN_OPENCODE_QUOTA="false" SETUP_USER_CONFIG="$CFG" run_writer toggles
if [ "$WR_RC" -ne 0 ]; then pass "non-boolean '1' exits non-zero ($WR_RC)"; else fail "expected non-zero exit, got $WR_RC"; fi

# Also test empty
OPENCODE_MCP_DEEPSEEK_WEBSEARCH="true" OPENCODE_MCP_SEARXNG="" \
    OPENCODE_PLUGIN_OPENCODE_QUOTA="false" SETUP_USER_CONFIG="$CFG" run_writer toggles
if [ "$WR_RC" -ne 0 ]; then pass "empty value exits non-zero ($WR_RC)"; else fail "expected non-zero exit, got $WR_RC"; fi

# ── Test 13: identical second toggles write is byte-identical ──────────────
echo "── Test 13: identical toggles re-run is byte-identical ──"
T13=$(mktemp -d); register_temp_dir "$T13"
CFG="$T13/prism.jsonc"
SETUP_USER_CONFIG="$CFG" run_writer toggles
SNAP=$(cat "$CFG")
SETUP_USER_CONFIG="$CFG" run_writer toggles
if [ "$(cat "$CFG")" = "$SNAP" ]; then pass "identical toggles re-run is byte-identical"; else fail "file changed on identical toggles re-run"; fi
if php "$MANIFEST_CLI" validate "$CFG" user >/dev/null 2>&1; then pass "file validates after toggles re-run"; else fail "file invalid after toggles re-run"; fi

# ── Summary ──────────────────────────────────────────────────────────────
print_summary "setup_write_user_config_test.sh"
exit $?










# vim: ft=sh sts=4 sw=4 ts=4 et :
