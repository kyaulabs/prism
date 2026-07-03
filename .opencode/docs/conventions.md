# Coding Conventions

Referenced by `opencode.json`. Loaded alongside AGENTS.md in every session.

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

## PHP Standards

- PSR-12 code style, enforced by `php-cs-fixer`
- `declare(strict_types=1)` on all backend classes
- All classes, methods, and functions require PHPDoc (see `rcs-header` skill)
- No explanatory inline comments unless explicitly requested
- Raw SQL or Aurora SQL handler — no ORM

## Arch Tests (enforce automatically in `tests/Pest.php`)

```php
arch('no debug functions in production code')
    ->expect(['dd', 'dump', 'var_dump', 'print_r'])
    ->not->toBeUsed();

arch('backend classes use strict types')
    ->expect('KYAULabs')
    ->toUseStrictTypes();
```

The `KYAULabs` namespace covers Aurora and any project classes following the
same convention. Backend procedural helpers in `backend/` are covered by the
`no debug functions` rule above rather than the strict-types namespace check,
since procedural files do not declare a namespace.


## JavaScript

- Vanilla JS preferred; jQuery only when vanilla is insufficient
- Tab indentation, tab-stop 4
- ESLint enforced via `eslint.config.mjs`
- Never edit `cdn/javascript/*.min.js` — edit source in `cdn/js/` and rebuild

## SCSS / CSS

- Mobile-first: base styles for smallest viewport, `min-width` queries for larger screens
- See `scss-mobile-first` skill for full rules
- Never edit `cdn/css/*.min.css` — edit source in `cdn/sass/` and rebuild
