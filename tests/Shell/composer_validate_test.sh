#!/usr/bin/env bash
# $KYAULabs: composer_validate_test.sh kyau@nova 2026/07/08 -0700 Exp $

set -euo pipefail

# ── composer validate gate test ──────────────────────────────────────────────
# Asserts that `composer validate --strict --no-check-publish` exits 0 on the
# real repository (catches missing license, stale lock, schema errors) and that
# a deliberately drifted lock file correctly fails validation.
# ─────────────────────────────────────────────────────────────────────────────

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"

fail=0

# Guard: composer must be available
if ! command -v composer >/dev/null 2>&1; then
	echo "FAIL: composer is not installed or not on PATH"
	exit 1
fi

# Guard: node must be available (for JSON manipulation in test 2)
if ! command -v node >/dev/null 2>&1; then
	echo "FAIL: node is not installed or not on PATH"
	exit 1
fi

# 1. Green path: the real repo must pass strict validation
echo "── Test 1: composer validate --strict --no-check-publish (real repo) ──"
if (cd "$REPO_ROOT" && composer validate --strict --no-check-publish) 2>&1; then
	echo "  OK: composer validate passed"
else
	echo "FAIL: composer validate --strict --no-check-publish failed on the real repo"
	fail=1
fi

# 2. Drift detection: a deliberately drifted lock must fail validation
echo "── Test 2: drifted lock fails validation ──"
TMPDIR_TEST=$(mktemp -d)
trap 'rm -rf "$TMPDIR_TEST"' EXIT

cp "$REPO_ROOT/composer.json" "$REPO_ROOT/composer.lock" "$TMPDIR_TEST/"

# Convert the temp dir to a Windows path for Node.js (which is a native
# Windows binary, not an MSYS2 program, and resolves /tmp differently).
TMPDIR_WIN="$(cygpath -m "$TMPDIR_TEST" 2>/dev/null)" || TMPDIR_WIN="$TMPDIR_TEST"

# Inject a fake dependency into the temp composer.json to drift the content-hash
node -e "
	const fs = require('fs');
	const p = JSON.parse(fs.readFileSync('$TMPDIR_WIN/composer.json', 'utf8'));
	p.require = p.require || {};
	p.require['fake/drift-test'] = '^1.0';
	fs.writeFileSync('$TMPDIR_WIN/composer.json', JSON.stringify(p, null, '\t') + '\n');
"

if (cd "$TMPDIR_TEST" && composer validate --strict --no-check-publish) 2>/dev/null; then
	echo "FAIL: drifted lock did NOT fail validation"
	fail=1
else
	echo "  OK: drifted lock correctly fails validation"
fi

if [ "$fail" -ne 0 ]; then
	echo ""
	echo "✗ composer validate test FAILED"
	exit 1
fi

echo ""
echo "✓ composer validate test PASSED"
# vim: ft=sh sts=4 sw=4 ts=4 et :
