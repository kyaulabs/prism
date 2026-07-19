#!/usr/bin/env bash
# $KYAULabs: setup-substitute.sh kyau@nova 2026/07/19 -0700 Exp $




# ── Template token substitution script for /setup ───────────────────────────
# Replaces the template's scaffolding placeholder tokens with user-provided
# values in a single file. Identity tokens are resolved at runtime by
# resolve-identity.sh and are no longer substituted here.
#
# Usage: setup-substitute.sh <file> <app> <domain> <org> <repo>
#
# Token ordering: abuse contact fires before domain placeholder to avoid
# partial-match corruption. See adr/0007-setup-token-strategy.md for the
# design rationale.

set -euo pipefail

# Parse leading optional flags (--target-dir <dir>) before positionals.
TARGET_DIR=""
while [ $# -gt 0 ]; do
	case "$1" in
		--target-dir)
			[ $# -ge 2 ] || { echo "Error: --target-dir requires an argument" >&2; exit 2; }
			TARGET_DIR="$2"
			shift 2
			;;
		--)
			shift
			break
			;;
		*)
			break
			;;
	esac
done

# Portable in-place sed edit: works on GNU sed and BSD sed (no -i flag).
sed_edit() {
	local expr="$1" file="$2"
	sed "$expr" "$file" > "$file.tmp.$$" && mv "$file.tmp.$$" "$file"
}

file="${1:?Error: file path required}"
app="${2:?Error: app name required}"
domain="${3:?Error: domain required}"
org="${4:?Error: GitHub org required}"
repo="${5:?Error: GitHub repo required}"

# Auto-detect username from git config for <username> token (branch names, etc.)
username=$(git config user.name 2>/dev/null || echo "developer")

if [ -n "$TARGET_DIR" ]; then
	file="$TARGET_DIR/$file"
fi

if [ ! -f "$file" ]; then
	echo "Error: file not found: $file" >&2
	exit 1
fi

# Token #1: abuse contact (specific, before domain placeholder token #4)
sed_edit "s|git+abuse@kyaulabs\.com|abuse@${domain}|g" "$file"

# Token #2: GitHub org/repo
sed_edit "s|kyaulabs/template|${org}/${repo}|g" "$file"

# Token #3: app name placeholder
sed_edit "s|<app>|${app}|g" "$file"

# Token #4: domain placeholder
sed_edit "s|<domain>|${domain}|g" "$file"

# Token #5: username placeholder (feature branch names, etc.)
sed_edit "s|<username>|${username}|g" "$file"




# vim: ft=sh sts=4 sw=4 ts=4 et :
