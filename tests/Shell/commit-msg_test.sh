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
