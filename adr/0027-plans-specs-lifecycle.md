# 0027. Plans and Specs Lifecycle

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-19

## Status

Accepted

## Context

The repo maintains two directories of development artifacts:

- `docs/specs/YYYY-MM-DD-<topic>-spec.md` — produced by the `brainstorming`
  and `to-spec` skills.
- `docs/plans/YYYY-MM-DD-<feature>.md` — produced by the `writing-plans`
  skill and consumed by `executing-plans` and `ticketing`.

The intended lifecycle — commit on creation, delete on branch completion,
git history is canonical — was previously implicit across three skills
(`brainstorming`, `writing-plans`, `finishing-a-development-branch`) with
no ADR codifying it. Drift was observed after the project transitioned
from template to active development: 8 stale tracked plans and 5
untracked plans/specs accumulated in the working tree despite the
features they described being merged to `develop`.

`validate-harness.sh` enforces a 7-day stale-plan warning, but the check
fires on age + unchecked-task checkboxes, not on lifecycle state, so it
does not catch the "tracked but should-have-been-deleted" case where
checkboxes were left open or the cleanup step was skipped.

## Decision

Plans and specs are **development artifacts**, not permanent project
documentation. We adopt the following lifecycle:

1. **Commit on creation.** The `brainstorming` skill commits the spec
   when the design is approved. The `writing-plans` skill presents the
   plan as text in conversation; if the user requests it saved, the
   write is delegated to `@docs-writer` (or written by `@from-issue`
   for issue-driven flows), which commits the file.
2. **Delete on branch completion.** The `finishing-a-development-branch`
   skill's pre-completion checklist includes "Plan and spec files
   deleted from `docs/plans/` and `docs/specs/`." The post-disposal
   cleanup step runs `git rm` on both files.
3. **Git history is the canonical archive.** Retrieve any past plan via
   `git log --all -- docs/plans/` (or `docs/specs/`).
4. **Directory structure is preserved by `.gitkeep`.** The two
   `.gitkeep` files remain tracked so the directories exist for the
   next brainstorming/planning cycle even when empty.

## Consequences

**Positive:**

- The working tree stays clean — only in-flight plans/specs are present.
- Full audit trail is preserved in git history, retrievable on demand.
- No policy divergence between skills and project ratification.

**Negative:**

- Relies on the engineer running the `finishing-a-development-branch`
  checklist at branch completion. Mitigated by the
  `validate-harness.sh` 7-day stale-plan warning, which surfaces
  forgotten plans even when the manual checklist is skipped.

**Neutral:**

- Retrieval of past plans requires a git command rather than a file
  listing. Acceptable for any repo with full history.

## Alternatives Considered

- **`.gitignore` them entirely** (treat as local-only scratchpad).
  Rejected: breaks `@spec-review` (fuzzy-matches `docs/specs/*.md`
  against branch names), the `ticketing` command (reads `docs/plans/`
  and `docs/specs/` for from-spec decomposition), and the `/handoff`
  command (references plan/spec paths). Also discards the audit trail
  that the lifecycle relies on.
- **Commit and keep forever** (treat as permanent documentation).
  Rejected: unbounded working-tree growth; contradicts the
  development-artifact nature of these documents; renders the
  `.gitkeep` + cleanup machinery pointless.
- **Status quo (skills only, no ADR).** Rejected: drift already
  observed; the policy needs a durable record that survives skill edits
  and is visible to anyone reading `adr/` without spelunking through
  `.opencode/skills/`.
