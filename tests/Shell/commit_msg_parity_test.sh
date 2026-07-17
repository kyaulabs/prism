#!/usr/bin/env bash
# $KYAULabs: commit_msg_parity_test.sh kyau@nova 2026/07/16 -0700 Exp $


# commit_msg_parity_test.sh — verifies the commit-msg hook is fail-closed and
# has the literal-\n guard (ADR-0025).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file
HOOK="$REPO_ROOT/.github/hooks/commit-msg"

# 1. literal-\n guard present
if grep -q "Literal backslash-n guard" "$HOOK"; then
	pass "commit-msg has literal-\\n guard"
else
	fail "commit-msg missing literal-\\n guard"
fi

# 2. fail-open guard removed (was "skipping commit-msg check ... safe")
if grep -q "skipping commit-msg check" "$HOOK"; then
	fail "commit-msg still has fail-open skip guard"
else
	pass "commit-msg fail-open guard removed (fail-closed)"
fi

# 3. fail-closed message present (blocks when commitlint absent)
if grep -q "commitlint is not installed" "$HOOK"; then
	pass "commit-msg fail-closed on missing commitlint"
else
	fail "commit-msg missing fail-closed commitlint guard"
fi

print_summary "commit_msg_parity"

# vim: ft=sh sts=4 sw=4 ts=4 et :
