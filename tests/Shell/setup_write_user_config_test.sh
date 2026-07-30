#!/usr/bin/env bash
# $KYAULabs: setup_write_user_config_test.sh kyau@cosmos.kyaulabs 2026/07/29 -0700 Exp $





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

# run_writer — invoke the writer script without aborting under set -e; captures
# the exit status in WR_RC. Env vars (SETUP_USER_CONFIG plus the twelve
# OPENCODE_*/SIGNED_* vars) are inherited from the caller, including inline
# assignment-prefix overrides (SETUP_USER_CONFIG=... SIGNED_OFF_BY_NAME=... run_writer).
WR_RC=0
run_writer() {
    set +e
    bash "$SCRIPT" >/dev/null 2>&1
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
export OPENCODE_VARIANT_PRIMARY="max"
export OPENCODE_VARIANT_PLANNER="high"
export OPENCODE_VARIANT_DESIGN="high"
export OPENCODE_VARIANT_JUDGE="medium"
export OPENCODE_VARIANT_UTILITY="medium"

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
if [ "$PRI" = "new/m" ]; then pass "fresh file has correct models.primary"; else fail "wrong primary: '$PRI'"; fi
if [ "$NM" = "New Name" ]; then pass "fresh file has correct signed_off_by_name"; else fail "wrong name: '$NM'"; fi
if grep -q '//' "$CFG"; then pass "fresh file is genuine JSONC (carries comments)"; else fail "fresh file is not JSONC"; fi
if php "$MANIFEST_CLI" validate "$CFG" user >/dev/null 2>&1; then pass "fresh file validates as user v5"; else fail "fresh file fails user validation"; fi

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
  "setup_version": 5,
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
if [ "$PRI" = "new/m" ]; then pass "models.primary updated"; else fail "models.primary not updated: '$PRI'"; fi
if [ "$CUST" = "KEEP-ME" ]; then pass "custom sibling models.custom_model preserved"; else fail "sibling lost: '$CUST'"; fi
if [ "$JUDGE" = "new/j" ]; then pass "missing sibling models.judge added"; else fail "models.judge not added: '$JUDGE'"; fi

# ── Test 4: env/experimental/custom fields preserved ──────────────────────
echo "── Test 4: env/experimental/custom fields preserved ──"
T4=$(mktemp -d); register_temp_dir "$T4"
CFG="$T4/prism.jsonc"
cat > "$CFG" <<'JSON'
{
  "setup_version": 5,
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
  "setup_version": 5,
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

# ── Summary ──────────────────────────────────────────────────────────────
print_summary "setup_write_user_config_test.sh"
exit $?





# vim: ft=sh sts=4 sw=4 ts=4 et :
