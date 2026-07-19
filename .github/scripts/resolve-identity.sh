#!/usr/bin/env bash
# $KYAULabs: resolve-identity.sh kyau@nova 2026/07/19 -0700 Exp $

# resolve-identity.sh — Resolve Signed-off-by identity from 3-tier fallback.
#
# Resolution order (ADR-0029):
#   1. ~/.config/opencode/setup.json (user override)
#   2. .opencode/setup.json (project default)
#   3. git config user.name <git config user.email>
#
# Output: "Name <email>" on stdout
# Exit: 0 success, 3 if all sources empty

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
USER_SETUP="$HOME/.config/opencode/setup.json"
PROJECT_SETUP="$REPO_ROOT/.opencode/setup.json"

if ! command -v jq >/dev/null 2>&1; then
    echo "✗ jq is required to parse setup.json" >&2
    exit 3
fi

read_json_field() {
    local file="$1" field="$2"
    [ -f "$file" ] || return 1
    local val
    val=$(jq -r ".\"$field\" // empty" "$file" 2>/dev/null) || return 1
    [ -n "$val" ] && echo "$val" || return 1
}

resolve_pair_from_json() {
    local file="$1"
    local name email
    name=$(read_json_field "$file" "signed_off_by_name") || return 1
    email=$(read_json_field "$file" "signed_off_by_email") || return 1
    echo "$name <$email>"
}

# Tier 1: user setup.json
if pair=$(resolve_pair_from_json "$USER_SETUP"); then
    echo "$pair"
    exit 0
fi

# Tier 2: project setup.json
if pair=$(resolve_pair_from_json "$PROJECT_SETUP"); then
    echo "$pair"
    exit 0
fi

# Tier 3: git config
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
