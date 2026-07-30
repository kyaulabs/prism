#!/usr/bin/env bash
# $KYAULabs: setup-write-user-config.sh kyau@cosmos.kyaulabs 2026/07/29 -0700 Exp $




# setup-write-user-config.sh — Write user-scoped /setup fields into the
# user-level ~/.config/opencode/prism.jsonc (ADR-0043) via the prism manifest
# CLI `patch` command: JSONC (comment-preserving), atomic, mode 0600,
# symlink-refusing, fail-closed on malformed input.
#
# Reads model/variant/identity values from environment variables, builds a
# strict-JSON object of dot-path => value updates (values escaped by jq, never
# interpolated into shell), and pipes it to prism_manifest.php `patch`, which
# delegates to PrismJsoncDocument::withValues() so only the specified spans
# change — existing comments, env, experimental flags, and unknown fields are
# preserved byte-for-byte. When no manifest exists, a minimal canonical
# commented schema-v5 seed (`{"setup_version": 5}`) is written first so the
# patcher has a valid document to span-patch. Refuses to proceed on a missing
# required value, a symlink target, a missing php/jq, or a corrupt existing
# file (exits non-zero, leaves the file intact).

set -euo pipefail

CONFIG="${SETUP_USER_CONFIG:-$HOME/.config/opencode/prism.jsonc}"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CLI="$SCRIPT_DIR/prism_manifest.php"

REQUIRED_VARS=(
    SIGNED_OFF_BY_NAME SIGNED_OFF_BY_EMAIL
    OPENCODE_MODEL_PRIMARY OPENCODE_MODEL_PLANNER OPENCODE_MODEL_DESIGN OPENCODE_MODEL_JUDGE OPENCODE_MODEL_UTILITY
    OPENCODE_VARIANT_PRIMARY OPENCODE_VARIANT_PLANNER OPENCODE_VARIANT_DESIGN OPENCODE_VARIANT_JUDGE OPENCODE_VARIANT_UTILITY
)

# Refuse to write a partial object.
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        echo "✗ required env var $var is empty or unset; aborting (no write)" >&2
        exit 1
    fi
done

if ! command -v php >/dev/null 2>&1; then
    echo "✗ php is required to write $CONFIG" >&2
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "✗ jq required to build updates for $CONFIG" >&2
    exit 1
fi

# Refuse a symlink target so the patcher is never pointed through a link.
if [ -L "$CONFIG" ]; then
    echo "✗ refusing symlink target: $CONFIG" >&2
    exit 1
fi

mkdir -p "$(dirname "$CONFIG")"

# Seed a minimal valid schema-v5 user document when none exists so the
# span-patcher has a real JSONC document to patch. umask 077 keeps the seed at
# 0600 for its brief lifetime before the CLI rewrites it explicitly at 0600.
if [ ! -e "$CONFIG" ]; then
    ( umask 077; printf '// Prism user manifest (schema v5)\n{\n  "setup_version": 5\n}\n' > "$CONFIG" )
fi

# Build the dot-path => value updates object. jq --arg escapes every value, so
# nothing is interpolated into executable shell; the object is piped to the CLI
# as data on stdin.
UPDATES=$(jq -n \
    --arg name "$SIGNED_OFF_BY_NAME" --arg email "$SIGNED_OFF_BY_EMAIL" \
    --arg mp "$OPENCODE_MODEL_PRIMARY" --arg mpl "$OPENCODE_MODEL_PLANNER" \
    --arg md "$OPENCODE_MODEL_DESIGN" --arg mj "$OPENCODE_MODEL_JUDGE" --arg mu "$OPENCODE_MODEL_UTILITY" \
    --arg vp "$OPENCODE_VARIANT_PRIMARY" --arg vpl "$OPENCODE_VARIANT_PLANNER" \
    --arg vd "$OPENCODE_VARIANT_DESIGN" --arg vj "$OPENCODE_VARIANT_JUDGE" --arg vu "$OPENCODE_VARIANT_UTILITY" \
    '{
        "signed_off_by_name": $name,
        "signed_off_by_email": $email,
        "models.primary": $mp,
        "models.planner": $mpl,
        "models.design": $md,
        "models.judge": $mj,
        "models.utility": $mu,
        "variants.primary": $vp,
        "variants.planner": $vpl,
        "variants.design": $vd,
        "variants.judge": $vj,
        "variants.utility": $vu
    }')

# Patch atomically through the CLI: validates the result as a user manifest,
# writes at mode 0600, preserves comments and unrelated fields, refuses
# symlinks, and fails closed without clobbering on any error.
printf '%s' "$UPDATES" | php "$CLI" patch "$CONFIG" user 0600

echo "✓ Wrote user-scoped /setup fields into $CONFIG (JSONC, comments preserved)" >&2





# vim: ft=sh sts=4 sw=4 ts=4 et :
