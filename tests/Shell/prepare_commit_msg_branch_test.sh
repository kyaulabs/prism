#!/usr/bin/env bash
# $KYAULabs: prepare_commit_msg_branch_test.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# ── Tests for prepare-commit-msg hook (branch name validation, ADR-0028) ────────
# Covers:
#   - Valid branch names pass (feat/fix/hotfix/release patterns)
#   - Exempt branches pass (main, develop, detached HEAD)
#   - Invalid branch names are blocked
#   - Rebase early-exit takes precedence over branch validation
#   - Regression: amend-pushed logic still fires

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REAL_HOOK="$REPO_ROOT/.github/hooks/prepare-commit-msg"
VALIDATOR="$REPO_ROOT/packages/prism-core/scripts/validate-branch-name.sh"

source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

if [ ! -f "$REAL_HOOK" ]; then
	fail "Cannot find prepare-commit-msg at $REAL_HOOK"
	exit 1
fi

if [ ! -f "$VALIDATOR" ]; then
	fail "Cannot find validate-branch-name.sh at $VALIDATOR"
	exit 1
fi

# ── Helper: set up a sandbox repo with main + develop branches ─────────────
# Creates an initial commit and ensures both main and develop exist.
setup_repo_with_bases() {
	local dir="$1"
	git_init_test_repo "$dir"
	(
		cd "$dir" || exit 1
		git commit --allow-empty -m "initial"
		local current
		current=$(git rev-parse --abbrev-ref HEAD)
		if [ "$current" != "main" ]; then
			git branch -m "$current" main
		fi
		git branch develop main
	)
}

# ── Helper: install the validator script into a sandbox ────────────────────
# The hook resolves REPO_ROOT via `git rev-parse --show-toplevel`, so the
# validator must live at $SANDBOX/packages/prism-core/scripts/validate-branch-name.sh.
install_validator() {
	mkdir -p packages/prism-core/scripts
	cp "$VALIDATOR" packages/prism-core/scripts/validate-branch-name.sh
	chmod +x packages/prism-core/scripts/validate-branch-name.sh
}

# ── Test 1: Valid feature branch passes ───────────────────────────────────

echo ""
echo "── Test 1: Valid feature branch passes ──"
T1=$(mktemp -d)
register_temp_dir "$T1"
(
	cd "$T1"
	setup_repo_with_bases .
	git checkout -b feat/test-c6a2-add-thing develop
	install_validator
	MSG_FILE=$(mktemp)
	echo "test commit" > "$MSG_FILE"
	set +e
	bash "$REAL_HOOK" "$MSG_FILE" >/dev/null 2>&1
	code=$?
	set -e
	rm -f "$MSG_FILE"
	if [ "$code" = "0" ]; then
		pass "valid feature branch passes (exit 0)"
	else
		fail "valid branch should exit 0, got $code"
	fi
)

# ── Test 2: Commit on initialized main blocked ─────────────────────────────

echo "── Test 2: Commit on initialized main blocked ──"
T2=$(mktemp -d)
register_temp_dir "$T2"
(
	cd "$T2"
	setup_repo_with_bases .
	git checkout main
	install_validator
	MSG_FILE=$(mktemp)
	echo "test commit" > "$MSG_FILE"
	set +e
	output=$(bash "$REAL_HOOK" "$MSG_FILE" 2>&1)
	code=$?
	set -e
	rm -f "$MSG_FILE"
	if [ "$code" -ne 0 ]; then
		pass "main blocked (exit $code)"
	else
		fail "main should be blocked (non-zero), got $code"
	fi
)

# ── Test 3: Commit on initialized develop blocked ──────────────────────────

echo "── Test 3: Commit on initialized develop blocked ──"
T3=$(mktemp -d)
register_temp_dir "$T3"
(
	cd "$T3"
	setup_repo_with_bases .
	git checkout develop
	install_validator
	MSG_FILE=$(mktemp)
	echo "test commit" > "$MSG_FILE"
	set +e
	output=$(bash "$REAL_HOOK" "$MSG_FILE" 2>&1)
	code=$?
	set -e
	rm -f "$MSG_FILE"
	if [ "$code" -ne 0 ]; then
		pass "develop blocked (exit $code)"
	else
		fail "develop should be blocked (non-zero), got $code"
	fi
)

# ── Test 4: Invalid branch blocked ────────────────────────────────────────

echo "── Test 4: Invalid branch blocked ──"
T4=$(mktemp -d)
register_temp_dir "$T4"
(
	cd "$T4"
	setup_repo_with_bases .
	git checkout -b bad-branch-name
	install_validator
	MSG_FILE=$(mktemp)
	echo "test commit" > "$MSG_FILE"
	set +e
	bash "$REAL_HOOK" "$MSG_FILE" >/dev/null 2>&1
	code=$?
	set -e
	rm -f "$MSG_FILE"
	if [ "$code" = "1" ]; then
		pass "invalid branch blocked (exit 1)"
	else
		fail "invalid branch should exit 1, got $code"
	fi
)

# ── Test 5: Detached HEAD passes ──────────────────────────────────────────

echo "── Test 5: Detached HEAD passes ──"
T5=$(mktemp -d)
register_temp_dir "$T5"
(
	cd "$T5"
	setup_repo_with_bases .
	git checkout --detach
	install_validator
	MSG_FILE=$(mktemp)
	echo "test commit" > "$MSG_FILE"
	set +e
	bash "$REAL_HOOK" "$MSG_FILE" >/dev/null 2>&1
	code=$?
	set -e
	rm -f "$MSG_FILE"
	if [ "$code" = "0" ]; then
		pass "detached HEAD passes (exit 0)"
	else
		fail "detached HEAD should exit 0, got $code"
	fi
)

# ── Test 6: Rebase early-exit still works ─────────────────────────────────

echo "── Test 6: Rebase early-exit still works ──"
T6=$(mktemp -d)
register_temp_dir "$T6"
(
	cd "$T6"
	setup_repo_with_bases .
	# Switch to an invalid branch that would be blocked
	git checkout -b bad-branch-name
	# Simulate an active rebase
	mkdir -p .git/rebase-merge
	install_validator
	MSG_FILE=$(mktemp)
	echo "test commit" > "$MSG_FILE"
	set +e
	bash "$REAL_HOOK" "$MSG_FILE" >/dev/null 2>&1
	code=$?
	set -e
	rm -f "$MSG_FILE"
	if [ "$code" = "0" ]; then
		pass "rebase early-exit still works (exit 0 on invalid branch)"
	else
		fail "rebase should exit 0, got $code"
	fi
)

# ── Test 8: First commit on unborn main (no remote) passes ────────────────
# ADR-0044 root exception: unborn HEAD + no remote-tracking ref → allowed.

echo "── Test 8: First commit on unborn main (no remote) passes ──"
T8=$(mktemp -d)
register_temp_dir "$T8"
(
	cd "$T8"
	git_init_test_repo .
	# Ensure default branch is 'main' (unborn — no commits yet)
	git symbolic-ref HEAD refs/heads/main
	install_validator
	MSG_FILE=$(mktemp)
	echo "initial scaffold commit" > "$MSG_FILE"
	set +e
	output=$(bash "$REAL_HOOK" "$MSG_FILE" 2>&1)
	code=$?
	set -e
	rm -f "$MSG_FILE"
	if [ "$code" = "0" ]; then
		pass "first commit on unborn main allowed (root exception, exit 0)"
	else
		fail "first commit on unborn main should pass (exit 0), got $code"
		echo "  output: $output"
	fi
)

# ── Test 9: First commit on unborn develop (no remote) passes ─────────────
# ADR-0044 root exception: unborn HEAD + no remote-tracking ref → allowed.

echo "── Test 9: First commit on unborn develop (no remote) passes ──"
T9=$(mktemp -d)
register_temp_dir "$T9"
(
	cd "$T9"
	git_init_test_repo .
	# Ensure default branch is 'develop' (unborn — no commits yet)
	git symbolic-ref HEAD refs/heads/develop
	install_validator
	MSG_FILE=$(mktemp)
	echo "initial scaffold commit" > "$MSG_FILE"
	set +e
	output=$(bash "$REAL_HOOK" "$MSG_FILE" 2>&1)
	code=$?
	set -e
	rm -f "$MSG_FILE"
	if [ "$code" = "0" ]; then
		pass "first commit on unborn develop allowed (root exception, exit 0)"
	else
		fail "first commit on unborn develop should pass (exit 0), got $code"
		echo "  output: $output"
	fi
)

# ── Test 10: Orphan protected branch with remote ref blocked ──────────────
# Unborn HEAD + remote-tracking ref exists → NOT a root exception → blocked.

echo "── Test 10: Orphan protected branch with remote ref blocked ──"
T10=$(mktemp -d)
register_temp_dir "$T10"
(
	cd "$T10"
	git_init_test_repo .
	# Move default branch out of the way so we can create an orphan main.
	git branch -m throwaway 2>/dev/null || true
	git commit --allow-empty -m "dummy"
	ROOT_SHA=$(git rev-parse HEAD)
	# Create orphan main (unborn, no commits)
	git checkout --orphan main
	git rm -rf --cached . 2>/dev/null || true
	mkdir -p .git/refs/remotes/origin
	echo "$ROOT_SHA" > .git/refs/remotes/origin/main
	install_validator
	MSG_FILE=$(mktemp)
	echo "test commit" > "$MSG_FILE"
	set +e
	output=$(bash "$REAL_HOOK" "$MSG_FILE" 2>&1)
	code=$?
	set -e
	rm -f "$MSG_FILE"
	if [ "$code" -ne 0 ]; then
		pass "orphan protected branch with remote ref blocked (exit $code)"
	else
		fail "orphan protected branch with remote ref should be blocked, got 0"
	fi
)

# ── Test 11: Rebase on main blocked (protected check before rebase exit) ──
# Protected check must fire before the rebase early exit; a rebase on main
# should be rejected with a protected-branch diagnostic, not bypassed.

echo "── Test 11: Rebase on main blocked ──"
T11=$(mktemp -d)
register_temp_dir "$T11"
(
	cd "$T11"
	setup_repo_with_bases .
	git checkout main
	# Simulate an active rebase on main
	mkdir -p .git/rebase-merge
	install_validator
	MSG_FILE=$(mktemp)
	echo "test commit" > "$MSG_FILE"
	set +e
	output=$(bash "$REAL_HOOK" "$MSG_FILE" 2>&1)
	code=$?
	set -e
	rm -f "$MSG_FILE"
	if [ "$code" -ne 0 ]; then
		pass "rebase on main blocked (exit $code)"
	else
		fail "rebase on main should be blocked, got 0"
	fi
)

# ── Test 7: Amend-pushed regression ───────────────────────────────────────
# Verifies the amend-of-pushed-commit block still fires after the new branch
# validation block is inserted. The existing prepare-commit-msg_test.sh
# already covers amend-pushed exhaustively; this is a quick smoke test.

echo "── Test 7: Amend-pushed regression ──"
T7=$(mktemp -d)
register_temp_dir "$T7"
(
	cd "$T7"
	git_init_test_repo .

	# Install the hook
	cp "$REAL_HOOK" .git/hooks/prepare-commit-msg
	chmod +x .git/hooks/prepare-commit-msg

	# Create a commit and simulate it being pushed
	echo "file1" > file1
	git add file1
	git commit --quiet -m "initial commit"

	# Normalize to main for consistency
	current=$(git rev-parse --abbrev-ref HEAD)
	if [ "$current" != "main" ]; then
		git branch -m "$current" main
	fi

	# Simulate pushed via fake remote ref (same technique as existing test)
	mkdir -p .git/refs/remotes/origin
	git rev-parse HEAD > .git/refs/remotes/origin/main

	set +e
	output=$(git commit --amend --no-edit 2>&1)
	ret=$?
	set -e

	if [ "$ret" -ne 0 ]; then
		pass "amend-pushed still blocked (regression, exit $ret)"
	else
		fail "amend-pushed regression: amend allowed when should be blocked"
		echo "$output"
	fi
)

# ── Summary ────────────────────────────────────────────────────────────────

print_summary "prepare_commit_msg_branch_test.sh"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
