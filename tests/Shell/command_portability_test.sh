#!/usr/bin/env bash
# $KYAULabs: command_portability_test.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# $KYAULabs$


set -euo pipefail

# ── command portability test ──────────────────────────────────────────────────
# Static scan of packages/*/prompts/*.md and tests/Shell/*_test.sh for shell
# constructs that are incompatible with BSD grep (macOS). Catches GNU-only
# `grep -P` (PCRE) which BSD grep rejects, breaking documented commands and
# tests on macOS dev machines and macOS CI.
# Mirrors hook_portability_test.sh's approach for command docs.
# ─────────────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

COMMANDS_DIR="$REPO_ROOT/packages/prism-core/prompts"
SHELL_TESTS_DIR="$REPO_ROOT/tests/Shell"

# Bail with SKIP (not FAIL) if the command directory is absent — vacuity is not
# a failure for this guard (it only owns command docs, which may legitimately
# not exist).
if [ ! -d "$COMMANDS_DIR" ]; then
	skip "no packages/prism-core/prompts/ directory — nothing to scan"
	print_summary "command_portability_test"
	exit $?
fi

# Scan each command doc and each shell test for grep invoked with PCRE (-P in
# any flag cluster: -oP, -Pn, -nP, -PE, etc.). Portable grep uses -E (ERE) or
# BRE only. Verified regex: `grep -[A-Za-z]*P` matches -oP, -Pn, -nP and does
# NOT false-positive on -Eo, -o, -nE, -c.
hits=0
while IFS= read -r -d '' cmd_file; do
	while IFS= read -r hit; do
		[ -z "$hit" ] && continue
		fail "GNU-only 'grep -P' (PCRE) found — BSD grep (macOS) incompatible:"
		echo "    $hit" >&2
		hits=$((hits + 1))
	done < <(grep -HnE 'grep -[A-Za-z]*P' "$cmd_file" 2>/dev/null || true)
done < <(find "$COMMANDS_DIR" -maxdepth 1 -type f -name '*.md' -print0)

# Shell tests are scanned too, excluding this scanner itself — its fail-message
# prose legitimately documents the banned pattern.
while IFS= read -r -d '' test_file; do
	[ "$(basename "$test_file")" = "command_portability_test.sh" ] && continue
	while IFS= read -r hit; do
		[ -z "$hit" ] && continue
		fail "GNU-only 'grep -P' (PCRE) found in tests/Shell — BSD grep (macOS) incompatible:"
		echo "    $hit" >&2
		hits=$((hits + 1))
	done < <(grep -HnE 'grep -[A-Za-z]*P' "$test_file" 2>/dev/null || true)
done < <(find "$SHELL_TESTS_DIR" -maxdepth 1 -type f -name '*_test.sh' -print0)

if [ "$hits" -eq 0 ]; then
	pass "no GNU-only 'grep -P' in prism-core prompts or tests/Shell/*_test.sh"
fi

print_summary "command_portability_test"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
