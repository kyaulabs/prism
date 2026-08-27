# PHP/web coding conventions

This is the adapter's canonical reference for file names, indentation, PHP
architecture, JavaScript, and SCSS. Source-header and PHPDoc details remain in
the `rcs-header` skill.

## File names

| File kind | Convention | Example |
| --- | --- | --- |
| PHP helper or configuration | `snake_case.php` | `config_loader.php` |
| PHP class, interface, or trait | `PascalCase.php` | `UserAuth.php` |
| Test | `PascalCaseTest.php` | `UserAuthenticationTest.php` |
| SCSS, JavaScript, or other source | `snake_case` | `site_styles.scss` |
| Timestamped output | `name-YYYYMMDDThhmmss.ext` | `report-20240722T143000.php` |

## Indentation

- PHP and TypeScript: four spaces.
- SCSS: two spaces.
- JavaScript: tabs displayed at width four.
- Never mix tabs and spaces within one indentation level.

## PHP and Aurora

Use PHP 8.5+ and PSR-12. Every PHP source file declares
`strict_types=1`. Classes, methods, and functions require PHPDoc with parameters,
return values, and thrown exceptions.

The application is deliberately no-MVC. Public PHP pages include Aurora,
produce HTML directly, and use raw SQL or Aurora's SQL handler. There is no
controller layer, template engine, router, or ORM. Non-public PHP logic belongs
under `backend/`.

`aurora/` is a framework submodule. Treat changes proposed inside it as a
cross-boundary architecture decision; do not patch the submodule to hide an
application defect.

Use bound SQL parameters for all data values. Database schema rules and
migration naming live in the `database` skill. Trust-boundary handling lives in
`security-coding` and `security-coding-php`.

Do not add explanatory inline comments unless the user requests them. Prefer a
clear name, a smaller function, or a deeper module.

## Required source ceremony

Every `.php`, `.js`, `.scss`, `.sh`, and `.ts` source file has one canonical
RCS-style header and one final vim modeline. The pre-commit hook normalizes both;
do not hand-edit their identity or date fields.

Read `rcs-header` before creating or modifying source. Markdown, JSON, YAML,
generated assets, dependencies, and the Aurora submodule do not receive these
headers.

## Architecture tests

`tests/Unit/Harness/ArchTest.php` uses filesystem walkers so procedural PHP is
included. The suite excludes dependencies, generated assets, Aurora, and
Semgrep fixtures, then enforces:

- a vacuity guard that fails when no PHP source is found;
- absence of `var_dump`, `print_r`, `dd`, and `dump` calls;
- `declare(strict_types=1)` within the first ten lines of each PHP file.

`tests/Unit/Harness/RcsHeaderConventionTest.php` checks source-header placement.
Do not put Pest architecture declarations in `tests/Pest.php`; they do not cover
the procedural source tree.

## JavaScript

Use progressive enhancement. Pages must keep their basic content and actions
usable without JavaScript where the feature permits it. Prefer vanilla ES6+
modules; use jQuery only when the platform API is insufficient.

Keep scripts CSP-friendly: no string evaluation, dynamic inline-script
construction, or hidden server-generated behavior. Consume design values
through CSS custom properties rather than duplicating tokens in JavaScript.
ESLint configuration lives in `eslint.config.mjs`.

Edit JavaScript source under `cdn/js/`. Never edit generated
`cdn/javascript/*.min.js` files.

## SCSS and generated CSS

Write mobile-first base styles for the smallest viewport, then add `min-width`
queries for larger layouts. Follow `scss-mobile-first` for breakpoints, units,
touch targets, and responsive checks.

Edit SCSS under `cdn/sass/`. Never edit generated `cdn/css/*.min.css`. Rebuild
assets through the adapter command and verify the generated output rather than
patching it.
