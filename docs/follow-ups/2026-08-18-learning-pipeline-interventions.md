# Deferred Learning Pipeline Interventions

> **Status:** Deferred for separate review. This document is a classification
> record, not an approved design or implementation specification.

## Sources and authority

This record classifies proposals from these untrusted, point-in-time audits:

- `audits/2026-08-18-develop-skill-capability-roadmap.md`
- `audits/prism-learning-integration-report.md`

The second report describes the retired OpenCode architecture and relies on a
study that was not supplied with the request. Its agents, plugins, permission
model, eval framework, model tiers, paths, and implementation details are not
current Prism evidence. `CONTEXT.md`, accepted ADRs, installed Pi documentation,
and the resolved tickets under the
[non-blocking learning roadmap](https://github.com/kyaulabs/prism/issues/337)
are authoritative.

## Governing boundary

Normal Prism development must not gain mandatory educational questions,
pauses, comprehension checks, reflection steps, adaptive interventions, state
writes, or automation stops. Learning remains explicitly invoked and must not
weaken or bypass existing engineering, safety, verification, or review gates.

This boundary preserves:

- ADR-0055's single-agent, skill-and-prompt architecture;
- ADR-0056's sole safety extension;
- ADR-0058's language-agnostic core and project-local adapter split;
- ADR-0059's deferred Pi-native eval redesign; and
- ADR-0067's model-agnostic behavior.

## Classified intervention proposals

### Mandatory pipeline interactions

These proposals directly add a question, pause, or educational condition to a
normal development phase. They must not enter the non-blocking learning
specifications in their audited form.

| Proposal | Normal-path effect | Current disposition |
| --- | --- | --- |
| Post-TDD comprehension gate | Requires the user to explain generated code before verification or the next plan task; adaptive frequency would also profile prior performance. | Defer the gate. Explicit `/teach explain <target>` and curriculum assessments may provide the educational value without changing TDD execution. |
| Pre-implementation Socratic gate | Requires one to three user answers before the Red phase begins. | Defer the gate. Use existing design grilling only when requirements need a human decision; use an explicitly invoked lesson for education. |
| Debug-understanding gate | Prevents the fix phase until the user states an acceptable hypothesis; the proposed opt-out is itself logged. | Defer the gate and skip logging. `/teach explain` or `/teach why` may explain the recorded debug evidence without changing the six-phase debug contract. |
| Review-engagement checkpoint | Requires recall of a review finding before commit or pipeline completion. | Defer the checkpoint. `/teach explain <review target>` may provide a separately invoked review lens without changing review verdicts or commit readiness. |
| Automatic verification explanations | Adds teaching prompts or narration to required verification activity. | Keep verification evidence-only. Explanations belong behind explicit `/teach` invocation. |
| Mandatory teaching-mode TDD narration | Adds educational narration or questions to each Red-Green-Refactor cycle. | Do not place it on the normal TDD path. The accepted roadmap keeps `/teach` as the sole standalone teaching surface. |

A future proposal may reuse the subject matter of these interventions only after
removing their mandatory pipeline placement.

### Automatic monitoring and interruption

These proposals inspect ordinary conversations or development behavior and
intervene without an explicit learning invocation.

| Proposal | Normal-path effect | Current disposition |
| --- | --- | --- |
| Prompt-flailing detector | Monitors repeated prompts, infers dissatisfaction or semantic similarity, and pauses work for a four-question reflection. | Automatic detection is deferred. User-selected prompt reflection is covered by `/teach reflect <target>`. |
| Delegation-awareness system | Tracks delegated work, infers what a user "should know," checks `/router` and TDD dispatches, and emits graduated nudges. | Out of scope for the current roadmap. Do not specify delegation surveillance, learned-helplessness scoring, or inferred capability profiles. |
| Automatic devil's-advocate intervention | Inserts an implementation challenge based on inferred confirmation bias. The audited agent topology is also obsolete. | Out of scope. Existing brainstorming and architecture review remain explicitly routed workflows. |
| Adaptive intervention frequency or depth | Changes future interruptions based on inferred competence, prior passes, failures, or opt-outs. | Do not infer a durable learner category from ordinary development. Explicit curriculum performance may adjust only the active learning interaction under the approved assessment contract. |

False-positive tuning does not make automatic monitoring non-blocking. The
trigger itself changes normal development and therefore requires a separate
architecture and privacy decision before specification.

### Automatic learning state and analytics

These proposals persist or derive educational judgments from normal development
rather than from an explicitly invoked curriculum assessment.

| Proposal | Normal-path effect | Current disposition |
| --- | --- | --- |
| Cross-workflow learning tracker | Writes comprehension, delegation, prompt, review, debug, and Socratic-event histories after ordinary workflow activity. | Out of scope. Normal Prism development must neither read nor update learning state. |
| Strengths, weaknesses, trends, streaks, or engagement scores | Profiles the user from ordinary interactions and stores derived judgments or gamified aggregates. | Out of scope. The approved dashboard derives only evidence-minimal curriculum status and excludes streaks, confidence scores, rankings, time metrics, and learner profiling. |
| Session analytics | Reads transcripts to detect retries, token waste, or stuck points and may persist excerpts or metrics. | Out of scope for this roadmap. Any reconsideration needs a separate privacy and redaction design and must remain explicitly invoked. |
| Logged educational opt-outs | Records that a user skipped a comprehension, debug, or other intervention. | Reject for normal workflows. An opt-out from an unrequested intervention is not learning evidence. |

The portable learning-state contract permits state mutation only inside an
explicit learning workflow. It stores privacy-minimal assessment evidence under
ignored `docs/learning/.local/`; it does not store raw answers, prompts,
transcripts, identities, paths, model data, or behavioral surveillance.

### Pipeline adaptation

The audits also suggest graduated exposure or intervention based on a user's
observed level. No learning specification may:

- skip, soften, reorder, or condition TDD, verification, `/check`, review,
  approval, or commit requirements on learner state;
- make the fast path available or unavailable based on assessed competence;
- block ordinary work until a curriculum topic is learned;
- automatically run `/prime`, a curriculum, a quiz, `/teach`, or reflection;
  or
- use learning data to route, halt, or alter an engineering workflow.

Learning prerequisites remain soft inside an explicitly invoked curriculum and
have no authority over development readiness.

## Proposals that do not require this deferral

The following audit ideas are non-blocking when kept explicitly invoked. Their
current roadmap decisions belong in the learning specifications rather than in
this intervention record:

- project curriculum generation and orientation, with preview-before-write and
  no automatic `/prime` mutation;
- `/teach explain`, `/teach why`, and `/teach reflect` against an explicit or
  recent target;
- curriculum lessons, knowledge checks, bounded remediation, and dashboards;
- the technical-only Prism contributor curriculum;
- skill-authoring education through contributor curriculum material; and
- native worktree guidance invoked separately from normal development.

Embedding any of these into the normal pipeline would move that variant back
into the deferred classifications above.

## Constraints before a deferred proposal can enter a specification

A separate review must establish all of the following:

1. **Explicit invocation:** the user starts the educational interaction by a
   named command or curriculum action; normal workflow events cannot trigger it.
2. **Normal-path parity:** when learning is not invoked, workflow questions,
   sequence, loaded resources, state, output, and halt conditions remain
   unchanged.
3. **No gate substitution:** educational checks neither replace required
   engineering evidence nor create a second readiness verdict.
4. **No surveillance:** no continuous transcript analysis, delegation scoring,
   inferred helplessness, hidden failure detection, or capability profiling.
5. **Minimal private state:** any persistence follows the portable state
   contract, is worktree-local and ignored, and is written only by explicit
   learning actions.
6. **Read-only teaching:** explanation or reflection does not retry prompts,
   resume implementation, apply fixes, rerun gates, or mutate development
   artifacts.
7. **Pi-native topology:** one agent, on-demand skills, explicit prompt
   templates, no orchestration extension, subagent, automatic model selection,
   or revival of the OpenCode eval system.
8. **Core/adapter ownership:** generic learning mechanics remain in core;
   stack-specific subject matter comes from an active adapter.
9. **Bounded token cost:** no always-loaded teaching prose or normal-workflow
   skill expansion solely for an uninvoked capability.
10. **Independent verification:** tests must demonstrate unchanged normal
    development, no unrequested state writes, explicit invocation, and clean
    cancellation or exit.
11. **Reversibility:** removal of the educational capability leaves no
    pipeline dependency, mandatory migration, or stranded readiness state.

## Required review questions

Before approving a specification, answer:

1. What exact user invocation starts and ends the interaction?
2. What educational outcome is not already served by `/teach` or the explicit
   curriculum workflow?
3. Can the feature be absent without changing any normal development transcript
   or verdict?
4. Does it read or infer anything from ordinary work that the user did not
   explicitly select for teaching?
5. What data is written, why is each field necessary, and how is it reset,
   exported, or purged?
6. Could a mistaken assessment delay work, pressure the user, weaken a gate, or
   create a misleading readiness signal?
7. Does the design introduce monitoring, an extension, orchestration, a model
   preference, or OpenCode-era machinery?
8. Which behavior-level Pi-native tests prove opt-in isolation and normal-path
   parity?
9. Is the proposal a standalone learning capability, or is it attempting to
   alter the engineering pipeline under an educational label?
10. What evidence would justify retaining the feature, and how can it be
    removed without affecting normal development?

Until these questions have approved answers, the proposals remain follow-up
material and must not be sliced into implementation tickets.
