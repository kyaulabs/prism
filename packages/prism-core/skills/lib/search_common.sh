#!/usr/bin/env bash
# $KYAULabs: search_common.sh kyau@aura.kyaulabs 2026/08/16 -0700 Exp $









# ── Shared validation helpers for skill search scripts ─────────────────────────
#
# Source this file from a skill's search.sh (after $SKILL is set):
#   SKILL=searxng
#   source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../lib/search_common.sh"
#
# Provides (fail-closed; exit codes and messages are stable contract):
#   - usage_guard <argc>:   'Usage: <basename> <query>' (rejects argc 0 and
#                            non-numeric; one or more args are accepted and
#                            joined into the query)                       exit 2
#   - require_cmd <exe> <body>: '<SKILL>: <body>' (e.g. 'curl is required.')  exit 3
#   - require_env <VAR>:    '<SKILL>: <VAR> is not set. Configure it in the
#                            environment; never pass it as an argument.'      exit 4
#                            (the variable must be set AND non-empty; an empty
#                            value is treated as missing — fail closed)
#   - require_posint <VAR> <value>: '<SKILL>: <VAR> must be a positive
#                            integer.'                                        exit 2
#   - search_request <curl-args...>: runs curl with --silent --show-error
#     and --write-out '%{http_code}' appended, retrying transient outcomes
#     (transport failure, HTTP 429, HTTP >= 500) up to 3 attempts with
#     2s/4s backoff. Prints the final HTTP status on stdout. Exits nonzero
#     on final transport failure.                              exit 1

usage_guard() {
	case "${1:-}" in
		''|*[!0-9]*|0*)
			printf 'Usage: %s <query>\n' "$(basename "$0")" >&2
			exit 2
			;;
	esac
}

require_cmd() {
	if ! command -v "${1:-}" >/dev/null 2>&1; then
		printf '%s: %s\n' "${SKILL:-}" "${2:-command is required}" >&2
		exit 3
	fi
}

require_env() {
	if [ -z "${!1:-}" ]; then
		printf '%s: %s is not set. Configure it in the environment; never pass it as an argument.\n' "${SKILL:-}" "${1:-VARIABLE}" >&2
		exit 4
	fi
}

require_posint() {
	if ! [[ "${2:-}" =~ ^[1-9][0-9]*$ ]]; then
		printf '%s: %s must be a positive integer.\n' "${SKILL:-}" "${1:-VARIABLE}" >&2
		exit 2
	fi
}

search_request() {
	local attempt=0 status='' curl_rc=0
	while :; do
		if status=$(curl --silent --show-error --write-out '%{http_code}' "$@"); then
			curl_rc=0
			if [ "$status" != "429" ] && [ "$status" -lt 500 ]; then
				break
			fi
		else
			curl_rc=$?
		fi
		attempt=$((attempt + 1))
		if [ "$attempt" -ge 3 ]; then
			break
		fi
		sleep $((2 * attempt))   # 2s, 4s — bounded linear backoff
	done
	printf '%s\n' "$status"
	[ "$curl_rc" -eq 0 ]
}










# vim: ft=sh sts=4 sw=4 ts=4 et :
