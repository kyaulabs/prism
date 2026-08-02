# 0046. Automated Release Pipeline

Date: 2026-08-01

## Status

Accepted

Partially supersedes ADR-0044 lines 132–137 (release-branch origin and
manual local finalization); PR-only integration and human-only merges
remain unchanged.

## Context

Release finalization today is a manual, agent-run ritual described in
ADR-0044: after the release PR merges into `main`, the agent locally
signs a tag on the merged SHA, pushes the tag, runs `gh release create`,
and creates the `main` → `develop` back-merge PR. This couples release
publication to a local agent session, lets a tag/Release and its
changelog diverge from the reviewed merge, and requires the agent to
hold tag-push rights — a standing conflict with the harness's
agents-never-push boundary.

The repository already has a reviewed changelog in the merge: `/release`
commits `CHANGELOG.md` to the release branch, so the release body can be
extracted byte-for-byte from repository content that passed review.
GitHub Actions offers an event-driven, fail-closed execution surface with
no new dependencies, and ADR-0035 already establishes the
GitHub-hosted, fork-isolated runner posture.

Forces:

- **Reviewed-artifact publication:** the tag and Release must point at
  the immutable merge commit of a merged, same-repository release PR,
  and the Release body must be exactly the reviewed changelog section.
- **Untrusted event data:** branch names, PR metadata, and changelog text
  arrive from the outside; every value must be validated before it is
  used in a ref, an API call, or release notes.
- **Fail-closed idempotency:** reruns of a successfully published release
  must succeed without duplicate publication, while partial states and
  wrong-target tags must fail loudly.
- **Least privilege:** publication needs exactly `contents: write` and
  `pull-requests: write`, nothing more; Actions runners hold no signing
  key, so CI-created tags cannot be signed.
- **Human control:** CI must open the back-merge PR but never merge it,
  and must never push a branch. PRs created with `GITHUB_TOKEN` do not
  emit further workflow runs by design; no workaround is acceptable.

## Decision

We split release finalization into a local authoring half and a GitHub
Actions publishing half.

- **Authoring (local `/release`):** from a clean, synchronized `develop`,
  `/release` proposes a version — on a tagged repository with
  `git cliff --bumped-version`; on a tagless (first) release, it asks the
  human for a validated initial version, because git-cliff cannot compute
  a bump without a prior tag — confirms it with the human, creates
  `release/X.Y.Z` via `new-branch.sh`, writes the git-cliff changelog,
  and commits it signed.
  It creates no tag, Release, or PR; it prints the human-run push and
  release-PR commands.
- **Publishing (`.github/workflows/release.yml`):** triggered only by a
  closed `pull_request` event against `main` whose `merged` field is
  true, whose head ref starts with `release/`, and whose head repository
  is the same repository (`head.repo.full_name == github.repository`).
  Fork PRs and non-release PRs cannot run the publishing job.
- **Immutable target:** publication uses the event's
  `merge_commit_sha`. The workflow validates it as 40 lowercase hex
  characters, checks out exactly that commit, verifies `HEAD` equals it,
  and fails otherwise.
- **Version grammar:** the branch-derived version must match exactly
  `^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$` — no leading `v`, an
  optional prerelease, no build metadata. The value is validated before
  it is written to `GITHUB_ENV`; the tag adds the `v` prefix.
- **Notes source:** release notes are the sole `## [X.Y.Z]` section of
  the committed, reviewed `CHANGELOG.md`. The workflow requires exactly
  one matching section with a non-empty body; missing, duplicate, or
  empty sections fail the run. CI runs no git-cliff and installs
  nothing.
- **Unsigned CI tags, signed commits:** the release commit remains
  signed by the human-approved signing identity. The tag and Release
  created by CI are unsigned — Actions runners hold no private signing
  key. This narrows ADR-0044's manual signed-tag clause to this workflow
  only.
- **Runner and permissions:** the job runs on `ubuntu-latest` with a
  10-minute timeout, no `sudo`, no workflow-time dependency
  installation, `persist-credentials: false`, and exactly
  `contents: write` plus `pull-requests: write` job permissions
  (ADR-0035). Actions are SHA-pinned with version comments. The
  `GITHUB_TOKEN` is the only credential.
- **Publication states:** four explicit states are handled: neither tag
  nor Release exists → publish via
  `gh release create vX.Y.Z --target <merge-sha> --title vX.Y.Z
  --notes-file notes.md`; both exist and the tag resolves to the merge
  SHA → skip only the publish call and continue; both exist but the tag
  resolves elsewhere → fail; exactly one exists → fail with recovery
  guidance. A 404 from the Release probe counts as absent; every other
  `gh` error is fatal.
- **Concurrency:** the workflow group is `release-<head ref>` with
  `cancel-in-progress: false`, so a rerun never cancels an in-flight
  publication.
- **Back-merge:** after publication handling, the workflow opens — but
  never merges and never pushes — the `main` → `develop` PR via
  `gh pr create --base develop --head main`, skipping when
  `develop...main` has no ahead commits or an open PR already exists.
  All unexpected `gh` errors are fatal; no `|| true` or
  `continue-on-error` masks them.
- **Token-created PR events:** PRs opened with `GITHUB_TOKEN` receive no
  PAT or GitHub App workaround to make them emit further `pull_request`
  workflow runs. Human review and merge-time protected-push checks
  remain the control.
- **Hotfixes:** deferred. `hotfix/*` has no version in its branch name
  and needs a separate changelog/version design.
- **Supersession:** ADR-0044 lines 132–137 are partially superseded:
  release branches originate from `develop` (not `main`), and local
  signed-tag plus manual publication are replaced by CI publication at
  the merge SHA. ADR-0044's PR-only integration model, human-only
  merges, protected-ref enforcement, and the initial-root exception
  remain in force.

## Consequences

- Releases become reproducible from the repository alone: same merge
  SHA, same changelog section, same tag name.
- Idempotent reruns succeed only in the fully-published/same-target
  state; any partial state requires human recovery.
- Unsigned release tags are a visible provenance change; the signed
  release commit remains the authenticity anchor.
- The back-merge PR is human-reviewed and human-merged; CI's
  `pull-requests: write` scope is limited to opening it.
- No new Composer, npm, Actions marketplace, or operating-system
  dependency is introduced; `gh` ships with the runner.
- Drift guards (`tests/Shell/release_workflow_test.sh`) pin the
  security-critical workflow surface, following the ADR-0025 parity
  principle.
- Agents still cannot push branches or tags and never merge PRs; the
  workflow's tag/Release creation is the sole exception to
  human-performed publication.

## Alternatives Considered

### Keeping the manual local ritual (status quo)

Rejected. It requires an agent session at release time, grants the
agent tag-push rights, and can silently diverge the tag, Release, and
changelog from the reviewed merge.

### A GitHub App or PAT to make token-created PRs emit workflows

Rejected. The event suppression is intentional GitHub behavior; a
second credential would widen the attack surface and reintroduce secret
handling for zero control gain.

### CI pushing the back-merge branch or merging the PR

Rejected. A workflow that pushes branches or merges PRs would
circumvent ADR-0044's human-merge control from inside the trusted
pipeline. Opening the PR keeps review and merge with the human.

### Tagging at the branch tip instead of the merge SHA

Rejected. Branch tips are mutable and can move after review; the merge
SHA is immutable and already provenance-verified by the `pull_request`
event.
