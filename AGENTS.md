# Prism repository

Read `packages/prism-core/AGENTS.md` for the shared engineering defaults.
This checkout develops and dogfoods the harness itself.

## Active refactor

`docs/specs/lean-prism.md` records the approved breaking redesign and execution
checklist. The local replacement is implemented and verified; replacement
publication precedes hosted catalogue deletion. See `docs/catalogue-retirement.md`.
Historical ADRs document old designs, not current workflow requirements.

## Packages

- `packages/prism-core`: global, language-agnostic skills, prompts and extensions.
- `packages/prism-php-web`: project-local PHP/web skills and tooling. Keep this
  modular boundary so future stack modules can be ordinary Pi packages.
- `.pi/settings.json` loads both packages from this checkout for dogfooding.
  Editing an extension on disk does not replace an already loaded instance;
  reload or restart Pi to use the changed runtime.

## PHP/web heritage

This repository includes `aurora/` (a submodule), `backend/`, `cdn/` and PHP tests,
but is not a deployable application. There is no application webroot, root SQL
schema or nginx deployment configuration.

For PHP/web changes, load `php-web-stack` and the relevant module skills. The
stack is PHP 8.5+, MariaDB, nginx, SCSS/Dart Sass, vanilla JavaScript and Pest 5
on PHPUnit 13. RCS headers and vim modelines are module conventions. The approved
changed-file PHP coverage default is 90%, configurable with the gate's `--min`
option when project/user instructions specify a different threshold.

Never edit generated `cdn/css/*.min.css` or `cdn/javascript/*.min.js`. Build
assets from their SCSS/JavaScript sources when those sources change.

## Verification and Git

- Core JavaScript/TypeScript tests use Node's test runner under `tests/Node/`.
  Run focused tests during TDD and broader relevant suites before completion.
- PHP, shell, frontend and package checks live alongside their applicable
  tooling. Do not require every installed tool for an unrelated change.
- This checkout uses native `.github/hooks` with staged-path-first secret scanning
  and applicable lint. Hooks do not rewrite source or enforce workflow readiness.
- Use Conventional Commits with `Implemented-by` and `Signed-off-by` only.
  Follow Git signing configuration and commit verified logical changes.

## Automatic GitHub delivery — Prism development only

These standing instructions apply when developing `kyaulabs/prism` itself.
They must not be copied into global Core instructions, distributed skills or
consumer setup defaults. Downstream users authorize their own GitHub operations.

- Automatically push verified work, create PRs, review, merge and clean up merged
  task branches without asking for routine approval again. Follow Git-flow unless
  the user specifies a different flow. Respect repository protections; do not
  bypass reviews, failing checks or signing requirements.
- Use `kyau` for Git pushes and local commits, with its existing SSH/YubiKey/GPG
  setup and Git signing configuration. Do not change authentication or signing
  configuration or read credential values.
- Use `kyaulabs-bot` to create all PRs, merge PRs and delete merged task branches.
  Never delete `main`, `develop` or `release/X.Y.Z` branches. Preserve unrelated
  branches/work rather than assuming they are stale.
- Select the required GitHub account with `gh auth switch --user <account>` and
  verify its login before account-sensitive operations.
- After creating **each** PR, execute every item in its **Test Plan** against the
  current PR head and record the results. Fix concrete findings through TDD,
  repeat verification after changes and wait for passing CI before approval.
- Only then approve the PR review as `kyau`; switch to `kyaulabs-bot` to merge
  and delete its merged task branch. Do not reuse pre-PR testing as the entire
  post-creation Test Plan.
- After release merges to `main`, create the `main` → `develop` back-merge PR
  as `kyaulabs-bot` and follow the same Test Plan/review/merge sequence. The older
  `back-merge.yml` hosted workflow is disabled because its `GITHUB_TOKEN` creates
  PRs as `github-actions`, not the designated account. Do not silently re-enable it.
- `npm publish` requires manual intervention by the user. Prepare and verify
  packages and GitHub releases automatically, but leave registry publication to
  the user; never request registry tokens in chat or attempt login on their behalf.
- For catalogue retirement, verify both replacement packages are published before
  deleting `kyaulabs/prism-adapters`. Retire only dedicated catalogue infrastructure
  and preserve shared credentials/integrations.

## References

- `docs/specs/lean-prism.md`: approved design, checklist and restart progress.
- `CONTEXT.md`: current domain context.
- `README.md` and `CODING_HARNESS.md`: installation and orientation.
- `docs/migration-1.0.md`: consumer migration and detection limitations.
- `adr/`: historical architectural decisions.
