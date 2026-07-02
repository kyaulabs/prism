# AGENTS.md

## Stack

- OS: Linux / Shell: bash
- Web Server: nginx / Database: MariaDB
- Backend: PHP 8.5+ (flat procedural / class-based, no MVC, no router)
- Frontend: HTML5, CSS3, JS ES6+, jQuery only when vanilla JS is insufficient
- CSS: SCSS → Dart Sass → minified / JS: uglify-js → minified
- Tests: Pest PHP v4 on PHPUnit 12
- Version Control: Git + Conventional Commits + signed commits

## Production Environment

- OS: Linux
- Server provisioned via https://github.com/kyaulabs/aarch/blob/master/pkg/nginx.pkg
- Web root: `/nginx/https/<domain>/www` (symlinked from `/nginx/git/<app>/`)
- Logs: `/nginx/logs/<domain>/` (one directory per domain, dots in domain → underscores)
  - PHP: `php.log`
  - nginx access: `access-<app>_<domain>.log`
  - nginx error: `error-<app>_<domain>.log`
  - Rotated: `.N.zstd` suffix (e.g. `php.log.1.zstd`)
- Temp directory: `/tmp`

## No MVC

PHP pages include Aurora, output HTML directly, and interact with the DB via raw SQL or Aurora's SQL handler. No controllers, no templating engine, no router. `backend/` holds PHP logic not web-accessible.

## Directory Structure

```text
├── aurora/              ← Aurora PHP Framework (git submodule)
├── backend/             ← Backend PHP logic (not web-accessible)
├── cdn/
│   ├── css/             ← GENERATED — do not edit
│   ├── javascript/      ← GENERATED — do not edit
│   ├── sass/            ← SCSS source (edit these)
│   └── js/              ← JS source (edit these)
├── tests/
│   ├── Unit/
│   ├── Feature/
│   ├── Integration/
│   └── Browser/
├── <app>/               ← Public webroot (<app>.<domain>)
├── <app>.sql
└── <app>.nginx.conf
```

Projects live in `/nginx/git/<app>`, symlinked into `/nginx/https/<domain>`.

## Hard Boundaries

- NEVER edit `cdn/css/*.min.css` or `cdn/javascript/*.min.js` — these are generated
- NEVER commit `.env` files — use `.env.example` only
- Do not access external APIs without explicit permission
- Do not modify files outside the project directory
- New dependencies must be explicitly noted
- When glob/grep returns unexpected empty results, verify with `ls` before concluding a file does not exist

## File Naming

- PHP helpers / config: `snake_case.php`
- PHP classes / interfaces / traits: `PascalCase.php`
- All other files: `snake_case`
- Test files: `PascalCaseTest.php`
- Time-stamped files: append `-YYYYMMDDThhmmss`

## Commenting

- Every file starts with an RCS-style header — see `rcs-header` skill
- PHP classes/methods: PHPDoc (PSR-5) with params, return types, exceptions
- No explanatory comments unless explicitly requested
- Every file ends with a vim modeline — see `rcs-header` skill

## Indentation

- PHP: 4-space (PSR-12)
- SCSS: 2-space
- JS: tabs, tab-stop 4

## Testing — MANDATORY TDD

All new code follows Red → Green → Refactor. No exceptions.  
Use the `@tdd` agent for any new feature or bug fix.  
Use the `@test-audit` agent to review an existing test suite.  
Minimum 80% line coverage. Run: `php vendor/bin/pest --coverage`

## Linting & Enforcement

Linting is enforced by `.github/hooks/pre-commit` — it blocks commits on failure.  
Commit message format is enforced by `.github/hooks/commit-msg` via commitlint.  
To activate hooks after cloning: `bash scripts/install-hooks.sh`

For linting details and responsive/mobile-first CSS rules, see `scss-mobile-first` skill.

## Git Workflow

- Branches: `main` (production), `develop` (integration)
- Features: `feat/<username>-<hash>-<description>`
- Commits: Conventional Commits format (type[scope]: subject) — see `conventional-commits` skill
- Signed commits required

## Build Pipeline

SCSS: `sass --style=compressed cdn/sass/source.scss cdn/css/output.min.css`
JS:   `uglifyjs cdn/js/source.js -o cdn/javascript/output.min.js -c -m`
Assets are built manually. No watchers.

## Aurora Framework

Submodule at `aurora/`. Entry: `require_once(__DIR__ . "/../aurora/aurora.inc.php")`  
For the standard page template, see the `aurora-page` skill.

## Skills Available

Load these on demand when the task requires them:

| Skill | When to use |
| --- | --- |
| `rcs-header` | Creating or modifying any source file |
| `aurora-page` | Creating a new PHP page |
| `scss-mobile-first` | Writing or reviewing SCSS |
| `pest-browser` | Writing browser tests |
| `conventional-commits` | Writing or reviewing commit messages |
| `audit-deps` | Scanning PHP/JS dependencies for known CVEs |

## Agents Available

| Agent | Mode | When to use |
| --- | --- | --- |
| `@tdd` | subagent | Any new feature or bug fix requiring tests |
| `@test-audit` | subagent | Auditing an existing test suite for quality |
| `@code-review` | subagent | Reviewing staged changes before push |
| `@resolve-merge-conflicts` | subagent | Resolving in-progress git merge/rebase conflicts |
| `@semgrep` | subagent | SAST scanning — diff audit + full scan (PHP/JS/secrets) |
| `@debug` | subagent | Investigating bugs — log inspection, targeted tests, root cause analysis |
| `@docs-writer` | subagent | Generating PHPDoc, RCS headers, and documentation |
