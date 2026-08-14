# AGENTS.md — kyaulabs/prism (project layer)

> **Thin project layer.** This repo *is* the prism harness. The authoritative
> harness instruction set — hard boundaries, the engineering pipeline, git
> workflow, model strategy, and the skills/commands index — lives in
> **[`packages/prism-core/AGENTS.md`](packages/prism-core/AGENTS.md)**. Read
> it first for any harness-affecting work. It is also what
> `packages/prism-core/scripts/install-global.sh` deploys to
> `~/.pi/agent/AGENTS.md` (global, loaded every session). pi concatenates the
> global core and this project layer into the system prompt, so the two never
> duplicate — this file carries only what is specific to *this* repository.

## What this repo is

`kyaulabs/prism` — the prism pi coding harness, shipped as two pi packages
under `packages/` and **dogfooded** from this same checkout:

- **`packages/prism-core`** — language-agnostic core (global: skills, prompts,
  the safety extension, `AGENTS.md`, `APPEND_SYSTEM.md`).
- **`packages/prism-php-web`** — PHP/web stack adapter (project-local).

The repo also carries **PHP/Aurora project heritage** (`aurora/` submodule,
`backend/`, `cdn/`, `tests/`), so it is itself a PHP project — the
`php-web-stack` adapter skill applies (see Stack below).

## Stack — PHP/Aurora

`composer.json` and `aurora/` are present, so load the **`php-web-stack`**
skill for stack specifics: PHP 8.5+, MariaDB, nginx, SCSS → Dart Sass, vanilla
JS, Pest 5 on PHPUnit 13, no-MVC, flat procedural PHP. The adapter's
`tdd-php`, `rcs-header`, `aurora-page`, `scss-mobile-first`, `database`,
`security-coding-php`, and related skills apply for PHP work in `backend/`,
`cdn/`, `tests/`, and `aurora/`.

> This repo is **not** a deployable web app — there is no `<app>/` webroot,
> `*.sql`, or `*.nginx.conf` at the root. `aurora/`, `backend/`, and `cdn/`
> are heritage and test infrastructure. The production-env paths described in
> `php-web-stack` refer to downstream consumers, not this checkout.

## Dogfooding

[`.pi/settings.json`](.pi/settings.json) loads `prism-core` + `prism-php-web`
skills/prompts/extension **from disk** (`../packages/...`), so a `pi` session
opened here has the full harness + adapter available with no install step. The
**safety extension** (from `prism-core`) is live and enforces the
credential-path deny floor (ADR-0047) and the `rm -rf` safe-zone policy.

## Repo-specific operations

- **Fresh clone:** `git submodule update --init` (`aurora/` is a submodule:
  `kyaulabs/aurora`, branch `main`).
- **Hooks:** `bash packages/prism-core/scripts/install-hooks.sh` (pre-commit,
  commit-msg, pre-push).
- **Gate:** `/check` → delegates to `/check-php` (php-cs-fixer + stylelint +
  eslint + Pest coverage ≥ 80%).
- **Assets:** `/build-assets` (adapter command — Dart Sass + uglify-js) when
  `cdn/sass` or `cdn/js` sources change. Never edit generated
  `cdn/css/*.min.css` or `cdn/javascript/*.min.js`.
- **Identity:** commit `Signed-off-by` resolves via
  `packages/prism-core/scripts/resolve-identity.sh` (optional
  `~/.config/prism/identity` override → `git config`; fail-closed).

## Deeper docs

- [`CODING_HARNESS.md`](CODING_HARNESS.md) — orientation: pi mapping, pipeline overview.
- [`CONTEXT.md`](CONTEXT.md) — domain glossary, entities, invariants.
- [`adr/`](adr/) — Architecture Decision Records (0001–0054 opencode-era
  frozen; 0055+ pi-era).
- [`README.md`](README.md) — install + quickstart.
- [`docs/follow-ups/`](docs/follow-ups/) — deferred work (evals, more adapters, publish).
