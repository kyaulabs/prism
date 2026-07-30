#!/usr/bin/env bash
# $KYAULabs: check-setup-secrets.sh kyau@cosmos.kyaulabs 2026/07/29 -0700 Exp $





# ── Secret-slot guard for tracked prism.jsonc (issue #194, ADR-0043) ────────
# Enforces the project-tier secret invariant: the committed root prism.jsonc
# ships EMPTY env defaults; real API keys/URLs belong in the user-level
# ~/.config/opencode/prism.jsonc. A non-empty env.* value here means a secret
# is about to be committed.
#
# JSONC parsing and violation detection are delegated to the dependency-free
# prism_manifest.php CLI (check-secrets, project mode), which prints only
# violating key paths — never values — and fails closed on malformed JSONC,
# duplicate keys, a missing/non-object env, or a missing manifest.
#
# Usage: check-setup-secrets.sh [path]    (path defaults to prism.jsonc)
# Exit 0: every env.* value is empty.
# Exit 1: any env.* value is non-empty, php is missing, the file is absent or
#         not valid JSONC, or the env section has an unexpected schema
#         (fail-closed).

set -euo pipefail

# Resolve the script's own directory via bash builtins only (no coreutils),
# so self-location does not depend on anything else being on PATH.
SELF="${BASH_SOURCE[0]}"
case "$SELF" in
	*/*) DIR=$(cd "${SELF%/*}" && pwd) ;;
	*)   DIR=$(pwd) ;;
esac
CLI="$DIR/prism_manifest.php"

MANIFEST="${1:-prism.jsonc}"

# PHP is the hard prerequisite of the manifest boundary. Fail closed if absent
# — a missing dependency must not silently disable a secret guard.
if ! command -v php >/dev/null 2>&1; then
	echo "ERROR: php required by check-setup-secrets.sh but not found." >&2
	exit 1
fi

# Delegate to the CLI (project mode). The `if !` form captures the command's
# combined output even when it fails (a violation OR a structural failure),
# without toggling set -e. The CLI never emits decoded values, so the captured
# output stays redacted.
if ! GUARD_OUT=$(php "$CLI" check-secrets "$MANIFEST" project 2>&1); then
	echo "✗ Secret hygiene check failed for $MANIFEST:" >&2
	printf '%s\n' "$GUARD_OUT" >&2
	echo "  Real values belong in ~/.config/opencode/prism.jsonc (user-level)," >&2
	echo "  not the tracked project manifest (ADR-0043, issue #194)." >&2
	echo "  Move them out and re-stage." >&2
	exit 1
fi

exit 0



# vim: ft=sh sts=4 sw=4 ts=4 et :
