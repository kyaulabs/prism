# Spec: Prism Contributor Curriculum Overlay

**Date:** 2026-08-19
**Status:** Draft

## Problem Statement

The generic project technical curriculum can explain Prism as a repository, but it does not guarantee the specialized knowledge needed to contribute safely to the Prism harness: Pi-native resource ownership, core and adapter boundaries, engineering-pipeline routing, the sole safety extension, toolchain contracts, launcher mechanics, ADR discipline, validation seams, and protected contribution/release workflows.

Embedding this material in the generic learning engine or creating a contributor-specific skill would couple project-agnostic mechanics to one repository, duplicate generic topics, and increase skill count.

## Solution

Provide a technical-only Prism contributor curriculum as a repository-owned overlay on the generated project technical graph.

The overlay uses the existing `/learn` capability, private state, lesson loop, assessment, remediation, dashboard, stable identifiers, and freshness semantics. It adds Prism-specific topics under a distinct namespace, references generic technical topics rather than duplicating them, and stores reusable contributor source-map and technical material in the shareable learning area.

No contributor command, skill, engine, state format, assessment path, or layperson view is added.

### Invocation composition

The overlay registers the `prism-contributor` curriculum identifier with the project learning capability:

```text
/learn generate prism-contributor
/learn lesson prism-contributor/<topic-id>
/learn dashboard prism-contributor
/learn reset prism-contributor[/<topic-id>]
```

Generation first requires a current canonical project technical graph. Contributor lesson and dashboard actions use the existing learning workflow and force the technical profile. Export and purge remain generic `/learn` actions because private state has one engine and schema.

## User Stories

1. As a prospective Prism contributor, I want a technical learning path grounded in current repository evidence, so that I can contribute without relying on stale OpenCode-era assumptions.
2. As a contributor, I want to understand Prism's purpose, ubiquitous language, owned and delegated boundaries, and non-goals before changing the harness.
3. As a contributor, I want to distinguish skills, prompt templates, packages, reference docs, scripts, launcher operations, and the sole extension, so that I place new behavior correctly.
4. As a contributor, I want to understand progressive disclosure and global core versus project-local adapter loading, so that I avoid always-on token cost and package-boundary violations.
5. As a contributor, I want to classify language-agnostic policy versus stack-specific practice, so that adapter concerns never leak into core.
6. As a contributor, I want to route features, bugs, existing issues, consultation, oversized work, and zero-behavior-delta changes through the correct pipeline entry points.
7. As a contributor, I want to understand trust, safety, and separate consent boundaries, so that tracker, registry, consumer mutation, OCR connectivity, and code-egress approvals are never conflated.
8. As a contributor, I want to understand bundled, external, and consumer-development tool scopes and launcher discovery, so that new tool behavior respects the toolchain contract.
9. As a contributor, I want to distinguish context, ADRs, specifications, plans, follow-ups, and issues, so that durable decisions are recorded in the right artifact.
10. As a skill author, I want to apply Pi-native frontmatter, token discipline, package placement, cross-references, attribution, and Gotchas requirements.
11. As a safety or launcher contributor, I want to select the correct pure-logic, event-wiring, shell, and agent-visible command test seams.
12. As an adapter contributor, I want a concrete PHP/web branch without treating its stack rules as generic core behavior.
13. As a maintainer, I want contributors to understand validation, review, branch, commit, PR, release, and publication boundaries before changing distribution behavior.
14. As a learner, I want scenario and transfer checks for every contributor topic, so that familiarity with documentation alone does not count as mastery.
15. As a maintainer, I want repository evidence changes to stale only affected contributor topics rather than invalidating the entire curriculum.

## Implementation Decisions

### Composition and ownership

- Require the active target to be a Prism source checkout, established through current repository evidence. Refuse arbitrary consumer projects and installed package directories.
- Depend on the project learning capability and its canonical project topic graph, technical profile, private state, lessons, assessment, remediation, dashboard, and freshness contracts.
- Add contributor topics under a `prism-contributor/*` namespace. Reference generic project topic identifiers and prerequisites rather than duplicating them.
- Add no layperson profile. The overlay is technical-only.
- Add no contributor prompt, skill, launcher command, state schema, or assessment engine.
- Keep Prism-specific subject matter in repository-owned reusable learning material. Adapter-specific content lives in contribution-area branches rather than the generic contributor spine.

The shareable overlay contract is:

```text
docs/learning/curricula/prism-contributor/
├── source-map.md
└── technical.md
```

The contributor source map references the generic project source map and records only contributor-specific evidence and digests.

### Required contributor graph

The overlay contains a shared spine followed by contribution-area branches.

1. **Prism purpose and evidence hierarchy** — purpose, ubiquitous language, boundaries, non-goals, current Pi-native authority, frozen history, and untrusted audits.
2. **Pi-native resource model** — skills, prompts, packages, progressive disclosure, trust, global/project-local loading, single-agent behavior, and prohibited orchestration.
3. **Core and adapter boundaries** — generic policy, adapter practice, activation, safe-directory data, toolchain registration, and architecture-failure detection.
4. **Engineering pipeline and routing** — on-ramps, specification, architecture review, planning, inline TDD, verification, checking, review, approvals, and artifact lifecycle.
5. **Trust, safety, and consent boundaries** — untrusted content, sensitive paths, destructive commands, circuit breaking, advisory versus enforced rules, and separate approvals.
6. **Toolchain contracts and launcher ownership** — bundled, external, and consumer-development scopes; discovery, readiness, adapter handoff, argument arrays, and launcher-owned mechanics.
7. **Decision artifacts and architecture discipline** — context, ADRs, specifications, plans, RFCs, follow-ups, issues, append-only supersession, and the `ADR-required:` contract.
8. **Skills, prompts, docs, and package authoring** — resource choice, Pi-native frontmatter, token discipline, ownership, cross-references, attribution, and Gotchas.
9. **Safety and launcher changes** — pure classifiers, Pi event wiring, fail-closed behavior, narrow launcher seams, and the correct Node/shell boundary tests.
10. **Adapter contributions** — stack-specific resources, toolchain entries, safe directories, and validation without generic-core drift; include PHP/web as the current concrete branch.
11. **Validation and review** — Node, shell, Pest, Semgrep, package, harness, check, and four-axis review seams; missing evidence remains incomplete.
12. **Contribution and release workflow** — compliant branches, launcher-owned commits, human-only push/PR/publication, protected integration, plan/spec cleanup, release CI, and per-package versions.

Soft prerequisites allow targeted study, but every topic remains independently assessable.

### Assessment and practice

- Reuse the project learning capability's same-attempt scenario and transfer checks for every topic.
- Scenario checks ask the learner to choose the correct Prism boundary, workflow, artifact, or test seam.
- Transfer rubrics require applying the rule to a new proposed contribution rather than repeating terms.
- Optional guided practice may use dry runs or throwaway artifacts, but repository mutation is never required for mastery.
- A capstone may combine topics but cannot replace per-topic mastery evidence.

### Freshness and completeness

- Record repository-relative evidence and content digests and reference the generic project source map's revision or digest.
- Changes to project context, package manifests, global instructions, relevant accepted ADRs, toolchain contracts, safety interfaces, validators, hooks, contribution workflow, or release behavior stale only dependent topics.
- Treat removed or superseded evidence as review work. Never rewrite frozen historical ADRs into current guidance.
- Consider generation complete only when every required module is covered, excluded with evidence, or explicitly unresolved.
- Future adapters add parallel adapter branches rather than expanding the shared spine with stack-specific content.

### Architecture constraints

- Preserve ADR-0055's single-agent model, ADR-0056's sole extension, ADR-0058's core/adapter split, ADR-0059's deferred eval framework, ADR-0067's model-agnostic behavior, and ADR-0070's launcher boundary.
- Keep the overlay removable without changing generic learning or normal engineering behavior.

## Testing Decisions

- Treat semantic overlay artifacts generated through `/learn` as the highest public seam.
- Use one Prism-shaped fixture and one non-Prism fixture to verify target qualification and refusal.
- Assert that the overlay references the generic technical graph, does not duplicate generic identifiers, and uses only the contributor namespace for new topics.
- Assert that no layperson artifact is produced.
- Assert the presence, identifiers, prerequisites, evidence families, and ownership of all required spine and contribution modules.
- Verify PHP/web evidence remains in an adapter branch rather than the shared spine.
- Change one evidence family at a time and verify only dependent contributor topics become stale.
- Verify inherited lessons, attempts, remediation, dashboard, and state use the generic learning engine without contributor-specific variants.
- Verify optional practice does not require repository mutation for mastery.
- Parse semantic records rather than snapshotting curriculum or lesson prose.
- Verify package and repository resource inventory without adding a new skill or prompt.
- Add negative checks proving the overlay is not loaded or read during normal Prism development.

## Out of Scope

- A contributor layperson curriculum.
- A standalone contributor tutorial skill or command.
- Contributor-specific private state, assessment, dashboard, or remediation logic.
- Generic project curriculum generation or learning-engine implementation, which belong to the dependency specification.
- Mandatory contributor certification before development, review, commit, or release work.
- Mutation-based practice requirements, remote classrooms, rankings, analytics, or learner profiling.
- Additional extensions, orchestration, model recommendations, or OpenCode eval revival.

## Further Notes

This specification depends on the project learning capability and synthesizes the accepted [Prism contributor curriculum decision](https://github.com/kyaulabs/prism/issues/345) from the resolved [non-blocking learning roadmap](https://github.com/kyaulabs/prism/issues/337).

Its deterministic acceptance approach follows the [Pi-native learning test strategy](https://github.com/kyaulabs/prism/issues/347). It should not enter planning until the project learning specification's public artifact, identifier, state, and lesson contracts are stable.
