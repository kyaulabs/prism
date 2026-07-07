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
- Every commit must include `Plan-by:`, `Acked-by:`, and `Signed-off-by:` footers

## Required Footers

Every commit message must end with three footers:

- **`Plan-by:`** — the planning model, in kebab-case. Sourced from
  `agent.plan.model` in `opencode.json` (the segment after the last `/`).
  Example: `openrouter/z-ai/glm-5.2` → `glm-5.2`.
- **`Acked-by:`** — the build model, in kebab-case. Sourced from
  `agent.build.model` in `opencode.json` (the segment after the last `/`).
  Example: `deepseek/deepseek-v4-pro` → `deepseek-v4-pro`.

> [!CAUTION]
> Do NOT use role names (`build-agent`, `code-review`, `tdd`, etc.) — only the
> model ID. The Plan-by and Acked-by footers track which configured models
> planned and built the change, not which agent role orchestrated it.
- **`Signed-off-by:`** — the human user approving the change, formatted as
  `username <email>`. Default when no user is specified:
  `kyau <git@kyaulabs.com>`.

These are mandatory for traceability. The agent writes them automatically by
reading `agent.plan.model` and `agent.build.model` from `opencode.json` and
taking the segment after the last `/`.

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

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

```
fix(db): prevent SQL injection in user search query

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
Fixes: #42
```

```
test(auth): add boundary cases for empty credentials

Plan-by: glm-5.2
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

## Passing the Message to Git

> [!IMPORTANT]
> Pass the full commit message as a **single `-m`** argument with embedded
> newlines. Do **not** use multiple `-m` flags — git inserts blank lines
> between them, which breaks commitlint's trailer detection (`git interpret-trailers --parse` requires that trailers be contiguous with the body).

```bash
# CORRECT — single -m with $'...\n...' embedded newlines
git commit -S -m $'type[scope]: subject\n\nBody paragraph.\n\nPlan-by: model\nAcked-by: model\nSigned-off-by: user <email>'

# WRONG — multiple -m flags insert blank lines between each, breaking trailers
git commit -S -m "type[scope]: subject" -m "Body." -m "Plan-by: model" -m "Acked-by: model"
```

If the commit fails due to the commit-msg hook, the commit was **not created**.
Retry with `git commit` (not `--amend`), fixing the message format. There is
nothing to amend because the commit was never made.
