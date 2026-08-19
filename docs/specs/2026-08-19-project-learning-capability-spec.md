# Spec: Project Learning Capability

**Date:** 2026-08-19
**Status:** Draft

## Problem Statement

Prism has no project-agnostic way to inspect an active target project, build evidence-backed layperson and technical curricula, teach one topic at a time, verify application, track worktree-local progress, or show a privacy-minimal learning dashboard.

The capability must work across Git and non-Git projects, compose with active stack adapters without surrendering core ownership, remain useful for large or imperfect repositories, and stay completely absent from normal engineering execution unless explicitly invoked.

## Solution

Provide one explicitly invoked project learning capability through a thin `/learn` prompt, one `learning` skill, and narrow launcher-owned deterministic operations.

The capability generates one canonical evidence-backed topic graph and derives layperson and technical curricula from it. It teaches one topic at a time, requires a same-attempt scenario and transfer check before recording mastery, offers bounded remediation, derives a non-gamified dashboard, and stores only privacy-minimal progress beneath the active worktree's ignored private learning area.

The learning skill owns interaction and evidence interpretation. Launcher operations own exact filesystem, Git, schema, locking, digest, state-transition, reset, export, and purge mechanics. Active adapters may contribute stack-specific evidence and technical topics but cannot redefine curriculum structure, assessment, persistence, or freshness semantics.

### Invocation contract

```text
/learn [generate|lesson|dashboard|reset|export|purge] [target] [--profile layperson|technical] [--depth concise|deep]
```

- A bare `/learn` displays the dashboard and next eligible topic without starting a lesson.
- `generate [project]` previews regeneration of the canonical project source map and both project curriculum profiles before any approved write. Additional repository-owned curriculum identifiers may register with this action without adding commands.
- `lesson [topic-id]` opens the selected topic or, when omitted, the next prerequisite-ready topic. Profile defaults to the curriculum's active profile; Prism contributor topics always force technical. Depth changes only the current interaction.
- `dashboard [curriculum-id]` derives status from canonical private state and never starts another action.
- `reset [all|curriculum-id|topic-id]` previews the exact scope and requires confirmation before state replacement.
- `export [destination]` defaults to the private export area. An external destination requires confirmation and a tracked/shared-destination warning.
- `purge exports` enumerates owned exports and requires separate confirmation. It never implies state reset or reusable-curriculum deletion.

Unknown actions, profiles, depth values, curriculum identifiers, topic identifiers, or repeated modifiers return usage guidance without mutation. Actions do not continue into another action automatically.

## User Stories

1. As a project participant, I want to generate a curriculum from the active target project, so that learning material reflects current repository evidence rather than generic assumptions.
2. As a non-technical stakeholder, I want a layperson curriculum covering purpose, users, vocabulary, workflows, data movement, risks, and delivery, so that I can understand the project without source-level detail.
3. As a technical contributor, I want a technical curriculum covering architecture, entry points, interfaces, persistence, tests, security, operations, and contribution conventions, so that I can work safely in the project.
4. As a learner, I want one canonical topic graph behind both profiles, so that shared concepts, identifiers, prerequisites, and freshness do not drift between duplicate curricula.
5. As a learner, I want to preview generated artifacts before approving writes, so that project documentation changes remain visible and consent-gated.
6. As a maintainer, I want adapter contributions to enrich technical topics without owning the generic engine, so that Prism remains language-agnostic.
7. As a learner in a large repository, I want breadth-first bounded inspection and resumable source maps, so that every identified boundary is accounted for without ingesting every file in one context.
8. As a learner in an imperfect project, I want missing context and stale documentation reported explicitly, so that inferred or conflicting claims are never presented as certain facts.
9. As a learner, I want the next prerequisite-ready topic suggested while retaining the option to select another topic after seeing prerequisite gaps.
10. As a learner, I want one scenario question and one transfer question graded together, so that presentation or self-report alone cannot mark a topic learned.
11. As a learner who misses a concept, I want targeted reteaching and at most one fresh same-invocation retry, so that remediation is useful but never coercive or unbounded.
12. As a learner, I want progress states for unseen, in progress, learned, and stale topics, so that evidence changes are visible and prior learning is not silently treated as current.
13. As a learner, I want a dashboard derived from canonical state, so that totals, topic status, prerequisites, attempts, and next topics remain consistent without duplicate aggregates.
14. As a privacy-conscious user, I want progress to remain worktree-local, ignored, path-free, identity-free, and free of raw answers or transcripts.
15. As a user, I want explicit reset, export, and purge operations with scoped confirmation, so that I control private learning state and exports.
16. As a maintainer, I want concurrent or stale writes to fail safely rather than overwrite another learning session.
17. As a developer not using learning, I want all normal Prism prompts, skills, hooks, gates, and reviews to behave exactly as before.

## Implementation Decisions

### Public capability and ownership

- Add one `/learn` prompt as the explicit user entry point and one `learning` skill as the complete interaction contract. Do not create separate skills for generation, lessons, assessment, state, dashboards, or profiles.
- Keep model-authored explanations, curriculum prose, examples, scenario questions, and transfer adjudication agent-owned, but exchange validated structured records with deterministic mechanics.
- Define versioned structured-record contracts before implementation planning: a curriculum-candidate record (schema version, stable topic identifiers, objectives, prerequisites, repository-relative evidence paths, profile applicability, confidence, evidence digests) and a transfer-adjudication record (schema version, topic identifier, content digest, rubric concepts with pass states, overall pass/fail). Deterministic mechanics validate these records against their schemas and reject malformed, unsupported-version, or out-of-bounds payloads. Natural language never writes state directly.
- Put exact operations that require canonical paths, Git inspection, digests, locks, revisions, atomic replacement, or bounded deletion behind narrow launcher interfaces in accordance with ADR-0070.
- Keep generic learning behavior in Prism core. Active adapters contribute stack-specific roots, exclusions, vocabulary, evidence, and technical topics through composition only.
- Add no extension, background process, transcript monitor, or normal-pipeline hook.

### Root, artifacts, and privacy

Use this decision-rich layout contract:

```text
docs/learning/
├── .gitignore
├── curricula/project/
│   ├── source-map.md
│   ├── layperson.md
│   └── technical.md
└── .local/
    ├── progress.json
    └── exports/
```

- Resolve the canonical Pi startup directory for each learning invocation and attest it through a launcher operation before any state access. Inside a Git worktree, use that worktree's top-level root; otherwise use the canonical startup directory without walking upward for project markers.
- Never infer the project root from package-install paths or Git's common directory. Linked worktrees therefore have independent private state while shareable curricula travel through Git.
- Reject symlinked state components, containment escapes, ambiguous canonicalization, non-regular state files, and unsupported schema versions.
- In Git projects, private writes require the private subtree to be untracked and ignored by the nested project ignore contract. Creating or changing that ignore file is a separate approved project mutation.
- Store schema version, revision, update time, curriculum profile and digest, stable topic identifiers, content digests, attempt counts, per-check pass state, last attempt time, and learned time.
- Never store raw questions, selected choices, free-text transfer answers, prompts, transcripts, source excerpts, identities, models/providers, remotes, or absolute paths.
- Serialize mutations under an exclusive lock, reject stale revisions, write an exclusive same-directory temporary file, flush, atomically rename, and preserve original bytes on pre-application failure.

### Project inspection and curriculum generation

- Inspect instructions, context, accepted ADRs, readmes, manifests, CI, entry points, source roots, tests, schemas, recent Git history, and active-adapter evidence through bounded read-only discovery.
- Treat documentation and instructions as claims requiring corroboration. Current executable evidence and accepted ADRs win when claims conflict.
- Never inspect credentials, environment files, vendored dependencies, generated assets, arbitrary binary content, global package-install directories, or private learning state as curriculum evidence.
- Build a coverage map across purpose and users, domain vocabulary, user workflows, architecture and entry points, data and persistence, boundaries and dependencies, testing and quality, security and trust boundaries, operations and releases, and contribution conventions.
- Mark a facet not applicable only with evidence. Preserve unresolved gaps and refuse a false complete result.
- For large repositories, inventory breadth-first, identify boundaries, sample representative public evidence from each boundary, and persist a shareable source map for explicitly resumed sequential work.
- Missing project context does not block generation. Infer provisional terms and boundaries with explicit confidence, but never run `/prime` or mutate project context automatically.
- Generate one topic graph with stable slugs, objectives, prerequisites, evidence paths, profile applicability, confidence, and evidence digests. Derive layperson and technical views from that graph.
- Preview all reusable artifact changes before an approved write. Evidence paths remain repository-relative and exclude private or identity-bearing metadata.
- On regeneration, retain unchanged topic IDs, stale only topics affected by changed evidence, place removed evidence under review, and add topics for new boundaries.

### Lesson, assessment, and remediation

- Default to the next prerequisite-ready topic, while allowing explicit topic selection after displaying prerequisite gaps and offering the prerequisite path.
- Present one topic's objective, relevance, prerequisites, evidence, baseline explanation, and worked example.
- Ask one objective scenario-based multiple-choice question followed by one brief transfer/application question. Do not reveal scenario feedback before both responses are submitted.
- Grade both checks as one complete attempt against the current content digest. Both must pass in the same attempt before the topic becomes learned.
- Require a transfer rubric with two to four evidence-grounded concepts. Keyword presence and self-reported understanding are insufficient. Partial, ambiguous, or uncertain adjudications do not pass.
- Keep natural-language transfer judgment behind a narrow validated structured boundary. Deterministic mechanics validate the adjudication schema and own all resulting state transitions.
- On failure, explain the demonstrated misconception, reteach only the missing concept with a different example, and offer one fresh two-part retry. A second failure stops without automatic continuation.
- Never infer intelligence, expertise, or a permanent learner profile. Profile selects explanation baseline; performance may adjust only the current interaction's depth.

### Mastery, dashboard, reset, and export

- Use unseen, in progress, learned, and stale as the only mastery states.
- Bind learned status to the current content digest. A failed stale reassessment removes current learned status while preserving historical attempts.
- Derive dashboard totals, percentages, topic status, attempt counts, prerequisite readiness, dates, and next eligible topic from canonical state.
- Exclude streaks, rankings, time-spent metrics, confidence scores, learner categories, and raw answers.
- Require explicit scoped confirmation for reset. Reset state atomically without changing reusable curricula or silently creating backups.
- Export only through explicit invocation. Default exports remain private, versioned, path-free, identity-free, and offline. Export elsewhere requires confirmation and a tracked/shared-destination warning.
- Treat export deletion as a separate purge. Enumerate owned regular files and never use unbounded recursive deletion.

### Architecture constraints

- Preserve ADR-0055's single-agent interaction, ADR-0056's sole safety extension, ADR-0058's core/adapter boundary, ADR-0059's deferred eval framework, ADR-0067's model-agnosticism, and ADR-0070's launcher-owned deterministic mechanics.
- The capability must be removable without changing normal development or leaving a readiness dependency.

## Testing Decisions

- Test the `/learn` workflow and structured launcher operations as the highest public deterministic seams.
- Use pure Node tests for normalized curricula, topic IDs, digests, freshness, assessment transitions, dashboard derivation, state schema, revision conflicts, reset/export planning, schema validation of curriculum-candidate and transfer-adjudication records (including unsupported versions and out-of-bounds payloads), and startup-root attestation.
- Use disposable Git and non-Git projects for root selection, containment, ignore/tracked checks, symlinks, locks, atomic replacement, private modes, linked-worktree isolation, and failure injection.
- Use synthetic repositories for missing context, conflicting claims, adapter composition, conflicting adapter signals, large-repository boundary accounting, and preview/write sets.
- Parse generated learning artifacts into semantic records. Assert coverage, identifiers, prerequisites, evidence ownership, confidence, and freshness rather than Markdown prose.
- Smoke-load the prompt and skill offline through Pi without invoking a provider. Verify frontmatter, agreed resource inventory, package archive inclusion, and checkout/package parity.
- Add static negative tests proving normal pipeline resources do not dispatch learning or read private state and that safety remains the sole production extension.
- Inject clocks, digests, filesystem adapters, Git runners, and transfer adjudications for deterministic tests.
- Do not assert authored explanations, lesson prose, question wording, or arbitrary natural-language grading quality.

## Out of Scope

- The Prism-specific contributor curriculum, which is a dependent overlay specification.
- Standalone `/teach` explanation and reflection modes.
- Native worktree management, except using the accepted worktree-root and private-state contracts.
- Mandatory educational interactions, normal-workflow learning analytics, surveillance, inferred capability profiles, or development gating.
- Networked curriculum generation, remote state, shared learner accounts, encryption claims, or external learning services.
- New extensions, subagents, orchestration, model selection, provider-dependent tests, or revived OpenCode evals.

## Further Notes

This specification is the foundational capability from the resolved [non-blocking learning roadmap](https://github.com/kyaulabs/prism/issues/337). It synthesizes the accepted decisions for [portable learning state](https://github.com/kyaulabs/prism/issues/343), [project curriculum generation](https://github.com/kyaulabs/prism/issues/341), [lesson assessment and progress](https://github.com/kyaulabs/prism/issues/339), and the [Pi-native learning test strategy](https://github.com/kyaulabs/prism/issues/347).

Its architecture is recorded in ADR-0071. The dependency-free lock and atomic-replacement mechanism should be proven with a focused Linux/macOS prototype before implementation planning if no established mechanism exists.

The Prism contributor overlay depends on this specification. Native worktree guidance and explicit `/teach` modes remain independent.
