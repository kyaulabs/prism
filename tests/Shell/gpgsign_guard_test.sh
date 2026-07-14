#!/usr/bin/env bash
# $KYAULabs: gpgsign_guard_test.sh kyau@nova 2026/07/13 -0700 Exp $




set -euo pipefail

# ── gpgsign guard test ───────────────────────────────────────────────────────
# Static scan of all tests/Shell/*.sh files (except this script) to verify
# that every `git init` is followed by `git config commit.gpgsign false`
# within 5 lines. Prevents hangs on machines with global commit.gpgsign=true
# (mandated by AGENTS.md for signed commits).
# ─────────────────────────────────────────────────────────────────────────────

HERE="$(cd "$(dirname "$0")" && pwd)"
SELF="$(basename "$0")"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
LIB="$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

fail=0

# ── Verify test_helpers.sh ─────────────────────────────────────────────────
# The shared lib provides git_init_test_repo which MUST set commit.gpgsign false.
# Scan the lib first — if the helper is broken, every consumer is broken.
if [ -f "$LIB" ]; then
	INIT_LINE=$(grep -nE '^git_init_test_repo\(\)' "$LIB" | head -1 | cut -d: -f1 || true)
	if [ -z "$INIT_LINE" ]; then
		echo "FAIL: test_helpers.sh missing git_init_test_repo function"
		fail=1
	else
		# Scan from the function definition to end of file for the gpgsign guard
		BODY=$(tail -n +"$INIT_LINE" "$LIB")
		if ! echo "$BODY" | grep -qE 'git config commit\.gpgsign false'; then
			echo "FAIL: test_helpers.sh git_init_test_repo missing 'commit.gpgsign false'"
			fail=1
		fi
	fi
else
	echo "SKIPPED: test_helpers.sh not found at $LIB"
fi

# ── Scan per-file (belt-and-suspenders) ────────────────────────────────────
# Checks that any bare `git init` in a *_test.sh file is followed by
# commit.gpgsign false within 5 lines. Migrated files that use
# git_init_test_repo have no bare `git init` and pass naturally.

for testfile in "$HERE"/*.sh; do
	[ "$(basename "$testfile")" = "$SELF" ] && continue

	# Get line numbers of every `git init` command
	init_lines=$(grep -nE '^\s*git init' "$testfile" | cut -d: -f1 || true)

	for lineno in $init_lines; do
		end=$((lineno + 5))
		if ! sed -n "${lineno},${end}p" "$testfile" | grep -qE 'git config commit\.gpgsign false'; then
			echo "FAIL: $(basename "$testfile"):$lineno — 'git init' without 'commit.gpgsign false' in next 5 lines"
			fail=1
		fi
	done
done

if [ "$fail" -ne 0 ]; then
	echo ""
	echo "✗ gpgsign guard test FAILED"
	exit 1
fi

echo "✓ gpgsign guard test PASSED"



# vim: ft=sh sts=4 sw=4 ts=4 et :
