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

- Subject line: lowercase, no period at end, max 72 characters
- Body: wrap at 72 characters, explain *why* not *what*
- Signed commits required (`git commit -S`)

## Valid Types

| Type       | When to use                                               |
|------------|-----------------------------------------------------------|
| `feat`     | A new feature                                             |
| `fix`      | A bug fix                                                 |
| `docs`     | Documentation only changes                               |
| `style`    | Formatting, whitespace — no logic change                 |
| `refactor` | Code change that neither fixes a bug nor adds a feature  |
| `perf`     | Performance improvement                                   |
| `test`     | Adding or correcting tests                               |
| `build`    | Build system or asset pipeline changes                   |
| `ci`       | CI/CD configuration changes                              |
| `chore`    | Maintenance (deps, tooling) — no production code change  |
| `revert`   | Reverts a previous commit                                |

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
fix(db): prevent SQL injection in user search query
test(auth): add boundary cases for empty credentials
refactor(backend): extract DB retry logic into helper
chore: update composer dependencies
docs: add browser test setup instructions to AGENTS.md
```

## Enforcement

Commitlint validates every commit message via `.github/hooks/commit-msg`.
The hook blocks the commit if the format is invalid.
Config: `commitlint.config.js` using `@commitlint/config-conventional`.
