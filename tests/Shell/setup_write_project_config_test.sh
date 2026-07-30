#!/usr/bin/env bash
# $KYAULabs: setup_write_project_config_test.sh kyau@cosmos.kyaulabs 2026/07/29 -0700 Exp $






# Behavior tests for setup-write-project-config.sh (ADR-0043, Task 6).
#
# Verifies the project-tier prism.jsonc writer invoked by /setup. Two modes:
#   parent — writes actual scaffold bookkeeping (scaffold_mode + project_folder)
#            plus the interview values (app/domain/repo/identity/accent and the
#            five-tier model + variant maps).
#   target — writes scaffold_mode "skip" + project_folder null plus the same
#            interview values, so a scaffolded target never embeds its parent's
#            filesystem path.
#
# Writes go through prism_manifest.php `patch` (project tier, mode 0644):
# JSONC (comment-preserving), atomic, symlink-refusing, fail-closed on
# malformed input. Every test runs against a throwaway temp file; field reads
# go through the CLI `decode` command (which strips comments) so JSONC is
# never fed straight to jq.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/.github/scripts/setup-write-project-config.sh"
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

# run_writer [args...] — invoke the writer without aborting under set -e;
# captures the exit status in WR_RC. Env vars are inherited from the caller.
WR_RC=0
run_writer() {
    set +e
    bash "$SCRIPT" "$@" >/dev/null 2>&1
    WR_RC=$?
    set -e
}

# Valid interview env vars for every test; individual tests override one or two.
export SETUP_APP="myapp"
export SETUP_DOMAIN="example.com"
export SETUP_REPO="myorg/myapp"
export SETUP_ACCENT="light-purple"
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
export SETUP_SCAFFOLD_MODE="new"
export SETUP_PROJECT_FOLDER="/repo/.test-target"

# write_valid_project_fixture <path> — write a complete valid schema-v5 project
# manifest with JSONC comments and a custom/unknown field to prove preservation.
write_valid_project_fixture() {
    local path="$1"
    cat > "$path" <<'FIX'
// Project fixture — schema v5 (ADR-0043)
{
  // Schema version — must be exactly 5.
  "setup_version": 5,
  "configured": true,
  "timestamp": "2026-07-29T00:00:00Z",
  "app": "oldapp",
  "domain": "olddomain",
  "repo": "oldorg/oldrepo",
  "signed_off_by_name": "old-name",
  "signed_off_by_email": "old@example.com",
  "accent": "sky-blue",
  // scaffold bookkeeping — should be overwritten by the writer
  "scaffold_mode": "skip",
  "project_folder": null,
  "custom_note": "KEEP-ME",
  "models": {
    "primary": "old/m",
    "planner": "old/p",
    "design": "old/d",
    "judge": "old/j",
    "utility": "old/u"
  },
  "variants": {
    "primary": "low",
    "planner": "low",
    "design": "low",
    "judge": "low",
    "utility": "low"
  },
  "experimental": {
    "lsp_tool": true,
    "scout": true,
    "background_subagents": false
  },
  "env": {
    "deepseek_api_key": "",
    "searxng_url": ""
  }
}
FIX
}

# ── Test 1: parent mode writes bookkeeping + interview values (fresh seed) ─
echo ""
echo "── Test 1: parent mode writes bookkeeping + interview values (fresh seed) ──"
T1=$(mktemp -d); register_temp_dir "$T1"
CFG="$T1/nested/dir/prism.jsonc"   # parent dir does not exist yet
run_writer "$CFG" parent
if [ "$WR_RC" -eq 0 ]; then pass "parent writer exited 0"; else fail "parent writer exited $WR_RC (expected 0)"; fi
if [ -f "$CFG" ]; then pass "missing file created (with parent dir)"; else fail "file not created"; fi
APP=$(decode_field "$CFG" '.app')
SM=$(decode_field "$CFG" '.scaffold_mode')
PF=$(decode_field "$CFG" '.project_folder | if . == null then "NULL" else . end')
PRI=$(decode_field "$CFG" '.models.primary')
ACC=$(decode_field "$CFG" '.accent')
if [ "$APP" = "myapp" ]; then pass "fresh parent file has correct app"; else fail "wrong app: '$APP'"; fi
if [ "$SM" = "new" ]; then pass "fresh parent file has correct scaffold_mode (actual bookkeeping)"; else fail "wrong scaffold_mode: '$SM'"; fi
if [ "$PF" = "/repo/.test-target" ]; then pass "fresh parent file has correct project_folder"; else fail "wrong project_folder: '$PF'"; fi
if [ "$PRI" = "new/m" ]; then pass "fresh parent file has correct models.primary"; else fail "wrong primary: '$PRI'"; fi
if [ "$ACC" = "light-purple" ]; then pass "fresh parent file has correct accent"; else fail "wrong accent: '$ACC'"; fi
if grep -q '//' "$CFG"; then pass "fresh file is genuine JSONC (carries comments)"; else fail "fresh file is not JSONC"; fi
if php "$MANIFEST_CLI" validate "$CFG" project >/dev/null 2>&1; then pass "fresh file validates as project v5"; else fail "fresh file fails project validation"; fi

# ── Test 2: target mode writes skip/null + interview values ─────────────────
echo "── Test 2: target mode writes skip/null + interview values ──"
T2=$(mktemp -d); register_temp_dir "$T2"
CFG="$T2/prism.jsonc"
write_valid_project_fixture "$CFG"
run_writer "$CFG" target
if [ "$WR_RC" -eq 0 ]; then pass "target writer exited 0"; else fail "target writer exited $WR_RC (expected 0)"; fi
SM=$(decode_field "$CFG" '.scaffold_mode')
PF=$(decode_field "$CFG" '.project_folder | if . == null then "NULL" else . end')
APP=$(decode_field "$CFG" '.app')
REPO=$(decode_field "$CFG" '.repo')
if [ "$SM" = "skip" ]; then pass "target file has scaffold_mode skip"; else fail "target scaffold_mode not skip: '$SM'"; fi
if [ "$PF" = "NULL" ]; then pass "target file has project_folder null"; else fail "target project_folder not null: '$PF'"; fi
if [ "$APP" = "myapp" ]; then pass "target file has interview app written"; else fail "target app not written: '$APP'"; fi
if [ "$REPO" = "myorg/myapp" ]; then pass "target file has interview repo written"; else fail "target repo not written: '$REPO'"; fi
if php "$MANIFEST_CLI" validate "$CFG" project >/dev/null 2>&1; then pass "target file validates as project v5"; else fail "target file fails project validation"; fi

# ── Test 3: comments and unknown fields preserved ──────────────────────────
echo "── Test 3: comments and unknown fields preserved ──"
T3=$(mktemp -d); register_temp_dir "$T3"
CFG="$T3/prism.jsonc"
write_valid_project_fixture "$CFG"
run_writer "$CFG" parent
if [ "$WR_RC" -eq 0 ]; then pass "parent writer exited 0"; else fail "parent writer exited $WR_RC (expected 0)"; fi
NOTE=$(decode_field "$CFG" '.custom_note')
APP=$(decode_field "$CFG" '.app')
EXP=$(decode_field "$CFG" '.experimental.scout')
if [ "$NOTE" = "KEEP-ME" ]; then pass "unknown top-level custom_note preserved"; else fail "custom_note lost: '$NOTE'"; fi
if [ "$EXP" = "true" ]; then pass "experimental.scout preserved"; else fail "experimental.scout lost: '$EXP'"; fi
if [ "$APP" = "myapp" ]; then pass "app updated alongside preserved fields"; else fail "app not updated: '$APP'"; fi
if grep -qF '// Schema version' "$CFG"; then pass "standalone line comment preserved"; else fail "standalone comment lost"; fi

# ── Test 4: empty required var aborts without writing ──────────────────────
echo "── Test 4: empty required var aborts without writing ──"
T4=$(mktemp -d); register_temp_dir "$T4"
CFG="$T4/prism.jsonc"
SETUP_APP="" run_writer "$CFG" parent
if [ "$WR_RC" -ne 0 ]; then pass "empty SETUP_APP exits non-zero ($WR_RC)"; else fail "expected non-zero exit, got $WR_RC"; fi
if [ ! -e "$CFG" ]; then pass "no file created on abort"; else fail "file created despite abort"; fi

# ── Test 5: parent mode requires SETUP_SCAFFOLD_MODE ───────────────────────
echo "── Test 5: parent mode requires SETUP_SCAFFOLD_MODE ──"
T5=$(mktemp -d); register_temp_dir "$T5"
CFG="$T5/prism.jsonc"
SETUP_SCAFFOLD_MODE="" run_writer "$CFG" parent
if [ "$WR_RC" -ne 0 ]; then pass "empty SETUP_SCAFFOLD_MODE (parent) exits non-zero ($WR_RC)"; else fail "expected non-zero exit, got $WR_RC"; fi
if [ ! -e "$CFG" ]; then pass "no file created on abort"; else fail "file created despite abort"; fi

# ── Test 6: written file mode is exactly 0644 ──────────────────────────────
echo "── Test 6: written file mode is exactly 0644 ──"
T6=$(mktemp -d); register_temp_dir "$T6"
CFG="$T6/prism.jsonc"
run_writer "$CFG" parent
MODE=$(file_mode "$CFG")
if [ "$MODE" = "644" ]; then pass "fresh file mode is 0644"; else fail "fresh file mode $MODE, expected 644"; fi
# Mode must remain 0644 after patching an existing file too.
run_writer "$CFG" target
MODE2=$(file_mode "$CFG")
if [ "$MODE2" = "644" ]; then pass "patched file mode stays 0644"; else fail "patched file mode $MODE2, expected 644"; fi

# ── Test 7: malformed existing file fails closed ───────────────────────────
echo "── Test 7: malformed existing file fails closed ──"
T7=$(mktemp -d); register_temp_dir "$T7"
CFG="$T7/prism.jsonc"
printf 'not valid json {{{' > "$CFG"
run_writer "$CFG" parent
if [ "$WR_RC" -ne 0 ]; then pass "malformed file exits non-zero ($WR_RC)"; else fail "expected non-zero, got $WR_RC"; fi
if [ "$(cat "$CFG")" = "not valid json {{{" ]; then pass "malformed file untouched"; else fail "malformed file was modified"; fi

# ── Test 8: symlink target refused ─────────────────────────────────────────
echo "── Test 8: symlink target refused ──"
if ! can_symlink; then
    skip "symlink refusal — platform lacks symlink support"
else
    T8=$(mktemp -d); register_temp_dir "$T8"
    TRAP="$T8/should-not-exist.json"
    CFG="$T8/prism.jsonc"
    ln -s "$TRAP" "$CFG"
    run_writer "$CFG" parent
    if [ "$WR_RC" -ne 0 ]; then pass "symlink target exits non-zero ($WR_RC)"; else fail "expected non-zero exit, got $WR_RC"; fi
    if [ ! -e "$TRAP" ]; then pass "symlink target not written through"; else fail "content written through symlink"; fi
    if [ -L "$CFG" ]; then pass "symlink left intact"; else fail "symlink was removed/replaced"; fi
fi

# ── Test 9: parent skip mode → project_folder null ─────────────────────────
echo "── Test 9: parent skip mode → project_folder null ──"
T9=$(mktemp -d); register_temp_dir "$T9"
CFG="$T9/prism.jsonc"
write_valid_project_fixture "$CFG"
SETUP_SCAFFOLD_MODE="skip" SETUP_PROJECT_FOLDER="" run_writer "$CFG" parent
if [ "$WR_RC" -eq 0 ]; then pass "parent skip writer exited 0"; else fail "parent skip writer exited $WR_RC (expected 0)"; fi
SM=$(decode_field "$CFG" '.scaffold_mode')
PF=$(decode_field "$CFG" '.project_folder | if . == null then "NULL" else . end')
if [ "$SM" = "skip" ]; then pass "parent skip → scaffold_mode skip"; else fail "wrong scaffold_mode: '$SM'"; fi
if [ "$PF" = "NULL" ]; then pass "parent skip → project_folder null"; else fail "wrong project_folder: '$PF'"; fi

# ── Test 10: arity / mode validation ───────────────────────────────────────
echo "── Test 10: arity / mode validation ──"
run_writer
if [ "$WR_RC" -eq 2 ]; then pass "no args → exit 2"; else fail "no args → exit $WR_RC (expected 2)"; fi
run_writer "$T9/prism.jsonc" bogus
if [ "$WR_RC" -eq 2 ]; then pass "bad mode → exit 2"; else fail "bad mode → exit $WR_RC (expected 2)"; fi

# ── Test 11: identical re-run is byte-identical, result valid ──────────────
echo "── Test 11: identical re-run is byte-identical, result valid ──"
T11=$(mktemp -d); register_temp_dir "$T11"
CFG="$T11/prism.jsonc"
run_writer "$CFG" parent
SNAP=$(cat "$CFG")
run_writer "$CFG" parent
if [ "$(cat "$CFG")" = "$SNAP" ]; then pass "identical re-run is byte-identical"; else fail "file changed on identical re-run"; fi
if php "$MANIFEST_CLI" validate "$CFG" project >/dev/null 2>&1; then pass "file validates after re-run"; else fail "file invalid after re-run"; fi

# ── Summary ──────────────────────────────────────────────────────────────
print_summary "setup_write_project_config_test.sh"
exit $?






# vim: ft=sh sts=4 sw=4 ts=4 et :
