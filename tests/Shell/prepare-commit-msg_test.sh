#!/usr/bin/env bash
# $KYAULabs: prepare-commit-msg_test.sh kyau@aura.kyaulabs 2026/08/14 -0700 Exp $





# ── Tests for prepare-commit-msg hook (amend-of-pushed-commit guard) ───────────
# Bugs prevented:
#   - Amending a pushed commit rewrites published history, requiring a force-push
#   - Using --amend to "retry" a failed commit (when the commit wasn't created)
#     silently amends the previous (possibly pushed) commit instead
#
# The hook blocks git commit --amend (detected via prepare-commit-msg receiving
# $2="commit" $3="HEAD") when HEAD is reachable from any remote tracking branch.
#
# Note: --amend -m "msg" sets $2="message" (not "commit"), making it
# undetectable in this hook. The pre-push non-fast-forward block is the
# safety net. Tests here use --amend --no-edit to trigger the detectable path.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file
REAL_HOOK="$REPO_ROOT/.github/hooks/prepare-commit-msg"

if [ ! -f "$REAL_HOOK" ]; then
	fail "Cannot find prepare-commit-msg at $REAL_HOOK"
	exit 1
fi

# ---------------------------------------------------------------------------
# Helper: simulate a published commit by writing HEAD's SHA as a remote ref
# into .git/refs/remotes/<remote>/<branch>.  No bare repo or git push needed.
# ---------------------------------------------------------------------------
simulate_pushed() {
	local remote="$1" branch="$2"
	mkdir -p ".git/refs/remotes/$remote"
	git rev-parse HEAD > ".git/refs/remotes/$remote/$branch"
}

# ── Test 1: Amend of a pushed commit is blocked (--no-edit path) ──────────────

echo ""
echo "── Test 1: Amend of pushed commit blocked (--no-edit) ──"
T1=$(mktemp -d)
register_temp_dir "$T1"
(
	cd "$T1"
	git_init_test_repo .
	git checkout -q -b fix/test-1a2b-cases

	# Install the hook
	cp "$REAL_HOOK" .git/hooks/prepare-commit-msg
	chmod +x .git/hooks/prepare-commit-msg

	# Create a commit and simulate it being pushed
	echo "file1" > file1
	git add file1
	git commit --quiet -m "initial commit"
	simulate_pushed origin main
	# HEAD is reachable from origin/main — amend should be blocked

	set +e
	output=$(git commit --amend --no-edit 2>&1)
	ret=$?
	set -e

	if [ "$ret" -ne 0 ]; then
		pass "Amend of pushed commit blocked (exit $ret)"
	else
		fail "Amend of pushed commit allowed — history rewrite not prevented"
	fi
)

# ── Test 2: Amend of an unpushed commit is allowed (--no-edit path) ───────────

echo "── Test 2: Amend of unpushed commit allowed (--no-edit) ──"
T2=$(mktemp -d)
register_temp_dir "$T2"
(
	cd "$T2"
	git_init_test_repo .
	git checkout -q -b fix/test-1a2b-cases

	cp "$REAL_HOOK" .git/hooks/prepare-commit-msg
	chmod +x .git/hooks/prepare-commit-msg

	# Create a pushed base commit
	echo "base" > base.txt
	git add base.txt
	git commit --quiet -m "base commit"
	simulate_pushed origin main

	# Create an unpushed commit on top with a file
	echo "unpushed" > unpushed.txt
	git add unpushed.txt
	git commit --quiet -m "unpushed commit"

	# Add another file to amend into the unpushed commit
	echo "extra" > extra.txt
	git add extra.txt
	# HEAD is ahead of origin/main — amend should be allowed

	set +e
	output=$(git commit --amend --no-edit 2>&1)
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		# Verify extra.txt is in the amended commit
		if git show --name-only --format= HEAD | grep -q "extra.txt"; then
			pass "Amend of unpushed commit allowed and applied (tree updated)"
		else
			fail "Amend did not include extra.txt in the amended commit"
		fi
	else
		fail "Amend of unpushed commit blocked (should be allowed, exit $ret)"
		echo "$output"
	fi
)

# ── Test 3: Regular commit (not amend) is allowed on pushed branch ────────────

echo "── Test 3: Regular commit allowed on pushed branch ──"
T3=$(mktemp -d)
register_temp_dir "$T3"
(
	cd "$T3"
	git_init_test_repo .
	git checkout -q -b fix/test-1a2b-cases

	cp "$REAL_HOOK" .git/hooks/prepare-commit-msg
	chmod +x .git/hooks/prepare-commit-msg

	# Create a pushed commit
	echo "file1" > file1
	git add file1
	git commit --quiet -m "initial commit"
	simulate_pushed origin main

	# Create a new file and commit regularly (not --amend)
	echo "file2" > file2
	git add file2

	set +e
	output=$(git commit -m "regular commit on pushed branch" 2>&1)
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "Regular commit allowed on pushed branch"
	else
		fail "Regular commit blocked on pushed branch (should be allowed)"
		echo "$output"
	fi
)

# ── Test 4: Amend blocked when HEAD on any remote branch (not just tracking) ──

echo "── Test 4: Amend blocked when HEAD on any remote branch ──"
T4=$(mktemp -d)
register_temp_dir "$T4"
(
	cd "$T4"
	git_init_test_repo .
	git checkout -q -b fix/test-1a2b-cases

	cp "$REAL_HOOK" .git/hooks/prepare-commit-msg
	chmod +x .git/hooks/prepare-commit-msg

	# Create a commit, then simulate push to a differently-named branch
	echo "file1" > file1
	git add file1
	git commit --quiet -m "initial commit"
	simulate_pushed origin some-other-branch
	# origin/some-other-branch contains HEAD — amend should be blocked

	set +e
	output=$(git commit --amend --no-edit 2>&1)
	ret=$?
	set -e

	if [ "$ret" -ne 0 ]; then
		pass "Amend blocked when HEAD reachable from non-tracked remote branch"
	else
		fail "Amend allowed despite HEAD being on a remote branch"
	fi
)

# ── Test 5: -C with explicit SHA (not HEAD) is allowed on pushed commits ──────
# Note: -C HEAD and --amend are indistinguishable in prepare-commit-msg
# (both pass $3="HEAD"). The hook errs on the side of safety and blocks both
# when HEAD is pushed. Use -C <sha> instead of -C HEAD on pushed branches.

echo "── Test 5: -C with explicit SHA allowed on pushed branch ──"
T5=$(mktemp -d)
register_temp_dir "$T5"
(
	cd "$T5"
	git_init_test_repo .
	git checkout -q -b fix/test-1a2b-cases

	cp "$REAL_HOOK" .git/hooks/prepare-commit-msg
	chmod +x .git/hooks/prepare-commit-msg

	# Create a pushed commit
	echo "file1" > file1
	git add file1
	git commit --quiet -m "reusable message"
	SHA1=$(git rev-parse HEAD)
	simulate_pushed origin main

	# -C with explicit SHA (not "HEAD") should be allowed
	echo "file2" > file2
	git add file2

	set +e
	output=$(git commit --quiet -C "$SHA1" 2>&1)
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "-C (explicit SHA) allowed on pushed branch"
	else
		fail "-C with explicit SHA blocked on pushed branch (should be allowed)"
		echo "$output"
	fi
)

# ── Summary ────────────────────────────────────────────────────────────

print_summary "prepare-commit-msg_test.sh"
exit $?





# vim: ft=sh sts=4 sw=4 ts=4 et :
