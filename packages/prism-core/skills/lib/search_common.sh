#!/usr/bin/env bash
# $KYAULabs: search_common.sh kyau@aura.kyaulabs 2026/08/17 -0700 Exp $














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
#   - search_request <curl-args...>: runs curl with --silent --show-error,
#     --write-out '%{http_code} %{errormsg}', and a private --dump-header
#     temp file, retrying transient outcomes (fast transport failures,
#     connect timeouts, HTTP 429 honoring integer Retry-After capped at
#     30s, HTTP >= 500) up to 3 attempts with 2s/4s backoff. A max-time
#     expiry (rc 28 with no connect-timeout error) is never retried: the
#     server outcome is unknown, so retrying could duplicate a billed
#     request and would extend the request window. Callers must pass
#     --output FILE (enforced fail-closed) so the response body is not
#     captured into the status. A caller EXIT trap must be a single-token
#     command to be chained; a multi-word trap is left untouched and
#     restored afterwards (its cleanup is never corrupted). Prints the
#     final HTTP status on stdout. Exits nonzero on final transport
#     failure.                                                exit 1

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
	local attempt=0 status='' http_code='' curl_rc=0 header_file retry_after prev_trap chain arg has_output=0
	for arg in "$@"; do
		case "$arg" in
			--output|-o|--output=*|-o*) has_output=1 ;;
		esac
	done
	if [ "$has_output" -eq 0 ]; then
		printf '%s: search_request requires --output FILE so the response body is not captured.\n' "${SKILL:-search}" >&2
		return 1
	fi
	header_file=$(mktemp)
	# Chain our cleanup onto the caller's EXIT trap when it is a simple
	# (single-token) command; a multi-word trap is left untouched and
	# restored afterwards, so it can never be corrupted by splicing.
	prev_trap=$(trap -p EXIT 2>/dev/null || true)
	if [ -n "$prev_trap" ]; then
		chain=$(printf '%s' "$prev_trap" | sed 's/^trap -- //; s/ EXIT$//')
		case "$chain" in
			*' '*)
				# shellcheck disable=SC2064  # header_file is fixed at registration
				trap -- "rm -f \"$header_file\"" EXIT
				;;
			*)
				# shellcheck disable=SC2064  # header_file is fixed at registration
				trap -- "rm -f \"$header_file\"; $chain" EXIT
				;;
		esac
	else
		# shellcheck disable=SC2064  # header_file is fixed at registration
		trap -- "rm -f \"$header_file\"" EXIT
	fi
	while :; do
		: > "$header_file"
		if status=$(LC_ALL=C curl --silent --show-error --write-out '%{http_code} %{errormsg}' --dump-header "$header_file" "$@"); then
			curl_rc=0
			http_code=${status%% *}
			if [ "$http_code" != "429" ] && [ "$http_code" -lt 500 ]; then
				break
			fi
		else
			curl_rc=$?
			if [ "$curl_rc" -eq 28 ]; then
				# max-time expiry leaves the outcome unknown — retry only a
				# connect timeout, which never reached the server.
				case "$status" in
					*onnect*) ;;
					*) break ;;
				esac
			fi
		fi
		attempt=$((attempt + 1))
		if [ "$attempt" -ge 3 ]; then
			break
		fi
		if [ "$http_code" = "429" ]; then
			retry_after=$(awk -F':[ \t]*' 'tolower($1) == "retry-after" { v = $2; sub(/[[:space:]]*$/, "", v); if (v ~ /^[0-9]+$/) print v; exit }' "$header_file")
			if [ -n "$retry_after" ] && [ "$retry_after" -gt 0 ]; then
				[ "$retry_after" -gt 30 ] && retry_after=30
				sleep "$retry_after"
				continue
			fi
		fi
		sleep $((2 * attempt))   # 2s, 4s — bounded linear backoff
	done
	rm -f "$header_file"
	if [ -n "$prev_trap" ]; then
		eval "$prev_trap"
	else
		trap - EXIT
	fi
	if [ "$curl_rc" -eq 0 ]; then
		printf '%s\n' "$http_code"
	fi
	[ "$curl_rc" -eq 0 ]
}















# vim: ft=sh sts=4 sw=4 ts=4 et :
