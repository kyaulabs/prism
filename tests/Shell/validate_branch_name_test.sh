#!/usr/bin/env bash
# $KYAULabs: validate_branch_name_test.sh kyau@aura.kyaulabs 2026/08/12 -0700 Exp $









set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/packages/prism-core/scripts/validate-branch-name.sh"

source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

# ── Exempt branches (exit 0) ─────────────────────────────────────────────

test_protected_main() {
    local code stderr_out
    set +e
    stderr_out=$(bash "$SCRIPT" main 2>&1 >/dev/null)
    code=$?
    set -e
    if [ "$code" = "3" ]; then
        if echo "$stderr_out" | grep -q "main" && echo "$stderr_out" | grep -q "new-branch.sh"; then
            pass "main protected (exit 3, diagnostic names branch and new-branch.sh)"
        else
            fail "main exit 3 but diagnostic missing branch or new-branch.sh: $stderr_out"
        fi
    else
        fail "main should exit 3 (protected), got $code"
    fi
}

test_protected_develop() {
    local code stderr_out
    set +e
    stderr_out=$(bash "$SCRIPT" develop 2>&1 >/dev/null)
    code=$?
    set -e
    if [ "$code" = "3" ]; then
        if echo "$stderr_out" | grep -q "develop" && echo "$stderr_out" | grep -q "new-branch.sh"; then
            pass "develop protected (exit 3, diagnostic names branch and new-branch.sh)"
        else
            fail "develop exit 3 but diagnostic missing branch or new-branch.sh: $stderr_out"
        fi
    else
        fail "develop should exit 3 (protected), got $code"
    fi
}

test_exempt_head() {
    local code
    set +e
    bash "$SCRIPT" HEAD >/dev/null 2>&1
    code=$?
    set -e
    if [ "$code" = "0" ]; then pass "HEAD exempt (exit 0)"; else fail "HEAD should exit 0, got $code"; fi
}

# ── Valid branches (exit 0) ──────────────────────────────────────────────

test_valid_feat() {
    local code
    set +e
    bash "$SCRIPT" "feat/kyau-c6a2-add-foo" >/dev/null 2>&1
    code=$?
    set -e
    if [ "$code" = "0" ]; then pass "valid feat branch"; else fail "feat/kyau-c6a2-add-foo should exit 0, got $code"; fi
}

test_valid_fix_multiword() {
    local code
    set +e
    bash "$SCRIPT" "fix/jane-doe-dead-fix-bug" >/dev/null 2>&1
    code=$?
    set -e
    if [ "$code" = "0" ]; then pass "valid fix multiword branch"; else fail "fix/jane-doe-dead-fix-bug should exit 0, got $code"; fi
}

test_valid_release() {
    local code
    set +e
    bash "$SCRIPT" "release/1.2.0" >/dev/null 2>&1
    code=$?
    set -e
    if [ "$code" = "0" ]; then pass "valid release branch"; else fail "release/1.2.0 should exit 0, got $code"; fi
}

test_valid_release_pre() {
    local code
    set +e
    bash "$SCRIPT" "release/2.0.0-rc.1" >/dev/null 2>&1
    code=$?
    set -e
    if [ "$code" = "0" ]; then pass "valid release prerelease"; else fail "release/2.0.0-rc.1 should exit 0, got $code"; fi
}

test_valid_hotfix() {
    local code
    set +e
    bash "$SCRIPT" "hotfix/kyau-abcd-fix-critical" >/dev/null 2>&1
    code=$?
    set -e
    if [ "$code" = "0" ]; then pass "valid hotfix branch"; else fail "hotfix/kyau-abcd-fix-critical should exit 0, got $code"; fi
}

# ── Invalid branches (exit 1) ────────────────────────────────────────────

test_invalid_feature_type() {
    local code
    set +e
    bash "$SCRIPT" "feature/kyau-c6a2-add-foo" >/dev/null 2>&1
    code=$?
    set -e
    if [ "$code" = "1" ]; then pass "invalid 'feature' type exits 1"; else fail "feature/kyau-c6a2-add-foo should exit 1, got $code"; fi
}

test_invalid_no_hash() {
    local code
    set +e
    bash "$SCRIPT" "feat/kyau-add-foo" >/dev/null 2>&1
    code=$?
    set -e
    if [ "$code" = "1" ]; then pass "invalid no-hash exits 1"; else fail "feat/kyau-add-foo should exit 1, got $code"; fi
}

test_invalid_5hex() {
    local code
    set +e
    bash "$SCRIPT" "feat/kyau-c6a2a-add-foo" >/dev/null 2>&1
    code=$?
    set -e
    if [ "$code" = "1" ]; then pass "invalid 5-char hash exits 1"; else fail "feat/kyau-c6a2a-add-foo should exit 1, got $code"; fi
}

test_invalid_uppercase() {
    local code
    set +e
    bash "$SCRIPT" "Feat/kyau-c6a2-add-foo" >/dev/null 2>&1
    code=$?
    set -e
    if [ "$code" = "1" ]; then pass "invalid uppercase type exits 1"; else fail "Feat/kyau-c6a2-add-foo should exit 1, got $code"; fi
}

test_invalid_buildmeta() {
    local code
    set +e
    bash "$SCRIPT" "release/1.2.0+build.42" >/dev/null 2>&1
    code=$?
    set -e
    if [ "$code" = "1" ]; then pass "invalid build metadata exits 1"; else fail "release/1.2.0+build.42 should exit 1, got $code"; fi
}

test_invalid_ignore_type() {
    local code
    set +e
    bash "$SCRIPT" "ignore/kyau-c6a2-x" >/dev/null 2>&1
    code=$?
    set -e
    if [ "$code" = "1" ]; then pass "invalid 'ignore' type exits 1"; else fail "ignore/kyau-c6a2-x should exit 1, got $code"; fi
}

# ── Run all tests ────────────────────────────────────────────────────────

echo ""
echo "── Protected branches ──"
test_protected_main
test_protected_develop
test_exempt_head

echo ""
echo "── Valid branches ──"
test_valid_feat
test_valid_fix_multiword
test_valid_release
test_valid_release_pre
test_valid_hotfix

echo ""
echo "── Invalid branches ──"
test_invalid_feature_type
test_invalid_no_hash
test_invalid_5hex
test_invalid_uppercase
test_invalid_buildmeta
test_invalid_ignore_type

# ── Summary ──────────────────────────────────────────────────────────────

print_summary "validate_branch_name_test.sh"
exit $?








# vim: ft=sh sts=4 sw=4 ts=4 et :
