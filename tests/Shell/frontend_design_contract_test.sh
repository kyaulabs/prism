#!/usr/bin/env bash
# $KYAULabs: frontend_design_contract_test.sh kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
FRONTEND="$REPO_ROOT/packages/prism-php-web/skills/frontend-design/SKILL.md"
ARCHITECTURE="$REPO_ROOT/packages/prism-php-web/skills/frontend-architecture/SKILL.md"
ACCESSIBILITY="$REPO_ROOT/packages/prism-php-web/skills/accessibility/SKILL.md"
TDD_PHP="$REPO_ROOT/packages/prism-php-web/skills/tdd-php/SKILL.md"
PEST_BROWSER="$REPO_ROOT/packages/prism-php-web/skills/pest-browser/SKILL.md"
CORE_AGENTS="$REPO_ROOT/packages/prism-core/AGENTS.md"
source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"

contains() {
	local file="$1" pattern="$2" message="$3"
	if grep -Fq -- "$pattern" "$file"; then pass "$message"; else fail "$message"; fi
}

not_contains() {
	local file="$1" pattern="$2" message="$3"
	if grep -Fiq -- "$pattern" "$file"; then fail "$message"; else pass "$message"; fi
}

printf '%s\n' '── user-authored frontend design contract ──'
contains "$FRONTEND" 'Load the `grilling` skill' 'frontend-design delegates interview mechanics to grilling'
contains "$FRONTEND" 'visual examples or inspiration' 'frontend-design asks for visual references'
contains "$FRONTEND" 'explicit dislikes' 'frontend-design asks what to avoid'
contains "$FRONTEND" 'palette and color-mode behavior' 'frontend-design asks the user for color decisions'
contains "$FRONTEND" 'typography' 'frontend-design asks the user for typography direction'
contains "$FRONTEND" 'target mobile and desktop viewports' 'frontend-design asks the user for viewport targets'
contains "$FRONTEND" 'visual reference or an equivalently detailed written brief' 'frontend-design has a visual-input start gate'
contains "$FRONTEND" 'never invents a fallback aesthetic' 'frontend-design fails closed on missing visual direction'
contains "$FRONTEND" 'WCAG 2.2 Level AA' 'frontend-design recommends the accessibility floor'
contains "$FRONTEND" 'Core Web Vitals' 'frontend-design recommends measurable performance goals'
not_contains "$FRONTEND" 'neumorph' 'frontend-design has no default design movement'
not_contains "$FRONTEND" 'sky blue' 'frontend-design has no sky-blue default'
not_contains "$FRONTEND" 'light purple' 'frontend-design has no purple default'
not_contains "$FRONTEND" '#38bdf8' 'frontend-design has no concrete accent token'
not_contains "$FRONTEND" 'default light/dark' 'frontend-design has no default color-mode policy'
contains "$ARCHITECTURE" 'project-defined semantic CSS custom properties' 'frontend architecture consumes project-defined tokens'
not_contains "$ARCHITECTURE" 'canonically by the `frontend-design` skill' 'frontend architecture no longer assigns token values to the skill'
not_contains "$ACCESSIBILITY" 'neumorph' 'accessibility is design-language-neutral'
contains "$ACCESSIBILITY" '24 × 24 CSS px' 'accessibility states the WCAG AA target-size minimum'
contains "$ACCESSIBILITY" '44 × 44 CSS px' 'accessibility retains stronger primary-touch guidance'
contains "$ACCESSIBILITY" 'stricter Prism recommendation' 'accessibility labels 44px guidance accurately'
contains "$TDD_PHP" 'Load `visual-review` after Green' 'frontend TDD loads visual review after behavior passes'
contains "$TDD_PHP" 'prism-tool run playwright -- test visual_review.spec.mjs --workers=1 --output tests/Browser/Screenshots/.playwright --reporter=line' 'frontend TDD uses the canonical capture command'
contains "$PEST_BROWSER" 'Visual design iteration belongs to `visual-review`' 'functional and subjective browser concerns stay separate'
contains "$CORE_AGENTS" '`visual-review`' 'the global catalogue advertises the adapter skill'

printf '\nfrontend_design_contract_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

# vim: ft=sh sts=4 sw=4 ts=4 et :
