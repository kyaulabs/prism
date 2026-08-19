#!/usr/bin/env bash
# $KYAULabs: pi_ci_contract_test.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# ── Pi-native CI contract (Task 11) ──────────────────────────────────────────
# The consolidated contract for .github/workflows/ci.yml. Replaces the legacy
# OpenCode-era per-concern CI tests: this file is authoritative.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

CI="$REPO_ROOT/.github/workflows/ci.yml"

if [ ! -f "$CI" ]; then
	fail "ci.yml is missing"
	print_summary "pi ci contract"
	exit 1
fi

failures=0
assert_ci_contains() {
	local pattern="$1" label="$2"
	if grep -qE -e "$pattern" "$CI"; then
		pass "$label"
	else
		fail "$label (missing $pattern in ci.yml)"
		failures=$((failures + 1))
	fi
}
assert_ci_not_contains() {
	local pattern="$1" label="$2"
	if grep -qE -e "$pattern" "$CI"; then
		fail "$label (forbidden $pattern found in ci.yml)"
		failures=$((failures + 1))
	else
		pass "$label"
	fi
}

echo "── checkout and push-event protection ──"
assert_ci_contains 'persist-credentials: false' 'checkout never persists credentials'
assert_ci_contains "if: github.event_name == 'push'" 'protected-push verification runs on push events'
assert_ci_contains 'verify-protected-push.sh' 'protected-push script is invoked'

echo "── runtime floors and pinning ──"
assert_ci_contains "php-version: '8.5'" 'PHP 8.5 is configured'
assert_ci_contains 'node-version:.*24' 'Node 24 satisfies the core engine floor'
assert_ci_contains '@earendil-works/pi-coding-agent@0.84.1' 'Pi is pinned to 0.84.1'

echo "── bounded external provisioning ──"
assert_ci_contains 'SEMGREP_RANGE.*1\.173\.0' 'Semgrep provisioning names the >=1.173.0 lower bound'
assert_ci_contains 'SEMGREP_RANGE.*2\.0\.0' 'Semgrep provisioning names the <2.0.0 ceiling'
assert_ci_contains 'open-code-review' 'OCR provisioning names the package'
assert_ci_contains 'OCR_RANGE.*1\.9\.1' 'OCR provisioning names the >=1.9.1 lower bound'
assert_ci_contains 'OCR_RANGE.*2\.0\.0' 'OCR provisioning names the <2.0.0 ceiling'
assert_ci_not_contains 'semgrep==[0-9]' 'Semgrep provisioning does not select a patch release'
assert_ci_not_contains 'open-code-review@[0-9]+\.[0-9]+\.[0-9]+' 'OCR provisioning does not select a patch release'
assert_ci_contains '--ignore-scripts' 'OCR npm installation disables lifecycle scripts'
assert_ci_not_contains 'ocr llm test' 'CI never runs the OCR connectivity test'
assert_ci_not_contains 'ocr review|ocr scan' 'CI never performs an OCR review'

echo "── locked, script-free dependency install ──"
assert_ci_contains 'composer install[^|]*--no-scripts' 'Composer install disables lifecycle scripts'
assert_ci_contains 'npm ci' 'npm installs from the committed lockfile'

echo "── mandatory local readiness before declared tools ──"
assert_ci_contains 'prism-tool.js doctor --local-only' 'local CLI doctor runs before declared tools'

echo "── verification surface ──"
assert_ci_contains 'npm run test:node|node --test' 'Node tests run'
assert_ci_contains 'composer test:shell|tests/Shell/.*_test\.sh' 'Shell regression tests run (composer test:shell or inline loop)'
assert_ci_contains 'validate-harness.sh' 'Harness validation runs'
assert_ci_contains 'npm pack' 'Package smoke packs archives'
assert_ci_contains 'composer audit|npm audit' 'Dependency audits run'
assert_ci_contains 'prism-tool.js run php-cs-fixer' 'Adapter lint runs through the launcher'
assert_ci_contains 'prism-tool.js run pest' 'Pest coverage runs through the launcher'
assert_ci_contains 'prism-tool.js run semgrep' 'Semgrep scan runs through the launcher'
assert_ci_contains 'prism-tool.js run commitlint' 'PR-range commitlint runs through the launcher'
assert_ci_contains 'prism-tool.js run playwright' 'Playwright Chromium installs through the launcher'
assert_ci_contains 'package-smoke' 'A package-smoke job exists'
assert_ci_contains 'macos-latest' 'Package smoke covers macOS'
assert_ci_contains 'ubuntu-latest' 'Jobs run on ubuntu-latest'
assert_ci_contains 'mktemp' 'Package smoke uses a temporary consumer project'

echo "── no direct declared-tool invocation after bootstrap ──"
assert_ci_not_contains 'npx (stylelint|eslint|commitlint|playwright)' 'No direct npx for declared tools'
assert_ci_not_contains 'vendor/bin/pest|vendor/bin/php-cs-fixer' 'No direct vendor/bin invocation'
assert_ci_not_contains 'git cliff' 'No direct git cliff invocation'

echo "── no legacy OpenCode-era surface ──"
assert_ci_not_contains '\.opencode|eval-agent|model-tier|quality-surface\.manifest' 'No OpenCode-era eval, tier, or retired manifest surface'

echo "── resilient tool downloads ──"
# Assumes one download invocation per line with the bound flags in canonical
# order (as ci.yml writes them); reordering or splitting flags across lines
# requires updating the BOUNDED pattern. Both counters are line-based
# (grep -c) so they stay comparable.

TOTAL_LINES=$(grep -c 'curl -fsSL' "$CI" || true)
BOUNDED_LINES=$(grep -cE 'curl -fsSL.*--connect-timeout 10([^0-9]|$).*--max-time 120([^0-9]|$).*--retry 3([^0-9]|$).*--retry-delay 2([^0-9]|$)' "$CI" || true)
if [ "$TOTAL_LINES" -eq 0 ]; then
	pass 'no curl -fsSL download lines present (nothing to bound)'
elif [ "$TOTAL_LINES" -eq "$BOUNDED_LINES" ]; then
	pass "every curl -fsSL download line is bounded ($BOUNDED_LINES of $TOTAL_LINES)"
else
	fail "unbounded curl -fsSL download line remains — total=$TOTAL_LINES bounded=$BOUNDED_LINES"
	failures=$((failures + 1))
fi

if [ "$failures" -gt 0 ]; then
	print_summary "pi ci contract"
	exit 1
fi
print_summary "pi ci contract"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
