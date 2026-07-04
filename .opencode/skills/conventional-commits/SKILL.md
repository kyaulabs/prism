---
name: conventional-commits
description: Use when writing or reviewing commit messages. Covers the required Conventional Commits format, valid types, scope rules, and examples. Enforced by commitlint in the commit-msg hook.
---

## Conventional Commits Format

```
<type>[optional scope]: <subject>

[optional body]

[optional footer(s)]
```

- Subject line: lowercase, no period at end, max 100 characters
- Body: wrap at 72 characters, explain *why* not *what*
- Signed commits required (`git commit -S`)
- Every commit must include `Acked-by:` (agent in kebab-case) and `Signed-off-by:` (user) footers

## Required Footers

Every commit message must end with two footers:

- **`Acked-by:`** — the AI agent that authored the change, in kebab-case.
Use the model ID without slashes. Examples: `deepseek-v4-pro`,
`claude-sonnet-4`, `gemini-2-5-pro`.

> [!CAUTION]
> Do NOT use role names (`build-agent`, `code-review`, `tdd`, etc.) —
> only the model ID. The Acked-by tracks which model produced the
> commit, not which agent role orchestrated it.
- **`Signed-off-by:`** — the human user approving the change, formatted as
  `username <email>`. Default when no user is specified:
  `kyau <git@kyaulabs.com>`.

These are mandatory for traceability. The agent writes them automatically based
on the current model and the AGENTS.md default.

## Valid Types

| Type       | When to use                                               | SemVer impact |
|------------|-----------------------------------------------------------|---------------|
| `feat`     | A new feature                                             | MINOR         |
| `fix`      | A bug fix                                                 | PATCH         |
| `patch`    | A bug fix (alias of `fix`, project convention)           | PATCH         |
| `docs`     | Documentation only changes                                | —             |
| `style`    | Formatting, whitespace — no logic change                 | —             |
| `refactor` | Code change that neither fixes a bug nor adds a feature  | —             |
| `perf`     | Performance improvement                                   | PATCH         |
| `test`     | Adding or correcting tests                               | —             |
| `build`    | Build system or asset pipeline changes                   | —             |
| `ci`       | CI/CD configuration changes                              | —             |
| `chore`    | Maintenance (deps, tooling) — no production code change  | —             |
| `revert`   | Reverts a previous commit                                | —             |
| `ignore`   | Excluded from the changelog (initial commit only)       | none (ignored)|

The `patch` and `ignore` types are project-specific extensions defined in
`commitlint.config.js`. `ignore` exists for the initial repository commit and
is otherwise unused — do not adopt it for normal commits.

## Breaking Changes

Add `!` after the type/scope, and add a `BREAKING CHANGE:` footer:

```
feat(auth)!: replace session tokens with JWTs

BREAKING CHANGE: existing session tokens are invalidated on deploy.
```

## Scope

Scope is optional but recommended for larger projects. Use the affected module,
directory, or feature area: `feat(aurora)`, `fix(db)`, `test(auth)`.

## Examples

```
feat(auth): add remember-me cookie to login flow

Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

```
fix(db): prevent SQL injection in user search query

Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
Fixes: #42
```

```
test(auth): add boundary cases for empty credentials

Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

```
refactor(backend): extract DB retry logic into helper
chore: update composer dependencies
docs: add browser test setup instructions to AGENTS.md
```

Examples above show the required footers on all non-trivial commits.
`chore` and `docs` commits that are purely mechanical may omit footers at the
user's discretion.

## Enforcement

Commitlint validates every commit message via `.github/hooks/commit-msg`.
The hook blocks the commit if the format is invalid.
Config: `commitlint.config.js` extends `@commitlint/config-conventional`,
with a custom `type-enum` that adds `build`, `patch`, and `ignore` to the
standard set.
