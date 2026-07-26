#!/usr/bin/env bash
# $KYAULabs: setup_secrets_test.sh kyau@cosmos.kyaulabs 2026/07/25 -0700 Exp $




set -euo pipefail

# ── check-setup-secrets.sh guard test (issue #194) ──────────────────────────
# Verifies the tracked-.opencode/setup.json secret-slot guard:
#   Section A — guard logic (empty/absent env pass; non-empty env.* fails;
#               malformed JSON fails closed; multiple violations all reported;
#               the repo's own tracked file is clean).
#   Section B — pre-commit invokes the guard on the staged blob (Task 2).
#   Section C — CI runs the guard as a step in both jobs (Task 3).
#   Section D — mcp.md documents the guarded-file rule (Task 4, AC-2).
# ─────────────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

SCRIPT="$REPO_ROOT/.github/scripts/check-setup-secrets.sh"

# run_guard_out <json-string> → sets GUARD_RC (exit status) and GUARD_OUT
# (combined stdout+stderr). Uses a temp file so the guard sees a real path.
run_guard_out() {
	local content="$1"
	local tmpf
	tmpf=$(mktemp)
	printf '%s' "$content" > "$tmpf"
	GUARD_OUT=$(bash "$SCRIPT" "$tmpf" 2>&1) && GUARD_RC=0 || GUARD_RC=$?
	rm -f "$tmpf"
}

# ── Section A: guard logic ──────────────────────────────────────────────────

echo ""
echo "── Section A: guard logic ──"

# A1: empty env values pass
run_guard_out '{"env":{"deepseek_api_key":"","searxng_url":""}}'
if [ "$GUARD_RC" -eq 0 ]; then
	pass "empty env values → pass"
else
	fail "empty env values should pass (exit $GUARD_RC): $GUARD_OUT"
fi

# A2: absent env section passes
run_guard_out '{"setup_version":4,"models":{"primary":"x"}}'
if [ "$GUARD_RC" -eq 0 ]; then
	pass "absent env section → pass"
else
	fail "absent env section should pass (exit $GUARD_RC): $GUARD_OUT"
fi

# A3: absent file passes (graceful skip)
GUARD_RC=0
bash "$SCRIPT" "/nonexistent/setup-$$-nope.json" >/dev/null 2>&1 || GUARD_RC=$?
if [ "$GUARD_RC" -eq 0 ]; then
	pass "absent file → graceful skip (exit 0)"
else
	fail "absent file should exit 0 (exit $GUARD_RC)"
fi

# A4: non-empty deepseek_api_key fails + names the key.
# NOTE: fixture value is an obviously-non-secret placeholder ("nonempty") so it
# does not trip gitleaks' generic-API-key rule. The guard checks non-emptiness
# only and reports the KEY name (never the value), so the value is irrelevant
# to the assertion.
run_guard_out '{"env":{"deepseek_api_key":"nonempty","searxng_url":""}}'
if [ "$GUARD_RC" -eq 0 ]; then
	fail "non-empty deepseek_api_key should fail"
elif ! echo "$GUARD_OUT" | grep -q "env.deepseek_api_key"; then
	fail "failure did not name env.deepseek_api_key: $GUARD_OUT"
else
	pass "non-empty deepseek_api_key → blocked + named"
fi

# A5: non-empty searxng_url fails (uniform rule, NO carve-out for URLs)
run_guard_out '{"env":{"deepseek_api_key":"","searxng_url":"https://searxng.example.com"}}'
if [ "$GUARD_RC" -eq 0 ]; then
	fail "non-empty searxng_url should fail (uniform rule)"
elif ! echo "$GUARD_OUT" | grep -q "env.searxng_url"; then
	fail "failure did not name env.searxng_url: $GUARD_OUT"
else
	pass "non-empty searxng_url → blocked (uniform rule, no carve-out)"
fi

# A6: multiple non-empty values → exit 1, output names BOTH keys
run_guard_out '{"env":{"deepseek_api_key":"nonempty","searxng_url":"https://s.example.test"}}'
if [ "$GUARD_RC" -eq 0 ]; then
	fail "multiple non-empty values should fail"
elif ! echo "$GUARD_OUT" | grep -q "env.deepseek_api_key" || ! echo "$GUARD_OUT" | grep -q "env.searxng_url"; then
	fail "multiple violations not all reported: $GUARD_OUT"
else
	pass "multiple non-empty values → both reported"
fi

# A7: malformed JSON fails closed
run_guard_out '{ this is not valid json'
if [ "$GUARD_RC" -eq 0 ]; then
	fail "malformed JSON should fail closed"
else
	pass "malformed JSON → fail closed"
fi

# A8: the repo's own tracked setup.json must pass (it ships empty env)
GUARD_RC=0
bash "$SCRIPT" "$REPO_ROOT/.opencode/setup.json" >/dev/null 2>&1 || GUARD_RC=$?
if [ "$GUARD_RC" -eq 0 ]; then
	pass "tracked .opencode/setup.json passes (empty env)"
else
	fail "tracked .opencode/setup.json should pass (it ships empty env)"
fi

print_summary "setup_secrets_test (Section A)"
exit $?



# vim: ft=sh sts=4 sw=4 ts=4 et :
