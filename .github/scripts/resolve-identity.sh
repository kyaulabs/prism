#!/usr/bin/env bash
# $KYAULabs: resolve-identity.sh kyau@cosmos.kyaulabs 2026/07/29 -0700 Exp $




# resolve-identity.sh — Resolve Signed-off-by identity from the layered prism
# manifest (ADR-0043) with a git-config fallback.
#
# Resolution:
#   1. Resolved manifest — BOTH identity fields read from ONE atomic
#      prism_manifest.php values0 snapshot (project prism.jsonc overlaid
#      field-by-field by the optional user ~/.config/opencode/prism.jsonc).
#      Reading the pair from a single invocation means the files cannot change
#      between the two field reads, and a partial user override (name only)
#      inherits email from the project.
#   2. git config user.name/user.email — the fallback ONLY when the resolved
#      manifest pair is incomplete or the project manifest is absent.
#
# A present-but-malformed manifest fails closed (exit 3): it is a configuration
# error, not something to silently work around. A MISSING project manifest is a
# soft failure: warn and fall through to git, since identity is best-effort.
#
# Output: "Name <email>" on stdout
# Exit: 0 success, 3 if all sources fail

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
PROJECT_MANIFEST="$REPO_ROOT/prism.jsonc"
USER_MANIFEST="$HOME/.config/opencode/prism.jsonc"
MANIFEST_CLI="$REPO_ROOT/.github/scripts/prism_manifest.php"

if ! command -v php >/dev/null 2>&1; then
    echo "✗ php is required to parse prism.jsonc" >&2
    exit 3
fi

NAME=""
EMAIL=""

# Remove the values0 temp file on any exit path. This script runs as a
# subprocess (bash script), not sourced, so an EXIT trap is safe here. The temp
# file holds identity fields, so umask 077 protects it for its brief lifetime.
_TMPFILE=""
trap 'rm -f "$_TMPFILE" 2>/dev/null || :' EXIT

# Resolve the identity pair from the layered manifest via a single atomic
# snapshot. The NUL-delimited stream is written to a temp file (bash variables
# cannot hold NUL bytes) and parsed with paired read -d '' calls. The CLI exit
# status is checked BEFORE any byte is consumed, so a malformed manifest emits
# no partial identity.
if [ -f "$PROJECT_MANIFEST" ]; then
    if [ -f "$USER_MANIFEST" ]; then
        USER_ARG="$USER_MANIFEST"
    else
        USER_ARG="-"
    fi

    umask 077
    _TMPFILE=$(mktemp)
    if php "$MANIFEST_CLI" values0 \
            "$PROJECT_MANIFEST" "$USER_ARG" \
            signed_off_by_name signed_off_by_email > "$_TMPFILE"; then
        while IFS= read -r -d '' _label && IFS= read -r -d '' _value; do
            case "$_label" in
                signed_off_by_name)  NAME="$_value" ;;
                signed_off_by_email) EMAIL="$_value" ;;
            esac
        done < "$_TMPFILE"
    else
        echo "✗ Failed to resolve prism manifest identity." >&2
        echo "  Run /setup to reconfigure prism.jsonc." >&2
        exit 3
    fi

    if [ -n "$NAME" ] && [ -n "$EMAIL" ]; then
        echo "$NAME <$EMAIL>"
        exit 0
    fi
else
    echo "⚠ Project manifest not found: $PROJECT_MANIFEST" >&2
    echo "  Falling back to git config; run /setup to generate prism.jsonc." >&2
fi

# Git fallback: the manifest pair is incomplete or the project manifest absent.
NAME=$(git config user.name 2>/dev/null || true)
EMAIL=$(git config user.email 2>/dev/null || true)
if [ -n "$NAME" ] && [ -n "$EMAIL" ]; then
    echo "$NAME <$EMAIL>"
    exit 0
fi

echo "✗ Could not resolve identity from any source." >&2
echo "  Set git config user.name/user.email, or run /setup." >&2
exit 3





# vim: ft=sh sts=4 sw=4 ts=4 et :
