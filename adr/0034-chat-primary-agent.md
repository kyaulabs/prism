# $KYAULabs: 0034-chat-primary-agent.md kyau@nova 2026/07/20 -0700 Exp $

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

# 0034. Chat primary agent (read-only, UTILITY tier)

Date: 2026-07-20

## Status

Accepted

## Context

The existing primary-agent tabs cover the engineering pipeline:
`build` (implement), `plan` (analysis), `design` (brainstorming),
`general` (catch-all). Each runs on a higher-tier model (PRIMARY,
PLANNER, or DESIGN). There is no lightweight entry point for the
common case of a user asking a quick question — "what does this file
do?", "where is X defined?", "explain this ADR" — that does not warrant
the cost or the write-capable tooling of the higher-tier agents.

Users who just want to converse about the project today must use
`general` (PRIMARY tier — full cost, full tool surface including write
access they do not need) or `@consult` (a subagent — requires dispatch
context, not a standalone tab). The gap: a low-cost, self-sufficient,
read-only conversational tab.

## Decision

Add a **`chat` primary agent** (a TUI tab) defined inline in
`opencode.jsonc`'s `agent` section (same pattern as `build`, `plan`,
`design`, `judge`), running on the **UTILITY model tier**.

### Permission posture — self-sufficient read-only

- **Denied:** `edit`, `bash`, `task` — the agent cannot modify files,
  run shell commands, or dispatch subagents.
- **Allowed:** `read`, `glob`, `grep`, `list`, `lsp`, `webfetch`,
  `websearch`, `graphify_*`.

This makes the agent self-sufficient for read-only investigation (it
does its own glob/grep/read rather than delegating to `@explore`) while
preserving the read-only contract: no file mutation, no shell execution,
no delegation to write-capable subagents.

### Rationale

- **`task: deny`** preserves the read-only contract. Without it, a
  "read-only" agent could dispatch `@tdd` or `build` to make changes on
  its behalf, voiding the read-only guarantee. It also prevents cost
  escalation: subagent dispatch on a conversational tab could fan out
  rapidly. This aligns with ADR-0006's read-only permission contract.
- **`glob`/`grep` retained.** LSP only finds defined symbols; arbitrary
  content and file-pattern search is essential for general Q&A (finding
  TODOs, prose in ADRs/docs, procedural calls Intelephense cannot
  resolve). Removing glob/grep would force the user to switch tabs for
  any non-symbol query — defeating the "quick question" use case.
- **`graphify_*: allow` is forward-looking.** The Graphify MCP server
  is currently deferred to Phase 2 (see `.opencode/docs/mcp.md`). This
  permission is a no-op today; it is documented so the Phase 2 MCP
  activation PR does not need to touch the `chat` config. The bash CLI
  path (`graphify query ...`) remains blocked by `bash: deny`; only the
  MCP tool surface is pre-authorized.
- **UTILITY tier.** Conversational Q&A is exactly the workload the
  UTILITY tier (flash model) is designed for: high volume, low
  complexity. This minimizes per-session cost while still providing
  code intelligence via LSP.

## Consequences

### Positive

- **Low-cost entry point.** Users can ask quick questions without
  burning PRIMARY-tier tokens or engaging the full engineering
  pipeline.
- **Self-sufficient.** The agent reads and reasons itself (no dispatch
  overhead, no context round-trip through a subagent).
- **Safe.** Read-only on the filesystem; cannot accidentally modify
  code or run destructive shell commands.
- **Pipeline symmetry.** Mirrors the `design` precedent (ADR-0030):
  a focused primary tab for a specific phase of the user workflow.

### Negative

- **Solo UTILITY-tier tab visible to users.** The TUI gains another tab
  (`build`, `plan`, `design`, `general`, `chat`; `judge` is primary but
  eval-only). Users who prefer fewer tabs may find it cluttered. The
  agent is not `@`-dispatchable (primary agents cannot be dispatched by
  subagents) — it is tab-only.
- **Read-only posture at the edge of ADR-0006.** ADR-0006's read-only
  contract is `edit: deny` + restricted bash. The `chat` agent goes
  further (full `bash: deny`) but retains `webfetch`/`websearch`/
  `graphify_*` access — placing it at the edge of the read-only
  contract. This is explicitly documented: the agent can fetch external
  content but cannot execute anything locally.
- **Cannot write or run shell, even when asked.** Users who start in
  `chat` and then need a code change must switch to `build` or
  `design`. The prompt directs this handoff explicitly.
- **`graphify_*` permission is inert today.** Until Phase 2 MCP lands,
  this key has no effect. A user inspecting the config might expect
  Graphify to work from `chat` and find it does not.

### Neutral

- The `{env:VAR}` substitution pattern is unchanged (UTILITY tier,
  same as `compaction`, `title`, `summary`, `docs-writer`, `semgrep`).
- No new model tier is added (unlike ADR-0030's DESIGN tier).
- No `.opencode/agents/chat.md` file is created — the prompt lives
  inline in `opencode.jsonc`, consistent with the primary-agent pattern
  (ADR-0022, ADR-0030).

## Alternatives Considered

- **Use `general` for conversational Q&A (no new agent).** Rejected:
  `general` runs on the PRIMARY tier (full cost) and has write access
  (full tool surface). Using it for quick questions is wasteful and
  risks accidental file mutation in a conversational context.
- **Make `chat` a subagent (`@chat`, mode: subagent).** Rejected:
  subagents require dispatch context — a user cannot open a `@chat`
  tab directly. The use case is a standalone conversational tab, which
  requires `mode: primary`. The `.github/scripts/validate-harness.sh`
  also enforces that `.md` agents are `mode: subagent`, so a primary
  agent must be inline in `opencode.jsonc`.
- **Allow `task: allow` with a read-only subagent allowlist.** Rejected:
  adds complexity (an allowlist to maintain) and re-introduces the
  dispatch-cost and contract-bypass risks. The self-sufficient
  read-only posture (the agent does its own reading) is simpler and
  cheaper.
- **Deny `glob`/`grep` (LSP-only navigation).** Rejected: LSP cannot
  find prose, TODOs, comments, or procedural calls. General Q&A
  requires content search. Removing glob/grep would make the agent
  dependent on delegation for most real questions.
- **Place on the PRIMARY tier (same as `general`).** Rejected: defeats
  the cost motivation. The UTILITY tier (flash model) is sufficient for
  conversational Q&A and code explanation.

## Cross-refs

- `adr/0006-readonly-agent-permission-contract.md` — the read-only
  contract this agent extends (edit/bash/task denied; the agent sits at
  the edge by retaining web/MCP access).
- `adr/0022-sub-agent-model-config-opencode-jsonc.md` — primary-agent
  config lives inline in `opencode.jsonc` (compliance; no `.md`
  frontmatter for model/variant).
- `adr/0030-design-primary-agent-and-tier.md` — the precedent for an
  inline primary agent with a description, prompt, and focused
  permission block.
- `adr/0032-mcp-server-onboarding.md` — the Phase 2 MCP activation
  that the `graphify_*` permission anticipates.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
