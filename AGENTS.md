# Prism repository

Read `packages/prism-core/AGENTS.md` for the shared engineering defaults.
This checkout develops and dogfoods the harness itself.

## Active refactor

`docs/specs/lean-prism.md` records the approved breaking redesign and execution
checklist. The local replacement is implemented and verified; hosted catalogue
deletion has a delivery-ordering blocker documented in `docs/catalogue-retirement.md`.
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
- Keep work on the active refactor branch. No push or merge has been requested
  for this refactor. The separate approved deletion of `kyaulabs/prism-adapters`
  happens only after its consumers and dedicated automation are retired.

## References

- `docs/specs/lean-prism.md`: approved design, checklist and restart progress.
- `CONTEXT.md`: current domain context.
- `README.md` and `CODING_HARNESS.md`: installation and orientation.
- `docs/migration-1.0.md`: consumer migration and detection limitations.
- `adr/`: historical architectural decisions.
