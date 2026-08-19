---
description: Prepare a release from synchronized develop — propose the version via git-cliff (or the human for a first release), create release/X.Y.Z, commit the changelog, and print the human-run push and PR commands. CI tags and publishes after merge.
---

Prepare a release from a clean, synchronized `develop` and author the release
pull request. This command is only the local authoring half of the release
pipeline (ADR-0046): after the human merges the PR,
`.github/workflows/release.yml` creates the tag and GitHub Release and opens
the back-merge PR. Never tag, publish, push, or clean up locally.

## Arguments

The optional release tracking issue number arrives as the slash-command
argument (`$ARGUMENTS`) and is untrusted data. Accept only an empty argument
or a single bare positive integer with an optional leading `#` — the exact
accepted pattern is `^#?[1-9][0-9]*$`. Reject whitespace, multiple arguments,
zero, signs, shell metacharacters, and command substitutions before the value
reaches any shell command or the commit message. Normalize the accepted value
to its digits: when present, the release commit footer is exactly
`Refs: #NN`; with no argument the `Refs:` line is omitted. Never emit
`Refs: NN` without the `#`.

## Pre-flight

Stop immediately (exit 1) if any of these hold:

```bash
# Mandatory local readiness (fail-closed; missing launcher or Semgrep/OCR failure blocks)
prism-tool doctor --local-only || exit 1
```

```bash
# Working tree must be clean (staged, unstaged, and untracked)
if [ -n "$(git status --porcelain)" ]; then
    echo "✗ Working tree has uncommitted changes. Commit or stash first." >&2
    exit 1
fi
```

```bash
# The current branch must be exactly develop
if [ "$(git branch --show-current)" != "develop" ]; then
    echo "✗ Releases originate from the develop branch only." >&2
    exit 1
fi
```

```bash
# Synchronize and verify HEAD equals the fetched origin/develop
git fetch origin develop --tags
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/develop)" ]; then
    echo "✗ Local develop is not synchronized with origin/develop. Pull or reset first." >&2
    exit 1
fi
```

```bash
# git-cliff 2.0+ is required through the launcher; there is no alternative —
# CHANGELOG.md cannot be produced without it. Direct a missing-tool user to /doctor.
CLIFF_MAJOR=$(prism-tool run git-cliff -- --version 2>/dev/null | grep -oE '^git-cliff [0-9]+' | grep -oE '[0-9]+$' || true)
if [ -z "$CLIFF_MAJOR" ] || [ "$CLIFF_MAJOR" -lt 2 ]; then
    echo "✗ git-cliff 2.0+ is required. Run /doctor to fix your toolchain." >&2
    exit 1
fi
```

## Propose and confirm the version

Stop when there are no releasable commits — with none pending, the unreleased
changelog contains no list items:

```bash
if ! prism-tool run git-cliff -- --unreleased --strip header 2>/dev/null | grep -qE '^[-*] '; then
    echo "No releasable commits — nothing to release." >&2
    exit 1
fi
```

Detect whether a prior release tag matching `v[0-9]*` exists:

```bash
LAST_RELEASE_TAG=$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)
```

When no prior release tag exists, git-cliff cannot compute an initial
version, so do not run `prism-tool run git-cliff -- --bumped-version`. Ask the user exactly one
question — the initial version (e.g. `0.1.0`) — and STOP and wait for the
reply:

```text
First release — no prior release tag. Propose the initial version (e.g. 0.1.0):
```

Validate the reply against `^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$` before
any shell or ref use; an invalid reply stops the release.

When a prior release tag exists, let `cliff.toml` compute the bump with
`prism-tool run git-cliff -- --bumped-version` (breaking changes bump MINOR
before 1.0.0 and MAJOR at 1.0.0+, `feat:` bumps MINOR, and
`fix:`/`patch:` bump PATCH), then strip at most one leading `v`:

```bash
VERSION=$(prism-tool run git-cliff -- --bumped-version 2>/dev/null | sed 's/^v//')
```

If the proposal is empty or invalid despite releasable commits, stop and
report the failure — never switch to manual bumping.

Either way, validate the candidate against the exact release grammar
(optional prerelease, no build metadata):

```bash
if ! printf '%s' "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
    echo "✗ Invalid version '$VERSION'." >&2
    exit 1
fi
```

Present the pending commit range and bump rationale:

```bash
prism-tool run git-cliff -- --unreleased --strip header
```

Then ask the final release-confirmation question — exactly one question in
that turn — following the confirmation-gate style of `setup-rulesets.md`:

```text
Release vX.Y.Z? (yes/no)
```

Accept only an explicit `yes`; any other reply — including empty or `y` —
means stop. STOP until the user approves; proceed only after explicit
approval. Keep every question at the conversation level; never prompt on the
shell.

## Create the release branch

```bash
bash "$(prism-tool resolve scripts)/new-branch.sh" release "$VERSION"
```

The branch is `release/X.Y.Z` — the version carries no `v`.

## Generate the changelog

```bash
prism-tool run git-cliff -- --tag "v$VERSION" --output CHANGELOG.md
```

If scaffold links survive, replace `kyaulabs/template` with the repository
detected by `gh repo view`. Use a portable temp file + `mv` — never GNU-only
in-place `sed` editing:

```bash
if grep -qF 'kyaulabs/template' CHANGELOG.md; then
    OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
    TMP_FILE=$(mktemp)
    sed "s|kyaulabs/template|${OWNER_REPO}|g" CHANGELOG.md > "$TMP_FILE"
    mv "$TMP_FILE" CHANGELOG.md
fi
```

Show the generated version section for review.

## Pre-flight the release-body size

Measure the generated `v$VERSION` section (bytes >= characters for UTF-8, so
120,000 bytes is a conservative proxy for GitHub's 125,000-character
release-body limit). When the block below reports `oversized`, ask the human
exactly one question — proceed (on merge `release.yml` truncates the body at
the limit and attaches the full changelog as `full-changelog-vX.Y.Z.md`) or
abort and trim the changelog at the source — and STOP for an explicit `yes`
before continuing.

```bash
section_bytes=$(awk -v v="[$VERSION]" '
    /^## / { if (in_sec) exit; if (index($0, v)) in_sec = 1; next }
    in_sec { print }
' CHANGELOG.md | wc -c)
if [ "$section_bytes" -gt 120000 ]; then
    echo "oversized: ${section_bytes} bytes"
fi
```

## Compute and bump per-package versions

Release-managed packages are declared in `.prism/release.json` at the repo
root — `{ "packages": ["relative/dir", ...] }`. When the file is absent or its
`packages` array empty, skip this entire section: no per-package behavior.
When present but malformed (absolute path, `..`, whitespace, missing
`package.json`, unparseable JSON), stop the release.

For each declared package, compute its bump from commits touching that path
since its last `<prefix>@*` tag. The prefix is the package's `package.json`
`name` with the scope stripped (`@kyaulabs/prism-core` → `prism-core`). A
computed version equal to the current `package.json` version means the
package has nothing to bump — skip it entirely (no bump, no tag, no npm
command). Otherwise bump it and record the package dir in `BUMPED_PKGS`
(space-separated, conversation context) for the commit and handoff:

```bash
# For each declared package path PKG:
PKG_NAME=$(node -e 'process.stdout.write(require(process.argv[1]).name)' "$PKG/package.json")
PKG_PREFIX=${PKG_NAME#*/}
PKG_CUR=$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$PKG/package.json")
PKG_NEXT=$(prism-tool run git-cliff -- --bumped-version --include-path "$PKG/*" --tag-pattern "${PKG_PREFIX}@.*" 2>/dev/null | sed "s/^${PKG_PREFIX}@//")
if [ "$PKG_NEXT" != "$PKG_CUR" ]; then
    (cd "$PKG" && npm version "$PKG_NEXT" --no-git-tag-version)
    BUMPED_PKGS="$BUMPED_PKGS $PKG"
fi
```

The `chore(release): vX.Y.Z` commit carries the bumped `package.json` files,
so the versions land in the merge commit.

## Commit the changelog

Load `conventional-commits` and use its launcher-owned workflow. Stage
`CHANGELOG.md` plus each literal bumped `package.json` path. Do not interpolate
the package list into a commit command.

Render the validated version as a literal `vX.Y.Z` subject. Keep
`RELEASE_ISSUE_DIGITS` only as validated conversation state: when present,
render the validated digits as a literal `--refs NN` argv value; when absent,
omit the control. Never place the raw invocation argument or a shell variable
in the prepare command.

The no-issue shape is:

```bash
git add CHANGELOG.md
prism-tool commit prepare --type chore --scope release --subject vX.Y.Z
```

When a tracking issue was supplied, the prepare command additionally ends with
`--refs NN`, where both version and digits are already validated literals.
The launcher resolves the three ADR-0064 footers, runs commitlint, and prints
the exact commit message. Present that exact commit message and plan ID, ask
for explicit approval, and STOP. The earlier release confirmation is not
commit approval.

After approval, render the returned plan ID as a literal and run:

```bash
prism-tool commit apply --plan 0123456789abcdef0123456789abcdef --approval=yes
```

If approval is declined, discard that literal plan ID. Report the resulting
commit ID and never push.

## Handoff — print only, do not execute

Render the validated version into the inert text template below and print it
for the human. These lines are output text, not a shell block — never
execute them:

```text
# Print for the human — do not execute these commands.
git push -u origin release/X.Y.Z

gh pr create --base main --head release/X.Y.Z \
    --title "Release vX.Y.Z" \
    --body "Automated release PR for vX.Y.Z. Merging triggers release.yml, which creates the tag and GitHub Release at the merge SHA and opens the back-merge PR for a human to merge."

# After the release PR merges, publish each bumped package (release.yml
# already tagged them; npm prompts for OTP if 2FA is enabled):
#   cd <pkg> && npm publish --access public
#   (one line per bumped package; none when no package bumped)
```

State that after the human merges the PR, `release.yml` creates the unsigned
`vX.Y.Z` tag and GitHub Release at the merge SHA, tags every bumped package
(`<prefix>@<ver>`), and opens the `main` → `develop` back-merge PR, which a
human reviews and merges. The printed `npm publish` commands run after the
merge. Stop there.

## Rules

- Never push `main` or `develop` directly; all integration uses merged PRs.
- Never create a tag, a GitHub Release, or a back-merge PR locally — after the
  human merges the release PR, `release.yml` creates the tag and Release and
  opens the back-merge PR.
- If there are no releasable commits or the human withholds approval, stop
  without creating anything.
- Never reuse a release branch after its PR is merged; create a fresh
  `release/` branch for each release.
- The release commit is signed through `prism-tool commit` and always carries
  the three ADR-0064 footers; `Refs:` appears only from a validated invocation
  argument rendered as literal argv.
