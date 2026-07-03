---
description: Draft release notes via git-cliff, propose a semver bump, create a signed tag, and produce a gh release create command. Uses the existing cliff.toml.
agent: build
---

Prepare a release using the project's existing `cliff.toml`. No step here
pushes or publishes without user confirmation.

## 1. Determine the version bump

Run `git fetch --tags` then inspect commits since the last tag:

```bash
git describe --tags --abbrev=0 2>/dev/null   # last tag, if any
git log --oneline <last-tag>..HEAD
```

Apply SemVer (see `.opencode/docs/versioning.md`):

- `feat:` or `feat!:` (breaking) since last tag → **minor** (or **major** if
  there's a `BREAKING CHANGE:` footer / `!` on a `feat`).
- `fix:` or `patch:` only → **patch**.
- `BREAKING CHANGE:` on any type without a `feat` → **major**.
- No `feat`/`fix`/`patch` since last tag → no release needed; say so and stop.

Propose the new version `vX.Y.Z`. Confirm with the user before proceeding.

## 2. Generate the changelog

```bash
git cliff --tag vX.Y.Z --output CHANGELOG.md
```

Show the generated section. If `CHANGELOG.md` doesn't exist, `git cliff`
creates it; otherwise it prepends the new section.

## 3. Stage and commit the changelog

```bash
git add CHANGELOG.md
git commit -S -m "chore(release): vX.Y.Z"
```

Signed commit required (see `conventional-commits` skill).

## 4. Create the signed tag

```bash
git tag -s vX.Y.Z -m "Release vX.Y.Z"
```

## 5. Produce the publish commands (do not run)

Print the exact commands for the user to run after review:

```bash
git push origin main --tags
gh release create vX.Y.Z \
  --title "vX.Y.Z" \
  --notes-file <(git cliff --tag vX.Y.Z --strip header)
```

If the repo is not on GitHub or `gh` isn't available, print the tag-push
command alone.

## Rules

- Never push or run `gh release create` automatically. Print the commands and
  stop.
- If there is nothing to release since the last tag, say so and exit without
  bumping.
- If the working tree is dirty, stop and ask the user to commit or stash
  first.
- Always sign the commit and the tag (`-S` / `git tag -s`).
- If `cliff.toml` is missing or `git cliff` is not installed, fall back to a
  hand-written Conventional-Commits summary grouped by type, and flag that
  `cliff.toml` should be added.
