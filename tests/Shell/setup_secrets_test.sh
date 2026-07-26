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

# ── Section B: pre-commit wiring ────────────────────────────────────────────

echo ""
echo "── Section B: pre-commit wiring ──"
HOOK="$REPO_ROOT/.github/hooks/pre-commit"

# B1: hook invokes the guard script
if grep -qF 'check-setup-secrets.sh' "$HOOK"; then
	pass "pre-commit invokes check-setup-secrets.sh"
else
	fail "pre-commit does not invoke check-setup-secrets.sh"
fi

# B2: guard sits AFTER the gitleaks block (runs even when gitleaks is absent)
gl_line=$(grep -nE 'gitleaks git --pre-commit --staged' "$HOOK" | head -1 | cut -d: -f1)
guard_line=$(grep -nF 'check-setup-secrets.sh "$TMPF"' "$HOOK" | head -1 | cut -d: -f1)
if [ -n "$gl_line" ] && [ -n "$guard_line" ] && [ "$guard_line" -gt "$gl_line" ]; then
	pass "guard runs after the gitleaks block (line $guard_line > $gl_line)"
else
	fail "guard should run after the gitleaks block (gitleaks=$gl_line guard=$guard_line)"
fi

# B3: hook runs the guard on the STAGED blob ($TMPF), not the working-tree file
if grep -qF 'check-setup-secrets.sh "$TMPF"' "$HOOK"; then
	pass "pre-commit checks the staged setup.json blob (\$TMPF)"
else
	fail "pre-commit should run the guard on the staged blob (\$TMPF)"
fi

# B4: functional — the REAL hook blocks a STAGED poisoned setup.json (the
# staged-blob repro, automated). Proves the wiring end-to-end. The poison
# value is the gitleaks-safe placeholder "nonempty".
test_hook_blocks_staged_poison() {
	command -v git >/dev/null 2>&1 || { skip "B4: git unavailable"; return; }
	local repo rc
	repo=$(mktemp -d)
	register_temp_dir "$repo"
	mkdir -p "$repo/.github/scripts" "$repo/.github/hooks" "$repo/.opencode"
	cp "$REPO_ROOT/.github/scripts/check-setup-secrets.sh" "$repo/.github/scripts/"
	chmod +x "$repo/.github/scripts/check-setup-secrets.sh"
	cp "$REPO_ROOT/.github/hooks/pre-commit" "$repo/.github/hooks/"
	git init -q "$repo"
	git -C "$repo" config commit.gpgsign false
	git -C "$repo" config user.email "t@example.com"
	git -C "$repo" config user.name "T"
	# Poison the file and STAGE it (the index receives the poison — what would commit).
	printf '%s' '{"env":{"deepseek_api_key":"nonempty","searxng_url":""}}' > "$repo/.opencode/setup.json"
	git -C "$repo" add .opencode/setup.json
	rc=0
	( cd "$repo" && bash .github/hooks/pre-commit ) >"$repo/.b4out" 2>&1 || rc=$?
	if [ "$rc" -eq 0 ]; then
		fail "B4 staged poison — real hook did not block (exit 0)"
		return
	fi
	if ! grep -q "env.deepseek_api_key" "$repo/.b4out"; then
		fail "B4 staged poison — blocked but output did not name the key"
		return
	fi
	pass "B4 staged poison — real hook blocks the staged blob + names the key"
}
test_hook_blocks_staged_poison

# ── Section C: CI wiring ────────────────────────────────────────────────────

echo ""
echo "── Section C: CI wiring ──"
CI="$REPO_ROOT/.github/workflows/ci.yml"

# C1: ci.yml invokes the guard
if grep -qF 'check-setup-secrets.sh' "$CI"; then
	pass "ci.yml invokes check-setup-secrets.sh"
else
	fail "ci.yml should invoke check-setup-secrets.sh"
fi

# C2: guard runs in BOTH jobs (linux check + check-macos) — ≥2 occurrences of
# the script name (the step NAME is "Check setup.json secret hygiene", which
# does not contain the script name; only each `run:` line does → 2 total).
count=$(grep -cF 'check-setup-secrets.sh' "$CI" || true)
if [ "$count" -ge 2 ]; then
	pass "ci.yml runs the guard in both jobs ($count occurrences)"
else
	fail "ci.yml should run the guard in both jobs (found $count)"
fi

print_summary "setup_secrets_test (Sections A+B+C)"
exit $?


# vim: ft=sh sts=4 sw=4 ts=4 et :
