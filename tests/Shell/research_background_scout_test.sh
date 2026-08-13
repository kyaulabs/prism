#!/usr/bin/env bash
# $KYAULabs: research_background_scout_test.sh kyau@aura.kyaulabs 2026/08/12 -0700 Exp $



set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
PROMPT="$REPO_ROOT/packages/prism-core/prompts/research.md"
SKILL="$REPO_ROOT/packages/prism-core/skills/research-background/SKILL.md"
PASS=0
FAIL=0

pass() { printf '  PASS %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL %s\n' "$1" >&2; FAIL=$((FAIL + 1)); }

printf '%s\n' '── research background contract under pi ──'
[ -f "$PROMPT" ] && pass 'research prompt exists' || fail 'research prompt missing'
[ -f "$SKILL" ] && pass 'research-background skill exists' || fail 'research-background skill missing'
if grep -q -- '--background' "$PROMPT" && grep -q 'human-started pi session' "$PROMPT"; then
	pass 'background flag prepares a separate-session brief'
else
	fail 'background flag contract missing'
fi
if grep -q 'Do not spawn another process' "$PROMPT" && grep -q 'Do not spawn another agent process' "$SKILL"; then
	pass 'autonomous sub-agent dispatch is forbidden'
else
	fail 'no-sub-agent guard missing'
fi
if grep -q '`websearch`' "$PROMPT" && grep -q '`searxng`' "$PROMPT"; then
	pass 'research routes current web work through CLI-shell skills'
else
	fail 'search skills not referenced'
fi
if grep -q 'untrusted' "$PROMPT" && grep -q 'explicit permission' "$PROMPT"; then
	pass 'external-data and network permission gates present'
else
	fail 'research safety gates missing'
fi
if grep -q 'OPENCODE_' "$PROMPT" || grep -q 'prism.jsonc' "$PROMPT"; then
	fail 'legacy env/manifest flags remain'
else
	pass 'legacy env/manifest flags removed'
fi

printf '\nresearch_background_scout_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]



# vim: ft=sh sts=4 sw=4 ts=4 et :
