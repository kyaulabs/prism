# Project Context

> Living document. Update when domain language, entities, or boundaries change.
> Read by agents before domain-coupled work (see `domain-context` skill).

## Purpose

<one-to-three sentences: what this application does and for whom>

## Domain Glossary

Ubiquitous language. Terms here are the canonical names used in code, tests,
UI copy, and conversation. When a term is introduced, add it here first.

| Term | Definition |
| --- | --- |
| <Term> | <definition> |

## Entities & Invariants

Core domain objects and the rules that always hold for them.

### <Entity>
- **Shape:** <key fields / columns>
- **Invariants:**
  - <rule that must always be true>
  - <rule that must always be true>
- **Lifecycle:** <created when… / transitions… / archived when…>

## System Boundaries

What this system owns vs. what it delegates to external services.

- **Owns:** <list>
- **Delegates:** <external APIs, services, the Aurora framework, etc.>
- **Boundary interfaces:** <where mocking is permitted — see `.opencode/docs/mocking.md`>

## Non-Goals

Explicit things this project will **not** do. Prevents scope creep and
spurious "features" during implementation.

- <non-goal>

## Architectural Decisions

Significant decisions live as ADRs in `adr/`. List accepted ADRs here with a
one-line summary; the full record is in `adr/NNNN-*.md`.

- `adr/0001-<title>.md` — <one-line summary>

## When to update this file

- A new domain term enters the codebase or UI.
- An entity is added, removed, or its invariants change.
- A new external dependency or boundary is introduced.
- An ADR is accepted (add it to the list above).

Do **not** put implementation details, file paths, or stack choices here —
those belong in `AGENTS.md` or `.opencode/docs/`.
