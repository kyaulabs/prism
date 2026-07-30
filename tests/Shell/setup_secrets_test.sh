#!/usr/bin/env bash
# $KYAULabs: setup_secrets_test.sh kyau@cosmos.kyaulabs 2026/07/29 -0700 Exp $








set -euo pipefail

# ── check-setup-secrets.sh guard test (issue #194, ADR-0043) ────────────────
# Verifies the tracked prism.jsonc secret-slot guard, repointed from the
# legacy .opencode/setup.json to the root prism.jsonc manifest and delegated
# to the prism_manifest.php check-secrets command (project mode):
#   Section A — guard logic: comments/trailing commas pass; any non-empty
#               env.* value (string/number/boolean/object) fails; malformed
#               JSONC, duplicate keys, missing manifest, non-object env, and
#               absent PHP all fail closed; output names key paths, never
#               values; the repo's own prism.jsonc passes.
#   Section B — pre-commit invokes the guard on the STAGED blob; staged
#               content wins over the working tree.
#   Section C — CI runs the guard as a step in both jobs, renamed to prism.jsonc.
# ─────────────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

SCRIPT="$REPO_ROOT/.github/scripts/check-setup-secrets.sh"
HOOK="$REPO_ROOT/.github/hooks/pre-commit"
CI="$REPO_ROOT/.github/workflows/ci.yml"

# PHP CLI sources the guard delegates to. The functional hook tests (B4/B5)
# copy these into a disposable repo so the guard can run end-to-end there.
MANIFEST_PHP=(prism_manifest.php PrismManifest.php PrismJsoncDocument.php PrismJsoncException.php)

# run_guard_out <jsonc-string> → sets GUARD_RC (exit status) and GUARD_OUT
# (combined stdout+stderr). Writes the content to a temp file so the guard
# sees a real path.
run_guard_out() {
	local content="$1"
	local tmpf
	tmpf=$(mktemp)
	printf '%s' "$content" > "$tmpf"
	GUARD_OUT=$(bash "$SCRIPT" "$tmpf" 2>&1) && GUARD_RC=0 || GUARD_RC=$?
	rm -f "$tmpf"
}

# scaffold_guard_repo <dir> — git init a disposable repo and install the guard
# shell plus the PHP CLI it delegates to, so the real pre-commit hook can run
# the guard end-to-end against a staged prism.jsonc blob.
scaffold_guard_repo() {
	local dir="$1" f
	mkdir -p "$dir/.github/scripts" "$dir/.github/hooks"
	cp "$REPO_ROOT/.github/scripts/check-setup-secrets.sh" "$dir/.github/scripts/"
	chmod +x "$dir/.github/scripts/check-setup-secrets.sh"
	for f in "${MANIFEST_PHP[@]}"; do
		cp "$REPO_ROOT/.github/scripts/$f" "$dir/.github/scripts/"
	done
	cp "$REPO_ROOT/.github/hooks/pre-commit" "$dir/.github/hooks/"
	git_init_test_repo "$dir"
}

# ── Section A: guard logic ──────────────────────────────────────────────────

echo ""
echo "── Section A: guard logic ──"

# A1: comments and trailing commas pass (JSONC, not jq — proves non-jq path)
run_guard_out '{
  // line comment
  "setup_version": 5,
  "env": {
    "deepseek_api_key": "", /* block comment */
    "searxng_url": "",
  }
}'
if [ "$GUARD_RC" -eq 0 ]; then
	pass "comments + trailing commas + empty env → pass"
else
	fail "comments/trailing commas/empty env should pass (exit $GUARD_RC): $GUARD_OUT"
fi

# A2: non-empty string value fails + names the key path (never the value)
run_guard_out '{"env":{"deepseek_api_key":"nonempty","searxng_url":""}}'
if [ "$GUARD_RC" -eq 0 ]; then
	fail "non-empty deepseek_api_key should fail"
elif ! printf '%s' "$GUARD_OUT" | grep -q "env.deepseek_api_key"; then
	fail "failure did not name env.deepseek_api_key: $GUARD_OUT"
else
	pass "non-empty deepseek_api_key → blocked + key path named"
fi

# A3: non-empty number/boolean/object values each fail (uniform rule — only
# the empty string is clean). NOTE: fixture values are gitleaks-safe literals.
for fixture in '{"env":{"x":42}}' '{"env":{"x":true}}' '{"env":{"x":{}}}'; do
	run_guard_out "$fixture"
	if [ "$GUARD_RC" -ne 0 ] && printf '%s' "$GUARD_OUT" | grep -q "env.x"; then
		pass "non-empty value ($fixture) → blocked + key named"
	else
		fail "non-empty value should fail ($fixture) (rc=$GUARD_RC): $GUARD_OUT"
	fi
done

# A4: malformed JSONC fails closed
run_guard_out '{ this is not valid jsonc'
if [ "$GUARD_RC" -eq 0 ]; then
	fail "malformed JSONC should fail closed"
else
	pass "malformed JSONC → fail closed"
fi

# A5: duplicate keys fail closed
run_guard_out '{"env":{"x":""},"env":{"x":""}}'
if [ "$GUARD_RC" -eq 0 ]; then
	fail "duplicate keys should fail closed"
else
	pass "duplicate keys → fail closed"
fi

# A6: missing required project manifest fails (the default prism.jsonc is
# REQUIRED — only an explicitly optional fixture path may be absent).
A6_TMPD=$(mktemp -d)
register_temp_dir "$A6_TMPD"
GUARD_RC=0
GUARD_OUT=$( { cd "$A6_TMPD" && bash "$SCRIPT"; } 2>&1 ) && GUARD_RC=0 || GUARD_RC=$?
if [ "$GUARD_RC" -ne 0 ]; then
	pass "missing default prism.jsonc → fail closed (required manifest)"
else
	fail "missing default prism.jsonc should fail (exit $GUARD_RC): $GUARD_OUT"
fi

# A7: absent PHP fails closed with a clear error naming php. Launch a fresh
# bash (via its absolute path) under an empty PATH so `command -v php` cannot
# resolve anything, while the guard's builtin-only path resolution still works.
# Deterministic — does not depend on how many dirs host php.
if command -v bash >/dev/null 2>&1 && command -v php >/dev/null 2>&1; then
	BASH_ABS=$(command -v bash)
	GUARD_OUT=$(env PATH="" "$BASH_ABS" "$SCRIPT" "$A6_TMPD/nope.jsonc" 2>&1) && GUARD_RC=0 || GUARD_RC=$?
	if [ "$GUARD_RC" -ne 0 ] && printf '%s' "$GUARD_OUT" | grep -qi 'php'; then
		pass "absent PHP → fail closed with clear error"
	else
		fail "absent PHP should fail closed naming php (rc=$GUARD_RC): $GUARD_OUT"
	fi
else
	skip "A7: bash/php not installed — precondition unmet"
fi

# A8: unexpected env shape fails (env must be an object in project mode)
for fixture in '{"env":"string"}' '{"env":42}' '{"env":[]}'; do
	run_guard_out "$fixture"
	if [ "$GUARD_RC" -ne 0 ]; then
		pass "non-object env ($fixture) → fail closed"
	else
		fail "non-object env should fail ($fixture) (rc=$GUARD_RC): $GUARD_OUT"
	fi
done

# A9: output lists the violating key path but NOT the secret value
run_guard_out '{"env":{"deepseek_api_key":"poisonvalue","searxng_url":""}}'
if [ "$GUARD_RC" -ne 0 ] \
	&& printf '%s' "$GUARD_OUT" | grep -q 'env.deepseek_api_key' \
	&& ! printf '%s' "$GUARD_OUT" | grep -q 'poisonvalue'; then
	pass "output names key path, never the value"
else
	fail "output should name key path and omit value (rc=$GUARD_RC): $GUARD_OUT"
fi

# A10: multiple non-empty values → exit 1, output names BOTH key paths
run_guard_out '{"env":{"deepseek_api_key":"nonempty","searxng_url":"https://s.example.test"}}'
if [ "$GUARD_RC" -eq 0 ]; then
	fail "multiple non-empty values should fail"
elif ! printf '%s' "$GUARD_OUT" | grep -q 'env.deepseek_api_key' \
	|| ! printf '%s' "$GUARD_OUT" | grep -q 'env.searxng_url'; then
	fail "multiple violations not all reported: $GUARD_OUT"
else
	pass "multiple non-empty values → both key paths reported"
fi

# A11: the repo's own tracked prism.jsonc must pass (it ships empty env)
GUARD_RC=0
bash "$SCRIPT" "$REPO_ROOT/prism.jsonc" >/dev/null 2>&1 || GUARD_RC=$?
if [ "$GUARD_RC" -eq 0 ]; then
	pass "tracked prism.jsonc passes (empty env)"
else
	fail "tracked prism.jsonc should pass (it ships empty env)"
fi

# ── Section B: pre-commit wiring ────────────────────────────────────────────

echo ""
echo "── Section B: pre-commit wiring ──"

# B1: hook invokes the guard script
if grep -qF 'check-setup-secrets.sh' "$HOOK"; then
	pass "pre-commit invokes check-setup-secrets.sh"
else
	fail "pre-commit does not invoke check-setup-secrets.sh"
fi

# B2: hook targets prism.jsonc (not the legacy .opencode/setup.json path)
if grep -qF "grep -Fx 'prism.jsonc'" "$HOOK" \
	&& ! grep -qF "grep -Fx '.opencode/setup.json'" "$HOOK"; then
	pass "pre-commit guards the staged prism.jsonc blob"
else
	fail "pre-commit should target prism.jsonc, not .opencode/setup.json"
fi

# B3: guard sits AFTER the gitleaks block (runs even when gitleaks is absent)
gl_line=$(grep -nE 'gitleaks git --pre-commit --staged' "$HOOK" | head -1 | cut -d: -f1)
guard_line=$(grep -nF 'check-setup-secrets.sh "$TMPF"' "$HOOK" | head -1 | cut -d: -f1)
if [ -n "$gl_line" ] && [ -n "$guard_line" ] && [ "$guard_line" -gt "$gl_line" ]; then
	pass "guard runs after the gitleaks block (line $guard_line > $gl_line)"
else
	fail "guard should run after the gitleaks block (gitleaks=$gl_line guard=$guard_line)"
fi

# B4: functional — the REAL hook blocks a STAGED poisoned prism.jsonc. Proves
# the wiring end-to-end. The poison value is the gitleaks-safe placeholder
# "nonempty".
test_hook_blocks_staged_poison() {
	command -v git >/dev/null 2>&1 || { skip "B4: git unavailable"; return; }
	command -v php >/dev/null 2>&1 || { skip "B4: php unavailable"; return; }
	local repo rc
	repo=$(mktemp -d)
	register_temp_dir "$repo"
	scaffold_guard_repo "$repo"
	printf '%s' '{"env":{"deepseek_api_key":"nonempty","searxng_url":""}}' > "$repo/prism.jsonc"
	git -C "$repo" add prism.jsonc
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

# B5: staged content wins over the working tree. A clean blob is staged, then
# a secret is written to the working-tree copy WITHOUT staging → guard passes
# (checks the staged blob). Staging the secret then fails. (Task 9 AC #10.)
test_staged_wins_over_working_tree() {
	command -v git >/dev/null 2>&1 || { skip "B5: git unavailable"; return; }
	command -v php >/dev/null 2>&1 || { skip "B5: php unavailable"; return; }
	local repo rc
	repo=$(mktemp -d)
	register_temp_dir "$repo"
	scaffold_guard_repo "$repo"
	# Stage a CLEAN manifest.
	printf '%s' '{"setup_version":5,"env":{"deepseek_api_key":"","searxng_url":""}}' > "$repo/prism.jsonc"
	git -C "$repo" add prism.jsonc
	# Poison the working-tree copy ONLY (not staged).
	printf '%s' '{"setup_version":5,"env":{"deepseek_api_key":"nonempty","searxng_url":""}}' > "$repo/prism.jsonc"
	rc=0
	( cd "$repo" && bash .github/hooks/pre-commit ) >"$repo/.b5a" 2>&1 || rc=$?
	if [ "$rc" -ne 0 ]; then
		fail "B5a — clean staged blob should pass despite dirty working tree (rc=$rc): $(cat "$repo/.b5a")"
		return
	fi
	pass "B5a — clean staged blob passes (working-tree secret ignored)"
	# Now stage the poison — the guard must fail on the staged blob.
	git -C "$repo" add prism.jsonc
	rc=0
	( cd "$repo" && bash .github/hooks/pre-commit ) >"$repo/.b5b" 2>&1 || rc=$?
	if [ "$rc" -eq 0 ]; then
		fail "B5b — staged poison should block (exit 0)"
		return
	fi
	if ! grep -q "env.deepseek_api_key" "$repo/.b5b"; then
		fail "B5b — blocked but output did not name the key"
		return
	fi
	pass "B5b — staged poison blocks (staged content wins over working tree)"
}
test_staged_wins_over_working_tree

# ── Section C: CI wiring ────────────────────────────────────────────────────

echo ""
echo "── Section C: CI wiring ──"

# C1: ci.yml invokes the guard
if grep -qF 'check-setup-secrets.sh' "$CI"; then
	pass "ci.yml invokes check-setup-secrets.sh"
else
	fail "ci.yml should invoke check-setup-secrets.sh"
fi

# C2: guard runs in BOTH jobs (linux check + check-macos) — ≥2 occurrences of
# the script name in `run:` lines (the step name carries no script name).
count=$(grep -cF 'check-setup-secrets.sh' "$CI" || true)
if [ "$count" -ge 2 ]; then
	pass "ci.yml runs the guard in both jobs ($count occurrences)"
else
	fail "ci.yml should run the guard in both jobs (found $count)"
fi

# C3: both step names reference prism.jsonc (repointed from setup.json)
if grep -qF 'prism.jsonc secret hygiene' "$CI" \
	&& ! grep -qF 'setup.json secret hygiene' "$CI"; then
	pass "ci.yml step names repointed to prism.jsonc"
else
	fail "ci.yml step names should reference prism.jsonc, not setup.json"
fi

print_summary "setup_secrets_test (Sections A+B+C)"
exit $?




# vim: ft=sh sts=4 sw=4 ts=4 et :
