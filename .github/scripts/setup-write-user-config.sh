#!/usr/bin/env bash
# $KYAULabs: setup-write-user-config.sh kyau@cosmos.kyaulabs 2026/07/30 -0700 Exp $







# setup-write-user-config.sh — Write user-scoped /setup fields into the
# user-level ~/.config/opencode/prism.jsonc (ADR-0043) via the prism manifest
# CLI `patch` command: JSONC (comment-preserving), atomic, mode 0600,
# symlink-refusing, fail-closed on malformed input.
#
# Two modes, selected by the first positional argument:
#
#   all     — the default (and backward-compatible no-argument behaviour): writes
#             the full identity + model + variant fields.
#   toggles — writes only the three mcp/plugin preference booleans and does not
#             touch identity, model, or variant fields.
#
# Each mode validates its own required environment variables, builds a
# strict-JSON object of dot-path => value updates (values escaped by jq, never
# interpolated into shell), and pipes it to prism_manifest.php `patch`, which
# delegates to PrismJsoncDocument::withValues() so only the specified spans
# change — existing comments, env, experimental flags, mcp, plugins, and
# unknown fields are preserved byte-for-byte. When no manifest exists, a
# minimal canonical commented schema-v5 seed (`{"setup_version": 5}`) is
# written first so the patcher has a valid document to span-patch. Refuses to
# proceed on a missing required value, a symlink target, a missing php/jq, an
# invalid mode argument, or a corrupt existing file (exits non-zero, leaves the
# file intact).

set -euo pipefail

# ── Mode selection ───────────────────────────────────────────────────────
MODE_ARG="${1:-all}"
case "$MODE_ARG" in
    all|toggles) MODE="$MODE_ARG" ;;
    *) echo "✗ invalid mode: $MODE_ARG (expected all or toggles)" >&2; exit 2 ;;
esac

CONFIG="${SETUP_USER_CONFIG:-$HOME/.config/opencode/prism.jsonc}"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CLI="$SCRIPT_DIR/prism_manifest.php"

# ── Mode-specific validation ─────────────────────────────────────────────
if [ "$MODE" = "toggles" ]; then
    TOGGLE_VARS=(
        OPENCODE_MCP_DEEPSEEK_WEBSEARCH
        OPENCODE_MCP_SEARXNG
        OPENCODE_PLUGIN_OPENCODE_QUOTA
    )

    for var in "${TOGGLE_VARS[@]}"; do
        case "${!var:-}" in
            true|false) ;;
            *) echo "✗ required env var $var must be true or false; aborting (no write)" >&2; exit 1 ;;
        esac
    done
else
    REQUIRED_VARS=(
        SIGNED_OFF_BY_NAME SIGNED_OFF_BY_EMAIL
        OPENCODE_MODEL_PRIMARY OPENCODE_MODEL_PLANNER OPENCODE_MODEL_DESIGN OPENCODE_MODEL_JUDGE OPENCODE_MODEL_UTILITY
        OPENCODE_VARIANT_PRIMARY OPENCODE_VARIANT_PLANNER OPENCODE_VARIANT_DESIGN OPENCODE_VARIANT_JUDGE OPENCODE_VARIANT_UTILITY
    )

    for var in "${REQUIRED_VARS[@]}"; do
        if [ -z "${!var:-}" ]; then
            echo "✗ required env var $var is empty or unset; aborting (no write)" >&2
            exit 1
        fi
    done
fi

# ── Common guards ────────────────────────────────────────────────────────
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

# ── Build updates ────────────────────────────────────────────────────────
if [ "$MODE" = "toggles" ]; then
    UPDATES=$(jq -n \
        --argjson deepseek "$OPENCODE_MCP_DEEPSEEK_WEBSEARCH" \
        --argjson searxng "$OPENCODE_MCP_SEARXNG" \
        --argjson quota "$OPENCODE_PLUGIN_OPENCODE_QUOTA" \
        '{
            "mcp.deepseek_websearch": $deepseek,
            "mcp.searxng": $searxng,
            "plugins.opencode_quota": $quota
        }')
    MSG="integration toggles"
else
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
    MSG="user-scoped /setup fields"
fi

# ── Patch atomically ─────────────────────────────────────────────────────
# Validates the result as a user manifest, writes at mode 0600, preserves
# comments and unrelated fields, refuses symlinks, and fails closed without
# clobbering on any error.
printf '%s' "$UPDATES" | php "$CLI" patch "$CONFIG" user 0600

echo "✓ Wrote $MSG into $CONFIG (JSONC, comments preserved)" >&2







# vim: ft=sh sts=4 sw=4 ts=4 et :
