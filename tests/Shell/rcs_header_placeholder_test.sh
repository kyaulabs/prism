#!/usr/bin/env bash
# $KYAULabs: rcs_header_placeholder_test.sh kyau@nova 2026/07/07 -0700 Exp $

# ── Repro-first tests for pre-commit RCS placeholder rejection ──────────────
# Verifies that the pre-commit hook blocks source files with placeholder
# or foreign RCS headers (creator@host, YYYY/MM/DD, SEANBR~1).

set -euo pipefail

RESULT_FILE=$(mktemp)
trap 'rm -f "$RESULT_FILE"' EXIT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
RESET=$'\033[0m'

pass() { echo "${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }

# ── Resolve paths BEFORE any cd ────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRE_COMMIT="$REPO_ROOT/.github/hooks/pre-commit"

if [ ! -f "$PRE_COMMIT" ]; then
	fail "Cannot find pre-commit hook at $PRE_COMMIT"
	exit 1
fi

# ── Test 1: Placeholder header (creator@host YYYY/MM/DD) rejected ────────────

echo ""
echo "── Test 1: Placeholder (creator@host YYYY/MM/DD) header rejected ──"
T1=$(mktemp -d)
(
	cd "$T1"
	git init --quiet
	git config commit.gpgsign false
	git config user.email "kyau@nova.local"
	git config user.name "kyau"
	cp "$PRE_COMMIT" .git/hooks/pre-commit
	chmod +x .git/hooks/pre-commit

	cat > "file.php" <<'EOF'
<?php

# $KYAULabs: file.php creator@host YYYY/MM/DD ±TZ Exp $

declare(strict_types=1);

echo "hi";
// vim: ft=php sts=4 sw=4 ts=4 et :
EOF
	git add file.php
	if git commit --quiet -m "test: placeholder header" 2>&1; then
		fail "commit with placeholder header was NOT rejected"
	else
		pass "placeholder header blocked"
	fi
)
rm -rf "$T1"

# ── Test 2: SEANBR~1 foreign header rejected ─────────────────────────────────

echo ""
echo "── Test 2: SEANBR~1 foreign header rejected ──"
T2=$(mktemp -d)
(
	cd "$T2"
	git init --quiet
	git config commit.gpgsign false
	git config user.email "kyau@nova.local"
	git config user.name "kyau"
	cp "$PRE_COMMIT" .git/hooks/pre-commit
	chmod +x .git/hooks/pre-commit

	cat > "file.php" <<'EOF'
<?php

# $KYAULabs: file.php SEANBR~1@KYAU-DEV 2025/07/05 -0500 Exp $

declare(strict_types=1);

echo "hi";
// vim: ft=php sts=4 sw=4 ts=4 et :
EOF
	git add file.php
	if git commit --quiet -m "test: foreign header" 2>&1; then
		fail "commit with SEANBR~1 header was NOT rejected"
	else
		pass "SEANBR~1 header blocked"
	fi
)
rm -rf "$T2"

# ── Test 3: Valid header (kyau@nova) passes ─────────────────────────────────

echo ""
echo "── Test 3: Valid header passes ──"
T3=$(mktemp -d)
(
	cd "$T3"
	git init --quiet
	git config commit.gpgsign false
	git config user.email "kyau@nova.local"
	git config user.name "kyau"
	cp "$PRE_COMMIT" .git/hooks/pre-commit
	chmod +x .git/hooks/pre-commit

	cat > "file.php" <<'EOF'
<?php

# $KYAULabs: file.php kyau@nova 2026/07/07 -0700 Exp $

declare(strict_types=1);

echo "hi";
// vim: ft=php sts=4 sw=4 ts=4 et :
EOF
	git add file.php
	if git commit --quiet -m "test: valid header passes" 2>&1; then
		pass "valid header accepted"
	else
		fail "valid header blocked incorrectly"
	fi
)
rm -rf "$T3"

# ── Summary ───────────────────────────────────────────────────────────────────

total_pass=$(grep -c "PASS" "$RESULT_FILE" 2>/dev/null || true)
total_fail=$(grep -c "FAIL" "$RESULT_FILE" 2>/dev/null || true)
: "${total_pass:=0}"
: "${total_fail:=0}"

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$total_fail" -eq 0 ]; then
	echo "✓ rcs-header placeholder tests PASSED — $total_pass assertion(s), 0 failures"
	echo "═══════════════════════════════════════════════════════════"
	exit 0
else
	echo "✗ rcs-header placeholder tests FAILED — $total_pass passed, $total_fail failure(s)"
	echo "═══════════════════════════════════════════════════════════"
	exit 1
fi

# vim: ft=sh sts=4 sw=4 ts=4 et :
