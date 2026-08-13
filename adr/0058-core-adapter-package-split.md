# 0058. Core / Adapter Package Split

Date: 2026-08-12

## Status

Accepted

Depends on ADR-0055.

## Context

The harness mixes language-agnostic behavior (the engineering pipeline, TDD
discipline, verification, review, safety) with stack-specific behavior (PHP
8.5+, MariaDB, nginx, Aurora, SCSS, php-cs-fixer, the vendor/cdn layout). In
opencode these lived together under `.opencode/`. For pi we want the
language-agnostic core to be **globally installed and always running** across
every project, while stack specifics are **opt-in per project**.

The question: do we ship one package (mixing core and PHP), two packages
(split along the language boundary), or defer the split?

## Decision

We split now into **two pi packages**:

- `@kyaulabs/prism-core` — language-agnostic. Installed **globally**
  (`pi install npm:@kyaulabs/prism-core`) so its skills, prompts, the safety
  extension (ADR-0056), and the global `AGENTS.md` are always-on across every
  trusted project.
- `@kyaulabs/prism-php-web` — the PHP/web adapter. Installed
  **project-locally** (`pi install -l …`) and opted into per PHP project.

**Boundary rule:** anything referencing PHP / Pest / Aurora / SCSS / nginx /
MariaDB / php-cs-fixer / vendor / cdn is adapter; everything else is core.

The safety extension lives in **core** and reads its `rm -rf` safe-zones from
the active adapter's `safe-dirs.json`, so the boundary tracks the stack
without a second extension. The core `AGENTS.md` documents an agent-honored
"adapter activation" convention: when adapter-trigger globs are present (e.g.
`composer.json`, `aurora/`), the agent loads the adapter's stack skill.

## Consequences

- **Easier:** core is reusable across languages (future `prism-python`,
  `prism-rust`, etc. mirror `prism-php-web`'s shape); the global install model
  makes the core "always running" by construction; the safety boundary tracks
  the stack via data, not code.
- **Harder:** two packages to version/release; the core/adapter boundary must
  be policed (if porting a language requires core changes, the boundary is
  wrong — halt and ADR). Adapter activation is a convention, not enforcement.
- **Follow-up:** Stage 0 scaffolds both packages; Stage 1 lands the core;
  Stage 4 lands the PHP/web adapter; ADR-0060 records the install/deploy model
  (global core + project-local adapter + always-on `AGENTS.md`).

## Alternatives Considered

- **One package (mix core + PHP).** Rejected: the global "always running" goal
  would force PHP specifics into every non-PHP project, and the core would not
  be reusable as-is.
- **Defer the split (one package now, split later).** Rejected: retrofitting a
  boundary after the fact is harder than drawing it during the port, and the
  global-install model demands the split exist before Stage 5.
