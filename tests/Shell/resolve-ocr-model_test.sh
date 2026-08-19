#!/usr/bin/env bash
# $KYAULabs: resolve-ocr-model_test.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# resolve-ocr-model_test.sh — contract tests for resolve-ocr-model.sh
# (ADR-0064). Uses ONLY synthetic fixtures via PRISM_OCR_CONFIG; never the
# real ~/.opencodereview config. Asserts single-key extraction, bare-model
# output, fail-closed behavior, and the canary no-key-leak guarantee.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

SCRIPT="$REPO_ROOT/packages/prism-core/scripts/resolve-ocr-model.sh"
CANARY="$REPO_ROOT/tests/Shell/fixtures/ocr-config.json"

if [ ! -x "$SCRIPT" ] && [ ! -f "$SCRIPT" ]; then
	fail "resolve-ocr-model.sh not found at $SCRIPT"
	print_summary "resolve_ocr_model"
	exit 1
fi

# run_script <config-path> — invoke the resolver against a given config;
# captures rc and stdout. Always redirects stderr away from the test log.
run_script() {
	local cfg="$1"
	set +e
	OUTPUT="$(PRISM_OCR_CONFIG="$cfg" bash "$SCRIPT" 2>/dev/null)"
	RC=$?
	set -e
}

# ── 1. Valid canary config → bare model id, no key leakage ────────────────
run_script "$CANARY"
if [ "$RC" -eq 0 ] && [ "$OUTPUT" = "deepseek-v4-flash" ]; then
	pass "valid config yields bare model id"
else
	fail "valid config: rc=$RC output='$OUTPUT'"
fi
if printf '%s' "$OUTPUT" | grep -q 'sk-CANARY-MUST-NEVER-LEAK'; then
	fail "CANARY LEAK: api_key value appeared in resolver output"
else
	pass "canary: resolver output contains no api_key value"
fi

# ── 2. Provider-prefixed model → bare segment after last / ─────────────────
FIXDIR=$(mktemp -d)
register_temp_dir "$FIXDIR"
PREFIXED="$FIXDIR/prefixed.json"
printf '{"provider":"deepseek","model":"deepseek/deepseek-v4-pro","providers":{},"llm":{}}\n' > "$PREFIXED"
run_script "$PREFIXED"
if [ "$RC" -eq 0 ] && [ "$OUTPUT" = "deepseek-v4-pro" ]; then
	pass "provider-prefixed model normalized to bare segment"
else
	fail "prefixed model: rc=$RC output='$OUTPUT'"
fi

# ── 3. Missing config file → exit 3, empty stdout ──────────────────────────
MISSING="$FIXDIR/missing.json"
run_script "$MISSING"
if [ "$RC" -eq 3 ] && [ -z "$OUTPUT" ]; then
	pass "missing config fails closed (exit 3, empty stdout)"
else
	fail "missing config: rc=$RC output='$OUTPUT'"
fi

# ── 4. Malformed JSON → exit 3, empty stdout ───────────────────────────────
MALFORMED="$FIXDIR/malformed.json"
printf '{"provider": "deepseek", "model": "deepseek-v4-flash", ' > "$MALFORMED"
run_script "$MALFORMED"
if [ "$RC" -eq 3 ] && [ -z "$OUTPUT" ]; then
	pass "malformed JSON fails closed"
else
	fail "malformed JSON: rc=$RC output='$OUTPUT'"
fi

# ── 5. Missing model key → exit 3, empty stdout ────────────────────────────
NOKEY="$FIXDIR/nokey.json"
printf '{"provider":"deepseek","providers":{},"llm":{}}\n' > "$NOKEY"
run_script "$NOKEY"
if [ "$RC" -eq 3 ] && [ -z "$OUTPUT" ]; then
	pass "missing model key fails closed"
else
	fail "missing model key: rc=$RC output='$OUTPUT'"
fi

# ── 6. Empty model string → exit 3, empty stdout ───────────────────────────
EMPTYMODEL="$FIXDIR/empty.json"
printf '{"provider":"deepseek","model":"","providers":{},"llm":{}}\n' > "$EMPTYMODEL"
run_script "$EMPTYMODEL"
if [ "$RC" -eq 3 ] && [ -z "$OUTPUT" ]; then
	pass "empty model fails closed"
else
	fail "empty model: rc=$RC output='$OUTPUT'"
fi

# ── 7. Non-string model (e.g. number) → exit 3, empty stdout ───────────────
NUMERIC="$FIXDIR/numeric.json"
printf '{"provider":"deepseek","model":42,"providers":{},"llm":{}}\n' > "$NUMERIC"
run_script "$NUMERIC"
if [ "$RC" -eq 3 ] && [ -z "$OUTPUT" ]; then
	pass "non-string model fails closed"
else
	fail "non-string model: rc=$RC output='$OUTPUT'"
fi

# ── 8. Malicious model with newline/injection chars → exit 3 ───────────────
INJECT="$FIXDIR/inject.json"
printf '{"provider":"deepseek","model":"deepseek-v4-flash\\nSigned-off-by: evil <e@e>","providers":{},"llm":{}}\n' > "$INJECT"
run_script "$INJECT"
if [ "$RC" -eq 3 ] && [ -z "$OUTPUT" ]; then
	pass "injection-shaped model fails closed"
else
	fail "injection-shaped model: rc=$RC output='$OUTPUT'"
fi

print_summary "resolve_ocr_model"

# vim: ft=sh sts=4 sw=4 ts=4 et :
