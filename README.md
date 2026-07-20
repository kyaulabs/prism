# <img src=".github/media/prism-icon.svg" alt="Prism Icon" height="38" align="absmiddle"/> Prism

[https://kyaulabs.com/](https://kyaulabs.com/)

[![Contributor Covenant](https://img.shields.io/badge/contributor%20covenant-2.1-4baaaa.svg?logo=open-source-initiative&logoColor=4baaaa)](CODE_OF_CONDUCT.md)
[![Conventional Commits](https://img.shields.io/badge/conventional%20commits-1.0.0-fe5196?style=flat&logo=conventionalcommits)](https://www.conventionalcommits.org/en/v1.0.0/)
[![GitHub](https://img.shields.io/github/license/kyaulabs/prism?logo=gnu)](LICENSE)
[![Semantic Versioning](https://img.shields.io/github/v/release/kyaulabs/prism?include_prereleases&logo=semver&sort=semver)](https://semver.org)
[![Gitleaks](https://img.shields.io/badge/protected%20by-gitleaks-blue?logo=git&logoColor=seagreen&color=seagreen)](https://github.com/zricethezav/gitleaks)
[![Discord](https://img.shields.io/discord/88713030895943680?logo=discord&color=blue&logoColor=white)](https://discord.gg/DSvUNYm)

## About

Prism is a coding harness for [OpenCode](https://opencode.ai) (an AI coding agent), built for developing PHP-based websites the test-driven way. It codifies an end-to-end engineering pipeline — brainstorm → plan → implement → verify → review — into a layered system of skills, agents, and slash commands. Mandatory TDD (Red → Green → Refactor), an 80% line-coverage gate, Conventional Commits with signed atomic history, and ADR-driven documentation keep every change small, verifiable, and ship-ready.

* [About](#about)
* [Dependencies](#dependencies)
  * [Coverage driver](#coverage-driver)
  * [Gitleaks](#gitleaks)
  * [Harness tools](#harness-tools)
  * [Test setup](#test-setup)
* [Git Hooks](#git-hooks)
  * [Configuration](#configuration)
  * [Install Script](#install-script)
* [Issue Labels](#issue-labels)
* [Coding Harness](#coding-harness)
  * [Quick-start loop](#quick-start-loop)
  * [Primary agents](#primary-agents)
  * [Built-in subagents](#built-in-subagents)
  * [Custom agents](#custom-agents)
  * [Slash commands](#slash-commands)
  * [Skills (on-demand)](#skills-on-demand)
  * [Project context — living docs](#project-context--living-docs)
  * [Activation](#activation)
  * [Model Configuration](#model-configuration)
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

## Dependencies

Install project dependencies via Composer and npm.

```text
composer install
npm install
```

### Test setup

No bootstrap step needed — `tests/Unit/Harness/ArchTest.php` ships
pre-configured with filesystem-walker arch tests (no debug functions,
strict types). The seven test subdirectories (`Unit`, `Feature`,
`Integration`, `Browser`, `Plugin`, `Semgrep`, `Shell`) are also
pre-created.

Run the test suite after `composer install`:

```text
php -d pcov.enabled=1 vendor/bin/pest --coverage
```

The coverage gate enforces ≥80% line coverage on changed PHP files via
`.github/scripts/coverage-gate.php`, wired into both CI and `/check`.
When you add new source directories, register them in `phpunit.xml`'s
`<source>` block so they enter the coverage denominator.

| Tool | Via | Purpose |
| --- | --- | --- |
| php-cs-fixer | Composer | PHP code style (PSR-12) |
| pestphp/pest | Composer | Testing framework (TDD) |
| pestphp/pest-plugin-arch | Composer | Architecture tests |
| pestphp/pest-plugin-browser | Composer | Browser tests (Playwright) |
| sass | npm | SCSS → CSS compilation |
| uglify-js | npm | JavaScript minification |
| eslint | npm | JavaScript linting |
| stylelint | npm | SCSS linting |
| commitlint | npm | Commit message validation |
| @commitlint/config-conventional | npm | Conventional commits preset for commitlint |
| git-cliff | npm | Changelog generation |
| playwright | npm | Browser testing |

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
    php -d pcov.enabled=1 vendor/bin/pest --coverage
    ```

The project's `/check` command, `@tdd` agent, and verification skills already
use the `-d pcov.enabled=1` flag. CI provisions PCOV enabled via
[shivammathur/setup-php](https://github.com/shivammathur/setup-php) and does
not need the flag.

### Gitleaks

Gitleaks scans commits for secrets at pre-commit time. Install globally via your package manager or from [gitleaks/releases](https://github.com/gitleaks/gitleaks/releases).

### Harness tools

In addition to the Composer and npm dependencies above, the coding harness uses the following external tools. Install them on the dev machine to enable the corresponding agents:

| Tool | Purpose | Install | Known-good version |
| --- | --- | --- | --- |
| [OpenCode](https://opencode.ai) | The coding harness platform | See [opencode.ai/docs](https://opencode.ai/docs/) | 1.17.13 |
| [Semgrep](https://semgrep.dev) | SAST scanning (`@semgrep` agent) | `pip install semgrep` or [releases](https://github.com/semgrep/semgrep/releases) | 1.168.0 |
| [OpenCodeReview (`ocr`)](https://alibaba.github.io/open-code-review/) | Code review (`@code-review` agent) | [docs](https://alibaba.github.io/open-code-review/) | 1.7.1 |
| [gitleaks](https://github.com/gitleaks/gitleaks) | Secrets scanning at pre-commit | [releases](https://github.com/gitleaks/gitleaks/releases) | 8.30.1 |
| [jq](https://jqlang.github.io/jq/) | JSON extraction from setup.json (`.envrc` sourcing) | [download](https://jqlang.github.io/jq/download/) | 1.6+ |
| [GitHub CLI (`gh`)](https://cli.github.com) | `/setup` scaffold clone mode + `/release` | [cli/cli/releases](https://github.com/cli/cli/releases) | any recent |

> Recommended floor versions, not hard pins — refresh on each release. `gh` is
> optional — only needed for the `clone` option of `/setup`'s scaffold mode and
> for `/release`; `new`/`skip` scaffold options and all other features work
> without it.

## Git Hooks

### Configuration

The repository ships with a `commitlint.config.js` using the project's
custom type-enum (see [Conventional Commits](#conventional-commits) below).
No generation step is required — edit the file directly only if you need to
add or remove commit types.

### Install Script

Run the install script once after cloning to activate the git hooks:

```text
bash .github/scripts/install-hooks.sh
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
| `commit-msg` | commitlint against the project type-enum. Skips with a notice when `commitlint` is not installed (e.g. before `npm install`). |
| `prepare-commit-msg` | Blocks `--amend` of a commit already pushed to a remote. Also blocks `-c HEAD` / `-C HEAD` (indistinguishable from `--amend` in this hook) — use an explicit SHA as a workaround. |
| `pre-push` | **Hard gate:** blocks non-fast-forward pushes (rewrites of published history from `amend`/`rebase`/`reset`). **Soft gate:** warns on single-commit pushes that look like squashes (no-squash policy). |
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

This template ships with an [OpenCode](https://opencode.ai) coding harness — a collection of agents, skills, and commands that enforce project conventions during AI-assisted development. The harness lives under `.opencode/` and is wired into OpenCode via `opencode.jsonc`.

**Reference docs:**

* **`AGENTS.md`** — AI-facing instructions: stack, boundaries, conventions, and available tools (loaded by every session)
* **`CODING_HARNESS.md`** — Orientation guide: built-in features, pipeline overview, and pointers (agents load `AGENTS.md` as the authoritative source)
* **`CONTEXT.md`** — Domain glossary, entities, invariants, boundaries, non-goals (living doc — agents read and update it)
* **`adr/`** — Architecture Decision Records in Nygard format (living docs — supersede, don't edit)
* **`opencode.jsonc`** — Wires instructions + agent definitions + permissions into the coding agent
* **`docs/POSITIONING.md`** — Why this stack and harness exist (design rationale, differentiators)
* **`NOTICE`** — Third-party attribution and provenance

### Quick-start loop

The full engineering pipeline, end to end:

```text
brainstorming → prototype (if needed) → writing-plans → executing-plans → @tdd (per task) → verification-before-completion → /check → @code-review
```

1. **Brainstorm** — load the `brainstorming` skill; refine the idea through one-question-at-a-time grilling, propose 2–3 approaches, present the design in sections, get user approval. Saves a spec to `docs/specs/`.
2. **Prototype** (if needed) — load the `prototype` skill; build throwaway code to answer technical viability questions before committing to a plan. Delete after capturing the answer.
3. **Plan** — load the `writing-plans` skill; break the approved spec into bite-sized TDD tasks with exact file paths, interfaces, complete code, and verification commands. Saves a plan to `docs/plans/`.
4. **Execute** — load the `executing-plans` skill; dispatch tasks to `@tdd` with review gates between tasks. Halt and re-plan if a task reveals a design flaw.
5. **Implement** — invoke `@tdd` per task (Red → Green → Refactor, vertical slices). The harness enforces 80% line coverage.
6. **Verify** — load the `verification-before-completion` skill; re-run tests, confirm green, confirm no debug artifacts remain, confirm lint passes.
7. **Gate** — run `/check` (php-cs-fixer + stylelint + eslint + pest --coverage). On green, commit with a conventional message.
8. **Review** — invoke `@code-review` before push.

For non-trivial or cross-cutting changes, run `@architect` after the spec and before ticketing/planning — it returns a go/no-go plus a parseable `ADR-required:` line. The ticketing skill (`/issue`) checks this line before slicing a spec into tasks. For bugs, use `@debug` (disciplined 6-phase loop) before `@tdd` on the fix. For architectural entropy, run `/improve-architecture` on a cadence.

### Primary agents

| Agent | Purpose |
| --- | --- |
| **Build** | Default mode — full tool access; enforces mandatory `@tdd` and the project's hard boundaries |
| **Plan** | Restricted mode — analysis and planning only; cannot edit files or invoke code-modifying subagents |

Press `Tab` to switch between Build and Plan during a session.

### Built-in subagents

| Agent | Purpose |
| --- | --- |
| `@explore` | Read-only codebase exploration — file patterns, keyword search |
| `@scout` | External docs + dependency research (clones upstream repos) — built-in experimental; requires `OPENCODE_EXPERIMENTAL_SCOUT=true` (auto-sourced per ADR-0024) |
| `@general` | Multi-step research, full tool access |

### Custom agents

| Agent | When to use |
| --- | --- |
| `@tdd` | Any new feature or bug fix requiring tests (mandatory for new code) |
| `@test-audit` | Auditing an existing test suite for quality |
| `@code-review` | Reviewing staged changes before push (uses `ocr`) |
| `@architect` | Read-only evaluation of a proposed change against `CONTEXT.md` + ADRs before implementation |
| `@resolve-merge-conflicts` | Resolving in-progress git merge/rebase conflicts |
| `@semgrep` | SAST scanning — diff audit + full scan (PHP/JS/secrets) |
| `@standards-review` | Read-only review agent applying Fowler's 12 code smells as a structural-review baseline against the diff |
| `@spec-review` | Read-only review agent that checks requirement coverage against acceptance criteria from the matching spec |
| `@debug` | Investigating bugs — disciplined 6-phase loop: feedback loop → reproduce → hypothesise → instrument → fix → post-mortem. Build-mode agent with scoped investigation write (repro tests, harnesses, instrumentation); not invocable from Plan mode. |
| `@docs-writer` | Generating PHPDoc, RCS headers, and documentation |
| `@consult` | Conversational project exploration — runs grilling, writes glossary terms + ADRs, never enters the engineering pipeline |
| `@from-issue` | Issue on-ramp — classifies type, grills one-at-a-time, applies Type + Progress, analyzes, plans, and dispatches @tdd |

### Model Configuration

Models are assigned via environment variable substitution (`{env:VAR}`) in
`opencode.jsonc` — no hard-coded model IDs. Per-agent `model`, `variant`,
and `temperature` values live in the `agent` section of `opencode.jsonc`; the
`.opencode/agents/*.md` files carry only `description`, `mode`, `temperature`
(hard-coded literal), and `permission` (see ADR-0022 — the runtime rejects
`model:`/`variant:` in sub-agent frontmatter). Five tiers, each mapped to a
different `OPENCODE_MODEL_*` env var:

| Tier | Env Var | Default | Agents |
| --- | --- | --- | --- |
| Primary | `OPENCODE_MODEL_PRIMARY` | `deepseek/deepseek-v4-pro` | build, tdd, architect, code-review, consult, debug, resolve-merge-conflicts, spec-review, standards-review, test-audit, general, explore |
| Planner | `OPENCODE_MODEL_PLANNER` | `openrouter/z-ai/glm-5.2` | plan, from-issue |
| Design | `OPENCODE_MODEL_DESIGN` | `openrouter/z-ai/glm-5.2` | design |
| Judge | `OPENCODE_MODEL_JUDGE` | `openrouter/z-ai/glm-5.2` | judge |
| Utility | `OPENCODE_MODEL_UTILITY` | `deepseek/deepseek-v4-flash` | compaction, title, summary, docs-writer, semgrep |

**Default delivery:** A direnv `.envrc` automatically extracts the committed
`.opencode/setup.json` models section (via jq) when you `cd` into the project.

1. **Install the direnv shell hook** (one-time, per-shell):

   ```fish
   # fish
   echo 'direnv hook fish | source' > ~/.config/fish/conf.d/direnv.fish
   ```
   ```bash
   # bash
   echo 'eval "$(direnv hook bash)"' >> ~/.bashrc
   ```
   ```zsh
   # zsh
   echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc
   ```

   Restart your shell, or `exec $SHELL -l`.

2. **Trust the .envrc** (one-time, per-clone):

   ```bash
   cd /path/to/repo
   direnv allow
   echo $OPENCODE_MODEL_PRIMARY      # verify: deepseek/deepseek-v4-pro
   ```

Without direnv, add to your shell profile:
```bash
source /path/to/repo/.envrc
```

**Customizing via /setup:** Run `/setup` to interactively choose models for
each tier. Choices are written to `~/.config/opencode/models.env` (sourced
by `.envrc` after the defaults, so user choices take precedence).

**Config file precedence** (per OpenCode `config.mdx`; later sources override
earlier ones):

1. Remote config (`.well-known/opencode`)
2. Global config (`~/.config/opencode/opencode.json`)
3. `OPENCODE_CONFIG` custom path
4. **Project config (`opencode.jsonc`)** ← `{env:VAR}` references live here
5. `.opencode/` directories (agents, commands, etc.)
6. `OPENCODE_CONFIG_CONTENT` (inline, runtime)
7. Managed settings (admin-controlled, MDM, mobileconfig)

**Override mechanisms** (in order of escalation):

- **Change models in /setup** — writes user choices to `~/.config/opencode/models.env`
- **Edit `.opencode/setup.json` models section** — change defaults committed to the repo
- **CLI flag** — `opencode --model anthropic/claude-sonnet-4-5` (overrides
  top-level; per-agent `{env:VAR}` references still resolve from env vars)
- **Inline config** — `OPENCODE_CONFIG_CONTENT='{"agent":{"build":{"model":"..."}}}' opencode`

**Choosing a model and variant:** The defaults are tuned for the three
models shipped in `.opencode/setup.json`. To use a different
model — or to confirm which `variant` values it accepts, what its context
window is, and how to map a task onto a `variant` + `temperature` pair —
see [`.opencode/docs/model-configuration.md`](.opencode/docs/model-configuration.md).

### Slash commands

| Command | Purpose |
| --- | --- |
| `/prime` | Draft or regenerate `CONTEXT.md` from the codebase |
| `/check` | Pre-push gate: php-cs-fixer + stylelint + eslint + pest --coverage (80%) |
| `/release` | git-cliff changelog + signed tag + `gh release` command |
| `/deploy` | Post-pull production deploy — asset rebuild, opcache clear, log tail |
| `/router` | Route free-form user intent to the right entry point (on-ramp, agent, or fast-path) |
| `/research` | Cited research via `@scout` + web (see `.opencode/docs/research.md`). Pass `--background` for async dispatch (experimental, gated). |
| `/build-assets` | Rebuild minified CSS and JS from SCSS/JS sources |
| `/security` | SAST scan + dependency CVE audit in one pass |
| `/improve-architecture` | Scan codebase for deepening opportunities → Obsidian markdown report |
| `/handoff` | Compact current conversation into a handoff document for another session |
| `/setup` | Interactive project configurator — replaces `<app>`/`<domain>`/`[EMAIL]` placeholders, sets accent theme, offers optional scaffold (clone an existing template via `gh`, or init a new subfolder) |
| `/setup-labels` | Idempotently create/update standardized issue labels on the GitHub repo via `gh label` |
| `/doctor` | Toolchain health check — verifies dev tools at version floors; reports PASS/FAIL/SKIPPED + go/no-go |
| `/teach` | Explain recently completed work — what changed, why, what trade-offs were considered |
| `/issue` | Create a single issue, or decompose a plan/spec into an epic with vertical-slice tasks |
| `/ticket` | Alias of `/issue` (singular mode) |
| `/issues` | Decompose a plan or spec into a GitHub epic with vertical-slice task issues and native blocking edges |
| `/tickets` | Alias of `/issues` (from-spec decomposition) |


**`/setup` scaffold mode** — `/setup` offers an optional scaffold step (§2.5)
for spinning up standalone projects from the template's quality surface (git
hooks, CI, linters, shell-test harness):

- **skip** (default) — configure the template in place; no scaffold.
- **clone** `<owner/repo>` — clone an existing quality-surface template via
  `gh repo clone`, then overlay the current quality surface. Requires `gh`
  installed and authenticated (`gh auth login`).
- **new** `<target>` — create a fresh subfolder, `git init`, and copy the
  quality-surface manifest into it. No `gh` required.

The scaffold is idempotent: re-running `/setup` short-circuits the prompt when
a scaffold was already completed and the recorded `project_folder` still
exists (drift — missing folder — re-prompts). See `adr/0026-project-scaffolding.md`.

OpenCode also provides built-in slash commands (`/init`, `/undo`, `/redo`,
`/share`, `/help`) — see `CODING_HARNESS.md` for the full list.

### Skills (on-demand)

Skills load when an agent needs them — they are not loaded into every session. Load one explicitly with the `skill` tool, or let the agent pull it when the task matches.

| Category | Skills |
| --- | --- |
| Engineering pipeline | `brainstorming`, `grilling`, `prototype`, `to-spec`, `writing-plans`, `executing-plans`, `ticketing`, `wayfinder`, `verification-before-completion` |
| Review triage | `receiving-code-review` |
| Branch lifecycle | `finishing-a-development-branch` |
| Architecture hygiene | `systems-design`, `finding-duplicate-functions` |
| Stack-specific | `aurora-page`, `rcs-header`, `security-coding`, `database` |
| Frontend | `frontend-design`, `scss-mobile-first`, `frontend-architecture`, `accessibility` |
| Testing | `pest-browser` |
| Docs & process | `domain-context`, `adr`, `conventional-commits`, `audit-deps`, `writing-skills`, `opencode-docs`, `research-background` |

### Project context — living docs

* **`CONTEXT.md`** — the domain's *what* and *why*: glossary, entities, invariants, boundaries, non-goals. Agents read it before domain-coupled work and update it when domain language changes. Draft a fresh one with `/prime`.
* **`adr/`** — Architecture Decision Records. Write an ADR (copy `adr/0000-template.md`) for hard-to-reverse or cross-cutting decisions. Supersede, never edit. Run `@architect` before `writing-plans` to check for ADR conflicts on non-trivial changes.

### Activation

The harness is active in any OpenCode session opened in this repo — no manual steps beyond installing OpenCode and running `composer install` / `npm install`. Git hooks (lint, commitlint, amend/non-fast-forward guards, submodule sync) are activated separately via `bash .github/scripts/install-hooks.sh`.

## Conventional Commits

In order to abide by the conventional commit guidelines and in return get auto-generated changelogs, use the following.

```text
<type>[optional scope]: <subject>

[optional body]

[optional footer(s)]
```

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
  'Authored-by',        # Required — the authoring model from opencode.jsonc (e.g., glm-5.2)
  'Tested-by',          # Required — the verification model from agent.code-review.model (e.g., deepseek-v4-pro)
  'Signed-off-by',      # Required — the user (e.g., kyau <git@kyaulabs.com>)
  'BREAKING CHANGE',    # Required when the type/scope includes !
  'Cc',
  'Fixes',
  'Helped-by',
  'Refs',
  'Reviewed-by',
}
```

Every commit must include `Authored-by`, `Tested-by`, and `Signed-off-by` footers. If
no user is explicitly named, the default `Signed-off-by` is `kyau
<git@kyaulabs.com>`. `Authored-by` is sourced from `agent.plan.model`
and `Tested-by` is sourced from `agent.code-review.model` in `opencode.jsonc` —
the segment after the last `/`.
e.g. `deepseek/deepseek-v4-pro` → `deepseek-v4-pro`.

**Issue-closing references** use `Fixes: #NN` (Sentence-case, with colon),
placed at the top of the footer block immediately above `Authored-by:`.
commitlint rejects all other GitHub closing keywords (`Closes`, `Resolve`,
`Fix`, `Fixed`, etc.) and no-colon forms (`Fixes #42`). Use `Refs: #NN` for
non-closing references, in the same top-of-footer block.

### Examples

The following are all examples of valid commit messages.

The commit message will also go through validation with `commitlint` upon issuing `git commit`.

```text
feat(player): begin new implementation of input controller

As per #123 recommendation input controller is now based on blah.

Basic movement added.

Refs: #123
Refs: 676104e, a215868
Authored-by: glm-5.2
Tested-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

```text
fix: array parsing issue

Fixes: #42
Cc: Z
Authored-by: glm-5.2
Tested-by: deepseek-v4-pro
Reviewed-by: Z
Signed-off-by: kyau <git@kyaulabs.com>
```

```text
chore(release): v0.0.1 [skip ci]
```

## Changelog

Once you have published at least one proper commit using conventional commits syntax you will be able to generate a changelog. The recommended path is the `/release` command (see [Slash commands](#slash-commands) in the Coding Harness section), which drives `git-cliff` end-to-end. The manual flow below is a fallback.

### Manual changelog

```bash
git cliff --tag v0.0.1
```

After the initial run of git-cliff all subsequent runs should detect the version automatically.

```bash
git cliff
```

A typical manual workflow should look like the following.

```bash
git add -A                      # add all un-indexed and changed files to the commit
git commit -S -a -m "<message>" # add a conventional commit message and sign the commit
git cliff                       # generate a new changelog
git add CHANGELOG.md            # add the changelog file to the commit
git commit --amend --no-edit    # ammend the added file to the previous un-pushed commit
git push -u origin develop      # finally, push the commit
```

## Attribution

* [OpenCode](https://opencode.ai) — the coding harness platform this template targets
* [Aurora](https://github.com/kyaulabs/aurora) — the PHP framework included as a submodule
* [Pest](https://github.com/pestphp/pest) — the PHP testing framework (TDD)
* [php-cs-fixer](https://github.com/PHP-CS-Fixer/PHP-CS-Fixer) — PHP code style (PSR-12)
* [Commitlint](https://github.com/conventional-changelog/commitlint) — commit message validation
* [git-cliff](https://github.com/orhun/git-cliff) — changelog generation
* [Semgrep](https://github.com/semgrep/semgrep) — static analysis security testing
* [gitleaks](https://github.com/gitleaks/gitleaks) — secrets scanning at pre-commit
* [OpenCodeReview (ocr)](https://alibaba.github.io/open-code-review/) — code review tooling used by the `@code-review` agent
* [Superpowers](https://github.com/obra/superpowers) — engineering pipeline and core skill methodology (MIT, © Jesse Vincent)
* [Superpowers Lab](https://github.com/obra/superpowers-lab) — two-phase semantic-duplication detection pattern (MIT, © Jesse Vincent)
* [Superpowers Developing for Claude Code](https://github.com/obra/superpowers-developing-for-claude-code) — vendored-official-docs skill pattern (MIT, © Jesse Vincent)
* [Matt Pocock's Skills](https://github.com/mattpocock/skills) — prototype pattern, grilling concept, domain-modeling approach (MIT, © Matt Pocock)
* [Anthropic Agent Skills](https://github.com/anthropics/skills) — SKILL.md format and skills specification (MIT, © Anthropic)
* [Gleb's Claude Skills](https://github.com/glebis/claude-skills) — TDD multi-agent architecture (MIT, © Gleb)
