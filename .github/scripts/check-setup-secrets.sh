#!/usr/bin/env bash
# $KYAULabs: check-setup-secrets.sh kyau@cosmos.kyaulabs 2026/07/25 -0700 Exp $





# ── Secret-slot guard for tracked .opencode/setup.json (issue #194) ──────────
# Enforces ADR-0032's contract: the committed project setup.json ships EMPTY
# env defaults; real API keys/URLs belong in the user-level
# ~/.config/opencode/setup.json. A non-empty env.* value here means a secret
# is about to be committed.
#
# Usage: check-setup-secrets.sh [path]    (path defaults to .opencode/setup.json)
# Exit 0: every env.* value is empty (or file/env absent).
# Exit 1: any env.* value is non-empty, jq is missing, the file is not valid
#         JSON, or the env section has an unexpected schema (fail-closed).

set -euo pipefail

SETUP_JSON="${1:-.opencode/setup.json}"

# No file in this checkout — nothing to guard (e.g. scaffold skip mode).
[ -f "$SETUP_JSON" ] || exit 0

# jq is a hard prerequisite of .envrc (ADR-0029). Fail closed if absent — a
# missing dependency must not silently disable a secret guard.
if ! command -v jq >/dev/null 2>&1; then
	echo "ERROR: jq required by check-setup-secrets.sh but not found." >&2
	exit 1
fi

# Fail closed on malformed JSON: cannot verify hygiene of an unparseable file.
if ! jq -e . "$SETUP_JSON" >/dev/null 2>&1; then
	echo "ERROR: $SETUP_JSON is not valid JSON — cannot verify secret hygiene." >&2
	exit 1
fi

# Uniform rule (issue #194): ANY non-empty env.* value is a violation. The
# `if ! VAR=$(...)` form makes a jq schema error (e.g. non-object env) fail
# closed instead of silently passing.
if ! VIOLATIONS=$(jq -r '
	(.env // {})
	| to_entries[]
	| select(.value != null and .value != "")
	| "  env.\(.key)"
' "$SETUP_JSON" 2>/dev/null); then
	echo "ERROR: could not evaluate the env section of $SETUP_JSON (unexpected schema)." >&2
	exit 1
fi

if [ -n "$VIOLATIONS" ]; then
	echo "✗ Non-empty secret/env values found in tracked $SETUP_JSON:" >&2
	printf '%s\n' "$VIOLATIONS" >&2
	echo "  Real values belong in ~/.config/opencode/setup.json (user-level)," >&2
	echo "  not the tracked project file (ADR-0032, issue #194)." >&2
	echo "  Move them out and re-stage." >&2
	exit 1
fi

exit 0



# vim: ft=sh sts=4 sw=4 ts=4 et :
