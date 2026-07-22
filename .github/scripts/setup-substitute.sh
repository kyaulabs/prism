#!/usr/bin/env bash
# $KYAULabs: setup-substitute.sh kyau@nova 2026/07/21 -0700 Exp $







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
VALIDATE_ONLY=0
while [ $# -gt 0 ]; do
	case "$1" in
		--target-dir)
			[ $# -ge 2 ] || { echo "Error: --target-dir requires an argument" >&2; exit 2; }
			TARGET_DIR="$2"
			shift 2
			;;
		--validate-only)
			VALIDATE_ONLY=1
			shift
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

# validate_token_value <value> <label>
# Reject values containing sed-active or shell-dangerous characters. Spliced
# unescaped into s|...|VALUE|g, these corrupt output (| closes the delimiter,
# & means whole match, \ is an escape) or enable command execution on GNU sed
# (a crafted value appends the `e` flag). Quotes, backtick, and whitespace
# are rejected as defense-in-depth. See issue #181.
#
# Returns 0 if the value is clean; otherwise prints an error to stderr and
# returns 1. Uses portable case globbing (no [[ =~ ]], no external regex).
validate_token_value() {
	local value="$1" label="$2"
	# Every forbidden pattern has an empty body and falls through to the
	# error below; the catch-all *) returns 0 for clean values.
	case "$value" in
		*[[:space:]]*) ;;   # space, tab, newline, CR, etc.
		*'|'*)         ;;   # sed delimiter (closes s|...|)
		*'&'*)         ;;   # whole-match backreference
		*"\\"*)        ;;   # escape introducer
		*'"'*)         ;;   # double quote
		*"'"*)         ;;   # single quote
		*'`'*)         ;;   # backtick (command substitution)
		*)             return 0 ;;
	esac
	echo "Error: $label contains a forbidden character (|, &, \\, quote, backtick, or whitespace): $value" >&2
	return 1
}

# --validate-only: check the four manifest values and exit without touching
# any file. Used by /setup re-run mode to pre-validate setup.json values
# before they are spliced into sed programs. See issue #181 (AC-3).
if [ "$VALIDATE_ONLY" -eq 1 ]; then
	app="${1:?Error: app name required}"
	domain="${2:?Error: domain required}"
	org="${3:?Error: GitHub org required}"
	repo="${4:?Error: GitHub repo required}"
	validate_token_value "$app"    "app"    || exit 1
	validate_token_value "$domain" "domain" || exit 1
	validate_token_value "$org"    "org"    || exit 1
	validate_token_value "$repo"   "repo"   || exit 1
	exit 0
fi

file="${1:?Error: file path required}"
app="${2:?Error: app name required}"
domain="${3:?Error: domain required}"
org="${4:?Error: GitHub org required}"
repo="${5:?Error: GitHub repo required}"

# Auto-detect username from git config for <username> token (branch names, etc.)
username=$(git config user.name 2>/dev/null || echo "developer")

# Reject values that would corrupt or inject through the sed programs below.
# Validated before any file is touched so a bad value leaves files unchanged.
validate_token_value "$app"      "app"      || exit 1
validate_token_value "$domain"   "domain"   || exit 1
validate_token_value "$org"      "org"      || exit 1
validate_token_value "$repo"     "repo"     || exit 1
validate_token_value "$username" "username" || exit 1

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
