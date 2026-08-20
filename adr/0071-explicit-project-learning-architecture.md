# 0071. Explicit project-learning architecture

Date: 2026-08-19

## Status

Accepted

## Context

The non-blocking learning roadmap (#337) resolved to build a project-agnostic
learning capability: curriculum generation from repository evidence, one-topic
lessons with assessment, and private progress tracking. The project-learning
capability specification defines the behavior, but several of its choices are
hard to reverse or cross-cutting and need a permanent record:

- Persisted private state establishes a schema that users will accumulate
  against; changing it carelessly strands progress or leaks data.
- The capability adds resources (`/learn` prompt, `learning` skill, launcher
  operations) to the globally installed core package, expanding its published
  surface.
- Model-authored natural-language material (explanations, questions, transfer
  adjudications) must cross into deterministic state mechanics without
  letting prose drive state transitions.
- Adapters need a composition seam that enriches technical topics without
  surrendering core ownership of curriculum structure, assessment, or
  persistence.
- Repository-owned curricula (such as the Prism contributor overlay) need a
  registration mechanism that does not add commands, skills, or engines.

ADR-0055 (single agent), ADR-0056 (sole safety extension), ADR-0058
(core/adapter split), ADR-0059 (deferred evals), ADR-0067 (model-agnostic),
and ADR-0070 (launcher-owned mechanics) constrain the shape but none owns
learning persistence or assessment state.

## Decision

We adopt an explicitly invoked, non-blocking learning architecture owned by
Prism core:

- `/learn` is the sole project-learning prompt and `learning` is its sole
  skill. Generation, lessons, assessment, dashboards, reset, export, and
  purge are actions of one capability, not separate skills or commands.
- Private learning state is worktree-local, ignored, privacy-minimal, and
  schema-versioned. Unsupported schema versions fail closed; migrations are
  explicit, not silent.
- One canonical topic graph per project backs every curriculum profile.
  Curriculum files are shareable, repository-relative, and free of private
  or identity-bearing data.
- Model-authored material crosses into deterministic mechanics only as
  validated structured records: versioned schemas for curriculum candidates
  and transfer adjudications, defined before implementation planning.
  Deterministic mechanics own all resulting state transitions; natural
  language never writes state directly.
- Launcher operations own containment checks, root attestation, locking,
  revision conflicts, atomic replacement, reset, export, and purge. The
  startup root is attested per invocation — inside a Git worktree, that
  worktree's top-level root; otherwise the canonical Pi startup directory —
  and never inferred from package-install paths or Git's common directory.
- Adapters contribute stack-specific roots, exclusions, vocabulary, evidence,
  and technical topics through composition only. They cannot redefine
  curriculum structure, assessment semantics, persistence, or freshness.
- Repository-owned curriculum overlays register additional topics with the
  existing generation action. They add no commands, skills, state engines,
  or profiles.
- The capability dispatches nothing during normal development: no extension,
  background process, transcript monitor, hook, or readiness dependency, and
  no model or provider selection.

## Consequences

- The private-state schema, structured-record contracts, and launcher
  operations become stable public seams; changing them later requires
  deliberate versioning work.
- Normal Prism workflows are provably unaffected, which keeps the capability
  removable and preserves the pipeline's non-goals.
- Worktree-local state means linked worktrees track progress independently;
  shareable curricula travel through Git while private progress does not.
- Launcher operation count grows; each operation stays narrow and audited
  under ADR-0070.
- The Prism contributor overlay specification depends on this ADR and the
  structured-record schemas stabilizing first.
- Cross-platform lock and atomic-replacement behavior needs a focused
  Linux/macOS prototype before implementation planning if no dependency-free
  mechanism is already established.

## Alternatives Considered

- **Extension-owned learning engine** — rejected: ADR-0056 keeps safety the
  sole extension; a second extension would expand the always-on surface for
  an explicitly invoked feature.
- **Shared/global learning state** — rejected: it would leak progress across
  worktrees and projects, break privacy minimality, and couple unrelated
  checkouts.
- **Separate skills per learning action** — rejected: six skills for one
  capability duplicates context and drifts; one skill with an action grammar
  keeps the contract finite.
- **Model-owned state writes** — rejected: natural-language output must never
  mutate persisted state; validated structured records keep the boundary
  deterministic and testable.
