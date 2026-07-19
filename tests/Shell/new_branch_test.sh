#!/usr/bin/env bash
# $KYAULabs: new_branch_test.sh kyau@nova 2026/07/19 -0700 Exp $



set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/.github/scripts/new-branch.sh"

source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

# ── Helper: set up a disposable git repo with main + develop branches ────
# Creates develop from main so both exist for base-branch tests.
# Arguments: directory path to initialize.

setup_repo_with_bases() {
	local dir="$1"
	git_init_test_repo "$dir"
	(
		cd "$dir" || exit 1
		# First commit creates the branch
		git commit --allow-empty -m "initial"
		# Normalize to 'main'
		local current
		current=$(git rev-parse --abbrev-ref HEAD)
		if [ "$current" != "main" ]; then
			git branch -m "$current" main
		fi
		# Create develop from main
		git branch develop main
	)
}

# ── Test 1: feature branch created off develop ──────────────────────────

echo ""
echo "── Test 1: feature branch created off develop ──"
T1=$(mktemp -d)
register_temp_dir "$T1"
(
	cd "$T1"
	setup_repo_with_bases .
	BRANCH=$(bash "$SCRIPT" feat "add new feature")
	if echo "$BRANCH" | grep -qE '^feat/[a-z0-9._-]+-[a-f0-9]{4}-add-new-feature$'; then
		if git merge-base --is-ancestor develop HEAD; then
			pass "feature branch ($BRANCH) matches pattern and is off develop"
		else
			fail "$BRANCH not based on develop"
		fi
	else
		fail "branch '$BRANCH' does not match feat/<user>-<hash>-add-new-feature"
	fi
)

# ── Test 2: hotfix branch created off main ──────────────────────────────

echo "── Test 2: hotfix branch created off main ──"
T2=$(mktemp -d)
register_temp_dir "$T2"
(
	cd "$T2"
	setup_repo_with_bases .
	BRANCH=$(bash "$SCRIPT" hotfix "critical bug")
	if echo "$BRANCH" | grep -qE '^hotfix/[a-z0-9._-]+-[a-f0-9]{4}-critical-bug$'; then
		if git merge-base --is-ancestor main HEAD; then
			pass "hotfix branch ($BRANCH) matches pattern and is off main"
		else
			fail "$BRANCH not based on main"
		fi
	else
		fail "branch '$BRANCH' does not match hotfix/<user>-<hash>-critical-bug"
	fi
)

# ── Test 3: release branch created off develop ──────────────────────────

echo "── Test 3: release branch created off develop ──"
T3=$(mktemp -d)
register_temp_dir "$T3"
(
	cd "$T3"
	setup_repo_with_bases .
	BRANCH=$(bash "$SCRIPT" release 1.2.0)
	if [ "$BRANCH" = "release/1.2.0" ]; then
		if git merge-base --is-ancestor develop HEAD; then
			pass "release branch ($BRANCH) equals 'release/1.2.0' and is off develop"
		else
			fail "$BRANCH not based on develop"
		fi
	else
		fail "expected 'release/1.2.0', got '$BRANCH'"
	fi
)

# ── Test 4: invalid type exits non-zero ─────────────────────────────────

echo "── Test 4: invalid type exits non-zero ──"
T4=$(mktemp -d)
register_temp_dir "$T4"
(
	cd "$T4"
	git_init_test_repo .
	set +e
	bash "$SCRIPT" invalidtype foo >/dev/null 2>&1
	EXIT_CODE=$?
	set -e
	if [ "$EXIT_CODE" -ne 0 ]; then
		pass "invalid type 'invalidtype' exits non-zero ($EXIT_CODE)"
	else
		fail "invalid type should exit non-zero, got $EXIT_CODE"
	fi
)

# ── Test 5: missing user name exits non-zero ────────────────────────────

echo "── Test 5: missing user name exits non-zero ──"
T5=$(mktemp -d)
register_temp_dir "$T5"
(
	cd "$T5"
	FAKE_HOME="$T5/home"
	mkdir -p "$FAKE_HOME/.config/opencode"
	git_init_test_repo .
	git commit --allow-empty -m "initial" 2>/dev/null || true
	git branch develop main 2>/dev/null || {
		git branch -m master main 2>/dev/null || true
		git branch develop main
	}
	git config --unset user.name
	git config --unset user.email
	set +e
	HOME="$FAKE_HOME" GIT_CONFIG_NOSYSTEM=1 bash "$SCRIPT" feat foo >/dev/null 2>&1
	EXIT_CODE=$?
	set -e
	if [ "$EXIT_CODE" -ne 0 ]; then
		pass "missing identity exits non-zero ($EXIT_CODE)"
	else
		fail "expected non-zero exit, got $EXIT_CODE"
	fi
)

# ── Test 6: dirty working tree rejected ─────────────────────────────────

echo "── Test 6: dirty working tree rejected ──"
T6=$(mktemp -d)
register_temp_dir "$T6"
(
	cd "$T6"
	git_init_test_repo .
	git commit --allow-empty -m "initial" 2>/dev/null || true
	git checkout -b main 2>/dev/null || true
	git commit --allow-empty -m "initial" 2>/dev/null || true
	# Stage a change to make the tree dirty
	touch dirty.txt
	git add dirty.txt
	set +e
	bash "$SCRIPT" feat "add thing" >/dev/null 2>&1
	EXIT_CODE=$?
	set -e
	if [ "$EXIT_CODE" -ne 0 ]; then
		pass "dirty tree rejected (exit $EXIT_CODE)"
	else
		fail "dirty tree should be rejected, got exit 0"
	fi
)

# ── Test 7: hash is exactly 4 lowercase hex characters ──────────────────

echo "── Test 7: hash is exactly 4 lowercase hex characters ──"
T7=$(mktemp -d)
register_temp_dir "$T7"
(
	cd "$T7"
	setup_repo_with_bases .
	BRANCH=$(bash "$SCRIPT" feat "some desc")
	# The hash is the 4-char hex segment after the username (second-to-last hyphen group)
	# Pattern: type/username-hash-description
	# Extract: strip prefix up to and including first '/', then extract 4-char hex
	AFTER_SLASH="${BRANCH#*/}"
	HASH=$(echo "$AFTER_SLASH" | grep -oE '[a-f0-9]{4}' | head -1)
	if [ -n "$HASH" ] && [ "${#HASH}" -eq 4 ] && echo "$HASH" | grep -qE '^[a-f0-9]{4}$'; then
		pass "hash '$HASH' is exactly 4 lowercase hex chars"
	else
		fail "hash '$HASH' is not 4 lowercase hex chars (branch: $BRANCH)"
	fi
)

# ── Test 8: username sanitization ───────────────────────────────────────

echo "── Test 8: username sanitization ──"
T8=$(mktemp -d)
register_temp_dir "$T8"
(
	cd "$T8"
	setup_repo_with_bases .
	git config user.name "Jane Q. Public"
	git config user.email "jane@example.com"
	BRANCH=$(bash "$SCRIPT" feat "add thing")
	# Extract the part between type/ and the hash
	# Pattern: feat/[username]-[hash]-add-thing
	if echo "$BRANCH" | grep -qE '^feat/jane[-.q]+-public-.+-add-thing$'; then
		pass "username sanitized to lowercase with dots/hyphens ($BRANCH)"
	else
		fail "branch '$BRANCH' does not start with sanitized username from 'Jane Q. Public'"
	fi
)

# ── Test 9: v prefix stripped for release ───────────────────────────────

echo "── Test 9: v prefix stripped for release ──"
T9=$(mktemp -d)
register_temp_dir "$T9"
(
	cd "$T9"
	setup_repo_with_bases .
	BRANCH=$(bash "$SCRIPT" release v2.0.0)
	if [ "$BRANCH" = "release/2.0.0" ]; then
		pass "v prefix stripped: $BRANCH"
	else
		fail "expected 'release/2.0.0', got '$BRANCH'"
	fi
)

# ── Summary ──────────────────────────────────────────────────────────────

print_summary "new_branch_test.sh"
exit $?



# vim: ft=sh sts=4 sw=4 ts=4 et :
