# Resilience Audit Remediation — Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Remediate all five findings of the resilience audit — retry/backoff on the search skills (R1), bounded CI downloads (T1), cross-backend hints (G1), guarded `gh api` timeout (T2), documented disposition (B1).

**Architecture:** One shared `search_request` retry helper in `search_common.sh` consumed by both `search.sh` scripts (identical retry policy, one tested implementation); a guarded `gh_api()` wrapper in `setup-rulesets.sh`; two curl flag lines in `ci.yml`.

**Tech Stack:** bash 4+ (scripts), curl, GitHub Actions YAML, existing shell test harnesses (`counter_helpers.sh`, `test_helpers.sh`).

## Global constraints

- No new env-var surface — retry constants are fixed: 3 attempts, 2s/4s backoff.
- No `curl --retry-all-errors` anywhere; never retry 4xx other than 429.
- Existing exit codes and error messages are byte-identical contracts — retries are silent; the helper exits nonzero on final transport failure so the callers' `|| { … exit 5 }` blocks fire unchanged.
- B1 = disposition only: **no `ci.yml` job-structure changes**; T1's retry absorbs the flake.
- T2 touches only the 6 `gh api` sites — `gh auth status` and `gh repo view` stay bare.
- No new committed files (the fake-curl test double is runtime-generated, like the existing fake-gh shim) — no RCS-header work.
- Tabs for indentation in `.sh` sources; existing YAML indentation in `ci.yml`; every commit in conventional format with `Authored-by` / `Implemented-by` / `Tested-by` / `Signed-off-by` footers (identity via `resolve-identity.sh` → `kyau <kyau@kyau.net>`).
- Spec ref: `docs/specs/2026-08-16-resilience-audit-remediation-spec.md` (D1–D7).

---

### Task 1: `search_request` retry helper (R1 core)

**Files:**
- Modify: `packages/prism-core/skills/lib/search_common.sh` (append function + docblock after `require_posint`)
- Test: `tests/Shell/search_skills_test.sh` (append fake-curl shim + 6 cases after the "unit contract" section)

**Interfaces:**
- Consumes: nothing new (uses `curl` from PATH).
- Produces: `search_request <curl-args...>` — prints final HTTP status on stdout; exits 0 on final HTTP answer (including exhausted 429/5xx), exits nonzero on final transport failure. Consumed by Tasks 2–3.

- [ ] **Step 1: Write the failing test**

Append to `tests/Shell/search_skills_test.sh` (after the `unit_rc` block):

```bash
# ── search_request retry helper: fake curl ───────────────────────────────────
# FAKE_CURL_SEQ — colon-separated per-attempt status list; "X" = transport
#                 failure (exit 1, stderr message)
# FAKE_CURL_LOG — file receiving the running invocation count
write_fake_curl() {
	local dir="$1"
	cat > "$dir/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -euo pipefail

out=''
while [ $# -gt 0 ]; do
	if [ "$1" = "--output" ]; then
		out="$2"
		shift 2
		continue
	fi
	shift
done
printf 'fake body\n' > "$out"

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
printf '%s' "$status"
FAKE_CURL
	chmod +x "$dir/curl"
}

search_request_case() {
	local label="$1" seq="$2" expected_out="$3" expected_rc="$4" expected_invocations="$5"
	local fake_bin log outfile out rc invocations
	fake_bin=$(mktemp -d)
	log=$(mktemp)
	outfile=$(mktemp)
	write_fake_curl "$fake_bin"
	export FAKE_CURL_SEQ="$seq" FAKE_CURL_LOG="$log"
	set +e
	out=$(env PATH="$fake_bin:$PATH" bash -c \
		'source "$1"; search_request --output "$2" http://fake.invalid/search' \
		_ "$LIB" "$outfile" 2>/dev/null)
	rc=$?
	set -e
	unset FAKE_CURL_SEQ FAKE_CURL_LOG
	invocations=$(cat "$log" 2>/dev/null || true)
	invocations="${invocations:-0}"
	if [ "$rc" -eq "$expected_rc" ] && [ "$out" = "$expected_out" ] \
		&& [ "$invocations" -eq "$expected_invocations" ]; then
		pass "$label"
	else
		fail "$label (rc=$rc out='$out' invocations=$invocations; expected rc=$expected_rc out='$expected_out' invocations=$expected_invocations)"
	fi
	rm -f "$log" "$outfile"
	rm -rf "$fake_bin"
}

printf '%s\n' '── search_request retry helper ──'
search_request_case 'search_request: 200 passes through, single attempt' '200' '200' 0 1
search_request_case 'search_request: 403 is not retried' '403' '403' 0 1
search_request_case 'search_request: 429 then 200 retries once' '429:200' '200' 0 2
search_request_case 'search_request: transport failures then 200 retries twice' 'X:X:200' '200' 0 3
search_request_case 'search_request: 429 thrice gives up after 3 attempts' '429:429:429' '429' 0 3
search_request_case 'search_request: transport failures thrice exit nonzero' 'X:X:X' '' 1 3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/search_skills_test.sh`
Expected: the 6 new cases FAIL (`search_request: command not found`); all existing cases still pass.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/prism-core/skills/lib/search_common.sh` after `require_posint`:

```bash
#   - search_request <curl-args...>: runs curl with --silent --show-error
#     and --write-out '%{http_code}' appended, retrying transient outcomes
#     (transport failure, HTTP 429, HTTP >= 500) up to 3 attempts with
#     2s/4s backoff. Prints the final HTTP status on stdout. Exits nonzero
#     on final transport failure.                              exit 1

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
```

Also update the file's header docblock: add the `search_request` bullet to the "Provides" list (same style as the existing bullets).

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/search_skills_test.sh` — Expected: all PASS, `0 failed` (~18s for the backoff sleeps).

- [ ] **Step 5: Commit**

```bash
git add packages/prism-core/skills/lib/search_common.sh tests/Shell/search_skills_test.sh
git commit -S -m $'feat(search): add search_request retry helper\n\nR1 of the resilience audit: shared bounded-backoff retry in\nsearch_common.sh — 3 attempts, 2s/4s, retrying only transport\nfailures, HTTP 429, and HTTP >= 500. Silent retries; exits nonzero\non final transport failure so caller error blocks are unchanged.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 2: websearch retry + cross-backend hint (R1/G1 websearch)

**Files:**
- Modify: `packages/prism-core/skills/websearch/search.sh` (curl block at ~line 78, both `exit 5` paths)
- Test: `tests/Shell/search_skills_test.sh` (append grep assertions after the "query encoding" section)

**Interfaces:**
- Consumes: `search_request` from Task 1.
- Produces: websearch hard-fails via `search_request`; both failure paths print the searxng hint.

- [ ] **Step 1: Write the failing test**

Append to `tests/Shell/search_skills_test.sh`:

```bash
printf '%s\n' '── websearch: retry helper and cross-backend hint ──'
if grep -q 'search_request' "$WEB"; then
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/search_skills_test.sh` — Expected: the 3 new websearch assertions FAIL (no `search_request`; inline `--write-out` present; hint count 0).

- [ ] **Step 3: Write minimal implementation**

In `packages/prism-core/skills/websearch/search.sh`, replace the curl invocation block:

```bash
HTTP_STATUS=$(search_request \
	--output "$RESPONSE_FILE" \
	--request POST \
	--header 'content-type: application/json' \
	--header "x-api-key: ${DEEPSEEK_API_KEY}" \
	--data-binary "@$REQUEST_FILE" \
	--connect-timeout 15 \
	--max-time 180 \
	"$BASE_URL/v1/messages" 2> "$ERROR_FILE") || {
	printf 'websearch: network request failed: ' >&2
	head -c 500 "$ERROR_FILE" >&2 || true
	printf '\n' >&2
	printf 'websearch: hint — if this persists, the searxng skill is an alternative search backend.\n' >&2
	exit 5
}
```

And add the same hint line immediately before the `exit 5` in the HTTP-status block (after the `printf '\n' >&2` that follows the `MESSAGE` node block):

```bash
	printf '\n' >&2
	printf 'websearch: hint — if this persists, the searxng skill is an alternative search backend.\n' >&2
	exit 5
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/search_skills_test.sh` — Expected: all PASS, `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add packages/prism-core/skills/websearch/search.sh tests/Shell/search_skills_test.sh
git commit -S -m $'feat(search): retry and cross-backend hint in websearch\n\nR1/G1: route the DeepSeek POST through search_request and point\nhard failures at the searxng skill as an alternative backend.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 3: searxng retry + cross-backend hint (R1/G1 searxng)

**Files:**
- Modify: `packages/prism-core/skills/searxng/search.sh` (curl block at ~line 68, both `exit 5` paths)
- Test: `tests/Shell/search_skills_test.sh` (append grep assertions)

**Interfaces:**
- Consumes: `search_request` from Task 1.
- Produces: searxng hard-fails via `search_request`; both failure paths print the websearch hint.

- [ ] **Step 1: Write the failing test**

Append to `tests/Shell/search_skills_test.sh`:

```bash
printf '%s\n' '── searxng: retry helper and cross-backend hint ──'
if grep -q 'search_request' "$SEARX"; then
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/search_skills_test.sh` — Expected: the 3 new searxng assertions FAIL; everything else passes.

- [ ] **Step 3: Write minimal implementation**

In `packages/prism-core/skills/searxng/search.sh`, replace the curl invocation block:

```bash
HTTP_STATUS=$(search_request \
	--output "$RESPONSE_FILE" \
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
	printf 'searxng: hint — if this persists, the websearch skill is an alternative search backend.\n' >&2
	exit 5
}
```

And in the HTTP-status block, after the 403 note's `printf '\n' >&2`:

```bash
	printf '\n' >&2
	printf 'searxng: hint — if this persists, the websearch skill is an alternative search backend.\n' >&2
	exit 5
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/search_skills_test.sh` — Expected: all PASS, `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add packages/prism-core/skills/searxng/search.sh tests/Shell/search_skills_test.sh
git commit -S -m $'feat(search): retry and cross-backend hint in searxng\n\nR1/G1: route the SearXNG GET through search_request and point hard\nfailures at the websearch skill as an alternative backend.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 4: Bound and retry CI tool downloads (T1)

**Files:**
- Modify: `.github/workflows/ci.yml` (shellcheck block ~line 100, gitleaks block ~line 121)
- Test: `tests/Shell/pi_ci_contract_test.sh` (append a "resilient tool downloads" section)

**Interfaces:** none (pure workflow hardening).

- [ ] **Step 1: Write the failing test**

Append to `tests/Shell/pi_ci_contract_test.sh` after the "no legacy OpenCode-era surface" section (before the failures check):

```bash
echo "── resilient tool downloads ──"
assert_ci_contains 'curl -fsSL --connect-timeout 10 --max-time 120 --retry 3 --retry-delay 2' 'tool downloads carry timeout and retry bounds'
assert_ci_not_contains 'curl -fsSL -o' 'no unbounded tool downloads remain'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/pi_ci_contract_test.sh` — Expected: the two new assertions FAIL (missing flag line; `curl -fsSL -o` still present); all existing assertions pass.

- [ ] **Step 3: Write minimal implementation**

In `.github/workflows/ci.yml`, in **both** download steps (shellcheck and gitleaks), replace:

```yaml
          curl -fsSL -o "$tmpdir/${archive}" \
```

with:

```yaml
          curl -fsSL --connect-timeout 10 --max-time 120 --retry 3 --retry-delay 2 \
            -o "$tmpdir/${archive}" \
```

(Each block's `sha256sum -c --strict -` on the following lines is unchanged — it keeps guarding integrity, so retries are safe.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/pi_ci_contract_test.sh` — Expected: all PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml tests/Shell/pi_ci_contract_test.sh
git commit -S -m $'fix(ci): bound and retry tool downloads\n\nT1 of the resilience audit: shellcheck and gitleaks downloads get\nconnect/total timeouts and 3 retries; SHA-256 verification still\nguards integrity.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 5: Guarded `gh_api` timeout wrapper (T2)

**Files:**
- Modify: `packages/prism-core/scripts/setup-rulesets.sh` (insert wrapper after the php check ~line 66; change 6 call sites: 135, 141, 231, 261, 271, 285)
- Test: `tests/Shell/setup_rulesets_test.sh` (append tests 29–31 before the Summary)

**Interfaces:**
- Consumes: nothing.
- Produces: `gh_api <args...>` — `timeout 60 gh api "$@"` when GNU `timeout` exists on PATH, else bare `gh api "$@"`. Same stdout/stderr/exit semantics as `gh api`.

- [ ] **Step 1: Write the failing test**

Append to `tests/Shell/setup_rulesets_test.sh` after Test 28 (before the Summary):

```bash
# ── Test 29: All gh api call sites route through the gh_api wrapper ───────────

test_gh_api_call_sites_wrapped() {
	local unwrapped wrapped
	unwrapped=$(grep -cE 'if ! gh api ' "$SCRIPT" || true)
	wrapped=$(grep -cE 'if ! gh_api ' "$SCRIPT" || true)
	if [ "$unwrapped" -eq 0 ] && [ "$wrapped" -eq 6 ]; then
		pass "gh api call sites — all 6 route through gh_api, none bare"
	else
		fail "gh api call sites — unwrapped=$unwrapped wrapped=$wrapped (expected 0 unwrapped, 6 wrapped)"
	fi
}

echo ""
echo "── Test 29: All gh api call sites route through gh_api ──"
test_gh_api_call_sites_wrapped

# ── Test 30: gh_api wraps calls in timeout 60 when timeout exists ──────────────

test_gh_api_uses_timeout_when_available() {
	local fake_bin fake_log timeout_log output exit_code
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	timeout_log=$(mktemp)
	: > "$fake_log"
	: > "$timeout_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"

	cat > "$fake_bin/timeout" <<'TIMEOUT_SHIM'
#!/usr/bin/env bash
echo "$@" >> "${FAKE_TIMEOUT_LOG:?FAKE_TIMEOUT_LOG not set}"
shift
exec gh "$@"
TIMEOUT_SHIM
	chmod +x "$fake_bin/timeout"
	export FAKE_TIMEOUT_LOG="$timeout_log"

	write_fixture_auth "$fake_bin" "ok"
	write_fixture_repo_view "$fake_bin" "testowner/testrepo"
	echo '[]' > "$fake_bin/rulesets-list.json"
	echo "$CANONICAL_MERGE" > "$fake_bin/repo-settings.json"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--dry-run") || exit_code=$?

	unset FAKE_TIMEOUT_LOG FAKE_GH_LOG FAKE_GH_FIXTURES

	if [ "$exit_code" -ne 0 ]; then
		fail "gh_api timeout — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		return
	fi
	if ! grep -q '^60 gh api ' "$timeout_log"; then
		fail "gh_api timeout — no 'timeout 60 gh api' invocation recorded"
		echo "  log: $(cat "$timeout_log")" >&2
		return
	fi
	pass "gh_api timeout — api calls wrapped in timeout 60"
}

echo ""
echo "── Test 30: gh_api wraps calls when timeout exists ──"
test_gh_api_uses_timeout_when_available

# ── Test 31: gh_api falls back to bare gh api when timeout is absent ───────────

test_gh_api_bare_without_timeout() {
	local fake_bin fake_log output exit_code tool
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	# Minimal PATH: bash, php, mktemp, cat, grep, rm — deliberately no timeout
	for tool in bash php mktemp cat grep rm; do
		ln -s "$(command -v "$tool")" "$fake_bin/$tool"
	done

	write_fixture_auth "$fake_bin" "ok"
	write_fixture_repo_view "$fake_bin" "testowner/testrepo"
	echo '[]' > "$fake_bin/rulesets-list.json"
	echo "$CANONICAL_MERGE" > "$fake_bin/repo-settings.json"

	exit_code=0
	output=$(env PATH="$fake_bin" bash "$SCRIPT" --dry-run 2>&1) || exit_code=$?

	unset FAKE_GH_LOG FAKE_GH_FIXTURES

	if [ "$exit_code" -ne 0 ]; then
		fail "gh_api bare — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		return
	fi
	if ! grep -q '^api repos/testowner/testrepo/rulesets' "$fake_log"; then
		fail "gh_api bare — gh api not invoked"
		return
	fi
	pass "gh_api bare — calls gh api directly when timeout is absent"
}

echo ""
echo "── Test 31: gh_api falls back to bare gh api ──"
test_gh_api_bare_without_timeout
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/setup_rulesets_test.sh` — Expected: tests 29–31 FAIL (29: `if ! gh api` count is 6, `gh_api` count 0; 30/31: script aborts with `gh_api: command not found` → exit 2). Existing 28 tests still pass.

- [ ] **Step 3: Write minimal implementation**

In `packages/prism-core/scripts/setup-rulesets.sh`, after the php presence check (before `gh auth status`), insert:

```bash
# ── gh_api: bounded API calls ─────────────────────────────────────────────────
# Wrap gh api with a 60s cap where GNU timeout exists (Linux); fall back to a
# bare call where it does not (macOS/BSD) so the script remains portable.
gh_api() {
	if command -v timeout >/dev/null 2>&1; then
		timeout 60 gh api "$@"
	else
		gh api "$@"
	fi
}
```

Then change the 6 call sites `if ! gh api "…"` → `if ! gh_api "…"` (argument lists unchanged):

- Line 135: `if ! gh_api "repos/$REPO/rulesets" > "$ACTUAL_RULESETS" 2>/dev/null; then`
- Line 141: `if ! gh_api "repos/$REPO" > "$ACTUAL_MERGE" 2>/dev/null; then`
- Line 231: `if ! gh_api "repos/$REPO/rulesets/$RULESET_ID" > "$ACTUAL_RULESET" 2>/dev/null; then`
- Line 261: `if ! gh_api "repos/$REPO/rulesets" -X POST --input "$RULESET_PAYLOAD" >/dev/null 2>"$API_ERR"; then`
- Line 271: `if ! gh_api "repos/$REPO/rulesets/$RULESET_ID" -X PUT --input "$RULESET_PAYLOAD" >/dev/null 2>"$API_ERR"; then`
- Line 285: `if ! gh_api "repos/$REPO" -X PATCH --input "$MERGE_SETTINGS_PAYLOAD" >/dev/null 2>"$API_ERR"; then`

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/setup_rulesets_test.sh` — Expected: all 31 tests PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/prism-core/scripts/setup-rulesets.sh tests/Shell/setup_rulesets_test.sh
git commit -S -m $'feat(scripts): cap gh api calls with guarded timeout\n\nT2 of the resilience audit: gh_api wrapper applies a 60s cap where\nGNU timeout exists and falls back to a bare call elsewhere, keeping\nsetup-rulesets.sh portable to macOS/BSD.\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Final verification (after Task 5)

```bash
bash tests/Shell/search_skills_test.sh
bash tests/Shell/setup_rulesets_test.sh
bash tests/Shell/setup_rulesets_command_test.sh
bash tests/Shell/pi_ci_contract_test.sh
shellcheck packages/prism-core/skills/lib/search_common.sh packages/prism-core/skills/websearch/search.sh packages/prism-core/skills/searxng/search.sh packages/prism-core/scripts/setup-rulesets.sh
```

Then `/check` (harness gate) and `code-review` before push. B1 requires no task — its disposition is documented in the spec (D6).
