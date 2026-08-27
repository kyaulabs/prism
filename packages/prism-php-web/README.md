# <img src="https://raw.githubusercontent.com/kyaulabs/prism/main/.github/media/prism-dark-panel.png" alt="Prism" />

## @kyaulabs/prism-php-web

Prism's PHP/web adapter adds stack-specific instructions, skills, prompts,
project providers, and toolchain contracts to globally installed Prism Core.
Install it project-locally when a trusted project contains `composer.json` or
`aurora/`.

## Adapter responsibility

The adapter owns:

- PHP 8.5+, MariaDB, nginx, Aurora, and the no-MVC application boundary;
- Pest 5 on PHPUnit 13, changed-file coverage, and PHP/web quality commands;
- SCSS through Dart Sass, vanilla JavaScript, and generated asset handling;
- accessibility, frontend architecture, visual design, and visual review;
- database, security, page, browser-test, and source-header guidance;
- the PHP/web bootstrap provider and consumer toolchain contract;
- project-local `safe-dirs.json` data for Core's safety extension.

Core continues to own the engineering pipeline, setup transaction, repository
bootstrap, Markdown gate, consent, commits, review chains, and publication
boundaries.

## Prerequisites and install

Install Prism Core globally first. Semgrep and OpenCodeReview (`ocr`) remain
Core prerequisites. Consumer development uses PHP 8.5+, Composer, Node.js,
MariaDB, nginx, and the exact tools declared by this adapter.

From the trusted consumer project:

```bash
pi install -l npm:@kyaulabs/prism-php-web
```

Pi asks whether to trust project-local resources. Review the project before
accepting or persisting that decision with `/trust`.

## Established project setup

Established projects retain Core's public setup sequence:

```text
setup inspect -> setup resolve -> setup apply -> setup verify
```

Setup discovers the project, presents exact package and file changes, obtains
separate registry and literal mutation approvals, resolves audited lockfiles
with lifecycle scripts disabled, and verifies the resulting toolchain. It does
not replace application architecture or rewrite conflicting project files.

When absent, setup creates canonical `visual_review.mjs`,
`visual_review.spec.mjs`, and `visual_review.example.json` files. It preserves
byte-identical canonical files and fails on conflicting paths.

## Blank and Template project bootstrap

Strict-empty Blank and Template setup can select this adapter through Core's
generic provider protocol. PHP/web selection is the exact package installation authorization;
the complete project plan has a later approval.

Both source modes use the same generic preparation, provider report,
installed-graph verification, and quality contracts. Template catalogue data
cannot change stack output. Equivalent metadata produces byte-identical trusted scaffold content.

The provider verifies an application-free, testing-ready scaffold with locked
Composer and npm manifests, Pest/PHPUnit readiness, source-first lint policy,
shared local and CI quality gates, hosted CI, and empty source and test
directories. It creates no application webroot, Aurora checkout, database
schema, nginx configuration, or deployment assets.

Dependency resolution and installation keep lifecycle scripts disabled. Every advisory blocks.
Browser acquisition installs only the declared Playwright Chromium build.

Before Core's durable marker, a failure restores strict emptiness when ownership
is provable. After durability, the complete scaffold and exact phase evidence
remain for deterministic recovery. Root-seed readiness binds adapter activation
and the provider report digest while excluding dependencies and operational
state; separate hook approval precedes the signed root seed.

Setup creates no remote and performs no publication or push. The human creates
or configures the hosted repository, adds the remote, pushes `develop`, and
configures rulesets.

## Consumer toolchain and quality gate

`toolchain.json` declares Pest 5 on PHPUnit 13, php-cs-fixer, Playwright with
Chromium, Dart Sass, uglify-js, ESLint, and stylelint. These resolve through
`prism-tool`; gates do not use arbitrary binaries from `PATH` or install tools
on demand.

The shared quality gate is `/check`. Core checks language-independent policy,
including changed Markdown, then delegates to `/check-php` for PHP style,
SCSS, JavaScript, tests, and changed-file coverage. Changed PHP files require at
least 80% line coverage.

Generated assets are outputs. Edit `cdn/sass/` and `cdn/js/`, then use the
adapter build command; never edit `cdn/css/*.min.css` or
`cdn/javascript/*.min.js`.

## Visual review

Visual review begins only after the user supplies and approves a visual brief.
After each rendered slice reaches Green, copy `visual_review.example.json` to
`visual_review.json`, define approved loopback routes and states, and run:

```bash
prism-tool run playwright -- test visual_review.spec.mjs --workers=1 --output tests/Browser/Screenshots/.playwright --reporter=line
```

Read every generated PNG, repair failures, and recapture the affected mobile,
desktop, 320-pixel reflow, color-mode, and interaction-state evidence. Working
captures stay under `tests/Browser/Screenshots/` and are ignored by default.
Commit reference images only with explicit user approval.

The tooling accepts unauthenticated loopback pages with controlled,
non-sensitive data. `pest-browser` owns critical functional browser flows;
`visual-review` owns visual inspection and milestone evidence. See
[Visual review tooling](docs/visual-review.md).

## Core handoff

Load `php-web-stack` with Core workflow skills. Core owns brainstorming,
specification, plans, Red-Green-Refactor discipline, verification, branch
finalization, and preparation-only `/pr`; this adapter supplies the concrete
PHP/web commands and standards used at each step.

Humans push branches, create pull requests, merge, publish packages, and operate
production deployments.

## License

The adapter is licensed under AGPL-3.0-only. See [NOTICE](NOTICE) for
attribution and retained upstream licenses.
