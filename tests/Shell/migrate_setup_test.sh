#!/usr/bin/env bash
# $KYAULabs: migrate_setup_test.sh kyau@nova 2026/07/19 -0700 Exp $




set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/.github/scripts/migrate-setup.sh"

source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

# ── Test 1: idempotent on already-v4 setup.json ──────────────────────────

echo ""
echo "── Test 1: idempotent on v4 ──"
T1=$(mktemp -d)
register_temp_dir "$T1"
(
    cd "$T1"
    cat > setup.json <<'JSON'
{
  "setup_version": 4,
  "signed_off_by_name": "kyau",
  "signed_off_by_email": "git@kyaulabs.com",
  "accent": "sky-blue",
  "scaffold_mode": "skip",
  "project_folder": null,
  "models": {
    "primary": "deepseek/deepseek-v4-pro",
    "planner": "openrouter/z-ai/glm-5.2",
    "judge": "openrouter/z-ai/glm-5.2",
    "utility": "deepseek/deepseek-v4-flash"
  },
  "variants": {
    "primary": "max",
    "planner": "high",
    "judge": "medium",
    "utility": "medium"
  },
  "experimental": {
    "lsp_tool": true,
    "scout": true,
    "background_subagents": false
  }
}
JSON
    ORIG_MD5=$(md5sum setup.json | awk '{print $1}')
    set +e
    bash "$SCRIPT" setup.json >/dev/null 2>&1
    set -e
    AFTER_MD5=$(md5sum setup.json | awk '{print $1}')
    if [ "$ORIG_MD5" = "$AFTER_MD5" ]; then
        pass "v4 file unchanged (idempotent)"
    else
        fail "v4 file was modified — idempotency broken"
    fi
)

# ── Test 2: migrates v1 to v4 ─────────────────────────────────────────────

echo "── Test 2: migrates v1 to v4 ──"
T2=$(mktemp -d)
register_temp_dir "$T2"
(
    cd "$T2"
    cat > setup.json <<'JSON'
{
  "configured": true,
  "timestamp": "2026-07-06T23:44:00Z",
  "app": "template",
  "domain": "kyaulabs",
  "repo": "kyaulabs/template",
  "signed_off_by_name": "kyau",
  "signed_off_by_email": "git@kyaulabs.com"
}
JSON
    set +e
    bash "$SCRIPT" setup.json >/dev/null 2>&1
    set -e
    VERSION=$(jq -r '.setup_version' setup.json)
    if [ "$VERSION" != "4" ]; then
        fail "expected setup_version 4, got '$VERSION'"
    else
        pass "setup_version set to 4"
    fi

    # Verify all expected keys are present
    for key in signed_off_by_name signed_off_by_email accent scaffold_mode models variants experimental; do
        if jq -e ".$key != null" setup.json >/dev/null 2>&1; then
            pass "key '$key' present"
        else
            fail "key '$key' missing after migration"
        fi
    done

    # Verify default accent
    ACCENT=$(jq -r '.accent' setup.json)
    if [ "$ACCENT" = "sky-blue" ]; then
        pass "accent defaulted to sky-blue"
    else
        fail "expected accent=sky-blue, got '$ACCENT'"
    fi

    # Verify default scaffold_mode
    MODE=$(jq -r '.scaffold_mode' setup.json)
    if [ "$MODE" = "skip" ]; then
        pass "scaffold_mode defaulted to skip"
    else
        fail "expected scaffold_mode=skip, got '$MODE'"
    fi

    # Verify model tiers present
    for tier in primary planner judge utility; do
        MODEL=$(jq -r ".models.\"${tier}\"" setup.json)
        if [ -n "$MODEL" ] && [ "$MODEL" != "null" ]; then
            pass "model '$tier' present: $MODEL"
        else
            fail "model '$tier' missing"
        fi
    done

    # Verify variant tiers present
    for tier in primary planner judge utility; do
        VARIANT=$(jq -r ".variants.\"${tier}\"" setup.json)
        if [ -n "$VARIANT" ] && [ "$VARIANT" != "null" ]; then
            pass "variant '$tier' present: $VARIANT"
        else
            fail "variant '$tier' missing"
        fi
    done

    # Verify experimental keys present
    for flag in lsp_tool scout background_subagents; do
        VAL=$(jq -r ".experimental.\"${flag}\"" setup.json)
        if [ "$VAL" != "null" ]; then
            pass "experimental '$flag' present: $VAL"
        else
            fail "experimental '$flag' missing"
        fi
    done
)

# ── Test 3: preserves existing identity fields ────────────────────────────

echo "── Test 3: preserves existing identity ──"
T3=$(mktemp -d)
register_temp_dir "$T3"
(
    cd "$T3"
    cat > setup.json <<'JSON'
{
  "configured": true,
  "timestamp": "2026-07-06T23:44:00Z",
  "app": "template",
  "domain": "kyaulabs",
  "repo": "kyaulabs/template",
  "signed_off_by_name": "Custom",
  "signed_off_by_email": "custom@example.com"
}
JSON
    set +e
    bash "$SCRIPT" setup.json >/dev/null 2>&1
    set -e
    NAME=$(jq -r '.signed_off_by_name' setup.json)
    EMAIL=$(jq -r '.signed_off_by_email' setup.json)
    if [ "$NAME" = "Custom" ]; then
        pass "signed_off_by_name preserved: 'Custom'"
    else
        fail "signed_off_by_name changed to '$NAME'"
    fi
    if [ "$EMAIL" = "custom@example.com" ]; then
        pass "signed_off_by_email preserved: 'custom@example.com'"
    else
        fail "signed_off_by_email changed to '$EMAIL'"
    fi
)

# ── Test 4: preserves existing models block if already present ─────────────

echo "── Test 4: preserves existing models block ──"
T4=$(mktemp -d)
register_temp_dir "$T4"
(
    cd "$T4"
    cat > setup.json <<'JSON'
{
  "setup_version": 3,
  "signed_off_by_name": "kyau",
  "signed_off_by_email": "git@kyaulabs.com",
  "models": {
    "primary": "custom/model-a",
    "planner": "custom/model-b",
    "judge": "custom/model-c",
    "utility": "custom/model-d"
  }
}
JSON
    set +e
    bash "$SCRIPT" setup.json >/dev/null 2>&1
    set -e
    PRIMARY=$(jq -r '.models.primary' setup.json)
    if [ "$PRIMARY" = "custom/model-a" ]; then
        pass "models block preserved: primary=custom/model-a"
    else
        fail "models.primary overwritten to '$PRIMARY'"
    fi
    if [ "$(jq -r '.setup_version' setup.json)" = "4" ]; then
        pass "setup_version bumped to 4"
    else
        fail "setup_version not bumped to 4"
    fi
)

# ── Test 5: missing file exits non-zero ───────────────────────────────────

echo "── Test 5: missing file exits non-zero ──"
T5=$(mktemp -d)
register_temp_dir "$T5"
(
    set +e
    bash "$SCRIPT" /nonexistent/path/setup.json >/dev/null 2>&1
    EXIT_CODE=$?
    set -e
    if [ "$EXIT_CODE" -ne 0 ]; then
        pass "missing file exits non-zero ($EXIT_CODE)"
    else
        fail "expected non-zero exit for missing file, got $EXIT_CODE"
    fi
)

# ── Test 6: missing jq exits non-zero ─────────────────────────────────────

echo "── Test 6: missing jq exits non-zero ──"
T6=$(mktemp -d)
register_temp_dir "$T6"
(
    cd "$T6"
    echo '{"setup_version":1,"signed_off_by_name":"kyau","signed_off_by_email":"git@kyaulabs.com"}' > setup.json
    # Run with PATH pointing to nothing (no jq available)
    set +e
    PATH="" bash "$SCRIPT" setup.json >/dev/null 2>&1
    EXIT_CODE=$?
    set -e
    if [ "$EXIT_CODE" -ne 0 ]; then
        pass "missing jq exits non-zero ($EXIT_CODE)"
    else
        fail "expected non-zero exit when jq missing, got $EXIT_CODE"
    fi
)

# ── Summary ────────────────────────────────────────────────────────────────

print_summary "migrate_setup_test.sh"
exit $?



# vim: ft=sh sts=4 sw=4 ts=4 et :
