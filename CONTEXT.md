# Project Context

> Living document. Update when domain language, entities, or boundaries change.
> Read by agents before domain-coupled work (see the `domain-context` skill).

## Purpose

Prism is a coding harness for [Pi](https://pi.dev) that codifies a disciplined,
test-driven engineering pipeline: brainstorm → specify → plan → implement →
verify → review. The harness itself is the primary deliverable: Pi packages,
skills, prompt templates, one safety extension, git hooks, quality gates,
documentation, and architecture records.

Prism separates language-agnostic policy from stack-specific practice. The
language-agnostic core is installed globally and remains active in every
trusted project. Stack adapters are installed project-locally and supply the
conventions, tools, and gates for their ecosystem. This repository ships the
PHP/web adapter and retains PHP/Aurora heritage as test infrastructure; it is
not itself a deployable web application.

The former OpenCode runtime and manifest architecture is retired. OpenCode-era
ADRs remain frozen historical records, while Pi-era decisions begin at
ADR-0055. The former eval framework is deferred pending a separate Pi-native
design.

## Domain Glossary

Ubiquitous language. Terms here are the canonical names used in code, tests,
documentation, and conversation.

| Term | Definition |
| --- | --- |
| Pi package | A distributable collection of Pi skills, prompt templates, extensions, themes, and supporting package files. Prism ships a global core package and project-local stack adapters. |
| Prism core | The language-agnostic Pi package that owns the engineering pipeline, global instructions, prompt templates, generic tooling, and the sole safety extension. It must not contain stack-specific behavior. |
| stack adapter | A project-local Pi package that specializes Prism for one technology stack. It owns stack conventions, dependency tools, checks, and safe-directory declarations. |
| active adapter | The project-local stack adapter selected by project evidence and made available to the current Pi session. Core workflows delegate stack-specific operations to it. |
| toolchain contract | A versioned, machine-readable, scope-owned declaration of required tools, exact managed versions or approved bounded external requirements, provisioning modes, readiness checks, and allowed commands. |
| bundled core tool | An unauthenticated language-agnostic command-line tool distributed as an exact runtime dependency of the Prism core and resolved relative to that package. |
| external core prerequisite | A mandatory system-owned command-line tool that Prism verifies but never installs, configures, authenticates, upgrades, or downgrades autonomously. Semgrep and OCR are the initial prerequisites. |
| consumer-dev tool | A stack-specific development dependency that an adapter provisions into a consumer project's native manifests and lockfiles after explicit approval. |
| toolchain readiness | The fail-closed state in which every active contract is valid, mandatory executable versions satisfy their exact or bounded requirements, required connectivity checks pass at their defined cadence, and installed dependency graphs have no known advisories. |
| toolchain entry point | A Prism command, hook, installer, health check, security/review workflow, or gate that depends on the declared toolchain and therefore performs mandatory core preflight before its main operation. |
| consent boundary | One specific external effect requiring independent human approval. Registry access, consumer manifest mutation, OCR connectivity, and OCR code egress are separate boundaries; approval never transfers between them. |
| candidate workspace | The adapter-owned ephemeral area used to resolve and audit proposed dependency graphs before approved consumer manifests or lockfiles change. It is not a general scratch directory. |
| protected branch | A Git branch (`develop` or `main`) that accepts only merged pull requests. Local hooks, GitHub rulesets, and CI enforce this invariant; the initial single-root seed is the sole direct-write exception. |
| work branch | A non-protected branch named from an allowed Conventional Commit type, the resolved human identity, a stable hash, and a description. Humans alone push work branches. |
| sensitive path | A credential-bearing or security-sensitive filesystem path that every agent is forbidden to read, print, copy, encode, or transmit. The immutable deny floor includes auth stores, OCR configuration, SSH/cloud credentials, private keys, and environment files other than `.env.example`. |
| script resolution | The convention by which instruction-layer executable references resolve to the prism-core package's `scripts/` or `skills/` directory via `prism-tool resolve`, preferring an ancestor checkout copy when the working directory is inside a prism checkout (ADR-0065). |
| safety extension | Prism core's sole Pi extension. It enforces the sensitive-path deny floor, destructive-command policy, safe-directory contract, bypass prohibition, and bounded-window denial circuit breaker (three denials within the last ten bash calls). |
| oversized request | Work too large for one specification in one session because it spans multiple independent subsystems or contains unknowns that cannot be reduced to sharp questions. It routes to wayfinder before detailed design. |
| strict greenfield | A repository with no commits, design artifacts, or application source, as determined by the fail-closed classifier. It may receive one walking-skeleton bootstrap before wayfinding. |
| walking-skeleton bootstrap | The sole strict-greenfield exception to immediate wayfinding: scaffold plus one thin vertical slice, still following specification, planning, TDD, verification, checking, and review. |
| wayfinder map | A shared map of investigation tickets used to resolve oversized uncertainty one bounded question at a time before synthesis into a specification. |
| package release | A release event that publishes the repo's GitHub Release and bumps the declared release-managed npm packages (`.prism/release.json`) to independently computed versions, tagging each; `npm publish` remains a human-run step. |
| tracker operator | The least-privilege workflow that performs approved GitHub issue, label, field, and blocking-edge operations for ticketing. External tracker content remains untrusted data. |

## Entities & Invariants

### Prism Core Package

The globally installed, language-agnostic harness package.

- Contains no PHP, Pest, Aurora, SCSS, nginx, MariaDB, Composer, `vendor`, or
  `cdn` behavior.
- Owns the single-agent engineering pipeline and the sole Pi extension.
- Deploys merge-safe global instructions without replacing user-owned content.
- Exposes generic tooling through stable interfaces rather than consumer
  working-directory assumptions.
- Never pushes a branch, merges a pull request, or accesses credentials.

### Stack Adapter

A project-local specialization of the Prism core.

- Owns all conventions and tools tied to its language or framework.
- Is opt-in and must not change language-agnostic core semantics.
- Contributes data to the core safety boundary rather than loading another
  extension.
- Provisions ecosystem dependencies only into the consumer project's native
  manifests and lockfiles and only after explicit approval.
- A change that requires stack-specific logic in core is an architecture
  boundary failure and must halt for review.

### Toolchain Contract

The declaration that connects Prism resources to executable capabilities.

- Has one supported schema version and a unique package identity.
- Uses stable allowlisted tool IDs, exact managed versions, and only ADR-approved
  bounded requirements for external prerequisites.
- Declares each tool as bundled, external, or consumer-development scope.
- Contains no credentials, secret-bearing URLs, or arbitrary shell source.
- Has mechanical parity with package manifests and active lockfile scopes.
- Fails closed on malformed data, unsupported schemas, duplicate IDs, drift,
  or ambiguous adapter registration.

### Toolchain Readiness

The measured state required before a toolchain entry point proceeds.

- Missing or mismatched Semgrep or OCR is always NO-GO.
- Semgrep must satisfy `>=1.173.0 <2.0.0`; login remains optional for local
  scanning.
- OCR connectivity is tested during installation/setup, `/doctor`, and
  immediately before code review; other entry points verify only the local
  executable and the declared `>=1.9.1 <2.0.0` compatibility requirement.
- OCR connectivity approval never authorizes transmission of reviewed code.
- A known dependency advisory at any severity prevents GO status.
- Required tools are never silently skipped.

### Candidate Transaction

The pre-application dependency operation owned by an active adapter.

- Registry access occurs only after network approval.
- Candidate graphs resolve and audit before consumer manifests change.
- Only literal `yes` authorizes consumer manifest and lockfile replacement.
- Pre-application failure leaves consumer files byte-identical.
- Applied manifests and lockfiles are atomic and remain the desired state if
  later dependency population fails.
- Cleanup is limited to an ownership-marked candidate workspace.

### Safety Policy

The enforced minimum protection shared across every trusted project.

- Sensitive-path denial is immutable and additive; project configuration can
  add paths but cannot remove the deny floor.
- Destructive recursive deletion is allowed only in declared safe directories.
- Credential files are never read, including for presence or diagnostics.
- External data and subprocess output are untrusted and never evaluated as
  commands.
- Three blocked bash calls within a window of ten terminate the retry loop
  for that Pi session.

### Development Artifact

An approved specification or implementation plan created during the pipeline.

- Is committed when approved so history preserves the decision trail.
- Is deleted at branch completion under ADR-0027; Git history remains the
  canonical record.
- Does not replace an ADR when a decision is hard to reverse or cross-cutting.

## System Boundaries

### Prism owns

- The global language-agnostic core package and project-local stack adapters.
- Skills, prompt templates, global instruction blocks, and the sole safety
  extension.
- Toolchain declarations, generic launcher behavior, adapter handoff, and
  consent/readiness semantics.
- Git hooks, local quality gates, CI-equivalent validation, and release/PR
  preparation procedures.
- The PHP/web adapter's conventions, dependency contract, and changed-file
  coverage gate.
- Project documentation, ADRs, Semgrep rule pack, and harness regression
  tests.

### Prism delegates

- **Pi runtime** — model inference, tool dispatch, package loading, sessions,
  prompt-template expansion, and manual model cycling.
- **Stack runtimes and package managers** — PHP, Node.js, Composer, npm, and
  their registries resolve and execute ecosystem dependencies.
- **External security and review tools** — Semgrep performs static analysis;
  OCR and its configured provider perform external review. Prism verifies and
  invokes them but does not own installation, authentication, or heuristics.
- **Aurora Framework** — the no-MVC PHP framework remains an external
  submodule; Prism's adapter documents and tests integration patterns.
- **GitHub** — issue tracking, pull requests, Actions, rulesets, and release
  publication.
- **LLM providers** — providers authenticate and run inference. Prism neither
  stores provider credentials nor hosts or proxies models.

### Boundary interfaces

- Pi package metadata and explicitly declared project-local package paths.
- Versioned toolchain contracts and adapter handler registration.
- Argument-array subprocess calls with bounded, sanitized output and stable
  exit statuses.
- Composer/npm manifests and lockfiles as ecosystem transaction boundaries.
- Adapter safe-directory data consumed by the core safety extension.
- Human approval at each network, mutation, connectivity, and code-egress
  boundary.

## Non-Goals

- **Not a deployable PHP application** — there is no Prism application webroot;
  `backend`, `cdn`, and Aurora content are heritage and test infrastructure.
- **Not a framework** — Prism provides no MVC layer, router, template engine,
  ORM, or replacement for Aurora.
- **No orchestration layer** — Prism does not recreate tabs, subagents, modes,
  automatic model tiers, or background agents inside Pi.
- **No additional extension** — safety remains the one extension.
- **No autonomous external-tool administration** — Prism does not install,
  authenticate, configure, upgrade, or downgrade Semgrep or OCR.
- **No general-purpose package manager** — adapter provisioning is restricted
  to tools declared by validated active contracts.
- **No credential handling** — Prism never reads, stores, displays, or
  transmits credentials.
- **No push or merge automation** — humans push branches and merge pull
  requests. Release CI alone creates validated tags/Releases and opens the
  human-merged back-merge PR.
- **No bundled LSP servers** — language servers remain system/project
  responsibilities.
- **No model fine-tuning or hosting** — Pi and upstream providers own model
  execution and authentication.
- **No Pi-native eval execution yet** — the former OpenCode eval suite remains
  deferred until a separate specification defines a Pi SDK/RPC design.
- **No rewriting frozen ADRs** — ADRs 0001–0054 remain historical records and
  are superseded only by new Pi-era decisions.

## Architectural Decisions

ADRs 0001–0054 are frozen OpenCode-era records. They remain available under
`adr/` and are superseded where moot by the Pi migration. The continuing
cross-era constraints most relevant to current work are:

- `adr/0009-mechanized-changed-file-coverage-gate.md` — mechanically enforce per-changed-file coverage.
- `adr/0010-issue-closing-keyword-convention.md` — use `Fixes: #NN` as the sole closing trailer.
- `adr/0015-index-based-linting-in-pre-commit-hook.md` — lint staged blobs rather than unrelated working-tree content.
- `adr/0025-ci-local-parity-principle.md` — keep local and CI gates behaviorally equivalent and fail closed.
- `adr/0027-plans-specs-lifecycle.md` — commit approved development artifacts, then remove them at branch completion.
- `adr/0028-git-flow-branch-naming-enforcement.md` — mechanically enforce work-branch naming.
- `adr/0035-ci-runner-fork-isolation.md` — run CI checks on hosted ephemeral runners for fork-PR isolation while preserving gate equivalence with local checks.
- `adr/0064-slim-commit-footers-and-ocr-sourced-tested-by.md` — three commit footers; `Tested-by:` sourced from OCR config (supersedes ADR-0040's footer clause).
- `adr/0065-self-locating-script-resolution.md` — instruction-layer script references resolve via `prism-tool resolve scripts|skills`, gated by validate-harness (extends ADR-0060's install model).
- `adr/0041-rcs-header-normalizer-in-pre-commit.md` — normalize required source headers in pre-commit.
- `adr/0044-pr-only-protected-branches.md` — protect `main` and `develop` with PR-only integration.
- `adr/0046-automated-release-pipeline.md` — release CI publishes the merge result and opens a back-merge PR.
- `adr/0047-sensitive-path-enforcement.md` — establish the immutable credential-path deny floor.
- `adr/0048-sensitive-path-enforcement-corrections.md` — preserve additive path union, fail-closed matching, and symlink handling.
- `adr/0050-oversized-brainstorming-wayfinder-greenfield-bootstrap.md` — route oversized work through wayfinder with one strict-greenfield exception.
- `adr/0052-tracker-operator-agent.md` — retain least-privilege tracker operations; execution topology is adapted to Pi.

Pi-era decisions:

- `adr/0055-pi-migration-embrace-single-agent.md` — express Prism through Pi's single-agent skills and prompt-template model.
- `adr/0056-safety-extension-sole-extension.md` — retain exactly one fail-closed safety extension.
- `adr/0057-single-model-manual-cycling-manifest-deleted.md` — superseded by ADR-0067; retained as historical context.
- `adr/0058-core-adapter-package-split.md` — split the global language-agnostic core from project-local stack adapters.
- `adr/0059-conversion-scope-deferred-evals-mcp-to-cli-skills.md` — bound the Pi port, defer evals, and replace MCP integrations with CLI skills.
- `adr/0060-global-core-project-local-adapter-install.md` — install core globally, adapters locally, and deploy merge-safe always-on instructions.
- `adr/0061-scope-owned-toolchain-contract.md` — superseded scope-owned toolchain baseline retained as historical context.
- `adr/0062-bounded-ocr-compatibility.md` — superseded bounded-OCR policy retained as historical context.
- `adr/0063-bounded-external-tool-compatibility.md` — retain exact managed tools while allowing bounded compatible Semgrep and OCR 1.x releases.
- `adr/0066-per-package-release-versions.md` — release-managed npm packages version independently, tagged from the merge result.
- `adr/0067-model-agnostic-harness-user-driven-model-config.md` — the harness selects no model or thinking level; `/setup` writes only the user's choices; commit footers record passively.
- `adr/0069-reload-recovery-for-denial-circuit-breaker.md` — a tripped safety extension recovers through user-invoked `/reload` without replacing the conversation; ADR-0068 still owns window and threshold semantics.
- `adr/0070-launcher-owned-workflow-mechanics.md` — fixed prompt workflow mechanics that exceed the safety tokenizer run through narrow, audited `prism-tool` operations.

## When to update this file

- A domain term enters or leaves the current harness.
- An entity or invariant changes.
- A system boundary or external dependency changes.
- An ADR is accepted or superseded.

Keep this document about what Prism owns and why. Implementation paths,
commands, stack mechanics, and test recipes belong in `AGENTS.md`, package
documentation, skills, prompts, specifications, and plans.
