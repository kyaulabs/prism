#!/usr/bin/env bash
# $KYAULabs: check-skill-frontmatter.sh kyau@nova 2026/07/16 -0700 Exp $


# Validate skill SKILL.md frontmatter: require name + description, and
# name == directory basename. Reads each file from disk; the pre-commit hook
# checks out staged blobs to LINT_TMPDIR preserving the
# .opencode/skills/<name>/SKILL.md structure, so dirname derivation is correct
# (ADR-0015). Mirrors validate-harness.sh's skill rules so a missing/incorrect
# name field is caught at commit time, not in CI. See ADR-0025.
#
# Usage: check-skill-frontmatter.sh <file> [<file> ...]
# Exit: 0 if all valid, 1 if any violation.

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
PARSER="$REPO_ROOT/.github/scripts/frontmatter-parser.js"
FAILED=0

for file in "$@"; do
	[ -f "$file" ] || continue
	# Only validate skill SKILL.md files; ignore anything else.
	case "$file" in
		*/.opencode/skills/*/SKILL.md) ;;
		*) continue ;;
	esac
	dirname=$(basename "$(dirname "$file")")
	name=$(node "$PARSER" "$file" name 2>/dev/null || true)
	desc=$(node "$PARSER" "$file" description 2>/dev/null || true)
	if [ -z "$name" ]; then
		echo "✗ $file: missing or empty 'name' field in frontmatter" >&2
		FAILED=1
	elif [ "$name" != "$dirname" ]; then
		echo "✗ $file: name '$name' does not match directory '$dirname'" >&2
		FAILED=1
	fi
	if [ -z "$desc" ]; then
		echo "✗ $file: missing or empty 'description' field in frontmatter" >&2
		FAILED=1
	fi
done

exit "$FAILED"

# vim: ft=sh sts=4 sw=4 ts=4 et :
