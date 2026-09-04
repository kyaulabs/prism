# Project Context

> Living document. Update when domain language, entities, or boundaries change.
> Read by agents before domain-coupled work (see the `domain-context` skill).

## Purpose

Prism is a coding harness for [Pi](https://pi.dev) that codifies a disciplined,
test-driven engineering pipeline: brainstorm → specify → plan → implement →
verify → review. The harness itself is the primary deliverable: Pi packages,
skills, prompt templates, two non-orchestration extensions, git hooks, quality gates,
documentation, and architecture records.

Prism separates language-agnostic policy from stack-specific practice. The
language-agnostic core is installed globally and remains active in every
trusted project. Stack adapters are installed project-locally and supply the
conventions, tools, and gates for their ecosystem. This repository ships the
PHP/web adapter and retains PHP/Aurora heritage as test infrastructure; it is
not itself a deployable web application.

Prism ran on OpenCode before its Pi migration. ADRs 0001–0054 are frozen
pre-Pi records, not current runtime guidance; ADR-0055 begins the Pi-era
architecture. Eval execution remains deferred until a separate Pi-native design
is approved.

## Domain Glossary

Ubiquitous language. Terms here are the canonical names used in code, tests,
documentation, and conversation.

| Term | Definition |
| --- | --- |
| Pi package | A distributable collection of Pi skills, prompt templates, extensions, themes, and supporting package files. Prism ships a global core package and project-local stack adapters. |
| Prism core | The language-agnostic Pi package that owns the engineering pipeline, global instructions, prompt templates, generic tooling, the safety extension, and the web-access extension. It must not contain stack-specific behavior. |
| stack adapter | A project-local Pi package that specializes Prism for one technology stack. It owns stack conventions, dependency tools, checks, and safe-directory declarations. |
| active adapter | The project-local stack adapter selected by established-project evidence or explicitly from the supported-adapter catalogue during strict-empty setup. Core workflows delegate stack-specific operations when an adapter is present. |
| Prism reviewer | The Core-owned `prism-review` executable and skill policy that run bounded four-axis review from a pre-existing installed trust root. It begins as a non-authoritative foundation and becomes finalization authority only after the staged cutover in ADR-0103. |
| review profile | A closed package-owned declaration of review skills, axis lenses, deterministic path triggers, and fixed non-text exemptions. An adapter may append lenses but cannot replace Core policy or supply executable review commands. |
| byte exposure | Deterministic evidence that every required interval of an immutable Git blob or diff was returned to a review session. It records data delivery, not model attention, understanding, or semantic coverage. |
| criteria receipt | Private managed evidence identifying the exact committed specification, plan, or explicit no-criteria disposition approved before implementation and artifact cleanup. Immutable source blobs remain authoritative over extracted summaries. |
| check receipt | Private managed evidence binding actual Core and adapter quality-gate results to one branch, base, and HEAD. Starting a new check invalidates the prior active PASS before any gate runs. |
| toolchain contract | A versioned, machine-readable, scope-owned declaration of required tools, exact managed versions or approved bounded external requirements, provisioning modes, readiness checks, and allowed commands. |
| server profile | An optional adapter toolchain declaration for one foreground-scoped loopback test dependency, including its preferred port, trusted server and health commands, permitted client tools, and selected-endpoint environment templates. |
| bundled core tool | An unauthenticated language-agnostic command-line tool distributed as an exact runtime dependency of the Prism core and resolved relative to that package. |
| external core prerequisite | A mandatory system-owned command-line tool that Prism verifies but never installs, configures, authenticates, upgrades, or downgrades autonomously. Semgrep and OCR are the initial prerequisites. |
| consumer-dev tool | A stack-specific development dependency that an adapter provisions into a consumer project's native manifests and lockfiles after explicit approval. |
| toolchain readiness | The fail-closed state in which every active contract is valid, mandatory executable versions satisfy their exact or bounded requirements, required connectivity checks pass at their defined cadence, and installed dependency graphs have no known advisories. |
| toolchain entry point | A Prism command, hook, installer, health check, security/review workflow, or gate that depends on the declared toolchain and therefore performs mandatory core preflight before its main operation. |
| consent boundary | One external-effect authorization. Invoking `/setup` authorizes only its disclosed fixed-template and dependency-network effects for one attempt; project mutation remains separately approved except for the exact provisional adapter installation explicitly selected during strict-empty setup. Read-only GitHub repository and tracker metadata is standing-authorized; confirming a tracker preview or invoking Wayfinder authorizes only that bounded issue/map mutation batch or lifecycle. Standing OCR consent covers OCR connectivity and reviewed-code egress. Separately revocable standing web-access consent covers only the web-access extension's bounded loopback search, fixed-origin keyless search, and guarded public textual fetches. Neither grant transfers to other effects. |
| setup attempt | One invocation-scoped `/setup` orchestration with bounded source/package/dependency networking, independently approved project and hook mutation stages, and no standing setup consent after it stops. |
| standing OCR consent | A global, explicit, persistent, and revocable Prism authorization for OCR connectivity tests and reviewed-code egress from every Prism project. It contains no credentials or project data. |
| standing web-access consent | A global, explicit, persistent, and revocable Prism authorization for the web-access extension's loopback SearXNG search, fixed-origin keyless search, and guarded public textual fetching. It contains no credentials or project data and does not authorize other tools or network effects. |
| plan-approved finalization | The uninterrupted branch-completion workflow authorized by implementation-plan approval: artifact cleanup, target synchronization, attestation, unlimited local checking, one four-axis review, SHA revalidation, and preparation-only pull-request artifacts. Additional review attempts require fresh approval. |
| review chain | Local schema-versioned finalization evidence linking one complete initial branch review to continuous repair-delta reviews, exact branch/base/HEAD identities, axis completion, finding dispositions, and deterministic closure evidence. |
| diff-causal finding | A review finding classified by whether the reviewed delta introduced or materially worsened a concrete defect in changed behavior or its verification evidence; only concrete workflow-impacting findings block finalization. |
| candidate workspace | The adapter-owned ephemeral area used to prepare, resolve, audit, and journal a proposed complete scaffold before approved consumer state changes. It is not a general scratch directory. |
| empty-project bootstrap transaction | The Core-owned outer transaction that composes strict-empty source evidence, provisional package state, trusted provider reports, approved metadata, one combined plan, durable application, rollback, and recovery. It is distinct from an adapter candidate transaction. |
| bootstrap workspace | The Core-owned ephemeral operational area for one empty-project bootstrap transaction. An adapter may receive a bounded attempt subdirectory without gaining ownership of the outer transaction. |
| project capability | An independently selected, disabled-by-default language-agnostic project surface with a trusted owner, closed metadata contract, and bounded output ownership. |
| trusted provider | Installed Core or adapter code whose exact package identity, version, protocol, inputs, and output ownership are validated before it renders a bounded desired-state report. |
| supported-adapter catalogue | The schema-versioned, KYAULabs-signed list of approved adapter identities and releases eligible for strict-empty setup; Core selects the highest release compatible with its version and bootstrap protocol, then pins that exact version. |
| adapter release declaration | The closed, reviewed Core release-commit record that identifies a catalogued release-managed adapter package, compatibility range, bootstrap protocol, and publication status without supplying registry or signing authority. |
| catalogue publication transaction | The serialized cross-repository workflow that validates immutable Prism release and npm evidence, signs the next catalogue sequence in the protected publisher environment, and opens a human-merged publication pull request. |
| publication commit-signing authority | The separate OpenPGP authority that signs catalogue publication commits and remains independent from catalogue-envelope signing and PAT authorization. Core attests its public identity and custody boundary; the publisher owns fingerprints, signing mechanics, and private material. |
| catalogue evidence | Receipt-local signed evidence (`catalogueEvidence`) that binds a strict-empty adapter selection to the exact verified catalogue envelope, signing key, sequence, validity window, selected release, and package integrity. |
| adapter evidence | The normalized nullable durable subset (`adapterEvidence`) carried through project plans, journals, status, recovery, and repository-seed attestation. It remains Core-owned and is never an adapter-provider or hook input. |
| template source attestation | Immutable evidence for the fixed public template repository, validated default branch, commit, complete tree, classification manifest, and source-mode decision; template blobs never become project files. |
| testing-ready scaffold | An application-free, adapter-owned desired state containing audited native manifests and locks, canonical lint and test configuration, executable quality probes, local/CI parity, generated CI, and required empty source/test structure. |
| user-authored visual brief | The versioned project record of approved visual intent, inspiration references, viewport priorities, and aesthetic decisions supplied by the user; Prism contributes no fallback palette, theme type, or design movement. |
| visual review tooling | Adapter-scaffolded consumer-repository scripts and closed configuration that use the declared browser toolchain to capture reproducible frontend evidence without replacing functional browser tests. |
| visual review evidence | Deterministic screenshots and metadata captured across approved routes, states, and viewports during frontend development; working evidence is local by default and committed only with explicit user approval. |
| repository seed | The sole signed root commit created on unborn `develop` after durable project application, containing only the attested setup-owned inventory for a repository created by the active setup attempt. Its evidence may contain a nullable adapter and binds source, capabilities, providers, metadata, plan, hooks, and staged state. Publication remains human-owned. |
| protected branch | A Git branch (`develop` or `main`) that accepts only merged pull requests. Local hooks, GitHub rulesets, and CI enforce this invariant; the initial single-root seed is the sole direct-write exception. |
| work branch | A non-protected branch named from an allowed Conventional Commit type, the resolved human identity, a stable hash, and a description. Humans alone push work branches. |
| sensitive path | A credential-bearing or security-sensitive filesystem path that every agent is forbidden to read, print, copy, encode, or transmit. The immutable deny floor includes auth stores, OCR configuration, SSH/cloud credentials, private keys, and environment files other than `.env.example`. |
| script resolution | The convention by which instruction-layer executable references resolve to the prism-core package's `scripts/` or `skills/` directory via a separate `prism-tool resolve` call, preferring an ancestor checkout copy when the working directory is inside a prism checkout (ADR-0073, superseding ADR-0065's invocation syntax). |
| safety extension | Prism core's fail-closed enforcement extension. It enforces the sensitive-path deny floor, destructive-command policy, safe-directory contract, bypass prohibition, bounded-window denial circuit breaker, and fatal commit-failure latch. |
| web-access extension | Prism core's bounded read-only web capability. It registers native search and content-fetch tools, enforces standing web-access consent, confines optional browser search, and guards public HTTP(S) and loopback SearXNG boundaries. |
| fatal commit-failure latch | Per-session safety state set by any failed or unsafe agent commit attempt. It aborts the active operation and blocks every later tool call until the human reloads or otherwise tears down the extension instance. |
| oversized request | Work too large for one specification in one session because it spans multiple independent subsystems or contains unknowns that cannot be reduced to sharp questions. It routes to wayfinder before detailed design. |
| strict greenfield | A repository with no commits, design artifacts, or application source, as determined by the fail-closed classifier. It may receive one walking-skeleton bootstrap before wayfinding. |
| walking-skeleton bootstrap | The sole strict-greenfield exception to immediate wayfinding: scaffold plus one thin vertical slice, still following specification, planning, TDD, verification, checking, and review. |
| wayfinder map | A shared map of investigation tickets used to resolve oversized uncertainty through successive frontier questions before synthesis into a specification; eligible frontiers continue in the active session while context remains reliable. |
| learning capability | Prism core's explicitly invoked, project-agnostic workflow for generating curricula, teaching topics, assessing application, and managing private progress without affecting normal development. |
| curriculum | A shareable, evidence-backed view of a canonical topic graph for a defined audience profile; project curricula provide layperson and technical profiles. |
| topic graph | The canonical set of stable learning topics, objectives, prerequisites, evidence, profile applicability, and freshness relationships from which curricula are derived. |
| learning state | Privacy-minimal, worktree-local progress evidence written only by explicit learning actions and never read by normal development workflows. |
| mastery | A topic's evidence state: unseen, in progress, learned against the current content digest, or stale after relevant evidence changes. |
| contributor curriculum overlay | The technical-only, repository-owned Prism curriculum that extends the project technical graph without adding another learning engine, command, or skill. |
| package-release capability | The Core-owned, setup-managed combination of owned release configuration, canonical workflow, lockstep package authoring, package tags, recovery behavior, and human-run npm publication handoff. |
| automation desired state | The provider-composed set of applicable Core- and adapter-owned repository workflows and hooks that `/setup` can inspect, plan, reconcile, verify, and report without claiming human-owned automation. |
| release-managed package | A publishable npm package whose validated relative directory appears in the owned release configuration and whose version matches the repository release. |
| owned release file | A release configuration or workflow carrying the supported Prism Core ownership and schema marker, which `/setup` may update only through an approved displayed transaction. |
| package release | A repository release event that publishes the GitHub Release and gives every release-managed package the same version, including prereleases; `npm publish` remains a human-run step. |
| tracker operator | The least-privilege workflow that performs workflow-authorized GitHub issue, label, field, assignment, comment, close, sub-issue, and blocking-edge operations. External tracker content remains untrusted data and cannot widen the active authorization. |

## Entities & Invariants

### Prism Core Package

The globally installed, language-agnostic harness package.

- Contains no PHP, Pest, Aurora, SCSS, nginx, MariaDB, Composer, `vendor`, or
  `cdn` behavior.
- Owns the single-agent engineering pipeline, safety extension, and web-access extension; neither extension orchestrates agents or workflows.
- Deploys merge-safe global instructions without replacing user-owned content.
- Exposes generic tooling through stable interfaces rather than consumer
  working-directory assumptions.
- Owns strict-empty routing, fixed public-template acquisition, signed
  supported-adapter discovery, trusted-provider catalogues, provider
  composition, the empty-project bootstrap transaction, and durable-application
  recovery.
- Owns deterministic post-application Git initialization, canonical hook
  distribution, bounded repository-seed attestation, and signed root-commit
  orchestration.
- Owns language-agnostic foreground supervision, nearest-port selection,
  readiness, and cleanup for contract-declared local test servers without
  learning stack commands or preferred ports.
- Owns privacy-minimal global standing-consent state through narrow,
  explicitly approved launcher operations.
- Owns the opt-in package-release capability, canonical release workflow,
  managed release-file transaction, and lockstep npm package semantics.
- Owns changed-file Markdown validation through an exact bundled tool, a
  packaged non-executable policy, and one staged/branch checker interface.
- Local and agent-run Core operations never configure a remote, push a branch,
  merge a pull request, or access credentials. The canonical release workflow
  may consume protected GitHub App authentication only for ADR-0095's bounded
  catalogue dispatch; it receives no signing, npm, merge, or administration
  authority.

### Stack Adapter

A project-local specialization of the Prism core.

- Owns all conventions and tools tied to its language or framework.
- Is opt-in and must not change language-agnostic core semantics.
- Is selected from project evidence for established projects or explicitly
  from the signed supported-adapter catalogue for strict-empty projects.
- Contributes data to the core safety boundary rather than loading another
  extension.
- Provisions ecosystem dependencies and complete testing-ready scaffolds only
  through an approved adapter-owned desired-state transaction.
- May prepare a closed bounded report inside a delegated bootstrap attempt but
  never owns Template acquisition, Core/profile rendering, combined-plan
  approval, strict-empty rollback, or repository creation.
- Owns stack-specific local/CI quality behavior, generated CI, dependency
  population, browser acquisition, and visual review tooling behind Core
  orchestration.
- May declare closed server profiles for stack-specific foreground test
  dependencies while Core owns generic process and port lifecycle mechanics.
- Scaffolds a user-authored visual brief and reusable visual review tooling
  without selecting a palette, theme type, design movement, or inspiration.
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
- Keeps Core Markdown execution behind the dedicated changed-file checker and
  packaged configuration; consumer rules, plugins, and generic tool dispatch
  cannot alter the gate.
- May contain bounded adapter-owned server profiles whose loopback host,
  preferred port, command templates, client tools, and environment templates
  are validated before any process starts.
- Fails closed on malformed data, unsupported schemas, duplicate IDs, drift,
  or ambiguous adapter registration.

### Toolchain Readiness

The measured state required before a toolchain entry point proceeds.

- Missing or mismatched Semgrep or OCR is always NO-GO.
- Semgrep must satisfy `>=1.173.0 <2.0.0`; login remains optional for local
  scanning.
- The global installer performs local readiness only. `/setup`, full
  `/doctor`, and code review validate standing OCR consent before live OCR
  connectivity; code review validates it again before reviewed-code egress.
- Standing OCR consent authorizes only OCR connectivity and reviewed-code
  egress; it never transfers to registry, mutation, Git, GitHub, or other
  external effects.
- Standing web-access consent separately authorizes only the web-access
  extension's loopback SearXNG search, confined keyless search, and guarded
  public textual fetching; browser and SearXNG readiness remain optional.
- `/setup` invocation separately authorizes only the bounded fixed public-
  template reads, signed adapter-catalogue retrieval, exact selected adapter
  acquisition, registry, audit, locked-population, and declared browser-download
  effects disclosed for that attempt.
- A known dependency advisory at any severity prevents GO status.
- Required tools are never silently skipped.

### Candidate Transaction

The journaled established-project desired-state operation owned by an active adapter.

- Registry, audit, locked-population, and declared browser-download access is
  bounded to the active setup attempt's network authorization.
- The complete scaffold and dependency graphs prepare and audit before
  consumer files change.
- Only literal `yes` authorizes application of the displayed desired state.
- Existing exact canonical files are preserved without writes; differing,
  unsafe, or ownership-ambiguous paths fail closed.
- Before the durable commit point, rollback is limited to exact recorded
  transaction-owned states.
- At and after the durable commit point, the complete desired scaffold remains
  authoritative if dependency population or verification later fails.
- Recovery and cleanup are limited to the ownership-marked candidate workspace
  and its validated journal.

### Empty-Project Bootstrap Transaction

The Core-owned outer project-composition lifecycle for a strictly empty root.

- Strict-empty classification selects Template, Blank, or Cancel; established
  projects remain on their evidence-driven adapter route.
- Template data is an untrusted immutable capability catalogue and never a
  source of project bytes, executable renderers, packages, defaults, metadata,
  scripts, or automatic capability selection.
- Core-only is an explicit disposition with nullable adapter identity, not a
  synthetic adapter.
- Trusted Core, optional-profile, and selected-adapter reports use closed
  schemas and non-overlapping bounded ownership before one digest-bound plan is
  displayed.
- Adapter-selected attempts bind receipt-local catalogue evidence and durable
  adapter evidence into provisional acquisition, the combined plan, recovery,
  and the repository seed; later phases do not depend on the newest global
  catalogue.
- Pre-durable decline or failure restores only proven transaction-owned state
  and proves strict emptiness; ambiguous concurrent state is preserved.
- Durable application establishes the complete approved project tree before
  Git exists; later failures retain the tree and resume from the journaled
  phase.

### Repository Bootstrap

The Core-owned local Git and root-seed lifecycle selected through `/setup`.

- Git initialization runs only after durable project application and remains
  create-only and deterministic; existing or containing repositories are
  preserved without normalization.
- Only a `CREATE` disposition from the active setup attempt yields a one-use
  root-seed attestation.
- The attestation binds the canonical root, source evidence, capabilities,
  provider identities and versions, approved metadata, nullable adapter,
  adapter evidence when present, combined plan, applied inventory,
  durable journal, hook inventory, and final staged-index digest.
- The seed stages no unrelated or operational paths and passes the applicable
  shared Core and adapter local/CI quality implementation before commit
  creation.
- The exclusive signed commit launcher creates the sole root commit with the
  reserved initial-seed type and retains fatal failure recovery.
- Setup never configures a remote, pushes, opens a pull request, or applies a
  GitHub ruleset.

### Package-Release Capability

The opt-in Core-owned release lifecycle for repositories publishing npm packages.

- Setup discovers only the publishable root package and packages reachable
  through declared npm workspaces; private, malformed, duplicate, escaping,
  or ownership-ambiguous candidates never become release-managed.
- The capability is installed only when both owned release files are created,
  updated, or migrated through one approved, atomic, verified transaction.
- Repositories without managed release configuration remain repository-only
  and receive no package bumps, package tags, or npm publication commands.
- Every release-managed package version equals the repository release version,
  including prereleases, in the reviewed merge commit.
- CI publishes or recovers the repository tag and GitHub Release before it
  creates or verifies package tags at the immutable merge SHA.
- A stable release with reconciled package tags and a valid adapter release
  declaration may emit ADR-0095's minimal catalogue dispatch; the publisher
  independently revalidates release, package-tag, declaration, and npm evidence.
- Validated release merges remain eligible for a human-merged back-merge PR
  even when publication or package-tag reconciliation fails.
- npm authentication, OTP handling, and publication remain human-owned; agents
  and CI hold no npm credentials and never run `npm publish`.

### Automation Desired State

The setup-managed repository automation selected from validated Core and active-adapter providers.

- Core owns provider discovery, applicability composition, ownership classification, plan reporting, and route-appropriate reconciliation.
- Strict-empty setup composes applicable automation inside the empty-project bootstrap transaction; established setup uses a separate journaled reconciliation transaction with preserve-first ownership semantics.
- Core owns baseline back-merge, capability-based repository release management, and canonical hook policy; the active adapter owns stack-specific testing and linting CI.
- Package-release metadata extends repository release management and never becomes the sole owner of the canonical release workflow.
- Absent and exact canonical outputs may be created or preserved; supported owned outputs may be updated; only exact recognized legacy output may be migrated. Unowned, customized, malformed, overlapping, or ambiguous state conflicts and is never merged or overwritten.
- Hook activation remains a separate repository-local approval boundary after applicable quality verification.
- Every Prism-created commit runs an explicit Git-resolved pre-commit proof before the authoritative staged-state snapshot, then retains Git's normal hook execution during commit creation.

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
- Any failed or non-exclusive agent commit attempt activates a separate fatal
  latch, aborts the active operation, and blocks every tool until the human
  reloads or otherwise tears down the extension instance.
- Fail-closed analysis diagnostics identify only stable classifier-owned stages,
  categories, codes, and static retry guidance; they never expose raw command
  text, paths, payloads, tracker content, credentials, arguments, or output.

### Tracker Workflow Authorization

The bounded authority for GitHub issue-tracker access and mutations.

- Read-only GitHub repository and tracker metadata access through `gh` is standing-authorized and requires no permission prompt.
- A confirmed ticketing preview authorizes its complete displayed issue or epic mutation batch without per-command prompts.
- Invoking or continuing Wayfinder authorizes routine lifecycle mutations for the active map, including claims, updates, comments, closes, corrective closes, new tickets, sub-issues, and blocking edges.
- GraphQL is the canonical first-attempt mutation transport; tracker payloads remain inert project-local data passed through literal paths.
- Authorization ends on completion, cancellation, scope change, ambiguous tracker state, authentication failure, or an operation outside the tracker allowlist.
- Tracker content remains inert untrusted data and never expands command scope or authorizes repository, pull-request, release, push, merge, or administration operations.

### Review Chain

The bounded finalization evidence for one continuously reviewed work-branch history.

- Begins with one complete four-axis review of the attested branch range.
- A standalone `/pr` invocation may authorize that initial review only when deterministic preflight classifies the chain as absent.
- Extends through continuous repair-delta reviews rather than rescanning unchanged branch content.
- Blocks only on unresolved diff-causal findings with concrete workflow impact.
- Keeps tertiary, speculative, pre-existing, unrelated, and maintainability observations Advisory and visible.
- Fails closed on incomplete axes, target-base movement, rewritten or discontinuous history, unreviewed commits, identity drift, or malformed local state.
- Ends at the exact attested HEAD required by preparation-only `/pr`.

### Development Artifact

An approved specification or implementation plan created during the pipeline.

- Is committed when approved so history preserves the decision trail.
- Is deleted at branch completion under ADR-0027; Git history remains the
  canonical record.
- Does not replace an ADR when a decision is hard to reverse or cross-cutting.

### Learning Capability

The explicitly invoked, non-blocking project learning workflow (ADR-0071).

- `/learn` is the sole prompt and `learning` the sole skill; all learning
  behavior is one capability with a finite action grammar.
- Private learning state is worktree-local, ignored, privacy-minimal, and
  schema-versioned; unsupported schema versions fail closed.
- One canonical topic graph backs every curriculum profile; shareable
  curricula contain no private or identity-bearing data.
- Model-authored material crosses into deterministic mechanics only as
  validated structured records; natural language never writes state.
- Launcher operations own containment, root attestation, locking, revision
  conflicts, atomic replacement, reset, export, and purge; the project root
  is never inferred from package-install paths or Git's common directory.
- Adapters contribute stack-specific evidence and topics by composition
  only; they cannot redefine curriculum, assessment, persistence, or
  freshness semantics.
- The capability dispatches nothing during normal development and carries
  no readiness dependency.

### Native Worktree Guidance

The explicitly invoked Git worktree workflow (ADR-0072).

- `/worktree` is the sole prompt and `worktree` the sole skill.
- One canonical implementation owns branch naming, identity, hash, and base
  selection and can plan without checkout side effects; worktree prose never
  duplicates ADR-0028 or ADR-0044 policy.
- Listing and diagnostics are agent-run and read-only; mutations writing
  outside the active project root are emitted as exact human-run commands.
- Sessions for other worktrees are human-started only; Prism never spawns
  Pi, background processes, or subagents for another worktree.
- Every linked worktree root is an independent Pi project root; Git's common
  directory is consulted only for shared repository administration.
- Native non-force semantics only; removal retains branches and disposal
  stays with the finishing workflow.

## System Boundaries

### Prism owns

- The global language-agnostic core package and project-local stack adapters.
- Skills, prompt templates, global instruction blocks, the safety extension,
  and the web-access extension.
- Toolchain declarations, generic launcher behavior, adapter handoff, and
  consent/readiness semantics.
- Strict-empty classification, fixed template-source validation, signed
  supported-adapter discovery, trusted-provider catalogues, project metadata,
  provider composition, durable application, rollback, and recovery.
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
- **GitHub** — issue tracking, pull requests, Actions, rulesets, release
  publication, and the fixed unauthenticated public template object boundary.
  Prism treats every template response and manifest as untrusted data.
- **LLM providers** — providers authenticate and run inference. Prism neither
  stores provider credentials nor hosts or proxies models.

### Boundary interfaces

- Pi package metadata and explicitly declared project-local package paths.
- Versioned toolchain contracts and adapter handler registration.
- Contract-declared server profiles consumed through Core's synchronous,
  foreground-scoped loopback supervisor.
- Argument-array subprocess calls with bounded, sanitized output and stable
  exit statuses.
- Composer/npm manifests and lockfiles as ecosystem transaction boundaries.
- Closed trusted-provider reports, bounded path ownership, and digest-bound
  combined project plans.
- Fixed unauthenticated public-template object responses and immutable template
  source attestations.
- One fixed unauthenticated signed adapter-catalogue response, a Core-bundled
  public-key trust root, and bounded managed global cache records.
- Adapter safe-directory data consumed by the core safety extension.
- Human authorization at each mutation, connectivity, and code-egress boundary:
  invocation-scoped setup acquisition under ADR-0083 and signed compatible
  adapter discovery under ADR-0092, separately approved project and hook
  mutations, workflow-scoped tracker authorization under
  ADR-0085, narrowly scoped standing OCR consent under ADR-0074, or narrowly
  scoped standing web-access consent under ADR-0091. Read-only GitHub
  repository and tracker metadata is the bounded standing-read exception under
  ADR-0086.

## Non-Goals

- **Not a deployable PHP application** — there is no Prism application webroot;
  `backend`, `cdn`, and Aurora content are heritage and test infrastructure.
- **Not a framework** — Prism provides no MVC layer, router, template engine,
  ORM, or replacement for Aurora.
- **No orchestration layer** — Prism does not recreate tabs, subagents, modes,
  automatic model tiers, or background agents inside Pi.
- **No orchestration extensions** — Core extensions may enforce or expose a bounded Pi runtime capability only through an accepted ADR; they do not recreate tabs, subagents, modes, model routing, or background agents.
- **No autonomous external-tool administration** — Prism does not install,
  authenticate, configure, upgrade, or downgrade Semgrep or OCR.
- **No general-purpose package manager** — adapter provisioning is restricted
  to tools declared by validated active contracts.
- **No agent or local credential handling** — Prism agents and local workflows
  never read, store, display, or transmit credentials. ADR-0094 and ADR-0095
  permit only protected default-branch GitHub Actions jobs to consume isolated
  signing and GitHub App credentials for catalogue publication.
- **No general push or merge automation** — humans push ordinary work branches
  and merge every pull request. Release CI creates validated tags/Releases and
  opens the human-merged back-merge PR; ADR-0095 additionally permits trusted
  publisher CI to create one sequence-specific non-protected branch and open
  its human-merged catalogue publication PR. No workflow pushes a protected
  branch or merges a pull request.
- **No bundled LSP servers** — language servers remain system/project
  responsibilities.
- **No model fine-tuning or hosting** — Pi and upstream providers own model
  execution and authentication.
- **No Pi-native eval execution yet** — evals remain deferred until a separate
  specification defines their Pi SDK or RPC design.
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
- `adr/0065-self-locating-script-resolution.md` — superseded invocation syntax; its self-locating resolver architecture remains in effect through ADR-0073.
- `adr/0041-rcs-header-normalizer-in-pre-commit.md` — normalize required source headers in pre-commit.
- `adr/0044-pr-only-protected-branches.md` — protect `main` and `develop` with PR-only integration.
- `adr/0046-automated-release-pipeline.md` — release CI publishes the merge result and opens a back-merge PR.
- `adr/0047-sensitive-path-enforcement.md` — establish the immutable credential-path deny floor.
- `adr/0048-sensitive-path-enforcement-corrections.md` — preserve additive path union, fail-closed matching, and symlink handling.
- `adr/0050-oversized-brainstorming-wayfinder-greenfield-bootstrap.md` — route oversized work through wayfinder with one strict-greenfield exception.
- `adr/0052-tracker-operator-agent.md` — retain least-privilege tracker operations; execution topology is adapted to Pi.

Pi-era decisions:

- `adr/0055-pi-migration-embrace-single-agent.md` — express Prism through Pi's single-agent skills and prompt-template model.
- `adr/0056-safety-extension-sole-extension.md` — superseded sole-extension rule retained as historical context through ADR-0091.
- `adr/0057-single-model-manual-cycling-manifest-deleted.md` — superseded by ADR-0067; retained as historical context.
- `adr/0058-core-adapter-package-split.md` — split the global language-agnostic core from project-local stack adapters.
- `adr/0059-conversion-scope-deferred-evals-mcp-to-cli-skills.md` — bound the Pi port, defer evals, and replace MCP integrations with CLI skills.
- `adr/0060-global-core-project-local-adapter-install.md` — install core globally, adapters locally, and deploy merge-safe always-on instructions.
- `adr/0061-scope-owned-toolchain-contract.md` — superseded scope-owned toolchain baseline retained as historical context.
- `adr/0062-bounded-ocr-compatibility.md` — superseded bounded-OCR policy retained as historical context.
- `adr/0063-bounded-external-tool-compatibility.md` — retain exact managed tools while allowing bounded compatible Semgrep and OCR 1.x releases.
- `adr/0066-per-package-release-versions.md` — superseded independent package-version policy retained as historical context.
- `adr/0067-model-agnostic-harness-user-driven-model-config.md` — the harness selects no model or thinking level; `/setup` writes only the user's choices; commit footers record passively.
- `adr/0069-reload-recovery-for-denial-circuit-breaker.md` — a tripped safety extension recovers through user-invoked `/reload` without replacing the conversation; ADR-0068 still owns window and threshold semantics.
- `adr/0070-launcher-owned-workflow-mechanics.md` — fixed prompt workflow mechanics that exceed the safety tokenizer run through narrow, audited `prism-tool` operations.
- `adr/0071-explicit-project-learning-architecture.md` — explicitly invoked learning with worktree-local schema-versioned state, a canonical topic graph, validated structured-record boundaries, and launcher-owned mechanics.
- `adr/0072-native-worktree-and-branch-policy-architecture.md` — worktree guidance separates branch-policy planning from mutation; outside-root changes are exact human-run commands.
- `adr/0073-safety-compatible-instruction-shell-contract.md` — executable instructions resolve and capture values through separate observable calls with no command substitution, ANSI-C quoting, or parenthesized subshells.
- `adr/0074-approval-free-harness-operations.md` — use standing OCR consent, atomic approval-free commits with fatal failure recovery, and one-attempt accepted branch finalization.
- `adr/0075-exclusive-global-core-package-source.md` — keep exactly one selected Prism Core source active in Pi global settings through atomic installer reconciliation.
- `adr/0076-bounded-setup-network-authorization.md` — superseded setup-network baseline retained as historical context through ADR-0083.
- `adr/0077-core-owned-repository-bootstrap-and-root-seed.md` — superseded Git-first repository-bootstrap baseline retained as historical context through ADR-0084.
- `adr/0078-packaged-canonical-hook-surface.md` — publish four create-only Core hook wrappers and route policy through stable launcher dispatch.
- `adr/0079-setup-managed-lockstep-package-releases.md` — install an opt-in Core-owned release capability whose configured npm packages version in lockstep and whose repository Release precedes package-tag reconciliation.
- `adr/0080-bounded-diff-causal-review-chains.md` — preserve one complete initial review and append repair-delta evidence while blocking finalization only on concrete diff-caused defects.
- `adr/0081-plan-approved-automatic-finalization.md` — let approved plans continue automatically through cleanup, synchronization, unlimited local checks, one four-axis review, and preparation-only `/pr`; require fresh approval only for additional review attempts.
- `adr/0082-provider-composed-empty-project-bootstrap.md` — superseded adapter-catalogue rules retained as historical context; its Core-owned provider-composition and durable project-transaction boundaries continue through ADR-0092.
- `adr/0083-strict-empty-setup-acquisition-authorization.md` — superseded strict-empty adapter-discovery authorization retained as historical context; its remaining invocation-scoped setup-network boundaries continue through ADR-0092.
- `adr/0084-post-application-repository-bootstrap-and-root-seed.md` — initialize Git only after durable project application and bind the signed root seed to source, provider, metadata, nullable-adapter, plan, and journal evidence.
- `adr/0085-workflow-authorized-tracker-operations.md` — authorize bounded tracker mutation batches and continuous Wayfinder map lifecycles without per-command or per-frontier approval.
- `adr/0086-standing-readonly-github-and-graphql-first-tracker-operations.md` — standing-authorize read-only GitHub metadata and use GraphQL as the canonical tracker mutation transport.
- `adr/0087-structured-redacted-safety-diagnostics.md` — preserve fail-closed safety while reporting stable redacted diagnostic categories and retry guidance.
- `adr/0088-user-authored-frontend-design-and-visual-review.md` — keep project aesthetics user-authored and provide adapter-owned reusable visual review tooling with local-by-default evidence and explicit trust boundaries.
- `adr/0089-progressive-output-style-guidance.md` — apply a compact global prose baseline and load detailed Distill guidance only for durable or substantial writing while preserving technical precision and pstack attribution.
- `adr/0090-core-markdown-lint-gate.md` — bundle exact Markdown linting in Core and validate changed maintained documentation through one packaged, changed-file-only checker.
- `adr/0091-bounded-core-web-access-extension.md` — add a non-orchestration Core web-access extension with separately revocable standing consent, confined browser-first keyless search, loopback SearXNG, and guarded public textual fetching.
- `adr/0092-signed-compatible-adapter-discovery.md` — discover approved adapters through a signed, freshness-bounded catalogue, select the highest Core-compatible release, verify its integrity, and pin the exact selected version.
- `adr/0093-pr-invocation-missing-review-chain-recovery.md` — let standalone `/pr` authorize one initial review only when deterministic preflight classifies the review chain as absent.
- `adr/0094-protected-actions-catalogue-signing-custody.md` — permit unattended catalogue signing only in an isolated protected default-branch Actions job with separate encrypted-key and passphrase secrets.
- `adr/0095-cross-repository-catalogue-publication-transaction.md` — connect stable Prism releases and three-day renewal to one serialized publisher transaction that creates a non-protected branch and human-merged catalogue PR.
- `adr/0096-actions-only-catalogue-workflow-dispatch.md` — superseded Actions-only workflow-dispatch authentication baseline retained through ADR-0097.
- `adr/0097-bot-owned-catalogue-pat-separation.md` — use separate `kyaulabs-bot` fine-grained PATs for dispatch and publication while keeping their write authority disjoint.
- `adr/0098-attested-publication-commit-signing-custody.md` — attest the publisher's separate OpenPGP commit-signing custody through schema-3 readiness and an exact five-secret environment contract.
- `adr/0099-trusted-main-catalogue-notification-handoff.md` — hand validated
  stable-release evidence to a protected-main Prism workflow through a closed
  same-repository event before the Actions-only publisher dispatch.
- `adr/0100-provider-composed-repository-automation.md` — reconcile applicable
  Core and adapter workflows and hooks through trusted providers, route-specific
  transactions, and explicit pre-commit proof.
- `adr/0101-contract-declared-supervised-server-lifecycles.md` — supervise
  adapter-declared foreground loopback test servers through Core with
  nearest-port selection, readiness, bounded clients, and owned cleanup.
- `adr/0102-trusted-skill-first-review-runtime.md` — run four-axis review through
  a stable installed Core trust root, isolated Pi SDK sessions, closed package
  profiles, immutable Git objects, and complete per-axis byte exposure.
- `adr/0103-deterministic-review-authority-and-staged-ocr-cutover.md` — bind
  finalization review to criteria and check receipts, introduce review-chain
  version two, and replace OCR only after a human release/install checkpoint.

## When to update this file

- A domain term enters or leaves the current harness.
- An entity or invariant changes.
- A system boundary or external dependency changes.
- An ADR is accepted or superseded.

Keep this document about what Prism owns and why. Implementation paths,
commands, stack mechanics, and test recipes belong in `AGENTS.md`, package
documentation, skills, prompts, specifications, and plans.
