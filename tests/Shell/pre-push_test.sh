#!/usr/bin/env bash
# $KYAULabs: pre-push_test.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# Tests for the pre-push hook's no-squash heuristic and non-fast-forward gate.
# Covers the three acceptance criteria from issue #74:
#   1. Squashed new branch warns
#   2. N-commit new branch doesn't warn
#   3. Incremental push to existing branch doesn't warn
# Plus a regression test for the non-fast-forward hard gate.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file
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
register_temp_dir "$T1"
(
    cd "$T1"
    git_init_test_repo .

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

# ── Test 2: New branch with 3 commits does not warn ───────────────────────

echo ""
echo "── Test 2: New branch, 3 commits — no warning ──"
T2=$(mktemp -d)
register_temp_dir "$T2"
(
    cd "$T2"
    git_init_test_repo .

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

# ── Test 3: Existing branch, incremental push (1 new commit) — no warning ─

echo ""
echo "── Test 3: Existing branch, incremental push — no warning ──"
T3=$(mktemp -d)
register_temp_dir "$T3"
(
    cd "$T3"
    git_init_test_repo .

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

# ── Test 4: Non-fast-forward push is blocked (regression) ─────────────────

echo ""
echo "── Test 4: Non-fast-forward push — blocked (regression) ──"
T4=$(mktemp -d)
register_temp_dir "$T4"
(
    cd "$T4"
    git_init_test_repo .

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

# ── Test 5: Tag push is skipped (no warning, no block) ────────────────────

echo ""
echo "── Test 5: Tag push — skipped (no warning, no block) ──"
T5=$(mktemp -d)
register_temp_dir "$T5"
(
    cd "$T5"
    git_init_test_repo .

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

# ── Test 6: SHA-256 zero OID (64 zeros) recognized as zero ───────────────

echo ""
echo "── Test 6: SHA-256 zero OID — recognized as zero ──"
T6=$(mktemp -d)
register_temp_dir "$T6"
(
    cd "$T6"
    git_init_test_repo .

    # Single commit
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    LOCAL_OID=$(git rev-parse HEAD)

    ZERO_OID_256="0000000000000000000000000000000000000000000000000000000000000000"

    # Push with 64-zero remote_oid — should be treated as new branch
    # (skip non-FF check), not crash on merge-base with invalid OID.
    set +e
    output=$(echo "refs/heads/main $LOCAL_OID refs/heads/main $ZERO_OID_256" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -eq 0 ] && ! echo "$output" | grep -qi 'BLOCKED'; then
        pass "SHA-256 zero remote_oid handled gracefully (exit $ret)"
    else
        fail "SHA-256 zero remote_oid not handled (exit=$ret): $output"
    fi
)

# ── Test 7: Control chars stripped from echoed commit subject ─────────────

echo ""
echo "── Test 7: Control chars stripped from commit subject ──"
T7=$(mktemp -d)
register_temp_dir "$T7"
(
    cd "$T7"
    git_init_test_repo .

    # Base commit on main, simulate pushed
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    BASE_OID=$(git rev-parse HEAD)
    simulate_pushed origin main "$BASE_OID"

    # New branch with 1 commit whose subject contains ANSI escape sequences.
    # Uses \033[5m (blink-on) which is distinct from hook formatting codes
    # (RED, YELLOW, ORANGE, DIM, BOLD, CYAN, RESET), so it can be detected
    # independently in the output.
    git checkout --quiet -b feat/test-user-abc7-feature
    echo "change" > change.txt
    git add change.txt
    git commit --quiet -m "$(printf 'feat: \033[5mblink\033[25m text')"
    LOCAL_OID=$(git rev-parse HEAD)

    set +e
    output=$(echo "refs/heads/feat/test-user-abc7-feature $LOCAL_OID refs/heads/feat/test-user-abc7-feature $ZERO_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    # After 'tr -d '\000-\037'', the ESC byte in \033[5m is stripped,
    # leaving visible "[5mblink[25m" text. Verify:
    #   1. Warning fires (Single-commit in output)
    #   2. Injected ESC+[5m is NOT in output
    #   3. Visible "[5mblink[25m" IS in output (proves commit was read)

    visible=$(echo "$output" | grep -F '[5mblink[25m' || true)
    has_injected=false
    printf '%s' "$output" | grep -qF $'\033[5m' && has_injected=true

    if [ "$ret" -eq 0 ] \
       && echo "$output" | grep -qi 'Single-commit' \
       && [ "$has_injected" = false ] \
       && [ -n "$visible" ]; then
        pass "Control chars stripped from commit subject (exit $ret)"
    else
        fail "Control chars not stripped or warning missing (exit=$ret, injected=$has_injected, visible=$visible)"
    fi
)

# ── Test 8: Fast-forward update to refs/heads/main is blocked ──────────

echo ""
echo "── Test 8: Fast-forward update to main — blocked ──"
T8=$(mktemp -d)
register_temp_dir "$T8"
(
    cd "$T8"
    git_init_test_repo .

    # Base commit on main, simulate pushed to origin
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    BASE_OID=$(git rev-parse HEAD)
    simulate_pushed origin main "$BASE_OID"

    # Create second commit (fast-forward update)
    echo "change" > change.txt
    git add change.txt
    git commit --quiet -m "feat: add change"
    NEW_OID=$(git rev-parse HEAD)

    set +e
    output=$(echo "refs/heads/main $NEW_OID refs/heads/main $BASE_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -ne 0 ] && echo "$output" | grep -qi 'BLOCKED'; then
        pass "Fast-forward update to main blocked (exit $ret)"
    else
        fail "Fast-forward update to main not blocked (exit=$ret): $output"
    fi
)

# ── Test 9: Fast-forward update to refs/heads/develop is blocked ──────

echo ""
echo "── Test 9: Fast-forward update to develop — blocked ──"
T9=$(mktemp -d)
register_temp_dir "$T9"
(
    cd "$T9"
    git_init_test_repo .

    # Base commit on develop, simulate pushed to origin
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    BASE_OID=$(git rev-parse HEAD)
    git branch -m develop
    simulate_pushed origin develop "$BASE_OID"

    # Create second commit (fast-forward update)
    echo "change" > change.txt
    git add change.txt
    git commit --quiet -m "feat: add change"
    NEW_OID=$(git rev-parse HEAD)

    set +e
    output=$(echo "refs/heads/develop $NEW_OID refs/heads/develop $BASE_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -ne 0 ] && echo "$output" | grep -qi 'BLOCKED'; then
        pass "Fast-forward update to develop blocked (exit $ret)"
    else
        fail "Fast-forward update to develop not blocked (exit=$ret): $output"
    fi
)

# ── Test 10: Deletion of protected ref is blocked ─────────────────────

echo ""
echo "── Test 10: Deletion of main — blocked ──"
T10=$(mktemp -d)
register_temp_dir "$T10"
(
    cd "$T10"
    git_init_test_repo .

    # Base commit on main, simulate pushed to origin
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    BASE_OID=$(git rev-parse HEAD)

    # Simulate deletion — zero local OID, non-zero remote OID
    set +e
    output=$(echo "refs/heads/main $ZERO_OID refs/heads/main $BASE_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -ne 0 ] && echo "$output" | grep -qi 'BLOCKED'; then
        pass "Deletion of main blocked (exit $ret)"
    else
        fail "Deletion of main not blocked (exit=$ret): $output"
    fi
)

# ── Test 11: Refspec work→main is blocked (remote_ref, not local_ref) ─

echo ""
echo "── Test 11: Refspec work→main — blocked ──"
T11=$(mktemp -d)
register_temp_dir "$T11"
(
    cd "$T11"
    git_init_test_repo .

    # Base commit on main, simulate pushed to origin
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    BASE_OID=$(git rev-parse HEAD)
    simulate_pushed origin main "$BASE_OID"

    # Work branch with one commit ahead of main
    git checkout --quiet -b work
    echo "change" > change.txt
    git add change.txt
    git commit --quiet -m "feat: add change"
    WORK_OID=$(git rev-parse HEAD)

    # local_ref=work, remote_ref=main — blocked because target is protected
    set +e
    output=$(echo "refs/heads/work $WORK_OID refs/heads/main $BASE_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -ne 0 ] && echo "$output" | grep -qi 'BLOCKED'; then
        pass "Refspec work->main blocked by remote_ref (exit $ret)"
    else
        fail "Refspec work->main not blocked (exit=$ret): $output"
    fi
)

# ── Test 12: Work-branch push remains allowed (regression) ─────────────

echo ""
echo "── Test 12: Work-branch push — allowed ──"
T12=$(mktemp -d)
register_temp_dir "$T12"
(
    cd "$T12"
    git_init_test_repo .

    # Base commit on main, simulate pushed to origin
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    BASE_OID=$(git rev-parse HEAD)
    simulate_pushed origin main "$BASE_OID"

    # Work branch with 3 commits (not a squash candidate either)
    git checkout --quiet -b feat/test-user-abc12-feature
    for i in 1 2 3; do
        echo "change$i" > "change$i.txt"
        git add "change$i.txt"
        git commit --quiet -m "feat: change $i"
    done
    WORK_OID=$(git rev-parse HEAD)

    set +e
    output=$(echo "refs/heads/feat/test-user-abc12-feature $WORK_OID refs/heads/feat/test-user-abc12-feature $ZERO_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -eq 0 ] && ! echo "$output" | grep -qi 'BLOCKED'; then
        pass "Work-branch push allowed (exit $ret)"
    else
        fail "Work-branch push blocked unexpectedly (exit=$ret): $output"
    fi
)

# ── Test 13: Tag push to refs/tags/v1.0.0 remains allowed ─────────────

echo ""
echo "── Test 13: Tag push v1.0.0 — allowed ──"
T13=$(mktemp -d)
register_temp_dir "$T13"
(
    cd "$T13"
    git_init_test_repo .

    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    TAG_OID=$(git rev-parse HEAD)

    set +e
    output=$(echo "refs/tags/v1.0.0 $TAG_OID refs/tags/v1.0.0 $ZERO_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -eq 0 ] && ! echo "$output" | grep -qi 'BLOCKED'; then
        pass "Tag push v1.0.0 allowed (exit $ret)"
    else
        fail "Tag push v1.0.0 blocked (exit=$ret): $output"
    fi
)

# ── Test 14: Absent remote + one root commit to main — allowed ────────

echo ""
echo "── Test 14: Initial seed push to main — allowed ──"
T14=$(mktemp -d)
register_temp_dir "$T14"
(
    cd "$T14"
    git_init_test_repo .

    # Single zero-parent root commit (no remote tracking, no parent)
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "initial commit"
    ROOT_OID=$(git rev-parse HEAD)

    set +e
    output=$(echo "refs/heads/main $ROOT_OID refs/heads/main $ZERO_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -eq 0 ] && ! echo "$output" | grep -qi 'BLOCKED'; then
        pass "Initial seed push to main allowed (exit $ret)"
    else
        fail "Initial seed push to main blocked (exit=$ret): $output"
    fi
)

# ── Test 15: Absent remote + multi-commit history to main — blocked ────

echo ""
echo "── Test 15: Multi-commit push to absent main — blocked ──"
T15=$(mktemp -d)
register_temp_dir "$T15"
(
    cd "$T15"
    git_init_test_repo .

    # Multiple commits (no remote tracking)
    echo "first" > first.txt
    git add first.txt
    git commit --quiet -m "first commit"
    echo "second" > second.txt
    git add second.txt
    git commit --quiet -m "second commit"
    LOCAL_OID=$(git rev-parse HEAD)

    set +e
    output=$(echo "refs/heads/main $LOCAL_OID refs/heads/main $ZERO_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -ne 0 ] && echo "$output" | grep -qi 'BLOCKED'; then
        pass "Multi-commit push to absent main blocked (exit $ret)"
    else
        fail "Multi-commit push to absent main not blocked (exit=$ret): $output"
    fi
)

# ── Test 16: SHA-256 zero OID + one root commit to develop — allowed ──

echo ""
echo "── Test 16: SHA-256 zero OID + root commit to develop — allowed ──"
T16=$(mktemp -d)
register_temp_dir "$T16"
(
    cd "$T16"
    git_init_test_repo .

    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "initial commit"
    ROOT_OID=$(git rev-parse HEAD)

    ZERO_OID_256="0000000000000000000000000000000000000000000000000000000000000000"

    set +e
    output=$(echo "refs/heads/develop $ROOT_OID refs/heads/develop $ZERO_OID_256" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -eq 0 ] && ! echo "$output" | grep -qi 'BLOCKED'; then
        pass "SHA-256 zero OID + root commit to develop allowed (exit $ret)"
    else
        fail "SHA-256 zero OID + root commit to develop blocked (exit=$ret): $output"
    fi
)

# ── Summary ────────────────────────────────────────────────────────────

print_summary "pre-push_test.sh"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
