---
name: adr
description: Use when writing, reviewing, or superseding an Architecture Decision Record. Covers the Nygard-format template, numbering, and status transitions. Use the project's ADR location, defaulting to adr/.
---

## ADR Format

Use the project's configured ADR directory and existing template; default to
`adr/` only when none is selected. Filenames use `NNNN-kebab-case-title.md`
(zero-padded sequence starting at `0001`). Resolve paths below against that directory.

Each ADR has these sections:

1. **Title** — `# NNNN. <title>`
2. **Date** — `YYYY-MM-DD`
3. **Status** — one of: `Proposed`, `Accepted`, `Deprecated`, `Superseded`
4. **Context** — the problem and forces
5. **Decision** — the choice, in active present tense
6. **Consequences** — positive, negative, neutral
7. **Alternatives Considered** — named and rejected

## Status Transitions

- `Proposed` → `Accepted` (ratified)
- `Accepted` → `Superseded` (replaced by a new ADR; leave the file unchanged,
  add `Superseded by ADR-NNNN` under Status, create the successor)
- `Accepted` → `Deprecated` (no longer in effect, no replacement)

Never edit the body of an Accepted ADR. Supersede it.

## When to write

Use a record when it is useful or required by the project, not for every
disagreement. Typical durable decisions include:

- A hard-to-reverse or expensive-to-change decision (data model, auth
  strategy, deployment topology, framework adoption).
- A choice that forecloses other options.
- A cross-cutting decision affecting more than one module.

## When not to

- Routine implementation choices.
- Decisions already covered by an existing ADR or `AGENTS.md`.
- Anything that fits in a commit message or PR description.

## On acceptance

1. Set status `Accepted`.
2. Add a one-liner to `CONTEXT.md` under "Architectural Decisions":
   `- <project-adr-directory>/0001-<title>.md — <one-line summary>`

## Rules

- One decision per ADR.
- IDs never repeat. Allocate the next unused ID; gaps are valid and history
  must not be renumbered.
- Keep `adr/README.md` and `adr/0000-template.md` in sync with this skill if
  the format changes.
- Do not delete ADRs; supersede them.
