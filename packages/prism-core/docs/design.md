# Design Docs & RFCs

Loaded by the `systems-design` skill when a change is large or still being
explored. For decided architecture, see the `adr` skill and `adr/`.

## ADR vs RFC

- **ADR** — a decision has been made (or is about to be). Record it. Narrow.
- **RFC** — the design is open; you want feedback before deciding. Exploratory.

ADRs are append-only and authoritative. RFCs are discussion documents; once a
decision is reached, distill it into an ADR and archive or remove the RFC.

## When an RFC is required

- The change touches multiple subsystems and the shape isn't settled.
- Two or more credible approaches are competing.
- The cost of getting it wrong is high and reversal is expensive.

For smaller decisions, a PR description or an ADR is enough — skip the RFC.

## RFC template

```markdown
# RFC: <title>

Start date: YYYY-MM-DD
Author: <name>

## Summary
<one paragraph>

## Motivation
<the problem, who it affects, what happens if we do nothing>

## Detailed design
<the proposed shape, with examples. This is the bulk of the document.>

## Alternatives
<named alternatives and why they were rejected>

## Risks & trade-offs
<what could go wrong, what we give up>

## Open questions
<what still needs resolving before this can become an ADR>

## Adoption plan
<rough rollout / migration steps>
```

## Diagram conventions

- Prefer **Mermaid** (renders in GitHub) or **ASCII** (renders everywhere).
- C4-lite zoom levels (Context → Container → Component) — see
  `systems-design` skill.
- One diagram per concept. Do not nest unrelated concerns.
- Label every arrow with the data/event flowing on it.

## Rules

- RFCs are not commits — keep them out of `adr/`. Place under `docs/rfc/` or a
  PR draft.
- Once decided, write the ADR and either archive the RFC or delete it. Do not
  leave dangling RFCs that contradict accepted ADRs.
- Keep RFCs short. If it exceeds ~600 lines, split it.
