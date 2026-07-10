#!/usr/bin/env bash
# $KYAULabs: codeowners_syntax_test.sh kyau@akira.kyaulabs 2026/07/09 -0700 Exp $


set -euo pipefail

# ── CODEOWNERS syntax test ───────────────────────────────────────────────────
# Validates that every owner entry in .github/CODEOWNERS is a GitHub-recognized
# form: @username, @org/team, or a verified email. A bare username (e.g. "kyau"
# without "@") is silently ignored by GitHub, breaking review routing — this
# test prevents that regression.
# ─────────────────────────────────────────────────────────────────────────────

HERE="$(cd "$(dirname "$0")" && pwd)"
CODEOWNERS="$HERE/../../.github/CODEOWNERS"

fail=0

if [ ! -f "$CODEOWNERS" ]; then
	echo "FAIL: .github/CODEOWNERS not found at $CODEOWNERS"
	exit 1
fi

# Valid owner forms:
#   @username        ^@[A-Za-z0-9][A-Za-z0-9_-]*$
#   @org/team         ^@[A-Za-z0-9][A-Za-z0-9_-]*/[A-Za-z0-9_-]+$
#   email             ^[^@[:space:]]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$
valid_owner='^(@[A-Za-z0-9][A-Za-z0-9_-]*(/[A-Za-z0-9_-]+)?|[^@[:space:]]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})$'

line_no=0
while IFS= read -r line || [ -n "$line" ]; do
	line_no=$((line_no + 1))
	# Strip leading whitespace; skip blank lines and comments
	trimmed="${line#"${line%%[![:space:]]*}"}"
	case "$trimmed" in
		''|'#'*) continue ;;
	esac
	# Disable glob expansion — the CODEOWNERS glob pattern '*' is not a shell glob
	set -f
	# shellcheck disable=SC2086
	set -- $trimmed
	set +f
	[ "$#" -eq 1 ] && { echo "FAIL: line $line_no: pattern '$1' has no owner"; fail=1; continue; }
	pattern="$1"; shift 1
	for owner in "$@"; do
		if printf '%s' "$owner" | grep -Eq "$valid_owner"; then
			:
		else
			echo "FAIL: line $line_no, pattern '$pattern': invalid owner '$owner' (must be @username, @org/team, or email)"
			fail=1
		fi
	done
done < "$CODEOWNERS"

if [ "$fail" -ne 0 ]; then
	echo ""
	echo "✗ CODEOWNERS syntax test FAILED"
	exit 1
fi
echo "✓ CODEOWNERS syntax test PASSED"

# vim: ft=sh sts=4 sw=4 ts=4 et :
