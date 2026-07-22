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

## Labels

Issue labels use a two-axis vocabulary — **type** (GitHub issue-type field)
and **progress** (GitHub Progress field) — with optional **wayfinder** and
**meta** labels. The full vocabulary is documented in
`docs/agents/labels.md`.

## Directory Structure

```text
├── AGENTS.md              ← Stack, boundaries, pointers (loaded every session)
├── CONTEXT.md             ← Domain glossary, entities, invariants, non-goals
├── opencode.jsonc         ← Wires instructions + agent definitions + permissions
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

## Hard Boundaries

> [!IMPORTANT]
>
> - NEVER edit `cdn/css/*.min.css` or `cdn/javascript/*.min.js` — these are generated (edit source in `cdn/sass/` and `cdn/js/`; see `conventions.md` for details)
> - NEVER commit `.env` files — use `.env.example` only
> - Do not access external APIs without explicit permission
> - Do not modify files outside the project directory
> - New dependencies must be explicitly noted
> - When glob/grep returns unexpected empty results, verify with `ls` before concluding a file does not exist

## File Naming

See `.opencode/docs/conventions.md` for file naming conventions.

## Commenting

> [!IMPORTANT]
>
> - Every source file (`.php`, `.js`, `.scss`, `.sh`, `.ts`) starts with an
>   RCS-style header — see `rcs-header` skill. Exempt: `vendor/`, `node_modules/`,
>   `aurora/`, and generated `cdn/css/` + `cdn/javascript/` files.
> - Every source file ends with a vim modeline — see `rcs-header` skill
> - PHP classes/methods: PHPDoc (PSR-5) with params, return types, exceptions
> - No explanatory comments unless explicitly requested

## Indentation

Covered in `conventions.md`.

## Testing — MANDATORY TDD

> [!IMPORTANT]
> All new code follows Red → Green → Refactor. No exceptions.
> Use the `@tdd` agent for any new feature or bug fix.
> Minimum 80% line coverage on changed files, enforced by `.github/scripts/coverage-gate.php`. Run: `php -d pcov.enabled=1 vendor/bin/pest --coverage`

Use the `@test-audit` agent to review an existing test suite.
Pre-push gate: `/check` (php-cs-fixer + stylelint + eslint + pest --coverage).

## Engineering Pipeline

The full methodology, end to end. Follow this sequence for changes with a
behavior delta. Purely trivial changes with no behavior delta (typos, docs,
RCS headers, style-only, patch deps, test-only fixes) follow a fast-path —
see the brainstorming skill for the full definition.

Four on-ramps start the pipeline depending on where the request enters:

- `@consult` (questions / exploration)
- **design** tab (new idea → brainstorm)
- `@from-issue #NN` (existing issue)
- `@debug` (bug / regression)

→  brainstorming / to-spec → @architect (if cross-cutting) → /issue (tickets) or writing-plans → executing-plans → @tdd (per task) → verification-before-completion → /check → @code-review

`/router` maps a free-form request to the right on-ramp. Trivial
zero-behavior-delta changes (typos, docs, RCS headers, style-only, patch deps,
test-only fixes) skip the pipeline — see the brainstorming skill's fast-path.

```text
brainstorming / to-spec → @architect (if cross-cutting) → /issue (tickets) or writing-plans → executing-plans → @tdd (per task) → verification-before-completion → /check → @code-review
```

1. **Brainstorm** the change (brainstorming skill) → spec in `docs/specs/`, or synthesize a settled design with `to-spec`.
2. **Prototype** (if technical viability is uncertain) → throwaway code to answer the question, then delete (prototype skill).
3. **Plan** the implementation (writing-plans skill) → plan in `docs/plans/`.
4. **Execute** the plan (executing-plans skill) → dispatch tasks to `@tdd`, review between tasks.
5. **Implement** each task via `@tdd` (Red → Green → Refactor, vertical slices).
6. **Verify** completion (verification-before-completion skill).
7. **Gate** with `/check` (lint + coverage 80%).
8. **Review** with `@code-review` before push.

For non-trivial or cross-cutting changes, run `@architect` after the spec and before ticketing/planning — it returns a go/no-go plus a parseable `ADR-required:` line. The ticketing skill (`/issue`) checks this line before slicing a spec into tasks.
For bugs, use `@debug` (disciplined 6-phase loop) before `@tdd` on the fix.
For architectural entropy, run `/improve-architecture` on a cadence.

## Linting & Enforcement

Linting is enforced by `.github/hooks/pre-commit` — it blocks commits on failure.  
Commit message format is enforced by `.github/hooks/commit-msg` via commitlint.  
To activate hooks after cloning: `bash .github/scripts/install-hooks.sh`

For linting details and responsive/mobile-first CSS rules, see `scss-mobile-first` skill.

## Git Workflow

- Branches: `main` (production), `develop` (integration)
- Feature/work branches: `<type>/<username>-<hash>-<description>` per ADR-0028,
  created via `bash .github/scripts/new-branch.sh <type> <desc>`. Allowed types
  mirror commitlint vocabulary (minus `ignore`): feat, fix, patch, docs, style,
  refactor, perf, test, build, ci, chore, revert. Plus `release/<semver>` and
  `hotfix/<username>-<hash>-<description>`. Enforced by `prepare-commit-msg` hook.
- Commits: Conventional Commits format (type[scope]: subject) — see `conventional-commits` skill
- Signed commits required
- Every commit must include `Authored-by:` (sourced from `agent.plan.model` in `opencode.jsonc`), `Tested-by:` (sourced from `agent.code-review.model` in `opencode.jsonc` — the model ID segment after the last `/`), and `Signed-off-by:` (user) footers. `Signed-off-by:` is resolved dynamically via
`bash .github/scripts/resolve-identity.sh` (3-tier fallback per ADR-0029:
user-level `~/.config/opencode/setup.json` → project-level `.opencode/setup.json`
→ `git config user.name`/`user.email`). The `setup.json` default ships as
`kyau <git@kyaulabs.com>` until a user runs `/setup`. Issue-closing references use `Fixes: #NN` (Sentence-case, with colon; `Closes`/`Resolve`/`Fix`/etc. are rejected by commitlint), placed at the top of the footer immediately above `Authored-by:`. Use `Refs: #NN` for non-closing references.
- Model selection: all `model` and `variant` fields in `opencode.jsonc` use `{env:VAR}` substitution (e.g. `{env:OPENCODE_MODEL_PRIMARY}`, `{env:OPENCODE_VARIANT_PRIMARY}`) rather than hard-coded values. Per-agent model, variant, and temperature config lives in the `agent` section of `opencode.jsonc` — not in `.opencode/agents/*.md` frontmatter (the runtime does not support `model:`/`variant:` in sub-agent `.md` files — see ADR-0022). Defaults ship in `.opencode/setup.json` (models section), sourced automatically via direnv `.envrc`. Use `/setup` to configure models and variants per-tier. Five tiers: PRIMARY, PLANNER, DESIGN, JUDGE, UTILITY. `temperature` remains a hard-coded literal (confirmed infeasible for `{env:VAR}`). Primary agents that omit `model:` inherit the top-level `model` (which itself is `{env:VAR}` — resolved at runtime). `.opencode/agents/*.md` files carry `description`, `mode`, `temperature` (literal), and `permission` only. See ADR-0012, ADR-0013, ADR-0014, and ADR-0022. For guidance on picking `variant` / `temperature` for a non-default model, see `.opencode/docs/model-configuration.md`.
- No squash merges. Each logical change is its own atomic commit — the git history serves as the development and evaluation log. A pre-push hook warns on single-commit branches that look like squashes.

After implementing any change — whether via @tdd, a direct fix, an issue
tracker resolution, or a fast-path trivial change — produce a commit message
in conventional commits format before committing. Load the
`conventional-commits` skill and produce: type[scope]: subject + Authored-by +
Tested-by + Signed-off-by footers. The commit-msg hook blocks invalid messages,
but the
message should be well-formed before you reach the hook.

### Commit and push permissions

- **`@tdd`** and **`@resolve-merge-conflicts`** are permitted to `git add` and
  `git commit` — commits happen inside disciplined cycles where the commit
  message is presented to the user before execution.
- The **`build`** primary agent prompts (`ask`) before `git add` or
  `git commit` — the user sees the full command including the commit message in
  the approval dialog. Used by `/release`, `/build-assets`, and design-document
  commits from `brainstorming`.
- **`git push`** is denied to **every agent**. Only the human pushes.

## Build Pipeline

SCSS: `sass --style=compressed cdn/sass/source.scss cdn/css/output.min.css`
JS:   `uglifyjs cdn/js/source.js -o cdn/javascript/output.min.js -c -m`
Assets are built manually. No watchers.

## Dependency Lockfiles

> [!IMPORTANT]
> `composer.lock` and `package-lock.json` are committed to the repository.
> This ensures deterministic, auditable dependency trees and allows
> `audit-deps` to scan known vulnerabilities on a fresh clone without
> installing unvetted packages first.

After any dependency change (adding, removing, or updating a package),
regenerate and commit the updated lockfiles:

```bash
composer update   # regenerates composer.lock
npm install       # regenerates package-lock.json
git add composer.lock package-lock.json
```

## Aurora Framework

Submodule at `aurora/`. Entry: `require_once(__DIR__ . "/../aurora/aurora.inc.php")`  
For the standard page template, see the `aurora-page` skill.

## LSP (Language Server Protocol)

opencode's LSP integration is enabled. LSP servers provide real-time
diagnostics and code intelligence to the agent.

**Enabled servers:** PHP Intelephense (`.php`), TypeScript (`.ts`/`.js`),
ESLint (`.js`/`.ts`), Bash (`.sh`), YAML (`.yaml`/`.yml`), Stylelint
(`.css`/`.scss`). Deno LSP is explicitly disabled (conflicts with TypeScript
LSP; project is not a deno project).

**Experimental LSP tool:** The `lsp` tool (go-to-definition, find-references,
hover, call-hierarchy) is gated by a top-level `permission.lsp: "deny"`
default in `opencode.jsonc`. Seven agents explicitly opt in with `lsp: "allow"`:
`build`, `explore`, `general`, `chat`, `@tdd`, `@debug`, and `@docs-writer` — agents
that write PHP or navigate code semantically (Intelephense premium fills the
gap left by the absence of `psalm`/`phpstan` in `composer.json`). All other
agents (`plan`, `@architect`, `@code-review`, `@semgrep`, `@test-audit`,
`@resolve-merge-conflicts`, `compaction`, `title`, `summary`, `judge`)
inherit the `deny` default.

## Experimental OpenCode Features

Three experimental opencode features are enabled via environment variables
auto-sourced from `.opencode/setup.json` (experimental section — sourced by `.envrc`
via direnv — see `ADR-0024`). Run `direnv allow` after cloning or after this
file changes. Users without direnv: add `source /path/to/repo/.envrc` to
their shell profile.

| Flag | Purpose | Status |
| --- | --- | --- |
| `OPENCODE_EXPERIMENTAL_LSP_TOOL=true` | Enables the Intelephense `lsp` tool for six agents (see above) | Auto-sourced (was manual-export; consolidated per ADR-0024) |
| `OPENCODE_EXPERIMENTAL_SCOUT=true` | Enables the built-in `@scout` experimental subagent (ADR-0005 delegate — web research, clone upstream deps) | Auto-sourced |
| `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` | Enables background subagent tasks (see `/research --background`) | Commented — gated on ADR-0024 Phase-0 spike |

See `.opencode/docs/lsp.md` for LSP configuration details, troubleshooting,
and server prerequisites. See `.opencode/docs/research.md` for `@scout` usage
and `/research --background` semantics.

## MCP Servers

Optional, opt-in. Two MCP servers are defined commented-out under the `mcp`
key in `opencode.jsonc` (deepseek-websearch, mcp-searxng). Keys flow via
`setup.json`'s `env` section → `.envrc` → `{env:VAR}`; `DEEPSEEK_API_KEY`
serves both the deepseek-websearch MCP and Graphify's native `--backend
deepseek`. Full setup guide, backend reference, and troubleshooting:
`.opencode/docs/mcp.md`. Decision record: ADR-0032.

## Skills Available

Load these on demand when the task requires them:

| Skill | When to use |
| --- | --- |
| `brainstorming` | Before any creative work — features, components, behavior changes. Grilling → design → spec |
| `grilling` | Interviewing a user one question at a time — facts-vs-decisions, reassess loop, recommended answer, confirmation gate. Loaded by brainstorming, @consult (planned), @from-issue (planned) |
| `prototype` | Answering a technical viability question with throwaway code before committing to a plan |
| `to-spec` | Turning the current conversation into a spec WITHOUT interviewing — synthesis only. Sketches test seams, uses CONTEXT.md + ADRs, writes docs/specs/ |
| `writing-plans` | After brainstorming approval — produces a bite-sized TDD implementation plan |
| `executing-plans` | After writing-plans — dispatches tasks to @tdd with two-mode execution (inline or dispatch), per-task review gates, and halt/re-plan policy |
| `ticketing` | Creating a GitHub issue/ticket or decomposing a plan or spec into an epic with vertical-slice task sub-issues — single source of the commit-type→issue-type mapping, custom fields, labels, gh pattern, mode auto-detection, vertical-slice decomposition with native blocking edges |
| `finding-duplicate-functions` | Scanning for semantic duplication — two-phase (classical extraction + LLM intent-clustering), complements /improve-architecture's deletion test |
| `finishing-a-development-branch` | When a feature branch is complete — verify readiness (checklist), present disposal options (merge/PR/keep/discard), enforce no-squash policy |
| `verification-before-completion` | Before declaring a task done — verifies tests pass, no debug artifacts, lint clean |
| `wayfinder` | Work too big or too foggy for one session — chart it as a shared map of investigation tickets on GitHub Issues, resolve one at a time, merge to `to-spec` |
| `graphify` | Exploring codebase structure, call paths, or symbol relationships via Graphify's knowledge graph — especially when `graphify-out/graph.json` exists |
| `rcs-header` | Creating or modifying any source file |
| `receiving-code-review` | Triaging and responding to @code-review findings — severity triage matrix, anti-over-compliance rules, deferral discipline |
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
| `opencode-docs` | Vendored opencode.ai/docs reference — config schemas, plugin hooks, permission rules, SDK API. Load instead of guessing or calling /research |
| `pest-browser` | Writing browser tests |
| `audit-deps` | Scanning PHP/JS dependencies for known CVEs |
| `writing-skills` | Authoring new skills, agents, commands, or docs in `.opencode/` |
| `research-background` | Load when `/research --background` is invoked — documents the background-subagent contract and the ADR-0024 Phase-0 gating spike |

## Agents Available

| Agent | Mode | When to use |
| --- | --- | --- |
| `@tdd` | subagent | Any new feature or bug fix requiring tests |
| `@test-audit` | subagent | Auditing an existing test suite for quality |
| `@code-review` | subagent | Reviewing staged changes before push |
| `@architect` | subagent | Read-only evaluation of a proposed change against `CONTEXT.md` + ADRs before implementation |
| `@resolve-merge-conflicts` | subagent | Resolving in-progress git merge/rebase conflicts |
| `@semgrep` | subagent | SAST scanning — diff audit + full scan (PHP/JS/secrets) |
| `@standards-review` | subagent | Read-only review agent applying Fowler's 12 code smells as a structural-review baseline against the diff; reports by severity, does not auto-fix |
| `@spec-review` | subagent | Read-only review agent that checks requirement coverage — finds the spec for the current branch and reports whether acceptance criteria are covered by the diff; does not auto-fix |
| `@debug` | subagent | Investigating bugs — disciplined 6-phase loop: feedback loop → reproduce → hypothesise → instrument → fix → post-mortem. Build-mode agent with scoped investigation write (repro tests, harnesses, instrumentation); not invocable from Plan mode. |
| `@docs-writer` | subagent | Generating PHPDoc, RCS headers, and documentation |
| `@consult` | subagent | Conversational project exploration — runs grilling, writes glossary terms + ADRs, never enters the engineering pipeline |
| `@from-issue` | subagent | Issue on-ramp — fetches an existing GitHub issue, classifies type, grills one-at-a-time, applies one Type + one Progress value, analyzes, plans, halts for approval, and dispatches @tdd; routes bugs to @debug and chores to the fast-path |
| `@explore` | subagent | Focused codebase exploration — read-only. Answers the caller's question with the minimum scoped context needed; Graphify-first when a knowledge graph exists, falls back to glob/grep/read + LSP. Does not modify files, dispatch subagents, or run shell commands outside a read-only allowlist. |

## Commands

| Command | Purpose |
| --- | --- |
| `/prime` | Draft or regenerate `CONTEXT.md` from the codebase |
| `/check` | Pre-push gate: php-cs-fixer + stylelint + eslint + pest --coverage (80%) |
| `/release` | git-cliff changelog + signed tag + `gh release` command |
| `/deploy` | Post-pull production deploy — asset rebuild, opcache clear, log tail |
| `/router` | Route free-form user intent to the right entry point (on-ramp, agent, or fast-path) |
| `/research` | Cited research via `@scout` + web (see `.opencode/docs/research.md`). Pass `--background` for async dispatch (requires Phase-0 spike). |
| `/build-assets` | Rebuild minified CSS and JS from source |
| `/security` | SAST scan + dependency CVE audit in one pass |
| `/improve-architecture` | Scan codebase for deepening opportunities → Obsidian markdown report |
| `/handoff` | Compact current conversation into a handoff document for another session |
| `/setup` | Interactive project configurator — replaces `<app>`/`<domain>`/`[EMAIL]` placeholders across the harness, sets accent theme |
| `/setup-labels` | Idempotently create/update standardized issue labels on the GitHub repo via `gh label` |
| `/doctor` | Toolchain health check — verifies dev tools are installed at version floors; reports PASS/FAIL/SKIPPED table + go/no-go summary |
| `/teach` | Explain recently completed work at the user's level — what changed, why this approach, what trade-offs were considered |
| `/issue` | Create a single issue, or decompose a plan/spec into an epic with vertical-slice tasks. Auto-detects mode from the argument. Aliases: `/ticket` (singular), `/issues`, `/tickets` (plural = from-spec only) |
| `/ticket` | Alias of `/issue` — create a single issue, or decompose a plan/spec (singular mode) |
| `/issues` | Decompose a plan or spec into a GitHub epic with vertical-slice task issues and native blocking edges. Alias: `/tickets` |
| `/tickets` | Alias of `/issues` — from-spec decomposition into epic + vertical-slice tasks |
| `/graph` | Build, query, and manage the Graphify knowledge graph (modes: build, query, path, explain, update, status) |

