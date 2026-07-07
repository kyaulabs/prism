# Env Delivery Mechanism Spec

> **Issue:** [#23](https://github.com/kyaulabs/template/issues/23)
> **Status:** Design approved → ADR → plan → @tdd

## Problem

The harness documents `.env` + `env_bool('APP_DEBUG')` wiring in the
aurora-page skill template and ADR 0002, but **no component loads `.env`**.
The file is decorative. `env_bool()` reads `$_ENV ?? getenv()`, and PHP's
default `variables_order=GPCS` leaves `$_ENV` unpopulated. Dev-mode debug
(`APP_DEBUG=true`) is impossible to enable the documented way, pressuring
developers toward hardcoded `status: true`.

## Design

### Delivery mechanism

A **first-party `.env` loader** (`load_env()`) called explicitly at page
bootstrap. Parses `.env` if the file exists; absent file → no-op (holds
prod-default-off invariant by *file absence*, not by relying on
`variables_order`).

### Why first-party, not server-delivered

- Fits the no-dependency philosophy (`composer.json` has zero runtime deps).
- `.env.example` already exists and documents `APP_DEBUG`, `DB_*`, `APP_KEY`,
  `CSRF_KEY` — a server-only path makes this file meaningless.
- Dev ergonomics: edit a file vs. edit the FPM pool config.

### Accessor stability

`env_bool()` is **unchanged**. It continues reading `$_ENV ?? getenv()`.
`load_env()` populates those sources. The "Issue-1 trap" (`(bool)$_ENV['APP_DEBUG']` casting `"false"`→true) is already neutralized by
`filter_var(FILTER_VALIDATE_BOOL)` inside `env_bool()`. Populating `$_ENV` is
now safe.

### Explicit load, not auto-run

`load_env()` is **not** called at the bottom of `backend/env.php`. Side-effect-on-include would break `EnvBoolTest` (which sets `$_ENV` manually) and would hide a file read in what appears to be a function library.
The page template calls `load_env()` explicitly after the `require_once`.

## Architecture

```
Page (aurora-page template)                backend/env.php (extended)
┌──────────────────────────────┐          ┌──────────────────────────────┐
│ require aurora.inc.php       │          │ declare(strict_types=1);     │
│ require backend/env.php      │          │                              │
│ load_env();    ← NEW          │          │ env_bool()  ← UNCHANGED    │
│                              │  writes  │                              │
│ new Aurora(                   │────────→│ load_env()  ← NEW            │
│   status: env_bool('APP_DEBUG')         │  - is_file() guard           │
│ )                                      │  - line-by-line parse        │
└──────────────────────────────┘          │  - split first =             │
                                          │  - trim key/value            │
                                          │  - strip quotes              │
                                          │  - skip #/; comments         │
                                          │  - skip blanks               │
                                          │  - never overwrite           │
                                          │    pre-set $_ENV keys        │
                                          │  - $_ENV[$key] = $value      │
                                          │  - putenv("$key=$value")     │
                                          └──────────────────────────────┘
```

## File changes

| File | Action | Purpose |
| --- | --- | --- |
| `adr/0003-env-delivery-mechanism.md` | Create | ADR for the mechanism choice |
| `backend/env.php` | Modify | Add `load_env()` function |
| `tests/Unit/LoadEnvTest.php` | Create | TDD tests for `load_env()` |
| `.opencode/skills/aurora-page/SKILL.md` | Modify | Add `load_env();` call |
| `.env.example` | Modify | Update header: how the file is consumed |
| `CONTEXT.md` | Modify | Add ADR 0003 to architectural decisions |

## Parser behavior

- File absent → no-op (return, no error).
- Lines trimmed; blank lines and lines starting with `#` or `;` → skipped.
- Split on **first** `=`; trim key and value.
- Strips single matching pair of `'` or `"` from value.
- **Never overwrites** a key already set in `$_ENV` (server env wins).
- No variable interpolation, no nested expansion, no escaping.
- Sets both `$_ENV[$key]` and `putenv("$key=$value")`.

## Acceptance criteria (from issue #23)

- [ ] ADR 0003 merged documenting the mechanism + rejected alternative
- [ ] `APP_DEBUG=true` in `.env` measurably enables Aurora debug in a smoke test
- [ ] Production default (`.env` absent or `APP_DEBUG` absent) remains debug-off (tested)
- [ ] aurora-page skill template reflects the final wiring (Issue-1 accessor already in place)

## Test strategy

### Unit — `tests/Unit/LoadEnvTest.php`
- Happy: temp `.env` with `APP_DEBUG=true` → `env_bool('APP_DEBUG')` is true.
- Happy: `APP_DEBUG=false` → false.
- Absent file: `env_bool('APP_DEBUG')` stays false.
- Precedence: pre-set `$_ENV['KEY']` not overwritten by `.env`.
- Comments: `#` and `;` lines ignored.
- Blank lines ignored.
- Quoted values: `KEY="value"` → value stripped to `value`.
- First-`=` split: `KEY=a=b` → key `KEY`, value `a=b`.
- Cleanup between tests: `unset()` + `putenv("KEY")`.

### Integration — added to `tests/Integration/AuroraConstructorStatusTest.php`
- Load temp `.env` with `APP_DEBUG=true`, construct `Aurora(status: env_bool('APP_DEBUG'))`.
- No `.env` → `env_bool('APP_DEBUG')` is false → Aurora constructor sees `$status=false`.

## Out of scope

- `env_str()` sibling — deferred until a non-bool consumer appears (YAGNI).
- Aurora submodule skill copies — `kyaulabs/aurora` is a separate repo.
- Composer autoloading of `backend/env.php` — file is `require_once`'d manually.
