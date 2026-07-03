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

## Project Context

- `CONTEXT.md` (root) — domain glossary, entities, invariants, boundaries, non-goals. Read before domain-coupled work (see `domain-context` skill). Draft or refresh it via `/prime`.
- `adr/` — Architecture Decision Records (Nygard format). Write one for hard-to-reverse or cross-cutting decisions (see `adr` skill).

## Directory Structure

```text
├── AGENTS.md              ← Stack, boundaries, pointers (loaded every session)
├── CONTEXT.md             ← Domain glossary, entities, invariants, non-goals
├── opencode.json          ← Wires instructions + agent definitions + permissions
├── adr/                   ← Architecture Decision Records (Nygard format)
├── aurora/                ← Aurora PHP Framework (git submodule)
├── backend/               ← Backend PHP logic (not web-accessible)
│   └── migrations/        ← Forward-only SQL migrations (timestamp-prefixed)
├── cdn/
│   ├── css/               ← GENERATED — do not edit
│   ├── javascript/        ← GENERATED — do not edit
│   ├── sass/              ← SCSS source (edit these)
│   └── js/                ← JS source (edit these)
├── tests/
│   ├── Unit/
│   ├── Feature/
│   ├── Integration/
│   └── Browser/
├── <app>/                 ← Public webroot (<app>.<domain>)
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
Pre-push gate: `/check` (php-cs-fixer + stylelint + eslint + pest --coverage).

## Engineering Pipeline

The full methodology, end to end. Follow this sequence for any non-trivial
change. Each phase produces an artifact that the next phase consumes.

```text
brainstorming → writing-plans → @tdd (per task) → verification-before-completion → /check → @code-review
```

1. **Brainstorm** the change (grilling skill) → spec in `docs/specs/`.
2. **Plan** the implementation (writing-plans skill) → plan in `docs/plans/`.
3. **Implement** each task via `@tdd` (Red → Green → Refactor, vertical slices).
4. **Verify** completion (verification-before-completion skill).
5. **Gate** with `/check` (lint + coverage 80%).
6. **Review** with `@code-review` before push.

For non-trivial or cross-cutting changes, insert `@architect` before step 3.
For bugs, use `@debug` (disciplined 6-phase loop) before `@tdd` on the fix.
For architectural entropy, run `/improve-architecture` on a cadence.

## Linting & Enforcement

Linting is enforced by `.github/hooks/pre-commit` — it blocks commits on failure.  
Commit message format is enforced by `.github/hooks/commit-msg` via commitlint.  
To activate hooks after cloning: `bash .github/scripts/install-hooks.sh`

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
| `brainstorming` | Before any creative work — features, components, behavior changes. Grilling → design → spec |
| `writing-plans` | After brainstorming approval — produces a bite-sized TDD implementation plan |
| `verification-before-completion` | Before declaring a task done — verifies tests pass, no debug artifacts, lint clean |
| `rcs-header` | Creating or modifying any source file |
| `aurora-page` | Creating a new PHP page |
| `scss-mobile-first` | Writing or reviewing SCSS (breakpoints, units, build) |
| `frontend-design` | Writing or reviewing visual language — responsive/mobile-first, CSS transitions, CSS-driven flow, neumorphism, default theme + tokens |
| `frontend-architecture` | Structuring frontend JS — progressive enhancement, module pattern, jQuery policy, token consumption, CSP rules |
| `accessibility` | Writing or reviewing markup/SCSS/JS for UI — WCAG 2.2 AA, focus, motion, neumorphism contrast floor |
| `security-coding` | Defensive coding in the no-framework stack — SQL/XSS/CSRF, sessions, passwords, headers |
| `database` | Schema design, `<app>.sql`, migrations, indexing, SQL style |
| `domain-context` | Before domain-coupled work — read/update `CONTEXT.md` |
| `adr` | Writing, reviewing, or superseding an Architecture Decision Record |
| `systems-design` | Designing a non-trivial change — ADR vs RFC, C4-lite, interface design |
| `conventional-commits` | Writing or reviewing commit messages |
| `pest-browser` | Writing browser tests |
| `audit-deps` | Scanning PHP/JS dependencies for known CVEs |
| `writing-skills` | Authoring new skills, agents, commands, or docs in `.opencode/` |

## Agents Available

| Agent | Mode | When to use |
| --- | --- | --- |
| `@tdd` | subagent | Any new feature or bug fix requiring tests |
| `@test-audit` | subagent | Auditing an existing test suite for quality |
| `@code-review` | subagent | Reviewing staged changes before push |
| `@architect` | subagent | Read-only evaluation of a proposed change against `CONTEXT.md` + ADRs before implementation |
| `@resolve-merge-conflicts` | subagent | Resolving in-progress git merge/rebase conflicts |
| `@semgrep` | subagent | SAST scanning — diff audit + full scan (PHP/JS/secrets) |
| `@debug` | subagent | Investigating bugs — disciplined 6-phase loop: feedback loop → reproduce → hypothesise → instrument → fix → post-mortem |
| `@docs-writer` | subagent | Generating PHPDoc, RCS headers, and documentation |

## Commands

| Command | Purpose |
| --- | --- |
| `/prime` | Draft or regenerate `CONTEXT.md` from the codebase |
| `/check` | Pre-push gate: php-cs-fixer + stylelint + eslint + pest --coverage (80%) |
| `/release` | git-cliff changelog + signed tag + `gh release` command |
| `/deploy` | Post-pull production deploy — asset rebuild, opcache clear, log tail |
| `/research` | Cited research via `@scout` + web (see `.opencode/docs/research.md`) |
| `/build-assets` | Rebuild minified CSS and JS from source |
| `/security` | SAST scan + dependency CVE audit in one pass |
| `/improve-architecture` | Scan codebase for deepening opportunities → Obsidian markdown report |
| `/handoff` | Compact current conversation into a handoff document for another session |
