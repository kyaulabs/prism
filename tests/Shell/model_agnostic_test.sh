#!/usr/bin/env bash
# $KYAULabs: model_agnostic_test.sh kyau@aura.kyaulabs 2026/08/15 -0700 Exp $












# model_agnostic_test.sh — contract test for the model-agnostic harness
# (ADR-0067). Asserts no living harness surface names, pins, restricts, or
# prescribes a model or thinking level. Exempt: historical records (adr/,
# docs/, CHANGELOG.md, NOTICE), tests/ (OCR fixtures are arbitrary test data),
# and the websearch skill's DeepSeek backend (functional tool dependency).
#
# Limitation (deliberate): the banned-token list is tailored to the known
# offenders — DeepSeek model IDs, the four pi config keys, and judge/primary
# model phrases (incl. camelCase, kebab, and plural variants). Generic
# pinning keys for other providers are not scanned; extend PATTERNS when a
# new offender appears. Repo-root historical records (adr/, docs/,
# CHANGELOG.md, NOTICE) are outside the scan roots by construction; package
# docs (packages/*/docs) are living surfaces and ARE scanned.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

# Banned tokens: model-prescription surfaces. "DeepSeek API" (websearch
# backend) and DEEPSEEK_API_KEY (its env contract) are NOT banned.
PATTERNS='deepseek-v4|deepseek/deepseek|defaultModel|defaultProvider|defaultThinkingLevel|enabledModels|(judge|primary)[-_ ]?models?([^a-z]|$)'

# ── 1. models.json must not exist ───────────────────────────────────────────
if [ -e "$REPO_ROOT/models.json" ]; then
	fail "models.json still exists — the primary/judge display overrides must be deleted (ADR-0067)"
else
	pass "models.json absent"
fi

# ── 2. Living surfaces carry no model prescription ──────────────────────────
# Portable scan (no mapfile — bash 3.2 on macOS lacks it; see
# hook_portability_test.sh). One grep per file, one FAIL per file so the
# summary tally counts files, not lines. Fail closed: a missing scan root
# (wrong checkout shape) must not make the scan vacuously pass.
SCAN_ROOTS=("$REPO_ROOT/.pi" "$REPO_ROOT/packages/prism-core" "$REPO_ROOT/packages/prism-php-web")
for root in "${SCAN_ROOTS[@]}"; do
	[ -d "$root" ] || fail "missing scan root: $root"
done
FILES=()
while IFS= read -r f; do
	[ -n "$f" ] && FILES+=("$f")
done < <(
	find "${SCAN_ROOTS[@]}" \
		-type f \( -name '*.md' -o -name '*.sh' -o -name '*.js' -o -name '*.json' -o -name '*.ts' \
		-o -name '*.yaml' -o -name '*.yml' -o -name '*.toml' \) \
		-not -path '*/skills/websearch/*' \
		-not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/vendor/*' 2>/dev/null
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
	MATCHES="$(grep -HnEi "$PATTERNS" "$f" 2>/dev/null | head -5 || true)"
	if [ -n "$MATCHES" ]; then
		VIOLATIONS=$((VIOLATIONS + 1))
		fail "model prescription in $f"
		printf '%s\n' "$MATCHES" >&2
	fi
done

if [ "$VIOLATIONS" -eq 0 ]; then
	pass "no model prescription in living surfaces"
fi

print_summary "model_agnostic"












# vim: ft=sh sts=4 sw=4 ts=4 et :
