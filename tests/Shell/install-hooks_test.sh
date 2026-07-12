#!/usr/bin/env bash
# $KYAULabs: install-hooks_test.sh kyau@akira.kyaulabs 2026/07/11 -0700 Exp $



# ── Repro-first tests for install-hooks.sh ─────────────────────────────────────
# Bugs under test (from Fable 5 audit):
#   1. Symlink hooks break in worktrees (git worktree add);
#      core.hooksPath is silently bypassed by user configs.
#   2. Three hooks are committed as 100644; chmod +x dirties the working tree
#      and is reverted by git checkout/stash.
#   3. No nullglob: empty .github/hooks leaves junk * symlink + crashes.
#   4. Backup logic loses existing symlink hooks with no backup.
#
# Fix: Replace the entire symlink-per-hook mechanism with
#   git config core.hooksPath .github/hooks  (one line, no symlinks, no chmod).
# All four bugs become moot.

set -euo pipefail

RESULT_FILE=$(mktemp)
TEMP_DIRS=""
trap 'rm -f "$RESULT_FILE"; [ -n "$TEMP_DIRS" ] && rm -rf $TEMP_DIRS' EXIT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
RESET=$'\033[0m'

pass() { echo "${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }

# ── Resolve paths BEFORE any cd ────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REAL_SCRIPT="$REPO_ROOT/.github/scripts/install-hooks.sh"

if [ ! -f "$REAL_SCRIPT" ]; then
	fail "Cannot find install-hooks.sh at $REAL_SCRIPT"
	exit 1
fi

# ── Test 1: core.hooksPath is set, no symlinks, no dirtying ───────────────────

echo ""
echo "── Test 1: core.hooksPath (no symlinks, no chmod) ──"
T1=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T1"
(
	cd "$T1"
	git init --quiet
	git config commit.gpgsign false
	git config user.email "test@example.com"
	git config user.name "Test User"
	mkdir -p .github/hooks .github/scripts
	cat > .github/hooks/pre-commit <<'HOOKEOF'
#!/usr/bin/env bash
echo "pre-commit ran"
HOOKEOF
	chmod +x .github/hooks/pre-commit
	git add .github/hooks/pre-commit
	git commit --quiet -m "init"
	cp "$REAL_SCRIPT" .github/scripts/install-hooks.sh
	bash .github/scripts/install-hooks.sh > /dev/null 2>&1

	# Assert: core.hooksPath is set
	hooks_path=$(git config core.hooksPath 2>/dev/null || echo "")
	if [ "$hooks_path" = ".github/hooks" ]; then
		pass "core.hooksPath = '.github/hooks'"
	else
		fail "core.hooksPath = '$hooks_path' (expected '.github/hooks')"
	fi

	# Assert: no symlinks in .git/hooks
	symlink_count=$(find .git/hooks -type l 2>/dev/null | wc -l)
	if [ "$symlink_count" -eq 0 ]; then
		pass "0 symlinks found in .git/hooks"
	else
		fail "$symlink_count symlink(s) found in .git/hooks (expected 0)"
	fi

	# Assert: no tracked files modified (ignore untracked files from test setup)
	modified=$(git diff --name-only 2>/dev/null | wc -l)
	if [ "$modified" -eq 0 ]; then
		pass "Working tree is clean (no chmod dirtying)"
	else
		fail "Working tree has $modified modified file(s) (chmod dirtying bug)"
		git diff --name-only
	fi
)
rm -rf "$T1"

# ── Test 2: All hooks committed as 100755 ─────────────────────────────────────

echo "── Test 2: Hooks committed as 100755 ──"
for hook in commit-msg post-checkout post-merge pre-commit pre-push prepare-commit-msg; do
	mode=$(git -C "$REPO_ROOT" ls-files -s ".github/hooks/$hook" 2>/dev/null | awk '{print $1}')
	if [ "$mode" = "100755" ]; then
		pass "$hook is 100755"
	else
		fail "$hook is $mode (expected 100755)"
	fi
done

# ── Test 3: Error on missing hooks directory ──────────────────────────────────

echo "── Test 3: Error on missing hooks directory ──"
T3=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T3"
(
	cd "$T3"
	git init --quiet
	git config commit.gpgsign false
	mkdir -p .github/scripts
	cp "$REAL_SCRIPT" .github/scripts/install-hooks.sh
	set +e
	bash .github/scripts/install-hooks.sh >/dev/null 2>&1
	ret=$?
	set -e
	if [ "$ret" -ne 0 ]; then
		pass "Correctly errors when .github/hooks is missing (exit $ret)"
	else
		fail "Should error when .github/hooks is missing (exit 0)"
	fi
)
rm -rf "$T3"

# ── Test 4: Handles empty hooks directory (nullglob bug) ──────────────────────

echo "── Test 4: Empty hooks directory (nullglob) ──"
T4=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T4"
(
	cd "$T4"
	git init --quiet
	git config commit.gpgsign false
	mkdir -p .github/hooks .github/scripts
	cp "$REAL_SCRIPT" .github/scripts/install-hooks.sh
	if bash .github/scripts/install-hooks.sh > /dev/null 2>&1; then
		pass "Handles empty .github/hooks without crash"
	else
		fail "Crashed on empty .github/hooks (nullglob bug)"
	fi
	if [ -f ".git/hooks/*" ]; then
		fail "Junk '*' file found in .git/hooks (nullglob bug)"
	else
		pass "No junk '*' file in .git/hooks"
	fi
)
rm -rf "$T4"

# ── Summary ───────────────────────────────────────────────────────────────────

total_pass=$(grep -c "PASS" "$RESULT_FILE" 2>/dev/null || true)
total_fail=$(grep -c "FAIL" "$RESULT_FILE" 2>/dev/null || true)

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$total_fail" -eq 0 ]; then
	echo "✓ install-hooks tests PASSED — $total_pass assertion(s), 0 failures"
	echo "═══════════════════════════════════════════════════════════"
	exit 0
else
	echo "✗ install-hooks tests FAILED — $total_pass passed, $total_fail failure(s)"
	echo "═══════════════════════════════════════════════════════════"
	exit 1
fi



# vim: ft=sh sts=4 sw=4 ts=4 et :
