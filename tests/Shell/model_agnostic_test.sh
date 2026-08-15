#!/usr/bin/env bash
# $KYAULabs: model_agnostic_test.sh kyau@aura.kyaulabs 2026/08/15 -0700 Exp $





# model_agnostic_test.sh — contract test for the model-agnostic harness
# (ADR-0067). Asserts no living harness surface names, pins, restricts, or
# prescribes a model or thinking level. Exempt: historical records (adr/,
# docs/, CHANGELOG.md, NOTICE), tests/ (OCR fixtures are arbitrary test data),
# and the websearch skill's DeepSeek backend (functional tool dependency).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

# Banned tokens: model-prescription surfaces. "DeepSeek API" (websearch
# backend) and DEEPSEEK_API_KEY (its env contract) are NOT banned.
PATTERNS='deepseek-v4|deepseek/deepseek|defaultModel|defaultProvider|defaultThinkingLevel|enabledModels|judge model|primary model'

# ── 1. models.json must not exist ───────────────────────────────────────────
if [ -e "$REPO_ROOT/models.json" ]; then
	fail "models.json still exists — the primary/judge display overrides must be deleted (ADR-0067)"
else
	pass "models.json absent"
fi

# ── 2. Living surfaces carry no model prescription ──────────────────────────
mapfile -t FILES < <(
	find "$REPO_ROOT/.pi" "$REPO_ROOT/packages/prism-core" \
		-type f \( -name '*.md' -o -name '*.sh' -o -name '*.json' -o -name '*.ts' \) \
		-not -path '*/skills/websearch/*' 2>/dev/null
	printf '%s\n' \
		"$REPO_ROOT/settings.json" \
		"$REPO_ROOT/README.md" \
		"$REPO_ROOT/CODING_HARNESS.md" \
		"$REPO_ROOT/CONTRIBUTING.md" \
		"$REPO_ROOT/.github/PULL_REQUEST_TEMPLATE.md"
)

VIOLATIONS=0
for f in "${FILES[@]}"; do
	[ -f "$f" ] || continue
	if grep -HnEi "$PATTERNS" "$f" >/dev/null 2>&1; then
		VIOLATIONS=$((VIOLATIONS + 1))
		while IFS= read -r line; do
			fail "prescription in $f: $line"
		done < <(grep -HnEi "$PATTERNS" "$f" 2>/dev/null | head -5)
	fi
done

if [ "$VIOLATIONS" -gt 0 ]; then
	fail "$VIOLATIONS file(s) still carry model prescription"
else
	pass "no model prescription in living surfaces"
fi

print_summary "model_agnostic"





# vim: ft=sh sts=4 sw=4 ts=4 et :
