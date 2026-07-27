#!/usr/bin/env bash
# $KYAULabs: resolve_identity_test.sh kyau@cosmos.kyaulabs 2026/07/27 -0700 Exp $



set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/.github/scripts/resolve-identity.sh"

source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

# ── Test 1: git config fallback (no setup.json files exist) ──────────────

echo ""
echo "── Test 1: git config fallback ──"
T1=$(mktemp -d)
register_temp_dir "$T1"
(
    cd "$T1"
    FAKE_HOME="$T1/home"
    mkdir -p "$FAKE_HOME/.config/opencode"
    git_init_test_repo .
    OUTPUT=$(HOME="$FAKE_HOME" GIT_CONFIG_NOSYSTEM=1 bash "$SCRIPT")
    if [ "$OUTPUT" = "Test User <test@example.com>" ]; then
        pass "git config fallback produces Name <email>"
    else
        fail "expected 'Test User <test@example.com>', got '$OUTPUT'"
    fi
)

# ── Test 2: project setup.json overrides git config ──────────────────────

echo "── Test 2: project setup.json overrides git config ──"
T2=$(mktemp -d)
register_temp_dir "$T2"
(
    cd "$T2"
    FAKE_HOME="$T2/home"
    mkdir -p "$FAKE_HOME/.config/opencode"
    git_init_test_repo .
    mkdir -p .opencode
    printf '{"setup_version":4,"signed_off_by_name":"Project","signed_off_by_email":"project@example.com"}\n' \
        > .opencode/setup.json
    OUTPUT=$(HOME="$FAKE_HOME" GIT_CONFIG_NOSYSTEM=1 bash "$SCRIPT")
    if [ "$OUTPUT" = "Project <project@example.com>" ]; then
        pass "project setup.json wins over git config"
    else
        fail "expected 'Project <project@example.com>', got '$OUTPUT'"
    fi
)

# ── Test 3: user setup.json overrides project ────────────────────────────

echo "── Test 3: user setup.json overrides project ──"
T3=$(mktemp -d)
register_temp_dir "$T3"
(
    cd "$T3"
    FAKE_HOME="$T3/home"
    git_init_test_repo .
    mkdir -p .opencode
    printf '{"setup_version":4,"signed_off_by_name":"Project","signed_off_by_email":"project@example.com"}\n' \
        > .opencode/setup.json
    mkdir -p "$FAKE_HOME/.config/opencode"
    printf '{"signed_off_by_name":"User","signed_off_by_email":"user@example.com"}\n' \
        > "$FAKE_HOME/.config/opencode/setup.json"
    OUTPUT=$(HOME="$FAKE_HOME" GIT_CONFIG_NOSYSTEM=1 bash "$SCRIPT")
    if [ "$OUTPUT" = "User <user@example.com>" ]; then
        pass "user setup.json wins over project"
    else
        fail "expected 'User <user@example.com>', got '$OUTPUT'"
    fi
)

# ── Test 4: all sources empty exits 3 ────────────────────────────────────

echo "── Test 4: all empty exits 3 ──"
T4=$(mktemp -d)
register_temp_dir "$T4"
(
    cd "$T4"
    # Use a fake HOME to prevent global/system git config from leaking in
    FAKE_HOME="$T4/home"
    mkdir -p "$FAKE_HOME/.config/opencode"
    git_init_test_repo .
    git config --unset user.name
    git config --unset user.email
    mkdir -p .opencode
    printf '{"setup_version":4}\n' > .opencode/setup.json
    set +e
    HOME="$FAKE_HOME" GIT_CONFIG_NOSYSTEM=1 bash "$SCRIPT" >/dev/null 2>&1
    EXIT_CODE=$?
    set -e
    if [ "$EXIT_CODE" = "3" ]; then
        pass "all sources empty exits 3"
    else
        fail "expected exit 3, got exit $EXIT_CODE"
    fi
)

# ── Test 5: output format matches 'Name <email>' ─────────────────────────

echo "── Test 5: output format ──"
T5=$(mktemp -d)
register_temp_dir "$T5"
(
    cd "$T5"
    git_init_test_repo .
    OUTPUT=$(bash "$SCRIPT")
    if echo "$OUTPUT" | grep -qE '^[^<]+ <[^@]+@[^>]+>$'; then
        pass "output matches 'Name <email>'"
    else
        fail "output '$OUTPUT' does not match 'Name <email>'"
    fi
)

# ── Summary ──────────────────────────────────────────────────────────────

print_summary "resolve_identity_test.sh"
exit $?



# vim: ft=sh sts=4 sw=4 ts=4 et :
