#!/usr/bin/env bash
# $KYAULabs: commit-msg_test.sh kyau@nova 2026/07/07 -0700 Exp $

# ── Tests for commit-msg hook ───────────────────────────────────────────────
# Covers:
#   - Guard: skip with a visible notice when commitlint is not installed
#     (fresh clone without `npm install`). CI enforces commitlint on PRs.
#   - Merge/revert exemption + regression tests (added in Task 2).

set -euo pipefail

RESULT_FILE=$(mktemp)
TEMP_DIRS=""
trap 'rm -f "$RESULT_FILE"; [ -n "$TEMP_DIRS" ] && rm -rf $TEMP_DIRS' EXIT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
YELLOW=$'\033[1;33m'
RESET=$'\033[0m'

pass() { echo "  ${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "  ${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }
# shellcheck disable=SC2317,SC2329  # used in Task 2 (merge/revert exemption)
skip() { echo "  ${YELLOW}SKIP${RESET} $*"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REAL_HOOK="$REPO_ROOT/.github/hooks/commit-msg"

if [ ! -f "$REAL_HOOK" ]; then
	fail "Cannot find commit-msg at $REAL_HOOK"
	exit 1
fi

# Commitlint-dependent tests skip (with notice) when commitlint is absent,
# mirroring the hook's own guard. CI always has node_modules installed.
# shellcheck disable=SC2034  # used in Task 2 (merge/revert exemption)
COMMITLINT_AVAILABLE=$([ -d "$REPO_ROOT/node_modules/commitlint" ] && echo true || echo false)

# ── Test 1: Guard skips with notice when commitlint absent ───────────────────
# A stub `npx` is placed first on PATH so the unguarded hook (before the fix)
# fails fast without a network fetch. After the fix, the guard fires before
# npx is ever reached.

echo ""
echo "── Test 1: Guard skips when commitlint not installed ──"
T1=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T1"
(
	cd "$T1"
	# Stub npx: exits non-zero with a known message. Only reached if the
	# hook lacks a guard (the pre-fix state).
	mkdir -p "$T1/bin"
	cat > "$T1/bin/npx" <<'STUB'
#!/usr/bin/env bash
echo "stub-npx: commitlint not available" >&2
exit 1
STUB
	chmod +x "$T1/bin/npx"

	# Sample valid commit message (content irrelevant — guard fires first)
	printf 'feat: test\n\nPlan-by: x\nAcked-by: x\nSigned-off-by: x <x@x>\n' > msg

	set +e
	output=$(PATH="$T1/bin:$PATH" "$REAL_HOOK" msg 2>&1)
	ret=$?
	set -e

	if [ "$ret" -eq 0 ] && echo "$output" | grep -qi 'commitlint' && echo "$output" | grep -qi 'skipping'; then
		pass "Guard skips with notice when commitlint absent (exit 0)"
	else
		fail "Guard did not skip (exit=$ret): $output"
	fi
)
rm -rf "$T1"

# ── Test 2: Merge commit passes the hook (commitlint required) ───────────────

echo ""
echo "── Test 2: Merge commit (--no-ff) passes ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 2 (merge) — commitlint not installed"
else
T2=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T2"
(
	cd "$T2"
	git init --quiet
	git config user.email "test@example.com"
	git config user.name "Test User"
	# Expose commitlint + config to the hook (which checks ./node_modules/commitlint)
	ln -s "$REPO_ROOT/node_modules" "$T2/node_modules"
	cp "$REPO_ROOT/commitlint.config.js" "$T2/commitlint.config.js"
	cp "$REAL_HOOK" .git/hooks/commit-msg
	chmod +x .git/hooks/commit-msg

	VALID=$'feat: base commit\n\nPlan-by: x\nAcked-by: x\nSigned-off-by: x <x@x>'
	echo a > a; git add a; git commit -q -m "$VALID"
	git checkout -q -b feature
	echo b > b; git add b; git commit -q -m "$VALID"
	git checkout -q main 2>/dev/null || git checkout -q master

	set +e
	output=$(git merge --no-ff feature -m "Merge branch 'feature'" 2>&1)
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "Merge commit (--no-ff) passes the hook"
	else
		fail "Merge commit blocked (exit=$ret): $output"
	fi
)
rm -rf "$T2"
fi

# ── Test 3: Revert commit passes the hook (commitlint required) ───────────────

echo "── Test 3: Revert commit passes ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 3 (revert) — commitlint not installed"
else
T3=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T3"
(
	cd "$T3"
	git init --quiet
	git config user.email "test@example.com"
	git config user.name "Test User"
	ln -s "$REPO_ROOT/node_modules" "$T3/node_modules"
	cp "$REPO_ROOT/commitlint.config.js" "$T3/commitlint.config.js"
	cp "$REAL_HOOK" .git/hooks/commit-msg
	chmod +x .git/hooks/commit-msg

	VALID=$'feat: original\n\nPlan-by: x\nAcked-by: x\nSigned-off-by: x <x@x>'
	echo a > a; git add a; git commit -q -m "$VALID"
	TARGET=$(git rev-parse HEAD)

	set +e
	output=$(git revert --no-edit "$TARGET" 2>&1)
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "Revert commit passes the hook"
	else
		fail "Revert commit blocked (exit=$ret): $output"
	fi
)
rm -rf "$T3"
fi

# ── Test 4: Regression — missing trailers still fails (commitlint required) ──

echo "── Test 4: Missing trailers still fails ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 4 (missing-trailers regression) — commitlint not installed"
else
T4=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T4"
(
	cd "$T4"
	git init --quiet
	git config user.email "test@example.com"
	git config user.name "Test User"
	ln -s "$REPO_ROOT/node_modules" "$T4/node_modules"
	cp "$REPO_ROOT/commitlint.config.js" "$T4/commitlint.config.js"
	cp "$REAL_HOOK" .git/hooks/commit-msg
	chmod +x .git/hooks/commit-msg

	echo a > a; git add a
	set +e
	output=$(git commit -q -m "feat: no trailers here" 2>&1)
	ret=$?
	set -e

	if [ "$ret" -ne 0 ]; then
		pass "Missing trailers rejected (exit=$ret)"
	else
		fail "Missing trailers allowed — enforcement broken"
	fi
)
rm -rf "$T4"
fi

# ── Test 5: Regression — valid commit with all trailers passes ───────────────

echo "── Test 5: Valid commit with trailers passes ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 5 (valid-commit regression) — commitlint not installed"
else
T5=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T5"
(
	cd "$T5"
	git init --quiet
	git config user.email "test@example.com"
	git config user.name "Test User"
	ln -s "$REPO_ROOT/node_modules" "$T5/node_modules"
	cp "$REPO_ROOT/commitlint.config.js" "$T5/commitlint.config.js"
	cp "$REAL_HOOK" .git/hooks/commit-msg
	chmod +x .git/hooks/commit-msg

	VALID=$'feat: valid commit\n\nPlan-by: x\nAcked-by: x\nSigned-off-by: x <x@x>'
	echo a > a; git add a
	set +e
	output=$(git commit -q -m "$VALID" 2>&1)
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "Valid commit with trailers passes"
	else
		fail "Valid commit blocked (exit=$ret): $output"
	fi
)
rm -rf "$T5"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

total_pass=$(grep -c "PASS" "$RESULT_FILE" 2>/dev/null || true)
total_fail=$(grep -c "FAIL" "$RESULT_FILE" 2>/dev/null || true)
: "${total_pass:=0}"
: "${total_fail:=0}"

echo ""
echo "═══════════════════════════════════════════════════════"
if [ "$total_fail" -eq 0 ]; then
	echo "✓ commit-msg tests PASSED — $total_pass assertion(s), 0 failures"
	echo "═══════════════════════════════════════════════════════"
	exit 0
else
	echo "✗ commit-msg tests FAILED — $total_pass passed, $total_fail failure(s)"
	echo "═══════════════════════════════════════════════════════"
	exit 1
fi

# vim: ft=sh sts=4 sw=4 ts=4 et :
