---
description: Analyze the codebase and draft a fresh CONTEXT.md (domain glossary, entities, invariants, boundaries). User reviews and edits the result.
---

Draft or regenerate `CONTEXT.md` at the project root by reading the codebase.
Load the `domain-context` skill first to confirm the target structure.

## 1. Survey the codebase

Read broadly — do not skim:

- `AGENTS.md` for global boundaries, plus the active adapter's stack skill.
- The project's dependency and build manifests for its declared stack.
- Entry points and source directories identified by the active adapter.
- Domain objects, entities, persistence, and boundary code.
- Vendored frameworks or submodules only enough to know what they provide
  (do not document them deeply — they are external).
- Schema and migration files when the project owns persistent data.
- Existing `CONTEXT.md` if present — preserve any hand-curated prose and only
  refresh the structured sections.

## 2. Extract

Identify:

- **Purpose** — one to three sentences on what the app does and for whom.
- **Domain glossary** — the canonical nouns the codebase and UI use
  (entities, roles, domain events). Capture the verbatim term and a
  one-line definition.
- **Entities & invariants** — the core domain objects, their key fields, and
  the rules that always hold (e.g., "an Order always belongs to a User";
  "a Session token is single-use").
- **System boundaries** — what the app owns vs. what it delegates (external
  APIs, persistence, the filesystem, vendored frameworks, or submodules).
- **Non-goals** — anything the codebase or comments clearly indicate is out of
  scope.

## 3. Draft

Write `CONTEXT.md` following the section structure in the `domain-context`
skill and the existing `CONTEXT.md` template. Use tables for the glossary.
Leave placeholders (`<...>`) only where you genuinely cannot infer the answer;
annotate each placeholder with a comment on what would resolve it.

## 4. Reconcile with ADRs

If `adr/` exists, list accepted ADRs under "Architectural Decisions" with
one-line summaries. If a decision in the codebase has no ADR but looks
load-bearing, note it as a candidate under a "Decision candidates" comment
block at the bottom (do not invent ADRs).

## 5. Report

Print a summary: sections written, number of glossary terms/entities
extracted, any placeholders left unresolved, and any decision candidates
flagged for ADR follow-up. Remind the user to review and edit the draft — it
is a proposal, not a verdict.
