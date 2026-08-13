# 0060. Global-Core + Project-Local-Adapter Install / Always-On AGENTS.md

Date: 2026-08-13

## Status

Accepted

Depends on ADR-0055, ADR-0056, ADR-0057, ADR-0058.

## Context

ADR-0058 split the harness into `@kyaulabs/prism-core` (language-agnostic)
and `@kyaulabs/prism-php-web` (PHP/web adapter), with the goal that the core
is **globally installed and always running** across every project while the
adapter is **opt-in per project**. The open question for Stage 5 was the
concrete install/deploy model: how does a package become "always running", and
who owns the global `AGENTS.md`?

Two pi facts shape the answer:

1. **pi packages install `extensions`, `skills`, `prompts`, and `themes` —
   not `AGENTS.md`.** A `pi install` lands the package resources under
   `~/.pi/agent/` (global) or `.pi/` (project), but the always-on instruction
   set (`AGENTS.md`) and the anti-drift bootstrap (`APPEND_SYSTEM.md`) are
   *context files*, not package resources. They need an out-of-band deploy.
2. **pi concatenates context files.** `~/.pi/agent/AGENTS.md` (global) is
   concatenated with every project's own `AGENTS.md` (walking up from cwd) and
   `APPEND_SYSTEM.md` is appended to the system prompt on every turn. So a
   globally-deployed `AGENTS.md`/`APPEND_SYSTEM.md` genuinely makes the core
   "always running" without clobbering a project's own instructions.

A third fact governs the dev/dogfooding path: paths in `.pi/settings.json`
resolve **relative to `.pi`** (a project-root sibling therefore needs `../`),
per the pi docs.

## Decision

We adopt a **global-core + project-local-adapter** install model, with an
out-of-band script for the always-on context files:

1. **Core → global.** `pi install npm:@kyaulabs/prism-core` (or
   `pi install ./packages/prism-core` for local dev) registers the core's
   skills, prompts, and the safety extension (ADR-0056) under
   `~/.pi/agent/`, so they load in every trusted project.
2. **Always-on context files.** `packages/prism-core/scripts/install-global.sh`
   deploys `AGENTS.md` and `APPEND_SYSTEM.md` from the package templates into
   `~/.pi/agent/`. It is **idempotent and merge-safe**: a managed block is
   marked with HTML-comment sentinels and replaced on re-run; a pre-existing
   user-owned file is backed up to `*.bak` (once) and the prism block is
   **appended** (not clobbered), preserving the user's own instructions. The
   script also runs the `pi install` in step 1, so a single command
   (`bash packages/prism-core/scripts/install-global.sh` from a clone, or
   `bash ~/.pi/agent/npm/@kyaulabs/prism-core/scripts/install-global.sh` after
   an npm install) sets up the whole always-on core.
3. **Adapter → project-local.** `pi install -l npm:@kyaulabs/prism-php-web`
   inside a PHP project contributes the stack skills and the adapter
   `safe-dirs.json` the core safety extension reads. pi's project-trust flow
   gates first use.
4. **Dogfooding.** This repository consumes its own packages from disk via
   `.pi/settings.json`, whose `skills`/`prompts`/`extensions` arrays point at
   `../packages/prism-core/...` and `../packages/prism-php-web/...` (`.pi`-
   relative resolution — a project-root sibling needs the `../` prefix). No
   `pi install` is needed for dev; a `pi` session here loads both packages
   and the safety extension directly.

## Consequences

- **Positive:** the core is "always running" by construction — its skills,
  prompts, extension, and `AGENTS.md` load in every trusted project once
  installed globally. The adapter is a clean opt-in. Merge-safe deployment
  means a user's existing global instructions survive. Dev needs no publish
  step (dogfooding via local paths).
- **Negative:** the always-on `AGENTS.md`/`APPEND_SYSTEM.md` deploy is a
  script, not a pi primitive — users must run `install-global.sh` (documented
  in the README) rather than relying on `pi install` alone. Re-running the
  script after a core upgrade refreshes the managed block in place.
- **Follow-up:** Stage 6 removes the `.opencode/` residue; Stage 7 (deferred)
  may split `packages/` into a dedicated repo and publish to npm — the package
  layout is already publish-ready, so that is a move + CI setup, not a
  re-architecture. If `.pi`-relative path resolution ever changes in pi, the
  dogfooding `.pi/settings.json` paths must be re-checked.

## Alternatives Considered

- **Ship `AGENTS.md` as a package resource.** Rejected: pi does not deploy
  `AGENTS.md` from packages — it is a context file discovered from fixed
  locations, not a package manifest entry. There is no pi hook to deploy it
  on install.
- **An extension that injects the core instructions via the system-prompt
  transform.** Rejected (ADR-0055): violates decision B (zero orchestration
  extensions). `APPEND_SYSTEM.md` is the pi-native, extension-free equivalent
  for the bootstrap; `AGENTS.md` uses pi's native context-file concatenation.
- **One combined global package (core + PHP).** Rejected in ADR-0058: the
  global "always running" goal would force PHP specifics into every non-PHP
  project.
