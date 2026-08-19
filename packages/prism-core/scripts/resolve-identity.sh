#!/usr/bin/env bash
# $KYAULabs: resolve-identity.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# resolve-identity.sh — Resolve the Signed-off-by identity without a project
# manifest. An optional user override at ~/.config/prism/identity takes
# precedence over git config. A source must provide BOTH fields; partial or
# malformed overrides fail closed rather than mixing identities.
#
# Override format (mode 0600 recommended):
#   SIGNED_OFF_BY_NAME=Example User
#   SIGNED_OFF_BY_EMAIL=user@example.com
#
# Output: "Name <email>" on stdout
# Exit: 0 success, 3 when no complete valid source resolves

set -euo pipefail

IDENTITY_FILE="${PRISM_IDENTITY_FILE:-$HOME/.config/prism/identity}"
NAME=""
EMAIL=""

valid_name() {
	[ -n "$1" ] \
		&& ! printf '%s' "$1" | grep -q '[<>[:cntrl:]]'
}

valid_email() {
	[ -n "$1" ] \
		&& ! printf '%s' "$1" | grep -q '[<>[:space:][:cntrl:]]' \
		&& printf '%s' "$1" | grep -qE '^[^@]+@[^@]+$'
}

if [ -e "$IDENTITY_FILE" ]; then
	[ -f "$IDENTITY_FILE" ] || {
		printf '✗ Prism identity override is not a regular file: %s\n' "$IDENTITY_FILE" >&2
		exit 3
	}
	while IFS= read -r line || [ -n "$line" ]; do
		line="${line%$'\r'}"
		case "$line" in
			''|'#'*) continue ;;
			SIGNED_OFF_BY_NAME=*)
				[ -z "$NAME" ] || {
					printf '✗ Duplicate SIGNED_OFF_BY_NAME in %s.\n' "$IDENTITY_FILE" >&2
					exit 3
				}
				NAME="${line#SIGNED_OFF_BY_NAME=}"
				;;
			SIGNED_OFF_BY_EMAIL=*)
				[ -z "$EMAIL" ] || {
					printf '✗ Duplicate SIGNED_OFF_BY_EMAIL in %s.\n' "$IDENTITY_FILE" >&2
					exit 3
				}
				EMAIL="${line#SIGNED_OFF_BY_EMAIL=}"
				;;
			*)
				printf '✗ Invalid key in %s; expected SIGNED_OFF_BY_NAME or SIGNED_OFF_BY_EMAIL.\n' "$IDENTITY_FILE" >&2
				exit 3
				;;
		esac
	done < "$IDENTITY_FILE"

	if ! valid_name "$NAME" || ! valid_email "$EMAIL"; then
		printf '✗ Prism identity override must contain a valid name and email: %s\n' "$IDENTITY_FILE" >&2
		exit 3
	fi
	printf '%s <%s>\n' "$NAME" "$EMAIL"
	exit 0
fi

NAME="$(git config user.name 2>/dev/null || true)"
EMAIL="$(git config user.email 2>/dev/null || true)"
if valid_name "$NAME" && valid_email "$EMAIL"; then
	printf '%s <%s>\n' "$NAME" "$EMAIL"
	exit 0
fi

printf '✗ Could not resolve a complete Signed-off-by identity.\n' >&2
printf '  Set git config user.name/user.email, or create %s.\n' "$IDENTITY_FILE" >&2
exit 3

# vim: ft=sh sts=4 sw=4 ts=4 et :
