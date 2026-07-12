#!/usr/bin/env bash
# $KYAULabs: pre-push_test.sh kyau@akira.kyaulabs 2026/07/12 -0700 Exp $





# Tests for the pre-push hook's no-squash heuristic and non-fast-forward gate.
# Covers the three acceptance criteria from issue #74:
#   1. Squashed new branch warns
#   2. N-commit new branch doesn't warn
#   3. Incremental push to existing branch doesn't warn
# Plus a regression test for the non-fast-forward hard gate.

set -euo pipefail

RESULT_FILE=$(mktemp)
TEMP_DIRS=""
trap 'rm -f "$RESULT_FILE"; [ -n "$TEMP_DIRS" ] && rm -rf $TEMP_DIRS' EXIT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
RESET=$'\033[0m'

pass() { echo "  ${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "  ${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REAL_HOOK="$REPO_ROOT/.github/hooks/pre-push"

if [ ! -f "$REAL_HOOK" ]; then
    fail "Cannot find pre-push at $REAL_HOOK"
    exit 1
fi

ZERO_OID="0000000000000000000000000000000000000000"

# Helper: simulate a branch being pushed by creating a remote-tracking ref
simulate_pushed() {
    local remote="$1" branch="$2" oid="$3"
    git update-ref "refs/remotes/$remote/$branch" "$oid"
}

# ── Test 1: New branch with 1 commit (squash scenario) warns ─────────────

echo ""
echo "── Test 1: New branch, 1 commit — squash warning fires ──"
T1=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T1"
(
    cd "$T1"
    git init --quiet
    git config commit.gpgsign false
    git config user.email "test@example.com"
    git config user.name "Test User"

    # Base commit on main, simulate pushed to origin
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    BASE_OID=$(git rev-parse HEAD)
    simulate_pushed origin main "$BASE_OID"

    # New branch with 1 commit (squash scenario)
    git checkout --quiet -b feat/test-user-abc1-feature
    echo "change" > change.txt
    git add change.txt
    git commit --quiet -m "feat: add change"
    LOCAL_OID=$(git rev-parse HEAD)

    set +e
    output=$(echo "refs/heads/feat/test-user-abc1-feature $LOCAL_OID refs/heads/feat/test-user-abc1-feature $ZERO_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -eq 0 ] && echo "$output" | grep -qi 'Single-commit'; then
        pass "Squashed new branch warns (exit $ret)"
    else
        fail "Squashed new branch did not warn (exit=$ret): $output"
    fi
)
rm -rf "$T1"

# ── Test 2: New branch with 3 commits does not warn ───────────────────────

echo ""
echo "── Test 2: New branch, 3 commits — no warning ──"
T2=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T2"
(
    cd "$T2"
    git init --quiet
    git config commit.gpgsign false
    git config user.email "test@example.com"
    git config user.name "Test User"

    # Base commit on main, simulate pushed
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    BASE_OID=$(git rev-parse HEAD)
    simulate_pushed origin main "$BASE_OID"

    # New branch with 3 commits
    git checkout --quiet -b feat/test-user-abc2-feature
    for i in 1 2 3; do
        echo "change$i" > "change$i.txt"
        git add "change$i.txt"
        git commit --quiet -m "feat: change $i"
    done
    LOCAL_OID=$(git rev-parse HEAD)

    set +e
    output=$(echo "refs/heads/feat/test-user-abc2-feature $LOCAL_OID refs/heads/feat/test-user-abc2-feature $ZERO_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -eq 0 ] && ! echo "$output" | grep -qi 'Single-commit'; then
        pass "3-commit new branch does not warn (exit $ret)"
    else
        fail "3-commit new branch warned unexpectedly (exit=$ret): $output"
    fi
)
rm -rf "$T2"

# ── Test 3: Existing branch, incremental push (1 new commit) — no warning ─

echo ""
echo "── Test 3: Existing branch, incremental push — no warning ──"
T3=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T3"
(
    cd "$T3"
    git init --quiet
    git config commit.gpgsign false
    git config user.email "test@example.com"
    git config user.name "Test User"

    # Base commit on main, simulate pushed
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    BASE_OID=$(git rev-parse HEAD)
    simulate_pushed origin main "$BASE_OID"

    # Branch with 3 commits, simulate pushed
    git checkout --quiet -b feat/test-user-abc3-feature
    for i in 1 2 3; do
        echo "change$i" > "change$i.txt"
        git add "change$i.txt"
        git commit --quiet -m "feat: change $i"
    done
    OLD_OID=$(git rev-parse HEAD)
    simulate_pushed origin feat/test-user-abc3-feature "$OLD_OID"

    # Add 1 more commit (incremental push)
    echo "change4" > change4.txt
    git add change4.txt
    git commit --quiet -m "feat: change 4"
    NEW_OID=$(git rev-parse HEAD)

    set +e
    output=$(echo "refs/heads/feat/test-user-abc3-feature $NEW_OID refs/heads/feat/test-user-abc3-feature $OLD_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -eq 0 ] && ! echo "$output" | grep -qi 'Single-commit'; then
        pass "Incremental push to existing branch does not warn (exit $ret)"
    else
        fail "Incremental push warned unexpectedly (exit=$ret): $output"
    fi
)
rm -rf "$T3"

# ── Test 4: Non-fast-forward push is blocked (regression) ─────────────────

echo ""
echo "── Test 4: Non-fast-forward push — blocked (regression) ──"
T4=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T4"
(
    cd "$T4"
    git init --quiet
    git config commit.gpgsign false
    git config user.email "test@example.com"
    git config user.name "Test User"

    # Base commit on main, simulate pushed
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    OLD_OID=$(git rev-parse HEAD)
    simulate_pushed origin main "$OLD_OID"

    # Amend to create divergent history (non-fast-forward)
    echo "amended" > base.txt
    git add base.txt
    git commit --amend --quiet --no-edit
    NEW_OID=$(git rev-parse HEAD)

    set +e
    output=$(echo "refs/heads/main $NEW_OID refs/heads/main $OLD_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -ne 0 ] && echo "$output" | grep -qi 'BLOCKED'; then
        pass "Non-fast-forward push blocked (exit $ret)"
    else
        fail "Non-fast-forward push not blocked (exit=$ret): $output"
    fi
)
rm -rf "$T4"

# ── Test 5: Tag push is skipped (no warning, no block) ────────────────────

echo ""
echo "── Test 5: Tag push — skipped (no warning, no block) ──"
T5=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T5"
(
    cd "$T5"
    git init --quiet
    git config commit.gpgsign false
    git config user.email "test@example.com"
    git config user.name "Test User"

    # Single commit, tag it
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    TAG_OID=$(git rev-parse HEAD)

    # Push the tag — should be skipped entirely (no BLOCKED, no Single-commit)
    set +e
    output=$(echo "refs/tags/v1.0 $TAG_OID refs/tags/v1.0 $ZERO_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -eq 0 ] && ! echo "$output" | grep -qi 'Single-commit\|BLOCKED'; then
        pass "Tag push skipped (exit $ret)"
    else
        fail "Tag push not skipped (exit=$ret): $output"
    fi
)
rm -rf "$T5"

# ── Summary ────────────────────────────────────────────────────────────────

total_pass=$(grep -c "PASS" "$RESULT_FILE" 2>/dev/null || true)
total_fail=$(grep -c "FAIL" "$RESULT_FILE" 2>/dev/null || true)
: "${total_pass:=0}"
: "${total_fail:=0}"

echo ""
echo "═══════════════════════════════════════════════════════"
if [ "$total_fail" -eq 0 ]; then
    echo "✓ pre-push tests PASSED — $total_pass assertion(s), 0 failures"
    echo "═══════════════════════════════════════════════════════"
    exit 0
else
    echo "✗ pre-push tests FAILED — $total_pass passed, $total_fail failure(s)"
    echo "═══════════════════════════════════════════════════════"
    exit 1
fi





# vim: ft=sh sts=4 sw=4 ts=4 et :
