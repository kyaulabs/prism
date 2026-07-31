---
description: Prepare a release via a PR to main — determine version, create branch, generate changelog, then print the PR command. After human merge, finalize with a signed tag on the merged SHA and a back-merge PR to develop.
agent: build
---

Prepare a release in two phases using the project's existing `cliff.toml`.
No step here pushes or publishes without user confirmation. `main` and
`develop` are protected branches — all integration goes through merged pull
requests.

---

## Phase 1 — Preparation (before the PR is merged)

### 1. Determine the version bump

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

### 2. Create the release branch

```bash
bash .github/scripts/new-branch.sh release "vX.Y.Z"
```

This creates `release/vX.Y.Z` off the current branch. Commit the changelog
on this branch.

### 3. Generate the changelog

```bash
git cliff --tag vX.Y.Z --output CHANGELOG.md
```

Show the generated section. If `CHANGELOG.md` doesn't exist, `git cliff`
creates it; otherwise it prepends the new section.

### 4. Commit the changelog on the release branch

```bash
git add CHANGELOG.md
git commit -S -m $'chore(release): vX.Y.Z\n\nAuthored-by: glm-5.2\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

Signed commit required (see `conventional-commits` skill). The release commit is
a normal `chore(release):` commit (not a merge/revert), so it carries the four
required footers: `Authored-by`/`Implemented-by`/`Tested-by` from the configured
model tiers and `Signed-off-by` resolved via
`bash .github/scripts/resolve-identity.sh`. Use a single `-m` with `$'...\n...'`
quoting (never multiple `-m` flags).

### 5. Print the release-branch push and PR commands

Print the exact commands for the user to run:

```bash
# Push the release branch (human only — agents never push)
git push -u origin release/vX.Y.Z

# Open the PR to main
gh pr create --base main --head release/vX.Y.Z \
    --title "Release vX.Y.Z" \
    --body "Automated release PR for vX.Y.Z. After merge, run the
/ release finalization steps to create the signed tag and back-merge."
```

**Stop here.** Do not continue to Phase 2 until the user confirms the PR has
been reviewed, approved, and merged into `main`.

---

## Phase 2 — Finalization (after the PR is merged)

Do not run this phase until the human confirms the release PR has been merged.
All steps require explicit confirmation before execution.

### 6. Fetch the merged state and verify

```bash
git fetch origin main
```

Query the just-merged PR to verify it was merged into `main`:

```bash
gh pr view release/vX.Y.Z --json state,mergedAt,baseRefName,mergeCommit --jq '.' | php -r '
$pr = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$ok = ($pr["state"] ?? "") === "MERGED"
   && ($pr["mergedAt"] ?? null) !== null
   && ($pr["baseRefName"] ?? "") === "main"
   && ($pr["mergeCommit"]["oid"] ?? "") === trim(shell_exec("git rev-parse origin/main"));
if (!$ok) { fwrite(STDERR, "FAIL: PR is not a verified merged-main commit\n"); exit(1); }
echo "OK: PR merge commit matches origin/main\n";
'
```

The exit code must be `0`. If not, stop — the PR may not yet be merged, may
have been closed without merging, or `origin/main` may not match the expected
merge SHA. Do not proceed.

### 7. Create the signed tag on the verified merge SHA

```bash
MERGE_SHA=$(git rev-parse origin/main)
git tag -s vX.Y.Z "$MERGE_SHA" -m "Release vX.Y.Z"
```

The tag names the exact merge commit on `main`, not the release-branch tip.
This ties the signed tag to the PR merge that GitHub verified.

### 8. Publish only the tag (never push main directly)

Print the exact commands:

```bash
# Push the signed tag only (human only — agents never push)
git push origin vX.Y.Z

# Create the GitHub release
gh release create vX.Y.Z \
    --title "vX.Y.Z" \
    --notes-file <(git cliff --tag vX.Y.Z --strip header)
```

If the repo is not on GitHub or `gh` isn't available, print the tag-push
command alone. Never push `main` or `develop` directly.

### 9. Back-merge main into develop via PR

After the tag is published, `main` has new commits that `develop` needs:

```bash
# Back-merge PR: develop ← main
gh pr create --base develop --head main \
    --title "Back-merge main into develop (vX.Y.Z)" \
    --body "Back-merge the vX.Y.Z release from main into develop."
```

This opens a PR to merge `main`'s release commits back into `develop`. The
human reviews and merges it. Never push to `develop` directly.

### 10. Clean up the release branch

The release branch has been merged — do not reuse it. The human may delete
it locally and remotely after the PR is merged:

```bash
git branch -d release/vX.Y.Z
git push origin --delete release/vX.Y.Z   # human executes this
```

## Rules

- Never push `main` or `develop` directly. All integration uses merged PRs.
- Never push or run `gh release create` automatically. Print the commands and
  stop at each phase boundary.
- If there is nothing to release since the last tag, say so and exit without
  bumping.
- If the working tree is dirty, stop and ask the user to commit or stash
  first.
- Always sign the commit and the tag (`-S` / `git tag -s`).
- The signed tag must reference the verified merge commit on `main`, not
  `HEAD` or the release branch tip.
- Never reuse a release branch after its PR is merged. Create a fresh
  `release/` branch for each release.
- If `cliff.toml` is missing or `git cliff` is not installed, fall back to a
  hand-written Conventional-Commits summary grouped by type, and flag that
  `cliff.toml` should be added.
