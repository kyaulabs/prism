#!/usr/bin/env bash
# $KYAULabs: setup-substitute.sh kyau@nova 2026/07/09 -0700 Exp $

# ── Template token substitution script for /setup ───────────────────────────
# Replaces the template's default identity and placeholder tokens with
# user-provided values in a single file. Designed for first-run /setup.
#
# Usage: setup-substitute.sh <file> <name> <email> <app> <domain> <org> <repo>
#
# Token ordering: longest/most-specific patterns fire first to avoid
# partial-match corruption (e.g., composite identity before bare email).
# See adr/0007-setup-token-strategy.md for the design rationale.

set -euo pipefail

file="${1:?Error: file path required}"
name="${2:?Error: name required}"
email="${3:?Error: email required}"
app="${4:?Error: app name required}"
domain="${5:?Error: domain required}"
org="${6:?Error: GitHub org required}"
repo="${7:?Error: GitHub repo required}"

if [ ! -f "$file" ]; then
	echo "Error: file not found: $file" >&2
	exit 1
fi

# Token #1: composite signed-off-by identity (longest, most specific)
# Must fire before #3 to avoid partial replacement of the email inside <...>
sed -i "s|kyau <git@kyaulabs\.com>|${name} <${email}>|g" "$file"

# Token #2: abuse contact (specific, before bare email token #3)
sed -i "s|git+abuse@kyaulabs\.com|abuse@${domain}|g" "$file"

# Token #3: bare email (catches remaining standalone occurrences after #1)
sed -i "s|git@kyaulabs\.com|${email}|g" "$file"

# Token #4: GitHub org/repo
sed -i "s|kyaulabs/template|${org}/${repo}|g" "$file"

# Token #5: app name placeholder
sed -i "s|<app>|${app}|g" "$file"

# Token #6: domain placeholder
sed -i "s|<domain>|${domain}|g" "$file"

# Token #7: username placeholder (feature branch names, etc.)
sed -i "s|<username>|${name}|g" "$file"

# vim: ft=sh sts=4 sw=4 ts=4 et :
