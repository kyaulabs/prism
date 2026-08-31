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
git status --porcelain
```

Any output means the tree is dirty: stop and report "Working tree has
uncommitted changes. Commit or stash first." An empty result passes.

```bash
# The current branch must be exactly develop
git branch --show-current
```

The output must be exactly `develop`; otherwise stop and report that releases
originate from `develop` only.

Synchronize both integration refs, then obtain the local and remote develop
SHAs in separate calls:

```bash
git fetch origin develop main --tags
git rev-parse HEAD
git rev-parse origin/develop
git merge-base --is-ancestor origin/main HEAD
```

Validate both SHA outputs and compare them as inert data. If they differ, stop
and report that local `develop` is not synchronized with `origin/develop`.
Exit 0 from the ancestry check confirms that `develop` contains the latest
`main`. Exit 1 means the human must merge the `main` → `develop` back-merge PR
before preparing another release. Treat every other Git failure as fatal.

```bash
# git-cliff 2.0+ is required through the launcher; there is no alternative —
# CHANGELOG.md cannot be produced without it. Direct a missing-tool user to /doctor.
prism-tool run git-cliff -- --version
```

Parse the returned version as inert data. Validate that its major component is
an integer at least 2. If the major component is below 2, stop and direct the
user to `/doctor`.

Verify managed package ownership before proposing a version, creating a branch,
or writing the changelog:

```bash
prism-tool package-release verify --json
```

Require an exact `GO` report. Any failure stops release preparation while the
clean synchronized `develop` state is still untouched.

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
git describe --tags --abbrev=0 --match 'v[0-9]*'
```

Exit 0 with output means a prior release tag exists. A no-match exit means
this is the first release; do not mask or reinterpret other failures.

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
prism-tool run git-cliff -- --bumped-version
```

Strip at most one leading `v` from the observed output at the agent level and
retain the validated result as literal `X.Y.Z` context.

If the proposal is empty or invalid despite releasable commits, stop and
report the failure — never switch to manual bumping.

Either way, validate the candidate against the exact release grammar
(optional prerelease, no build metadata):

Render the candidate literally and validate it:

```bash
printf '%s' 'X.Y.Z' | grep -qE "^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$"
```

A non-zero exit means the version is invalid; stop.

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
prism-tool resolve scripts
```

Retain the returned absolute directory, then render the validated version
literally:

```bash
bash /absolute/resolved/scripts/new-branch.sh release X.Y.Z
```

The branch is `release/X.Y.Z` — the version carries no `v`.

## Generate the changelog

```bash
prism-tool run git-cliff -- --tag "vX.Y.Z" --output CHANGELOG.md
```

If scaffold links survive, replace `kyaulabs/template` with the repository
detected by `gh repo view`. Use a portable temp file + `mv` — never GNU-only
in-place `sed` editing:

First check whether replacement is needed:

```bash
grep -qF 'kyaulabs/template' CHANGELOG.md
```

When it is, run the repository lookup separately and retain the validated
`OWNER/REPO` output:

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
```

Then use a stable project-local temp file:

```bash
mkdir -p .pi/tmp
set -C
sed "s|kyaulabs/template|OWNER/REPO|g" CHANGELOG.md > .pi/tmp/release-changelog.tmp &&
    mv .pi/tmp/release-changelog.tmp CHANGELOG.md
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
awk -v v="[X.Y.Z]" '
    /^## / { if (in_sec) exit; if (index($0, v)) in_sec = 1; next }
    in_sec { print }
' CHANGELOG.md | wc -c
```

Validate the numeric output as inert data. A value greater than 120,000 is
`oversized`; ask the approval question described above.

## Author configured package versions in lockstep

Release-managed packages are declared only by `.prism/release.json` at the
repository root. When the file is absent, state explicitly that this is a
repository-only release and run no npm command.

When present, require schema 2 with exactly these root fields before changing
any manifest:

```json
{
  "schemaVersion": 2,
  "managedBy": "@kyaulabs/prism-core",
  "versionPolicy": "lockstep",
  "packages": ["relative/package/directory"],
  "adapterReleases": [
    {
      "package": "relative/adapter/directory",
      "id": "adapter-id",
      "displayName": "Adapter name",
      "coreRange": ">=1.2.3 <2.0.0",
      "bootstrapProtocol": 1,
      "status": "ACTIVE"
    }
  ]
}
```

`adapterReleases` may be empty. Reject unknown declaration fields and unknown
root keys. Reject an empty package list, duplicate package paths, duplicate
adapter IDs, and more than 64 declarations. Keep every declaration closed to
`package`, `id`, `displayName`, `coreRange`, `bootstrapProtocol`, and `status`.

Reject absolute or escaping package paths, whitespace, control characters,
symlinks, private packages, missing or malformed `package.json` files,
unusable package names, duplicate tag prefixes, and paths that resolve outside
the repository. Each declaration must identify exactly one configured
release-managed public package. Require that package manifest to declare
`prism.adapter === true` and the same positive safe-integer
`bootstrapProtocol`. Require a bounded adapter ID and display name, a canonical
valid `coreRange` accepted by Core's bundled SemVer implementation, and status
`ACTIVE` or `REVOKED`.

Reject malformed ranges and unmanaged declaration packages.
Reject protocol disagreement and any declaration/package version disagreement
after lockstep version authoring. Validate every configured package and
declaration before running the first npm command; partial package-version
mutation is forbidden.
Run the managed capability verification and require a `GO` report before
mutation:

```bash
prism-tool package-release verify --json
```

After validation, render the confirmed repository version and each validated
package directory literally. Run this once for every configured package:

```bash
npm --prefix PACKAGE_DIRECTORY version X.Y.Z --no-git-tag-version
```

Read each resulting `PACKAGE_DIRECTORY/package.json` separately and require
its version to equal the exact confirmed `X.Y.Z`. For every declaration,
require its release-managed package version to equal the exact confirmed
`X.Y.Z`. Then revalidate the complete configuration and manifests:

```bash
prism-tool package-release verify --json
```

Require another `GO` report. It must not rewrite compatibility or infer
`coreRange`. It must not add registry, integrity, publication, credential,
sequence, branch, command, or signing fields. It preserves the reviewed
declaration exactly. The release commit carries every configured
package at the repository release version, whether or not that package's
source changed.

## Commit the changelog

Load `conventional-commits` and use its atomic launcher workflow. Stage
`CHANGELOG.md` first:

```bash
git add CHANGELOG.md
```

For every configured package, stage its validated literal manifest path in a
separate call:

```bash
git add PACKAGE_DIRECTORY/package.json
```

Stage `.prism/release.json` only when the release branch deliberately changes
its reviewed declarations or package policy:

```bash
git add .prism/release.json
```

Do not interpolate the package list into shell source or combine staging with
commit creation. A repository-only release stages no package manifest. Never
change or stage compatibility metadata merely to prepare a version bump.

Render the validated version as a literal `vX.Y.Z` subject. Keep
`RELEASE_ISSUE_DIGITS` only as validated conversation state: when present,
render the validated digits as a literal `--refs NN` argv value; when absent,
omit the control. Never place the raw invocation argument or a shell variable
in the create command.

Run the commit in a later assistant batch as its only tool call, with no
compound shell syntax. The no-issue shape is:

```bash
prism-tool commit create --type chore --scope release --subject vX.Y.Z
```

When a tracking issue was supplied, the create command additionally ends with
`--refs NN`, where both version and digits are already validated literals.
The launcher resolves the three ADR-0064 footers, runs commitlint, creates the
signed commit with hooks enabled, and verifies that `HEAD` advanced. There is
no separate per-operation pause. Report the resulting commit ID and never
push.

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

# After the release PR merges, publish every configured package (release.yml
# already tagged each one; npm prompts for OTP if 2FA is enabled):
#   cd PACKAGE_DIRECTORY && npm publish --access public
#   (print one literal line per configured package)
```

For a repository-only release, print no npm command. Otherwise, render one
inert `cd PACKAGE_DIRECTORY && npm publish --access public` line for every
configured package outside executable Bash fences.

State that after the human merges the PR, `release.yml` creates the unsigned
`vX.Y.Z` tag and GitHub Release at the merge SHA, tags every configured
package (`<prefix>@X.Y.Z`), and opens the `main` → `develop` back-merge PR,
which a human reviews and merges. The printed npm publication commands run
after the merge. Stop there.

## Rules

- Never push `main` or `develop` directly; all integration uses merged PRs.
- Never create a tag, a GitHub Release, or a back-merge PR locally — after the
  human merges the release PR, `release.yml` creates the tag and Release and
  opens the back-merge PR.
- If there are no releasable commits or the human withholds the release
  confirmation, stop without creating anything.
- Never reuse a release branch after its PR is merged; create a fresh
  `release/` branch for each release.
- The release commit is signed through `prism-tool commit` and always carries
  the three ADR-0064 footers; `Refs:` appears only from a validated invocation
  argument rendered as literal argv.
