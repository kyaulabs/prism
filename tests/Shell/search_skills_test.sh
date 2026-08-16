#!/usr/bin/env bash
# $KYAULabs: search_skills_test.sh kyau@aura.kyaulabs 2026/08/16 -0700 Exp $






set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
WEB="$REPO_ROOT/packages/prism-core/skills/websearch/search.sh"
SEARX="$REPO_ROOT/packages/prism-core/skills/searxng/search.sh"
source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"

printf '%s\n' '── search skills: setup errors ──'
set +e
env -u DEEPSEEK_API_KEY bash "$WEB" query >/dev/null 2>/tmp/prism-web-error
web_rc=$?
env -u SEARXNG_URL bash "$SEARX" query >/dev/null 2>/tmp/prism-searx-error
searx_rc=$?
set -e
[ "$web_rc" -eq 4 ] && grep -q 'DEEPSEEK_API_KEY is not set' /tmp/prism-web-error \
	&& pass 'websearch missing-key error is clear' || fail "websearch missing-key rc=$web_rc"
[ "$searx_rc" -eq 4 ] && grep -q 'SEARXNG_URL is not set' /tmp/prism-searx-error \
	&& pass 'searxng missing-URL error is clear' || fail "searxng missing-URL rc=$searx_rc"

printf '%s\n' '── search skills: secret handling ──'
if grep -qE 'printf[^\n]*\$\{?DEEPSEEK_API_KEY|echo[^\n]*\$\{?DEEPSEEK_API_KEY' "$WEB"; then
	fail 'websearch can print the key value'
else
	pass 'websearch does not print the key value'
fi
if grep -qE 'printf[^\n]*\$\{?SEARXNG_URL|echo[^\n]*\$\{?SEARXNG_URL' "$SEARX"; then
	fail 'searxng can print the configured URL value'
else
	pass 'searxng does not print the configured URL value'
fi

printf '%s\n' '── search skills: query encoding ──'
if grep -q -- '--data-urlencode "q=$QUERY"' "$SEARX"; then
	pass 'SearXNG query uses curl URL encoding'
else
	fail 'SearXNG query is not URL encoded'
fi
if grep -q -- '--data-binary "@$REQUEST_FILE"' "$WEB"; then
	pass 'DeepSeek request uses generated JSON file'
else
	fail 'DeepSeek request is not sent through JSON file'
fi

printf '\nsearch_skills_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]






# vim: ft=sh sts=4 sw=4 ts=4 et :
