# Code Duplication Audit Remediation — Spec

- **Date:** 2026-08-16
- **Source:** `audits/2026-08-16-code-duplication-audit.md` (analyzed commit
  `0ad9930`); every finding re-verified against the current `develop` HEAD
  during design.
- **Status:** Approved (design discussion 2026-08-16)
- **Type:** refactor (behavior-preserving) across shell test infra, the
  safety extension, and the search skill scripts

## Background

An external code-duplication audit found seven findings plus non-findings.
All were re-verified against the current tree and triaged in discussion:

- **Already fixed before this session (audit doc stale):** Finding 1 —
  `coverage-gate.php` is now a thin `require_once` shim to the canonical
  package copy (commit `2d629c1`); `.github/scripts/coverage-gate.php` is 578
  bytes. Finding 3 (partial) — `MAX_UNWRAP_DEPTH` is single-sourced in
  `sensitive-paths.ts` and imported by `pre-tool-use.ts` (commit `8caccc1`).
- **In scope (this spec):** Finding 2 (six-file `pass()`/`fail()` reporter
  duplication — the audit *claims* it was fixed via
  `tests/Shell/lib/counter_helpers.sh`, but that file has never existed in
  git; the change was made in a throwaway tree and lost), Finding 3
  (remaining half: `TRIP_THRESHOLD` vs `DEFAULT_THRESHOLD`), Finding 4
  (fixture/trap block ×2), Finding 5 (`search.sh` skeleton ×2), Finding 6
  (`safe_rm_dirs` fallback lists ×4 sources).
- **Out of scope:** Finding 7 (RCS header + vim modeline — sanctioned
  boilerplate per ADR-0041, no action).

Additional discovery during design: pi's package installer resolves skill
resources **in place** from the installed package copy (`~/.pi/agent/npm/…`),
and `package.json` `files` ships `skills` wholesale — so a `skills/lib/`
subdirectory survives installation and is reachable both via
`prism-tool resolve skills` and relative to the skill script's own `$0`.
The audit's packaging-contract concern for Finding 5 is therefore satisfied.

## Goals

1. Eliminate all remaining duplicated code identified by the audit: the
   six-copy reporter block (F2), the fixture/trap block (F4), the trip
   threshold constant (F3), the search-script validation skeleton (F5), and
   the third/fourth `safe_rm_dirs` sources of truth (F6).
2. **Zero behavior delta** in every case: identical test pass/fail counts,
   identical search-script exit codes and messages, identical safety-extension
   policy surface (ADR-0023/0036/0042/0047/0048/0056 untouched in substance).
3. Fail-closed-by-default for safe-dir resolution: a missing/corrupt
   `safe-dirs.json` blocks all `rm -rf` instead of silently allowing a stale
   hardcoded list.

## Non-goals

- Finding 1 (done), Finding 7 (sanctioned).
- Any change to safety policy semantics, the deny floor, the breaker
  threshold *value* (still 3), or the search scripts' payload logic
  (SearXNG JSON vs DeepSeek Anthropic endpoint stay separate).
- New ADRs (behavior-preserving work; all changes stay within documented
  contracts — the README fallback-chain documentation is updated in place).

---

## Workstream A — Shell test infrastructure

### A1. `counter_helpers.sh` (Finding 2)

New `tests/Shell/lib/counter_helpers.sh` owning, byte-identical to the six
current copies:

```sh
PASS=0
FAIL=0
pass() { printf '  PASS %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL %s\n' "$1" >&2; FAIL=$((FAIL + 1)); }
```

Six test files replace their duplicated lines with one source line
(`source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"`), placed where the
`PASS`/`FAIL` initialization currently sits:

- `tests/Shell/classify_greenfield_test.sh` (was lines 12–13 + 21–22)
- `tests/Shell/check_skill_frontmatter_test.sh` (was 11–12 + 14–15)
- `tests/Shell/resolve_identity_test.sh` (was 12–13 + 21–22)
- `tests/Shell/setup_rulesets_command_test.sh` (was 13–14 + 16–17)
- `tests/Shell/search_skills_test.sh` (was 13–14 + 16–17)
- `tests/Shell/validate-harness_test.sh` (was 17–18 + 20–21)

Each file already computes `REPO_ROOT` before the counter lines; the source
line reuses it. Not used by the `RESULT_FILE`-style tests, which keep
`test_helpers.sh` (different behavioral contract — documented in the audit).

### A2. `fixture_helpers.sh` (Finding 4)

New `tests/Shell/lib/fixture_helpers.sh` owning the byte-identical 10-line
block from `classify_greenfield_test.sh` and `resolve_identity_test.sh`
(both already touched by A1):

```sh
TMP_DIRS=()
cleanup() { for dir in "${TMP_DIRS[@]}"; do rm -rf "$dir"; done }
trap cleanup EXIT
fixture() { local d; d=$(mktemp -d); TMP_DIRS+=("$d"); git -C "$d" init -q; printf '%s' "$d"; }
```

Both files replace the block with a source line. Kept separate from
`counter_helpers.sh` (counters vs temp-dir lifecycle are distinct
concerns); `test_helpers.sh`'s `register_temp_dir` remains a documented
future consolidation target, not touched here.

---

## Workstream B — Safety extension (`packages/prism-core/extensions/safety/`)

### B1. Trip threshold single source (Finding 3, remaining half)

- `denial-circuit-breaker.ts:43`: `const DEFAULT_THRESHOLD = 3;` →
  `export const DEFAULT_THRESHOLD = 3;` (one-keyword edit; the breaker file
  is the canonical owner of its own threshold).
- `index.ts:55`: delete `const TRIP_THRESHOLD = 3;` (and its now-redundant
  doc-comment); import `DEFAULT_THRESHOLD` from
  `./denial-circuit-breaker.ts`; the `new DenialCircuitBreaker({ threshold:
  TRIP_THRESHOLD })` call site uses the imported name.
- `README.md` file table: update the `denial-circuit-breaker.ts` row from
  "Verbatim" to note the exported default (no behavior change), mirroring
  how the other two rows already record the audit remediation.

The doc-comment's claim ("breaker config and the redacted escalation always
report the same value") becomes true by construction — the wrapper reads the
breaker's own default.

### B2. Fail-closed safe-dirs fallback (Finding 6)

Current resolution chain (`index.ts` `resolveSafeRelDirs`): project drop
point `<cwd>/.pi/safe-dirs.json` → bundled core `safe-dirs.json` →
`FALLBACK_SAFE_REL_DIRS` (hardcoded 3-entry list, already drifted from the
5-entry JSON). Plus `pre-tool-use.ts` `SAFE_REL_DIRS` (6 entries incl.
`vendor`/`cdn/*` — PHP-adapter leakage in a language-agnostic core) used
when the `safeRelDirs` option is omitted.

- `index.ts`: delete `FALLBACK_SAFE_REL_DIRS`; the third resolution level
  becomes `[]` (no safe zones → every `rm -rf` blocked, fail-closed per
  ADR-0036). Healthy installs never reach this level — the JSON ships in
  `package.json` `files` and always resolves at level 2.
- `pre-tool-use.ts`: delete `SAFE_REL_DIRS`; `opts.safeRelDirs ?? SAFE_REL_DIRS`
  becomes `opts.safeRelDirs ?? []`. Production always passes resolved dirs
  (index.ts drives the classifier), so behavior is unchanged.
- `tests/Node/safety-classify.test.ts`: `OPTS` gains an explicit
  `safeRelDirs: ["node_modules", "vendor"]` (the tests currently rely on
  the built-in default — `rm -rf node_modules`, `rm -rf node_modules/foo=bar`,
  `env FOO=1 rm -rf node_modules`, and `cd /repo && rm -rf vendor/pkg` all
  pass via it; `rm -rf /tmp/xyz` stays clean via `SAFE_ABS_DIRS`, which is
  untouched). No other entries are needed by any assertion.
- `README.md`: replace the "Hardcoded fallback (never empty)" bullet with
  the fail-closed contract: third level = empty (all `rm -rf` blocked) when
  both JSON sources are missing/corrupt.

---

## Workstream C — Search skill scripts (Finding 5)

### C1. `skills/lib/search_common.sh`

New `packages/prism-core/skills/lib/search_common.sh` owning the shared
validation skeleton, **parameterized by skill name and preserving the exact
current exit codes and messages** (the audit's draft helpers wrongly
collapsed everything to exit 2; `search_skills_test.sh` asserts rc=4 for
missing env):

```sh
# usage guard (exit 2), message: 'Usage: <basename> <query>'
require_cmd <skill> <cmd>       # exit 3, 'skill: cmd is required.'
require_env <skill> <VAR>       # exit 4, 'skill: VAR is not set. Configure it in the environment; never pass it as an argument.'
require_posint <skill> <VAR> <value>  # exit 2, 'skill: VAR must be a positive integer.'
```

Also absorbs the `curl`/`node` prerequisite checks and the positive-integer
`case` validation; the payload-specific validations that genuinely differ
(SearXNG URL scheme + `SEARXNG_ALLOW_HTTP`, websearch `THINKING`/`MAX_TOKENS`
enum) **stay in the skill scripts**.

- `searxng/search.sh`: source the lib relative to `$0`; keep the node
  invocation message suffix that differs (`to normalize JSON safely`).
- `websearch/search.sh`: same; keeps its own suffix (`to encode and format
  JSON safely`).
- `search_skills_test.sh`: extend the "does not print the key value" grep to
  also scan `lib/search_common.sh` — today the check only greps the two
  `search.sh` files; after extraction the `printf` moves into the lib, so
  the coverage must follow it or the check becomes vacuous.

---

## Verification

1. `bash -n` on all new/changed shell files (libs + six test files + two
   search scripts).
2. Full runs of the six changed shell tests with **identical pass/fail
   counts** to the pre-change behavior (note the two pre-existing
   harness-validation failures and the pre-existing `classify_greenfield`
   history-section hang — they must fail/hang identically before and after,
   per the audit's verification method).
3. `tests/Shell/search_skills_test.sh` — rc=4 / rc=3 / rc=2 exit-code
   assertions still pass; the extended lib grep is green.
4. `npm run test:node` — safety-classify tests green with the explicit
   `safeRelDirs` OPTS.
5. `npx tsc --noEmit` and eslint on the changed extension files.
6. Smoke: `env -u DEEPSEEK_API_KEY bash websearch/search.sh query` → rc=4
   with the exact message; `env -u SEARXNG_URL bash searxng/search.sh query`
   → rc=4 with the exact message.
7. `/check` (full gate) and `code-review` before push.

## Risks & decisions

- **Audit-doc drift:** Findings 1–2's status in the audit doc does not match
  the tree (F1 fixed, F2 never landed). This spec's verification is against
  the tree, not the audit doc's claims.
- **F5 packaging:** verified against pi's installer source (in-place
  resolution, wholesale `skills` shipping). The residual trade-off — skill
  dirs no longer copyable standalone — is accepted because they already
  depend on package machinery (`prism-tool resolve`, a package bin).
- **F6 fail-closed:** a *broken install* now blocks all `rm -rf` instead of
  partially allowing; healthy installs are unaffected (JSON always resolves
  at level 2). This is a security-posture improvement (ADR-0036), not a
  regression.
- **`pre-tool-use.ts` verbatim marker:** the complexity remediation already
  restructured the "verbatim" files with documented no-behavior-change notes;
  B1/B2 continue that established pattern.
- **One branch, one spec, multiple atomic commits** — one commit per
  workstream (A: test infra, B: safety, C: skills), each independently
  reviewable.
