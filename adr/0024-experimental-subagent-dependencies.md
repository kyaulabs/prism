# 0024. Experimental Subagent Dependencies

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-16

## Status

Accepted

Sourcing clause superseded by ADR-0029 (experimental flags moved from .opencode/experimental.default.env to setup.json experimental key).

## Context

The harness currently has an inconsistent posture toward experimental opencode
features:

1. **LSP tool (`OPENCODE_EXPERIMENTAL_LSP_TOOL`)**: already in use (enables the
   Intelephense `lsp` tool for six agents), but the user must export it
   manually in their shell profile per `AGENTS.md` L232-242. It is not
   auto-sourced from the repository.

2. **Scout (`OPENCODE_EXPERIMENTAL_SCOUT`)**: the vendored opencode docs
   (`opencode-docs/docs/agents.mdx`) document `@scout` as a **built-in**
   experimental subagent, disabled by default. The harness already references
   `@scout` in 12 locations (opencode.jsonc delegation table + permission
   allowlist, AGENTS.md, README.md, CODING_HARNESS.md, ADR-0005, ADR-0006,
   research command + docs, writing-plans skill) but never sets the enabling
   flag. `ADR-0005` (Plan-agent delegation-only) is **load-bearing** on
   `@scout` as the Plan agent's web-research delegate — stripping scout would
   re-open ADR-0005. The flag is set nowhere in the repository.

3. **Background subagents (`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`)**: 
   the vendored opencode docs document this as enabling background subagent
   tasks (`cli.mdx` L728), and `POST /session/:id/prompt_async` exists in the
   API (`server.mdx` L178). However, the `task` tool schema has **no documented
   `background` parameter**, and the flag is set nowhere in the repository.
   The actual mechanism — per-invocation param vs. global toggle vs.
   not-yet-functional — is **unverified** (Issue #141 acceptance criterion #1).
   This is tracked as Phase 0 of the implementation plan.

There is also no consistent delivery mechanism for opencode-process 
experimental flags. `ADR-0003` (`env-delivery-mechanism`) covers PHP-runtime
`$_ENV` delivery (the PHP `load_env()` call), which is a separate layer from
opencode-process flags (consumed by the TUI before any PHP code runs). The
`.envrc` (direnv) already auto-sources model-tier values from
`.opencode/models.default.env` — this same pattern can serve opencode-process
flags.

## Decision

1. **Enable `@scout`** via `OPENCODE_EXPERIMENTAL_SCOUT=true`, delivered
   automatically through the direnv/.envrc mechanism. Scout is a built-in
   experimental subagent — the existing 12 harness references are correct; the
   only missing piece is the enabling flag. We do **not** strip or redefine
   scout.

2. **Consolidate all experimental opencode-process flags** into a single
   committed file: `.opencode/experimental.default.env`, sourced by `.envrc`
   (mirroring the `.opencode/models.default.env` pattern). This replaces the
   manual-export precedent set by `OPENCODE_EXPERIMENTAL_LSP_TOOL` (which is
   moved into this file).

3. **Defer `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`** to a manual
   spike (Phase 0 of the implementation plan):
   - The flag is **commented** in `.opencode/experimental.default.env`.
   - After the spike classifies the mechanism (per-invocation / global-toggle /
     infeasible), the flag will either be uncommented or documented as advisory.

4. **Document the consolidated posture in `AGENTS.md`** — generalize the
   LSP-specific section into an "Experimental OpenCode Features" section
   covering all three flags, noting they are auto-sourced via `.envrc`.

## Consequences

### Positive
- `@scout` is always available when opencode is launched from the project
  directory (direnv), closing the gap between ADR-0005's delegation model and
  the runtime reality.
- `OPENCODE_EXPERIMENTAL_LSP_TOOL` is now auto-sourced, removing the manual
  setup step — users no longer need to export it in their shell profile.
- A single, consistent delivery mechanism for opencode-process experimental
  flags (`.opencode/experimental.default.env` sourced by `.envrc`) replaces
  the ad-hoc manual-export precedent.
- New experimental flags follow a clear pattern: add to the env file with an
  ADR documenting the dependency.

### Neutral
- Users must run `direnv allow` after this change if they haven't already.
- Users with an existing manual `OPENCODE_EXPERIMENTAL_LSP_TOOL` export in
  their shell profile may now have a redundant export (harmless; the `.envrc`
  value takes precedence in the opencode process environment).

### Negative
- Relies on two experimental opencode features (scout, LSP tool). If either
  flag is removed or renamed upstream, the harness must adapt — the ADR and
  `AGENTS.md` serve as the impact-analysis entry point.
- Background subagent capability is gated on a manual spike; the feature
  remains partially incomplete until verified.

## Alternatives Considered

### Strip `@scout` from all harness references
Rejected. `ADR-0005` is load-bearing on `@scout` as the Plan agent's
web-research delegate. Stripping would require rewriting ADR-0005's delegation
model, updating all 12 reference sites, and finding a replacement for the
`websearch`+`webfetch`+source-clone research workflow. Enable is lower-risk and
architecturally consistent.

### Keep LSP manual-export, add separate instructions for scout
Rejected. Two different delivery mechanisms (manual shell profile for LSP,
another mechanism for scout) creates documentation fragmentation and increases
setup friction. Consolidated auto-sourcing is simpler.

### Auto-source experimental flags directly in `.envrc` instead of a sourced file
Rejected. A dedicated `.opencode/experimental.default.env` mirrors the
established `models.default.env` pattern, keeps concerns separated
(model-tier vs. opencode-process), and makes the background-flag gate
self-documenting (commented line in a dedicated file).
