#!/usr/bin/env bash
# $KYAULabs: search.sh kyau@aura.kyaulabs 2026/08/16 -0700 Exp $






set -euo pipefail

# shellcheck disable=SC2034  # consumed by the sourced search_common.sh
SKILL=searxng
# shellcheck source=../lib/search_common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../lib/search_common.sh"
usage_guard "$#"
require_cmd curl 'curl is required.'
require_cmd node 'Node.js is required to normalize JSON safely.'
require_env SEARXNG_URL

case "$SEARXNG_URL" in
	https://*) ;;
	http://*)
		if [ "${SEARXNG_ALLOW_HTTP:-0}" != "1" ]; then
			printf 'searxng: HTTP requires explicit SEARXNG_ALLOW_HTTP=1; prefer https.\n' >&2
			exit 2
		fi
		;;
	*)
		printf 'searxng: SEARXNG_URL must use http or https.\n' >&2
		exit 2
		;;
esac

QUERY="$*"
LANGUAGE="${SEARXNG_LANGUAGE:-all}"
CATEGORIES="${SEARXNG_CATEGORIES:-general}"
SAFESEARCH="${SEARXNG_SAFESEARCH:-1}"
RESULT_LIMIT="${SEARXNG_RESULT_LIMIT:-10}"

case "$SAFESEARCH" in
	0|1|2) ;;
	*)
		printf 'searxng: SEARXNG_SAFESEARCH must be 0, 1, or 2.\n' >&2
		exit 2
		;;
esac
require_posint SEARXNG_RESULT_LIMIT "$RESULT_LIMIT"
if [ "$RESULT_LIMIT" -gt 50 ]; then
	printf 'searxng: SEARXNG_RESULT_LIMIT must not exceed 50.\n' >&2
	exit 2
fi

BASE_URL="${SEARXNG_URL%/}"
RESPONSE_FILE=$(mktemp)
ERROR_FILE=$(mktemp)
cleanup() {
	rm -f "$RESPONSE_FILE" "$ERROR_FILE"
}
trap cleanup EXIT
chmod 600 "$RESPONSE_FILE" "$ERROR_FILE"

HTTP_STATUS=$(curl --silent --show-error \
	--output "$RESPONSE_FILE" \
	--write-out '%{http_code}' \
	--get "$BASE_URL/search" \
	--data-urlencode "q=$QUERY" \
	--data-urlencode 'format=json' \
	--data-urlencode "language=$LANGUAGE" \
	--data-urlencode "categories=$CATEGORIES" \
	--data-urlencode "safesearch=$SAFESEARCH" \
	--connect-timeout 10 \
	--max-time 60 2> "$ERROR_FILE") || {
	printf 'searxng: network request failed: ' >&2
	head -c 500 "$ERROR_FILE" >&2 || true
	printf '\n' >&2
	exit 5
}

if [ "$HTTP_STATUS" -lt 200 ] || [ "$HTTP_STATUS" -ge 300 ]; then
	printf 'searxng: instance returned HTTP %s' "$HTTP_STATUS" >&2
	if [ "$HTTP_STATUS" = "403" ]; then
		printf ' (the instance may have JSON format disabled)' >&2
	fi
	printf '\n' >&2
	exit 5
fi

node - "$RESPONSE_FILE" "$QUERY" "$RESULT_LIMIT" <<'NODE'
'use strict';

const fs = require('node:fs');
const file = process.argv[2];
const query = process.argv[3];
const limit = Number(process.argv[4]);
let data;
try {
	data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (error) {
	console.error(`searxng: invalid JSON response: ${error.message}`);
	process.exit(6);
}
if (!Array.isArray(data.results)) {
	console.error('searxng: response does not contain a results array; ensure JSON search is enabled.');
	process.exit(6);
}
const results = data.results.slice(0, limit).map((item) => ({
	title: typeof item?.title === 'string' ? item.title : '',
	url: typeof item?.url === 'string' ? item.url : '',
	content: typeof item?.content === 'string' ? item.content : '',
	engine: typeof item?.engine === 'string' ? item.engine : '',
	publishedDate: typeof item?.publishedDate === 'string'
		? item.publishedDate
		: (typeof item?.published_date === 'string' ? item.published_date : ''),
}));
process.stdout.write(`${JSON.stringify({ query, number_of_results: results.length, results }, null, 2)}\n`);
NODE






# vim: ft=sh sts=4 sw=4 ts=4 et :
