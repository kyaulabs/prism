#!/usr/bin/env bash
# $KYAULabs: setup-write-project-config.sh kyau@cosmos.kyaulabs 2026/08/03 -0700 Exp $










# setup-write-project-config.sh — Write project-scoped /setup fields into the
# project-tier prism.jsonc (ADR-0043, Task 6) via the prism manifest CLI
# `patch` command: JSONC (comment-preserving), atomic, mode 0644,
# symlink-refusing, fail-closed on malformed input.
#
# Two modes select the scaffold bookkeeping written alongside the interview
# values (app/domain/repo/identity/accent and the six-tier model + variant
# maps):
#
#   parent — records the ACTUAL scaffold decision: scaffold_mode takes the
#            chosen mode and project_folder takes the chosen path (or null for
#            skip). Used on the root manifest that ran /setup.
#   target — records the runtime projection for a scaffolded subfolder:
#            scaffold_mode "skip" and project_folder null, so a derived project
#            never embeds its parent's filesystem path.
#
# Reads interview values from environment variables, builds a strict-JSON object
# of dot-path => value updates (values escaped by jq, never interpolated into
# shell), and pipes it to prism_manifest.php `patch`, which delegates to
# PrismJsoncDocument::withValues() so only the specified spans change —
# existing comments, experimental flags, env, and unknown fields are preserved
# byte-for-byte. When no manifest exists, a minimal canonical commented
# schema-v6 seed is written first so the patcher has a valid document to
# span-patch. Refuses to proceed on a missing required value, a symlink target,
# a missing php/jq, a corrupt existing file, or an invalid mode argument.

set -euo pipefail

# ── Argument validation ───────────────────────────────────────────────────
if [ "$#" -ne 2 ]; then
    echo "✗ usage: setup-write-project-config.sh <manifest> parent|target" >&2
    exit 2
fi

MANIFEST="$1"
MODE="$2"

if [ "$MODE" != "parent" ] && [ "$MODE" != "target" ]; then
    echo "✗ mode must be parent or target (got: $MODE)" >&2
    exit 2
fi

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CLI="$SCRIPT_DIR/prism_manifest.php"

# Required interview values for both modes. Parent mode additionally requires
# SETUP_SCAFFOLD_MODE (target always writes the literal "skip"). SETUP_PROJECT_FOLDER
# is optional in parent mode: an empty/unset value projects to null (the skip case).
REQUIRED_VARS=(
    SETUP_APP SETUP_DOMAIN SETUP_REPO SETUP_ACCENT
    SIGNED_OFF_BY_NAME SIGNED_OFF_BY_EMAIL
    OPENCODE_MODEL_PRIMARY OPENCODE_MODEL_PLANNER OPENCODE_MODEL_DESIGN OPENCODE_MODEL_JUDGE OPENCODE_MODEL_UTILITY OPENCODE_MODEL_FRONTEND
    OPENCODE_VARIANT_PRIMARY OPENCODE_VARIANT_PLANNER OPENCODE_VARIANT_DESIGN OPENCODE_VARIANT_JUDGE OPENCODE_VARIANT_UTILITY OPENCODE_VARIANT_FRONTEND
)

if [ "$MODE" = "parent" ]; then
    REQUIRED_VARS+=(SETUP_SCAFFOLD_MODE)
fi

# Refuse to write a partial object.
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        echo "✗ required env var $var is empty or unset; aborting (no write)" >&2
        exit 1
    fi
done

if ! command -v php >/dev/null 2>&1; then
    echo "✗ php is required to write $MANIFEST" >&2
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "✗ jq required to build updates for $MANIFEST" >&2
    exit 1
fi

# Refuse a symlink target so the patcher is never pointed through a link.
if [ -L "$MANIFEST" ]; then
    echo "✗ refusing symlink target: $MANIFEST" >&2
    exit 1
fi

mkdir -p "$(dirname "$MANIFEST")"

# Seed a minimal valid schema-v6 project document when none exists so the
# span-patcher has a real JSONC document to patch. The interview + bookkeeping
# fields are added by the patch below; this seed supplies the non-interview
# required fields (version, configured, timestamp, experimental, env).
if [ ! -e "$MANIFEST" ]; then
    NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    ( umask 022; cat > "$MANIFEST" <<SEED
// Prism project manifest (schema v6)
{
  "setup_version": 6,
  "configured": true,
  "timestamp": "$NOW",
  "experimental": {
    "lsp_tool": true,
    "scout": true,
    "background_subagents": false
  },
  "env": {
    "deepseek_api_key": "",
    "searxng_url": ""
  },
  "mcp": {
    "deepseek_websearch": false,
    "searxng": false
  },
  "plugins": {
    "opencode_quota": false
  }
}
SEED
)
fi

# ── Resolve mode-specific bookkeeping as JSON literals ────────────────────
# jq --argjson takes already-valid JSON, so scaffold_mode/project_folder are
# pre-encoded here (a quoted string or the bare null). Nothing is interpolated
# into an executable context.
if [ "$MODE" = "target" ]; then
    SM_JSON='"skip"'
    PF_JSON='null'
else
    # parent: scaffold_mode is the chosen mode; project_folder is the chosen
    # path, or null when unset/empty (the skip case).
    SM_JSON=$(printf '%s' "$SETUP_SCAFFOLD_MODE" | jq -R '.')
    if [ -n "${SETUP_PROJECT_FOLDER:-}" ]; then
        PF_JSON=$(printf '%s' "$SETUP_PROJECT_FOLDER" | jq -R '.')
    else
        PF_JSON='null'
    fi
fi

# Build the dot-path => value updates object. jq --arg escapes every string
# value and --argjson injects the pre-encoded bookkeeping literals, so nothing
# is interpolated into executable shell; the object is piped to the CLI as data
# on stdin.
UPDATES=$(jq -n \
    --arg app "$SETUP_APP" --arg dom "$SETUP_DOMAIN" --arg repo "$SETUP_REPO" \
    --arg accent "$SETUP_ACCENT" --arg name "$SIGNED_OFF_BY_NAME" --arg email "$SIGNED_OFF_BY_EMAIL" \
    --argjson sm "$SM_JSON" --argjson pf "$PF_JSON" \
    --arg mp "$OPENCODE_MODEL_PRIMARY" --arg mpl "$OPENCODE_MODEL_PLANNER" \
    --arg md "$OPENCODE_MODEL_DESIGN" --arg mj "$OPENCODE_MODEL_JUDGE" --arg mu "$OPENCODE_MODEL_UTILITY" --arg mf "$OPENCODE_MODEL_FRONTEND" \
    --arg vp "$OPENCODE_VARIANT_PRIMARY" --arg vpl "$OPENCODE_VARIANT_PLANNER" \
    --arg vd "$OPENCODE_VARIANT_DESIGN" --arg vj "$OPENCODE_VARIANT_JUDGE" --arg vu "$OPENCODE_VARIANT_UTILITY" --arg vf "$OPENCODE_VARIANT_FRONTEND" \
    '{
        "app": $app,
        "domain": $dom,
        "repo": $repo,
        "accent": $accent,
        "signed_off_by_name": $name,
        "signed_off_by_email": $email,
        "scaffold_mode": $sm,
        "project_folder": $pf,
        "models.primary": $mp,
        "models.planner": $mpl,
        "models.design": $md,
        "models.judge": $mj,
        "models.utility": $mu,
        "models.frontend": $mf,
        "variants.primary": $vp,
        "variants.planner": $vpl,
        "variants.design": $vd,
        "variants.judge": $vj,
        "variants.utility": $vu,
        "variants.frontend": $vf
    }')

# Patch atomically through the CLI: validates the result as a project manifest,
# writes at mode 0644, preserves comments and unrelated fields, refuses
# symlinks, and fails closed without clobbering on any error.
printf '%s' "$UPDATES" | php "$CLI" patch "$MANIFEST" project 0644

echo "✓ Wrote project-scoped /setup fields into $MANIFEST ($MODE mode, JSONC, comments preserved)" >&2










# vim: ft=sh sts=4 sw=4 ts=4 et :
