# 0019. Issue Command Conventional-Commit Mapping

Date: 2026-07-14

## Status

Accepted (partially superseded by ADR-0020 — mapping-source and command-consolidation clauses)

## Context

The `/issue` command creates GitHub issues with org-level issue types
(Bug, Feature, Patch, Documentation, Performance, Refactor, Style, Test,
CI/CD, Chore, Security). The issue title must follow the repository's
conventional commit format (`type(scope): subject`). These two
classification systems — commit types and issue types — overlap but are
not identical.

Additionally, the command needs to execute `gh` CLI commands to create
issues and set metadata, but the Plan agent (which conducts the interview
and generates the title/body) has `bash: deny`.

## Decision

1. **Commit-type → issue-type mapping**: Auto-derive the org-level issue
   type from the conventional commit type in the title. The mapping is
   nearly 1:1 with three resolved gaps:

   - `build` maps to CI/CD (closest semantic match for build pipeline work)
   - `revert` maps to Chore (maintenance category)
   - `Security` issue type is reached via `fix(security)` scope override

2. **Two-phase architecture**: The Plan agent conducts the interactive
   interview and generates the title and body using its LLM capabilities.
   It then delegates `gh` CLI execution to the `@explore` subagent, which
   inherits bash access from the top-level permission block. The command
   has no `agent` frontmatter field, so it runs in the current (Plan)
   agent context.

3. **Dynamic repo detection**: Since this is a template repository, all
   `gh` commands detect the repo dynamically via `gh repo view`. No repo
   names are hard-coded.

## Consequences

- The mapping table must be maintained in sync if either commit types
  (commitlint config) or issue types (GitHub org settings) change.
- The `@explore` agent is used for write operations (issue creation),
  which is outside its documented "read-only" purpose. This works because
  the project's `opencode.jsonc` does not enforce read-only constraints
  on explore, but should be revisited if the agent's permissions are
  tightened.
- Field prompting is conditional: Feature and Patch types prompt for all
  5 custom fields (including Start date and Target date); all other types
  prompt for 3 fields only (Priority, Effort, Progress).
- The `Security` issue type has no direct commit-type counterpart. It is
  only reachable through the `fix(security)` scope override.
- The `/plan-to-issues` command now applies the same commit-type →
  issue-type mapping. Plan epics derive their type from the `**Goal:**`
  line; all task sub-issues inherit the epic's type. The two commands
  share the same mapping table, custom-field definitions, optional
  labels, and dynamic-repo-detection discipline, ensuring consistent
  metadata across every issue created by the harness.

## Alternatives Considered

- **Add `security` as a custom commit type**: Rejected — would diverge
  from the Conventional Commits standard and add maintenance burden to
  commitlint config. The `fix(security)` scope is sufficient.
- **Use `agent: build` for the command**: Rejected — would switch agent
  context away from Plan, losing the Plan agent's optimized interview
  and generation capabilities. The two-phase approach keeps the Plan
  agent as the "brain" and @explore as the "hands."
- **Exclude `build` and `revert` from the command**: Rejected — these
  types are valid for issue creation even if rare. Mapping them to the
  closest issue type (CI/CD and Chore respectively) is more useful than
  excluding them.
