---
name: systems-design
description: Use when designing a non-trivial change — a new module, a data model, a cross-cutting decision, or a system boundary. Decides ADR vs RFC, applies C4-lite notation, deep-modules heuristic, and interface-design checks.
---

## Decide: ADR, RFC, or neither?

| Signal | Artifact |
| --- | --- |
| Hard-to-reverse or expensive-to-change decision | **ADR** (see `adr` skill) |
| Forecloses other options, cross-cutting | **ADR** |
| Large, still-being-explored design needing feedback | **RFC** (see `packages/prism-core/docs/design.md`) |
| Routine implementation, naming, or refactor extraction | Neither — just commit + PR |

When in doubt, write an ADR. They are cheap and future readers thank you.

## C4-lite notation

Three zoom levels. Sketch in the ADR/RFC; don't aim for completeness.

1. **Context** — the system and its external actors/users. One box, arrows in/out.
2. **Container** — major deployable/runnable units (the app, the DB, the CDN,
   any worker). One box each, with the tech noted inside.
3. **Component** — within a container, the key modules/classes and their
   dependencies. Only draw the ones touched by the decision.

Use ASCII or Mermaid in the ADR. Keep diagrams legible in plain text.

## Deep modules heuristic (Ousterhout)

A module's value is its interface relative to its implementation.

- **Deep module:** small interface, hides significant complexity. Good.
- **Shallow module:** interface as complex as the implementation. Bad — it
  adds indirection without abstraction. Merge or deepen it.

When designing a new class or boundary, ask: *is the interface materially
smaller than the implementation?* If not, redesign or merge.

## Interface-design checklist

Before committing a new public interface (a class API, a backend function, a
URL, a DB schema):

- [ ] Hides a decision that could change.
- [ ] Interface is the smallest expression of the capability.
- [ ] Does not leak internals (types, error shapes, ordering, state).
- [ ] Errors are part of the interface — documented, typed, narrow.
- [ ] One responsibility; if you describe it with "and", split it.
- [ ] Testable at the boundary if it touches the outside world (see the
      `tdd` skill's boundary-mocking discipline and the active adapter's
      mocking guide, if one exists).
- [ ] Named using the project's ubiquitous language (see `CONTEXT.md`).

## Cross-refs

- `adr` skill — format and status transitions.
- `packages/prism-core/docs/design.md` — RFC template and when a design doc
  is required.
- `tdd` skill — boundary-interface and mocking discipline.
- `domain-context` skill — read `CONTEXT.md` before designing.
