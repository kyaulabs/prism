#!/usr/bin/env bash
# $KYAULabs: search_skills_test.sh kyau@aura.kyaulabs 2026/08/17 -0700 Exp $
























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
	local expected="$1" label="$2" expected_msg="$3" err_file
	shift 3
	err_file=$(mktemp)
	set +e
	SKILL='test' bash -c 'unset DEEPSEEK_API_KEY SEARXNG_URL; source "$1"; "${@:2}"' _ "$LIB" "$@" >/dev/null 2>"$err_file"
	local rc=$?
	set -e
	if [ "$rc" -eq "$expected" ] \
		&& { [ -z "$expected_msg" ] || grep -q -- "$expected_msg" "$err_file"; }; then
		pass "$label"
	else
		fail "$label rc=$rc: $(head -1 "$err_file" 2>/dev/null)"
	fi
	rm -f "$err_file"
}

unit_rc 2 'usage_guard exits 2' '' usage_guard 0
unit_rc 0 'usage_guard accepts one arg' '' usage_guard 1
unit_rc 0 'usage_guard accepts many args' '' usage_guard 2
unit_rc 3 'require_cmd exits 3' '' require_cmd prism-nonexistent-tool 'tool is required.'
unit_rc 3 'require_cmd message' 'tool is required.' require_cmd prism-nonexistent-tool 'tool is required.'
unit_rc 4 'require_env exits 4' '' require_env DEEPSEEK_API_KEY
unit_rc 4 'require_env message' 'DEEPSEEK_API_KEY is not set' require_env DEEPSEEK_API_KEY
unit_rc 2 'require_posint rejects empty' '' require_posint MAX  ''
unit_rc 2 'require_posint rejects zero' '' require_posint MAX 0
unit_rc 2 'require_posint rejects leading zero' '' require_posint MAX 00
unit_rc 2 'require_posint rejects non-numeric' '' require_posint MAX abc
unit_rc 2 'require_posint message' 'must be a positive integer' require_posint MAX abc
unit_rc 0 'require_posint accepts valid' '' require_posint MAX 10

# ── search_request retry helper: fake curl and fake sleep ──────────────────
# FAKE_CURL_SEQ — colon-separated per-attempt status list; "X" = fast
#                 transport failure (exit 1), "T" = max-time timeout
#                 (exit 28, "Operation timed out"), "C" = connect timeout
#                 (exit 28, "Connection timed out" — retryable)
# FAKE_CURL_RETRY_AFTER — value written as a retry-after: header
# FAKE_CURL_LOG — file receiving the running invocation count
# FAKE_SLEEP_LOG — file receiving each sleep argument (fake sleep on PATH)
write_fake_curl() {
	local dir="$1"
	cat > "$dir/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -euo pipefail

out=''
hdr=''
while [ $# -gt 0 ]; do
	case "$1" in
		--output) out="$2"; shift 2 ;;
		--output=*) out="${1#--output=}"; shift ;;
		-o) out="$2"; shift 2 ;;
		-o*) out="${1#-o}"; shift ;;
		--dump-header) hdr="$2"; shift 2 ;;
		*) shift ;;
	esac
done
if [ -z "$out" ]; then
	printf 'fake curl: no --output target\n' >&2
	exit 1
fi
count=0
if [ -f "${FAKE_CURL_LOG:-}" ]; then
	count=$(cat "$FAKE_CURL_LOG")
fi
count=$((count + 1))
printf '%s\n' "$count" > "${FAKE_CURL_LOG:-/dev/null}"

IFS=: read -ra seq <<< "${FAKE_CURL_SEQ:-200}"
idx=$((count - 1))
if [ "$idx" -ge "${#seq[@]}" ]; then
	idx=$((${#seq[@]} - 1))
fi
status="${seq[$idx]}"
if [ "$status" = "X" ]; then
	printf 'fake curl: connection refused\n' >&2
	exit 1
fi
if [ "$status" = "T" ]; then
	printf '000 Operation timed out after 1000 ms'
	printf 'fake curl: operation timed out\n' >&2
	exit 28
fi
if [ "$status" = "C" ]; then
	printf '000 Connection timed out after 1000 ms'
	printf 'fake curl: connection timed out\n' >&2
	exit 28
fi
# Real curl writes no body on a failed transfer — neither do we.
printf 'fake body\n' > "$out"
if [ -n "$hdr" ] && [ -n "${FAKE_CURL_RETRY_AFTER:-}" ]; then
	if [ "${FAKE_CURL_RETRY_AFTER_TIGHT:-0}" = "1" ]; then
		printf 'retry-after:%s\r\n' "$FAKE_CURL_RETRY_AFTER" > "$hdr"
	else
		printf 'retry-after: %s\r\n' "$FAKE_CURL_RETRY_AFTER" > "$hdr"
	fi
fi
printf '%s' "$status"
FAKE_CURL
	chmod +x "$dir/curl"
}

write_fake_sleep() {
	local dir="$1"
	cat > "$dir/sleep" <<'FAKE_SLEEP'
#!/usr/bin/env bash
printf '%s\n' "${1:-}" >> "${FAKE_SLEEP_LOG:?FAKE_SLEEP_LOG not set}"
FAKE_SLEEP
	chmod +x "$dir/sleep"
}

search_request_case() {
	local label="$1" seq="$2" expected_out="$3" expected_rc="$4" expected_invocations="$5" retry_after="${6:-}" expected_sleeps="${7:-}" tight="${8:-}"
	local fake_bin log sleep_log outfile errfile out rc invocations sleeps ok
	fake_bin=$(mktemp -d)
	log=$(mktemp)
	sleep_log=$(mktemp)
	outfile=$(mktemp)
	errfile=$(mktemp)
	write_fake_curl "$fake_bin"
	write_fake_sleep "$fake_bin"
	export FAKE_CURL_SEQ="$seq" FAKE_CURL_LOG="$log" FAKE_SLEEP_LOG="$sleep_log"
	[ -n "$retry_after" ] && export FAKE_CURL_RETRY_AFTER="$retry_after"
	[ -n "$tight" ] && export FAKE_CURL_RETRY_AFTER_TIGHT="$tight"
	set +e
	out=$(env PATH="$fake_bin:$PATH" bash -c \
		'source "$1"; search_request --output "$2" http://fake.invalid/search' \
		_ "$LIB" "$outfile" 2>"$errfile")
	rc=$?
	set -e
	unset FAKE_CURL_SEQ FAKE_CURL_LOG FAKE_CURL_RETRY_AFTER FAKE_CURL_RETRY_AFTER_TIGHT FAKE_SLEEP_LOG
	invocations=$(cat "$log" 2>/dev/null || true)
	invocations="${invocations:-0}"
	sleeps=$(tr '\n' ' ' < "$sleep_log" 2>/dev/null | sed 's/ $//')
	ok=1
	[ "$rc" -eq "$expected_rc" ] || ok=0
	[ "$out" = "$expected_out" ] || ok=0
	[ "$invocations" -eq "$expected_invocations" ] || ok=0
	[ "$sleeps" = "$expected_sleeps" ] || ok=0
	if [ "$expected_rc" -eq 0 ]; then
		grep -q 'fake body' "$outfile" || ok=0
	else
		grep -q 'fake body' "$outfile" && ok=0
	fi
	grep -q 'integer expected' "$errfile" && ok=0
	if [ "$ok" -eq 1 ]; then
		pass "$label"
	else
		fail "$label (rc=$rc out='$out' invocations=$invocations sleeps='$sleeps' body=$(grep -c 'fake body' "$outfile" || true); expected rc=$expected_rc out='$expected_out' invocations=$expected_invocations sleeps='$expected_sleeps'; stderr: $(head -2 "$errfile" 2>/dev/null | tr '\n' ' '))"
	fi
	rm -f "$log" "$sleep_log" "$outfile" "$errfile"
	rm -rf "$fake_bin"
}

printf '%s\n' '── search_request retry helper ──'
search_request_case 'search_request: 200 passes through, single attempt' '200' '200' 0 1
search_request_case 'search_request: 403 is not retried' '403' '403' 0 1
search_request_case 'search_request: max-time timeout is not retried' 'T' '' 1 1
search_request_case 'search_request: connect timeout is retried' 'C:200' '200' 0 2 '' '2'
search_request_case 'search_request: 429 then 200 retries once' '429:200' '200' 0 2 '' '2'
search_request_case 'search_request: 429 honors Retry-After delay' '429:200' '200' 0 2 '1' '1'
search_request_case 'search_request: fractional Retry-After falls back cleanly' '429:200' '200' 0 2 '1.5' '2'
search_request_case 'search_request: transport failures then 200 retries twice' 'X:X:200' '200' 0 3 '' '2 4'
search_request_case 'search_request: 429 thrice gives up after 3 attempts' '429:429:429' '429' 0 3 '' '2 4'
search_request_case 'search_request: 503 then 200 retries once' '503:200' '200' 0 2 '' '2'
search_request_case 'search_request: 500 thrice gives up after 3 attempts' '500:500:500' '500' 0 3 '' '2 4'
search_request_case 'search_request: Retry-After capped at 30s' '429:200' '200' 0 2 '45' '30'
search_request_case 'search_request: Retry-After without colon space' '429:200' '200' 0 2 '1' '1' '1'
search_request_case 'search_request: transport failures thrice exit nonzero' 'X:X:X' '' 1 3 '' '2 4'

printf '%s\n' '── search_request: --output precondition ──'
OUT_GUARD_ERR=$(mktemp)
set +e
bash -c 'source "$1"; search_request http://fake.invalid/search' _ "$LIB" 2>"$OUT_GUARD_ERR"
rc=$?
set -e
if [ "$rc" -ne 0 ] && grep -q 'requires --output FILE' "$OUT_GUARD_ERR"; then
	pass 'search_request fails closed without --output'
else
	fail "search_request --output guard (rc=$rc err=$(head -1 "$OUT_GUARD_ERR" 2>/dev/null))"
fi
rm -f "$OUT_GUARD_ERR"

STDOUT_GUARD_ERR=$(mktemp)
set +e
bash -c 'source "$1"; search_request --output=- http://fake.invalid/search' _ "$LIB" 2>"$STDOUT_GUARD_ERR"
rc=$?
set -e
if [ "$rc" -ne 0 ] && grep -q 'requires --output FILE' "$STDOUT_GUARD_ERR"; then
	pass 'search_request rejects the stdout target --output=-'
else
	fail "search_request stdout-target guard (rc=$rc err=$(head -1 "$STDOUT_GUARD_ERR" 2>/dev/null))"
fi
rm -f "$STDOUT_GUARD_ERR"

printf '%s\n' '── search_request: caller EXIT trap survives ──'
TRAP_MARKER=$(mktemp)
TRAP_OUTFILE=$(mktemp)
rm -f "$TRAP_MARKER"
FAKE_DIR=$(mktemp -d)
write_fake_curl "$FAKE_DIR"
write_fake_sleep "$FAKE_DIR"
set +e
env PATH="$FAKE_DIR:$PATH" TRAP_MARKER="$TRAP_MARKER" bash -c \
	'cleanup_marker() { echo ran > "$TRAP_MARKER"; }; trap cleanup_marker EXIT; source "$1"; search_request --output "$2" http://fake.invalid/search' \
	_ "$LIB" "$TRAP_OUTFILE" 2>/dev/null
rc=$?
set -e
if [ "$rc" -eq 0 ] && [ -f "$TRAP_MARKER" ] && grep -q ran "$TRAP_MARKER"; then
	pass 'search_request leaves the caller EXIT trap intact'
else
	fail "search_request trap restore (rc=$rc marker=$([ -f "$TRAP_MARKER" ] && cat "$TRAP_MARKER" || echo missing))"
fi
rm -f "$TRAP_MARKER" "$TRAP_OUTFILE"
rm -rf "$FAKE_DIR"

printf '%s\n' '── search_request: multi-word caller trap survives ──'
MULTI_MARKER=$(mktemp)
MULTI_OUTFILE=$(mktemp)
rm -f "$MULTI_MARKER"
FAKE_DIR2=$(mktemp -d)
write_fake_curl "$FAKE_DIR2"
write_fake_sleep "$FAKE_DIR2"
set +e
env PATH="$FAKE_DIR2:$PATH" TRAP_MARKER="$MULTI_MARKER" bash -c \
	'trap "echo ran > \"$TRAP_MARKER\"" EXIT; source "$1"; search_request --output "$2" http://fake.invalid/search' \
	_ "$LIB" "$MULTI_OUTFILE" 2>/dev/null
rc=$?
set -e
if [ "$rc" -eq 0 ] && [ -f "$MULTI_MARKER" ] && grep -q ran "$MULTI_MARKER"; then
	pass 'search_request preserves multi-word caller traps'
else
	fail "search_request multi-word trap (rc=$rc marker=$([ -f "$MULTI_MARKER" ] && cat "$MULTI_MARKER" || echo missing))"
fi
rm -f "$MULTI_MARKER" "$MULTI_OUTFILE"
rm -rf "$FAKE_DIR2"

printf '%s\n' '── search skills: secret handling ──'
for f in "$WEB" "$SEARX" "$LIB"; do
	if [ ! -r "$f" ]; then
		fail "secret-handling scan target missing: $f"
		echo "SKIP secret-handling scans (target missing)"
		exit 1
	fi
done
if grep -qE 'printf.*\$\{?DEEPSEEK_API_KEY|echo.*\$\{?DEEPSEEK_API_KEY' "$WEB" "$LIB"; then
	fail 'websearch can print the key value'
else
	pass 'websearch does not print the key value'
fi
if grep -qE 'printf.*\$\{?SEARXNG_URL|echo.*\$\{?SEARXNG_URL' "$SEARX" "$LIB"; then
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

printf '%s\n' '── websearch: retry helper and cross-backend hint ──'
if grep -q 'HTTP_STATUS=$(search_request' "$WEB"; then
	pass 'websearch invokes the shared search_request retry helper'
else
	fail 'websearch does not invoke search_request'
fi
if grep -q -- '--write-out' "$WEB"; then
	fail 'websearch retains an inline curl --write-out (should use search_request)'
else
	pass 'websearch has no inline curl --write-out'
fi
WEB_HINT_COUNT=$(grep -c 'the searxng skill is an alternative search backend' "$WEB" || true)
if [ "$WEB_HINT_COUNT" -eq 2 ]; then
	pass 'websearch hints at the searxng fallback on both failure paths'
else
	fail "websearch fallback hint count is $WEB_HINT_COUNT (expected 2)"
fi

printf '%s\n' '── searxng: retry helper and cross-backend hint ──'
if grep -q 'HTTP_STATUS=$(search_request' "$SEARX"; then
	pass 'searxng invokes the shared search_request retry helper'
else
	fail 'searxng does not invoke search_request'
fi
if grep -q -- '--write-out' "$SEARX"; then
	fail 'searxng retains an inline curl --write-out (should use search_request)'
else
	pass 'searxng has no inline curl --write-out'
fi
SEARX_HINT_COUNT=$(grep -c 'the websearch skill is an alternative search backend' "$SEARX" || true)
if [ "$SEARX_HINT_COUNT" -eq 2 ]; then
	pass 'searxng hints at the websearch fallback on both failure paths'
else
	fail "searxng fallback hint count is $SEARX_HINT_COUNT (expected 2)"
fi

printf '\nsearch_skills_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
























# vim: ft=sh sts=4 sw=4 ts=4 et :
