#!/usr/bin/env bash
# $KYAULabs: prepare_commit_msg_branch_test.sh kyau@nova 2026/07/19 -0700 Exp $




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
VALIDATOR="$REPO_ROOT/.github/scripts/validate-branch-name.sh"

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
# validator must live at $SANDBOX/.github/scripts/validate-branch-name.sh.
install_validator() {
	mkdir -p .github/scripts
	cp "$VALIDATOR" .github/scripts/validate-branch-name.sh
	chmod +x .github/scripts/validate-branch-name.sh
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

# ── Test 2: Exempt main passes ────────────────────────────────────────────

echo "── Test 2: Exempt main passes ──"
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
	bash "$REAL_HOOK" "$MSG_FILE" >/dev/null 2>&1
	code=$?
	set -e
	rm -f "$MSG_FILE"
	if [ "$code" = "0" ]; then
		pass "main exempt (exit 0)"
	else
		fail "main should exit 0, got $code"
	fi
)

# ── Test 3: Exempt develop passes ─────────────────────────────────────────

echo "── Test 3: Exempt develop passes ──"
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
	bash "$REAL_HOOK" "$MSG_FILE" >/dev/null 2>&1
	code=$?
	set -e
	rm -f "$MSG_FILE"
	if [ "$code" = "0" ]; then
		pass "develop exempt (exit 0)"
	else
		fail "develop should exit 0, got $code"
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
