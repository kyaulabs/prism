# 0003. First-Party `.env` Delivery Mechanism

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-06

## Status

Accepted

## Context

The harness documents `.env` configuration (`APP_DEBUG`, `DB_*`, `APP_KEY`,
`CSRF_KEY`) and the aurora-page skill template wires `env_bool('APP_DEBUG')` at
the Aurora constructor. However, **no component loads `.env`**. PHP's default
`variables_order=GPCS` means `$_ENV` is unpopulated, and `composer.json` has
zero runtime dependencies — no dotenv package.

The effect: setting `APP_DEBUG=true` in `.env` does nothing. Debug mode is
impossible to enable the documented way, which pressures developers toward the
dangerous anti-pattern of hardcoded `status: true` at the Aurora constructor.

Per ADR 0002, `env_bool()` is already the single point of control for debug
mode. The `FILTER_VALIDATE_BOOL` inside `env_bool()` neutralizes the original
"Issue-1 trap" where `(bool)$_ENV['APP_DEBUG']` would cast the string `"false"`
to `true`. Populating `$_ENV` from `.env` is now safe — the accessor interprets
values correctly.

The question is: *what mechanism populates `$_ENV` with `.env` values?*

Forces:
- **Zero-dependency philosophy** — no `vlucas/phpdotenv`.
- **Dev ergonomics** — editing `.env` should enable debug mode.
- **Production safety** — absent file must default to debug-off.
- **Test stability** — existing `EnvBoolTest` sets `$_ENV` manually; an
  auto-running loader would overwrite test fixtures.
- **Server precedence** — real environment variables must take priority over
  `.env` file values (principle of least surprise).
- **PHP `variables_order`** — `GPCS` is the default; `E` (ENV) is omitted
  unless explicitly configured.

## Decision

We implement a first-party `load_env(string $path): void` function in
`backend/env.php` that parses a `.env` file at page bootstrap:

- **Explicit call with explicit path** — the aurora-page skill template calls
  `load_env(__DIR__ . '/../.env')` after `require_once "backend/env.php"`. The
  caller passes the path, keeping the function honest (no magic path derivation)
  and testable (tests pass temp file paths directly). No side-effect-on-include;
  tests that set `$_ENV` manually are not disrupted.
- **File-absent → no-op** — production has no `.env` (gitignored). The
  debug-off default is held by *file absence*, not by PHP runtime config.
- **Minimal parser** — read lines; skip blanks and `#`/`;` comments; split on
  first `=`; trim; strip surrounding matching quotes. No interpolation, no
  nested expansion.
- **Never overwrite** — a key is set only if it does not already exist in
  `$_ENV` **and** `getenv()` returns `false`. This ensures server-delivered vars
  (FPM `env[]`) win over `.env` regardless of whether the server populates
  `$_ENV` (via `variables_order=E`) or only `getenv()`. The combined check
  covers both delivery paths.
- **Dual population** — `$_ENV[$key] = $value` and `putenv("$key=$value")`.
  This covers both consumers: `$_ENV` access (PHP arrays) and `getenv()` calls.
- `env_bool()` is **unchanged** — continues reading `$_ENV ?? getenv()`.

## Consequences

- **Easier:** `APP_DEBUG=true` in `.env` now measurably enables Aurora debug
  mode. Developers follow the documented path; hardcoded `status: true` is no
  longer the only option. This completes the `env_bool()`-as-single-point-of-control
  contract from ADR 0002 — the Semgrep rule `kyaulabs-aurora-status-true-literal`
  and the Pest arch test `AuroraConstructorStatusTest` are now fully
  enforceable (developers have a documented, working path to enable debug).
- **Easier:** production default remains safe — absent `.env` file means
  `APP_DEBUG` resolves to the `env_bool()` default (`false`).
- **Easier:** zero new dependencies; `composer.json` stays runtime-dependency-free.
- **Harder:** `.env` is not parsed automatically on include — page authors must
  remember the `load_env()` call. Mitigated by updating the aurora-page skill
  template.
- **Harder:** the parser is deliberately minimal — no quoting inside values
  beyond a single pair, no variable interpolation. If a future project needs
  these features, this ADR should be superseded rather than the parser
  patched.
- **Neutral:** `$_ENV` and `getenv()` are now populated from a file, meaning
  `env_bool()` can return file-driven values. This is the desired behavior
  (the whole point), but it changes the observable contract: `env_bool()`
  previously only responded to system-level env vars; now it reflects `.env`
  content.

## Alternatives Considered

- **Server-delivered env only (FPM `env[]`)** — configure `APP_DEBUG` in the
  FPM pool and read via `getenv()`, documenting the `variables_order=E` caveat.
  Rejected: dev ergonomics are poor (every dev must edit their FPM pool), and
  the existing `.env.example` becomes meaningless documentation of env vars
  that are set elsewhere.
- **Composer dotenv package (`vlucas/phpdotenv`)** — the canonical solution.
  Rejected: violates the zero-dependency philosophy; `composer.json` currently
  has no runtime `require` entries beyond `php >=8.5`. Adding a dep for ~20
  lines of parsing is disproportionate.
- **Auto-run on include (`require_once "backend/env.php"` calls
  `load_env()` internally)** — would be transparent to page authors. Rejected:
  `EnvBoolTest` sets `$_ENV` manually and would be overwritten. An
  explicit load is testable in isolation and makes the file-read cost visible.

## Amendments

- **2026-07-23 (issue #192):** The minimal parser was hardened against
  malformed and dangerous input. Key names are now validated against
  `/^[A-Za-z_][A-Za-z0-9_]*$/`; a leading `export ` prefix and a leading
  UTF-8 BOM are stripped; inline `#` comments are removed from unquoted
  values (preserved inside quotes) via an extracted `parse_env_value()`.
  A fixed blocklist (`is_dangerous_env_name()`) refuses to load names that
  yield code execution in child processes (`LD_PRELOAD`, `BASH_ENV`,
  `DYLD_INSERT_LIBRARIES`, …) so an attacker-influenced `.env` cannot
  become RCE. `env_bool()` now treats an empty-string `$_ENV` entry as
  unset, falling back to `getenv()`, so a file line like `APP_DEBUG=` no
  longer shadows a server-delivered value. The "never overwrite server env"
  decision and the "no variable interpolation" invariant are unchanged; the
  parser still performs no nested expansion.

