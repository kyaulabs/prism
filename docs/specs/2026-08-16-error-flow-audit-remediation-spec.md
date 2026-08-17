# Error Flow Audit Remediation — Spec

- **Date:** 2026-08-16
- **Source:** `audits/2026-08-16-error-flow-audit.md` (analyzed commit `0ad9930`; every finding re-verified against `develop` `e4aee3a`)
- **Status:** Approved (design discussion 2026-08-16)
- **Type:** fix (observability only — zero behavior delta on all return paths) + test addition

## Background

An external error-flow audit produced six findings (F1–F6). All were
re-verified against the current `develop` HEAD and triaged in discussion:

- **In scope:** F3 (`load_env()` cannot distinguish absent from unreadable
  `.env`) and F6 (`env_bool()` silently masks typo'd values). Both live in
  `backend/env.php`, a first-party library for downstream scaffolded apps,
  with existing test seams (`tests/Unit/LoadEnvTest.php`,
  `tests/Unit/EnvBoolTest.php`).
- **Already resolved, no action:** F5 (`coverage-gate.php` duplication —
  `.github/scripts/coverage-gate.php` is now a shim requiring the canonical
  `packages/prism-php-web/scripts/coverage-gate.php`, merged in PR #323) and
  F4 (`check-peer-deps.js` fail-open — the fail-open contract is documented
  in-file, and the actual caller `validate-harness.sh` treats every stdout
  line as an error, so a malformed `package.json` fails the gate).
- **Premise invalidated, no action:** F2 (no global error boundary) — the
  audit's zero-hit grep was an artifact of the uninitialized submodule;
  `aurora/aurora.inc.php:66` sets `set_exception_handler([...])` and the
  handler `error_log`s when `display_errors` is off.
- **Remediated for prism, no action:** F1 (uninitialized submodule) — CI
  now checks out with `submodules: true` and the gitlink pins aurora at
  `7c75e21f`. The remaining half (content audit of aurora's error flow) is
  explicitly out of scope: no aurora changes.

## Goals

1. `load_env()`: distinguish the intended silent no-op (absent `.env`) from
   an operational fault (present-but-unreadable, or failed read) by writing
   an `error_log` line with the path in the fault cases, while preserving the
   never-throws contract and all-default fallback.
2. `env_bool()`: log unparseable values (key + raw value + chosen default)
   so config typos like `APP_DEBUG=ture` are diagnosable, without changing
   any return value or the silent unset/empty semantics.
3. Test-first (Red → Green → Refactor); the existing `LoadEnvTest` and
   `EnvBoolTest` suites stay green unchanged, proving zero return-behavior
   delta.

## Non-goals

- No aurora changes (F1 content audit, F2 residual gaps: `http_response_code(500)`
  in `exceptionHandler`, fatal-error shutdown hook).
- No doc artifacts (audit-file disposition section, `docs/follow-ups/` entry —
  rejected in design discussion; the aurora items are not worth tracking).
- No changes to `check-peer-deps.js` or `coverage-gate.php` (F4, F5).
- No exception-based error contract — `load_env()` keeps its documented
  never-throws guarantee.
- No logging for the *absent-file* case — that is the documented production
  default ("absent .env means debug stays off") and must remain silent.

## Design

### D1 — `load_env()` (F3)

Replace the two silent fault returns in `load_env()` (`backend/env.php`,
currently `!is_file()` → return, `file() === false` → return) with:

```php
if (!is_file($path)) {
    return;                                  // absent: intended no-op, stays silent
}

if (!is_readable($path)) {
    error_log("load_env: {$path} exists but is not readable; using defaults");
    return;
}

$lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

if ($lines === false) {
    error_log("load_env: failed to read {$path}; using defaults");
    return;
}
```

- `is_readable()` gives the specific permissions diagnostic (e.g. wrong
  owner after a deploy); the `file() === false` branch catches residual
  failures (race, odd FS errors) with a generic message.
- `@` on `file()` suppresses the `E_WARNING` that can otherwise leak into
  output when `display_errors` is on in dev. Repo precedent:
  `coverage-gate.php` uses `@` on `simplexml_load_file`/`file_get_contents`.

### D2 — `env_bool()` (F6)

Replace the `?? $default` tail (`backend/env.php`) with an explicit branch
that logs on the unparseable path only:

```php
if ($value === false || $value === null || $value === '') {
    return $default;                         // unset semantics: stays silent
}

$parsed = filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);

if ($parsed === null) {
    error_log(sprintf(
        'env_bool: cannot parse value "%s" for %s; using default %s',
        $value, $key, $default ? 'true' : 'false'
    ));
    return $default;
}

return $parsed;
```

- Return values are byte-identical to the current `?? $default` collapse;
  only the null branch gains the log.
- Unset/empty stays silent (intended "use default" path, including the
  empty-string-as-unset semantics from commit `8221a58`); only
  present-but-garbage logs.

### D3 — Docblock updates

- `load_env()` `@note`: reword "errors … are silently discarded" to state
  that unreadable files and failed reads are logged via `error_log` and
  defaults are used; the never-throws guarantee is kept.
- `env_bool()`: add a note that unparseable values are logged.

### D4 — Tests

Shared mechanism: a small temp-file redirection for `error_log`
(`ini_set('error_log', $tmp)` before, restore after) — no existing test
helper covers this; the redirect is scoped per-test-file via
`beforeEach`/`afterEach`, mirroring the existing `restoreEnvVars` pattern.

`tests/Unit/LoadEnvTest.php` additions:

1. Unreadable file (created, `chmod 0000`, **skipped when running as root**
   via `posix_geteuid() === 0`): asserts the `is not readable` message in
   the captured log, and that env state is unchanged (defaults used).
2. Path is a directory (reliably makes `file()` return false without
   permission games): asserts the `failed to read` message in the captured
   log, env state unchanged, and — via a `set_error_handler` trap that
   records any warning — that **no warning leaks** (the `@` suppression).
3. Existing absent-file tests remain untouched, pinning the silent no-op.

`tests/Unit/EnvBoolTest.php` additions:

1. Garbage value (`APP_DEBUG=ture`): asserts `false` returned **and** the
   captured log contains the key, the raw value, and the default.
2. Guard tests: unset key and empty-string value produce an **empty**
   captured log (silence contract).

## Verification

1. Red: new tests fail against current `backend/env.php` (no log, or
   warning leaks); Green: pass after D1–D3.
2. `pest tests/Unit/LoadEnvTest.php tests/Unit/EnvBoolTest.php` — full
   existing suites still green unchanged.
3. Full `pest --coverage --min=80` (aggregate gate) and the per-changed-file
   coverage gate via `/check-php`.
4. `/check-php` (php-cs-fixer, stylelint, eslint, Pest coverage) and
   `code-review` before push.

## Risks & decisions

- **chmod-0000 test skip-if-root:** permission-based assertions are
  unreliable when the suite runs as root; the directory-path test covers the
  `file() === false` branch unconditionally, so the unreadable-branch test is
  additive, not load-bearing.
- **`@` suppression:** required to prevent `E_WARNING` leaking to output;
  repo precedent exists. php-cs-fixer does not flag error suppression.
- **Log noise:** `load_env()`/`env_bool()` run at bootstrap only; the added
  `error_log` fires at most once per request per fault. In this repo they are
  called only from tests; downstream apps get the intended visibility.
- **Spec rides the work branch** (develop is PR-only per the protected-branch
  invariant): the spec is committed on the `fix` branch created after this
  spec is approved, and merges via PR like previous
  `docs(specs): record approved … spec` commits.
- **One branch, two atomic commits** (F3, F6), each independently reviewable,
  all under this spec.
