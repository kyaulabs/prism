# Prism repository

Read `packages/prism-core/AGENTS.md` for the shared engineering defaults.
This checkout develops and dogfoods the harness itself.

## Active refactor

`docs/specs/lean-prism.md` records the approved breaking redesign and execution
checklist. Follow its decisions over superseded workflow prose. The refactor is
in progress: older skills, runtime engines and tests still exist until their
replacement slices land. Do not mistake the new policy for completed runtime
implementation. Historical ADRs document the old system; they are not reasons
to preserve machinery explicitly selected for removal.

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
- This checkout currently uses `.github/hooks`; retain secret scanning while
  simplifying readiness, commit and workflow enforcement.
- Use Conventional Commits with `Implemented-by` and `Signed-off-by` only.
  Follow Git signing configuration and commit verified logical changes.
- Keep work on the active refactor branch. No push or merge has been requested
  for this refactor. The separate approved deletion of `kyaulabs/prism-adapters`
  happens only after its consumers and dedicated automation are retired.

## References

- `docs/specs/lean-prism.md`: approved design, checklist and restart progress.
- `CONTEXT.md`: domain context; legacy sections are being updated by the refactor.
- `README.md` and `CODING_HARNESS.md`: installation and orientation, also pending
  migration to the approved design.
- `adr/`: historical architectural decisions.
