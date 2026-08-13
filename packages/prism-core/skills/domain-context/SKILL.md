---
name: domain-context
description: Use before any work that touches domain logic, entities, or ubiquitous language. Read CONTEXT.md first and update it when domain terms, entities, or boundaries change.
---

## Before domain-coupled work

Read `CONTEXT.md` (project root) before:

- Adding or modifying an entity or domain object.
- Introducing a new domain term in code, tests, or UI.
- Touching a system boundary (new external API, new DB table, new service).
- Writing an ADR (the ADR's "Context" section should align with this file).

Use the terms defined in CONTEXT.md's **Domain Glossary** verbatim in test
names, function names, and UI copy. This is the project's ubiquitous language.

## When to update CONTEXT.md

Update the file when:

- A new domain term is introduced — add it to the glossary **before** using
  it in code.
- An entity is added, removed, or its invariants change.
- A new system boundary or external dependency is introduced.
- An ADR is accepted — add it to the "Architectural Decisions" list.

## What does NOT belong in CONTEXT.md

- Implementation details and file paths (those live in `AGENTS.md`).
- Stack choices and build commands (those live in `AGENTS.md` / build docs).
- Test mechanics (those live in the active adapter's test docs, e.g.
  `packages/prism-php-web/docs/tests.md`).
- Refactor checklists (those live in the active adapter's refactoring docs,
  e.g. `packages/prism-php-web/docs/refactoring.md`).

CONTEXT.md is the *what* and *why* of the domain, never the *how*.

## Rules

- If `CONTEXT.md` does not exist, flag it — do not silently proceed without
  domain context. Suggest running `/prime` to generate a draft.
- Do not duplicate CONTEXT.md content into ADRs or skills; reference it.
- Keep glossary entries to one definition each; expand in prose only if a term
  is genuinely ambiguous.
- For non-trivial or cross-cutting changes, `architect` includes a
  domain-context read as Step 1 of its workflow; the `domain-context` skill
  alone suffices for small in-domain changes.
