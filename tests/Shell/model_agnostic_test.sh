#!/usr/bin/env bash
# $KYAULabs: model_agnostic_test.sh kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

# model_agnostic_test.sh — contract test for the model-agnostic harness
# (ADR-0067). Asserts no living harness surface names, pins, restricts, or
# prescribes a model or thinking level. Exempt: historical records (adr/,
# docs/, CHANGELOG.md, NOTICE) and tests/ (OCR fixtures are arbitrary test data).
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

# Banned tokens: model-prescription surfaces.
# Deliberate asymmetry: the four pi config keys match camelCase/kebab/snake
# forms only — spaced prose ("default model") is ordinary English and is
# intentionally exempt; the (judge|primary) branch allows a space because
# those phrases are prescription even in prose. Trailing ([^a-z]|$) keeps
# every alternative from matching inside unrelated identifiers.
PATTERNS='deepseek-v4([^a-z_]|$)|deepseek/deepseek-v4([^a-z_]|$)|default[-_]?models?([^a-z_]|$)|default[-_]?providers?([^a-z_]|$)|default[-_]?thinking[-_]?levels?([^a-z_]|$)|enabled[-_]?models?([^a-z_]|$)|(judge|primary)[-_ ]?models?([^a-z_]|$)'

# ── 0. Pattern self-test (the ADR-0067 guarantee rides on this regex) ─────
for pos in \
	'deepseek-v4-flash' 'deepseek/deepseek-v4-pro' \
	defaultModel default_model default-model defaultModels default_providers default-thinking-levels \
	'defaultProvider": "x' defaultThinkingLevel default-thinking-level default-provider \
	enabledModels enabled_models enabled-models \
	'judge model' judge-model judge_model judgeModel \
	'primary models' primary-model primary_model primaryModel; do
	printf '%s\n' "$pos" | grep -qiE "$PATTERNS" \
		|| fail "pattern self-test missed positive: $pos"
done
for neg in 'primary deliverable' 'default model prose' 'judgment call' default_model_id defaultModelId; do
	printf '%s\n' "$neg" | grep -qiE "$PATTERNS" \
		&& fail "pattern self-test matched negative: $neg"
done

# ── 1. No models.json override may exist anywhere in the scan roots ────────
SCAN_TMP0="$(mktemp -d)"
register_temp_dir "$SCAN_TMP0"
set +e
find "$REPO_ROOT" \
	\( -path '*/node_modules' -o -path '*/dist' -o -path '*/vendor' -o -path '*/tests' -o -path '*/.git' -o -path '*/aurora' \
	-o -path "$REPO_ROOT/adr" -o -path "$REPO_ROOT/docs" -o -path "$REPO_ROOT/audits" -o -path "$REPO_ROOT/prototypes" \
	-o -path "$REPO_ROOT/build" -o -path "$REPO_ROOT/graphify-out" \) -prune -o \
	-type f \
	-not -path "$REPO_ROOT/CHANGELOG.md" \
	\( -iname 'models.json' -o -iname 'models-store.json' \) -print > "$SCAN_TMP0/list" 2> "$SCAN_TMP0/find.err"
MODELS_RC=$?
set -e
if [ "$MODELS_RC" -ne 0 ] || [ -s "$SCAN_TMP0/find.err" ]; then
	fail "models.json scan errored: $(head -1 "$SCAN_TMP0/find.err")"
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
# The whole repo root is the surface; historical records (adr/, docs/,
# CHANGELOG.md) and non-living trees are pruned, so no root-level file
# type can evade the contract.
SCAN_ROOTS=("$REPO_ROOT")
[ -d "$REPO_ROOT" ] || fail "missing scan root: $REPO_ROOT"
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
# Deny-list scan: every file under the root is a living surface unless
# explicitly excluded — a future file type cannot evade the contract.
# Pruned dirs are not descended into (non-living trees plus the
# historical records adr/, docs/, CHANGELOG.md). Symlinks are not
# followed: a link pointing outside the repo must never be scanned.
find "${SCAN_ROOTS[@]}" \
	\( -path '*/node_modules' -o -path '*/dist' -o -path '*/vendor' -o -path '*/tests' -o -path '*/.git' \
	-o -path '*/aurora' -o -path "$REPO_ROOT/adr" -o -path "$REPO_ROOT/docs" -o -path "$REPO_ROOT/audits" \
	-o -path "$REPO_ROOT/prototypes" -o -path "$REPO_ROOT/build" -o -path "$REPO_ROOT/graphify-out" \) -prune -o \
	-type f \
	-not -path "$REPO_ROOT/CHANGELOG.md" \
	-not -name '*.lock' -not -name 'package-lock.json' -not -name 'pnpm-lock.yaml' -not -name 'composer.lock' \
	-not -name '*.min.js' -not -name '*.min.css' -not -name '*.map' \
	-not -name '*.png' -not -name '*.jpg' -not -name '*.jpeg' -not -name '*.gif' \
	-not -name '*.svg' -not -name '*.ico' -not -name '*.woff' -not -name '*.woff2' \
	-not -name '*.ttf' -not -name '*.eot' -not -name '*.pdf' \
	-print > "$SCAN_LIST" 2> "$SCAN_TMP/find.err"
FIND_RC=$?
set -e
if [ "$FIND_RC" -ne 0 ] || [ -s "$SCAN_TMP/find.err" ]; then
	fail "scan find failed: $(head -1 "$SCAN_TMP/find.err")"
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
