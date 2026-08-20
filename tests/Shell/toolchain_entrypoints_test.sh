#!/usr/bin/env bash
# $KYAULabs: toolchain_entrypoints_test.sh kyau@aura.kyaulabs 2026/08/19 -0700 Exp $

# ── Toolchain entrypoint contract (Task 9) ──────────────────────────────────
# Prompts, skills, and docs must route every declared tool through the
# prism-tool launcher, preserve standing OCR consent, atomic commits, and
# dedicated review boundaries, and never invoke declared tools directly or
# treat OCR as optional.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

CORE_PROMPTS="$REPO_ROOT/packages/prism-core/prompts"
CORE_SKILLS="$REPO_ROOT/packages/prism-core/skills"
ADAPTER_PROMPTS="$REPO_ROOT/packages/prism-php-web/prompts"
ADAPTER_SKILLS="$REPO_ROOT/packages/prism-php-web/skills"
ADAPTER_DOCS="$REPO_ROOT/packages/prism-php-web/docs"
PR_TOOL="$REPO_ROOT/packages/prism-core/scripts/prism-tool/pr.js"

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

echo "── /setup standing consent and apply/verify sequence ──"
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup resolve' 'setup runs setup resolve'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup apply' 'setup runs setup apply'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup verify' 'setup runs setup verify'
assert_file_contains "$CORE_PROMPTS/setup.md" '--network-approved=yes' 'setup requires exact registry approval'
assert_file_contains "$CORE_PROMPTS/setup.md" '--approval=yes' 'setup requires literal yes mutation approval'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool consent status --json' 'setup inspects standing OCR consent'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool consent grant-ocr --approval=yes' 'setup grants standing OCR consent once'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool consent revoke-ocr' 'setup documents standing consent revocation'
assert_file_contains "$CORE_PROMPTS/setup.md" 'one question at a time' 'setup asks one question per turn'
assert_file_contains "$CORE_PROMPTS/setup.md" 'candidate diff|diff' 'setup displays the candidate diff before apply'

CONSENT_SCAN_PATHS=(
	"$CORE_PROMPTS"
	"$CORE_SKILLS"
	"$ADAPTER_PROMPTS"
	"$ADAPTER_SKILLS"
	"$ADAPTER_DOCS"
	"$REPO_ROOT/packages/prism-core/AGENTS.md"
	"$REPO_ROOT/packages/prism-core/README.md"
	"$REPO_ROOT/README.md"
	"$REPO_ROOT/CODING_HARNESS.md"
	"$REPO_ROOT/CONTRIBUTING.md"
)
consent_prompt_count=$({ grep -RiohE 'Grant standing OCR consent.*\(yes/no\)' \
	"${CONSENT_SCAN_PATHS[@]}" || true; } | wc -l | tr -d ' ')
if [ "$consent_prompt_count" -eq 1 ] && grep -qiE 'Grant standing OCR consent.*\(yes/no\)' "$CORE_PROMPTS/setup.md"; then
	pass '/setup is the sole standing OCR-consent prompt'
else
	fail "/setup is not the sole standing OCR-consent prompt (count=$consent_prompt_count)"
	failures=$((failures + 1))
fi

echo "── /doctor standing-consent readiness ──"
assert_file_contains "$CORE_PROMPTS/doctor.md" 'prism-tool doctor' 'full doctor uses the launcher without an approval flag'
assert_file_contains "$CORE_PROMPTS/doctor.md" 'standing-consent|standing consent' 'full doctor requires standing OCR consent'
assert_file_not_contains "$CORE_PROMPTS/doctor.md" '--ocr-test-approved' 'doctor has no per-run OCR approval flag'
assert_file_not_contains "$CORE_PROMPTS/doctor.md" '\(yes/no\)' 'doctor never asks for OCR consent'
assert_file_contains "$REPO_ROOT/packages/prism-core/scripts/install-global.sh" 'doctor --local-only' 'installer performs local-only readiness'
assert_file_contains "$REPO_ROOT/packages/prism-core/scripts/install-global.sh" 'Run /setup' 'installer directs the human to /setup'
assert_file_not_contains "$REPO_ROOT/packages/prism-core/scripts/install-global.sh" 'grant-ocr|--ocr-test-approved' 'installer neither grants nor requests OCR consent'

echo "── local-only readiness on /check, /pr, and release ──"
assert_file_contains "$CORE_PROMPTS/check.md" 'prism-tool doctor --local-only' 'check performs local-only readiness'
assert_file_contains "$CORE_PROMPTS/pr.md" 'prism-tool pr preflight' 'pr delegates preflight to the launcher'
assert_file_contains "$CORE_PROMPTS/pr.md" 'prism-tool pr validate-title' 'pr delegates title validation to the launcher'
assert_file_contains "$PR_TOOL" "'doctor', '--local-only'" 'pr launcher operation performs local-only readiness'
assert_file_contains "$PR_TOOL" "'commitlint'" 'pr launcher operation validates titles through commitlint'
assert_file_contains "$CORE_PROMPTS/release.md" 'prism-tool doctor --local-only' 'release performs local-only readiness'
assert_file_contains "$CORE_PROMPTS/release.md" 'prism-tool run git-cliff' 'release uses bundled git-cliff through the launcher'

assert_file_contains "$CORE_SKILLS/conventional-commits/SKILL.md" 'prism-tool commit create' 'conventional-commits creates atomically through the launcher'
assert_file_contains "$CORE_SKILLS/conventional-commits/SKILL.md" 'only tool call in its assistant batch' 'commit creation is exclusive'
assert_file_contains "$CORE_SKILLS/conventional-commits/SKILL.md" '/reload' 'commit failure documents fatal recovery'
assert_file_not_contains "$CORE_SKILLS/conventional-commits/SKILL.md" '\$\(' 'conventional-commits avoids command substitution blocked by the safety extension'

echo "── /security scans through the launcher ──"
assert_file_contains "$CORE_PROMPTS/security.md" 'prism-tool run semgrep' 'security runs Semgrep through the launcher'

echo "── code-review uses standing consent and the dedicated OCR boundary ──"
assert_file_contains "$CORE_SKILLS/code-review/SKILL.md" 'Standing OCR consent' 'code-review relies on global standing consent'
assert_file_contains "$CORE_SKILLS/code-review/SKILL.md" 'prism-tool code-review ocr' 'code-review uses the dedicated OCR operation'
assert_file_not_contains "$CORE_SKILLS/code-review/SKILL.md" '--ocr-test-approved|--code-egress-approved' 'code-review has no per-run approval flags'
assert_file_not_contains "$CORE_SKILLS/code-review/SKILL.md" 'prism-tool run ocr' 'code-review cannot use generic OCR passthrough'
assert_file_not_contains "$CORE_SKILLS/code-review/SKILL.md" 'optional.*[Oo]cr|OCR.*optional|SKIPPED.*OCR' 'code-review treats OCR as mandatory, not optional'

echo "── adapter checks/build use declared tool IDs ──"
assert_file_contains "$ADAPTER_PROMPTS/check-php.md" 'prism-tool run php-cs-fixer -- fix --dry-run --diff' 'check-php runs php-cs-fixer through the launcher'
assert_file_contains "$ADAPTER_PROMPTS/check-php.md" 'prism-tool run stylelint --' 'check-php runs stylelint through the launcher'
assert_file_contains "$ADAPTER_PROMPTS/check-php.md" 'prism-tool run eslint --' 'check-php runs eslint through the launcher'
assert_file_contains "$ADAPTER_PROMPTS/check-php.md" 'prism-tool run pest -- --coverage' 'check-php runs pest through the launcher'
assert_file_not_contains "$ADAPTER_PROMPTS/check-php.md" '\$\(' 'check-php avoids command substitution blocked by the safety extension'
assert_file_not_contains "$ADAPTER_PROMPTS/check-php.md" 'mktemp' 'check-php uses project-local temp files instead of mktemp'
assert_file_not_contains "$ADAPTER_PROMPTS/check-php.md" '\btrap\b' 'check-php avoids deferred-execution builtins blocked by the safety extension'
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

echo "── user-facing approval-free workflow documentation ──"
for doc in \
	"$REPO_ROOT/packages/prism-core/README.md" \
	"$REPO_ROOT/README.md" \
	"$REPO_ROOT/CODING_HARNESS.md"; do
	assert_file_contains "$doc" 'standing OCR consent' "$doc documents standing OCR consent"
	assert_file_contains "$doc" 'consent revoke-ocr' "$doc documents consent revocation"
	assert_file_contains "$doc" 'prism-tool commit create' "$doc documents atomic commit creation"
	assert_file_contains "$doc" '/reload' "$doc documents fatal commit recovery"
	assert_file_contains "$doc" 'fresh finalization acceptance' "$doc documents one-attempt finalization recovery"
done
assert_file_contains "$REPO_ROOT/CONTRIBUTING.md" 'prism-tool commit create' 'CONTRIBUTING documents atomic signed commits'
assert_file_contains "$REPO_ROOT/CONTRIBUTING.md" 'finalization acceptance' 'CONTRIBUTING documents automatic finalization'
assert_file_contains "$REPO_ROOT/CONTRIBUTING.md" 'Humans push work branches and merge pull requests' 'CONTRIBUTING preserves human-only publication'

echo "── stale workflow scan across active resources ──"
STALE_SCAN_PATHS=(
	"$CORE_PROMPTS"
	"$CORE_SKILLS"
	"$ADAPTER_PROMPTS"
	"$ADAPTER_SKILLS"
	"$ADAPTER_DOCS"
	"$REPO_ROOT/packages/prism-core/AGENTS.md"
	"$REPO_ROOT/packages/prism-core/APPEND_SYSTEM.md"
	"$REPO_ROOT/packages/prism-core/README.md"
	"$REPO_ROOT/AGENTS.md"
	"$REPO_ROOT/README.md"
	"$REPO_ROOT/CODING_HARNESS.md"
	"$REPO_ROOT/CONTRIBUTING.md"
	"$REPO_ROOT/.github/hooks"
)
stale_found=0
for candidate in "${STALE_SCAN_PATHS[@]}"; do
	[ -e "$candidate" ] || continue
	if grep -rnE '(^|[[:space:]])npx (stylelint|eslint|commitlint|playwright)($|[[:space:]])' "$candidate" 2>/dev/null; then
		stale_found=1
	fi
	for forbidden in \
		'vendor/bin/pest' \
		'vendor/bin/php-cs-fixer' \
		'git cliff' \
		'command -v ocr' \
		'--ocr-test-approved' \
		'--code-egress-approved' \
		'prism-tool run ocr' \
		'prism-tool commit prepare' \
		'prism-tool commit apply' \
		'prism-tool commit discard'; do
		if grep -rnF -- "$forbidden" "$candidate" 2>/dev/null; then
			stale_found=1
		fi
	done
	if grep -rniE 'optional.*[Oo]cr|OCR.*optional|SKIPPED.*[Oo]cr|OCR.*SKIPPED' "$candidate" 2>/dev/null; then
		stale_found=1
	fi
done
if [ "$stale_found" -eq 0 ]; then
	pass 'active resources contain no retired approvals, generic OCR, old commits, or direct declared-tool invocation'
else
	fail 'active resources contain a retired workflow or direct declared-tool invocation'
	failures=$((failures + 1))
fi

if [ "$failures" -gt 0 ]; then
	print_summary "toolchain entrypoints"
	exit 1
fi
print_summary "toolchain entrypoints"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
