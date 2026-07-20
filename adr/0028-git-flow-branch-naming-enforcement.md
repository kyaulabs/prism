# $KYAULabs: 0028-git-flow-branch-naming-enforcement.md kyau@nova 2026/07/19 -0700 Exp $

# 0028. Mechanically enforce Git Flow branch naming

Date: 2026-07-19

## Status

Accepted

## Context

Today the `feat/<username>-<hash>-<description>` convention (per AGENTS.md
§ Git Workflow and CONTRIBUTING.md § We Use Git Flow) is documentary only —
no hook validates branch names.

`@from-issue` agent (line 196 of `.opencode/agents/from-issue.md`) is the only
documented branch creator in the harness.

Classic Git Flow has been extended to cover `release/<semver>` (release prep
branches off develop) and `hotfix/<username>-<hash>-<description>` (emergency
fixes off main).

The `prepare-commit-msg` hook is the correct enforcement point (fires before
every commit). `post-checkout` is too late (branch already exists). `pre-push`
is too late (commits pile up before rejection).

## Decision

Enforce three branch-name prefix families via `prepare-commit-msg` hook
calling a new `validate-branch-name.sh` script.

Exempt `main`, `develop`, and detached HEAD from validation.

Ship a `new-branch.sh` helper that generates valid names (using
`openssl rand -hex 2` for the hash component, sanitizing `git config user.name`
or `resolve-identity.sh` output for the username component) and creates the
branch off the correct base (`develop` for commit-types and release; `main`
for hotfix).

### Regex specification

Single source of truth — consumed by `validate-branch-name.sh` in Task 3:

```bash
# Feature/standard branches
^(feat|fix|patch|docs|style|refactor|perf|test|build|ci|chore|revert)/[a-z0-9._-]+-[a-f0-9]{4}-[a-z0-9._-]+$

# Hotfix branches (base: main)
^hotfix/[a-z0-9._-]+-[a-f0-9]{4}-[a-z0-9._-]+$

# Release branches (base: develop) — SemVer 2.0.0 core + optional prerelease.
# Build metadata (+...) is EXCLUDED because '+' is illegal in git branch names.
^release/[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$

# Exempt
^(main|develop|HEAD)$
```

### Allowed commit-type prefixes

12 prefixes (commitlint vocabulary minus `ignore`): feat, fix, patch, docs,
style, refactor, perf, test, build, ci, chore, revert.

### SemVer build metadata exclusion rationale

SemVer 2.0.0 build metadata uses `+` (e.g., `1.0.0+build.42`). Git branch
names cannot contain `+` (nor `:`, `?`, `*`, `[`, `\`, `~`, `^`, `..`, space,
or ASCII control characters). The release regex accepts
`<major>.<minor>.<patch>[-<prerelease>]` only.

## Consequences

### Positive

- Mechanical enforcement; consistent attribution; the validator script becomes
  the single source of truth for "is this branch name valid?", consumed by both
  the hook and the helper.

### Negative

- Pre-existing non-conforming branches will need renaming before their next
  commit. One-way policy adoption.

### Neutral

- Exemption list is conservative (`main`, `develop`, `HEAD`). Adding
  `release/*` or `hotfix/*` to the exemption list was considered and rejected —
  they should follow their respective regex patterns, not be blanket-exempt.

## Alternatives Considered

- **`post-checkout` hook** — too late; branch already exists when the hook
  fires.
- **`pre-push` hook** — too late; commits pile up on the invalid branch before
  rejection.
- **Plugin-level interception (`.opencode/plugins/pre-tool-use.ts`)** — doesn't
  catch human-created branches, only agent-created ones.
- **Soft skill-only enforcement** — relies on memory; the existing
  `feat/<username>-<hash>-<description>` convention proved unenforceable this
  way.

## Cross-refs

- `adr/0000-template.md`
- AGENTS.md § Git Workflow
- CONTRIBUTING.md § We Use Git Flow

Supersedes the branch-naming clauses of AGENTS.md § Git Workflow (the prose
convention becomes mechanically enforced).

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
