# Bounded Diff-Causal Code Review

## Status

Approved design.

## Problem

The current finalization workflow restarts a full branch review after every
repair commit. Because each fresh review may surface a different concern from
the entire branch, a branch can remain in an unbounded review-and-repair loop
even after the originally blocking finding is resolved.

Severity alone also overstates review impact. Tertiary, speculative,
pre-existing, unrelated, portability, maintainability, and test-hardening
observations can prevent pull-request preparation even when they do not make
the changed workflow incorrect.

## Goals

- Keep the first four-axis review complete and fail closed.
- Block pull-request preparation only for concrete bugs caused or materially
  worsened by the reviewed delta.
- Review repair commits incrementally instead of rescanning the entire branch.
- Preserve complete evidence from the initial review and every repair review.
- Allow advisory findings to remain visible without blocking `/pr`.
- Keep `/pr` preparation-only and preserve human ownership of GitHub mutation.

## Non-Goals

- A blanket `/pr --force` option.
- Automatic waivers or hidden suppression of findings.
- Allowing incomplete or failed review axes to pass.
- Automatically creating follow-up issues.
- Weakening static security scanning or repository quality gates.

## Review Lifecycle

1. Run the first four-axis review against the complete branch range from the
   attested target base SHA through the attested HEAD SHA.
2. Record the exact branch, target base, reviewed HEAD, axis completion, finding
   fingerprints, classifications, and dispositions in a local review chain.
3. Classify findings as Blocking or Advisory using the diff-causal policy.
4. When a Blocking finding is repaired, review only:
   - the delta from the previous reviewed HEAD to the new HEAD;
   - closure evidence for the original Blocking finding; and
   - tests directly affected by the repair.
5. Append the delta review to the existing chain. Do not restart the complete
   branch review unless the chain is invalidated.
6. Permit `/pr` when the chain ends at current HEAD, all required axes are
   complete across the chain, and no unresolved Blocking finding remains.
7. Include Advisory findings and recommended follow-up issues in the prepared
   pull-request body without creating issues or mutating GitHub.

## Diff-Causal Classification

A finding is Blocking only when all applicable conditions hold:

1. **Causal** — the reviewed delta introduced or materially worsened it.
2. **Relevant** — it affects behavior or verification evidence changed by that
   delta.
3. **Concrete** — it includes a deterministic reproduction, violated invariant,
   or direct security or data-loss path.
4. **Workflow-impacting** — it can make the changed runtime, build, setup,
   release, or verification flow incorrect.

A changed-test finding is Blocking only when it can falsely pass, falsely fail,
or omit evidence for a changed acceptance criterion.

The following are Advisory by default unless the reviewer proves every
Blocking condition:

- pre-existing or unrelated defects;
- maintainability and readability concerns;
- speculative races without a credible reachable path;
- portability outside declared platforms;
- broader hardening opportunities;
- test improvements unrelated to changed behavior; and
- alternative designs that do not demonstrate incorrect behavior.

Every Blocking finding must state causality, affected changed behavior, and
concrete failure evidence. A finding missing that evidence is Advisory.

## Components

### Code-review skill

The `code-review` skill owns initial full-range review, repair-delta review,
diff-causal classification, finding fingerprints, and review-chain updates.
It reports each axis separately and never modifies reviewed source files.

### Review-chain artifact

A local artifact under `.pi/` records:

- schema version;
- validated branch name;
- attested target base reference and SHA;
- initial reviewed range and OCR run identity;
- appended repair ranges;
- completion state for tooling, standards, specification coverage, and SAST;
- finding fingerprints and Blocking or Advisory classification;
- explicit dispositions and closure evidence; and
- final reviewed HEAD SHA.

The artifact is untracked, contains no credentials or raw OCR output, rejects
symlinks and malformed data, and is bound to one branch and target base.

### Finishing workflow

`finishing-a-development-branch` accepts a valid review chain instead of
requiring a complete branch rescan after every repair. A repair still requires
fresh verification and review of its delta, but earlier completed evidence
remains valid.

### Pull-request preparation

`/pr` preflight validates that the review chain belongs to the attested branch,
base, and HEAD; that every required axis is complete; and that no unresolved
Blocking finding remains. It renders Advisory findings in the pull-request
body and never pushes or mutates GitHub.

## Invalidation

The complete review chain is invalid when:

- the current branch differs from the recorded branch;
- the target base SHA moves;
- history is rewritten or a recorded reviewed commit is no longer an ancestor;
- current HEAD is not the chain's final reviewed HEAD;
- an unreviewed commit exists between recorded ranges;
- an axis is incomplete or failed;
- chain data is malformed, symlinked, or belongs to another repository state;
  or
- a Blocking finding lacks verified closure evidence.

Invalidation requires a new initial full-range review. An ordinary repair commit
that extends valid history requires only delta review.

## Error Handling

- Unknown or incomplete evidence fails closed with a stable diagnostic.
- Advisory findings never become silently accepted; they remain visible in the
  chain and prepared pull-request body.
- No finding is auto-waived.
- No issue is created automatically; recommendations are inert text.
- OCR or SAST failure leaves its axis incomplete and blocks `/pr`.

## Acceptance Criteria

1. The first review of a branch covers the complete attested branch range and
   records all four axes.
2. A demonstrable bug introduced by the branch is Blocking.
3. A tertiary, speculative, pre-existing, unrelated, or maintainability finding
   is Advisory unless concrete diff-causal workflow impact is proven.
4. A changed-test finding blocks only when it can invalidate evidence for a
   changed acceptance criterion.
5. Repairing a Blocking finding reviews only the repair delta, closure evidence,
   and directly affected tests.
6. A repair delta that introduces a new concrete bug is Blocking.
7. Earlier completed review evidence remains valid across an ordinary repair
   commit and is represented in the review chain.
8. Target-base movement, history rewriting, malformed chain data, or an
   unreviewed commit invalidates the chain.
9. `/pr` accepts a chain ending at current HEAD with complete axes and no open
   Blocking findings.
10. `/pr` includes Advisory findings and inert follow-up issue recommendations
    without mutating GitHub.
11. Failed or incomplete axes cannot be bypassed.
12. No blanket force flag or automatic waiver is introduced.

## Test Seams

- Unit-test review-chain schema parsing, identity binding, ancestry validation,
  range continuity, finding fingerprints, dispositions, and invalidation.
- Contract-test initial full review versus repair-delta review selection.
- Test Blocking classification with deterministic diff-caused behavior failure.
- Test Advisory classification for unrelated, speculative, portability, and
  maintainability findings.
- Test changed-test Blocking behavior with a false-pass acceptance-criterion
  fixture and a non-blocking unrelated hardening fixture.
- Test repair closure without a complete branch rescan.
- Test a new bug in the repair delta blocks.
- Test `/pr` preflight accepts a complete clean chain, rejects incomplete or
  stale chains, and renders Advisory disclosures without GitHub mutation.

## Architectural Note

The review chain changes cross-cutting finalization evidence and `/pr` preflight
semantics. Run the `architect` skill before implementation and record whether an
ADR is required.
