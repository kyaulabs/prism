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

## Commit the changelog

Resolve the four ADR-0040 footers from the current pi session, then create
the signed `chore(release): vX.Y.Z` commit through the normal instruction
gate. Carry the validated digits from the Arguments step into the block below
as `RELEASE_ISSUE_DIGITS` (empty when no argument was supplied); the block
instantiates `RELEASE_REF` from it in the same shell invocation and fails
closed if the footer state is missing or malformed. If a valid issue was
supplied, the commit must carry exactly `Refs: #<digits>` — never commit
without it:

```bash
: "${PI_MODEL:?current pi model is required before committing}"
MODEL_ID="${PI_MODEL##*/}"
# RELEASE_ISSUE_DIGITS: validated digits from the invocation argument. The
# agent renders the validated value into the assignment below (empty when no
# argument was supplied); the raw invocation argument never enters a shell
# command.
RELEASE_ISSUE_DIGITS=""
# Fail closed FIRST, before any assignment-derived value is used: a
# non-empty value must be exactly ^[1-9][0-9]*$ so raw invocation input
# can never reach a shell command.
if [ -n "$RELEASE_ISSUE_DIGITS" ] && ! printf '%s' "$RELEASE_ISSUE_DIGITS" | grep -qE '^[1-9][0-9]*$'; then
    echo "✗ Release-issue digits are malformed." >&2
    exit 1
fi
# Instantiate RELEASE_REF in this same shell invocation: empty when no issue
# was supplied, otherwise exactly "Refs: #<digits>".
RELEASE_REF=""
if [ -n "$RELEASE_ISSUE_DIGITS" ]; then
    RELEASE_REF="Refs: #${RELEASE_ISSUE_DIGITS}"
fi
# Fail closed: a validated issue must yield exactly "Refs: #<digits>".
if [ -n "$RELEASE_ISSUE_DIGITS" ] && ! printf '%s' "$RELEASE_REF" | grep -qE '^Refs: #[1-9][0-9]*$'; then
    echo "✗ Release-issue footer is missing or malformed." >&2
    exit 1
fi
OCR_MODEL=$(bash "$(prism-tool resolve scripts)/resolve-ocr-model.sh") \
    || { echo "✗ Release commit blocked: OCR model could not be resolved (run: ocr config model)." >&2; exit 1; }
git add CHANGELOG.md
if [ -n "$RELEASE_REF" ]; then
    RELEASE_MSG=$(printf 'chore(release): v%s\n\n%s\nImplemented-by: %s\nTested-by: %s\nSigned-off-by: %s' \
        "$VERSION" "$RELEASE_REF" "$MODEL_ID" \
        "$OCR_MODEL" \
        "$(bash "$(prism-tool resolve scripts)/resolve-identity.sh")")
else
    RELEASE_MSG=$(printf 'chore(release): v%s\n\nImplemented-by: %s\nTested-by: %s\nSigned-off-by: %s' \
        "$VERSION" "$MODEL_ID" \
        "$OCR_MODEL" \
        "$(bash "$(prism-tool resolve scripts)/resolve-identity.sh")")
fi
git commit -S -m "$RELEASE_MSG"
```

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
```

State that after the human merges the PR, `release.yml` creates the unsigned
`vX.Y.Z` tag and GitHub Release at the merge SHA and opens the
`main` → `develop` back-merge PR, which a human reviews and merges. Stop there.

## Rules

- Never push `main` or `develop` directly; all integration uses merged PRs.
- Never create a tag, a GitHub Release, or a back-merge PR locally — after the
  human merges the release PR, `release.yml` creates the tag and Release and
  opens the back-merge PR.
- If there are no releasable commits or the human withholds approval, stop
  without creating anything.
- Never reuse a release branch after its PR is merged; create a fresh
  `release/` branch for each release.
- The release commit is signed (`git commit -S`) and always carries the four
  ADR-0040 footers; a `Refs:` footer appears only from a validated invocation
  argument.
