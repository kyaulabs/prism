# Coding Harness

## Harness Structure

```text
<project>/
├── AGENTS.md                          ← Thin: stack, boundaries, pointers only
├── CONTEXT.md                         ← Domain glossary, entities, invariants, non-goals
├── opencode.json                      ← Wires instructions + agent definitions + permissions
├── .semgrepignore                     ← Excludes vendor, node_modules, aurora, generated assets
│
├── adr/                               ← Architecture Decision Records (Nygard format)
│   ├── README.md                      ← ADR workflow + status transitions
│   └── 0000-template.md               ← Copy-paste ADR template
│
├── .github/
│   └── hooks/
│       ├── pre-commit                 ← ENFORCES: lint (PHP/SCSS/JS) + gitleaks
│       └── commit-msg                 ← ENFORCES: commitlint conventional commits
│
├── .opencode/
│   ├── agents/
│   │   ├── tdd.md                     ← TDD: red → green → refactor cycle
│   │   ├── test-audit.md              ← Audit existing test suite quality
│   │   ├── code-review.md             ← ocr review (diff) + ocr scan (full-file)
│   │   ├── architect.md               ← Read-only eval of a change vs CONTEXT.md + ADRs
│   │   ├── resolve-merge-conflicts.md ← Resolve git merge/rebase conflicts
│   │   ├── semgrep.md                 ← SAST: diff audit + full scan (PHP/JS/secrets)
│   │   ├── debug.md                   ← Bug investigation: logs, tests, root cause
│   │   └── docs-writer.md             ← Generate PHPDoc, RCS headers, documentation
│   ├── commands/
│   │   ├── prime.md                   ← /prime: draft or regenerate CONTEXT.md
│   │   ├── check.md                   ← /check: pre-push gate (lint + coverage 80%)
│   │   ├── release.md                 ← /release: git-cliff changelog + signed tag + gh
│   │   ├── deploy.md                  ← /deploy: post-pull prod deploy + opcache + logs
│   │   ├── research.md                 ← /research: cited research via @scout + web
│   │   ├── build-assets.md            ← /build-assets: rebuild SCSS + JS minified assets
│   │   └── security.md                ← /security: SAST scan + dependency CVE audit
│   ├── docs/                          ← Additional information for custom agents
│   │   ├── build-pipeline.md          ← SCSS/JS build steps
│   │   ├── conventions.md             ← File naming, commenting, structure
│   │   ├── versioning.md              ← SemVer + Keep a Changelog + RCS bump rules
│   │   ├── design.md                  ← RFC template + when a design doc is required
│   │   ├── research.md                ← Source-trust heuristics + citation format
│   │   ├── mocking.md                 ← Mocking guidelines (system boundaries only)
│   │   ├── refactoring.md             ← Refactor-candidate checklist
│   │   └── tests.md                   ← Good vs bad test examples (Pest/PHP)
│   └── skills/
│       ├── audit-deps/                ← On-demand: composer audit + npm audit
│       ├── aurora-page/               ← On-demand: Aurora page template
│       ├── conventional-commits/      ← On-demand: Conventional commit messages
│       ├── pest-browser/              ← On-demand: browser test setup
│       ├── rcs-header/                ← On-demand: RCS format rules
│       ├── scss-mobile-first/         ← On-demand: responsive CSS rules
│       ├── frontend-design/           ← On-demand: visual language + neumorphism + tokens
│       ├── frontend-architecture/     ← On-demand: JS structure, jQuery policy, CSP
│       ├── accessibility/             ← On-demand: WCAG 2.2 AA, focus, motion, contrast
│       ├── security-coding/           ← On-demand: defensive PHP (SQL/XSS/CSRF/sessions)
│       ├── database/                  ← On-demand: MariaDB schema, migrations, SQL style
│       ├── domain-context/            ← On-demand: read/update CONTEXT.md
│       ├── adr/                       ← On-demand: ADR format + status transitions
│       └── systems-design/            ← On-demand: ADR vs RFC, C4-lite, interface design
```

## Built-in OpenCode Features

OpenCode ships with features that require no custom configuration. These are always
available alongside the custom agents and skills above.

### Primary Agents (Tab to switch)

| Agent | Purpose |
|---|---|
| **Build** | Default mode — full tool access for development; enforces mandatory `@tdd` + hard boundaries |
| **Plan** | Restricted mode — analysis and planning, no file changes |

Press **Tab** to switch between Build and Plan during a session. Use Plan to discuss
approach, explore architecture, and iterate on designs without making changes. When
ready to implement, Tab back to Build.

Plan mode is restricted from invoking code-modifying subagents (`@tdd`,
`@resolve-merge-conflicts`, `@debug`) — it can only invoke read-only/audit
agents (`@test-audit`, `@code-review`, `@semgrep`, `@architect`, `@explore`,
`@scout`, `@docs-writer`).

### Built-in Subagents

| Agent | Purpose |
|---|---|
| **Explore** | Read-only codebase exploration — file patterns, keyword search |
| **Scout** | External docs + dependency research (clones upstream repos) |
| **General** | Multi-step research, full tool access |

Invoke via `@mention`: `@explore find the auth implementation`.

### Custom Slash Commands

| Command | Purpose |
|---|---|
| `/prime` | Draft or regenerate `CONTEXT.md` from the codebase |
| `/check` | Pre-push gate: php-cs-fixer + stylelint + eslint + pest --coverage (80%) |
| `/release` | git-cliff changelog + signed tag + `gh release` command |
| `/deploy` | Post-pull production deploy — asset rebuild, opcache clear, log tail |
| `/research` | Cited research via `@scout` + web (see `.opencode/docs/research.md`) |
| `/build-assets` | Rebuild minified CSS and JavaScript from SCSS/JS sources |
| `/security` | Run `@semgrep` SAST scan + `audit-deps` CVE check in one pass |

### Built-in Slash Commands

| Command | Purpose |
|---|---|
| `/init` | Analyze project and generate AGENTS.md |
| `/undo` | Revert the last change made by the agent |
| `/redo` | Redo a previously undone change |
| `/share` | Create a shareable link to the current conversation |
| `/help` | Show available commands and help |
