# Architecture Decision Records

Prism uses Nygard-style Architecture Decision Records for durable,
cross-cutting choices. Each ADR records the context, one decision, and its
consequences.

## Historical boundary

The sequence spans two architectures:

- **0001–0054 are frozen OpenCode-era records.** They remain immutable history.
  Their bodies are not rewritten to match Pi, even when later decisions make
  their runtime details obsolete.
- **0055 and later are Pi-era records.** ADR-0055 establishes the current
  single-agent, skill-and-prompt architecture.

A historical ADR remains useful as evidence of what the project decided at the
time. Current work follows the latest accepted or superseding Pi-era decision.

## File and format

Name records `adr/NNNN-kebab-case-title.md`, using the next zero-padded number.
Start from [`0000-template.md`](0000-template.md).

Every ADR contains:

- title and status;
- context;
- decision;
- consequences;
- supersession links when applicable.

## Status

| Status | Meaning |
| --- | --- |
| `Proposed` | Draft awaiting a decision |
| `Accepted` | Ratified and currently authoritative unless superseded |
| `Deprecated` | No longer authoritative and has no replacement |
| `Superseded` | Replaced by a named later ADR |

Accepted decision bodies are immutable. Correct or replace a decision with a
new ADR. When superseding, update only the prior record's status metadata and
pointer, leaving its context, decision, and consequences as written.

## When to write an ADR

Write one when a decision:

- is expensive or risky to reverse;
- closes off credible alternatives;
- changes a system, trust, ownership, data, or deployment boundary;
- affects several modules or packages;
- establishes policy that future work must consult.

Routine naming, local extraction, formatting, and implementation details belong
in code, a specification, a plan, or a pull request.

## Workflow

1. Load the on-demand `adr` skill.
2. Read `CONTEXT.md` and accepted ADRs that govern the boundary.
3. Copy `0000-template.md` to the next numbered path.
4. Write one decision and its concrete consequences.
5. Set the record to `Proposed` until ratified.
6. On acceptance, set `Accepted` and add the current decision to `CONTEXT.md`.
7. Supersede rather than rewriting accepted history.

ADR-0027 controls temporary specifications and plans. Those artifacts may be
removed at branch completion; ADRs are durable architecture history.
