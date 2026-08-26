# Coding Harness

This guide explains how Prism turns a pi session into a controlled engineering
workflow. The agent loads `AGENTS.md` as the authoritative instruction set;
this file is for contributors and maintainers.

## Pi-native architecture

Prism uses one pi agent. Skills load on demand and prompt templates provide
slash commands. One safety extension enforces sensitive-path rules, destructive
command policy, the denial circuit breaker, and the fatal commit latch.

There are no harness-selected models. Use Ctrl+P to change models and Shift+Tab
to change thinking. `/setup` can write your preferred provider, default model,
model pool, and thinking level to pi configuration. Each question is skippable
and configuration writes require consent.

Core installs globally and supplies language-independent workflow and safety.
Adapters install per project and supply stack conventions, tools, tests, and
quality gates. A project with `composer.json` or `aurora/` activates the
PHP/web adapter.

## Work on-ramps

Choose the on-ramp before exploring or editing:

| Request | On-ramp |
| --- | --- |
| New behavior, component, or capability | `brainstorming` |
| Existing issue | `from-issue` |
| Bug or regression | `debug` |
| Project question or domain exploration | `consult` |
| Focused read-only code question | `explore` |
| Oversized or poorly bounded work | `wayfinder` |
| Approved spec ready for implementation | `writing-plans` |

A fast path is available only for work with no behavior delta: typos,
documentation-only edits, RCS header changes, style-only edits, patch dependency
updates, and test-only corrections. Fast-path work still requires verification,
`/check`, review, and a conventional commit.

Strict-empty `/setup` and established-project setup remain separate. A strict-empty
project chooses Template, Blank, or Cancel, then an adapter and optional
capabilities. An established project is inspected in place and never receives
strict-empty source or bootstrap-transaction prompts.

## Design and planning

New behavior follows this sequence:

```text
brainstorming or to-spec -> prototype when needed -> architect when cross-cutting -> issue slicing or writing-plans
```

`brainstorming` asks one question at a time, separates codebase facts from human
decisions, presents alternatives, and stops until the design is approved. It
writes the approved design to `docs/specs/`.

Use `to-spec` when the design is already settled in the conversation. Use
`prototype` only to answer a technical viability question; delete the
throwaway code after recording the result.

Run `architect` for non-trivial or cross-cutting work. It checks `CONTEXT.md`
and accepted ADRs, returns a go/no-go decision, and states whether an ADR is
required. It is read-only.

`writing-plans` turns an approved spec into small vertical tasks with exact
paths, interfaces, tests, and verification commands. Active plans live in
`docs/plans/`. Completed plan and spec files are removed before branch
finalization because Git history preserves them.

## TDD execution

`executing-plans` runs approved tasks inline. Each task loads `tdd` and the
active adapter's language-specific TDD skill.

Every behavior slice follows Red, Green, Refactor:

1. Write one test through a public interface.
2. Run it and confirm a meaningful failure.
3. Write the smallest implementation that passes.
4. Run the focused test.
5. Refactor without changing behavior.
6. Run the focused and applicable regression suites.
7. Apply `verification-before-completion` before committing.

The PHP/web adapter uses Pest 5 on PHPUnit 13 and measures at least 80% line
coverage on changed PHP files. Browser tests are reserved for critical user
flows. Frontend slices also apply accessibility, mobile-first SCSS, and
`visual-review` when rendered behavior changes.

## Per-task verification and commits

Verification requires current evidence:

- focused and applicable full tests pass;
- changed-file coverage passes when the adapter defines it;
- the original reproduction no longer fails for bug fixes;
- no debug instrumentation or scratch files remain;
- linters and harness validation pass;
- source headers, modelines, generated-file rules, and lockfiles are correct;
- no credentials or secret material entered the diff.

Stage only the intended files. Create each ordinary commit with one standalone
launcher call:

```bash
prism-tool commit create --type feat --scope example --subject "add verified behavior"
```

The launcher writes attribution, validates the message, runs hooks, creates a
signed commit, and verifies that `HEAD` advanced. Do not combine this command
with staging, cleanup, inspection, or shell control operators. Failure blocks
all tools until `/reload`.

## Finalization and pull requests

After all plan tasks pass, `finishing-a-development-branch` owns branch
completion:

1. Remove matching plan and spec artifacts.
2. Obtain finalization acceptance.
3. Synchronize the target branch.
4. Record exact base and `HEAD` attestations.
5. Run `/check` until green.
6. Complete all four `code-review` axes.
7. Revalidate the branch and review chain.
8. Invoke preparation-only `/pr`.

One complete initial review starts the bounded chain. After a Blocking repair, a fresh finalization acceptance authorizes review of only the continuous repair delta. Advisory findings remain in the pull request disclosure and do not
block preparation. A base or history change, discontinuity, incomplete axis,
dirty tree, or mismatched `HEAD` invalidates the chain and requires a new
complete initial review.

`/pr` prepares a conventional title, a body containing every pull request
template section, and a human-run `gh pr create` command. It never pushes or
creates the pull request. Humans push work branches and create or merge pull
requests.

## The `/check` gate

`/check` runs the language-independent gates, then delegates stack checks to
the active adapter. It covers:

- local tool readiness;
- current verification evidence;
- clean repository state and conflict markers;
- changed Markdown through the Core packaged policy;
- debug-artifact inspection;
- Core harness validation when package sources are present;
- adapter lint, tests, coverage, syntax, and generated-asset checks.

The PHP/web adapter expands `/check-php`. Do not duplicate stack commands in
Core prompts.

## Review axes

`code-review` records four separate results:

1. tooling and style;
2. structural smells;
3. requirement coverage;
4. static security analysis.

Blocking findings stop finalization. Advisory findings do not block `/pr` and
need no waiver. Suggested findings must be resolved or explicitly handled by
the active review workflow.

OpenCodeReview (`ocr`) is available only through the dedicated review
operation. `/setup` owns standing OCR consent. Revoke it with
`prism-tool consent revoke-ocr`. Local installation, hooks, and CI use
local-only readiness and do not establish consent or send code.

## Commands

| Command | Purpose |
| --- | --- |
| `/router` | Select the correct on-ramp |
| `/prime` | Draft or refresh `CONTEXT.md` |
| `/setup` | Configure the project and manage standing OCR consent |
| `/doctor` | Run full readiness and one consented OCR connectivity test |
| `/issue` | Create an issue or decompose a spec or plan |
| `/check` | Run the pre-push gates |
| `/security` | Run SAST and locked-dependency audits |
| `/research` | Produce cited research |
| `/improve-architecture` | Report architecture improvement candidates |
| `/release` | Prepare a release branch and publication instructions |
| `/pr` | Prepare pull request title, body, and human command |
| `/handoff` | Save continuation context |
| `/teach` | Explain completed work |

The PHP/web adapter adds `/check-php`, `/build-assets`, and `/deploy`.

## Research and tool integrations

`websearch` uses the configured DeepSeek search API. `searxng` uses a configured
SearXNG endpoint. Both are CLI-backed skills, fail clearly when configuration
is absent, and must not print credentials.

Declared tools resolve through `prism-tool` according to the Core and adapter
toolchain contracts. Core bundles commitlint, git-cliff, and
`markdownlint-cli2`. Semgrep and OCR are mandatory compatible external tools.
The PHP/web adapter owns project-local development tools such as Pest,
php-cs-fixer, Playwright, Sass, ESLint, Stylelint, and UglifyJS.

## Project records

| Path | Purpose |
| --- | --- |
| `packages/prism-core/AGENTS.md` | Global instructions and command or skill index |
| `packages/prism-core/APPEND_SYSTEM.md` | Anti-drift session reminder |
| `packages/prism-core/extensions/safety/` | Sole safety extension |
| `packages/prism-core/skills/` | Core skills |
| `packages/prism-core/prompts/` | Core prompt templates |
| `packages/prism-php-web/` | PHP/web adapter |
| `CONTEXT.md` | Domain glossary, invariants, boundaries, and non-goals |
| `adr/` | Accepted architecture decisions |
| `docs/specs/` | Active specifications |
| `docs/plans/` | Active implementation plans |

Durable, rewritten, tone-sensitive, or substantial prose loads the `distill`
skill. Distill removes filler and machine-written habits without changing exact
commands, identifiers, quotations, templates, or domain terms.
