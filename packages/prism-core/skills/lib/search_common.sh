#!/usr/bin/env bash
# $KYAULabs: search_common.sh kyau@aura.kyaulabs 2026/08/16 -0700 Exp $


# ── Shared validation helpers for skill search scripts ─────────────────────────
#
# Source this file from a skill's search.sh (after $SKILL is set):
#   SKILL=searxng
#   source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../lib/search_common.sh"
#
# Provides (fail-closed; exit codes and messages are stable contract):
#   - usage_guard <argc>:   'Usage: <basename> <query>'                       exit 2
#   - require_cmd <exe> <body>: '<SKILL>: <body>' (e.g. 'curl is required.')  exit 3
#   - require_env <VAR>:    '<SKILL>: <VAR> is not set. Configure it in the
#                            environment; never pass it as an argument.'      exit 4
#   - require_posint <VAR> <value>: '<SKILL>: <VAR> must be a positive
#                            integer.'                                        exit 2

usage_guard() {
	if [ "$1" -eq 0 ]; then
		printf 'Usage: %s <query>\n' "$(basename "$0")" >&2
		exit 2
	fi
}

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		printf '%s: %s\n' "$SKILL" "$2" >&2
		exit 3
	fi
}

require_env() {
	if [ -z "${!1:-}" ]; then
		printf '%s: %s is not set. Configure it in the environment; never pass it as an argument.\n' "$SKILL" "$1" >&2
		exit 4
	fi
}

require_posint() {
	case "$2" in
		''|*[!0-9]*|0)
			printf '%s: %s must be a positive integer.\n' "$SKILL" "$1" >&2
			exit 2
			;;
	esac
}



# vim: ft=sh sts=4 sw=4 ts=4 et :
