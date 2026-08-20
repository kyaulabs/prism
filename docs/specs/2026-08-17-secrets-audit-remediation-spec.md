# Secrets Audit Remediation — Spec

- **Date:** 2026-08-17
- **Source:** `audits/2026-08-16-secrets-management-audit.md` (analyzed commit `0ad9930`; every finding re-verified against current `develop` HEAD)
- **Status:** Approved (design discussion 2026-08-17)
- **Type:** fix (one behavior delta — F4 `SECRET_KEYS` exclusion, test-pinned) + docs + config hygiene

## Background

An external secrets-management audit produced five findings (F1–F5) with a
summary risk score of 2/10 (no exposed secrets; strong preventive tooling).
All findings were re-verified against the current `develop` HEAD before
design:

- **In scope:** F1 (API key in curl argv), F2 (stale gitleaks allowlist),
  F3 (no rotation mechanism), F4 (`putenv()` in `load_env()`).
- **Already resolved, no action:** F5 (untracked `.hermes-secrets-prompt.txt`
  — the transient audit artifact is gone; working tree is clean).

Two re-verification results changed the shape of the design vs. the audit's
remediation:

1. **F1's audit remediation is flawed.** The audit proposes feeding a curl
   config on stdin (`--config -` via heredoc). `search_request()`
   (`packages/prism-core/skills/lib/search_common.sh`) retries curl up to 3
   times (429/5xx/transport); a heredoc is consumed by the first invocation
   only, so retries would hit EOF on stdin and fail. The fix must survive
   retries (re-read a file per attempt).
2. **F3's "Unable to verify" gap is now closed, and the answer dissolves the
   code-side remediation.** The `aurora` submodule is now checked out
   (`7c75e21f`, pinned by gitlink) and consumes none of
   `APP_KEY`/`CSRF_KEY`/`DB_PASSWORD`; no tracked code in this repo does
   either (aurora uses `settings.example.php`, not env vars). Key-ring
   parsing in `load_env()` would be dead code and hazardous (comma-splitting
   in the generic loader would mangle legitimate values). F3 is therefore
   addressed **docs-only**.

**Discovered during execution (2026-08-17):** verifying F1's regression
harness against the current develop HEAD surfaced a third, pre-existing bug:
`search_request()` restores the caller's EXIT trap via `eval "$prev_trap"` at
its end. Inside the `HTTP_STATUS=$(search_request …)` command substitution,
that re-registration makes the subshell fire the caller's `cleanup` EXIT trap
when the subshell exits (bash: a trap set *inside* a command-substitution
subshell fires on that subshell's exit), deleting `REQUEST_FILE`/
`RESPONSE_FILE`/`ERROR_FILE` before the final node parse — websearch's success
path fails with `ENOENT` (exit 6). Regression introduced 2026-08-17 by
`f5ff42b` ("fix(search): eval caller trap at fire time"); existing tests only
exercise `search_request` via direct calls, where restore is correct, so the
gap went uncaught. User approved folding the fix into this branch.

## Goals

1. Remove the only live exposure path in the repo: the DeepSeek API key must
   never appear in curl's argv (`websearch/search.sh`), while preserving the
   retry semantics of `search_request()`.
2. Remove the stale, misleading gitleaks allowlist so the scanner config
   matches reality; keep `useDefault = true`.
3. Document a rotation convention (key-ring) and a DB-password rotation
   runbook in `.env.example` — the only artifact that defines these keys —
   so the audit's "no documented procedure" gap becomes a documented
   contract for future consumers. Zero code.
4. Keep the three documented secrets (`APP_KEY`, `CSRF_KEY`, `DB_PASSWORD`)
   out of child-process environments by excluding them from `putenv()` in
   `load_env()`, while preserving the loader's tested dual-population
   contract for all other keys.
5. Test-first (Red → Green → Refactor) for F1 and F4 — the two behavior
   changes — with regression tests that fail on the pre-fix code.

## Non-goals

- No key-ring parsing code anywhere (F3 — no consumer exists).
- No secret-rotation runbook beyond `.env.example` (no docs/ page, no
  `docs/follow-ups/` entry).
- No change to `searxng/search.sh` (sends no auth header — verified clean).
- No change to the `DEEPSEEK_API_KEY` handling in the shell environment
  (it is sourced from env, never from a file, and is not in `.env.example`).
- No change to the loader's "server env wins" precedence, POSIX key-name
  validation, or dangerous-name blocking (audit Positives — keep intact).
- No gitleaks CI changes (version pin, `--redact`, checksum verification all
  stay).

## Design

### D1 — F1: header-file auth in `websearch/search.sh`

- Add `AUTH_HEADER_FILE=$(mktemp)` alongside the existing
  `REQUEST_FILE`/`RESPONSE_FILE`/`ERROR_FILE`; `chmod 600`; add to the
  existing `cleanup()` trap.
- After `require_env DEEPSEEK_API_KEY` (key guaranteed set and non-empty),
  write the header: `printf 'x-api-key: %s\n' "$DEEPSEEK_API_KEY" > "$AUTH_HEADER_FILE"`.
- Replace the `--header "x-api-key: ${DEEPSEEK_API_KEY}"` argument with
  `--header "@$AUTH_HEADER_FILE"` (curl reads header lines from the file on
  every attempt, so `search_request()`'s retry loop re-reads it — no stdin
  consumption issue).
- The key appears in no argv; the file is owner-only (0600), mktemp-named,
  and trap-cleaned.

### D2 — F2: delete the stale gitleaks allowlist

- In `.gitleaks.toml`, delete the `[allowlist]` block and its explanatory
  comment (the comment asserts `tests/Shell/prism_manifest_integration_test.sh`
  and `tests/Unit/Harness/PrismManifestCliTest.php` exist; both were deleted
  in `9cc6e7b` and the canary strings exist nowhere in the tree).
- Keep `[extend] useDefault = true`. Git history preserves the exact canary
  strings if canary tests ever return (ADR-0048 §8 discipline is
  forward-looking and unaffected).

### D3 — F3: rotation documentation in `.env.example`

Extend the `.env.example` header comment with a `## Rotation` section:

- Key-ring convention for future consumers: comma-separated values,
  `APP_KEY=<new-hex>,<old-hex>` — consumers verify against all listed keys
  and sign/encrypt with the first; rotation therefore has a dual-acceptance
  window.
- DB-password rotation runbook: create a new DB user or `ALTER USER` to set
  the new password → update the server environment → reload FPM → drop the
  old credential. (Stated briefly; the convention is the contract, not a
  runbook page.)

### D4 — F4: `SECRET_KEYS` exclusion in `backend/env.php`

- Add a `SECRET_KEYS` list constant: `APP_KEY`, `CSRF_KEY`, `DB_PASSWORD`
  (the three secrets `.env.example` documents; `DEEPSEEK_API_KEY` stays out
  — websearch reads it from the shell env, never through `load_env()`).
- In `load_env()`: populate `$_ENV[$key]` for every loaded key as today;
  call `putenv()` only when the key is not in `SECRET_KEYS`. Server-env-wins
  precedence and dangerous-name blocking are untouched.
- Behavior contract: secrets are visible via `$_ENV` to the PHP app but are
  not inherited by child processes; every other key keeps today's
  dual-population (`$_ENV` + `getenv()`), preserving `env_bool()`'s fallback
  and the existing `LoadEnvTest` expectations.

### D5 — `search_request()` trap restoration (discovered regression)

- In `packages/prism-core/skills/lib/search_common.sh`, restore the caller's
  EXIT trap only when running in the caller's own shell; inside a
  command-substitution subshell, clear the subshell's copy (`trap - EXIT`)
  so it cannot fire the caller's cleanup on subshell exit. Subshell
  detection: `${BASHPID:-$$}` ≠ `$$` (bash keeps `$$` unchanged in
  subshells).
- Direct-call behavior unchanged: the caller's trap is still restored and
  fires at caller exit (existing `search_request` trap tests stay green).
- Fixes both `websearch/search.sh` and `searxng/search.sh` (shared lib).

## Testing

### T1 — F1 regression (`tests/Shell/search_skills_test.sh`)

Extend the existing fake-curl harness to record curl's argv. New test:
run `websearch/search.sh` with `DEEPSEEK_API_KEY` set and fake curl on
PATH; assert (a) the key value appears nowhere in the recorded argv, and
(b) an `--header @<file>` argument is present whose file yields the
`x-api-key: <key>` line. Must fail on the pre-fix script (key present in
argv). Existing `search_request` retry unit cases stay green.

### T2 — F4 unit (`tests/Unit/LoadEnvTest.php`)

- New case: a `SECRET_KEYS` key loaded from a `.env` fixture lands in
  `$_ENV` but `getenv()` returns false for it.
- New case: a non-secret key still dual-populates (`$_ENV` and `getenv()`)
  — guards the contract against over-broad exclusion.
- All existing `LoadEnvTest`/`EnvBoolTest` cases stay green unchanged.

### T3 — config sanity

- `.gitleaks.toml` remains a valid gitleaks config after allowlist removal
  (CI gitleaks step `ci.yml` "Gitleaks SAST" exercises it; run locally via
  the pinned 8.30.1 binary if available, else rely on CI).

### T4 — trap regression (`tests/Shell/search_skills_test.sh`)

New case: caller sets an EXIT trap, `search_request` runs inside `$(…)`;
assert (a) the marker file is absent immediately after the substitution (no
premature fire), (b) the response output file still exists with the fake
body, (c) the caller's trap still fires when its own shell exits. Fails on
pre-fix code (marker present / output deleted right after substitution).
Existing direct-call trap tests stay green unchanged.

## Verification

- `bash tests/Shell/search_skills_test.sh` (trap regression + F1 regression
  + retry cases).
- `vendor/bin/pest tests/Unit/LoadEnvTest.php tests/Unit/EnvBoolTest.php`.
- `shellcheck --severity=warning packages/prism-core/skills/websearch/search.sh
  packages/prism-core/skills/lib/search_common.sh`
  (full-tree shellcheck is a CI step, `ci.yml` "Shellcheck").
- Full `/check-php` gate (php-cs-fixer, stylelint, eslint, Pest coverage ≥ 80%).
- `gitleaks git --pre-commit --staged` on the branch (stale strings gone,
  `useDefault` still active).

## Out of scope / tracked elsewhere

- F5: resolved (transient file gone) — no action.
- aurora content audit for secrets: explicitly out of scope (submodule is a
  separate repo; audit limitation acknowledged in the audit file).
