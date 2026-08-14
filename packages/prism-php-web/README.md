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

## License

AGPL-3.0-only. See [NOTICE](./NOTICE) for the attribution chain.
