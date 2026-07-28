#!/usr/bin/env bash
# $KYAULabs: harness_failure_masking_test.sh kyau@cosmos.kyaulabs 2026/07/27 -0700 Exp $


# ── Regression test for Issue #217: failure-masking in harness commands ───
#
# Three files had patterns that masked genuine failures as SKIPPED/NOT_FOUND:
#   1. doctor.md  — `cmd | head | sed || echo NOT_FOUND` (pipeline binding:
#                   || binds to sed, not cmd; missing tools never reported)
#   2. check.md   — `cmd || echo "SKIPPED"` (real test failures → SKIPPED)
#   3. resolve-merge-conflicts.md — `cmd || echo "not configured"` (real lint
#                   violations → "not configured")
#
# This test does BOTH static checks (buggy patterns absent in source files)
# and dynamic checks (the correct patterns behave correctly at runtime).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

CHECK_MD="$REPO_ROOT/.opencode/commands/check.md"
DOCTOR_MD="$REPO_ROOT/.opencode/commands/doctor.md"
RESOLVE_MD="$REPO_ROOT/.opencode/agents/resolve-merge-conflicts.md"

# ── Static checks: buggy patterns must be ABSENT from source files ─────────

echo ""
echo "── Static checks: buggy patterns absent ──"

# check.md must NOT have `|| echo "SKIPPED"` catch-all (only proper if/else)
if grep -qF '|| echo "SKIPPED' "$CHECK_MD" 2>/dev/null; then
	fail "check.md still has '|| echo \"SKIPPED\"' catch-all masking (Issue #217)"
	grep -nF '|| echo "SKIPPED' "$CHECK_MD" >&2 || true
else
	pass "check.md has no '|| echo SKIPPED' catch-all"
fi

# resolve-merge-conflicts.md must NOT have `|| echo ".*not configured"`
if grep -E '\|\| echo "[^"]*not configured' "$RESOLVE_MD" 2>/dev/null | grep -q .; then
	fail "resolve-merge-conflicts.md still has '|| echo not configured' masking (Issue #217)"
	grep -nE '\|\| echo "[^"]*not configured' "$RESOLVE_MD" >&2 || true
else
	pass "resolve-merge-conflicts.md has no '|| echo not configured' catch-all"
fi

# check.md must use `read -r` (not bare `read`) in the syntax-check loop
if grep -E 'while read [^[-]' "$CHECK_MD" 2>/dev/null | grep -q .; then
	fail "check.md uses bare 'read' (should be 'read -r')"
	grep -nE 'while read [^[-]' "$CHECK_MD" >&2 || true
else
	pass "check.md uses 'read -r' (or no bare 'read')"
fi

# resolve-merge-conflicts.md must use `read -r`
if grep -E 'while read [^[-]' "$RESOLVE_MD" 2>/dev/null | grep -q .; then
	fail "resolve-merge-conflicts.md uses bare 'read' (should be 'read -r')"
	grep -nE 'while read [^[-]' "$RESOLVE_MD" >&2 || true
else
	pass "resolve-merge-conflicts.md uses 'read -r' (or no bare 'read')"
fi

# doctor.md must have `set -o pipefail` in bash blocks that use pipelines.
# Every bash block with `| head` or `| sed` must also contain `set -o pipefail`.
# We check by extracting fenced bash blocks and verifying each one with a pipe
# also has pipefail.
doctor_pipe_blocks_ok=1
# Extract line ranges of ```bash blocks and check each for pipe-without-pipefail
while IFS= read -r -d '' block; do
	if echo "$block" | grep -qE '\| (head|sed) ' && ! echo "$block" | grep -q 'pipefail'; then
		doctor_pipe_blocks_ok=0
		echo "  doctor.md bash block has pipe but no pipefail:" >&2
		echo "$block" | head -3 | sed 's/^/    /' >&2
	fi
done < <(
	# Extract each fenced bash block as a unit
	awk '/^```bash/{flag=1; next} /^```/{if(flag){flag=0; print "\x00"} next} flag{print}' "$DOCTOR_MD" 2>/dev/null
)

if [ "$doctor_pipe_blocks_ok" -eq 1 ]; then
	pass "doctor.md pipeline blocks all have pipefail"
else
	fail "doctor.md has pipeline blocks without pipefail (Issue #217)"
fi

# ── Dynamic checks: correct patterns behave correctly ──────────────────────

echo ""
echo "── Dynamic checks: correct patterns behave correctly ──"

# D1: Without pipefail — missing tool through pipeline does NOT report NOT_FOUND
# (This proves the bug exists without the fix, making the test meaningful.)
# Must explicitly disable pipefail — the test file's own `set -o pipefail`
# is inherited by command substitutions.
output=$(set +o pipefail; totally_nonexistent_xyz_abc --version 2>/dev/null | head -1 | sed 's/x //' || echo "NOT_FOUND")
if [ -z "$output" ]; then
	pass "without pipefail: missing tool produces empty output (proves bug exists)"
else
	fail "without pipefail: expected empty output, got: $output"
fi

# D2: WITH pipefail — missing tool through pipeline DOES report NOT_FOUND
output=$(set -o pipefail; totally_nonexistent_xyz_abc --version 2>/dev/null | head -1 | sed 's/x //' || echo "NOT_FOUND")
if [ "$output" = "NOT_FOUND" ]; then
	pass "with pipefail: missing tool correctly reports NOT_FOUND"
else
	fail "with pipefail: expected NOT_FOUND, got: '$output'"
fi

# D3: pipefail doesn't break present tools
output=$(set -o pipefail; echo "PHP 8.5.0" | head -1 | sed 's/PHP //' || echo "NOT_FOUND")
if [ "$output" = "8.5.0" ]; then
	pass "with pipefail: present tool version still captured correctly"
else
	fail "with pipefail: expected '8.5.0', got: '$output'"
fi

# D4: Existence-check pattern distinguishes absent from failing (check.md pattern)
# Simulate: script defined → would run (exit propagates); script absent → SKIPPED
if echo '{"scripts":{"test:plugin":"node test"}}' | grep -q '"test:plugin"'; then
	pass "existence check: defined script detected (would run, not skip)"
else
	fail "existence check: failed to detect defined script"
fi

if ! echo '{"scripts":{"other":"node x"}}' | grep -q '"test:plugin"'; then
	pass "existence check: absent script detected (would skip)"
else
	fail "existence check: false positive on absent script"
fi

# D5: read -r preserves backslashes in filenames
backslash_test=$(printf 'foo\\bar.php\n' | while read -r f; do echo "got:$f"; done)
if [ "$backslash_test" = "got:foo\bar.php" ]; then
	pass "read -r: backslash preserved in filename"
else
	fail "read -r: expected 'got:foo\\bar.php', got: '$backslash_test'"
fi

# ── Summary ────────────────────────────────────────────────────────────────

print_summary "harness_failure_masking_test.sh"
exit $?


# vim: ft=sh sts=4 sw=4 ts=4 et :
