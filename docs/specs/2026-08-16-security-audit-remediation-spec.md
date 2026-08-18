# Security Audit Remediation — Spec

- **Date:** 2026-08-16 (audit) / remediation spec written 2026-08-16
- **Source:** `audits/2026-08-16-security-audit.md` (analyzed commit `0ad9930`; every finding re-verified against current `develop` HEAD `076398a`)
- **Status:** Approved (design discussion 2026-08-16)
- **Type:** fix (behavior deltas in the safety extension guards and the env loader, test-pinned) + docs

## Background

An external security audit of `kyaulabs/prism` (harness, not a deployed web
app) produced one Medium finding (M-1), four Low (L-1…L-4), and two
Informational (I-1, I-2), with a summary risk score of 2.5/10. Every finding
was re-verified against the current `develop` HEAD before design:

| Finding | Audit claim | Re-verified status at HEAD |
|---|---|---|
| M-1 — substitution bypasses `rm -rf` block | Medium, confirmed | **LIVE** — empirically reproduced: `echo "$(rm -rf …)"`, backticks, `<(...)` all return `null` |
| L-1 — WARN gates are raw-string regex | Low, confirmed | **LIVE** — `git -c … reset --hard`, `git push -d` missed; `$IFS` splicing evades |
| L-2 — `load_env()` unbounded | Low, confirmed | **LIVE** — `file()` read with no size/line cap |
| L-3 — breaker reset by interleaved success | Low, confirmed | **LIVE** — `tool_execution_end` resets on any executed bash |
| L-4 — semgrep pip install without hashes | Low | **EVOLVED / accepted** — CI now installs `semgrep${SEMGREP_RANGE}` (range per ADR-0063); `--require-hashes` is incompatible with range installs. Documented, no code change. |
| I-1 — `putenv()` process-global | Informational | **Already remediated** — `SECRET_KEYS` (`APP_KEY`/`CSRF_KEY`/`DB_PASSWORD`) populate `$_ENV` only (secrets audit remediation) |
| I-2 — tokenizer limits (braces, `$'…'`, here-docs) | "no confirmed bypass beyond M-1" | **CLAIM WRONG** — probe confirmed four additional live bypasses (below), folded into the M-1 fix |

**Probe evidence (no execution — static trace via `classifyCommand`):**

```
null   <- sudo bash -c "rm -rf /home/u/x"      (wrapper after sudo not unwrapped)
null   <- bash <<< 'rm -rf /home/u/x'          (here-string feeds shell stdin)
null   <- bash -c $'rm -rf /home/u/x'          (ANSI-C quoting defeats unwrap)
null   <- eval $'rm -rf /home/u/x'             (same)
null   <- sh -c $'rm -rf /home/u/x'            (same)
block  <- bash -c "echo ok; rm -rf /home/u/x"  (control: compound unwraps + segment split)
```

## Scope

**In scope:** M-1 (expanded to cover the I-2 bypasses), L-1, L-2, L-3.

**Out of scope (documented, not silently dropped):**
- L-4 — accepted: range-based install (ADR-0063) is incompatible with
  `--require-hashes`; noted in the CI step comment's spirit (already has an
  inline rationale comment).
- Remote/container executors (`ssh host "rm …"`, `docker exec`, `kubectl exec`,
  `nsenter`, `chroot`, `systemd-run`) — payloads execute in a different trust
  domain than the local safe-zone model; enumerating executors is unbounded.
  Documented as a known limit in the extension README.
- Dedicated adversarial fuzz suite (audit process rec #3) — the regression
  fixtures below *are* the adversarial cases for every known bypass; a
  smuggle-charter suite is a follow-up candidate.

## Design

### 1. M-1 — fail-closed guard for unmodelable shell constructs (expanded)

Guiding principle (audit + ADR-0036): the flat tokenizer is a denylist; any
construct it cannot fully model must **block, not pass**. Two complementary
checks, applied in **both** `classifyCommandImpl` (`pre-tool-use.ts`) and
`sensitiveOperandCheckImpl` (`sensitive-paths.ts`) — defense in depth per the
audit, so sensitive-path reads hidden in substitution (`$(cat ~/.ssh/…)`)
are refused too. Implemented as a shared helper in `sensitive-paths.ts` so
the two gates cannot drift (same rationale as the shared
`resolvePathToken`).

- **Guard A — quoting/substitution constructs:** fail closed when the
  command contains `$(` (command substitution), backticks, `<(`/`>(` (process
  substitution), `$'` (ANSI-C quoting), or `<<<` (here-strings). Covers the
  audit's M-1 plus the confirmed ANSI-C and here-string bypasses.
- **Guard B — shell wrapper anywhere:** in each segment's token stream, find
  a shell wrapper (`bash`/`sh`/`zsh`/`dash`/`ksh`) followed by `-c` at *any*
  position (not just the head), unwrap the payload token, and recursively
  reclassify (bounded by `MAX_UNWRAP_DEPTH`). Closes `sudo bash -c "…"`
  (and `sudo -u root bash -c "…"`, `timeout 10 bash -c "…"`,
  `xargs bash -c "…"`, `find -exec bash -c "…"`) without parsing each
  wrapper's flag grammar. Quoted payloads are re-tokenized layer by layer on
  recursion, which is why the wrapped forms are caught.
- **Fail-closed consequence (accepted):** benign substitution
  (`echo $(date)`) blocks. The agent computes such values via separate steps.
  This is the consciously accepted cost of the fail-closed contract, already
  approved in design.
- **Return class:** the sensitive-gate guard returns
  `{ className: "unresolvable" }` — any non-null match blocks in
  `handleToolCall` (`tool-call-handler.ts`), no handler change needed.

### 2. L-1 — tokenized git WARN gates + advisory contract

- `gitResetWarn` → tokenized via existing `findGitSubcommand` +
  `expandShortFlags` (same path as `gitForcePushBlock`): warn on subcommand
  `reset` with `--hard` in the expanded rest. Catches `git -c core.hooksPath=…
  reset --hard`, `git reset -q --hard`, bundled flags — all missed today.
- `gitPushDeleteWarn` → tokenized: subcommand `push` with `--delete` or `-d`
  (short form, currently unwarned) in the expanded rest.
- `sqlDropWarn` stays a raw-string regex (best-effort by design — tokenizing
  requires parsing `mysql -e "…"`, `psql -c`, heredocs, `--execute=`; a
  rabbit hole for a non-blocking warning). Inline comment states this.
- Extension README: explicit statement that WARN gates are best-effort nudges,
  **not a security boundary** — deliberate obfuscation (`git reset$IFS--hard`)
  can skip them, accepted by design (Guard A blocks the substitution subset
  outright).

### 3. L-2 — bounded `load_env()`

`backend/env.php` `load_env()`:
- `filesize($path) > 1 MiB` → `error_log` + fail-safe no-op return, checked
  **before** `file()` so memory is bounded before allocation.
- `count($lines) > 10000` after the read → same no-op (belt-and-braces for
  files whose size lies about their line count; audit's drop-in).
- Docblock updated to state both caps. Absent/unreadable-file semantics
  unchanged.

### 4. L-3 — windowed circuit breaker

`denial-circuit-breaker.ts` `DenialCircuitBreaker`:
- Consecutive counter → **per-session ring buffer of the last 10 bash call
  outcomes**; trip when **3 denials occur within the window**
  (`DEFAULT_THRESHOLD = 3` unchanged; new exported `WINDOW_SIZE = 10`).
- `observe(sid, denied)` API shape unchanged — `{ count, tripped,
  transitioned }`; `count` now means "denials in window";
  `transitioned` fires exactly once on the 2→3 crossing. `reset(sid)`
  (agent_end) and `clearAll()` (session shutdown) unchanged.
- Interleaving `true` between blocked attempts no longer resets; evasion now
  requires ≥10 benign bash calls between denials (a mostly-benign agent).
  Legit long sessions keep false-trip tolerance: 3 denied commands within 10
  bash calls is rare for real work, and the window ages out.
- Wording (redaction preserved — no command text): `noteBashDenial`
  (`tool-call-handler.ts`) and the tripped reason (`index.ts`) drop
  "consecutive" → "N bash denials within the last 10 bash calls";
  `index.ts` header doc comment states the windowed threat model.
- **ADR-0068 (new pi-era ADR, per architect review):** records the windowed
  breaker semantics, superseding ADR-0042's opencode-era reset-on-success
  wording by reference (0042 is frozen — "bodies stand as written" per
  `adr/README.md`; it is not edited). ADR-0056's "3 consecutive" echo gets
  a pointer to 0068. Written per the `adr` skill.
- **CONTEXT.md glossary update (architect review):** the safety-extension
  definition's "consecutive-denial circuit breaker" becomes the windowed
  policy ("3 denials within the last 10 bash calls").

## Tests (Red → Green, per task)

- `tests/Node/safety-classify.test.ts`: Guard A fixtures (`echo $(rm -rf …)`,
  backticks, `<(...)`, `$'…'`, `<<<`, benign `echo $(date)` → all `block`);
  Guard B fixtures (`sudo bash -c "…"`, `sudo -u root bash -c "…"`,
  `timeout 10 bash -c "…"`, `sh -c $'…'`, `eval $'…'` → `block`; safe-zone
  payloads `bash -c "rm -rf /tmp/x"` and wrapper-shaped quoted literals
  `echo 'bash -c "rm -rf /tmp/x"'` → allowed); L-1 fixtures
  (`git   reset   --hard HEAD~1` → `warn`; `git -c core.hooksPath=… reset
  --hard` → `warn`; `git push -d origin main` → `warn`).
- `tests/Node/safety-sensitive-paths.test.ts`: substitution forms of
  sensitive-path reads → refused.
- `tests/Node/safety-circuit-breaker.test.ts`: "success resets the streak"
  becomes "success ages the window but does not erase denials"; new:
  interleaved-success tripping, window aging.
- `tests/Unit/LoadEnvTest.php`: >1 MiB `.env` and 20,000-line `.env` → no
  keys loaded, no exception.
- Existing `safety-tool-call-handler.test.ts` re-run (wording change in
  breaker messages must not break assertions).

## Verification

- `npm run test:node` (extension suite).
- Pest `tests/Unit/LoadEnvTest.php`, then `/check-php` (php-cs-fixer,
  stylelint, eslint, Pest coverage ≥ 80% on changed files).
- `npx tsc --noEmit` for the TS side.
- `node --test` red-first per task via the `tdd` skill; plan in
  `docs/plans/`.

## Non-goals (re-stated)

- L-4 hash-pinning (accepted; range contract).
- Remote/container executor blocking (documented limit).
- Adversarial fuzz suite (follow-up candidate).
- No new dependencies. Every modified source file keeps its RCS header and
  vim modeline; no header churn.
