# Resilience Audit Remediation — Spec

- **Date:** 2026-08-16
- **Source:** `audits/2026-08-16-resilience-audit.md` (analyzed commit `0ad9930`; every finding re-verified against `develop` `588c0f7`)
- **Status:** Approved (design discussion 2026-08-16; post-review hardening 2026-08-16)
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

The two skills' requests are idempotent in effect (search POST/GET with no
side effects beyond API billing), so retrying is safe with the caveats
recorded in D1 and Risks. Both scripts exit 5 on transport failure and on
any non-2xx; the retry helper must preserve those contracts exactly.

A post-approval code review (four axes incl. OCR, findings F1–F11) hardened
the design further: D1 (timeout never retried; `Retry-After` honored),
D5 (`run_gh` bounds `gh repo view` too; `gtimeout` fallback), D7 (test
strengthening), and the Risks section. All review findings are resolved in
this spec.

## Goals

1. **R1:** a shared `search_request` retry helper in
   `packages/prism-core/skills/lib/search_common.sh`; both `search.sh`
   scripts use it. Transient outcomes (fast transport failures, HTTP 429
   honoring `Retry-After`, HTTP ≥ 500) retry up to 3 attempts with 2s/4s
   backoff; a curl timeout (rc 28) is never retried; all other 4xx and
   every 2xx pass through unchanged.
2. **T1:** both CI download curls (`ci.yml:100`, `:121`) gain
   `--connect-timeout 10 --max-time 120 --retry 3 --retry-delay 2`.
3. **G1:** each search script prints a one-line hint naming the sibling
   skill on **both** hard-failure paths (transport failure and HTTP error).
4. **T2:** guarded `run_gh`/`gh_api` wrappers in `setup-rulesets.sh` cap
   every `gh` network call (`gh api` ×6 and `gh repo view`) at 60s where
   GNU `timeout` or Homebrew `gtimeout` exists; fall back to a bare call
   only where neither is available (zero behavior delta on macOS/BSD).
5. **B1:** documented disposition — T1's retry absorbs the install-flake
   mechanism; no CI job split.

## Non-goals

- **No CI job split** (B1). The single `verify` job stays; the disposition
  section below records why.
- **No `curl --retry-all-errors`** — retries only transient outcomes;
  pointless 4xx (bad key, JSON-disabled instance) are never retried, and no
  curl ≥ 7.71 version floor is introduced.
- **No new env-var surface** for retry tuning — fixed constants (3 attempts,
  2s/4s backoff, `Retry-After` capped at 30s). YAGNI; the audit's numbers
  are sane.
- **No unbounded `gh` invocations remain** — `gh auth status`,
  `gh repo view`, and all 6 `gh api` calls route through `run_gh`
  (post-review F2/F5).
- **No `release.yml` changes** — it contains no curl downloads.
- **No behavior delta** on any existing exit code, error message, success
  output, or `--retry`-less invocation. Every change is additive resilience
  hardening.

## Design

### D1 — `search_request` helper in `search_common.sh` (R1)

New function in `packages/prism-core/skills/lib/search_common.sh`, added to
the file's contract docblock (which already documents each helper's exit
code and message as stable contract). Post-review F4/F5/F6 hardening is
included: a curl timeout (rc 28) is never retried (the server outcome is
unknown — retrying could duplicate a billed request and would extend the
request window), and a 429 honors `Retry-After` (capped at 30s) before
falling back to the fixed backoff.

```bash
#   - search_request <curl-args...>: runs curl with --silent --show-error,
#     --write-out '%{http_code} %{errormsg}', and a private --dump-header
#     temp file, retrying transient outcomes (fast transport failures,
#     connect timeouts, HTTP 429 honoring integer Retry-After capped at
#     30s, HTTP >= 500) up to 3 attempts with 2s/4s backoff. A max-time
#     expiry (rc 28 with no connect-timeout error) is never retried: the
#     server outcome is unknown, so retrying could duplicate a billed
#     request and would extend the request window. Callers must pass
#     --output FILE so the response body is not captured into the status.
#     Prints the final HTTP status on stdout. Exits nonzero on final
#     transport failure.                                    exit 1

search_request() {
	local attempt=0 status='' http_code='' curl_rc=0 header_file retry_after prev_trap chain
	header_file=$(mktemp)
	# Chain our cleanup onto the caller's EXIT trap (if any) so an
	# interrupted run removes the private header file; restore after.
	prev_trap=$(trap -p EXIT 2>/dev/null || true)
	if [ -n "$prev_trap" ]; then
		chain=$(printf '%s' "$prev_trap" | sed 's/^trap -- //; s/ EXIT$//')
		# shellcheck disable=SC2064  # header_file is fixed at registration
		trap -- "rm -f \"$header_file\"; $chain" EXIT
	else
		# shellcheck disable=SC2064  # header_file is fixed at registration
		trap -- "rm -f \"$header_file\"" EXIT
	fi
	while :; do
		: > "$header_file"
		if status=$(curl --silent --show-error --write-out '%{http_code} %{errormsg}' --dump-header "$header_file" "$@"); then
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
			retry_after=$(awk -F': ' 'tolower($1) == "retry-after" && $2 ~ /^[0-9]+$/ { print $2; exit }' "$header_file")
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
```

Semantics, precisely:

- The caller passes everything except `--silent --show-error`,
  `--write-out '%{http_code}'`, and the private `--dump-header` file —
  including `--output "$FILE"`, method, headers, data, `--connect-timeout`,
  `--max-time`, and the URL. **Callers must pass `--output FILE`** so the
  response body is never captured into the status (F4).
- Retry predicate: curl exit code ≠ 0 with rc ≠ 28 (fast transport
  failure), **rc 28 with a connect-timeout error** (never reached the
  server), HTTP status exactly 429, or HTTP status ≥ 500. Anything else —
  2xx, 400, 401, 403, the rest of 4xx, and **rc 28 from a max-time expiry**
  (outcome unknown) — breaks immediately. The `%{errormsg}` payload
  distinguishes the two rc-28 cases.
- Backoff: 2s after the first failure, 4s after the second; 3 attempts
  total (1 initial + 2 retries). On a 429, `Retry-After` (integer seconds
  only — fractional/date forms degrade cleanly to the fixed backoff) from
  the response headers replaces the fixed backoff, capped at 30s. Max
  added latency 6s per invocation plus honored `Retry-After`; `--max-time`
  still bounds each attempt.
- Retries are silent — no stderr noise between attempts; the caller's
  existing error reporting (unchanged) is the single source of failure
  messages.
- Final transport failure: the `else` branch captures the rc, the status
  is printed only when a response was received (nothing on stdout for
  transport failures), and the final `[ "$curl_rc" -eq 0 ]` exits nonzero
  — so the callers' `|| { … exit 5 }` transport blocks fire exactly as
  today. A final HTTP error (e.g. 429 after retries) prints the status
  and exits 0, so the callers' HTTP-status block reports it exactly as
  today. The private header file is removed on normal completion AND on
  interrupt: the helper chains its cleanup onto the caller's EXIT trap
  (preserving the caller's trap verbatim) and restores it afterwards.
- `set -euo pipefail` safety: the `if status=$(curl ...)` guard prevents
  `set -e` abort, and the function is invoked from a guarded `||` context
  in both callers (which also suppresses `set -e` for the function body);
  `status` and `curl_rc` are assigned every iteration; the header file is
  truncated before each attempt so a stale `Retry-After` cannot leak.

### D2 — `websearch/search.sh` call-site change (R1, G1)

- Replace the inline curl invocation with `search_request`, keeping
  `--output`, `--request POST`, headers, data, `--connect-timeout 15`,
  `--max-time 180`, the URL, and the `2> "$ERROR_FILE"` redirection on the
  function call. The transport-failure block, the HTTP-status block, and
  the `head -c 500 "$ERROR_FILE"` reporting stay byte-identical.
- Add the G1 hint to **both** failure paths, immediately before each
  `exit 5`:
  - transport block: `printf 'websearch: hint — if this persists, the searxng skill is an alternative search backend.\n' >&2`
  - HTTP-error block: the same line.

### D3 — `searxng/search.sh` call-site change (R1, G1)

- Same pattern: replace the inline curl with `search_request`, keeping
  `--output`, `--get`, the `--data-urlencode` fields, `--connect-timeout
  10`, `--max-time 60`, and the `2> "$ERROR_FILE"` redirection.
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

### D5 — `run_gh`/`gh_api` guarded wrappers (T2)

In `setup-rulesets.sh`, after the `gh`/`php` presence checks, define a
single bounded runner and a thin `gh api` shim over it. Post-review F1/F2
hardening: the runner also falls back to Homebrew coreutils `gtimeout`,
and `gh repo view` (the repository detection call) is bounded too — the
only unbounded `gh` invocation left is `gh auth status`, which is local.

```bash
# ── run_gh: bounded GitHub CLI calls ─────────────────────────────────────────
# Wrap gh with a 60s cap where GNU timeout (or Homebrew coreutils gtimeout)
# exists; fall back to a bare call only where neither is available, keeping
# the script portable to macOS/BSD.
run_gh() {
	if command -v timeout >/dev/null 2>&1; then
		timeout 60 gh "$@"
	elif command -v gtimeout >/dev/null 2>&1; then
		gtimeout 60 gh "$@"
	else
		gh "$@"
	fi
}

# gh_api: every gh api call is bounded via run_gh.
gh_api() {
	run_gh api "$@"
}
```

- The 6 `gh api` call sites (lines 135, 141, 231, 261, 271, 285) change
  `gh api` → `gh_api`, argument lists unchanged. `gh_api` captures the
  call's rc via the canonical `cmd || rc=$?` idiom — a naive `if cmd;
  then …; fi; local rc=$?` would capture 0 (an `if` with no true branch
  exits 0), silently swallowing every failure.
- `REPO=$(gh repo view --json nameWithOwner 2>/dev/null | php -r …)`
  becomes `REPO=$(run_gh repo view --json nameWithOwner 2>/dev/null | php
  -r …)`.
- `gh auth status` also routes through `run_gh` — every `gh` invocation in
  the script is bounded (post-review F5).
- A call killed by `timeout`/`gtimeout` (exit 124) gets a distinct stderr
  diagnostic `gh: timed out after 60s — request outcome unknown` before
  the exit status propagates — the outcome of an `--apply` mutation may
  be unknown, not failed (post-review F6).
- Each call's existing `if ! ... then echo "Error: ..." >&2` handling is
  untouched.

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
  shim driven by `FAKE_CURL_SEQ` (colon-separated per-attempt statuses;
  `X` = fast transport failure exit 1, `T` = timeout exit 28) and
  `FAKE_CURL_RETRY_AFTER` (writes a `retry-after:` header via
  `--dump-header`). The shim parses `--output FILE`, `--output=FILE`,
  `-o FILE`, and `-oFILE` (F10), counts invocations in `FAKE_CURL_LOG`,
  and writes the body before deciding success. The case runner asserts
  rc, stdout status, invocation count, the output body on rc=0 cases
  (F9), and includes captured stderr in failures (F11). Cases:
  - 200 on first attempt → prints `200`, exits 0, curl invoked once.
  - 403 (non-retryable 4xx) → prints `403`, exits 0, curl invoked once.
  - `T` (timeout) → exits nonzero, curl invoked **once** (never retried).
  - 429 then 200 → prints `200`, curl invoked twice.
  - 429 with `Retry-After: 1` then 200 → prints `200`, curl invoked twice
    (honors the header; 1s sleep instead of 2s).
  - transport failure twice then 200 → prints `200`, curl invoked 3 times.
  - 429 three times → prints `429`, exits 0, curl invoked 3 times (cap).
  - transport failure three times → helper exits nonzero, curl invoked
    3 times (cap).
  - Real sleeps — worst case ~21s in the section, acceptable for the shell
    suite.
  - Grep assertions (existing suite style): both scripts invoke
    `search_request` and no longer contain an inline `--write-out` curl;
    both G1 hint lines present in both failure paths of each script.
- **Extend `tests/Shell/setup_rulesets_test.sh`**:
  - Test 29 (F7): static audit — strips the `gh_api()` definition and
    comment lines (assumes `gh_api() {` at column 0 closed by a column-0
    `}`), then asserts **zero** remaining `gh api ` mentions (occurrence
    counting via `grep -o | wc -l`, so multiple calls on one line cannot
    hide) and at least one wrapped site — no magic count.
  - Test 30: with a fake `timeout` shim on PATH (recording to
    `FAKE_TIMEOUT_LOG`), `--dry-run` succeeds and the log contains
    `60 gh api …`, `60 gh repo view …`, and `60 gh auth status` (F2/F5).
  - Test 31: minimal PATH without `timeout`/`gtimeout` → bare `gh api`
    fallback; the required external tool set (bash, php, mktemp, cat,
    grep, rm) is documented AND preflighted — a missing symlink fails
    with a clear message (F8).
  - Test 32: minimal PATH with only a fake `gtimeout` shim (host
    `/usr/bin/timeout` hidden) → `gtimeout 60 gh api …` recorded (F1).
  - Test 33 (F6): a timeout shim that kills mutation verbs (exit 124)
    under `--apply` with drifted fixtures → exit 2 and the output names
    `timed out after 60s — request outcome unknown`.
- **Extend `tests/Shell/pi_ci_contract_test.sh`** (F1/F2): occurrence
  counting (`grep -o | wc -l`) of `curl -fsSL` versus the full
  bound-flag sequence per invocation proves **every** download is
  bounded — reformatted, reordered, or multi-per-line downloads cannot
  evade, and the zero-download case reports distinctly.

## Verification

1. `bash tests/Shell/search_skills_test.sh` — existing + new cases green.
2. `bash tests/Shell/setup_rulesets_test.sh` — 32 tests green.
3. `bash tests/Shell/setup_rulesets_command_test.sh` — unchanged, green.
4. `bash tests/Shell/pi_ci_contract_test.sh` — contract green.
5. `shellcheck` on the changed scripts (search_common.sh,
   websearch/search.sh, searxng/search.sh, setup-rulesets.sh).
6. `/check` — full harness gate (delegates to the PHP stack gate; no PHP
   files change, so the coverage gate is unaffected).
7. `code-review` before push (four axes, OCR egress approved).

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
- **A curl timeout (rc 28) is never retried (F5/F6)** — the server may
  have processed the request before the connection dropped; retrying could
  duplicate a billed inference POST, and each retry re-arms the full
  `--max-time` budget (3 × 180s ≈ 9min worst case before this rule).
  Fast transport failures (refused/reset/DNS) and answered 429/5xx are
  cheap and unambiguous, so they keep retrying. Worst-case window after
  this rule: one hung attempt (≤ `--max-time`) plus fast-failure retries.
- **`Retry-After` honored, capped at 30s (F6)** — a 429 with an integer
  `Retry-After` replaces the fixed backoff so rate-limited requests do not
  hammer; the cap keeps the total window bounded and the HTTP-date form
  (unparseable) falls back to the fixed backoff.
- **`run_gh` guards keep macOS portable (F1/F2)** — GNU `timeout` absent →
  Homebrew `gtimeout` → bare call; the script's existing `command -v`
  pattern (gh, php) is extended rather than assuming Linux. Every `gh`
  invocation is bounded, including `gh auth status` (post-review F5).
- **Worst-case request window is accepted (OCR F3)** — a websearch call
  can reach ~3 × 180s + backoff when each attempt fails with a retryable
  transport/5xx outcome, versus 180s before retries. Max-time expiries are
  never retried, so the window only extends on fast, server-answered or
  never-connected outcomes; an outer deadline is rejected as complexity
  the caller does not need. Documented here as the accepted trade-off.
- **At-least-once semantics on the billed POST are accepted (OCR F4)** —
  a 5xx or post-send transport failure after server-side processing can
  duplicate a billed inference request; retries are capped at 3 attempts
  and only fire on error outcomes, matching the audit's own R1
  recommendation. Documented here as the accepted trade-off.
- **Fake-curl shim sleeps are real** — avoids env-var test seams in
  production code; ~21s worst case is within the shell suite's tolerance.
- **Spec rides the work branch** — develop is PR-only (protected-branch
  invariant); the spec commits on
  `fix/kyau-1e9d-resilience-audit-remediation` and merges via PR, like the
  error-handling and readability-naming remediations.
- **One branch, atomic commits per finding** — `fix(search): …`,
  `fix(ci): …`, `fix(scripts): …`, plus post-review hardening commits,
  each independently reviewable under this spec.
