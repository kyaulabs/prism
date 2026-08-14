---
name: php-web-stack
description: "Use when working in a PHP/Aurora web project (composer.json or aurora/ present). Provides the stack (PHP 8.5+, MariaDB, nginx, SCSS, vanilla JS, Pest 5), no-MVC architecture, production env, and directory structure. Auto-load at session start in PHP projects."
compatibility: "PHP 8.5+, Composer, Aurora framework, MariaDB, nginx"
metadata: { "prism-adapter": "php-web", "auto-load-globs": ["composer.json", "aurora/"] }
---

## Stack

- OS: Linux / Shell: bash
- Web Server: nginx / Database: MariaDB
- Backend: PHP 8.5+ (flat procedural / class-based, no MVC, no router)
- Frontend: HTML5, CSS3, JS ES6+, jQuery only when vanilla JS is insufficient
- CSS: SCSS → Dart Sass → minified / JS: uglify-js → minified
- Tests: Pest PHP 5 on PHPUnit 13
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
├── AGENTS.md              ← Stack, boundaries, pointers (loaded every session)
├── CONTEXT.md             ← Domain glossary, entities, invariants, non-goals
├── .pi/settings.json      ← Activates project-local adapter resources
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
│   ├── Browser/
│   ├── Plugin/
│   ├── Semgrep/
│   └── Shell/
├── <app>/                 ← Public webroot (<app>.<domain>)
├── <app>.sql
└── <app>.nginx.conf
```

Projects live in `/nginx/git/<app>`, symlinked into `/nginx/https/<domain>`.
