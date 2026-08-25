# @kyaulabs/prism-php-web

The **PHP/web stack adapter** for the [prism](https://github.com/kyaulabs/prism)
coding harness on [pi](https://pi.dev).

prism's language-agnostic core ([@kyaulabs/prism-core](https://www.npmjs.com/package/@kyaulabs/prism-core))
carries the pipeline and discipline. This adapter adds the **PHP/Aurora-specific**
skills and commands, and the `rm -rf` safe-zone list the core's safety extension
reads. Install it **per project** wherever `composer.json` or `aurora/` is
present.

## What it provides

- **`php-web-stack`** — the stack: PHP 8.5+, MariaDB, nginx, SCSS → Dart Sass,
  vanilla JS, Pest 5 on PHPUnit 13, no-MVC, flat procedural PHP.
- **`tdd-php`** — the PHP/Pest half of TDD (test framework, coverage tooling,
  lint), loaded alongside the core `tdd` skill.
- **`security-coding-php`** — PHP/SQL bound-parameter patterns, Aurora CSRF,
  file-upload safety.
- **Frontend skills** — `frontend-design`, `frontend-architecture`,
  `scss-mobile-first`, `accessibility`.
- **Page & doc skills** — `aurora-page`, `rcs-header`, `pest-browser`, `database`.
- **Commands** — `/check-php` (lint + coverage gate), `/build-assets` (Dart Sass
  + uglify-js), `/deploy`.
- **`safe-dirs.json`** — the `rm -rf` safe zones (`vendor`, `cdn/css`,
  `cdn/javascript`, …) the core safety extension enforces.

## Install

Inside a PHP project:

```bash
pi install -l npm:@kyaulabs/prism-php-web
```

On first run pi asks to **trust** the project (or save the decision with
`/trust`) so project-local resources load.

## Blank project bootstrap

Strict-empty Blank setup can select this exact PHP/web adapter through Core's
generic provider protocol. The adapter renders and verifies an application-free,
testing-ready scaffold: dependency manifests and locks, Pest/PHPUnit readiness,
first-source lint configuration, shared local/CI quality gates, canonical hosted
CI, and empty source/test directories without an application webroot, Aurora
checkout, database schema, nginx configuration, or deployment assets.

Locked Composer and npm resolution and installation run with lifecycle scripts
disabled. Every advisory blocks, and browser acquisition installs only the
declared Playwright Chromium build. Failure before Core's durable marker
restores strict emptiness when owned state can be removed safely; failure after
durability retains the complete scaffold and exact phase evidence for a
deterministic resume. Canonical hooks run the adapter-owned shared quality gate,
and root-seed readiness binds the adapter activation and provider report digest
while excluding dependency and operational state. Setup performs no remote,
publication, or push operation.

## Consumer toolchain

The adapter declares its exact consumer-development tools in
`toolchain.json` (Pest 5 on PHPUnit 13, php-cs-fixer, Playwright Chromium,
Dart Sass, uglify-js, eslint, stylelint). `prism-tool setup` provisions them
into the consumer project's `composer.json`/`package.json` and lockfiles only
after separate registry and literal-`yes` mutation approvals, then installs
them from the audited locks with lifecycle scripts disabled. The candidate
workspace (`.pi/prism-tool/work/`) is ownership-marked and safely recovered
or cleaned after interruption; Playwright installs only the matching Chromium
build.

Established projects retain the existing public `setup inspect`, `setup
resolve`, `setup apply`, and `setup verify` workflow; Blank bootstrap adds no
behavior to those operations.

## License

AGPL-3.0-only. See [NOTICE](./NOTICE) for the attribution chain.
