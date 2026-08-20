# Testing Audit Remediation — Spec

- **Date:** 2026-08-16 (audit) / remediation spec written 2026-08-18
- **Source:** `audits/2026-08-16-testing-audit.md` (analyzed commit `0ad9930`; every finding re-verified against current `develop` HEAD `02c3fd9`)
- **Status:** Approved (design discussion 2026-08-18)
- **Type:** fix (test-infrastructure behavior deltas, test-pinned) + docs

## Background

An external testing audit of `kyaulabs/prism` produced seven findings
(importance 7/10 down to 2/10) plus two "missing-test gaps". Every finding
was re-verified against the current `develop` HEAD before design:

| Finding | Audit score | Re-verified status at develop HEAD |
|---|---|---|
| 1 — Coverage gate measures only `backend/` | 7/10 | **CONFIRMED, remediation-as-written not implementable** — `phpunit.xml` unchanged; `backend/` = `env.php` only. `.github/scripts/coverage-gate.php` is now a 15-line shim; the real 331-line logic lives at `packages/prism-php-web/scripts/coverage-gate.php`. Widening `<source>` to capture it would add ~346 Pest-never-loaded lines, collapsing aggregate coverage to ~40% and failing CI's `--min=80`. Chosen: honest labeling (Option A) — the gate tool has 8-case behavioral shell coverage, which is its real contract. |
| 2 — Five shell tests fail hard without dev deps | 6/10 | **PARTIALLY CONFIRMED — 4 of 5 reproduce.** `check_resolution` (needs `vendor/bin/php-cs-fixer`), `frontmatter_parser_stdin` (needs node + js-yaml), `check_skill_frontmatter` + `validate-harness` (both invoke `validate-harness.sh`, which hard-exits without node + pi + js-yaml). `classify_greenfield` **REFUTED** — passes with node stripped from PATH (needs only git + mktemp). Two of the four use `counter_helpers.sh`, which has no `skip()` function. |
| 3 — Feature/E2E layers are smoke-only | 5/10 | **CONFIRMED but deferred** — remediation is conditional on real scaffolded pages; `aurora/` is the framework submodule, not pages. This repo is a harness, not a deployable web app. |
| 4 — Unit tests use fixed temp-file names | 4/10 | **CONFIRMED** — ~15 fixed `/test_env_*.env` paths in `LoadEnvTest.php`, `unlink` after `expect` (leaks on failure). CI does not run `--parallel`, so risk is local/concurrent-checkout only. |
| 5 — `EnvBoolTest` empty-string case depends on ambient env | 3/10 | **CONFIRMED** — `env_bool()` falls back to `getenv()` on empty `$_ENV` (backend/env.php:37-41); EnvBoolTest sets only `$_ENV` with no `beforeEach` pin (LoadEnvTest has one); `afterEach(restoreEnvVars())` does not prevent ambient pollution during the test. |
| 6 — `<exclude><group>slow</group></exclude>` is dead config | 2/10 | **CONFIRMED** — no test tags `slow`; exclusion still in `phpunit.xml`. |
| 7 — No single local test entry point | 2/10 | **PARTIALLY RESOLVED** — `package.json` gained `test:node` (CI runs it, ci.yml:183); `composer.json` still has zero scripts; CI inlines the shell loop. |
| Gap A — `strip_jsonc_comments` unterminated block comment | — | **STILL OPEN** — no unit test exists (only shell parity test); unterminated `/*` path advances `$i += 2` past `$len` (safe but untested). |
| Gap B — `coverage-gate.php` degenerate-Clover exit-2 paths | — | **STILL OPEN** — shell suite covers PASS/FAIL/WARN/SKIP/empty-stdin/deleted/0-line/mixed/custom-min; no case pins the documented exit-2 paths ("Usage error, unreadable clover file, or empty/degenerate clover"). |

## Scope

**In scope:** Findings 1 (as Option A), 2, 4, 5, 6, 7 (as Option B), plus gap
tests A and B.

**Out of scope (documented, not silently dropped):**
- Finding 3 — Browser/Feature E2E beyond smoke. No real scaffolded pages
  exist; the audit's own remediation is conditional on the first
  `aurora-page`-scaffolded page landing. Revisit when such a page exists
  (target test: `APP_DEBUG=false` error-leak guard, mirroring
  `AuroraConstructorDisplayErrorsTest`).

## Design

### 1. Finding 2 — prerequisite skip guards (4 files)

- `tests/Shell/lib/counter_helpers.sh`: add `skip()` (prints SKIP to stderr,
  mirroring `test_helpers.sh`'s convention; the guard site follows with
  `exit 0`). No SKIP counter or summary-line changes: the whole-file guard
  exits before the summary prints, so a counter would be dead state.
- `tests/Shell/check_resolution_test.sh`: guard
  `[ -x "$REPO_ROOT/vendor/bin/php-cs-fixer" ]` → `skip` + exit 0 (after
  sourcing `test_helpers.sh`).
- `tests/Shell/frontmatter_parser_stdin_test.sh`: guard `command -v node` and
  js-yaml resolvable (`node -e "require('js-yaml')"`).
- `tests/Shell/check_skill_frontmatter_test.sh` and
  `tests/Shell/validate-harness_test.sh`: guard `command -v node` +
  `command -v pi` + js-yaml resolvable — mirroring `validate-harness.sh`'s
  hard prerequisites (Bash 4+, node, pi).
- `tests/Shell/classify_greenfield_test.sh`: **no guard** — audit refuted;
  document in the spec only.
- Whole-file skip semantics (audit's approach): on a fresh clone the
  dep-free grep checks in the two counter-based files do not run; CI always
  runs them with deps present. The `skip` convention prints `SKIP` and exits
  0, so CI's per-file `bash "$t"` loop stays green.

### 2. Findings 4 + 5 — unit-test hygiene

- `tests/Unit/LoadEnvTest.php`: convert the ~15 fixed
  `sys_get_temp_dir() . '/test_env_*.env'` paths to
  `tempnam(sys_get_temp_dir(), 'prism_env_')` with `try/finally` unlink. The
  nonexistent-path case is untouched (creates no file).
- `tests/Unit/EnvBoolTest.php`: in the empty-string test, add
  `putenv('APP_DEBUG');` before setting `$_ENV['APP_DEBUG'] = ''` to pin the
  `getenv()` fallback.

### 3. Finding 6 — delete the dead `slow` exclusion

Remove the `<groups><exclude><group>slow</group></exclude></groups>` block
from `phpunit.xml`. Deleting (vs. wiring a CI `--group=slow` step for a
nonexistent group) makes a future `slow` tag run by default — the safe
default; wiring would be more dead config.

### 4. Findings 1 (Option A) + 7 (Option B) — honest labeling + entry points

- `phpunit.xml`: comment documenting the source scope and why
  `.github/scripts` is behaviorally tested instead of clover-instrumented.
- `.github/workflows/ci.yml`: rename step "Pest (coverage >= 80%)" →
  "Pest (backend/ coverage >= 80%)"; replace the inline shell-test loop with
  `composer test:shell`.
- `composer.json` scripts:
  - `test` → `pest`
  - `test:coverage` → `pest --coverage --min=80`
  - `test:shell` → `bash tests/Shell/run-all.sh`
  - `test:all` → `composer test:shell && npm run test:node && composer test:coverage`
- New `tests/Shell/run-all.sh` (RCS header + vim modeline): iterates
  `tests/Shell/*_test.sh` (nullglob), runs all files even if some fail,
  aggregates the exit code — mirrors CI semantics; not matched by the
  `*_test.sh` glob itself.
- `tests/Shell/pi_ci_contract_test.sh`: relax the shell-loop assertion
  pattern `tests/Shell/.*_test\.sh` → `composer test:shell|tests/Shell/.*_test\.sh`
  (contract keeps policing both forms).

### 5. Gap tests

- New `tests/Unit/StripJsoncTest.php`: unterminated block comment
  (`'{"a":1} /* x'`), `//` inside a quoted string, unterminated line comment.
  Expected outputs pinned from the `strip_jsonc_comments` implementation
  (the block-comment branch's exact behavior verified against the code
  before writing assertions).
- `tests/Shell/coverage_gate_test.sh`: two new cases pinning the documented
  exit-2 paths — malformed/unreadable clover → exit 2, and
  well-formed-but-degenerate clover (no instrumented files) → exit 2.
  Fixture shapes verified against the canonical
  `packages/prism-php-web/scripts/coverage-gate.php` implementation.
  Probe-first: feed malformed and degenerate clover to the canonical script
  and confirm the documented exit-2 behavior before pinning it.

## Tests (Red → Green, per task)

- `tests/Shell/lib/counter_helpers.sh` + the four guarded shell tests:
  red first = a fresh-clone simulation (dependency hidden) currently FAILs;
  green = `SKIP` + exit 0.
- `tests/Unit/LoadEnvTest.php` refactor: existing 23 cases stay green under
  `tempnam`; no new assertions needed.
- `tests/Unit/EnvBoolTest.php`: `putenv` pin; existing assertions stay green.
- `tests/Unit/StripJsoncTest.php`: new file, assertions pinned from the
  implementation.
- `tests/Shell/coverage_gate_test.sh`: two new exit-2 cases (probe-first:
  confirm the documented exit-2 behavior against the real script, then pin
  it as positive assertions of existing behavior).
- `tests/Shell/pi_ci_contract_test.sh`: assertion pattern updated; suite
  green.
- `composer_validate_test.sh`: unchanged; confirms `composer validate
  --strict` still passes with the new `scripts` section.

## Verification

- Full shell suite via the new runner (`bash tests/Shell/run-all.sh`) — all
  46 files green.
- SKIP-path simulation for the four guarded tests: hide the dependency
  (move `vendor/bin/php-cs-fixer`; move `node_modules/js-yaml`; PATH without
  `pi`) → expect `SKIP` + exit 0, never FAIL; restore.
- `composer test` and `composer test:coverage` — backend/ ≥ 80% green.
- `npm run test:node` — untouched layer, confirm green.
- `composer validate --strict` (via composer_validate_test).
- `/check-php` (php-cs-fixer, stylelint, eslint, Pest coverage ≥ 80% on
  changed files) as the pre-push gate.

## Non-goals (re-stated)

- Finding 3 — Browser/Feature E2E beyond smoke (deferred until real pages).
- Widening the clover `<source>` set (Option A chosen: honest labeling; the
  gate tool's contract is its behavioral shell suite).
- Aggregate coverage for `.github/scripts` / `packages/*/scripts`.
- New dependencies. Every modified/new source file keeps its RCS header and
  vim modeline; no header churn.
