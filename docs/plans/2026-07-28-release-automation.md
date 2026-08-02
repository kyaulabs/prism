# Release Automation — Branch-Based Releases, Auto-Tagging & GitHub Release Publication Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Make `/release` author a reviewed `release/X.Y.Z` pull request and
make GitHub Actions publish the matching tag and GitHub Release from the merged
changelog before opening a human-merged back-merge pull request.

**Architecture:** Split releases into a local, human-approved authoring half
and a GitHub Actions publishing half. `/release` computes and confirms the
version, creates `release/X.Y.Z` from synchronized `develop`, commits the
git-cliff changelog, and prints the human-run push/PR handoff. A new
`release.yml` reacts only to a merged, same-repository `release/X.Y.Z` PR into
`main`, validates all untrusted event/changelog data, publishes an unsigned
release tag plus GitHub Release at the recorded merge SHA, and opens—but never
merges—the `main` → `develop` back-merge PR.

**Tech Stack:** GitHub Actions YAML, `gh`, Git, git-cliff 2.0+, Bash 3.2+,
ShellCheck, actionlint when available, and the existing shell-test harness at
`tests/Shell/lib/test_helpers.sh`.

## Scope decisions (locked in)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Workflow trigger | `pull_request` `closed` against `main`, gated on `merged == true`, an exact `release/` head, and same-repository ownership | The version comes from a validated branch name; fork PR code and mutable branch tips are never executed. |
| Changelog generation | git-cliff runs locally inside `/release`; CI extracts the reviewed section from committed `CHANGELOG.md` | Release notes remain byte-for-byte aligned with reviewed repository content and CI gains no installer/checksum surface. |
| Publication | `gh release create vX.Y.Z --target <merge-sha> --title vX.Y.Z --notes-file notes.md` | One GitHub operation creates the lightweight tag and Release at the reviewed merge commit. |
| Tag signing | Release tags created by CI are unsigned; the release commit remains signed | Actions runners hold no private signing key. ADR-0046 narrows the human-signed-tag rule only for this workflow. |
| Back-merge | CI opens `main` → `develop`; a human reviews and merges it | The workflow never pushes a branch or merges a PR. |
| Bump proposal | `git cliff --bumped-version` proposes; the human confirms | `cliff.toml` is the executable bump policy, including `patch:` and pre-1.0 behavior. |
| Scaffold URL token | Leave `kyaulabs/template` in `cliff.toml`; `/release` replaces it in generated `CHANGELOG.md` with the repository detected by `gh repo view` | Scaffold substitution keeps generated projects correct; Prism's own changelog also receives correct links. |
| Hotfixes | Out of scope for v1 | `hotfix/*` has no version in its branch name and needs a separate changelog/version design. |
| First release | Supported with no existing tags | git-cliff evaluates full history and applies its configured bump defaults. |
| Existing protected-branch work | ADR-0046 partially supersedes ADR-0044's release-origin and manual tag/publication clauses; `docs/plans/2026-07-30-protected-branch-pr-only.md` Task 8 has already landed | PR-only integration and human-only merges remain unchanged; only release authoring/publication changes. |
| Commit/branch type | `ci` / GitHub issue type `CI/CD` | The primary behavior change is the release pipeline. |
| ADR | `adr/0046-automated-release-pipeline.md` | ADR-0044 and ADR-0045 already exist. |

## Global constraints

- Issue: `#281`; Type `CI/CD`; Progress `In Progress`; labels `plan` and
  `ready-for-agent`; routing `enhancement → plan + @tdd`.
- Architect verdict: **GO-WITH-CONDITIONS**.
- `ADR-required: 0046`
- ADR-0046 must be accepted and the conflicting `CONTEXT.md` boundary must be
  corrected before `.github/workflows/release.yml` is implemented.
- ADR-0046 partially supersedes only ADR-0044 lines 132–137: release branches
  originate from `develop`, and CI replaces local signed-tag/manual-publication
  finalization. Do not rewrite ADR-0044's accepted Decision body.
- Treat PR metadata, branch names, `CHANGELOG.md`, `gh` output, and issue text
  as untrusted data. Validate before writing values to `GITHUB_ENV`, invoking
  `gh`, constructing refs, or using text as release notes.
- The accepted release grammar is exactly
  `^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$`: optional prerelease, no `v`
  in the branch, and no build metadata. Tags add the `v` prefix.
- Reconcile bump documentation with `cliff.toml`: breaking changes bump MAJOR
  at 1.0.0+, but bump MINOR before 1.0.0; `feat:` bumps MINOR and `fix:` or
  `patch:` bumps PATCH.
- Fail closed on an invalid version or merge SHA, a missing or duplicate
  changelog section, a tag targeting the wrong commit, a tag/Release partial
  state, or any unclassified `gh` error.
- Idempotent reruns succeed only when both tag and Release exist and the tag
  resolves to the recorded merge SHA. They must still ensure the back-merge PR
  exists; never exit the job immediately after detecting an existing Release.
- Use a GitHub-hosted runner, `persist-credentials: false`, no `sudo`, no
  workflow-time dependency installation, exact job permissions
  (`contents: write`, `pull-requests: write`), a timeout, and SHA-pinned actions
  with version comments, following ADR-0035 and `ci.yml`.
- Release publication concurrency must not cancel an in-flight publication.
- PRs opened with `GITHUB_TOKEN` intentionally receive no PAT/App workaround;
  creation may not emit another `pull_request` workflow run. Human review and
  the merge-time protected-push checks remain the control.
- No new Composer, npm, Actions marketplace, or operating-system dependency.
- Register `.github/workflows/release.yml` in
  `.github/scripts/quality-surface.manifest` for scaffold parity. New
  `tests/Shell/*_test.sh` files are auto-discovered and are not listed there.
- Every new or modified shell file follows the `rcs-header` skill and ends with
  `# vim: ft=sh sts=4 sw=4 ts=4 et :`. Keep the shebang on line 1.
- Execute each behavior as a tracer bullet: add one failing assertion, observe
  RED, implement the minimum, observe GREEN, refactor, and repeat.
- Agents never push branches or tags and never merge PRs. Any external scratch
  repository rehearsal is a separate human-approved gate.
- After all tasks, run `verification-before-completion`, `/check`, and
  `@code-review` as separate gates.

Before any task commit, define this helper in the current shell so attribution
comes from the active Prism manifest rather than this plan:

```bash
commit_with_attribution() {
    local subject="$1" issue_footer="$2" message
    : "${OPENCODE_MODEL_PLANNER:?run direnv allow before committing}"
    : "${OPENCODE_MODEL_PRIMARY:?run direnv allow before committing}"
    : "${OPENCODE_MODEL_JUDGE:?run direnv allow before committing}"
    local authored_by="${OPENCODE_MODEL_PLANNER##*/}"
    local implemented_by="${OPENCODE_MODEL_PRIMARY##*/}"
    local tested_by="${OPENCODE_MODEL_JUDGE##*/}"
    local signed_off_by
    signed_off_by="$(bash .github/scripts/resolve-identity.sh)" || return 1
    printf -v message '%s\n\n%s\nAuthored-by: %s\nImplemented-by: %s\nTested-by: %s\nSigned-off-by: %s' \
        "$subject" "$issue_footer" "$authored_by" "$implemented_by" \
        "$tested_by" "$signed_off_by"
    git commit -S -m "$message"
}
```

---

## File map

### Create

- `adr/0046-automated-release-pipeline.md` — accepted authoring/publishing
  split, unsigned-CI-tag decision, rerun policy, and partial supersession of
  ADR-0044.
- `.github/workflows/release.yml` — validated, idempotent publishing and
  back-merge-PR workflow.
- `tests/Shell/release_workflow_test.sh` — static drift guard over the workflow
  and `/release` contract.

### Modify

- `CONTEXT.md` — authorize the narrow release workflow write boundary, list
  `release.yml` as owned CI, and index ADR-0046.
- `.github/scripts/quality-surface.manifest` — scaffold `release.yml`.
- `.opencode/commands/release.md` — local authoring half only.
- `.opencode/docs/versioning.md` — actual bump policy, RCS last-commit marker,
  two-half release flow, and unsigned release-tag exception.
- `tests/Shell/protected_branch_workflow_docs_test.sh` — replace obsolete
  human tag/publication assertions with the CI-published release contract.
- `tests/Shell/commit_template_footer_test.sh` — retain the footer check but
  remove the stale claim that `/release` creates a local signed tag.
- `CONTRIBUTING.md` — release PR, automated publication, back-merge, and
  hotfix-v1 exclusion.
- `AGENTS.md` — command summary, Git workflow exception, build permissions,
  owned workflow, and release boundary wording.
- `README.md` — `/release` row and changelog/release walkthrough.

### Deliberately unchanged

- `cliff.toml` — remains the scaffold template and executable bump policy;
  `/release` fixes generated repository links.
- `.github/scripts/new-branch.sh` — already accepts optional `v` input, strips
  it, and creates `release/X.Y.Z` from `develop`.
- `.github/scripts/validate-branch-name.sh` — already enforces the selected
  branch grammar.
- `adr/0044-pr-only-protected-branches.md` — retained as an immutable accepted
  record; ADR-0046 states the partial supersession.

---

### Task 1: Accept ADR-0046 and build the guarded publishing workflow

**Files:**
- Create: `adr/0046-automated-release-pipeline.md`
- Create: `.github/workflows/release.yml`
- Create: `tests/Shell/release_workflow_test.sh`
- Modify: `CONTEXT.md`
- Modify: `.github/scripts/quality-surface.manifest`

**Interfaces:**
- Consumes: merged-PR event fields
  `pull_request.merged`, `pull_request.head.ref`,
  `pull_request.head.repo.full_name`, and `pull_request.merge_commit_sha`;
  committed `CHANGELOG.md`; repository branches `main` and `develop`.
- Produces: tag `vX.Y.Z` at the merge SHA, GitHub Release `vX.Y.Z` whose body
  is exactly one matching changelog section, and at most one open
  `main` → `develop` back-merge PR.

- [ ] **Step 1: Record the architecture boundary before implementation**

  Write ADR-0046 in Nygard format with status `Accepted`. Its Decision must
  record:

  - local `/release` authoring from synchronized `develop`;
  - merged same-repo release-PR publication at the immutable merge SHA;
  - exact version grammar and reviewed-changelog notes source;
  - unsigned CI-created release tags with signed commits retained;
  - exact permissions and GitHub-hosted/fork-isolated runner posture;
  - no CI branch push or merge; only opening a back-merge PR;
  - both-exist/same-target rerun success, partial-state failure, and
    cancellation-disabled concurrency;
  - no PAT/GitHub App solely to make the token-created PR emit workflows;
  - hotfix automation deferred;
  - partial supersession of ADR-0044's release-origin and manual-finalization
    clauses while preserving PR-only integration and human-only merges.

  Update `CONTEXT.md` in the same step:

  - change the CI ownership bullet from only `ci.yml` to `ci.yml` plus
    `release.yml`;
  - change the no-push/merge non-goal so agents remain unable to push, humans
    push work branches and merge PRs, and only `release.yml` may create a
    validated release tag/Release and open a back-merge PR;
  - add ADR-0046 to Architectural Decisions.

- [ ] **Step 2: Write the failing workflow drift guard (Red)**

  Create `tests/Shell/release_workflow_test.sh` with the canonical harness:

  ```bash
  #!/usr/bin/env bash
  # RCS header is normalized by the pre-commit hook.

  set -euo pipefail

  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  # shellcheck source=tests/Shell/lib/test_helpers.sh
  source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
  setup_result_file
  ```

  Add independent `pass`/`fail` assertions for these invariants:

  1. `.github/workflows/release.yml` exists and is listed immediately after
     `ci.yml` in `.github/scripts/quality-surface.manifest`.
  2. The only trigger is `pull_request` `types: [closed]` on `branches: [main]`;
     there is no `push:` or `pull_request_target:` trigger.
  3. The job gate contains `merged == true`, `startsWith(..., 'release/')`,
     and `head.repo.full_name == github.repository`.
  4. `runs-on: ubuntu-latest`; no `sudo`; `timeout-minutes` exists.
  5. Job permissions contain exactly `contents: write` and
     `pull-requests: write`.
  6. Every `uses:` value has a 40-hex SHA plus a version comment; checkout uses
     `actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7`,
     the event merge SHA, `fetch-depth: 0`, and
     `persist-credentials: false`.
  7. The branch-derived version is checked against
     `^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$` before export.
  8. Notes extraction recognizes the real cliff.toml heading — the exact
     markdown label `[X.Y.Z]` anywhere in a `## ` line (the leading
     `[💾](.../releases/tag/vX)` link is not the version label) — captures the
     heading plus body up to the next `## ` heading, requires exactly one
     section, and fails when the body has no non-whitespace line.
  9. Rerun logic distinguishes neither/both/partial tag+Release states,
     probes the tag locally with `git rev-parse -q --verify
     refs/tags/vX^{commit}` (lightweight- and annotated-tag safe, no remote
     access), verifies an existing tag's commit equals the merge SHA, and does
     not exit before back-merge handling.
  10. Publication uses `gh release create` with `--target`, `--title`, and
      `--notes-file`; the workflow contains neither `git cliff` nor
      `git push` nor an auto-merge command.
  11. Back-merge handling first checks an existing open PR and the
      `develop...main` comparison, then uses
      `gh pr create --base develop --head main`; there is no `|| true` or
      `continue-on-error` masking API failures.
  12. Concurrency is release-specific and `cancel-in-progress: false`.

  End with `print_summary "release_workflow"` and the shell vim modeline.

- [ ] **Step 3: Run the new test and observe the intended failure**

  Run: `bash tests/Shell/release_workflow_test.sh`

  Expected: FAIL because `.github/workflows/release.yml` does not exist and is
  not in the quality-surface manifest.

- [ ] **Step 4: Implement the minimum fail-closed workflow (Green)**

  Create `.github/workflows/release.yml` with:

  - `pull_request` `closed`/`main` trigger;
  - concurrency key `release-${{ github.event.pull_request.head.ref }}` and
    `cancel-in-progress: false`;
  - one `publish` job using the complete merged/head/same-repo `if:` gate,
    `ubuntu-latest`, exact job permissions, and a 10-minute timeout;
  - job environment `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` plus event-derived
    `HEAD_REF` and `MERGE_SHA`;
  - pinned checkout v7 at `MERGE_SHA`, full history, and no persisted
    credentials;
  - a validation step that checks `MERGE_SHA` as 40 lowercase hex, strips only
    the leading `release/`, applies the exact version regex, verifies checked
    out `HEAD` equals `MERGE_SHA`, and only then appends `VERSION` to
    `$GITHUB_ENV`;
  - an extraction step that scans every `## ` heading and captures the sole
    heading whose line contains the exact markdown label `[$VERSION]` (the real
    cliff.toml heading is `## [💾](.../releases/tag/vX) [X](.../compare/...) -
    (date)`, so the label is matched anywhere in the heading, not just the
    first bracket group) through the line before the next `## ` heading,
    including the heading itself, fails unless the match count is exactly one,
    and fails when the section body has no non-whitespace line;
  - publication-state logic with four explicit states:
    - tag state probed locally via
      `git rev-parse -q --verify refs/tags/v$VERSION^{commit}`, which resolves
      both lightweight tags (what `gh release create` produces) and annotated
      tags from the full-depth checkout with no remote access;
    - neither tag nor Release: publish;
    - both exist and tag resolves to `MERGE_SHA`: skip only the publish call;
    - both exist but tag resolves elsewhere: fail;
    - exactly one exists: fail with recovery guidance;
  - 404 classified as absence when probing the Release; any other `gh api`
    failure is fatal;
  - `gh release create "v$VERSION" --target "$MERGE_SHA" --title
    "v$VERSION" --notes-file notes.md` only in the neither-exists state;
  - back-merge logic that skips when `develop...main` has zero commits or an
    open `--base develop --head main` PR already exists, otherwise opens the
    PR; all unexpected compare/list/create errors remain fatal.

  Add `.github/workflows/release.yml` after `.github/workflows/ci.yml` in
  `.github/scripts/quality-surface.manifest`.

- [ ] **Step 5: Verify Task 1 is green**

  Run:

  ```bash
  bash tests/Shell/release_workflow_test.sh
  shellcheck --severity=warning tests/Shell/release_workflow_test.sh
  bash .github/scripts/validate-harness.sh
  ```

  Expected: all PASS. If `actionlint` is installed, also run
  `actionlint .github/workflows/release.yml`; otherwise record the skipped tool
  for Task 4's manual YAML review.

- [ ] **Step 6: Commit the architecture and publishing slice**

  ```bash
  git add adr/0046-automated-release-pipeline.md CONTEXT.md \
      .github/workflows/release.yml \
      .github/scripts/quality-surface.manifest \
      tests/Shell/release_workflow_test.sh
  commit_with_attribution \
      "ci(release): publish merged release branches automatically" \
      "Refs: #281"
  ```

---

### Task 2: Rework `/release` into the local authoring half

**Files:**
- Modify: `tests/Shell/release_workflow_test.sh`
- Modify: `tests/Shell/protected_branch_workflow_docs_test.sh`
- Modify: `tests/Shell/commit_template_footer_test.sh`
- Modify: `.opencode/commands/release.md`
- Modify: `.opencode/docs/versioning.md`

**Interfaces:**
- Consumes: clean synchronized `develop`, git-cliff 2.0+, `cliff.toml`, the
  active repository identity from `gh repo view`, and human version approval.
- Produces: local `release/X.Y.Z`, generated `CHANGELOG.md`, signed
  `chore(release): vX.Y.Z`, and printed human-run push/PR commands. It creates
  no tag, Release, or back-merge PR.

- [ ] **Step 1: Extend the contract tests (Red)**

  Add assertions P13–P22 to `release_workflow_test.sh` requiring
  `.opencode/commands/release.md` to:

  - stop on a dirty tree, any branch other than `develop`, or a local
    `develop` SHA different from fetched `origin/develop`;
  - require git-cliff instead of claiming a manual fallback that cannot
    generate the changelog;
  - use `git cliff --bumped-version`, human confirmation, and
    `new-branch.sh release X.Y.Z` without `v` in the resulting branch;
  - run `git cliff --tag vX.Y.Z --output CHANGELOG.md`;
  - detect the repository via
    `gh repo view --json nameWithOwner -q .nameWithOwner` and replace surviving
    `kyaulabs/template` links through a portable temp-file + `mv` sequence, not
    GNU-only `sed -i`;
  - create a signed `chore(release): vX.Y.Z` commit with all four dynamically
    resolved ADR-0040 footers;
  - print, but never execute, `git push -u origin release/X.Y.Z` and
    `gh pr create --base main --head release/X.Y.Z`;
  - contain no `git tag -s`, `gh release create`, direct push to `main` or
    `develop`, or local back-merge-PR creation.

  In `protected_branch_workflow_docs_test.sh`, replace obsolete assertions
  3c–3e and 4c:

  - `/release` contains no local tag/publication/back-merge operation;
  - `release.yml` owns `gh release create` and
    `gh pr create --base develop --head main`;
  - humans push work branches and merge PRs, while the release workflow alone
    creates release tags.

  Keep the existing direct-protected-branch-push assertions. In
  `commit_template_footer_test.sh`, retain the four-footer assertion and the
  general `git tag*: ask` permission assertion, but remove the stale comment
  that `/release` itself creates a signed tag.

- [ ] **Step 2: Run the focused tests and observe RED**

  Run:

  ```bash
  bash tests/Shell/release_workflow_test.sh
  bash tests/Shell/protected_branch_workflow_docs_test.sh
  bash tests/Shell/commit_template_footer_test.sh
  ```

  Expected: release contract failures because the current command still has a
  post-merge local signed-tag, manual Release, and back-merge phase.

- [ ] **Step 3: Rewrite `.opencode/commands/release.md` (Green)**

  Preserve `agent: build` and replace the two-phase ritual with this ordered
  procedure:

  1. **Pre-flight:** require a clean staged and unstaged tree, branch
     `develop`, successful `git fetch origin develop --tags`, and exact
     equality of `HEAD` and `origin/develop`. Require `git-cliff`/`git cliff`
     2.0+ and direct a missing-tool user to `/doctor`; do not offer a fallback
     that cannot produce `CHANGELOG.md`.
  2. **Propose and confirm:** run `git cliff --bumped-version`, strip one
     optional leading `v`, validate the exact release regex, show the commit
     range/bump rationale, and ask the human to confirm `vX.Y.Z`. Stop when
     there are no releasable commits or confirmation is withheld.
  3. **Branch:** run
     `bash .github/scripts/new-branch.sh release X.Y.Z`.
  4. **Changelog:** run
     `git cliff --tag vX.Y.Z --output CHANGELOG.md`. If
     `kyaulabs/template` survives, obtain `OWNER/REPO` using `gh repo view`,
     write `sed` output to `mktemp`, atomically `mv` it over `CHANGELOG.md`,
     and show the generated version section for review.
  5. **Commit:** resolve planner/primary/judge model IDs from the current
     environment and `Signed-off-by` with `resolve-identity.sh`; present and,
     after the normal permission gate, create the signed
     `chore(release): vX.Y.Z` commit with footer `Refs: #281` when this issue is
     the tracked implementation.
  6. **Handoff only:** print the exact human-run branch push and
     `gh pr create --base main --head release/X.Y.Z` command. State that merge
     triggers `release.yml`, which creates the tag/Release and opens the
     back-merge PR for a human to merge. Stop.

  Delete the current post-merge PR-state PHP predicate, local tag, tag push,
  manual `gh release create`, local back-merge creation, and branch-cleanup
  phase; those are no longer command responsibilities.

- [ ] **Step 4: Reconcile `.opencode/docs/versioning.md`**

  Update it to match current facts:

  - pre-1.0 breaking changes bump MINOR; 1.0.0+ breaking changes bump MAJOR;
  - `feat:` bumps MINOR and `fix:`/`patch:` bump PATCH;
  - automated release identifiers allow optional prerelease but no build
    metadata;
  - changelog groups are the actual `cliff.toml` groups rather than the stale
    Keep-a-Changelog six-item list;
  - RCS headers are normalized last-commit markers under ADR-0041, not immutable
    creation stamps;
  - the release flow is authoring PR → human merge → CI-created unsigned tag
    and Release → CI-opened/human-merged back-merge PR.

- [ ] **Step 5: Verify Task 2 is green**

  Run:

  ```bash
  bash tests/Shell/release_workflow_test.sh
  bash tests/Shell/protected_branch_workflow_docs_test.sh
  bash tests/Shell/commit_template_footer_test.sh
  bash tests/Shell/command_portability_test.sh
  shellcheck --severity=warning tests/Shell/release_workflow_test.sh \
      tests/Shell/protected_branch_workflow_docs_test.sh \
      tests/Shell/commit_template_footer_test.sh
  ```

  Expected: all PASS and no manual publication instruction remains in
  `/release`.

- [ ] **Step 6: Commit the authoring slice**

  ```bash
  git add .opencode/commands/release.md .opencode/docs/versioning.md \
      tests/Shell/release_workflow_test.sh \
      tests/Shell/protected_branch_workflow_docs_test.sh \
      tests/Shell/commit_template_footer_test.sh
  commit_with_attribution \
      "docs(release): make the release command author pull requests" \
      "Refs: #281"
  ```

---

### Task 3: Align living release documentation

**Files:**
- Modify: `tests/Shell/protected_branch_workflow_docs_test.sh`
- Modify: `CONTRIBUTING.md`
- Modify: `AGENTS.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the ADR-0046 contract and implemented command/workflow behavior.
- Produces: one consistent operator-facing release narrative across living
  documentation and harness command indexes.

- [ ] **Step 1: Add documentation assertions (Red)**

  Extend `protected_branch_workflow_docs_test.sh` to require:

  - `CONTRIBUTING.md` describes `/release` → release PR → automatic tag and
    GitHub Release → human-merged back-merge PR, and states hotfix automation
    is deferred;
  - the `AGENTS.md` `/release` row says it prepares the git-cliff changelog and
    release PR while CI tags/publishes and opens the back-merge PR;
  - `AGENTS.md` distinguishes the release workflow's tag publication from the
    ban on agent pushes and automated merges;
  - the matching `README.md` command row and changelog walkthrough describe the
    same flow and contain no manual `git tag -s` or `gh release create`
    instruction.

- [ ] **Step 2: Run the documentation test and observe RED**

  Run: `bash tests/Shell/protected_branch_workflow_docs_test.sh`

  Expected: FAIL because the current command rows still describe a signed tag
  on the merged SHA and `CONTRIBUTING.md` has no release section.

- [ ] **Step 3: Update living documentation (Green)**

  - Add a concise Release section to `CONTRIBUTING.md` with the two halves,
    human responsibilities, and hotfix-v1 exclusion.
  - Change the `AGENTS.md` `/release` row to: “Prepare a git-cliff changelog and
    release-branch PR; CI tags, publishes the GitHub Release, and opens the
    back-merge PR.” Update nearby Git workflow, production boundary, and build
    permission wording so it no longer says humans always create release tags.
  - Apply the same command-row wording in `README.md`. Rewrite Changelog
    Generation so `/release` is the primary path and any low-level git-cliff
    example stops at a release branch PR rather than teaching manual
    publication.
  - Keep AGENTS/README command tables synchronized and do not add a new command.

- [ ] **Step 4: Verify documentation and harness parity**

  Run:

  ```bash
  bash tests/Shell/protected_branch_workflow_docs_test.sh
  bash .github/scripts/validate-harness.sh
  bash tests/Shell/validate-harness_test.sh
  ```

  Expected: all PASS.

- [ ] **Step 5: Commit the final implementation slice**

  ```bash
  git add CONTRIBUTING.md AGENTS.md README.md \
      tests/Shell/protected_branch_workflow_docs_test.sh
  commit_with_attribution \
      "docs(release): document automated release publication" \
      "Fixes: #281"
  ```

---

### Task 4: Verify release automation and rehearse external behavior

**Files:**
- Verify only; make no planned repository edits.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: local quality evidence plus a separately human-approved real-GitHub
  rehearsal record.

- [ ] **Step 1: Run focused and full shell verification**

  ```bash
  bash tests/Shell/release_workflow_test.sh
  bash tests/Shell/protected_branch_workflow_docs_test.sh
  bash tests/Shell/commit_template_footer_test.sh
  for test_file in tests/Shell/*_test.sh; do
      bash "$test_file"
  done
  ```

  Expected: every script PASS, including `ci_local_parity_test.sh`,
  `command_portability_test.sh`, and `validate-harness_test.sh`.

- [ ] **Step 2: Validate workflow syntax and repository gates**

  Run `actionlint .github/workflows/release.yml` when actionlint is installed;
  otherwise perform and record a careful YAML/expression review. Then run
  `/check` and the `verification-before-completion` skill.

  Expected: actionlint/manual review clean; `/check` green; no debug artifacts
  or untracked generated files.

- [ ] **Step 3: Prove the static drift guard detects mutation**

  In a temporary copy outside the tracked workflow, remove the
  `merged == true` term and point the test's workflow variable at that copy.
  Run `release_workflow_test.sh` and observe the matching gate assertion fail.
  Remove the temporary copy and rerun against the repository workflow.

  Expected: mutated copy FAIL; repository copy PASS; `git diff` contains no
  mutation artifact.

- [ ] **Step 4: Halt for approval before any real GitHub rehearsal**

  Present the repository/owner, exact scratch-repository mutations, temporary
  release version, and cleanup steps. Do not create a repository, push, merge,
  rerun, tag, publish, or delete anything until a human explicitly approves
  this separate external-mutation gate.

- [ ] **Step 5: After approval, run the end-to-end and negative rehearsal**

  In a scaffolded scratch repository:

  1. run `/release`, have the human push/open/merge the release PR, and verify
     `vX.Y.Z` targets the merge commit;
  2. verify the GitHub Release body equals the sole changelog section and the
     `main` → `develop` PR exists;
  3. rerun the workflow and verify no duplicate publication while back-merge
     handling remains successful;
  4. merge a non-release PR to `main` and verify the publish job skips;
  5. use `release/bogus` and verify version validation fails;
  6. use a valid release branch without the matching changelog section and
     verify extraction fails;
  7. simulate tag-only, Release-only, and wrong-target pre-existing states and
     verify all fail closed;
  8. verify a same-repo release succeeds and a fork release PR cannot run the
     publishing job.

  The human performs all pushes and merges. Clean up the scratch repository
  only under the same approval scope.

- [ ] **Step 6: Run final review gates**

  Inspect `git status --short` and `git diff develop...HEAD`, then invoke
  `@code-review`. Address findings through `receiving-code-review`; rerun the
  affected checks after every correction. The human alone pushes the branch.

## Self-review

- **Issue coverage:** Task 1 publishes a release safely and idempotently; Task
  2 authors the reviewed release PR; Task 3 aligns living documentation; Task
  4 proves local and real-GitHub behavior.
- **Architect conditions:** ADR-0046 precedes implementation; `CONTEXT.md`,
  scaffold manifest, protected-branch drift test, pre-1.0 bump policy, token
  event limitation, and ADR-0044 partial supersession are all covered.
- **Known corrections:** all planned ADR paths use 0046; the helper path is
  `tests/Shell/lib/test_helpers.sh`; the landed protected-branch plan is dated
  2026-07-30 and its release rewrite is Task 8, not Task 6.
- **Current-state drift:** the current `/release` already creates a release PR
  but retains a broken/manual post-merge phase; this plan removes that phase
  rather than assuming the entire command is pre-PR.
- **Placeholder scan:** no `TBD`, `TODO`, undefined implementation helper, or
  unnumbered ADR remains.
- **Dependency scan:** no dependency or lockfile change.
