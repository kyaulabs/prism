# $KYAULabs: 0029-unified-setup-json-config.md kyau@nova 2026/07/19 -0700 Exp $

# 0029. Consolidate models.default.env + experimental.default.env into setup.json

Date: 2026-07-19

## Status

Accepted

## Context

ADR-0012 (configurable model variables) and ADR-0013 (configurable variant)
chose shell-sourced `.env` files for their zero-dependency simplicity: a fresh
clone works with just direnv (`direnv allow`).

Three config files now exist:

1. `.opencode/models.default.env` — committed defaults for 4 model tiers + 4
   variants (8 env vars total).
2. `.opencode/experimental.default.env` — committed defaults for 3
   experimental opencode flags (LSP_TOOL, SCOUT, BACKGROUND_SUBAGENTS).
3. `.opencode/setup.json` — the `/setup` command's manifest, currently v1
   schema with `app`, `domain`, `repo`, `signed_off_by_name`,
   `signed_off_by_email`.

The split makes identity configuration (in setup.json) inconsistent with
model/experimental configuration (in .env files). The `/setup` command already
expects setup.json v3 schema per its §8 manifest template, but the actual file
is at v1.

Per ADR-0007, `/setup` uses `setup-substitute.sh` to do in-place literal
substitution (`kyau <git@kyaulabs.com>` → user identity) across harness files.
This requires rewriting tracked files for every identity change.

## Decision

Consolidate all three config files into `.opencode/setup.json` (schema v4).
The `models`, `variants`, and `experimental` keys absorb the content of the
deleted `.env` files.

`.envrc` (direnv) is rewritten to read `.opencode/setup.json` (project-level)
and `~/.config/opencode/setup.json` (user-level override, replacing
`~/.config/opencode/models.env`) via `jq`, then export `OPENCODE_MODEL_*`,
`OPENCODE_VARIANT_*`, `OPENCODE_EXPERIMENTAL_*` env vars.

`opencode.jsonc`'s `{env:VAR}` substitution pattern is preserved unchanged.

The 4-tier model (PRIMARY/PLANNER/JUDGE/UTILITY) is preserved.

`/setup` is refactored to write all configuration to setup.json (and
user-scoped fields to `~/.config/opencode/setup.json`). It no longer performs
literal substitution of `kyau <git@kyaulabs.com>` across harness files —
identity is resolved at runtime by `resolve-identity.sh` (3-tier fallback:
user setup.json → project setup.json → git config user.name/user.email).

`setup-substitute.sh` keeps ONLY scaffolding tokens (`<app>`, `<domain>`,
`<username>`, `kyaulabs/template`, `git+abuse@kyaulabs.com → abuse@<domain>`).
Identity tokens (`kyau <git@kyaulabs.com>`, `git@kyaulabs.com`) are removed.

### `jq` dependency justification

(a) `jq` is universally available on Linux/macOS via standard package managers
(apt, brew, dnf, pacman).

(b) The complexity of multi-source JSON parsing (project + user overrides,
nested keys for models/variants/experimental) exceeds what pure shell can
cleanly handle.

(c) `setup-scaffold.sh` already requires Bash 4+ so the toolchain floor is not
pristine — adding `jq` is a marginal increment.

(d) Graceful degradation path is defined: `.envrc` checks `command -v jq` and
prints a clear actionable error if absent (does NOT silently fall back).

(e) The `setup-scaffold.sh` script (line 201) previously avoided `jq` for
simple sed-based parsing; that decision is preserved for the scaffolding flow,
which is a different use case (single-file template materialization, not
runtime config reads).

### Graceful degradation

`.envrc` checks `command -v jq`; if absent, prints a clear error
(`"jq is required by .envrc. Install via your package manager. apt install jq / brew install jq / dnf install jq"`)
and returns/exits non-zero so direnv surfaces the failure loudly. Does NOT
silently fall back to old behavior.

### v1 → v4 migration path

A new `migrate-setup.sh` script detects the `setup_version` field in
`.opencode/setup.json`; if absent or `< 4`, it adds
`models`/`variants`/`experimental`/`accent`/`scaffold_mode`/`project_folder`
keys with default values from the deleted
`models.default.env`/`experimental.default.env`.

The migration is **idempotent** — safe to run on already-v4 files (no-op).

`.envrc` auto-runs `migrate-setup.sh` on every direnv entry, so existing
clones self-heal on next `cd` into the project.

### Back-compat shim for legacy `~/.config/opencode/models.env`

If `~/.config/opencode/setup.json` does NOT exist and
`~/.config/opencode/models.env` DOES exist, `.envrc` sources the legacy file
with a deprecation warning.

The shim will be removed in a future release.

### Reversibility cost

Schema bump is **one-way**. Rolling back requires manual schema editing of
`.opencode/setup.json` (or accepting the v4 file with v1 consumers, which
would not work).

The deleted `.env` files are preserved in git history (recoverable if rollback
is absolutely required).

Documented as accepted cost — the consolidation is a deliberate architectural
improvement.

## Consequences

### Positive

- Single source of truth for all harness configuration. Identity becomes
  dynamic (per-developer without harness rewrites). `/setup` no longer dirties
  the working tree with literal substitutions.

### Negative

- Adds `jq` to the toolchain floor. One-way schema migration. Users with
  existing v1 setup.json files auto-migrate on next direnv entry (transparent,
  but a silent change to a tracked file — surfaced via the migration log
  message).

### Neutral

- `{env:VAR}` substitution in `opencode.jsonc` is unchanged. Tier rigidity is
  unchanged. CI workflow is unaffected (CI uses `OPENCODE_CONFIG_CONTENT` for
  inline overrides, not direnv).

## Supersedes / Amends

- **Supersedes ADR-0007** (setup token strategy) — partially. The model
  delivery mechanism changes from `setup-substitute.sh` literal rewriting to
  runtime resolution via `resolve-identity.sh`. The token-substitution strategy
  itself (longest-match-first, literal find strings) survives unchanged for
  scaffolding tokens.
- **Amends ADR-0012** (configurable model variables) — sourcing clauses
  superseded. Delivery mechanism changed from shell-sourced `.env` files to
  `jq`-parsed `setup.json`. The `{env:VAR}` substitution pattern and 4-tier
  model are preserved.
- **Amends ADR-0013** (configurable variant via env var) — same sourcing
  amendment as ADR-0012.
- **Amends ADR-0024** (experimental subagent dependencies) — sourcing clause
  superseded. Experimental flags moved from `.opencode/experimental.default.env`
  to `setup.json`'s `experimental` key.

## Alternatives Considered

- **Keep three config files, refactor `/setup` to read all three** — rejected:
  the split perpetuates inconsistency and doubles the configuration surface.
  `/setup` would need to read/write three files instead of one, increasing
  complexity and drift risk.
- **Drop `jq`, use `grep`/`sed` for JSON parsing** — rejected: multi-source
  JSON merging with nested key overrides is brittle with `grep`/`sed`.
  `setup-substitute.sh` (ADR-0007) proved that simple sed suffices for literal
  string find/replace, but config consolidation is a different problem
  (structured merge, not literal substitution). The
  `setup-scaffold.sh:201` precedent (avoid `jq` for simple parsing) addresses
  a fundamentally different use case.
- **Keep `.env` files, add `setup.json` as an overlay** — rejected: two sources
  of truth with implicit precedence rules invites silent misconfiguration.

## Cross-refs

- `adr/0007-setup-token-strategy.md`
- `adr/0012-configurable-model-variables.md`
- `adr/0013-configurable-variant-via-env-var.md`
- `adr/0022-sub-agent-model-config-opencode-jsonc.md`
- `adr/0024-experimental-subagent-dependencies.md`
- `adr/0026-project-scaffolding.md`
- `.opencode/docs/model-configuration.md`
- `resolve-identity.sh`
- `new-branch.sh`

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
