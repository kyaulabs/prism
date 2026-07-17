#!/usr/bin/env bash
# $KYAULabs: check_skill_frontmatter_test.sh kyau@nova 2026/07/16 -0700 Exp $


# check_skill_frontmatter_test.sh — verifies check-skill-frontmatter.sh enforces
# the skill frontmatter contract (name + description, name==dir).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file
CHK="$REPO_ROOT/.github/scripts/check-skill-frontmatter.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# good skill
mkdir -p "$WORK/.opencode/skills/good"
printf -- '---\nname: good\ndescription: ok\n---\n' > "$WORK/.opencode/skills/good/SKILL.md"
if bash "$CHK" "$WORK/.opencode/skills/good/SKILL.md" >/dev/null 2>&1; then
	pass "valid skill passes"
else
	fail "valid skill was rejected"
fi

# missing name
mkdir -p "$WORK/.opencode/skills/noname"
printf -- '---\ndescription: ok\n---\n' > "$WORK/.opencode/skills/noname/SKILL.md"
if ! bash "$CHK" "$WORK/.opencode/skills/noname/SKILL.md" >/dev/null 2>&1; then
	pass "missing name rejected"
else
	fail "missing name was accepted"
fi

# name != dir
mkdir -p "$WORK/.opencode/skills/mismatch"
printf -- '---\nname: other\ndescription: ok\n---\n' > "$WORK/.opencode/skills/mismatch/SKILL.md"
if ! bash "$CHK" "$WORK/.opencode/skills/mismatch/SKILL.md" >/dev/null 2>&1; then
	pass "name!=dir rejected"
else
	fail "name!=dir was accepted"
fi

# missing description
mkdir -p "$WORK/.opencode/skills/nodesc"
printf -- '---\nname: nodesc\n---\n' > "$WORK/.opencode/skills/nodesc/SKILL.md"
if ! bash "$CHK" "$WORK/.opencode/skills/nodesc/SKILL.md" >/dev/null 2>&1; then
	pass "missing description rejected"
else
	fail "missing description was accepted"
fi

print_summary "check_skill_frontmatter"

# vim: ft=sh sts=4 sw=4 ts=4 et :
