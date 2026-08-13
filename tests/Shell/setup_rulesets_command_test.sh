#!/usr/bin/env bash
# $KYAULabs: setup_rulesets_command_test.sh kyau@aura.kyaulabs 2026/08/12 -0700 Exp $





set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
PROMPT="$REPO_ROOT/packages/prism-core/prompts/setup-rulesets.md"
PASS=0
FAIL=0

pass() { printf '  PASS %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL %s\n' "$1" >&2; FAIL=$((FAIL + 1)); }

printf '%s\n' '── setup-rulesets pi prompt template ──'
[ -f "$PROMPT" ] && pass 'prompt exists' || fail 'prompt missing'
if head -10 "$PROMPT" | grep -q '^description:'; then pass 'description present'; else fail 'description missing'; fi
if head -10 "$PROMPT" | grep -qE '^(agent|subtask|mode|permission):'; then fail 'opencode-only frontmatter remains'; else pass 'pi frontmatter only'; fi
for marker in --dry-run --apply --check 'yes/no' untrusted 'packages/prism-core/scripts/setup-rulesets.sh'; do
	if grep -q -- "$marker" "$PROMPT"; then pass "$marker present"; else fail "$marker missing"; fi
done
if grep -q 'kyaulabs/prism' "$PROMPT"; then fail 'repository is hard-coded'; else pass 'repository is detected dynamically'; fi

printf '\nsetup_rulesets_command_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]





# vim: ft=sh sts=4 sw=4 ts=4 et :
