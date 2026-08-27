# Contributing

Prism accepts bug reports, feature proposals, documentation fixes, tests, and
code changes through GitHub issues and pull requests.

## Prerequisites

Before contributing, install:

- Git;
- Node.js 22.19 or newer and npm;
- pi;
- Semgrep and OpenCodeReview (`ocr`) in the compatible ranges shown by
  `prism-tool doctor --local-only`;
- PHP 8.5, Composer, PCOV, and the PHP/web development tools when changing the
  adapter;
- Gitleaks and Shellcheck for local hook parity.

Install dependencies from the committed lockfiles. Do not update dependencies
or access a registry without the approval required by the active workflow.

Resolve the Core scripts directory, retain the printed absolute path, then run
its `install-hooks.sh` in a later command. The hooks enforce staged linting,
Markdown structure, secret scanning, RCS headers, commit messages, branch
policy, and push safety.

## Issues and design

Search existing issues before opening a new one. Public bugs and features use
[GitHub Issues](https://github.com/kyaulabs/prism/issues). Send vulnerabilities
privately according to [SECURITY.md](SECURITY.md).

Behavior changes start with an approved design and specification. Cross-cutting
work also runs the read-only `architect` skill and records an ADR when required.
Bugs use the `debug` workflow before implementation. Documentation-only and
other zero-behavior-delta changes may use the fast path.

Issue type and Progress fields follow
[`docs/agents/labels.md`](docs/agents/labels.md).

## Branches and Git Flow

`main` and `develop` are protected and PR-only. Do not commit or push directly
to either branch.

External contributors work from a fork. Internal contributors work on a branch
in the main repository. Start ordinary work from `develop`; hotfixes start from
`main`. Release branches are created by `/release`.

Resolve the scripts directory first. In a later command, run:

```bash
bash /absolute/resolved/scripts/new-branch.sh TYPE DESCRIPTION
```

Ordinary work branches use
`<type>/<username>-<hash>-<description>`. Allowed types match the Conventional
Commits vocabulary. Release branches use `release/<semver>`; hotfix branches
use `hotfix/<username>-<hash>-<description>`.

## Implementation and verification

New code follows Red, Green, Refactor:

1. Write a test through a public interface.
2. Confirm the test fails for the expected reason.
3. Implement the smallest passing change.
4. Refactor while the tests remain green.
5. Run focused and applicable full suites.
6. Apply `verification-before-completion`.

The PHP/web adapter requires at least 80% line coverage on changed PHP files.
Run frontend accessibility and visual-review gates when rendered behavior
changes.

Before branch completion, run `/check`. It verifies readiness, repository
state, Markdown, harness structure, debug artifacts, and the active adapter's
lint, tests, coverage, and syntax checks.

## Commits

Stage only the intended files. Create each ordinary signed commit with
`prism-tool commit create` as the only tool call in its assistant batch:

```bash
prism-tool commit create --type fix --scope example --subject "correct verified behavior"
```

The launcher owns `Implemented-by:`, `Tested-by:`, and `Signed-off-by:` in that
order. It validates the message, runs hooks, signs the commit, and verifies
`HEAD`. Do not write attribution trailers manually. A failed or non-exclusive
attempt requires `/reload`.

Merge and revert commits use Git-generated messages and are exempt from the
ordinary attribution trailer contract. GitHub web edits cannot satisfy signed
commit policy and should not be used for contributions.

## Finalization and review

Use `finishing-a-development-branch` after implementation. One finalization acceptance authorizes cleanup, target synchronization, and `/check`.
It also authorizes one complete initial review across all four axes, SHA
revalidation, and preparation-only `/pr`.

After a Blocking repair, fresh acceptance reviews only the continuous repair
delta when the chain remains valid. Advisory findings remain visible and do
not block pull-request preparation. Base or history changes, incomplete axes,
discontinuity, a dirty tree, or a mismatched `HEAD` require a new complete
initial review.

Humans push work branches and merge pull requests. `/pr` prints the final
GitHub CLI command but never pushes or creates the pull request.

## Releases

`/release` prepares a signed release commit and release-branch pull request to
`main`. After merge, CI creates the repository tag and GitHub Release, reconciles
configured package tags, and opens the `main` to `develop` back-merge pull
request. A maintainer reviews and merges that pull request.

Agents do not push branches, create tags, publish GitHub Releases, merge pull
requests, or publish npm packages. Follow [NPM.md](NPM.md) for the human npm
publication steps.

## Licensing

Contributions are accepted under the same
[AGPL-3.0-only license](LICENSE) as the repository. Do not submit a pull request
if you cannot license your contribution on those terms. Preserve applicable
copyright and NOTICE attribution.
