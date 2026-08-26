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
  `scss-mobile-first`, `accessibility`, and `visual-review` for iterative,
  user-approved Chromium evidence.
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

## Blank and Template project bootstrap

Strict-empty Blank or Template setup can select this exact PHP/web adapter
through Core's generic provider protocol. Both source modes use the same generic
adapter preparation, provider report, installed-graph verification, and shared
quality contracts. Template evidence cannot change stack outputs: the adapter
renders byte-identical trusted scaffold content for equivalent metadata and
verifies an application-free,
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
while excluding dependency and operational state. PHP/web selection is the exact
package installation authorization; the complete project plan has its own later
approval. After durable application, separate hook approval precedes the signed root seed.
Setup performs no remote, publication, or push operation;
the human creates or configures the hosted repository, adds the remote, pushes
`develop`, and configures post-push rulesets.

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
resolve`, `setup apply`, and `setup verify` workflow; Blank and Template
bootstrap add no behavior to those operations. Setup creates the canonical
`visual_review.mjs`, `visual_review.spec.mjs`, and `visual_review.example.json`
files when absent, preserves exact canonical files without rewriting them, and
fails on conflicting paths.

## Visual review

Prism does not choose a project's palette, typography, visual movement, motion,
or component aesthetics. Styling starts only after the user supplies a visual
reference or equivalently detailed written brief and approves the resulting
committed design brief.

After each visual TDD slice reaches Green, load `visual-review`. Copy
`visual_review.example.json` to the active `visual_review.json`, configure only
approved loopback routes and states, then run:

```bash
prism-tool run playwright -- test visual_review.spec.mjs --workers=1 --output tests/Browser/Screenshots/.playwright --reporter=line
```

The closed configuration and action vocabulary are documented in
[`docs/visual-review.md`](./docs/visual-review.md). The workflow captures the
configured mobile, desktop, 320px reflow, and changed-state matrix, requires the
agent to inspect every PNG and iterate until the set is acceptable, then pauses
for user milestone approval. Captures are restricted to unauthenticated
loopback pages with controlled non-sensitive data. Working evidence stays under
`tests/Browser/Screenshots/` and is ignored by default; committing reference
images requires explicit user approval.

`pest-browser` remains responsible for critical functional browser flows.
`visual-review` owns subjective visual inspection and milestone evidence.

## License

AGPL-3.0-only. See [NOTICE](./NOTICE) for the attribution chain.
