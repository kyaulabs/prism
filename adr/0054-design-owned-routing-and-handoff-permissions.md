# 0054. Design-Owned Routing and Handoff Permission Compatibility

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-08-11

## Status

Accepted

This decision partially supersedes ADR-0030's hybrid skill split for
`@from-issue` and `@consult`, extends ADR-0050's Design-owned scope gate, and
generalizes ADR-0051's fail-closed effective-permission validation principle.

## Context

ADR-0030 made the Design primary agent the visible owner of brainstorming but
preserved direct `brainstorming` skill consumption by `@from-issue` and
`@consult`. ADR-0050 later made `classify-greenfield.sh` the mandatory first
scope gate for brainstorming. Those decisions combined a shell-requiring
workflow with agents and commands whose effective permissions intentionally
deny that shell operation.

The same ownership drift appears elsewhere. `/router` inherits the invoking
tab's permissions but runs the classifier; `@from-issue` advertises the
`prototype` skill while denying its edit and execution paths;
`/improve-architecture` transfers into classifier-driven brainstorming; and
`to-spec` claims `@consult` as a writer even though Consult denies
`docs/specs/`. These routes fail at their first restricted action without
violating any permission shape, because `validate-harness.sh` validates
permission syntax and containment but not the compatibility of documented
handoffs.

ADR-0051 established that permission-bearing routes must be checked against
their effective, runtime-meaningful rules and fail closed when the documented
route cannot execute. The principle is general even though ADR-0051's concrete
checker is frontend-specific. OpenCode's primary agents also cannot be
dispatched as subagents, so a transition to Design is necessarily an explicit
human tab handoff.

## Decision

We make the Design primary agent the sole owner of classifier-driven
brainstorming and design-stage prototyping. The global skill permission map
denies `brainstorming` and `prototype`; Design re-allows both. We do not widen
the permissions of Router, Chat, Plan, Consult, From-Issue, or architecture
review commands.

Design runs the ADR-0050 scope classifier, grills design decisions, performs
technical-viability prototypes when needed, and captures prototype findings
before final spec approval and commit. Its existing cycle still ends at the
committed spec and feature branch. Design explicitly accepts escalations from
Router, `@from-issue`, `to-spec`, and `/improve-architecture`; an escalated
existing issue is not redirected back to `@from-issue` until the Design-owned
question is settled.

Other entry points retain work that fits their permission boundary.
`@from-issue` performs issue triage, lightweight grilling, codebase analysis,
and planning for already-settled work, but recommends the Design tab and stops
when scope ambiguity or technical viability requires brainstorming or a
prototype. Consult keeps its existing context/ADR-only boundary and hands
build intent to Design. `/router` performs no shell operation: it recommends a
compatible tab or subagent and stops. `/improve-architecture` hands a selected
candidate and report context to Design instead of loading brainstorming.

We add machine-readable declarations beside documented entry-point handoffs.
The harness checker distinguishes autonomous `skill`, `task`, `bash`, `edit`,
and `external_directory` actions from human `recommend-primary` and `recommend-subagent`
transitions. Autonomous actions are resolved against effective OpenCode
permissions using global rules followed by agent Markdown and inline agent
overrides, with last matching rule winning. `allow` passes, `ask` emits a
visible warning without failing validation, and `deny` is a defect that fails
validation. Malformed declarations, unknown actors or targets, and
indeterminate composition fail closed.

This policy extends ADR-0050 by assigning its classifier-driven scope gate to
Design rather than every brainstorming consumer. It generalizes ADR-0051's
fail-closed validation approach from the frontend skill-load surface to
documented handoffs throughout the harness. Accepted ADR-0030, ADR-0050, and
ADR-0051 remain unchanged historical records.

## Consequences

- Restricted entry points no longer fail by attempting Design-owned shell,
  edit, or skill operations.
- Brainstorming and design-stage prototypes have one visible owner and one
  context budget.
- Escalated GitHub issues require a human switch to Design and a return to
  `@from-issue` after the Design-owned uncertainty is settled.
- The handoff declaration format and permission evaluator become load-bearing
  harness interfaces and must evolve with OpenCode permission semantics.
- Ask-gated routes remain valid but visibly depend on human approval.
- Adding an autonomous handoff now requires declaring its actor, action, and
  target so validation can prove compatibility.
- OpenCode must restart before updated skill permissions and prompts take
  effect.

## Alternatives Considered

### Widen every caller's permissions

Rejected because it erases the intentionally narrow Plan, Chat, Consult, and
From-Issue boundaries and duplicates Design's constructive capabilities.

### Keep ADR-0030's hybrid split and exempt the classifier

Rejected because bypassing ADR-0050's mandatory classifier would produce
different scope decisions by entry point and preserve prototype edit failures.

### Infer arbitrary handoffs from prose

Rejected because natural-language extraction is ambiguous, negation-sensitive,
and unable to distinguish an autonomous action from a human recommendation.
Structured declarations keep the checker deterministic while nearby behavior
tests keep declarations and prose aligned.

### Treat ask as either an error or an unconditional pass

Rejected because `ask` is executable only with human approval. A warning
preserves the valid route while exposing its operational dependency.
