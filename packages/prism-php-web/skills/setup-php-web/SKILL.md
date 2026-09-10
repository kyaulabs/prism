---
name: setup-php-web
description: Use to set up selected PHP/web testing, linting and frontend tooling with native Composer/npm commands, preserving existing project configuration.
compatibility: "PHP, Composer and the project's frontend package manager"
---

# PHP/Web Setup

Set up the chosen PHP/web tooling directly. No adapter protocol or provisioning
engine is required. The Core `setup` skill owns template selection and GitHub options.

1. Inspect `composer.json`, lockfiles, test configuration, frontend manifests and
   the source layout. Load `php-web-stack` for defaults; follow existing project
   versions/conventions and explicit overrides. Never assume Aurora or a deployable
   webroot is wanted just because this module is installed.
2. Use the features already selected in setup. Ask only about missing requirements
   or material version/framework conflicts. For a new compatible project, default
   to Pest 5/PHPUnit 13 on PHP 8.5+, PHP CS Fixer, and frontend tools only as needed.
3. Add required development dependencies through normal Composer and the project's
   existing frontend package manager. Note additions explicitly, preserve package
   manager choice, and update its lockfile. Prefer project-local executables such
   as `vendor/bin/pest` and `node_modules/.bin/eslint`. Do not resolve tools through
   a Core contract or require unrelated security tools before setup can proceed.
4. Create missing native test/lint configuration, adapting existing files rather
   than overwriting them. Bootstrap Pest only when absent. Include actual source
   directories in PHPUnit coverage; avoid invented application folders or tests
   that merely assert true. Test the project's behavior, not configuration spelling.
5. Configure a normal project check command with relevant PHP syntax, tests and
   lint. Use `tdd-php` and `/check-php` guidance. Generate Clover coverage and apply
   the module's `coverage-gate.php` to changed PHP paths: 90% by default, overridable
   with `--min=N`. Do not add a separate aggregate threshold unless requested.
   For a self-contained project/CI, copy that small helper as a project-owned file
   and call its stable local path; no installed launcher is needed.
6. Add Sass, JavaScript minification, Stylelint and ESLint only for selected
   frontend work. Use source directories already present or requested. Configure
   generated output paths and ignore temporary build/test artifacts.
7. Install browser tooling only for selected browser/visual testing. Follow the
   project's test-server lifecycle; use owned temporary resources and never kill
   unrelated listeners. Do not require browser downloads for pure PHP unit tests.
8. Supply normal project commands to selected template hooks/CI. Preserve
   staged-secret scanning and quote file arguments. Existing CI remains project-owned;
   do not install a second reconciler or back-merge workflow automatically.
9. Run the checks that demonstrate the selected tooling works. For a blank project,
   distinguish configured tooling from tested application behavior. Report missing
   prerequisites and installation failures without pretending they passed.

## Rules

Do not read or write credential values. Native tools may authenticate normally.
Do not create application code, database schemas, visual defaults, production
configuration or Aurora submodules unless requested. Preserve custom files and
unrelated changes. Keep ordinary recoverable state instead of a transaction journal.

## Gotchas

- Installing a test runner is not proof that the application has meaningful tests.
- Dependency conflicts need an informed adjustment, not silent major upgrades.
- Module defaults are a starting point, not a requirement to replace a project's stack.
