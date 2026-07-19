#!/usr/bin/env bash
# $KYAULabs: migrate-setup.sh kyau@nova 2026/07/19 -0700 Exp $

# migrate-setup.sh — One-way v1→v4 setup.json schema migration (ADR-0029).
# Idempotent: safe to run on already-v4 files.

set -euo pipefail

SETUP="${1:-.opencode/setup.json}"

if [ ! -f "$SETUP" ]; then
    echo "✗ setup.json not found at $SETUP" >&2
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "✗ jq required for migration" >&2
    exit 1
fi

CURRENT_VERSION=$(jq -r '.setup_version // 0' "$SETUP")

if [ "$CURRENT_VERSION" -ge 4 ] 2>/dev/null; then
    exit 0  # already migrated
fi

TMP=$(mktemp)
jq '
    .setup_version = 4
    | .accent = (.accent // "sky-blue")
    | .scaffold_mode = (.scaffold_mode // "skip")
    | .project_folder = (.project_folder // null)
    | .models = (.models // {
        "primary": "deepseek/deepseek-v4-pro",
        "planner": "openrouter/z-ai/glm-5.2",
        "judge": "openrouter/z-ai/glm-5.2",
        "utility": "deepseek/deepseek-v4-flash"
      })
    | .variants = (.variants // {
        "primary": "max",
        "planner": "high",
        "judge": "medium",
        "utility": "medium"
      })
    | .experimental = (.experimental // {
        "lsp_tool": true,
        "scout": true,
        "background_subagents": false
      })
' "$SETUP" > "$TMP"
mv "$TMP" "$SETUP"
echo "✓ Migrated $SETUP to setup_version 4" >&2


# vim: ft=sh sts=4 sw=4 ts=4 et :
