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
# CHANGELOG.md) are outside the scan roots by construction; package NOTICE
# and package docs (packages/*/docs) are scanned and must stay clean.

set -euo pipefail

# Deterministic matching regardless of the caller's locale: bracket
# expressions and case-folding must not depend on collation.
export LC_ALL=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

# Banned tokens: model-prescription surfaces. "DeepSeek API" (websearch
# backend) and DEEPSEEK_API_KEY (its env contract) are NOT banned.
# Deliberate asymmetry: the four pi config keys match camelCase/kebab/snake
# forms only — spaced prose ("default model") is ordinary English and is
# intentionally exempt; the (judge|primary) branch allows a space because
# those phrases are prescription even in prose. Trailing ([^a-z]|$) keeps
# every alternative from matching inside unrelated identifiers.
PATTERNS='deepseek-v4([^a-z_]|$)|deepseek/deepseek-v4([^a-z_]|$)|default[-_]?model([^a-z_]|$)|default[-_]?provider([^a-z_]|$)|default[-_]?thinking[-_]?level([^a-z_]|$)|enabled[-_]?models([^a-z_]|$)|(judge|primary)[-_ ]?models?([^a-z_]|$)'

# ── 0. Pattern self-test (the ADR-0067 guarantee rides on this regex) ─────
for pos in \
	'deepseek-v4-flash' 'deepseek/deepseek-v4-pro' \
	defaultModel default_model 'defaultProvider": "x' defaultThinkingLevel default-thinking-level default-provider \
	enabledModels enabled_models enabled-models 'judge model' 'primary models' judgeModel; do
	printf '%s\n' "$pos" | grep -qiE "$PATTERNS" \
		|| fail "pattern self-test missed positive: $pos"
done
for neg in 'primary deliverable' 'default model prose' 'judgment call' default_model_id; do
	printf '%s\n' "$neg" | grep -qiE "$PATTERNS" \
		&& fail "pattern self-test matched negative: $neg"
done

# ── 1. No models.json override may exist anywhere in the scan roots ────────
SCAN_TMP0="$(mktemp -d)"
register_temp_dir "$SCAN_TMP0"
set +e
find -L "$REPO_ROOT/.pi" "$REPO_ROOT/.github" "$REPO_ROOT/.prism" "$REPO_ROOT/packages" \
	\( -path '*/node_modules' -o -path '*/dist' -o -path '*/vendor' -o -path '*/tests' -o -path '*/.git' \) -prune -o \
	-type f -name 'models.json' -print > "$SCAN_TMP0/list" 2>&1
MODELS_RC=$?
set -e
if [ "$MODELS_RC" -ne 0 ]; then
	fail "models.json scan errored: $(head -1 "$SCAN_TMP0/list")"
elif [ -s "$SCAN_TMP0/list" ]; then
	fail "models.json still exists — the primary/judge display overrides must be deleted (ADR-0067): $(head -1 "$SCAN_TMP0/list")"
else
	pass "no models.json in the scan roots"
fi

# ── 2. Living surfaces carry no model prescription ──────────────────────────
# Portable scan (no mapfile — bash 3.2 on macOS lacks it; see
# hook_portability_test.sh). One grep per file, one FAIL per file so the
# summary tally counts files, not lines. Fail closed: a missing scan root
# (wrong checkout shape) must not make the scan vacuously pass.
SCAN_ROOTS=("$REPO_ROOT/.pi" "$REPO_ROOT/.github" "$REPO_ROOT/.prism" "$REPO_ROOT/packages")
for root in "${SCAN_ROOTS[@]}"; do
	[ -d "$root" ] || fail "missing scan root: $root"
done
ROOT_FILES=(
	"$REPO_ROOT/settings.json"
	"$REPO_ROOT/AGENTS.md"
	"$REPO_ROOT/CONTEXT.md"
	"$REPO_ROOT/README.md"
	"$REPO_ROOT/CODING_HARNESS.md"
	"$REPO_ROOT/CONTRIBUTING.md"
	"$REPO_ROOT/NPM.md"
	"$REPO_ROOT/SECURITY.md"
)
for file in "${ROOT_FILES[@]}"; do
	[ -f "$file" ] || fail "missing scan target: $file"
done
# Fail closed: a find failure must not make the scan vacuously pass.
SCAN_TMP="$(mktemp -d)"
register_temp_dir "$SCAN_TMP"
SCAN_LIST="$SCAN_TMP/scan-list"
set +e
# Deny-list scan: every file under the roots is a living surface unless
# explicitly excluded — a future file type cannot evade the contract.
# Pruned dirs are not descended into.
find -L "${SCAN_ROOTS[@]}" \
	\( -path '*/node_modules' -o -path '*/dist' -o -path '*/vendor' -o -path '*/tests' -o -path '*/.git' \) -prune -o \
	-type f \
	-not -path '*/skills/websearch/search.sh' -not -path '*/skills/websearch/SKILL.md' \
	-not -name '*.lock' -not -name '*.min.js' -not -name '*.min.css' -not -name '*.map' \
	-not -name '*.png' -not -name '*.jpg' -not -name '*.jpeg' -not -name '*.gif' \
	-not -name '*.svg' -not -name '*.ico' -not -name '*.woff' -not -name '*.woff2' \
	-not -name '*.ttf' -not -name '*.eot' -not -name '*.pdf' \
	-print > "$SCAN_LIST" 2>&1
FIND_RC=$?
set -e
if [ "$FIND_RC" -ne 0 ]; then
	fail "scan find failed: $(head -1 "$SCAN_LIST")"
else
	printf '%s\n' "${ROOT_FILES[@]}" >> "$SCAN_LIST"
fi
FILES=()
while IFS= read -r f; do
	[ -n "$f" ] && FILES+=("$f")
done < "$SCAN_LIST"

VIOLATIONS=0
for f in "${FILES[@]}"; do
	[ -f "$f" ] || continue
	set +e
	MATCHES="$(grep -HnIiE -- "$PATTERNS" "$f" 2>&1)"
	GREP_RC=$?
	set -e
	if [ "$GREP_RC" -gt 1 ]; then
		VIOLATIONS=$((VIOLATIONS + 1))
		fail "scan error on $f: $(printf '%s' "$MATCHES" | head -1)"
		continue
	fi
	if [ "$GREP_RC" -eq 0 ]; then
		VIOLATIONS=$((VIOLATIONS + 1))
		fail "model prescription in $f"
		printf '%s\n' "$MATCHES" | head -5 >&2 || true
	fi
done

if [ "$VIOLATIONS" -eq 0 ] && ! grep -q "FAIL" "$RESULT_FILE"; then
	pass "no model prescription in living surfaces"
fi

print_summary "model_agnostic"









# vim: ft=sh sts=4 sw=4 ts=4 et :
