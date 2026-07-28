# Why This Stack and Harness Exist

KYAULabs Template is an **OpenCode-native PHP coding harness** — a complete
development environment where the AI agent's tooling, methodology, and
conventions are defined as code under `.opencode/`. This document explains
the design decisions that make it different from typical project scaffolds.

## Why OpenCode?

Most AI coding tools (Cursor, Copilot, Claude Code) run as a single monolithic
agent with god-mode access to your filesystem, shell, and network. They have no
per-agent permission model, no structural anti-drift enforcement, and no
pipeline scaffolding — you get raw LLM output and you hope for the best.

OpenCode gives us **per-agent permissions** (`opencode.jsonc`) — the `plan`
agent is read-only, the `build` agent can write files but must ask before
committing, `@tdd` can commit but cannot push, and so on. Every subagent
(architect, code-review, semgrep, debug) operates within explicit capability
boundaries. This is the "least privilege" principle applied to your AI pair
programmer.

OpenCode also runs **TypeScript plugins** that structurally inject behavior
the model cannot forget or skip. `session-bootstrap.ts` pushes the
anti-rationalization red-flags table into every system prompt and into every
compaction context — the model cannot "drift" past a pipeline gate by
rationalizing that it doesn't need one. This is structural enforcement, not
a prompt that the model can ignore under cognitive load.

## Why No Framework?

This stack uses **raw PHP 8.5 + Aurora's SQL handler**. There is no ORM, no
router, no templating engine, no dependency injection container, and no MVC
framework. Every database query is a parameterized SQL string you can grep,
audit, and explain. Every HTML page is a `.php` file in the webroot that
outputs markup directly.

The trade-off:
- **You write more boilerplate**, but every line is intentional.
- **You get less magic**, but nothing hides behind middleware chains you
  didn't read.
- **You carry more discipline** (no framework CSRF protection, no framework
  session management, no framework input validation — the `security-coding`
  skill covers what Laravel/Symfony abstract away).

This is the right trade-off for a single-developer team that wants full
auditability of every request path and every query. If you need a framework,
this template is not for you.

## The Fast-Path

Not every change needs the full engineering pipeline. A typo fix, an RCS header
update, a style-only SCSS adjustment, a docs-only commit — these have **zero
behavior delta**. The fast-path lets you skip brainstorming, planning, TDD, and
`@code-review` for these changes.

Why two pipelines? Because every pipeline step carries a cognitive and time
cost. Running the full `/check` gate for a one-character typo fix is waste.
Forcing a brainstorming session for an RCS header update burns the reviewer's
patience. The fast-path keeps velocity high on chores so the heavy pipeline's
signal stays clean on behavior deltas.

The fast-path is defined in `.opencode/docs/session-bootstrap.md` — zero-behavior-delta
changes (typos, docs, RCS headers, style-only, patch deps, test-only fixes)
skip the full pipeline. Everything else goes through:

```
brainstorming → prototype (if needed) → writing-plans → executing-plans → @tdd → verification → /check → @code-review
```

## Validate-Harness CI

The harness is code. Skills, agents, commands, and plugins under `.opencode/`
all carry YAML frontmatter that must be valid. Names must not collide across
categories (a skill named `debug` and an agent named `debug` can't coexist).
Cross-references in `## Cross-refs` sections must point to existing names.

`validate-harness.sh` runs these checks — frontmatter delimiters, required
fields (`name`/`description` for skills, `description`/`mode` for agents,
`description` for commands), name uniqueness, and cross-reference integrity.
It is the harness's own CI gate, runnable locally and in CI.

If your skill file has no `---` delimiters, validate-harness catches it. If
two agents share the same name, it catches it. If a `## Cross-refs` section
references a skill that doesn't exist, it catches it. This is the same
discipline we apply to application code, applied to the agent's own toolchain.

## Prototype Integration Branch

Before committing to an implementation plan, you can prototype — throwaway
code that answers a single technical viability question. The `prototype` skill
defines three branches:
- **Logic prototype** (PHP CLI) — answers "can this algorithm work?"
- **UI prototype** (HTML+CSS+JS variants) — answers "does this layout feel right?"
- **Integration prototype** (DB/API boundary test) — answers "does this
  protocol integrate cleanly?"

The prototype is deleted after answering the question. It is NOT a draft PR,
NOT a feature branch that might accidentally ship, and NOT a place to park
half-baked code. The separation of prototype (learn) from plan (design) from
implementation (TDD) prevents the common failure mode where "prototype" code
ships to production because nobody had the discipline to throw it away first.

## The Full Stack, At a Glance

| Layer | Technology | Rationale |
|---|---|---|
| AI harness | OpenCode + agents/skills/commands/plugins | Per-agent permissions, structural anti-drift, pipeline scaffolding |
| Web server | nginx | Fast, stable, project-proven (see `<app>.nginx.conf` template) |
| Database | MariaDB | InnoDB, indexed, fully auditable (no ORM) |
| Backend | PHP 8.5 (procedural / class-based) | No MVC, no router, raw SQL via Aurora's handler |
| Frontend | HTML5 + SCSS + vanilla JS | Mobile-first, neumorphic, CSS-driven transitions |
| Tests | Pest PHP v4 on PHPUnit 12 | Red-Green-Refactor, minimum 80% line coverage |
| Lint/CI | php-cs-fixer, stylelint, eslint, commitlint | Enforced by git hooks (`.github/hooks/`) |
| Changelog | git-cliff | Automated from Conventional Commits history |
| Secrets | gitleaks | Pre-commit scan through git hook |
| SAST | Semgrep | Diff-based audit + full scan via `@semgrep` agent |
| Code review | OpenCodeReview (`ocr`) | Automated review via `@code-review` agent |

## How to Contribute

See [`README.md`](../README.md) for the full setup guide, including Composer/npm
installation, git hook setup (`bash .github/scripts/install-hooks.sh`), and the
first-build workflow. The [`CODING_HARNESS.md`](../CODING_HARNESS.md) orientation
doc covers the harness architecture and pipeline flow.
