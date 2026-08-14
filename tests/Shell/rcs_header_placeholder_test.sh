#!/usr/bin/env bash
# $KYAULabs: rcs_header_placeholder_test.sh git@aura.kyaulabs 2026/08/14 -0700 Exp $







# ── Repro-first tests for pre-commit RCS placeholder rejection ──────────────
# Verifies that the pre-commit hook blocks source files with placeholder
# or foreign RCS headers (creator@host, YYYY/MM/DD, SEANBR~1).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

PRE_COMMIT="$REPO_ROOT/.github/hooks/pre-commit"

if [ ! -f "$PRE_COMMIT" ]; then
	fail "Cannot find pre-commit hook at $PRE_COMMIT"
	exit 1
fi

# Route declared tools through the fake prism-tool boundary (Task 8).
export PRISM_TOOL="$REPO_ROOT/tests/Shell/fixtures/fake-prism-tool.sh"
export PATH="$REPO_ROOT/tests/Shell/fixtures/bin:$PATH"

# ── Test 1: Placeholder header (creator@host YYYY/MM/DD) rejected ────────────

echo ""
echo "── Test 1: Placeholder (creator@host YYYY/MM/DD) header rejected ──"
T1=$(mktemp -d)
register_temp_dir "$T1"
git_init_test_repo "$T1"
(
	cd "$T1"
	cp "$PRE_COMMIT" .git/hooks/pre-commit
	chmod +x .git/hooks/pre-commit

	# Build file with placeholder RCS header (split to keep $KYAULabs
	# inside a shell string — the pre-commit hook's auto-add strips
	# shellcheck disable=SC2016  # literal $KYAULabs RCS placeholder, not shell expansion
	RCS_LINE='# $KYAULabs: file.php creator@host YYYY/MM/DD ±TZ Exp $'
	{
		echo '<?php'
		echo ''
		echo "$RCS_LINE"
		echo ''
		echo 'declare(strict_types=1);'
		echo ''
		echo 'echo "hi";'
	} > file.php
	git add file.php
	if git commit --quiet -m "test: placeholder header" 2>&1; then
		fail "commit with placeholder header was NOT rejected"
	else
		pass "placeholder header blocked"
	fi
)
# ── Test 2: SEANBR~1 foreign header rejected ─────────────────────────────────

echo ""
echo "── Test 2: SEANBR~1 foreign header rejected ──"
T2=$(mktemp -d)
register_temp_dir "$T2"
git_init_test_repo "$T2"
(
	cd "$T2"
	cp "$PRE_COMMIT" .git/hooks/pre-commit
	chmod +x .git/hooks/pre-commit

	# shellcheck disable=SC2016  # literal $KYAULabs RCS placeholder, not shell expansion
	RCS_LINE='# $KYAULabs: file.php SEANBR~1@KYAU-DEV 2025/07/05 -0500 Exp $'
	{
		echo '<?php'
		echo ''
		echo "$RCS_LINE"
		echo ''
		echo 'declare(strict_types=1);'
		echo ''
		echo 'echo "hi";'
	} > file.php
	git add file.php
	if git commit --quiet -m "test: foreign header" 2>&1; then
		fail "commit with SEANBR~1 header was NOT rejected"
	else
		pass "SEANBR~1 header blocked"
	fi
)
# ── Test 3: Valid header (kyau@nova) passes ─────────────────────────────────

echo ""
echo "── Test 3: Valid header passes ──"
T3=$(mktemp -d)
register_temp_dir "$T3"
git_init_test_repo "$T3"
(
	cd "$T3"
	cp "$PRE_COMMIT" .git/hooks/pre-commit
	chmod +x .git/hooks/pre-commit

	# shellcheck disable=SC2016  # literal $KYAULabs RCS placeholder, not shell expansion
	RCS_LINE='# $KYAULabs: file.php kyau@nova 2026/07/07 -0700 Exp $'
	{
		echo '<?php'
		echo ''
		echo "$RCS_LINE"
		echo ''
		echo 'declare(strict_types=1);'
		echo ''
		echo 'echo "hi";'
	} > file.php
	git add file.php
	if git commit --quiet -m "test: valid header passes" 2>&1; then
		pass "valid header accepted"
	else
		fail "valid header blocked incorrectly"
	fi
)

# ── Summary ────────────────────────────────────────────────────────────

print_summary "rcs-header placeholder"
exit $?









# vim: ft=sh sts=4 sw=4 ts=4 et :
