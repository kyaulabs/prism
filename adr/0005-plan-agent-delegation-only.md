# 0005. Plan Agent — Delegation-Only I/O

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-08

## Status

Accepted

## Context

The Plan agent (`opencode.json` agent `plan`, mode `primary`) is designed as a
read-only planning and analysis agent. Its `edit` and `bash` permissions were
already denied, preventing file modifications and shell commands.

However, several I/O permissions were left unspecified and defaulted to
`allow` per OpenCode's permissive-default policy:

- `read` — direct file reading
- `glob` — file pattern matching
- `grep` — content search
- `list` — directory listing
- `webfetch` — URL fetching
- `websearch` — web search
- `lsp` — LSP queries

This allowed the Plan agent to perform direct filesystem reads, codebase
searches, and web research — bypassing the delegation pattern where
specialized subagents (`@explore` for codebase, `@scout` for web) should
handle all I/O. The agent could act as both researcher and planner, muddying
the separation of concerns and introducing two problems:

1. **Unpredictable behavior** — the model could choose direct reads or
   delegation arbitrarily, producing inconsistent results.
2. **No explicit delegation prompt** — the Plan agent had no `prompt` field,
   so it lacked instruction on how to delegate. Without it, the model might
   attempt denied tools and waste tokens on failures before falling back to
   delegation.

The task allowlist already included the right subagents (`@explore`,
`@scout`, `@architect`, `@code-review`, `@semgrep`, `@test-audit`,
`@docs-writer`) — only the permission gaps and missing prompt remained.

## Decision

1. **Deny all I/O permissions** on the Plan agent — `read`, `glob`, `grep`,
   `list`, `webfetch`, `websearch`, and `lsp` — so the agent cannot perform
   any direct filesystem, web, or LSP operations.

2. **Add a custom `prompt`** defining the delegation-only pattern: an explicit
   table mapping operations to subagents, a clear statement of what the Plan
   agent does (analyze, synthesize, write plans as text) and does not do
   (read, bash, fetch, edit, LSP), and a numbered workflow from dispatch to
   plan presentation.

3. **Preserve `skill`, `question`, and `todowrite`** as allowed — these are
   analytical/planning tools, not I/O operations. Skills load via the `skill`
   tool (not `read`), questions are clarifying dialogue, and todo lists track
   planning progress.

4. **Keep the task allowlist focused** on the 7 specialized subagents. Do not
   add `@general` as a catch-all — the specialized agents cover all delegation
   needs, and a catch-all would weaken the delegation discipline.

## Consequences

- **Easier:** Clean separation of concerns — the Plan agent is purely
  analytical. It synthesizes subagent results into plans without performing
  I/O itself.
- **Easier:** Deterministic delegation — the prompt instructs the model
  explicitly, preventing failed attempts at denied tools and reducing token
  waste.
- **Easier:** The existing subagent infrastructure (`@explore`, `@scout`, etc.)
  already exists and requires no changes.
- **Harder:** Slightly more token usage and latency from subagent dispatches
  (subagent context + result round-trips), though this is the intended
  separation cost.
- **Harder:** Plans are presented as text in the conversation rather than
  written to `docs/plans/` directly. File saving must be delegated to
  `@docs-writer` or the build agent.
- **Neutral:** The `writing-plans` skill is updated to reflect the delegation
  pattern (spec reading delegated to `@explore`, plan saving delegated to
  `@docs-writer`).

## Alternatives Considered

- **Keep partial restrictions (status quo)** — rejected: the Plan agent could
  still bypass delegation by reading files, searching code, and fetching URLs
  directly. The separation of concerns was incomplete.
- **Deny only `read` and `webfetch`, keep `glob`/`grep`** — rejected: glob and
  grep are filesystem operations that should also be delegated to `@explore`
  for consistency. Partial restrictions create confusion about which
  operations the agent should delegate vs. perform directly.
- **Add `@general` as a catch-all subagent** — rejected: the 7 specialized
  subagents already cover all delegation needs. Adding a full-access catch-all
  would weaken the delegation discipline and blur the boundary between planning
  and execution.
- **Use `{file:./prompts/plan.txt}` for the prompt** — rejected: the build
  agent uses an inline prompt, and consistency within the same config file is
  simpler to maintain than external prompt files. If the prompt grows
  unwieldy, this can be revisited in a future ADR.
