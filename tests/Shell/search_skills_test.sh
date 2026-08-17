#!/usr/bin/env bash
# $KYAULabs: search_skills_test.sh kyau@aura.kyaulabs 2026/08/16 -0700 Exp $











set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
WEB="$REPO_ROOT/packages/prism-core/skills/websearch/search.sh"
SEARX="$REPO_ROOT/packages/prism-core/skills/searxng/search.sh"
LIB="$REPO_ROOT/packages/prism-core/skills/lib/search_common.sh"
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

printf '%s\n' '── shared search validation helpers ──'
USAGE_ERR=$(mktemp)
set +e
bash "$SEARX" >/dev/null 2>"$USAGE_ERR"
usage_rc=$?
set -e
[ "$usage_rc" -eq 2 ] && grep -q 'Usage: search.sh <query>' "$USAGE_ERR" \
	&& pass 'usage guard exits 2' || fail "usage guard rc=$usage_rc"
rm -f "$USAGE_ERR"

printf '%s\n' '── shared search validation helpers: unit contract ──'
# Hermetic checks of the lib's exit codes, sourcing it directly so a missing
# curl/node on the host cannot mask the assertion under test.
unit_rc() {
	local expected="$1" label="$2" err_file; shift 2
	err_file=$(mktemp)
	set +e
	SKILL='test' bash -c 'unset DEEPSEEK_API_KEY SEARXNG_URL; source "$1"; "${@:2}"' _ "$LIB" "$@" >/dev/null 2>"$err_file"
	local rc=$?
	set -e
	if [ "$rc" -eq "$expected" ]; then
		pass "$label"
	else
		fail "$label rc=$rc: $(head -1 "$err_file" 2>/dev/null)"
	fi
	rm -f "$err_file"
}

unit_rc 2 'usage_guard exits 2' usage_guard 0
unit_rc 0 'usage_guard accepts one arg' usage_guard 1
unit_rc 0 'usage_guard accepts many args' usage_guard 2
unit_rc 3 'require_cmd exits 3' require_cmd prism-nonexistent-tool 'tool is required.'
unit_rc 4 'require_env exits 4' require_env DEEPSEEK_API_KEY
unit_rc 2 'require_posint rejects empty' require_posint MAX  ''
unit_rc 2 'require_posint rejects zero' require_posint MAX 0
unit_rc 2 'require_posint rejects leading zero' require_posint MAX 00
unit_rc 2 'require_posint rejects non-numeric' require_posint MAX abc
unit_rc 0 'require_posint accepts valid' require_posint MAX 10

printf '%s\n' '── search skills: secret handling ──'
if grep -qE 'printf[^\n]*\$\{?DEEPSEEK_API_KEY|echo[^\n]*\$\{?DEEPSEEK_API_KEY' "$WEB" "$LIB"; then
	fail 'websearch can print the key value'
else
	pass 'websearch does not print the key value'
fi
if grep -qE 'printf[^\n]*\$\{?SEARXNG_URL|echo[^\n]*\$\{?SEARXNG_URL' "$SEARX" "$LIB"; then
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
