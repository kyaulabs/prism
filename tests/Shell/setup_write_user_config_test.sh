#!/usr/bin/env bash
# $KYAULabs: setup_write_user_config_test.sh kyau@cosmos.kyaulabs 2026/07/23 -0700 Exp $





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
    case "$tier" in
        primary) EXPM="new/m";; planner) EXPM="new/p";; design) EXPM="new/d";;
        judge) EXPM="new/j";; utility) EXPM="new/u";;
    esac
    if [ "$M" = "$EXPM" ]; then pass "models.$tier updated"; else fail "models.$tier wrong: '$M'"; fi
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
