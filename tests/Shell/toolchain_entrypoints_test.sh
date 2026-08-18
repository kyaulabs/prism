#!/usr/bin/env bash
# $KYAULabs: toolchain_entrypoints_test.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# ── Toolchain entrypoint contract (Task 9) ──────────────────────────────────
# Prompts, skills, and docs must route every declared tool through the
# prism-tool launcher, preserve the consent cadence (network, mutation, OCR
# connectivity, code egress as separate approvals), and never invoke declared
# tools directly or treat OCR as optional.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

CORE_PROMPTS="$REPO_ROOT/packages/prism-core/prompts"
CORE_SKILLS="$REPO_ROOT/packages/prism-core/skills"
ADAPTER_PROMPTS="$REPO_ROOT/packages/prism-php-web/prompts"
ADAPTER_SKILLS="$REPO_ROOT/packages/prism-php-web/skills"
ADAPTER_DOCS="$REPO_ROOT/packages/prism-php-web/docs"

failures=0
assert_file_contains() {
	local file="$1" pattern="$2" label="$3"
	if grep -qE -e "$pattern" "$file"; then
		pass "$label"
	else
		fail "$label (missing pattern $pattern in $file)"
		failures=$((failures + 1))
	fi
}
assert_file_not_contains() {
	local file="$1" pattern="$2" label="$3"
	if grep -qE -e "$pattern" "$file"; then
		fail "$label (found forbidden pattern $pattern in $file)"
		failures=$((failures + 1))
	else
		pass "$label"
	fi
}

echo "── /setup consent and apply/verify sequence ──"
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup resolve' 'setup runs setup resolve'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup apply' 'setup runs setup apply'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup verify' 'setup runs setup verify'
assert_file_contains "$CORE_PROMPTS/setup.md" '--network-approved=yes' 'setup requires exact registry approval'
assert_file_contains "$CORE_PROMPTS/setup.md" '--approval=yes' 'setup requires literal yes mutation approval'
assert_file_contains "$CORE_PROMPTS/setup.md" '--ocr-test-approved=yes' 'setup requires exact OCR-connectivity approval'
assert_file_contains "$CORE_PROMPTS/setup.md" 'one question at a time' 'setup asks one question per turn'
assert_file_contains "$CORE_PROMPTS/setup.md" 'candidate diff|diff' 'setup displays the candidate diff before apply'

echo "── /doctor OCR-connectivity gate ──"
assert_file_contains "$CORE_PROMPTS/doctor.md" '--local-only' 'doctor supports local-only mode'
assert_file_contains "$CORE_PROMPTS/doctor.md" '--ocr-test-approved=yes' 'doctor passes exact OCR-connectivity approval'
assert_file_contains "$CORE_PROMPTS/doctor.md" 'connectivity' 'doctor asks an OCR-connectivity question'

echo "── local-only readiness on /check, /pr, and release ──"
assert_file_contains "$CORE_PROMPTS/check.md" 'prism-tool doctor --local-only' 'check performs local-only readiness'
assert_file_contains "$CORE_PROMPTS/pr.md" 'doctor --local-only' 'pr performs local-only readiness'
assert_file_contains "$CORE_PROMPTS/pr.md" 'run commitlint -- --edit' 'pr validates titles through commitlint launcher'
assert_file_contains "$CORE_PROMPTS/release.md" 'prism-tool doctor --local-only' 'release performs local-only readiness'
assert_file_contains "$CORE_PROMPTS/release.md" 'prism-tool run git-cliff' 'release uses bundled git-cliff through the launcher'

echo "── /security scans through the launcher ──"
assert_file_contains "$CORE_PROMPTS/security.md" 'prism-tool run semgrep' 'security runs Semgrep through the launcher'

echo "── code-review OCR consent: live test then separate egress ──"
assert_file_contains "$CORE_SKILLS/code-review/SKILL.md" '--ocr-test-approved=yes' 'code-review performs an approved live OCR test'
assert_file_contains "$CORE_SKILLS/code-review/SKILL.md" '--code-egress-approved=yes' 'code-review asks separate code-egress approval'
assert_file_contains "$CORE_SKILLS/code-review/SKILL.md" 'prism-tool run ocr' 'code-review runs OCR through the launcher'
assert_file_not_contains "$CORE_SKILLS/code-review/SKILL.md" 'optional.*[Oo]cr|OCR.*optional|SKIPPED.*OCR' 'code-review treats OCR as mandatory, not optional'

echo "── adapter checks/build use declared tool IDs ──"
assert_file_contains "$ADAPTER_PROMPTS/check-php.md" 'prism-tool run php-cs-fixer -- fix --dry-run --diff' 'check-php runs php-cs-fixer through the launcher'
assert_file_contains "$ADAPTER_PROMPTS/check-php.md" 'prism-tool run stylelint --' 'check-php runs stylelint through the launcher'
assert_file_contains "$ADAPTER_PROMPTS/check-php.md" 'prism-tool run eslint --' 'check-php runs eslint through the launcher'
assert_file_contains "$ADAPTER_PROMPTS/check-php.md" 'prism-tool run pest -- --coverage' 'check-php runs pest through the launcher'
assert_file_contains "$ADAPTER_PROMPTS/build-assets.md" 'prism-tool run sass --' 'build-assets runs sass through the launcher'
assert_file_contains "$ADAPTER_PROMPTS/build-assets.md" 'prism-tool run uglify-js --' 'build-assets runs uglify-js through the launcher'
assert_file_contains "$ADAPTER_SKILLS/tdd-php/SKILL.md" 'prism-tool run pest -- --coverage' 'tdd-php runs pest through the launcher'
assert_file_contains "$ADAPTER_SKILLS/tdd-php/SKILL.md" 'prism-tool run php-cs-fixer -- fix --dry-run --diff' 'tdd-php runs php-cs-fixer through the launcher'
assert_file_contains "$ADAPTER_SKILLS/tdd-php/SKILL.md" 'prism-tool run stylelint --' 'tdd-php runs stylelint through the launcher'
assert_file_contains "$ADAPTER_SKILLS/tdd-php/SKILL.md" 'prism-tool run eslint --' 'tdd-php runs eslint through the launcher'
assert_file_contains "$ADAPTER_SKILLS/pest-browser/SKILL.md" 'prism-tool run playwright -- install chromium' 'pest-browser installs only the Chromium target'
assert_file_contains "$ADAPTER_SKILLS/scss-mobile-first/SKILL.md" 'prism-tool run stylelint --' 'scss-mobile-first runs stylelint through the launcher'
assert_file_contains "$ADAPTER_SKILLS/scss-mobile-first/SKILL.md" 'prism-tool run sass --' 'scss-mobile-first compiles sass through the launcher'
assert_file_not_contains "$ADAPTER_DOCS/tests.md" 'vendor/bin/pest' 'adapter test doc never invokes pest directly'

echo "── hooks perform local-only readiness ──"
assert_file_contains "$REPO_ROOT/.github/hooks/pre-commit" 'doctor --local-only' 'pre-commit runs local doctor'
assert_file_contains "$REPO_ROOT/.github/hooks/pre-push" 'doctor --local-only' 'pre-push runs local doctor'
assert_file_contains "$REPO_ROOT/.github/hooks/commit-msg" 'doctor --local-only' 'commit-msg runs local doctor'

echo "── stale direct-invocation scan across active resources ──"
STALE_SCAN_DIRS=("$CORE_PROMPTS" "$CORE_SKILLS" "$ADAPTER_PROMPTS" "$ADAPTER_SKILLS" "$ADAPTER_DOCS")
stale_found=0
for dir in "${STALE_SCAN_DIRS[@]}"; do
	[ -d "$dir" ] || continue
	if grep -rnE '(^|[[:space:]])npx (stylelint|eslint|commitlint|playwright)($|[[:space:]])' "$dir" 2>/dev/null; then
		stale_found=1
	fi
	if grep -rnF 'vendor/bin/pest' "$dir" 2>/dev/null; then
		stale_found=1
	fi
	if grep -rnF 'vendor/bin/php-cs-fixer' "$dir" 2>/dev/null; then
		stale_found=1
	fi
	if grep -rnF 'git cliff' "$dir" 2>/dev/null; then
		stale_found=1
	fi
	if grep -rnF 'command -v ocr' "$dir" 2>/dev/null; then
		stale_found=1
	fi
	if grep -rniE 'optional.*[Oo]cr|OCR.*optional|SKIPPED.*[Oo]cr|OCR.*SKIPPED' "$dir" 2>/dev/null; then
		stale_found=1
	fi
done
if [ "$stale_found" -eq 0 ]; then
	pass 'no direct declared-tool invocation or optional-OCR wording in active resources'
else
	fail 'active resources contain direct declared-tool invocation or optional-OCR wording'
fi

if [ "$failures" -gt 0 ]; then
	print_summary "toolchain entrypoints"
	exit 1
fi
print_summary "toolchain entrypoints"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
