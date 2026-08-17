# Resilience Audit Remediation — Spec

- **Date:** 2026-08-16
- **Source:** `audits/2026-08-16-resilience-audit.md` (analyzed commit `0ad9930`; every finding re-verified against `develop` `588c0f7`)
- **Status:** Approved (design discussion 2026-08-16)
- **Type:** fix (resilience hardening — additive only, no behavior delta on existing outcomes)

## Background

An external resilience audit (5 findings, R1…B1) was triaged against the
current `develop` HEAD. All five findings are live; four receive code
changes, one is dispositioned with written rationale:

| # | Finding | Imp. | Verdict at `588c0f7` |
|---|---------|------|----------------------|
| R1 | No retry/backoff on any network call — both `search.sh` scripts single-shot (timeouts only) | 6 | **Live** — `websearch/search.sh:80`, `searxng/search.sh:68` curl invocations carry `--connect-timeout`/`--max-time` but zero retry; every transient 429/5xx/connection-reset fails the whole skill invocation |
| T1 | CI curl downloads lack timeout/retry | 5 | **Live** — `ci.yml:100` (shellcheck) and `:121` (gitleaks, added since the audit) are bare `curl -fsSL`; a stalled TCP connection hangs until the job's `timeout-minutes` kills the whole job. Both are SHA-256-pinned, so retries are safe |
| G1 | No cross-backend fallback hint between the two search skills | 3 | **Live** — both scripts hard-fail (`exit 5`) with no hint that the sibling skill exists |
| T2 | `gh api` calls without explicit timeout wrapper | 2 | **Live** — `setup-rulesets.sh:135,141,231,261,271,285` rely on gh's internal timeouts; failures are checked and reported. GNU `timeout` is not portable to macOS, so the audit's literal remediation needs a guard |
| B1 | CI tool-install flakes share the failure domain with test results | 2 | **Disposition** — the audit itself rates the job split "optional" and calls T1's retry "the cheaper 90% solution"; existing bulkheads (per-job `timeout-minutes`, semgrep venv isolation) already present |

The two skills' requests are idempotent (search POST/GET with no side
effects), so retrying is safe. Both scripts exit 5 on transport failure and
on any non-2xx; the retry helper must preserve those contracts exactly.

## Goals

1. **R1:** a shared `search_request` retry helper in
   `packages/prism-core/skills/lib/search_common.sh`; both `search.sh`
   scripts use it. Transient outcomes (transport failure, HTTP 429, HTTP
   ≥ 500) retry up to 3 attempts with 2s/4s backoff; all other 4xx and
   every 2xx pass through unchanged.
2. **T1:** both CI download curls (`ci.yml:100`, `:121`) gain
   `--connect-timeout 10 --max-time 120 --retry 3 --retry-delay 2`.
3. **G1:** each search script prints a one-line hint naming the sibling
   skill on **both** hard-failure paths (transport failure and HTTP error).
4. **T2:** a guarded `gh_api()` wrapper in `setup-rulesets.sh` caps each of
   the 6 `gh api` calls at 60s where GNU `timeout` exists; falls back to a
   bare `gh api` where it does not (macOS/BSD — zero behavior delta).
5. **B1:** documented disposition — T1's retry absorbs the install-flake
   mechanism; no CI job split.

## Non-goals

- **No CI job split** (B1). The single `verify` job stays; the disposition
  section below records why.
- **No `curl --retry-all-errors`** — retries only transient outcomes;
  pointless 4xx (bad key, JSON-disabled instance) are never retried, and no
  curl ≥ 7.71 version floor is introduced.
- **No new env-var surface** for retry tuning — fixed constants (3 attempts,
  2s/4s backoff). YAGNI; the audit's numbers are sane.
- **No changes to `gh auth status` or `gh repo view`** — T2 scopes to the 6
  `gh api` sites; auth status is local, repo view is a single-shot probe
  with existing failure handling.
- **No `release.yml` changes** — it contains no curl downloads.
- **No behavior delta** on any existing exit code, error message, success
  output, or `--retry`-less invocation. Every change is additive resilience
  hardening.

## Design

### D1 — `search_request` helper in `search_common.sh` (R1)

New function in `packages/prism-core/skills/lib/search_common.sh`, added to
the file's contract docblock (which already documents each helper's exit
code and message as stable contract):

```bash
#   - search_request <curl-args...>: runs curl with --silent --show-error
#     and --write-out '%{http_code}' appended, retrying transient outcomes
#     (transport failure, HTTP 429, HTTP >= 500) up to 3 attempts with
#     2s/4s backoff. Prints the final HTTP status on stdout. Exits nonzero
#     (curl's rc) on final transport failure.         exit (curl's rc)
search_request() {
	local attempt=0
	local status=''
	while :; do
		if status=$(curl --silent --show-error --write-out '%{http_code}' "$@"); then
			if [ "$status" != "429" ] && [ "$status" -lt 500 ]; then
				break
			fi
		fi
		attempt=$((attempt + 1))
		if [ "$attempt" -ge 3 ]; then
			break
		fi
		sleep $((2 * attempt))   # 2s, 4s — bounded linear backoff
	done
	printf '%s\n' "$status"
	[ -n "$status" ]
}
```

Semantics, precisely:

- The caller passes everything except `--silent --show-error` and
  `--write-out '%{http_code}'`, including `--output "$FILE"`, method,
  headers, data, `--connect-timeout`, `--max-time`, and the URL.
- Retry predicate: curl exit code ≠ 0 (transport failure), or HTTP status
  exactly 429, or HTTP status ≥ 500. Anything else — 2xx, 400, 401, 403,
  and the rest of 4xx — breaks immediately.
- Backoff: 2s after the first failure, 4s after the second; 3 attempts
  total (1 initial + 2 retries). Max added latency 6s per invocation;
  `--max-time` still bounds each attempt.
- Retries are silent — no stderr noise between attempts; the caller's
  existing error reporting (unchanged) is the single source of failure
  messages.
- Final transport failure: curl writes `000` to stdout (its write-out
  value for a failed transfer) and exits nonzero; the `else` branch
  captures that rc, and the final `[ "$curl_rc" -eq 0 ]` exits nonzero —
  so the callers' `|| { … exit 5 }` transport blocks fire exactly as
  today. The `000` status is never interpreted as an HTTP answer. A final
  HTTP error (e.g. 429 after retries) prints the status and exits 0, so
  the callers' HTTP-status block reports it exactly as today.
- `set -euo pipefail` safety: the `if status=$(curl ...)` guard prevents
  `set -e` abort, and the function is invoked from a guarded `||` context
  in both callers (which also suppresses `set -e` for the function body);
  `status` and `curl_rc` are assigned every iteration.

### D2 — `websearch/search.sh` call-site change (R1, G1)

- Replace the inline curl invocation (currently `HTTP_STATUS=$(curl
  --silent --show-error ... 2> "$ERROR_FILE") || { ... exit 5; }`) with
  `HTTP_STATUS=$(search_request --output "$RESPONSE_FILE" --request POST
  --header 'content-type: application/json' --header "x-api-key:
  ${DEEPSEEK_API_KEY}" --data-binary "@$REQUEST_FILE" --connect-timeout 15
  --max-time 180 "$BASE_URL/v1/messages" 2> "$ERROR_FILE") || { ... exit 5;
  }`. The transport-failure block, the HTTP-status block, and the
  `head -c 500 "$ERROR_FILE"` reporting stay byte-identical. The
  `2> "$ERROR_FILE"` redirection wraps the function call, so curl's stderr
  still flows into `$ERROR_FILE`.
- Add the G1 hint to **both** failure paths, immediately before each
  `exit 5`:
  - transport block: `printf 'websearch: hint — if this persists, the searxng skill is an alternative search backend.\n' >&2`
  - HTTP-error block: the same line.

### D3 — `searxng/search.sh` call-site change (R1, G1)

- Same pattern: replace the inline curl with
  `HTTP_STATUS=$(search_request --output "$RESPONSE_FILE" --get
  "$BASE_URL/search" --data-urlencode "q=$QUERY" --data-urlencode
  'format=json' --data-urlencode "language=$LANGUAGE" --data-urlencode
  "categories=$CATEGORIES" --data-urlencode "safesearch=$SAFESEARCH"
  --connect-timeout 10 --max-time 60 2> "$ERROR_FILE") || { ... exit 5; }`.
- Add the mirrored hint (`searxng: hint — if this persists, the websearch
  skill is an alternative search backend.`) to both failure paths.

### D4 — CI download flags (T1)

Both `ci.yml` download steps (shellcheck at ~line 100, gitleaks at ~line
121) change:

```yaml
curl -fsSL --connect-timeout 10 --max-time 120 --retry 3 --retry-delay 2 \
  -o "$tmpdir/${archive}" \
  "https://..."
```

No `--retry-all-errors`: only transient errors (timeouts, resets, 429, 5xx)
are retried, and the next line's `sha256sum -c --strict -` still guards
integrity — retries cannot admit a corrupt archive.

### D5 — `gh_api()` guarded wrapper (T2)

In `setup-rulesets.sh`, after the `gh`/`php` presence checks:

```bash
# gh_api: wrap gh api with a 60s cap where GNU timeout exists (Linux);
# fall back to a bare call where it does not (macOS/BSD) so the script
# remains portable.
gh_api() {
	if command -v timeout >/dev/```bash
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
``` 2>&1; then
		timeout 60 gh api "$@"
	else
		gh api "$@"
	fi
}
```

The 6 call sites (lines 135, 141, 231, 261, 271, 285) change `gh api` →
`gh_api`, argument lists unchanged. Each call's existing `if ! ... then
echo "Error: ..." >&2` handling is untouched.

### D6 — B1 disposition (documented in this spec)

The audit's B1 finding ("CI jobs share one failure domain per job;
a shellcheck-download flake fails the test signal too") is dispositioned:

- **Mechanism absorbed:** T1's `--retry 3 --retry-delay 2` makes the
  download flake self-healing — the specific failure the finding worries
  about no longer reaches the test signal.
- **Existing bulkheads:** per-job `timeout-minutes` (all jobs), semgrep
  venv isolation under mktemp, and step-level `set -euo pipefail` already
  bound blast radius.
- **Split rejected as disproportionate:** the workflow is a single `verify`
  job; a split requires `needs:`, artifact upload/download, and PATH
  propagation for a ~5MB download that T1 already immunizes, adding a new
  failure mode (artifact round-trips) to fix a 2/10 finding whose own
  author calls the split optional.
- **Revisit trigger:** if install flakes recur in CI after T1 ships, the
  split (or `actions/cache` keyed on version+SHA) becomes the follow-up.

### D7 — Tests

- **Extend `tests/Shell/search_skills_test.sh`** with a fake-curl PATH
  shim: a temp directory containing an executable `curl` that (a) writes
  its `--output` argument file, (b) prints the configured HTTP status to
  stdout (per-attempt status sequence read from a control file, so
  retry-then-success scenarios are expressible), (c) exits 1 on attempts
  marked as transport failures, and (d) counts invocations in a counter
  file. Cases:
  - 200 on first attempt → helper prints `200`, exits 0, curl invoked once.
  - 429 then 200 → prints `200`, curl invoked twice.
  - transport failure twice then 200 → prints `200`, curl invoked 3 times.
  - 429 three times → prints `429`, exits 0, curl invoked 3 times (cap).
  - transport failure three times → helper exits nonzero, curl invoked
    3 times (cap).
  - 403 (non-retryable 4xx) → prints `403`, exits 0, curl invoked once.
  - Real 2s/4s sleeps — worst case ~6s in one test, acceptable for the
    shell suite (consistent with the suite's existing real-execution
    style).
  - Grep assertions (existing suite style): both scripts now invoke
    `search_request` and no longer contain an inline `--write-out` curl;
    both G1 hint lines present in both failure paths of each script.
- **Extend `tests/Shell/setup_rulesets_test.sh`** with `timeout`/`gh` PATH
  stubs: with a fake `timeout` on PATH, `gh_api …` is observed invoking
  `timeout 60 gh api …`; with no `timeout` on PATH, `gh_api …` invokes a
  bare `gh api …`. (Stub mechanics follow the suite's existing
  pass/fail/counter harness; exact seam confirmed during planning.)
- **No PHP changes** — the `/check-php` coverage gate is unaffected.

## Verification

1. `bash tests/Shell/search_skills_test.sh` — existing + new cases green.
2. `bash tests/Shell/setup_rulesets_test.sh` — existing + new cases green.
3. `bash tests/Shell/setup_rulesets_command_test.sh` — unchanged, green.
4. `shellcheck` on the three changed scripts (search_common.sh,
   websearch/search.sh, searxng/search.sh, setup-rulesets.sh).
5. `/check` — full harness gate (delegates to the PHP stack gate; no PHP
   files change, so the coverage gate is unaffected).
6. `code-review` before push (suggest Ctrl+P to the judge model).

## Risks & decisions

- **Silent retries** — the calling agent sees only the final failure
  message; transient retries are invisible. Chosen to keep the error
  contract byte-identical; a retry log line would change stderr output.
- **Linear 2s/4s backoff, fixed constants** — the audit proposed `2 ** n`
  exponential (1s/2s/4s); 2s/4s linear is simpler to reason about and
  bound, matches the audit's stated intent ("2s, 4s"), and avoids a
  fractional first sleep. No env-var tuning surface (YAGNI).
- **Helper exits 1 (not curl's rc) on final transport failure** — the
  documented contract is "exits nonzero"; both callers' `||` blocks do not
  inspect the value. The rc is captured (not swallowed by the `if` guard)
  because curl's write-out prints `000` on failure — without the explicit
  `curl_rc` check, a final transport failure would masquerade as HTTP 000
  and route into the callers' HTTP-error block instead of the transport
  block.
- **`gh_api` guard keeps macOS portable** — GNU `timeout` absent → bare
  call; the script's existing `command -v` pattern (gh, php) is extended
  rather than assuming Linux.
- **Fake-curl shim sleeps are real** — avoids env-var test seams in
  production code; 6s worst case is within the shell suite's tolerance.
- **Spec rides the work branch** — develop is PR-only (protected-branch
  invariant); the spec commits on
  `fix/kyau-1e9d-resilience-audit-remediation` and merges via PR, like the
  error-handling and readability-naming remediations.
- **One branch, atomic commits per finding** — `fix(search): …`,
  `fix(ci): …`, `fix(scripts): …`, each independently reviewable under this
  spec.
