# 0055. Embrace pi — Single-Agent Conversion Philosophy

Date: 2026-08-12

## Status

Accepted

## Context

The KYAULabs coding harness has run on opencode (`.opencode/`, `opencode.jsonc`,
primary tabs, sub-agents, a per-tool permission matrix, and a tiered model
manifest). We are migrating to [pi](https://pi.dev). The framing question for
this migration was: **how faithfully do we port the harness — do we rebuild
opencode's abstractions inside pi, or do we re-express the harness in pi's
native primitives?**

Three philosophies were on the table:

- **A — Preserve.** Rebuild opencode's tabs, sub-agents, modes, and per-tool
  permission matrix as pi extensions so existing agents/commands port with
  minimal text changes.
- **B — Embrace.** Adopt pi's single-agent, skills-and-prompts model
  wholesale. Every prism *behavior* (pipeline, gates, discipline) becomes a
  skill or prompt template. Zero orchestration extensions.
- **C — Hybrid.** Keep a small set of orchestration extensions (a modes/tabs
  extension, a sub-agent dispatcher) but port the bulk of the harness to
  skills.

pi is deliberately minimal: it has no tabs, no first-class sub-agents, and no
per-tool deny matrix. A preserve (A) or hybrid (C) approach would fight pi's
design — building an orchestration layer pi explicitly omits, paying
maintenance and latency cost for capabilities pi's maintainers consider
anti-patterns.

## Decision

We adopt **philosophy B — embrace pi.** A single pi agent runs the whole
engineering pipeline (brainstorm → spec → plan → TDD → verify → review) by
loading **skills** on demand. Slash commands become **prompt templates**. The
four opencode primary tabs and fifteen sub-agents are collapsed into skills.
There are **zero orchestration extensions**: no tabs, no sub-agents, no modes
extension, no automatic model tiering. Maximum speed and minimum moving parts
are the point.

The opencode permission system collapses to instruction-only prose in
`AGENTS.md` plus exactly one safety extension (ADR-0056). The model tier
collapses to a single primary model with manual cycling (ADR-0057). The
harness is split into a global core and a per-stack adapter (ADR-0058).

## Consequences

This decision is the root of the conversion; ADRs 0056–0059 depend on it.

- **Easier:** one mental model (load a skill), pi's fastest path, no
  orchestration code to maintain, no permission-matrix bookkeeping.
- **Harder / accepted tradeoffs:**
  - **"Plan mode is read-only" (ADR-0006) and skill-gating become
    instruction-only.** There is no tool-level gate preventing edits during
    planning and no per-skill deny matrix. Mitigations: the `brainstorming`
    skill keeps its own hard gate (no implementation before an approved spec);
    pi's session branching (`/tree`, `/fork`) gives cheap rollback; the
    `verification-before-completion` + `code-review` skills catch slips.
  - **Automatic model tiering is gone.** Review/audit run on the primary
    unless the human (or agent, by suggesting it) manually Ctrl+P's to the
    judge (ADR-0057).
  - **Sub-agent context isolation is gone.** Long plans that once dispatched
    `@tdd` per task now run inline. `executing-plans` keeps inline-only mode
    with proactive compaction (`/compact`) and `/handoff` for context
    management.
- **Follow-up:** ADR-0056 (safety extension), ADR-0057 (single model),
  ADR-0058 (package split), ADR-0059 (conversion scope). The opencode-era
  records 0001–0054 are frozen in place and retained as historical context.

## Alternatives Considered

- **A — Preserve.** Rejected: rebuilding tabs/sub-agents/modes as pi
  extensions fights pi's explicit single-agent design, adds maintenance
  surface, and pays latency for orchestration pi considers an anti-pattern.
- **C — Hybrid.** Rejected: a partial orchestration layer inherits A's
  maintenance cost without A's familiarity benefit, and the modes/tabs
  extension would become a load-bearing custom abstraction that must track
  pi's evolving internals.
