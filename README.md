# <img src=".github/media/prism-icon.svg" alt="Prism Icon" height="38" align="absmiddle"/> Prism

[https://kyaulabs.com/](https://kyaulabs.com/)

[![Contributor Covenant](https://img.shields.io/badge/contributor%20covenant-2.1-4baaaa.svg?logo=open-source-initiative&logoColor=4baaaa)](CODE_OF_CONDUCT.md)
[![Conventional Commits](https://img.shields.io/badge/conventional%20commits-1.0.0-fe5196?style=flat&logo=conventionalcommits)](https://www.conventionalcommits.org/en/v1.0.0/)
[![GitHub](https://img.shields.io/github/license/kyaulabs/prism?logo=gnu)](LICENSE)
[![Semantic Versioning](https://img.shields.io/github/v/release/kyaulabs/prism?include_prereleases&logo=semver&sort=semver)](https://semver.org)\
[![Gitleaks](https://img.shields.io/badge/protected%20by-gitleaks-blue?logo=git&logoColor=seagreen&color=seagreen)](https://github.com/zricethezav/gitleaks)
[![Discord](https://img.shields.io/discord/88713030895943680?logo=discord&color=blue&logoColor=white)](https://discord.gg/DSvUNYm)

## About

Prism is a coding harness for [pi](https://pi.dev) (a minimal, extensible
terminal coding agent by earendil-works), built for developing PHP-based
websites the test-driven way. It codifies an end-to-end engineering pipeline —
brainstorm → plan → implement → verify → review — into a layered system of
**skills**, **prompt templates**, and **one safety extension**, shipped as two
pi packages: a language-agnostic `prism-core` (installed globally, always
running) and a `prism-php-web` stack adapter (installed per project).
Mandatory TDD (Red → Green → Refactor), an 80% line-coverage gate,
Conventional Commits with signed atomic history, and ADR-driven documentation
keep every change small, verifiable, and ship-ready.

Prism embraces pi's philosophy — **no tabs, no sub-agents, no plan mode, no
MCP** — and re-expresses the harness's pipeline, discipline, and safety as
pi-native skills + prompt templates + one extension. A single agent runs the
whole pipeline by loading skills on demand (ADR-0055).

* [About](#about)
* [Install](#install)
  * [Quick start](#quick-start)
  * [Dependencies](#dependencies)
  * [Coverage driver](#coverage-driver)
  * [Gitleaks](#gitleaks)
  * [Harness tools](#harness-tools)
  * [Test setup](#test-setup)
* [Git Hooks](#git-hooks)
* [Issue Labels](#issue-labels)
* [Coding Harness](#coding-harness)
  * [Quick-start loop](#quick-start-loop)
  * [The pipeline (skills you load)](#the-pipeline-skills-you-load)
  * [pi mapping](#pi-mapping)
  * [Model strategy](#model-strategy)
  * [Prompt templates (slash commands)](#prompt-templates-slash-commands)
  * [Skills (on-demand)](#skills-on-demand)
  * [Project context — living docs](#project-context--living-docs)
* [Conventional Commits](#conventional-commits)
  * [Type](#type)
  * [Scope](#scope)
  * [Subject](#subject)
  * [Body](#body)
  * [Footer](#footer)
  * [Examples](#examples)
* [Changelog](#changelog)
  * [Manual changelog](#manual-changelog)
* [Attribution](#attribution)

## Install

Prism is two pi packages living under `packages/`:

| Package | Scope | Installs |
| --- | --- | --- |
| `@kyaulabs/prism-core` | **Global** — always running | skills, prompts, the safety extension, and the always-on `~/.pi/agent/AGENTS.md` |
| `@kyaulabs/prism-php-web` | **Project-local** — opt-in per PHP project | `php-web-stack`, `tdd-php`, `rcs-header`, `aurora-page`, and the adapter `safe-dirs.json` |

### Quick start

1. **Install pi:**

   ```bash
   npm install -g --ignore-scripts @earendil-works/pi-coding-agent
   # or: curl -fsSL https://pi.dev/install.sh | sh
   ```

2. **Authenticate the model.** Prism targets DeepSeek (a built-in pi provider):

   ```bash
   pi            # then /login → select your provider
   ```

   Model and thinking selection is yours at any time — **Ctrl+P** cycles
   models, **Shift+Tab** sets thinking (see [Model strategy](#model-strategy),
   ADR-0067).

3. **Install the core globally** (from a clone of this repo — the dev path):

   ```bash
   git clone <this repo> && cd prism
   bash packages/prism-core/scripts/install-global.sh
   ```

   `install-global.sh` runs `pi install` on the local package **and** deploys
   the always-on `~/.pi/agent/AGENTS.md` + `APPEND_SYSTEM.md` (pi packages
   install skills/prompts/extensions but not `AGENTS.md` — ADR-0060). It is
   idempotent: a pre-existing user-owned `AGENTS.md` is backed up to `*.bak`
   and the prism block is appended (pi concatenates all `AGENTS.md` into every
   session). The installer runs offline local-only readiness and never creates
   OCR consent or performs a live provider test. Run `/setup` afterward to
   inspect or grant global standing OCR consent and complete full readiness.

   Published-package equivalent:

   ```bash
   pi install npm:@kyaulabs/prism-core
   bash ~/.pi/agent/npm/@kyaulabs/prism-core/scripts/install-global.sh
   ```

4. **Install the PHP/web adapter inside a PHP project** (where
   `composer.json` or `aurora/` is present):

   ```bash
   cd /path/to/php-project
   # from a clone (works today — npm publish is deferred, see Stage 7):
   pi install -l /path/to/prism/packages/prism-php-web
   # once published:  pi install -l npm:@kyaulabs/prism-php-web
   ```

   On first run pi asks to **trust** the project (or save the decision with
   `/trust`) so project-local resources load.

5. **Tune resources** (optional): `pi config` enables/disables individual
   skills, prompts, and extensions; `pi config -l` edits project overrides.

This very repository **dogfoods** both packages from disk via
[`.pi/settings.json`](.pi/settings.json) (skills/prompts/extension point at
`../packages/...`), so a `pi` session opened here loads the core + adapter
without any install step.

### Dependencies

Install project dependencies via Composer and npm.

```text
composer install
npm install
```

### Test setup

No test-harness setup step is needed — `tests/Unit/Harness/ArchTest.php` ships
pre-configured with filesystem-walker arch tests (no debug functions,
strict types). The seven test subdirectories (`Unit`, `Feature`,
`Integration`, `Browser`, `Plugin`, `Semgrep`, `Shell`) are also
pre-created.

Run the test suite after `composer install`:

```text
prism-tool run pest -- --coverage
```

The coverage gate enforces ≥80% line coverage on changed PHP files via
`packages/prism-php-web/scripts/coverage-gate.php`, wired into both CI and
`/check-php`. When you add new source directories, register them in
`phpunit.xml`'s `<source>` block so they enter the coverage denominator.

| Tool | Via | Purpose |
| --- | --- | --- |
| php-cs-fixer | Composer | PHP code style (PSR-12) |
| pestphp/pest | Composer | Testing framework (TDD) |
| pestphp/pest-plugin-browser | Composer | Browser tests (Playwright) |
| sass | npm | SCSS → CSS compilation |
| uglify-js | npm | JavaScript minification |
| eslint | npm | JavaScript linting |
| stylelint | npm | SCSS linting |
| commitlint | npm | Commit message validation |
| @commitlint/config-conventional | npm | Conventional commits preset for commitlint |
| git-cliff | npm | Changelog generation (project-local wrapper) |
| playwright | npm | Browser testing |

Exact managed versions for every tool above are declared in the package
toolchain contracts (`packages/prism-core/toolchain.json` and
`packages/prism-php-web/toolchain.json`) and enforced by
`tests/Node/source-toolchain-parity.test.js`; the test baseline is Pest
5.1.1 on PHPUnit 13 with PHP 8.5+. See ADR-0063 for the bounded Semgrep/OCR
compatibility policy.

### Coverage driver

Pest's `--coverage` flag requires PCOV, a code coverage driver for PHP.
The project uses **PCOV 1.0.12** (floor) across all platforms.

| Platform | Install |
| --- | --- |
| Linux | `sudo pecl install pcov-1.0.12` |
| macOS | `sudo pecl install pcov-1.0.12` |
| Windows | Download the matching DLL from [PECL](https://pecl.php.net/package/pcov/1.0.12/windows) and add `extension=php_pcov.dll` to `php.ini` |

> PECL is deprecated in favor of PIE
> ([github.com/php/pie](https://github.com/php/pie)). Once PCOV publishes a
> PIE-compatible package, switch to `pie install <package>`.

#### Default-disabled pattern (recommended)

PCOV adds overhead to every PHP process. Configure it default-disabled and
enable only when running tests with coverage:

1. Create a conf.d drop-in (path varies by platform):

    ```bash
    # Linux example (adapt to your PHP conf.d directory):
    echo "pcov.enabled=0" | sudo tee /etc/php/8.5/mods-available/pcov.ini > /dev/null
    ```

2. Enable per-run with the `-d` flag:

    ```text
    prism-tool run pest -- --coverage
    ```

The project's `/check-php` prompt, the `tdd-php` skill, and the verification
skills already use the `-d pcov.enabled=1` flag. CI provisions PCOV enabled via
[shivammathur/setup-php](https://github.com/shivammathur/setup-php) and does
not need the flag.

### Gitleaks

Gitleaks scans commits for secrets at pre-commit time. Install globally via your package manager or from [gitleaks/releases](https://github.com/gitleaks/gitleaks/releases).

### Harness tools

Tools resolve through the `prism-tool` launcher, never from the checkout's
`node_modules`/`vendor`/PATH. Scope is owned by the package toolchain
contracts (`packages/prism-core/toolchain.json`,
`packages/prism-php-web/toolchain.json`) and ADR-0063:

| Tool | Scope | Purpose | Version policy |
| --- | --- | --- | --- |
| [pi](https://pi.dev) | runtime | The coding agent this harness targets | 0.84.1 (pinned) |
| [Semgrep](https://semgrep.dev) | mandatory external | SAST scanning (`/security`) | `>=1.173.0 <2.0.0` — verified, never installed |
| [OpenCodeReview (`ocr`)](https://alibaba.github.io/open-code-review/) | mandatory external | Code review (`code-review` skill) | `>=1.9.1 <2.0.0` — verified, never installed; full `/doctor` and dedicated review require global standing consent |
| [gitleaks](https://github.com/gitleaks/gitleaks) | generic control | Secrets scanning at pre-commit | 8.30.1 (pinned) |
| [GitHub CLI (`gh`)](https://cli.github.com) | optional | `/release` + `/pr` + `/setup-labels` + `/setup-rulesets` | any recent |
| commitlint / git-cliff | bundled core | Commit validation; changelog generation via `prism-tool run git-cliff` | exact contract versions |
| php-cs-fixer, Pest 5, Playwright, sass, uglify-js, eslint, stylelint | consumer-dev | PHP/web adapter gates | exact contract versions (Pest 5 on PHPUnit 13) |

`gh` is optional — only needed for `/release`, `/pr`, `/setup-labels`, and
`/setup-rulesets`; all other features work without it. `/pr` only prepares and
displays the `gh pr create` command — the human executes it after publishing
the branch. Registry access and consumer mutation remain separate
operation-specific approvals. `/setup` manages one global standing OCR consent
covering only provider connectivity and reviewed-code egress through
`prism-tool code-review ocr`; revoke it through `/setup` with
`prism-tool consent revoke-ocr`. Installation and CI use local-only readiness,
never create consent, and never run OCR review.

## Git Hooks

### Configuration

The repository ships with a `commitlint.config.js` using the project's
custom type-enum (see [Conventional Commits](#conventional-commits) below).
No generation step is required — edit the file directly only if you need to
add or remove commit types.

### Install Script

Run the install script once after cloning to activate the git hooks:

```text
bash packages/prism-core/scripts/install-hooks.sh
```

The script sets `git config core.hooksPath .github/hooks` — git's native
hooks mechanism. No symlinks are created, no files are backed up, and no
executable bits are changed. Git runs every hook in `.github/hooks/`
directly from the working tree.

> [!IMPORTANT]
>
> Setting `core.hooksPath` **silently supersedes** any hooks already in
> `.git/hooks/` — they stop firing for this repository. If you keep
> personal hooks there, migrate them into `.github/hooks/` or unset the
> config (`git config --unset core.hooksPath`) to restore them.

Six hooks are activated:

| Hook | Behavior |
| --- | --- |
| `pre-commit` | PHP syntax check, php-cs-fixer, Stylelint, ESLint, Shellcheck, gitleaks, and an idempotent RCS header normalizer that auto-adds/repairs headers on staged source files. |
| `commit-msg` | commitlint against the project type-enum. Fails closed — blocks the commit when `commitlint` is not installed; run `npm install` to restore the local toolchain. |
| `prepare-commit-msg` | Blocks commits directly on `main`/`develop` (protected branches — see ADR-0044); enforces branch naming via `validate-branch-name.sh`. Also blocks `--amend` of a commit already pushed to a remote. Blocks `-c HEAD` / `-C HEAD` (indistinguishable from `--amend` in this hook) — use an explicit SHA as a workaround. |
| `pre-push` | **Hard gate:** blocks pushes targeting `refs/heads/main` and `refs/heads/develop` (PR-only — see ADR-0044); blocks non-fast-forward pushes (rewrites of published history from `amend`/`rebase`/`reset`). **Soft gate:** warns on single-commit pushes that look like squashes (no-squash policy). |
| `post-checkout` | `git submodule update --init --recursive`. |
| `post-merge` | `git submodule update --init --recursive`. |

## Issue Labels

Issue labels use a two-axis vocabulary built on GitHub's native fields, supplemented by optional navigation and context labels. The canonical reference is [`docs/agents/labels.md`](docs/agents/labels.md).

Every issue carries **exactly one** value on each primary axis:

### Type — what the issue is

Tracked via GitHub's native **issue-type** field (not labels). Types mirror Conventional Commits so an issue and its resolving commit share a vocabulary.

| Type | Description | Commit |
| :--- | --- | :---: |
| `Bug` | Unexpected problem or unintended behavior | `fix` |
| `Feature` | New feature, capability, or enhancement | `feat` |
| `Patch` | Small, incremental fix or update | `patch` |
| `Documentation` | Additions or changes to documentation | `docs` |
| `Performance` | Speed or efficiency improvement | `perf` |
| `Refactor` | Restructuring with no behavior change | `refactor` |
| `Style` | Formatting or styling, no logic impact | `style` |
| `Test` | Adding or updating tests | `test` |
| `CI/CD` | Build, CI, or deployment pipeline changes | `ci` |
| `Chore` | Miscellaneous maintenance | `chore` |
| `Security` | Security vulnerability or related fix | `fix` |

### Progress — where the issue is in its lifecycle

Tracked via GitHub's native **Progress** field (not labels).

| Value | Description |
| :--- | --- |
| `Under Construction` | Beginning stages |
| `In Progress` | Actively being worked on |
| `Testing` | Testing ideas or methods |
| `Complete` | Complete |

### Optional labels

**Wayfinder** labels (`epic`, `task`, `wayfinder:map`, `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, `wayfinder:task`) track epic/task relationships and the `wayfinder` skill's decision-map tickets.

**Meta** labels (`brainstorming`, `research`, `request for comments`, `help wanted`, `good first issue`, `plan`, `needs-info`, `ready-for-agent`, `duplicate`, `invalid`, `on hold`, `won't fix`) provide context and workflow signals.

See [`docs/agents/labels.md`](docs/agents/labels.md) for the full vocabulary with colors, additional `Priority` / `Effort` / `Start date` / `Target date` fields, and the invariants that govern the system.

## Coding Harness

This template ships with a [pi](https://pi.dev) coding harness — a collection
of skills, prompt templates, and one safety extension that enforce project
conventions during AI-assisted development. The harness lives under
`packages/prism-core` (language-agnostic, global) and `packages/prism-php-web`
(PHP/web adapter, project-local), wired into pi via the `pi` manifest in each
`package.json`.

**Reference docs:**

* **`packages/prism-core/AGENTS.md`** — global AI-facing instructions: hard boundaries, conventions, the pipeline, and the skills/commands index (deploys to `~/.pi/agent/AGENTS.md`, loaded every session)
* **`CODING_HARNESS.md`** — orientation guide: pi mapping, pipeline overview, and pointers (the agent loads `AGENTS.md` as the authoritative source)
* **`CONTEXT.md`** — domain glossary, entities, invariants, boundaries, non-goals (living doc — agents read and update it)
* **`adr/`** — Architecture Decision Records in Nygard format (living docs — supersede, don't edit)
* **`NOTICE`** — Third-party attribution and provenance

### Quick-start loop

New ideas enter through the **brainstorming** skill front door. Pre-spec work
that is oversized — multiple independent subsystems, or unknowns that cannot
be expressed as sharp questions — branches to `wayfinder` before detailed
grilling; the sole exception is strict greenfield, whose walking-skeleton
bootstrap (scaffold plus one thin vertical slice) precedes wayfinding
(ADR-0050).

The full engineering pipeline, end to end — a **single agent** loading skills
on demand (no tabs, no sub-agents — ADR-0055):

```text
brainstorming / to-spec → prototype (if needed) → architect (if cross-cutting) → /issue (tickets) or writing-plans → executing-plans → tdd (per task) → verification-before-completion → /check → code-review
```

1. **Brainstorm** — load the `brainstorming` skill; refine the idea through one-question-at-a-time grilling, propose 2–3 approaches, present the design in sections, get user approval. Saves a spec to `docs/specs/`.
2. **Prototype** (if needed) — load the `prototype` skill; build throwaway code to answer technical viability questions before committing to a plan. Delete after capturing the answer.
3. **Plan** — load the `writing-plans` skill; break the approved spec into bite-sized TDD tasks with exact file paths, interfaces, complete code, and verification commands. Saves a plan to `docs/plans/`.
4. **Execute** — load the `executing-plans` skill; implement each task inline using the `tdd` skill, with review gates between tasks. Halt and re-plan if a task reveals a design flaw.
5. **Implement** — load the `tdd` skill per task (Red → Green → Refactor, vertical slices). The harness enforces 80% line coverage (adapter `tdd-php`).
6. **Verify** — load the `verification-before-completion` skill; re-run tests, confirm green, confirm no debug artifacts remain, confirm lint passes.
7. **Commit** — after green verification, create each signed ordinary commit with one standalone `prism-tool commit create`; attribution, hooks, signing, and verification are launcher-owned. Any failed attempt blocks tools until `/reload`.
8. **Finalize** — load `finishing-a-development-branch`; after artifact cleanup it pauses once, then an accepted attempt synchronizes, attests, runs `/check`, performs all four `code-review` axes, revalidates SHAs, and invokes preparation-only `/pr` automatically. A conflict, failed gate, unresolved finding, or stale attestation stops before `/pr`; repair requires fresh finalization acceptance.

For non-trivial or cross-cutting changes, run the `architect` skill after the
spec and before ticketing/planning — it returns a go/no-go plus a parseable
`ADR-required:` line. The ticketing skill (`/issue`) checks this line before
slicing a spec into tasks. For bugs, prepend the `debug` skill before `tdd`
on the fix. For architectural entropy, run `/improve-architecture` on a
cadence.

### The pipeline (skills you load)

Under pi there are **no primary tabs and no sub-agents** (ADR-0055). One agent
runs everything; you load a skill when the task calls for it. The opencode-era
"Build / Plan / Design" tabs and fifteen `@subagents` collapsed into skills
whose bodies are the former agent prompts. Two accepted trade-offs (ADR-0055):
plan-read-only and per-skill gating are now **instruction-only** (no tool-level
gate), and **the harness prescribes no models** — model and thinking are yours to set
at any time (see [Model strategy](#model-strategy)). Cheap rollback comes from pi session branching
(`/tree`, `/fork`); slips are caught by `verification-before-completion` and
`code-review`.

| Skill (load on demand) | Replaces opencode-era |
| --- | --- |
| `brainstorming` | the design tab |
| `tdd` | the `@tdd` subagent |
| `architect` | the `@architect` subagent |
| `code-review` | the `@code-review` subagent |
| `debug` | the `@debug` subagent |
| `consult` / `from-issue` / `explore` | the matching `@subagents` |
| `writing-plans` / `executing-plans` | plan-tab planning + dispatch |

### pi mapping

| opencode concept | prism-on-pi destination |
| --- | --- |
| `AGENTS.md` (always loaded) | `packages/prism-core/AGENTS.md` → `~/.pi/agent/AGENTS.md` (global, concatenates into every session) |
| `opencode.jsonc` config | `~/.pi/agent/settings.json` + built-in DeepSeek provider |
| `.envrc` / direnv / `prism.jsonc` / six-tier models | **deleted** — model-agnostic; selection is the human's (ADR-0067) |
| Primary tabs (build/plan/design/chat) | **collapsed** → pipeline skills |
| Fifteen `@subagents` | **collapsed** → skills |
| `.opencode/skills/*/SKILL.md` | `packages/*/skills/*/SKILL.md` (Agent Skills standard) |
| `.opencode/commands/*.md` | `packages/*/prompts/*.md` (pi prompt templates) |
| per-tool permission matrix | AGENTS.md hard-boundary prose + the **one** safety extension |
| `sensitive-paths` + `pre-tool-use` + `denial-circuit-breaker` plugins | `packages/prism-core/extensions/safety/` (the sole extension, ADR-0056) |
| `session-bootstrap` plugin | `~/.pi/agent/APPEND_SYSTEM.md` (pi-native, no extension) |
| MCP servers (deepseek-websearch, searxng) | `websearch` + `searxng` CLI-shell skills (pi: "No MCP") |

### Model strategy

There is **no manifest/env tier layer** (ADR-0067). The harness prescribes,
names, restricts, and suggests no model:

- **Model:** cycle with **Ctrl+P** at any time.
- **Thinking:** raise/lower with **Shift+Tab**.
- **Auth:** `/login` for your provider or export the provider's API key.
- **Session defaults:** run `/setup` to write your preferred provider,
  default model, Ctrl+P pool, and thinking level to your pi config — every
  question is skippable and the write is consent-gated.

Automatic tiering is gone by decision (B — ADR-0055/0057); review/audit run on
the primary unless the human (or the agent, by suggesting it) manually Ctrl+P's
to the judge.

### Prompt templates (slash commands)

Pi prompt templates expand via `/name`. The core package's prompts live in
`packages/prism-core/prompts/`; the adapter's in
`packages/prism-php-web/prompts/`.

| Command | Purpose |
| --- | --- |
| `/prime` | Draft or regenerate `CONTEXT.md` from the codebase |
| `/check` | Pre-push gate — language-agnostic checks, then delegates to the adapter stack gate (e.g. `/check-php`) |
| `/release` | Prepare a git-cliff changelog and release-branch PR; CI tags, publishes the GitHub Release, and opens the back-merge PR |
| `/pr` | Prepare a conventional title, template-complete body, and human-run `gh pr create` command without creating the PR |
| `/deploy` | Post-pull production deploy — asset rebuild, opcache clear, log tail |
| `/router` | Route free-form user intent to the right entry point (skill or fast-path) |
| `/research` | Cited research via the `websearch`/`searxng` skills + web |
| `/build-assets` | Rebuild minified CSS and JS from SCSS/JS sources |
| `/security` | SAST scan + dependency CVE audit in one pass |
| `/improve-architecture` | Scan codebase for deepening opportunities → Obsidian markdown report |
| `/handoff` | Compact current conversation into a handoff document for another session |
| `/setup` | Interactive project configurator and sole standing OCR-consent prompt; consent is global and revocable |
| `/setup-labels` | Idempotently create/update standardized issue labels on the GitHub repo via `gh label` |
| `/setup-rulesets` | Dry-run, confirm, apply, and verify the pr-only-integration GitHub ruleset and merge settings |
| `/doctor` | Full readiness check; validates standing consent before one OCR connectivity test, with no per-run approval prompt |
| `/teach` | Explain recently completed work — what changed, why, what trade-offs were considered |
| `/issue` | Create a single issue, or decompose a plan/spec into an epic with vertical-slice tasks. Aliases: `/ticket`, `/issues`, `/tickets` |

pi's own built-in commands (`/login`, `/model`, `/settings`, `/tree`,
`/fork`, `/compact`, `/skill:name`, `/trust`, …) are always available — see
`/hotkeys` in a session.

### Skills (on-demand)

Skills load when the task matches — progressive disclosure: only descriptions
are always in context, full instructions load on demand via `read` or
`/skill:name`. The authoritative index lives in
[`packages/prism-core/AGENTS.md`](packages/prism-core/AGENTS.md); the adapter
adds the PHP/web skills.

| Category | Skills |
| --- | --- |
| Engineering pipeline | `brainstorming`, `grilling`, `prototype`, `to-spec`, `writing-plans`, `executing-plans`, `ticketing`, `wayfinder`, `verification-before-completion` |
| Review triage | `receiving-code-review`, `code-review`, `spec-review`, `standards-review`, `test-audit` |
| Branch lifecycle | `finishing-a-development-branch` |
| Architecture hygiene | `systems-design`, `architect`, `finding-duplicate-functions` |
| Core discipline | `tdd`, `security-coding`, `credential-protection`, `conventional-commits`, `audit-deps`, `domain-context`, `adr`, `debug`, `explore`, `consult`, `from-issue`, `resolve-merge-conflicts`, `tracker-operator`, `docs-writer`, `writing-skills`, `pi-docs`, `research-background` |
| PHP/web adapter | `php-web-stack`, `tdd-php`, `rcs-header`, `aurora-page`, `database`, `security-coding-php`, `pest-browser`, `scss-mobile-first`, `accessibility`, `frontend-architecture`, `frontend-design` |
| Search (replaces MCP) | `websearch`, `searxng` |

### Project context — living docs

* **`CONTEXT.md`** — the domain's *what* and *why*: glossary, entities, invariants, boundaries, non-goals. Agents read it before domain-coupled work and update it when domain language changes. Draft a fresh one with `/prime`.
* **`adr/`** — Architecture Decision Records. Write an ADR (copy `adr/0000-template.md`) for hard-to-reverse or cross-cutting decisions. Supersede, never edit. Run the `architect` skill before `writing-plans` to check for ADR conflicts on non-trivial changes. (ADR-0055 banners records 0001–0054 as opencode-era; 0055+ are the pi era.)

## Conventional Commits

Stage exact intended files first. Run commit creation later as the only tool
call in its assistant batch, without compound shell syntax:

```bash
git add exact/files
```

```bash
prism-tool commit create --type feat --scope exact-scope --subject "exact subject"
```

The launcher renders this canonical message shape, resolves attribution,
validates with commitlint, runs signed Git with hooks enabled, and verifies
that `HEAD` advanced:

```text
<type>[optional scope]: <subject>

[optional body]

[optional footer(s)]
```

There is no per-commit approval pause. Any failed, unsafe, ambiguous, or
non-exclusive creation attempt aborts the agent and blocks every tool until
`/reload`.

### Type

```text
[required] (!empty) value = {
  'build',
  'chore',
  'ci',
  'docs',
  'feat',   # this correlates with MINOR in Semantic Versioning
  'fix',    # this correlates with PATCH in Semantic Versioning
  'patch',  # this correlates with PATCH in Semantic Versioning
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
  'ignore'  # this correlates with CHANGELOG ignores
}

A trailing ! indicates a BREAKING CHANGE (correlating with MAJOR in Semantic Versioning).
```

### Scope

```text
[optional] {lowercase | camelCase}

A noun describing a section of the codebase surrounded by parenthesis.
```

### Subject

```text
[required] (!empty) {lowercase | camelCase} (max-length: 100)

A short summary of the code changes, without a trailing full-stop.

Adding [skip ci] will skip all push and pull_request workflows.
```

### Body

```text
[optional] {freeform} (max-length: 100)

Longer commit body with additional contextual information about the code changes.
```

### Footer

```text
<token>: <value>
(max-length: 100)
token (Sentence-case) = {
  'Implemented-by',     # Required — launcher-resolved active implementation model
  'Tested-by',          # Required — launcher-resolved OCR review model
  'Signed-off-by',      # Required — launcher-resolved human identity
  'BREAKING CHANGE',    # Required when the type/scope includes !
  'Cc',
  'Fixes',
  'Helped-by',
  'Refs',
  'Reviewed-by',
}
```

Every ordinary commit includes `Implemented-by`, `Tested-by`, and
`Signed-off-by` footers in that order. `prism-tool commit create` resolves and
validates all three; callers never run attribution resolver scripts or write
these footers manually. Each model footer is the bare model ID segment after
the last `/` (ADR-0064): `provider/model-id` → `model-id`. Human identity uses
the Prism identity override or Git configuration and fails closed when absent.

**Issue-closing references** use `Fixes: #NN` (Sentence-case, with colon),
placed at the top of the footer block immediately above `Implemented-by:`.
commitlint rejects all other GitHub closing keywords (`Closes`, `Resolve`,
`Fix`, `Fixed`, etc.) and no-colon forms (`Fixes #42`). Use `Refs: #NN` for
non-closing references, in the same top-of-footer block.

### Examples

The following are examples of launcher-rendered valid messages. Do not copy
or manually construct their attribution footers. `prism-tool commit create`
validates the complete message with commitlint before mutation.

```text
feat(player): begin new implementation of input controller

As per #123 recommendation input controller is now based on blah.

Basic movement added.

Refs: #123
Refs: 676104e, a215868
Implemented-by: <active-model-id>
Tested-by: <ocr-model-id>
Signed-off-by: kyau <git@kyaulabs.com>
```

```text
fix: array parsing issue

Fixes: #42
Cc: Z
Implemented-by: <active-model-id>
Tested-by: <ocr-model-id>
Reviewed-by: Z
Signed-off-by: kyau <git@kyaulabs.com>
```

```text
chore(release): v0.0.1 [skip ci]
```

## Changelog

Once you have published at least one proper commit using conventional commits syntax you will be able to generate a changelog. Releases follow the two-half pipeline (ADR-0046):

1. **Authoring** — `/release` (see [Prompt templates](#prompt-templates-slash-commands)) prepares the git-cliff changelog and a `release/X.Y.Z` release-branch PR to `main`; a maintainer merges it.
2. **Publication** — merging the release PR triggers `release.yml`, which creates the `vX.Y.Z` tag and GitHub Release at the merge commit and opens the `main` → `develop` back-merge PR for a maintainer to merge.

Never create tags, Releases, or back-merge PRs locally — `release.yml` owns publication (ADR-0046). The low-level flow below is a fallback for preparing changelog content; it stops at a release-branch PR.

### Manual changelog

```bash
prism-tool run git-cliff -- --tag v0.0.1
```

After the initial run of git-cliff all subsequent runs should detect the version automatically.

```bash
prism-tool run git-cliff --
```

For a real release, use `/release`; it stages exact release artifacts and
creates one signed `chore(release)` commit through `prism-tool commit create`.
The procedure then displays human-run publication instructions. CI tags,
publishes, and opens the back-merge PR only after the release PR merges.

## Attribution

* [pi](https://pi.dev) (`@earendil-works/pi-coding-agent`, MIT, © earendil-works) — the coding agent this harness targets; extension/skill/prompt-template/package patterns
* [Aurora](https://github.com/kyaulabs/aurora) — the PHP framework included as a submodule
* [Pest](https://github.com/pestphp/pest) — the PHP testing framework (TDD)
* [php-cs-fixer](https://github.com/PHP-CS-Fixer/PHP-CS-Fixer) — PHP code style (PSR-12)
* [Commitlint](https://github.com/conventional-changelog/commitlint) — commit message validation
* [git-cliff](https://github.com/orhun/git-cliff) — changelog generation
* [Semgrep](https://github.com/semgrep/semgrep) — static analysis security testing
* [gitleaks](https://github.com/gitleaks/gitleaks) — secrets scanning at pre-commit
* [OpenCodeReview (ocr)](https://alibaba.github.io/open-code-review/) — code review tooling used by the `code-review` skill
* [Superpowers](https://github.com/obra/superpowers) — engineering pipeline and core skill methodology (MIT, © Jesse Vincent)
* [Superpowers Lab](https://github.com/obra/superpowers-lab) — two-phase semantic-duplication detection pattern (MIT, © Jesse Vincent)
* [Superpowers Developing for Claude Code](https://github.com/obra/superpowers-developing-for-claude-code) — vendored-official-docs skill pattern (MIT, © Jesse Vincent)
* [Matt Pocock's Skills](https://github.com/mattpocock/skills) — prototype pattern, grilling concept, domain-modeling approach (MIT, © Matt Pocock)
* [Anthropic Agent Skills](https://github.com/anthropics/skills) — SKILL.md format and skills specification (MIT, © Anthropic)
* [Gleb's Claude Skills](https://github.com/glebis/claude-skills) — TDD multi-agent architecture (MIT, © Gleb)
