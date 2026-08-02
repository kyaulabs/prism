# Spec: Conventional Pull Request Preparation Command

**Date:** 2026-07-31
**Status:** Approved
**Issue:** kyaulabs/prism #280 (Type: Feature)

## Problem Statement

Prism requires all integration into `develop` and `main` to pass through a
human-reviewed pull request, but its branch-completion workflow leaves pull
request preparation as a manual prompt-writing ritual. The current
`finishing-a-development-branch` skill provides only general title/body
guidance and prepares a `gh pr create --title-file` invocation even though
`gh pr create` has no `--title-file` option.

The missing automation makes the pull request title, template coverage,
verification evidence, and ADR trail inconsistent. It also creates pressure
to interpolate branch or commit text into shell commands even though repository
and GitHub-derived text is untrusted data.

## Solution

Add a prompt-native `/pr` command at `.opencode/commands/pr.md`. The command
runs as `agent: build`, validates that the current work branch is ready for a
pull request, derives a Conventional-Commits title from the branch family and
the branch's commits, fills every section of
`.github/PULL_REQUEST_TEMPLATE.md` from repository and current-session
evidence, and displays the raw title, raw body, and exact `gh pr create`
command.

`/pr` is preparation-only. It may create temporary title, validation, and body
files, but it never pushes, executes `gh pr create`, opens, merges, or modifies
a pull request. The human remains responsible for publishing the work branch,
running the displayed command, reviewing the pull request, and merging it.

The `finishing-a-development-branch` skill delegates its "Open a pull
request" option to `/pr` instead of carrying a second title/body procedure.
This keeps the branch-completion checklist as the readiness boundary and makes
`/pr` the single pull-request preparation procedure.

## User Stories

1. As a Prism user, I want one command to prepare a conventional pull request
   title and complete body so that I do not repeat a fragile manual prompt.
2. As a reviewer, I want every pull request template section populated in the
   source template's order so that the integration record is consistent.
3. As a reviewer, I want verification claims copied only from successful
   `/check` and `@code-review` results visible in the current session so that
   the pull request never fabricates a passing gate.
4. As a maintainer, I want invalid branch state rejected before generation so
   that `/pr` cannot prepare a misleading pull request from a protected,
   detached, dirty, or empty work branch.
5. As a maintainer, I want the generated title checked by the repository's
   commitlint configuration so that pull request titles follow the same header
   grammar as commits.
6. As a security-conscious user, I want branch names, commit messages, plans,
   diffs, ADR text, and tool output handled as inert data so that pull request
   preparation cannot execute content from repository history.
7. As a human integrator, I want the exact safe `gh pr create` command
   displayed but not run so that publishing remains an explicit human action.
8. As a harness maintainer, I want drift tests coupling `/pr` to the pull
   request template and finishing skill so that future edits cannot silently
   bypass the procedure.

## Architecture

The feature is a single prompt-native OpenCode command plus contract tests and
workflow documentation. No executable PR-preparation script or new skill is
introduced. This is intentional: git state is machine-readable, while
`/check` and `@code-review` evidence currently exists only in the active
conversation. A build-agent command can combine both without inventing a new
persistence format.

The command is a deep orchestration boundary with one user-facing operation:
prepare a pull request. Internally it performs five stages:

1. fail-closed readiness preflight;
2. repository and session evidence collection;
3. title and body synthesis;
4. mechanical title and body validation; and
5. inert output preparation.

The command follows the custom-command contract documented in the vendored
OpenCode `commands.mdx`: Markdown command file, `description` plus
`agent: build` frontmatter, and a prompt body executed in the project root.
It does not add agent model or variant configuration. ADR-0022 therefore
remains unchanged.

## Readiness Preflight

`/pr` performs the following checks in order and stops at the first failure:

1. Resolve the current branch with `git symbolic-ref --quiet --short HEAD`.
   Failure means detached HEAD and blocks preparation.
2. Run `bash .github/scripts/validate-branch-name.sh "$BRANCH"`. Protected
   branches and names outside ADR-0028's work-branch families block
   preparation.
3. Require `git status --porcelain` to be empty. Staged, unstaged, and
   untracked changes all block preparation.
4. Derive `TARGET_BRANCH`: `main` for `hotfix/*` and `release/*`; `develop`
   for all standard work-branch prefixes. This is the PR target contract from
   ADR-0044, not ADR-0028's branch-creation base for release branches.
5. Require the synchronized remote-tracking ref
   `BASE_REF="origin/$TARGET_BRANCH"` to resolve to a commit, then compute
   `BASE_SHA=$(git rev-parse "$BASE_REF")` and
   `MERGE_BASE=$(git merge-base "$BASE_REF" HEAD)`. `/pr` does not compare
   against a potentially stale local target branch.
6. Require at least one commit in `"$MERGE_BASE"..HEAD` using
   `git rev-list --count`, at least one non-merge commit using
   `git rev-list --count --no-merges`, and a non-empty net diff using
   `git diff --quiet "$MERGE_BASE"..HEAD`. A zero, merge-only, or net-empty
   range blocks preparation.
7. Require the active session to contain a branch-completion gate attestation
   naming the exact `BRANCH`, `HEAD_SHA`, `BASE_REF`, and `BASE_SHA`. The
   finishing skill emits this attestation after fetching and synchronizing,
   deleting and committing the in-flight plan/spec artifacts, and confirming
   a clean tree. Current git values must match all four attested values.
8. Require an unambiguous successful `/check` result recorded after that
   attestation and before any repository mutation. Missing, stale, partial, or
   failed evidence blocks preparation and instructs the human to rerun the
   finishing gate sequence.
 9. Require a `@code-review` result recorded after `/check` for the same
    attested range. All four review axes must have run, and the report must
    contain no Blocking finding. Suggested findings are acceptable when the
    affected code was fixed and its suites re-verified green, or when the
    human explicitly waives them in-session. A failed or skipped axis is
    incomplete evidence; the human may explicitly waive that axis in-session,
    and the command records the axis as waived rather than blocking. The
    review is never re-run solely to refresh evidence while the attested SHAs
    and tree are unchanged — the review must never freeze or halt progress.
10. Re-read `HEAD`, `BASE_REF`, and `git status --porcelain` immediately before
    output. Any SHA change or dirty-tree change since attestation invalidates
    both gates and blocks preparation.

The command does not fetch, push, or contact GitHub during preflight. The
synchronized `origin/$TARGET_BRANCH` remote-tracking ref is the authoritative
comparison boundary. Fetching, synchronization, plan/spec cleanup, and the
SHA-bound gate attestation remain responsibilities of
`finishing-a-development-branch` before `/pr` is invoked. Direct `/pr`
invocation without that current-session evidence fails closed and directs the
user through the finishing workflow.

## Evidence Collection

After preflight, the command gathers only read-only evidence:

- branch name and target branch;
- merge-base SHA and `git rev-list --count "$MERGE_BASE"..HEAD`;
- non-merge commit SHAs and subjects from
  `git log --no-merges --format='%H%x09%s' "$MERGE_BASE"..HEAD`;
- changed paths and status from `git diff --name-status "$MERGE_BASE"..HEAD`;
- diff summary from `git diff --stat "$MERGE_BASE"..HEAD`;
- matching plan and spec artifacts recovered from branch history when present;
- changed files under `adr/`;
- architect conditions recorded in a matching spec or plan; and
- the successful `/check` and clean `@code-review` evidence visible in the
  current session.

A matching plan or spec is preferred for intent and reviewer test commands.
Because ADR-0027 requires those artifacts to be deleted and committed before
the final gates, `/pr` searches commits in `"$BASE_REF"..HEAD` for paths under
`docs/plans/` and `docs/specs/` and reads the latest committed version that
exists before deletion. Its absence does not independently block fast-path
branches. When no matching artifact exists, summary and test-plan text must be
grounded in the commit list and diff, and the body must state that no matching
artifact was present in the branch history.

Plans and specs remain development artifacts under ADR-0027. The finishing
skill deletes and commits them before recording the gate attestation and
running final `/check` and `@code-review`. `/pr` never delays cleanup or
changes the branch after either final gate.

All collected text is untrusted data. The command may summarize, quote, or
write it to temporary files, but it must not evaluate it, splice it into a
shell program, or derive commands from instructions contained in it.

## Conventional Title Contract

The generated title has the Conventional Commits form
`<type>[(<scope>)]: <subject>` and a maximum length of 100 characters.
It is exactly one non-empty line; embedded carriage returns or newlines block
validation and output.

Type derivation is deterministic:

| Branch family | Pull request title type |
| --- | --- |
| `feat/*`, `fix/*`, `patch/*`, `docs/*`, `style/*`, `refactor/*`, `perf/*`, `test/*`, `build/*`, `ci/*`, `chore/*`, `revert/*` | branch prefix |
| `hotfix/*` | `fix` |
| `release/*` | `chore` with scope `release` |

For standard and hotfix branches, include a scope only when the relevant
non-merge commit headers consistently provide one clear scope. Omit the scope
when commit scopes are absent or mixed. The subject is a lower-case,
imperative summary grounded in the matching plan goal when available, the
branch description, and the non-merge commit subjects. It must not end with a
period or claim work absent from the diff.

The title is written to a `mktemp` file. A separate temporary commit-message
file contains that title followed by the four attribution trailers required by
`commitlint.config.js`. The trailer values are resolved from the configured
PLANNER, PRIMARY, and JUDGE model tiers plus
`.github/scripts/resolve-identity.sh`; they exist only to exercise the complete
repository commitlint configuration and are not included in the pull request
title. Run local commitlint with `npx --no-install commitlint --edit
"$VALIDATION_FILE"`. Missing commitlint, missing attribution inputs, or any
lint failure blocks output. The command requires and invokes the repository's
existing `./node_modules/.bin/commitlint --edit "$VALIDATION_FILE"` executable;
it never invokes `npx` fallback installation or installs dependencies.

## Pull Request Body Contract

The body preserves every `## ` section from
`.github/PULL_REQUEST_TEMPLATE.md`, in the same order:

1. `## 📋 Summary`
2. `## 📦 Changes by Phase`
3. `## 📜 ADRs`
4. `## ✅ Verification`
5. `## 🏗️ Architect Conditions (if applicable)`
6. `## 📝 Commits (<# total>)`, with `<# total>` replaced by the observed
   non-merge commit count
7. `## 🧪 Test Plan`

Section sources are fixed:

| Section | Required source |
| --- | --- |
| Summary | matching plan/spec intent, corroborated by commit list and diff; otherwise commit list and diff |
| Changes by Phase | `git diff --name-status`, diff stat, and matching plan task grouping when present |
| ADRs | changed `adr/` paths and their status in the diff; explicit `No ADR changes` when none changed |
| Verification | exact successful `/check` and clean `@code-review` evidence visible in the current session |
| Architect Conditions | conditions from matching artifacts plus how the diff addresses them; explicit `No architect conditions recorded` when none exist |
| Commits | observed non-merge commit count, abbreviated SHAs, and subjects |
| Test Plan | concrete reviewer commands from the matching plan and observed changed test surfaces; otherwise concrete commands justified by the diff |

No section may be deleted. The body must not copy template comments or leave
angle-bracket placeholders. It must not report `PASS`, `clean`, a test count,
coverage result, signature status, or architect condition unless that fact is
present in collected evidence.

## Safe Output Contract

Set `umask 077`, use a private temporary directory created by `mktemp -d`, and
retain it long enough for the human to run the displayed command. Store the
title, synthetic validation message, and body as separate files. Temporary
paths are generated locally and are not derived from repository text.

Never interpolate generated or collected text into shell source. If a shell
heredoc is used to materialize a payload, generate a fresh random literal
delimiter for that write, verify no payload line equals it, quote the literal
delimiter, and fail instead of writing when uniqueness cannot be established.
The contract test exercises newlines, delimiter-like text, `$()`, backticks,
quotes, and leading hyphens. The displayed `gh` command receives payload only
through quoted variable expansion and the body file.

The final response contains:

1. the validated title;
2. the complete raw Markdown body in a fenced code block;
3. the retained temporary file paths; and
4. an exact shell block equivalent to:

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
TITLE=$(cat "$TITLE_FILE")
gh pr create --repo "$REPO" --base "$TARGET_BRANCH" --head "$BRANCH" \
    --title "$TITLE" --body-file "$BODY_FILE"
```

The displayed block first assigns concrete quoted values to `TITLE_FILE`,
`BODY_FILE`, `TARGET_BRANCH`, and `BRANCH`. The command must explicitly say
that the block is for the human to run after publishing the work branch.
`/pr` stops without executing any line in the displayed block. It never emits
or invokes `--title-file`.

## Integration with Branch Completion

`finishing-a-development-branch` retains ownership of synchronization and the
pre-completion checklist. Its PR option changes from a hand-written title/body
recipe to an instruction to run the `/pr` procedure. The skill must not retain
another `gh pr create` recipe or any `--title-file` reference.

The skill continues to forbid agent push, direct protected-branch integration,
automatic merge, force-push, and squash. It deletes and commits plan/spec
artifacts before synchronization and the final gates, records the exact
branch/HEAD/base attestation after synchronization, then runs `/check` and all
four `@code-review` axes before offering `/pr`.

ADR-0028 continues to create `release/*` branches from `develop`; `/pr` does
not change branch origin. ADR-0044 independently requires the completed
release branch to target `main`. The `/release` command's release and
back-merge procedures are an explicit exception to `/pr` and remain out of
scope. `/pr` is the single preparation procedure only for the ordinary
`finishing-a-development-branch` workflow.

## Testing Decisions

The primary seam is a shell command-contract test at
`tests/Shell/pr_command_test.sh`. It inspects the command and delegated skill
as data rather than invoking an LLM.

The test covers:

- `.opencode/commands/pr.md` existence and `agent: build` frontmatter;
- detached, protected/invalid, dirty, missing-base-ref, no-ahead, merge-only,
  and net-empty preflight behavior;
- ADR-0044 target-branch derivation;
- SHA/range-bound, fail-closed `/check` and four-axis `@code-review` evidence
  rules;
- review-gate anti-freeze rules: retry-once, axis continuation with per-axis
  status, and in-session human waiver for a failed/skipped axis or unresolved
  Suggested findings;
- merge-base commit/diff evidence collection;
- title-type mapping and local commitlint validation with four trailers;
- template-heading parity and order between the source template and command;
- explicit no-placeholder and no-fabricated-evidence rules;
- `mktemp`, `TITLE=$(cat ...)`, `--title "$TITLE"`, and `--body-file` safety
  patterns;
- preparation-only output and absence of `--title-file` throughout
  `.opencode/`;
- `/pr` delegation from `finishing-a-development-branch` with no hand-written
  PR recipe; and
- `/pr` registration in the `AGENTS.md` and `README.md` command tables.

The test includes mutation proofs: adding a template heading to a temporary
copy must make heading parity fail, removing `/pr` from a temporary finishing
skill must make delegation validation fail, and adding `--title-file` to a
temporary command tree must make the obsolete-flag guard fail.

Existing `tests/Shell/skill_shell_injection_test.sh` is updated to assert the
supported PR-title pattern rather than preserving the current nonexistent
flag. Existing `tests/Shell/protected_branch_workflow_docs_test.sh`,
`tests/Shell/command_portability_test.sh`, and
`.github/scripts/validate-harness.sh` remain project-wide regression gates.
All implementation follows Red → Green → Refactor through `@tdd`.

The mechanical preflight is a self-contained Bash block inside `pr.md`, marked
with stable extraction sentinels. `pr_command_test.sh` extracts and executes
that exact block in disposable git repositories. This provides behavioral
coverage without introducing a separate production helper. Fixture cases
cover standard, hotfix, release, detached, protected, invalid, dirty,
missing-base-ref, zero-ahead, merge-only, net-empty, and malicious commit
subjects. Session-evidence interpretation and prose synthesis remain
prompt-native and are protected by the static contract assertions.

## Documentation

- Add `/pr` to the command table in `AGENTS.md`.
- Add `/pr` to the slash-command table in `README.md`.
- Update the README `gh` tooling description to distinguish preparation-only
  `/pr` output from human execution.
- Add `/pr` to the command reference in `CODING_HARNESS.md`, as required by
  the harness command-authoring convention.
- Keep `.github/PULL_REQUEST_TEMPLATE.md` unchanged as the read-only source of
  truth for body section headings.
- Do not add a new glossary term to `CONTEXT.md`; pull requests, commands,
  protected branches, and verification gates are existing project language.

## Out of Scope

- Executing `gh pr create`, `git push`, merge, or any GitHub mutation.
- Persisting `/check` or `@code-review` results outside the active session.
- Adding a PR-preparation shell script, skill, plugin, dependency, or external
  service.
- Fetching remote branches or synchronizing the work branch; the finishing
  skill owns synchronization.
- Creating, editing, or enforcing GitHub rulesets.
- Changing the `/release` command's release and back-merge PR procedures;
  those are the documented exception to the ordinary finishing workflow.
- Changing the pull request template's headings or content.
- Changing branch naming, commitlint rules, or required commit trailers.

## Acceptance Criteria

1. `/pr` rejects detached HEAD, protected or invalid branches, a dirty tree, a
   missing `origin/$TARGET_BRANCH` ref, and zero-ahead, merge-only, or net-empty
   branch ranges.
2. `/pr` targets `main` for `hotfix/*` and `release/*`, and `develop` for all
   standard ADR-0028 work branches.
3. `/pr` refuses to generate output unless successful `/check` and four-axis
   `@code-review` evidence are bound in the active session to the exact
   current branch, HEAD SHA, base ref, and base SHA. The review report must
   contain no Blocking finding; Suggested findings count as resolved when
   fixed and re-verified or explicitly waived, and a failed or skipped axis
   may be explicitly waived by the human in-session.
4. `/pr` produces a commitlint-passing conventional title grounded in the
   branch family and non-merge commit history.
5. `/pr` produces every pull request template section in source order, with no
   template placeholder, deleted section, or unsupported verification claim.
6. `/pr` displays raw Markdown and a safe `gh pr create` command using a title
   read from a temporary file through `--title` and a body supplied through
   `--body-file`.
7. `/pr` does not execute `gh pr create`, push, or mutate GitHub.
8. `finishing-a-development-branch` delegates PR preparation to `/pr` and no
   `--title-file` reference remains under `.opencode/`.
9. The command-contract test proves template-heading, delegation, and obsolete
   flag drift guards through mutations.
10. `/pr` is indexed in `AGENTS.md`, `README.md`, and `CODING_HARNESS.md`; the
    focused shell suites, `validate-harness.sh`, and `/check` pass.
11. The review gate never freezes progress: `@code-review` retries a
    transiently failing axis once, marks a persistently failing axis as
    failed and continues with the remaining axes, always returns a report
    with per-axis status, and `/pr` accepts an explicit in-session human
    waiver for a failed or skipped axis or for unresolved Suggested
    findings.

## Further Notes

- ADR-0017 governs command-only prompt features; `/pr` does not need user
  arguments or command-template shell-output injection.
- ADR-0022 keeps agent model and variant configuration in `opencode.jsonc`;
  this feature adds no subagent and changes no model assignment.
- ADR-0027 governs the in-flight plan/spec lifecycle and post-preparation
  cleanup.
- ADR-0028 supplies the canonical branch-name validator and prefix families.
- ADR-0040 supplies the attribution trailer vocabulary used by the synthetic
  commitlint message.
- ADR-0044 supplies target-branch routing and the human-controlled,
  merge-commit-only integration boundary.
- Architect review verdict: GO-WITH-CONDITIONS. This spec incorporates the
  conditions concerning ADR-0027 cleanup, exact range-bound evidence,
  `origin/$TARGET_BRANCH` comparison, release origin/target wording, the `/release`
  exception, behavioral preflight coverage, private temporary files, and the
  complete documentation index.
- ADR-required: none.
