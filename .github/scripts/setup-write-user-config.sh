#!/usr/bin/env bash
# $KYAULabs: setup-write-user-config.sh kyau@cosmos.kyaulabs 2026/07/23 -0700 Exp $



# setup-write-user-config.sh — Merge user-scoped /setup fields into the
# user-level ~/.config/opencode/setup.json WITHOUT destroying unrelated keys
# (env.deepseek_api_key, env.searxng_url, etc.). Replaces the destructive
# full-file `jq -n ... >` overwrite previously inlined in /setup §3 (#187).
#
# Reads model/variant/identity values from environment variables, builds the
# new user-scoped object (identity + models + variants — never `env`), and
# deep-merges it onto the existing file (missing file → empty base). Atomic
# write via mktemp + mv. Refuses to clobber on a missing required value, a
# missing jq, or a corrupt existing file (exits non-zero, leaves file intact).

set -euo pipefail

CONFIG="${SETUP_USER_CONFIG:-$HOME/.config/opencode/setup.json}"

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

if ! command -v jq >/dev/null 2>&1; then
    echo "✗ jq required to merge $CONFIG" >&2
    exit 1
fi

# Existing base: read + validate as JSON (refuse to clobber a corrupt file).
if [ -f "$CONFIG" ]; then
    if ! EXISTING=$(jq '.' "$CONFIG" 2>/dev/null); then
        echo "✗ existing $CONFIG is not valid JSON; aborting (no write)" >&2
        exit 1
    fi
else
    EXISTING='{}'
fi

# New user-scoped object (identity + models + variants — never env).
NEW_OBJ=$(jq -n \
    --arg name "$SIGNED_OFF_BY_NAME" --arg email "$SIGNED_OFF_BY_EMAIL" \
    --arg p "$OPENCODE_MODEL_PRIMARY" --arg pl "$OPENCODE_MODEL_PLANNER" \
    --arg d "$OPENCODE_MODEL_DESIGN" --arg j "$OPENCODE_MODEL_JUDGE" --arg u "$OPENCODE_MODEL_UTILITY" \
    --arg pv "$OPENCODE_VARIANT_PRIMARY" --arg plv "$OPENCODE_VARIANT_PLANNER" \
    --arg dv "$OPENCODE_VARIANT_DESIGN" --arg jv "$OPENCODE_VARIANT_JUDGE" --arg uv "$OPENCODE_VARIANT_UTILITY" \
    '{
        signed_off_by_name: $name,
        signed_off_by_email: $email,
        models: {primary: $p, planner: $pl, design: $d, judge: $j, utility: $u},
        variants: {primary: $pv, planner: $plv, design: $dv, judge: $jv, utility: $uv}
    }')

# Deep merge: existing base is preserved for unknown keys (env.*, experimental,
# custom), new values override the user-scoped fields. Atomic write.
mkdir -p "$(dirname "$CONFIG")"
TMP=$(mktemp "${CONFIG}.tmp.XXXXXX")
jq -n --argjson existing "$EXISTING" --argjson new "$NEW_OBJ" '$existing * $new' > "$TMP"
mv "$TMP" "$CONFIG"

echo "✓ Merged user-scoped /setup fields into $CONFIG (env preserved)" >&2




# vim: ft=sh sts=4 sw=4 ts=4 et :
