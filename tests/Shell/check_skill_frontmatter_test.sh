#!/usr/bin/env bash
# $KYAULabs: check_skill_frontmatter_test.sh kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
VALIDATOR="$REPO_ROOT/packages/prism-core/scripts/validate-harness.sh"
PARSER="$REPO_ROOT/packages/prism-core/scripts/frontmatter-parser.js"
source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"

if ! command -v node >/dev/null 2>&1 || ! command -v pi >/dev/null 2>&1 \
	|| ! node -e "require('js-yaml')" 2>/dev/null; then
	skip "node + pi + js-yaml required (run: pnpm install)"
	exit 0
fi

printf '%s\n' '── pi skill frontmatter contract ──'
if grep -q "does not match directory" "$VALIDATOR"; then pass 'name-directory parity enforced'; else fail 'name-directory parity missing'; fi
if grep -q 'missing or empty name' "$VALIDATOR"; then pass 'name required'; else fail 'name requirement missing'; fi
if grep -q 'missing or empty description' "$VALIDATOR"; then pass 'description required'; else fail 'description requirement missing'; fi
if grep -q 'invalid skill name' "$VALIDATOR"; then pass 'pi name grammar enforced'; else fail 'pi name grammar missing'; fi
if [ -f "$PARSER" ]; then pass 'frontmatter parser moved into prism-core'; else fail 'frontmatter parser missing'; fi
if bash "$VALIDATOR" >/dev/null; then pass 'real skills satisfy contract'; else fail 'real skills fail contract'; fi

review_skills=(
	prism-review-session
	prism-review-tooling-style
	prism-review-structural-smells
	prism-review-requirement-coverage
	prism-review-static-security
	prism-review-verifier
	prism-review-readability
	prism-review-duplication
	prism-review-error-handling
	prism-review-authorization
	prism-review-input-validation
	prism-review-differential
	prism-review-spec-compliance
	prism-review-false-positive-check
)
adapted_skills=(
	prism-review-readability
	prism-review-duplication
	prism-review-error-handling
	prism-review-authorization
	prism-review-input-validation
	prism-review-differential
	prism-review-spec-compliance
	prism-review-false-positive-check
)
for skill in "${review_skills[@]}"; do
	file="$REPO_ROOT/packages/prism-core/skills/$skill/SKILL.md"
	if [ -f "$file" ] \
		&& [ "$(node "$PARSER" "$file" name)" = "$skill" ] \
		&& [[ "$(node "$PARSER" "$file" description)" == *'Use when'* ]] \
		&& grep -qFx '## Rules' "$file" \
		&& [ "$(grep '^## ' "$file" | tail -1)" = '## Gotchas' ]; then
		pass "$skill has the closed review-skill shape"
	else
		fail "$skill does not have the closed review-skill shape"
	fi
done
for skill in "${adapted_skills[@]}"; do
	file="$REPO_ROOT/packages/prism-core/skills/$skill/SKILL.md"
	if grep -q '^derived-from:' "$file" 2>/dev/null && grep -qFx '## Upstream' "$file" 2>/dev/null; then
		pass "$skill retains adaptation provenance"
	else
		fail "$skill is missing adaptation provenance"
	fi
done

printf '\ncheck_skill_frontmatter_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

# vim: ft=sh sts=4 sw=4 ts=4 et :
