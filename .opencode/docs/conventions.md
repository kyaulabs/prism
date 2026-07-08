# Coding Conventions

Referenced by `opencode.json`. Loaded alongside AGENTS.md in every session. This file is the canonical source for file naming, indentation, and code style. AGENTS.md defers here.

## File Naming

| File type                      | Convention                              | Example                        |
|--------------------------------|-----------------------------------------|--------------------------------|
| PHP helpers, config            | `snake_case.php`                        | `config_loader.php`            |
| PHP class / interface / trait  | `PascalCase.php`                        | `UserAuth.php`                 |
| Test files                     | `PascalCaseTest.php`                    | `UserAuthenticationTest.php`   |
| SCSS, JS, other files          | `snake_case`                            | `site_styles.scss`             |
| Time-stamped files             | `name-YYYYMMDDThhmmss.ext`              | `report-20240722T143000.php`   |

## Indentation

- PHP: 4-space (PSR-12)
- SCSS: 2-space
- JS: tabs, tab-stop 4
- TS: 4-space

## PHP Standards

- PSR-12 code style, enforced by `php-cs-fixer`
- `declare(strict_types=1)` on all backend classes
- All classes, methods, and functions require PHPDoc (see `rcs-header` skill)
- No explanatory inline comments unless explicitly requested
- Raw SQL or Aurora SQL handler — no ORM

## Arch Tests (enforced via `tests/Unit/Harness/ArchTest.php`)

Architecture tests live in `tests/Unit/Harness/ArchTest.php` alongside
`RcsHeaderConventionTest.php`. They use filesystem walkers
(`RecursiveDirectoryIterator`) to scan all PHP source files — not
pest-plugin-arch's autoload-based DSL, which cannot see procedural code
(see `adr/0004-filesystem-walker-arch-tests.md`).

Three tests scan all PHP files (excluding `vendor/`, `node_modules/`,
`aurora/`, `cdn/css/`, `cdn/javascript/`, `tests/Semgrep/`):

- **Vacuity guard** — fails if the scan finds zero PHP files, preventing
  silent pass-via-empty-universe.
- **No debug functions** — scans each PHP file for `var_dump`, `print_r`,
  `dd`, and `dump` calls using word-boundary regex.
- **Strict types** — asserts every PHP file has `declare(strict_types=1)`
  in its first 10 lines.


## JavaScript

- Vanilla JS preferred; jQuery only when vanilla is insufficient
- Tab indentation, tab-stop 4
- ESLint enforced via `eslint.config.mjs`
- Never edit `cdn/javascript/*.min.js` — edit source in `cdn/js/` and rebuild

## SCSS / CSS

- Mobile-first: base styles for smallest viewport, `min-width` queries for larger screens
- See `scss-mobile-first` skill for full rules
- Never edit `cdn/css/*.min.css` — edit source in `cdn/sass/` and rebuild
