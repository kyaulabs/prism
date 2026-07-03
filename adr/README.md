# Architecture Decision Records

An ADR captures a single architectural decision: the context, the choice, and
its consequences. ADRs are immutable once accepted — supersede, don't edit.

## Format (Nygard)

Each record: `adr/NNNN-kebab-case-title.md` where `NNNN` is the next sequence
number (zero-padded). Start at `0001`.

## Statuses

| Status | Meaning |
| --- | --- |
| `Proposed` | Drafted, not yet ratified. Open for discussion. |
| `Accepted` | Ratified and in effect. |
| `Deprecated` | No longer in effect; no replacement. |
| `Superseded` | Replaced by a later ADR. Add `Superseded by ADR-NNNN`. |

When superseding: leave the original file unchanged, change its status to
`Superseded` with a pointer to the new one, and create the new ADR.

## When to write an ADR

- A decision is hard to reverse or expensive to change (data model, auth
  strategy, framework adoption, deployment topology).
- A choice forecloses other options (e.g., "we use MariaDB, not Postgres").
- A decision affects more than one module or has cross-cutting consequences.

## When NOT to write an ADR

- Routine implementation choices (naming, refactor extractions).
- Decisions fully covered by an existing ADR or `AGENTS.md` rule.
- Anything that fits in a commit message or PR description.

## Workflow

1. Copy `0000-template.md` to `adr/NNNN-title.md`.
2. Fill in the sections.
3. Set status `Proposed`.
4. On acceptance, set status `Accepted` and add a one-liner to `CONTEXT.md`.

See the `adr` skill (`.opencode/skills/adr/SKILL.md`) for the rules summary.
