# Spec: Explicit Teach Modes

**Date:** 2026-08-19
**Status:** Draft

## Problem Statement

Prism can summarize recently completed work, but it lacks a precise, explicitly invoked interface for explaining mechanics, reconstructing rationale, or reflecting on a failed interaction. Users need richer teaching without changing normal TDD, debugging, verification, review, or implementation behavior.

Teaching must remain optional and read-only. It must not add required questions, pauses, state writes, token cost, or readiness conditions to ordinary engineering work.

## Solution

Extend the existing `/teach` prompt with three modes:

- `explain` teaches concepts and mechanics behind a selected target;
- `why` explains recorded rationale, alternatives, and trade-offs; and
- `reflect` analyzes a user-selected failed prompt or interaction and offers a revised copyable prompt.

The command accepts an optional target, profile, and depth. It defaults to the latest meaningful completed work only when no target is supplied. It uses current conversation and bounded repository evidence, loads only the authoritative workflow skill needed for the target, and never reruns or resumes the workflow it explains.

No teaching skill, launcher operation, extension, or persistent learning state is introduced.

## User Stories

1. As a contributor, I want `/teach explain` to explain a test, change, workflow phase, failure, finding, file, diff, commit, decision, or conversation exchange, so that I can understand the mechanics behind it.
2. As a contributor, I want `/teach why` to distinguish recorded rationale from agent inference, so that I can trust what is known and see where uncertainty remains.
3. As a contributor, I want `/teach reflect` to analyze a failed interaction I explicitly select, so that I can identify the failure mode and improve a future prompt without retrying automatically.
4. As a learner, I want to choose technical or layperson language and concise or deep treatment, so that the explanation matches my immediate need.
5. As a contributor working on an active task, I want teaching to accept unfinished work as evidence, so that I do not need to complete or commit a change before asking for an explanation.
6. As a maintainer, I want teaching to preserve existing `PASS`, `FAIL`, `N/A`, incomplete, and review findings exactly, so that an explanation cannot upgrade engineering evidence.
7. As a user, I want one optional application question after an explanation, so that I can practice applying the lesson without creating mastery state.
8. As a maintainer, I want normal development to remain byte- and behaviorally independent from teaching when `/teach` is not invoked.

## Implementation Decisions

- Keep `/teach` as the sole standalone explanation and reflection command. Do not add `/why`, `/explain`, `/reflect`, or workflow-specific teaching commands.
- Parse a finite invocation grammar containing mode, optional target, optional profile, and optional depth. Unknown values produce usage guidance rather than silently selecting behavior.
- Use technical as the standalone default profile. A curriculum may supply its active profile when it explicitly invokes teaching, but standalone teaching does not persist or infer a preference.
- Accept concise and deep as explicit depth modifiers without changing the profile.
- Resolve evidence in this order: explicit target, relevant current conversation, then latest meaningful work only as the no-target fallback.
- Load one workflow skill for a single-workflow target and a second only when the explanation genuinely crosses two workflow contracts. Never eagerly load the whole pipeline.
- Apply the accepted lenses for TDD, debugging, verification, and review. Each response separates established evidence, workflow rationale, alternatives and trade-offs, limitations or missing evidence, and a transferable lesson.
- Reflection remains diagnostic. It may recommend a separately invoked workflow when it reveals a defect or unresolved design decision, but it never starts that workflow.
- The optional application question is formative and unscored. Its answer cannot write private learning state or mark a curriculum topic learned.
- The prompt performs bounded read-only evidence gathering. It does not rerun tests, debugging probes, verification, review, OCR, SAST, or other tooling merely to explain prior evidence.
- Add no always-loaded instruction text and no teaching references to normal workflow skills. Progressive disclosure keeps teaching cost at zero until explicit invocation.
- Preserve ADR-0055's single-agent model, ADR-0056's sole-extension boundary, ADR-0058's language-agnostic core, ADR-0059's deferred eval framework, and ADR-0067's model-agnostic behavior.

## Testing Decisions

- Treat the packaged prompt resource and its invocation grammar as the highest deterministic public seam.
- Validate prompt frontmatter, argument hint, finite modes, profile/depth grammar, no-mode fallback, and the absence of separate explanation commands.
- Statistically assert the read-only contract: no state mutation, workflow resumption, gate invocation, review fix, OCR/SAST execution, or automatic dispatch.
- Validate targeted skill-loading rules and workflow-lens ownership as semantic prompt contracts rather than generated transcript snapshots.
- Smoke-load the packaged prompt offline through Pi without submitting a provider prompt.
- Verify package archive inclusion and parity between checkout and packed resources.
- Add negative architecture tests proving normal TDD, debugging, verification, review, hooks, and gates do not invoke teaching.
- Do not assert generated prose, explanation quality, exact application questions, or model behavior.

## Out of Scope

- Curriculum generation, lessons, mastery, remediation, dashboards, or private state.
- Mandatory comprehension gates or teaching narration inside normal development.
- Automatic transcript monitoring, prompt-failure detection, learner profiling, or analytics.
- Retrying prompts, resuming implementation, applying fixes, or changing engineering verdicts.
- New skills, extensions, launcher operations, subagents, model preferences, or OpenCode eval machinery.

## Further Notes

This specification is the first independent boundary from the resolved [non-blocking learning roadmap](https://github.com/kyaulabs/prism/issues/337). It incorporates the decisions recorded in [scope optional reflection exercises](https://github.com/kyaulabs/prism/issues/342) and [compose non-blocking pipeline teaching](https://github.com/kyaulabs/prism/issues/338).

The deterministic acceptance approach follows the [Pi-native learning test strategy](https://github.com/kyaulabs/prism/issues/347). Deferred mandatory interventions remain governed by the separate learning-pipeline intervention follow-up.
