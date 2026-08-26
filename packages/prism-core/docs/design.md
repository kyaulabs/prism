# Design documents and RFCs

The `systems-design` skill uses this guide for changes whose shape is still open.
Use the `adr` skill once the decision is settled.

## ADR or RFC

Write an ADR when the project has made, or is ready to make, one architecture
decision. ADRs are short, append-only records in `adr/`. Accepted ADR bodies are
immutable; later decisions supersede them.

Write an RFC when the design is still being evaluated and needs structured
feedback. RFCs compare viable options and expose open questions. They are not
architecture authority.

| Condition | Record |
| --- | --- |
| One settled, cross-cutting decision | ADR |
| Several credible designs remain | RFC |
| Reversal would be expensive and feedback is needed | RFC, followed by ADR |
| Small local choice with no lasting architecture effect | Pull request or spec |

## When an RFC is required

Use an RFC when at least one condition applies:

- the change crosses several subsystem boundaries and the interfaces are not
  settled;
- two or more credible approaches have materially different costs;
- the rollout changes persistent data, public interfaces, trust boundaries, or
  operational ownership;
- a wrong choice would be expensive to reverse.

Do not use an RFC to delay a narrow decision that an ADR or approved spec can
record directly.

## RFC template

Store active RFCs under `docs/rfc/` or in a pull request draft.

```markdown
# RFC: <title>

Start date: YYYY-MM-DD
Author: <name>

## Summary

<One paragraph describing the proposal.>

## Motivation

<The problem, affected users or systems, and the cost of doing nothing.>

## Detailed design

<Interfaces, data flow, state, failure handling, security boundaries, and examples.>

## Alternatives

<Named alternatives and the concrete reason each was not selected.>

## Risks and trade-offs

<Failure modes, lost options, migration cost, and operational burden.>

## Open questions

<Decisions required before approval.>

## Adoption plan

<Rollout, compatibility, migration, observation, and rollback.>
```

## C4-lite diagrams

Use Mermaid when GitHub rendering helps and ASCII when the diagram must survive
plain-text tooling.

Use only the needed zoom levels:

- Context: people and external systems around Prism;
- Container: deployable or separately owned runtime units;
- Component: important modules inside one container.

Name each boundary, label every arrow with the data or event it carries, and
keep one diagram focused on one question. Do not mix deployment, request flow,
and class structure in one figure.

## Approval and lifecycle

1. Draft the RFC from established project context and accepted ADRs.
2. Identify open decisions and named alternatives.
3. Obtain review from owners of every affected boundary.
4. Record the selected decision in an ADR when the design settles.
5. Update the implementation spec or plan with the approved interfaces.
6. Delete or archive the RFC so it cannot compete with the accepted ADR.

An RFC does not authorize implementation. The approved spec and plan own that
transition. If implementation changes the architecture decision, stop and
update the ADR before continuing.
