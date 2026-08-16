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
- Every commit must include `Implemented-by:`, `Tested-by:`, and `Signed-off-by:` footers

## Required Footers

Every commit message must end with three footers:

- **`Implemented-by:`** — the model pi is using (the active session model).
  Use the model ID segment after the last `/` (for example,
  `provider/model-id` → `model-id`).
- **`Tested-by:`** — the model open-code-review is configured with. Resolve
  it with `bash "$(prism-tool resolve scripts)/resolve-ocr-model.sh"` (reads
  only the `model` key from `~/.opencodereview/config.json`; fails closed,
  exit 3, when the config is missing or unreadable).
- **`Signed-off-by:`** — the human user approving the change, formatted as
  `Name <email>`. Resolve it dynamically with
  `bash "$(prism-tool resolve scripts)/resolve-identity.sh"`; it uses an optional
  `~/.config/prism/identity` override and then git
  `user.name`/`user.email`, failing closed when neither resolves.

> [!CAUTION]
> Do NOT use role names (`build-agent`, `code-review`, `tdd`, etc.) — only the
> model ID. The Implemented-by / Tested-by footers track which configured
> models implemented and verified the change — not which agent role
> orchestrated it.
>
> `Tested-by:` records the model the review tool (open-code-review) uses;
> `Implemented-by:` attributes the coding model. See ADR-0064.

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
directory, or feature area: `feat(core)`, `fix(db)`, `test(auth)`.

## Branch Naming

Branch names follow Conventional Commit type prefixes per ADR-0028. See
`bash "$(prism-tool resolve scripts)/new-branch.sh"` for the canonical creator and
`bash "$(prism-tool resolve scripts)/validate-branch-name.sh"` for the regex.

- `<type>/<username>-<hash>-<description>` — feature/standard work
  (`<type>` ∈ feat, fix, patch, docs, style, refactor, perf, test, build, ci,
  chore, revert)
- `hotfix/<username>-<hash>-<description>` — emergency fixes off `main`
- `release/<major>.<minor>.<patch>[-<prerelease>]` — release prep off `develop`

Exempt from validation: `main`, `develop`, detached HEAD.

The `prepare-commit-msg` hook rejects commits on non-conforming branches.

## Issue References

- **`Fixes: #NN`** — closes issue #NN. This is the *only* accepted closing
  keyword. Place it at the **top of the footer block**, immediately above
  `Implemented-by:`. commitlint rejects `Closes`, `Close`, `Closed`, `Resolve`,
  `Resolves`, `Resolved`, `Fix`, `Fixed`, and colon-less forms (`Fixes #42`).
- **`Refs: #NN`** — references an issue *without* closing it. Same footer
  block, above `Implemented-by:`.
- Lowercase `fixes:` is rejected — the token is Sentence-case.

## Examples

```
feat(auth): add remember-me cookie to login flow

Implemented-by: <active-model-id>
Tested-by: <ocr-model-id>
Signed-off-by: <resolved via resolve-identity.sh>
```

```
fix(db): parameterize the user search query

Fixes: #42
Implemented-by: <active-model-id>
Tested-by: <ocr-model-id>
Signed-off-by: <resolved via resolve-identity.sh>
```

```
test(auth): add boundary cases for empty credentials

Implemented-by: <active-model-id>
Tested-by: <ocr-model-id>
Signed-off-by: <resolved via resolve-identity.sh>
```

```
refactor(storage): extract retry logic into helper
chore: update package dependencies
docs: add test setup instructions to AGENTS.md
```

Examples above show the required footers. Every commit carries them, including
mechanical `chore` and `docs` commits.

## Enforcement

Commitlint validates every commit message via `.github/hooks/commit-msg`.
The hook blocks the commit if the format is invalid.
Config: `commitlint.config.js` extends commitlint's conventional config,
with a custom `type-enum` that adds `patch` and `ignore` to the
standard set.

Merge commits (`git merge --no-ff`) and revert commits (`git revert`) are
exempt from trailer enforcement — their auto-generated messages cannot carry
`Implemented-by:`/`Tested-by:`/`Signed-off-by:` trailers. If `commitlint` is not
installed (fresh clone without `npm install`), the hook fails closed and
blocks the commit; run `npm install` to restore the local toolchain. CI
enforces the policy on every PR commit.

## Passing the Message to Git

> [!IMPORTANT]
> Pass the full commit message as a **single `-m`** argument with embedded
> newlines. Do **not** use multiple `-m` flags — git inserts blank lines
> between them, which breaks commitlint's trailer detection (`git interpret-trailers --parse` requires that trailers be contiguous with the body).

> [!WARNING]
> Never embed a **literal backslash-n** inside `-m "..."` (regular quotes) —
> bash keeps it as two characters, corrupting the message (over-long lines,
> broken trailers). The `$'...\n...'` form interprets `\n` as a real newline.
> The commit-msg hook now rejects literal backslash-n sequences (ADR-0025).

```bash
# CORRECT — single -m with $'...\n...' embedded newlines
git commit -S -m $'type[scope]: subject\n\nBody paragraph.\n\nImplemented-by: model\nTested-by: model\nSigned-off-by: user <email>'

# WRONG — multiple -m flags insert blank lines between each, breaking trailers
git commit -S -m "type[scope]: subject" -m "Body." -m "Implemented-by: model" -m "Tested-by: model" -m "Signed-off-by: user <email>"
```

If the commit fails due to the commit-msg hook, the commit was **not created**.
Retry with `git commit` (not `--amend`), fixing the message format. There is
nothing to amend because the commit was never made.
