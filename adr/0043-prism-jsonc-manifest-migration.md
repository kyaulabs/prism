# 0043. Adopt prism.jsonc as the Unified Project + User Manifest

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-28

## Status

Accepted

Supersedes ADR-0029 (unified setup.json config — its `.opencode/setup.json`
location, `jq` reader, schema-v4 whole-file selection, and 3-tier identity
fallback are replaced by the dual-`prism.jsonc` design below). Supersedes
ADR-0032's explicit rejection of JSONC (§6 and the "Migrate setup.json →
setup.jsonc" alternative) — JSONC is now adopted project-wide for the
manifest. ADR-0032's empty-committed-`env.*` security invariant is preserved.

Implementation is tracked by issue #276 and the plan at
`docs/plans/2026-07-28-prism-jsonc-migration.md`. This ADR records the
decisions; the codebase cutover follows the plan's 13 TDD tasks.

## Context

ADR-0029 consolidated three config files (`.opencode/models.default.env`,
`.opencode/experimental.default.env`, `.opencode/setup.json`) into a single
`.opencode/setup.json` (schema v4) parsed by `jq`, with a 3-tier identity
fallback (user → project → git config). ADR-0032 added an optional `env`
key for MCP-server secrets and explicitly rejected migrating to JSONC
because `jq` cannot parse it.

Two forces now drive a change:

1. **Users want to comment their configuration.** The manifest carries five
   model tiers, five variant tiers, three experimental flags, identity
   fields, scaffold bookkeeping, and an `env` secret section. JSON's
   comment-hostility makes a documented, self-explaining manifest
   impossible inline; users must cross-reference `mcp.md` and
   `model-configuration.md` to understand each field.
2. **The project has matured to deserve a top-level manifest identity.**
   `.opencode/setup.json` is an implementation detail masquerading as a
   config location. A root-level `prism.jsonc` makes the manifest a
   first-class project artifact, visible at the repository root alongside
   `AGENTS.md`, `CONTEXT.md`, and `opencode.jsonc`.

Active readers/writers/enforcement of `.opencode/setup.json` (pre-migration
blast radius, 35+ touchpoints): `.envrc`, `resolve-identity.sh`,
`setup-scaffold.sh`, `/setup` (`.opencode/commands/setup.md`),
`migrate-setup.sh`, `setup-write-user-config.sh`, `check-setup-secrets.sh`,
`pre-commit` (staged-blob guard), `ci.yml` (both jobs), seven test files,
and eight living-docs files. Historical ADRs (0024, 0026, 0029–0033, 0040)
and completed specs/plans reference the old path but are immutable records.

## Decision

We replace both legacy `setup.json` manifests with schema-v5 `prism.jsonc`
manifests, parsed by one dependency-free, comment-preserving PHP 8.5 JSONC
reader shared across all consumers. The ten settled decisions follow.

### 1. Project manifest location

The project manifest moves from `.opencode/setup.json` to **`prism.jsonc`
at the repository root**. It is the single source of project-level truth.

### 2. Project legacy removal

`.opencode/setup.json` is **removed entirely** after migration. There is
**no project-level fallback** — no "both exist" branch, no silent
fall-through. The migration engine deletes the legacy file only after the
replacement is atomically written, reparsed, and verified as schema v5.

### 3. User manifest location and overlay

The user manifest moves from `~/.config/opencode/setup.json` to
**`~/.config/opencode/prism.jsonc`**. Resolution is a **recursive
field-by-field overlay**: project defaults first, then user values.
Object keys merge recursively; arrays and scalars are replaced atomically
by the user value. Missing user fields inherit project values.

### 4. User manifest format

`~/.config/opencode/prism.jsonc` is **genuine JSONC** parsed by the **same
shared reader** as the project manifest. One parser serves both tiers.

### 5. User-level legacy handling

`/setup` migrates `~/.config/opencode/setup.json` → `prism.jsonc`, removes
the old file, and emits a **deprecation warning** if the old `setup.json`
is detected afterward (e.g. a user re-edits the wrong file). The
user-level legacy cannot be force-removed across all machines (it lives
outside the repo), so the warning is the safety net.

### 6. Schema version

`setup_version` bumps **4 → 5**. The on-disk format, both locations, and
the overlay semantics all change — version 5 is the explicit migration
boundary and prevents ambiguity with legacy v4 files. `migrate-setup.sh`
refuses a downgrade.

### 7. Parser scope — full JSONC

The shared reader supports **full JSONC**: full-line `//` comments,
trailing `//` comments, and block `/* */` comments (single- and
multi-line).

> **Note:** This overrides the `@architect` review's recommended contract
> ("full-line `//` only; trailing/block fail closed"). The human chose full
> JSONC for consistency with common JSONC tooling. The reader therefore
> **cannot be a regex stripper** — it must be a real state-machine tokenizer
> that correctly handles `//` and `/* */` sequences inside string literals,
> escaped quotes/backslashes (`\"`, `\\`), multi-line block comments, and
> nested structures. This is a meaningful complexity cost, accepted
> deliberately.

### 8. Trailing commas

Trailing commas are **allowed** in objects and arrays (e.g. `{"a":1,}`).
The tokenizer strips them only outside strings and comments. This matches
common JSONC expectations and is consistent with decision 7's "full JSONC"
posture.

### 9. Migration trigger

Migration is invoked **both** ways:

- **`migrate-setup.sh`** is the engine — scriptable, CI-friendly, idempotent
  (a no-op when already migrated). It handles the dual rename (project +
  user), validates before deleting, and refuses downgrade/conflicts.
- **`/setup`** invokes `migrate-setup.sh` **automatically on entry**, so a
  user who runs `/setup` self-heals without a separate manual step.

### 10. Comment preservation on `/setup` rewrite

`/setup` performs **in-place field patching**, not wholesale template
regeneration. It modifies only the specific owned fields, preserving every
user-authored comment and every unrelated field. Applying the same update
twice is byte-identical on the second pass.

> **Complexity cost:** This requires the tokenizer to support **round-trip
> comment-preserving serialization** — replacing value spans in place and
> inserting missing leaves at the owning object's closing brace while
> leaving every other byte untouched. This is the dominant implementation
> risk (see Consequences).

### Shared reader contract

A dependency-free PHP 8.5 boundary under `.github/scripts/` exposes
`PrismJsoncDocument` (parse, file load, root access, source retention,
span-preserving `withValues()` patch, atomic `writeAtomic()`) and
`PrismManifest` (recursive `resolve()`, `validateProject()`,
`validateUser()`), plus a narrow CLI (`prism_manifest.php`) for shell
consumers (`validate`, `decode`, `env0`, `get`, `values0`, `patch`,
`migrate-preview`, `migrate`, `check-secrets`). The reader works before
`vendor/autoload.php` exists; no Composer dependency is added.

### Fail-closed semantics

A missing user manifest is valid. Each of the following **fails closed**
with a redacted diagnostic (no secret values in output): a missing project
manifest, a malformed project or user manifest, a duplicate object key, an
unsupported schema version, an unsafe symlink, excessive size (1 MiB), or
excessive nesting (64 levels). There is no silent fall-through from a
malformed higher-priority file.

### Security invariants preserved

- `env.*` values in committed `prism.jsonc` remain empty. The staged-blob
  guard (`check-setup-secrets.sh` + `pre-commit` + both CI jobs) enforces
  this at the new path.
- User writes are atomic, mode `0600`, and reject symlink targets. Project
  writes are mode `0644`.
- `.envrc` does not `eval` configuration. The CLI transports allowlisted
  environment names and values as NUL-delimited pairs, buffered and
  validated before the first byte is written.

### `/setup` external-directory exception

`/setup` is human-invoked only. It may read, write, `chmod`, and remove
**only** `~/.config/opencode/prism.jsonc` and the legacy
`~/.config/opencode/setup.json` (during migration), creating
`~/.config/opencode/` when absent. No agent invokes `/setup`
autonomously; no other path under `~/.config/opencode/` is touched. This
is recorded as a narrow exception to AGENTS.md's "Do not modify files
outside the project directory" Hard Boundary.

## Consequences

### Positive

- **Commentable configuration** — both manifests self-document via inline
  comments; users no longer cross-reference `mcp.md` /
  `model-configuration.md` to understand each field.
- **Single shared reader** — one dependency-free PHP tokenizer replaces
  `jq` across `.envrc`, `resolve-identity.sh`, `setup-scaffold.sh`,
  `/setup`, `migrate-setup.sh`, `setup-write-user-config.sh`,
  `check-setup-secrets.sh`, and the pre-commit guard. No `jq` toolchain
  dependency remains.
- **Top-level manifest identity** — `prism.jsonc` at the repo root is a
  first-class artifact alongside `AGENTS.md`, `CONTEXT.md`, and
  `opencode.jsonc`.
- **Explicit migration boundary** — schema v5 + dual rename makes the
  cutover unambiguous; `migrate-setup.sh` refuses downgrade.
- **Round-trip safety** — `/setup` preserves user comments and unknown
  fields across rewrites; byte-idempotent on repeat invocation.

### Negative

- **Tokenizer complexity** — the dominant risk. Full JSONC lexical edge
  cases (comment markers in strings, escaped delimiters, multi-line block
  comments, duplicate keys, source-span insertion) require a real
  state-machine parser, not a regex stripper. Task 1 of the plan carries
  extra review weight; the plan recommends a focused `@architect`
  re-review after Task 2 nails the public API.
- **Round-trip serialization cost** — in-place field patching with comment
  preservation is harder than wholesale regeneration. Replacing scalar
  spans is tractable; insertion into sparsely formatted or comment-heavy
  objects must remain deterministic and byte-idempotent.
- **Dual-rename blast radius** — 35+ active and historical references.
  Historical ADRs/plans/specs remain immutable; active source and living
  docs must reach zero accidental legacy reads.
- **User-level legacy cannot be force-removed across all machines** —
  `~/.config/opencode/setup.json` lives outside the repo. Migration relies
  on `/setup` invocation plus a deprecation warning when the old file is
  detected afterward. Machines that never run `/setup` retain a stale,
  ignored file.
- **One-way schema migration** — rolling back requires manual schema
  editing. The deleted `.opencode/setup.json` is preserved in git history
  (recoverable if rollback is absolutely required).

### Neutral

- `{env:VAR}` substitution in `opencode.jsonc` is unchanged — the exported
  variable names and values remain identical, so indirect consumers need
  no path changes.
- The five model tiers (PRIMARY/PLANNER/DESIGN/JUDGE/UTILITY) are
  unchanged.
- CI workflow structure is unchanged; only the secret-guard step names and
  validated path change.

## Alternatives Considered

### Architect's "full-line `//` only, trailing/block fail closed"
Rejected by the human. Full-line-only is the simplest contract and the
hardest to misuse, but the human chose full JSONC for consistency with
common JSONC tooling and to avoid claiming "JSONC" while rejecting widely
supported constructs. The accepted complexity cost is a real tokenizer
rather than a regex stripper.

### Wholesale template regeneration on `/setup` rewrite
Rejected. Simpler to implement (no round-trip serialization), but discards
user-authored comments on every `/setup` invocation — defeating a primary
motivation for the migration (decision 1's "users want to comment their
configuration"). In-place field patching preserves comments and unknown
fields.

### Keep user-level as `setup.json` (plain JSON)
Rejected. Inconsistent with the project file (two formats, two parsers)
and forfeits comment support for user configuration. The human chose a
single JSONC format and shared reader across both tiers.

### Keep project-level legacy `.opencode/setup.json` as a fallback tier
Rejected. The human wants `prism.jsonc` as the single source of truth with
no project-level fallback. A fallback tier adds a "both exist" branch,
silent fall-through risk, and drift between two project files.

### Keep the three-tier identity fallback from ADR-0029
Superseded. With the user manifest renamed and field-by-field overlay
adopted, identity resolution becomes a 2-tier resolved-view lookup (project
+ user overlay) with `git config` as the identity fallback when the
resolved pair is incomplete. Git configuration is an identity fallback,
not a third manifest tier.

## Cross-refs

- `adr/0029-unified-setup-json-config.md` (superseded)
- `adr/0032-mcp-server-onboarding.md` (JSONC rejection superseded; empty-`env.*` invariant preserved)
- `adr/0007-setup-token-strategy.md` (scaffolding token substitution, unaffected)
- `adr/0026-project-scaffolding.md` (scaffold bookkeeping fields, relocated)
- `adr/0030-design-primary-agent-and-tier.md` (jq-fallback precedent, superseded by schema bump)
- `docs/plans/2026-07-28-prism-jsonc-migration.md` (implementation plan, 13 TDD tasks)
- `.opencode/docs/model-configuration.md`
- `.opencode/docs/mcp.md`
- `CONTEXT.md` (Prism manifest glossary terms + entity)

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
