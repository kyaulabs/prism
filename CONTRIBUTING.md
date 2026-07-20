# Contributing

Thanks for taking an interest in this project. We want to make contributing to this project as easy and transparent as possible, whether it is:

* Reporting a bug
* Discussing the current state of the code
* Submitting a fix
* Proposing new features
* Becoming a maintainer

## We Develop with Github

We use Github to host code, to track issues and feature requests, as well as accept pull requests. Discussion and general support is typically done through Discord.

## We Use [Git Flow](https://www.gitkraken.com/learn/git/git-flow)

<div align="center" style="background:#0d1117"><img src=".github/media/git-flow.svg" width="240" height="365" style="margin-bottom:2ch" /></div>

All code changes happen through pull requests and are the best way to propose changes to the codebase. We actively welcome your pull requests:

1. Fork the repo. From the `develop` branch, create a feature branch:
   ```bash
   bash .github/scripts/new-branch.sh <type> <description>
   ```
   The helper resolves your username, generates the hash via `openssl rand -hex 2`,
   and creates the branch off `develop` (or `main` for hotfixes). See ADR-0028
   for the full naming convention.

   Allowed `<type>` values: `feat`, `fix`, `patch`, `docs`, `style`, `refactor`,
   `perf`, `test`, `build`, `ci`, `chore`, `revert`, plus `hotfix` and `release`.
2. If you have added code that should be tested, add tests.
3. If you have changed APIs, update the documentation.
4. Ensure it passes whatever tests are being used.
5. Make sure your code lints.
6. Issue the pull request!

## Commit Message Policy

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/)
format, enforced by [commitlint](https://commitlint.js.org/) via the
`.github/hooks/commit-msg` hook and in CI on every pull request.

**Required trailers** (every non-merge, non-revert commit):

- `Plan-by:` — the planning model (from `agent.plan.model` in `opencode.json`)
- `Acked-by:` — the build model (from `agent.build.model`, falling back to `model`)
- `Signed-off-by:` — the human approver, resolved dynamically via
  `bash .github/scripts/resolve-identity.sh` (3-tier fallback per ADR-0029:
  `~/.config/opencode/setup.json` → `.opencode/setup.json` → `git config`).
  Ships as `kyau <git@kyaulabs.com>` until a user runs `/setup`.

**Exemptions:**

- **Merge commits** (`git merge --no-ff`) and **revert commits** (`git revert`)
  are exempt from trailer enforcement — their messages are auto-generated and
  cannot carry trailers.
- **GitHub web-UI commits** (editing files on github.com) cannot add trailers or
  sign commits, and are therefore out-of-policy. Use a local clone with signed
  commits for all contributions.

**Local hook behavior:** if `commitlint` is not installed (fresh clone without
`npm install`), the `commit-msg` hook skips with a visible notice rather than
blocking the commit. CI enforces the policy on every PR commit, so skipping
locally is safe — malformed commits are caught upstream.

## Reporting Bugs / Feature Requests

We use Github issues to track public bugs and feature requests. Report a bug/feature by [opening a new issue](/../../issues); it is that easy!

## Contributions & Software Licensing

In short, when you submit code changes, your submissions are understood to be under the same [license](LICENSE) that covers the project itself. If you have a concern about this, please refrain from submitting a PR and contact a maintainer directly.
