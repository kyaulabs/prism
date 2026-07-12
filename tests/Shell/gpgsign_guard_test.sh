#!/usr/bin/env bash
# $KYAULabs: gpgsign_guard_test.sh kyau@akira.kyaulabs 2026/07/11 -0700 Exp $



set -euo pipefail

# ── gpgsign guard test ───────────────────────────────────────────────────────
# Static scan of all tests/Shell/*.sh files (except this script) to verify
# that every `git init` is followed by `git config commit.gpgsign false`
# within 5 lines. Prevents hangs on machines with global commit.gpgsign=true
# (mandated by AGENTS.md for signed commits).
# ─────────────────────────────────────────────────────────────────────────────

HERE="$(cd "$(dirname "$0")" && pwd)"
SELF="$(basename "$0")"

fail=0

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
