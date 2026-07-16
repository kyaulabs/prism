# 0020. Unified Issue Command Architecture

Date: 2026-07-15

## Status

Accepted

Partially supersedes ADR-0019 (mapping-source and command-consolidation
clauses). ADR-0019's core decisions — commit-type to issue-type mapping
semantics, two-phase Plan + @explore architecture, dynamic repo detection
— remain intact.

## Context

ADR-0019 established the commit-type to issue-type mapping and the two-phase
architecture for the `/issue` command. The `/plan-to-issues` command
subsequently duplicated the same mapping table, custom-field definitions,
optional labels, and dynamic-repo-detection discipline. This duplication
creates a maintenance burden: any change to the mapping must be applied in
two places.

Additionally, the mattpocock #513 vertical-slicing principle is not
enforced by `/plan-to-issues` — it decomposes plan tasks into issues but
does not assert that each task is a vertical slice. Plans with horizontal
decomposition (e.g., "Task 1: all models", "Task 2: all views") would
produce issues that cannot be independently tested.

GitHub CLI v2.94.0 (2026-06-10) introduced native blocking-edge support
(`gh issue edit --add-blocked-by`), enabling dependency wiring without
GraphQL mutations. No harness command leverages this capability.

## Decision

1. **Single source of truth**: The `ticketing` skill
   (`.opencode/skills/ticketing/SKILL.md`) holds the mapping table,
   custom-field definitions, optional labels, dynamic-repo-detection
   pattern, and the gh create-to-type-to-fields-to-labels pattern. This
   replaces the duplicated tables in `/issue` and `/plan-to-issues`.

2. **Four unified aliases with semantic split**: One unified command flow
   with four aliases:
   - Singular (`/issue`, `/ticket`): default to single-issue creation;
     auto-detect from-spec mode if given a plan/spec path
   - Plural (`/issues`, `/tickets`): from-spec decomposition only; signal
     "create multiple issues" intent through command choice

3. **Plan context**: Commands have no `agent:` frontmatter field, so they
   run in Plan context and delegate all `gh` execution to `@explore`
   (consistent with ADR-0019 D2's two-phase model).

4. **Vertical-slice assertion**: The from-spec workflow asserts that each
   `### Task N:` block in a plan is a vertical slice — self-contained,
   independently testable. Horizontal decomposition triggers a warning.

5. **Native blocking edges (opt-in)**: The from-spec workflow supports
   explicit `Depends on: Task N` markers in plan files and user-confirmed
   edges at the preview step. Edges are wired via
   `gh issue edit --add-blocked-by` (gh v2.94.0+), with GraphQL
   `addBlockedBy` as fallback. No forced linear blocking — sequential
   tasks are not necessarily dependent.

6. **Wide-refactor path**: When a task spans many files, still emit one
   vertical-slice issue per task and note the breadth in the issue body.
   Do not split horizontally.

7. **Supersession of /plan-to-issues**: The command is hard-deleted. Its
   functionality is absorbed by the `/issues` and `/tickets` aliases
   (from-spec mode).

## Consequences

- The mapping table lives in one place (the `ticketing` skill), reducing
  drift risk.
- The `/plan-to-issues` command is removed. Historical references to it
  remain in ADR-0017 and ADR-0019 bodies (ADRs are immutable).
- `gh` v2.94.0+ is required for native blocking edges. Earlier versions
  fall back to GraphQL.
- The `@explore` agent is used for write operations (issue creation),
  which is outside its documented "read-only" purpose. This item from
  ADR-0019 remains an open concern.
- The `ticketing` skill is the canonical reference for issue-creation
  mechanics. Future commands or agents that create issues should consume
  this skill rather than re-implementing the mapping.

## Alternatives Considered

- **Keep three separate commands**: Rejected — the duplicated mapping
  table creates maintenance burden and drift risk.
- **Force linear blocking edges (task N blocks N+1)**: Rejected —
  sequential tasks are not necessarily dependent. Forced edges would
  produce incorrect dependency graphs.
- **Deprecation stub instead of hard-delete**: Rejected by the user — the
  command is fully replaced by `/issues` from-spec mode.
- **Add `agent: build` to the unified commands**: Rejected — would
  diverge from ADR-0019 D2's two-phase model. Plan context with @explore
  delegation is consistent.
