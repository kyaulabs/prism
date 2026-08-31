# 0093. PR Invocation Recovers a Missing Review Chain

Date: 2026-08-27

## Status

Accepted

Extends ADR-0081's review-authorization sources for standalone `/pr`
invocations. Retains its plan-approved automatic finalization, one-review
limit, standing OCR consent boundary, fresh approval for additional reviews,
and preparation-only publication boundary. Depends on ADR-0055, ADR-0070,
ADR-0073, ADR-0080, and ADR-0081.

## Context

ADR-0080 requires a complete review chain ending at the exact attested HEAD
before `/pr` can prepare pull-request artifacts. ADR-0081 authorizes the first
four-axis review through implementation-plan approval and invokes `/pr` only
after that review succeeds.

A standalone `/pr` invocation can reach the same final gate without a recorded
chain. Its current preflight combines an absent chain with malformed, stale,
discontinuous, wrong-base, incomplete, and unresolved-Blocking evidence under
one fatal diagnostic. Absence is different: the existing `code-review`
workflow can create the required initial evidence without discarding or
replacing any prior review state.

Automatically treating every unusable chain as recoverable would weaken
ADR-0080. Automatically running review inside `prism-tool` would also move
agent-owned judgment into deterministic launcher code, contrary to ADR-0055
and ADR-0070. The workflow needs a narrow distinction between no evidence and
invalid evidence while preserving exact attestation, consent, and review-retry
boundaries.

## Decision

We allow one standalone `/pr` invocation to authorize one complete initial
four-axis review when, and only when, deterministic preflight classifies the
review chain as `ABSENT`.

Prism Core exposes a pre-review PR probe through its existing launcher. The
probe applies the same readiness, branch, clean-tree, target-base, identity,
commit-range, and net-diff checks as strict PR preflight. It reports a valid
chain or an absent chain. Unsafe, malformed, stale, discontinuous, wrong-base,
incomplete, and unresolved-Blocking states remain fatal.

The `/pr` prompt owns the single-agent orchestration. For an absent chain it
requires the other applicable finalization evidence, runs the existing
`code-review` skill over the exact attested target-base-to-HEAD range, and
requires a complete recorded initial segment. It then reruns strict PR
preflight before generating any artifact. A valid existing chain skips this
review.

The `/pr` invocation authorizes no repair and no second review. A failed or
incomplete axis, an unresolved Blocking finding, or repository identity drift
stops preparation. Existing finalization policy governs repairs, local
`/check` reruns, and fresh approval for any later chain-selected review.

Standing OCR consent remains the sole authority for OCR connectivity and
reviewed-code egress. `/pr` remains preparation-only and never pushes, creates
or merges a pull request, creates an issue, opens a browser, or mutates GitHub.
The launcher classifies state and validates repository mechanics; it does not
perform or interpret the four review axes.

## Consequences

**Positive:**

- A missing initial chain becomes recoverable within the `/pr` workflow.
- Invalid review evidence remains distinct from absence and continues to fail
  closed.
- Strict post-review preflight binds generated artifacts to the exact reviewed
  branch, base, and HEAD.
- The existing prompt-versus-launcher boundary remains intact: deterministic
  mechanics stay in `prism-tool`, while review judgment stays with the agent.

**Negative:**

- PR preparation gains a second preflight mode whose shared repository checks
  must not drift from strict preflight.
- A standalone `/pr` invocation may perform one externally backed review when
  standing OCR consent is active.
- Prompt, launcher, policy documentation, and contract tests must evolve
  together.

**Neutral:**

- Plan approval still authorizes the ordinary finalization path and its first
  review under ADR-0081.
- Additional review attempts still require fresh explicit approval.
- Advisory findings remain visible and non-blocking under ADR-0080.
- No review-chain schema, dependency, Pi extension, credential surface, or
  GitHub mutation capability is added.

## Alternatives Considered

### Inspect the chain only in prompt prose

Rejected. The prompt would need to duplicate branch, base, clean-tree,
identity, and state-validation mechanics already owned by PR preflight. That
would create two drift-prone policy implementations.

### Recover every unusable chain

Rejected. Replacing stale, malformed, discontinuous, or wrong-base evidence
would conceal an integrity failure and weaken ADR-0080's fail-closed boundary.

### Run review from the launcher

Rejected. The four-axis review includes agent judgment and skill coordination.
Putting it in `prism-tool` would cross ADR-0055's single-agent prompt boundary
and turn deterministic launcher mechanics into an orchestration layer.

### Keep absence fatal

Rejected. It forces the operator to leave `/pr` and manually invoke the exact
initial review that `/pr` already knows is missing, without protecting a new
boundary.

### Ask before the absent-chain review

Rejected. Invoking `/pr` is an explicit request to complete preparation, and
this ADR bounds that request to one initial review. Standing OCR consent still
controls reviewed-code egress, while any later review requires fresh approval.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
