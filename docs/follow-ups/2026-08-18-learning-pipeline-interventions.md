# Deferred learning pipeline interventions

> **Current status:** ADR-0071 and Prism's explicit `/learn`, `learning`, and
> `/teach` surfaces own implemented learning behavior. The automatic and
> mandatory interventions classified here remain rejected or deferred evidence,
> not approved design or implementation work.

## Source and authority

This record classifies proposals from two untrusted, point-in-time audits:

- `audits/2026-08-18-develop-skill-capability-roadmap.md`;
- `audits/prism-learning-integration-report.md`.

The second audit describes retired OpenCode architecture and cites research that
was not supplied with the request. Its runtime details are not current Prism
evidence. `CONTEXT.md`, ADR-0071, later accepted ADRs, installed Pi
documentation, and resolved learning-roadmap decisions are authoritative.

## Governing boundary

Normal development does not gain educational questions, comprehension gates,
reflection pauses, adaptive interruption, learning-state writes, or readiness
conditions. Learning starts only through an explicit learning or teaching
action and cannot weaken TDD, verification, `/check`, review, safety, approval,
or commit requirements.

Learning state is private, worktree-local, privacy-minimal, and written only by
explicit learning actions. Normal workflows neither read nor update it.

## Mandatory pipeline proposals

These proposals alter required development phases and remain deferred in their
audited form.

| Proposal | Why it is not on the normal path | Current disposition |
| --- | --- | --- |
| Post-TDD comprehension gate | Blocks verification or the next plan task until the user explains generated code | Use explicit teaching or curriculum assessment without changing TDD |
| Pre-implementation Socratic gate | Adds educational answers before Red | Use design grilling only for real product decisions; teach separately |
| Debug-understanding gate | Blocks a fix until the user states an accepted hypothesis | Keep the six-phase debug contract; explain evidence only on request |
| Review-engagement checkpoint | Adds recall before commit or completion | Keep review verdicts independent; teach from a selected finding |
| Automatic verification explanation | Adds narration to required evidence collection | Keep verification evidence-focused |
| Teaching-mode TDD narration | Adds questions or lessons to every Red-Green-Refactor cycle | Keep teaching behind explicit invocation |

The subject matter may be reused only after removing mandatory pipeline
placement.

## Automatic monitoring proposals

These proposals infer educational needs from ordinary work and intervene
without an explicit request.

| Proposal | Risk | Current disposition |
| --- | --- | --- |
| Prompt-flailing detector | Monitors repeated prompts and interrupts work | Deferred; prompt reflection remains user-selected |
| Delegation-awareness system | Infers what a user should know from workflow activity | Rejected; no delegation surveillance or capability profile |
| Automatic devil's advocate | Inserts challenges based on inferred bias | Rejected; brainstorming and architecture review remain explicit workflows |
| Adaptive intervention frequency | Changes future interruptions from inferred competence or opt-outs | Rejected for normal work; explicit assessments may adapt only the active lesson |

False-positive tuning does not make monitoring non-blocking. The trigger itself
changes normal development and would require a new privacy and architecture
decision.

## Automatic state and analytics proposals

| Proposal | Risk | Current disposition |
| --- | --- | --- |
| Cross-workflow learning tracker | Writes educational judgments from ordinary development | Rejected; normal workflows do not touch learning state |
| Strengths, weaknesses, streaks, or engagement scores | Builds a durable learner profile or gamified ranking | Rejected; explicit learning stores only evidence-minimal topic status |
| Session analytics | Reads transcripts for retries, waste, or stuck points | Deferred pending a separate, explicitly invoked privacy design |
| Logged educational opt-outs | Treats refusal of an unrequested intervention as evidence | Rejected |

Learning state does not store raw answers, prompts, transcripts, identities,
paths, model data, or behavioral surveillance.

## Pipeline adaptation remains prohibited

No learning design may:

- skip, soften, reorder, or condition TDD, verification, `/check`, review,
  approval, or commit requirements on learning state;
- change fast-path eligibility from assessed competence;
- block development until a topic is learned;
- start `/prime`, `/learn`, `/teach`, a curriculum, a quiz, or reflection
  automatically;
- use learning data to route, halt, or otherwise alter engineering work.

Curriculum prerequisites guide only an explicitly invoked curriculum. They do
not determine development readiness.

## Explicit capabilities outside this deferral

The following are valid when the user invokes them directly and their current
contracts permit them:

- project curriculum generation and orientation;
- `/teach explain`, `/teach why`, and `/teach reflect` for a selected target;
- lessons, knowledge checks, bounded remediation, and progress views;
- the technical Prism contributor curriculum;
- skill-authoring education in contributor material;
- separately invoked worktree guidance.

Embedding one of these in normal development would return it to the deferred
classification.

## Entry conditions for reconsideration

A future proposal must establish:

1. **Explicit invocation:** a named user action starts and ends learning.
2. **Normal-path parity:** without that action, workflow questions, state,
   sequence, output, and verdicts are unchanged.
3. **No gate substitution:** educational checks neither replace engineering
   evidence nor create another readiness verdict.
4. **No surveillance:** ordinary work is not continuously analyzed or scored.
5. **Minimal private state:** persistence follows ADR-0071 and is written only
   by explicit learning actions.
6. **Read-only teaching:** explanation and reflection do not resume work, apply
   fixes, retry prompts, or mutate development artifacts.
7. **Pi-native ownership:** Core owns generic learning mechanics; an active
   adapter supplies stack-specific subject matter.
8. **Bounded cost:** no always-loaded teaching prose or unrequested workflow
   expansion.
9. **Independent verification:** tests prove explicit invocation, clean exit,
   no unrequested state writes, and normal-path parity.
10. **Reversibility:** removal leaves no pipeline dependency or stranded
    readiness state.

## Review questions

Before approving a related specification, answer:

1. What exact action starts and ends the interaction?
2. What outcome is not already served by current explicit learning surfaces?
3. Can the capability be absent without changing normal development?
4. What ordinary-work data, if any, does it read or infer?
5. What data is written, why is each field necessary, and how is it reset or
   removed?
6. Could a mistaken assessment delay work, weaken a gate, or misstate
   readiness?
7. Which tests prove opt-in isolation and normal-path parity?
8. What evidence would justify retention, and how can the feature be removed?

Until those questions have approved answers, these proposals remain retained
follow-up evidence and must not become implementation tickets.
