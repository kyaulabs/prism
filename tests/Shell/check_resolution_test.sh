#!/usr/bin/env bash
# $KYAULabs: check_resolution_test.sh kyau@nova 2026/07/13 -0700 Exp $



# ── Tests for pre-commit hook CS-fixer resolution ──────────────────────────
# Covers:
#   - Real pre-commit hook detects CS violations in staged PHP
#   - Real pre-commit hook exits non-zero on violations
#   - Hook-driven: invokes .github/hooks/pre-commit against fixture repos
#     instead of testing stale heredoc copies of the resolution block.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

HOOK="$REPO_ROOT/.github/hooks/pre-commit"

# ── Test A: Hook detects php-cs-fixer violations in staged PHP ─────────────

echo ""
echo "── Test A: Hook detects CS violations ──"
TA=$(mktemp -d)
register_temp_dir "$TA"

if (
	cd "$TA"

	setup_linter_repo .

	# Create a deliberately non-conforming PHP file (2-space indent is
	# forbidden by PSR-12, and declare(strict_types=1) is missing).
	cat > bad.php <<'PHP'
<?php

  $x = 1;
  echo $x;
PHP

	git add bad.php

	set +e
	output=$(bash "$HOOK" 2>&1)
	ret=$?
	set -e

	fails=0

	# The hook should mention php-cs-fixer
	echo "$output" | grep -qF "→ php-cs-fixer" || {
		echo "  output missing '→ php-cs-fixer'"
		fails=1
	}

	# The hook should produce a diff (lines starting with - or +)
	echo "$output" | grep -qE '^\-|^\+' || {
		echo "  output missing diff markers"
		fails=1
	}

	# The hook should exit non-zero (violations found)
	[ "$ret" -ne 0 ] || {
		echo "  expected non-zero exit, got $ret"
		fails=1
	}

	[ "$fails" -eq 0 ]
); then
	pass "Hook detects CS violations in staged PHP"
else
	fail "Hook did not detect CS violations as expected"
fi

# ── Test B: Hook passes on conforming PHP (no CS violations) ──────────────

echo ""
echo "── Test B: Hook passes on conforming PHP ──"
TB=$(mktemp -d)
register_temp_dir "$TB"

if (
	cd "$TB"

	setup_linter_repo .

	# Create a conforming PHP file (PSR-12, strict types, proper RCS header
	# so the RCS auto-add section doesn't flag or modify it).
	cat > good.php <<'PHP'
<?php

declare(strict_types=1);


echo "hello";

PHP

	git add good.php

	set +e
	output=$(bash "$HOOK" 2>&1)
	ret=$?
	set -e

	fails=0

	# The hook should NOT produce a CS-fixer diff
	CS_OUTPUT=$(echo "$output" | sed -n '/→ php-cs-fixer/,/Found/p' || true)
	if echo "$output" | grep -q "→ php-cs-fixer"; then
		if echo "$CS_OUTPUT" | grep -qE '^\-|^\+'; then
			echo "  conforming PHP produced unexpected diff"
			fails=1
		fi
	fi

	[ "$fails" -eq 0 ]
); then
	pass "Hook passes on conforming PHP"
else
	fail "Hook flagged conforming PHP"
fi

# ── Summary ────────────────────────────────────────────────────────────────

print_summary "check_resolution_test.sh"
exit $?



# vim: ft=sh sts=4 sw=4 ts=4 et :
