# 0080. Bounded Diff-Causal Review Chains

Date: 2026-08-23

## Status

Accepted

Selectively supersedes ADR-0074's branch-finalization review restart,
finding-blocking, and repair-evidence clauses. Retains ADR-0074's standing OCR
consent, one-attempt acceptance, complete four-axis review, fail-closed
incomplete-axis behavior, exact attestation, preparation-only `/pr`, and
human-owned publication boundaries. Depends on ADR-0055, ADR-0056, ADR-0063,
ADR-0070, and ADR-0074.

## Context

ADR-0074 requires one accepted finalization attempt to run the complete
four-axis review and stop for every Blocking or unresolved Suggested finding.
Any repair invalidates the attempt and requires another complete accepted
attempt. The implementation interpreted that requirement as a fresh review of
the entire branch after each repair.

That restart model does not converge reliably. External review is heuristic:
a second full-branch pass may surface a different tertiary, speculative,
pre-existing, unrelated, portability, maintainability, or test-hardening
observation even when the original defect is fixed. Each repair changes HEAD,
which restarts review and exposes the unchanged branch to another independent
sampling pass. Pull-request preparation can therefore remain blocked without a
stable relationship between the latest finding and the repair delta.

Severity labels alone are not sufficient finalization policy. A high-severity
word assigned to an unrelated or speculative observation should not carry the
same effect as a deterministic bug introduced by the branch. Conversely, a
changed test that can falsely pass a branch acceptance criterion is directly
relevant and must block even though it is test-only.

Prism still needs a complete first review, complete axes, fail-closed evidence,
and concrete defect closure. A blanket force flag, automatic waiver, or
arbitrary retry limit would trade the loop for hidden risk. The review process
instead needs bounded evidence continuity and a causal relationship to the
delta under review.

## Decision

We adopt **bounded diff-causal review chains** for branch finalization.

### 1. One complete initial review

The first accepted finalization review covers the complete attested branch
range from the validated target base SHA through the attested HEAD SHA. It runs
all four review axes: tooling/OCR, structural standards, requirement coverage,
and static security analysis.

The review records a local, schema-versioned **review chain** bound to the
repository, validated work branch, target base reference and SHA, reviewed HEAD,
axis completion, finding fingerprints, classifications, and dispositions. The
record contains no credentials or raw OCR output and is never committed.

### 2. Diff-causal blocking policy

A finding blocks finalization only when all applicable conditions hold:

1. **Causal** — the reviewed delta introduced or materially worsened it.
2. **Relevant** — it affects behavior or verification evidence changed by that
   delta.
3. **Concrete** — it provides a deterministic reproduction, violated invariant,
   or direct security or data-loss path.
4. **Workflow-impacting** — it can make the changed runtime, build, setup,
   release, or verification flow incorrect.

A changed-test finding blocks only when it can falsely pass, falsely fail, or
omit evidence for a changed acceptance criterion.

Findings are Advisory by default when they are pre-existing, unrelated,
tertiary, maintainability-only, speculative without a credible reachable path,
outside declared platform support, broader hardening, test improvement
unrelated to changed behavior, or an alternative design without demonstrated
incorrectness. Every Blocking finding must state causality, affected changed
behavior, and concrete failure evidence; otherwise it is Advisory.

Advisory findings remain visible and may be rendered as inert follow-up issue
recommendations. They require no waiver and do not block `/pr`.

### 3. Incremental repair review

Repairing a Blocking finding does not restart full-branch review. The next
accepted attempt retains the completed initial evidence and reviews only:

- the commit delta from the prior reviewed HEAD to the new attested HEAD;
- closure evidence for the original Blocking finding; and
- tests directly affected by the repair.

The delta review runs every axis applicable to the repair range and appends its
evidence to the chain. A concrete bug introduced by the repair delta blocks in
the same way as any other diff-caused defect. Unchanged branch content is not
rescanned merely because HEAD advanced.

### 4. Invalidation and fail-closed behavior

The chain is invalid when the branch or repository identity differs, the target
base SHA moves, history is rewritten, a recorded commit is no longer an
ancestor, reviewed ranges are discontinuous, current HEAD is not the final
reviewed HEAD, an axis is failed or incomplete, or chain data is malformed,
symlinked, unsupported, or ownership-ambiguous.

Invalidation requires a new complete initial review. An ordinary repair commit
that continuously extends the reviewed history requires only incremental
review.

### 5. Finalization and `/pr`

`finishing-a-development-branch` accepts a complete valid review chain ending
at the exact attested HEAD with no unresolved Blocking finding. It no longer
requires every Suggested or Advisory observation to be fixed or waived.

`/pr` validates the branch, base, HEAD, chain continuity, complete axes, and
Blocking-finding closure. It includes Advisory summaries and inert follow-up
recommendations in the prepared pull-request body. It remains preparation-only
and never pushes, creates issues, creates a pull request, or mutates GitHub.

Standing OCR consent continues to authorize OCR connectivity and reviewed-code
egress. Finalization acceptance continues to authorize only one bounded
synchronization, checking, review, attestation, and preparation attempt.

## Consequences

**Positive:**

- Review repairs converge because unchanged branch content is not repeatedly
  resampled after every fix.
- Finalization blocks on demonstrated branch-caused defects rather than broad
  severity labels or unrelated quality opportunities.
- Complete initial review evidence remains preserved across ordinary repair
  commits.
- Test findings retain blocking force when they invalidate acceptance evidence.
- Advisory findings stay visible in pull-request preparation without requiring
  fabricated waivers.

**Negative:**

- Review evidence becomes a schema-versioned local state machine with ancestry,
  continuity, identity, and finding-fingerprint validation.
- Classifying causality and concreteness requires disciplined reviewer output
  and deterministic tests for boundary cases.
- A moved target base or rewritten history intentionally discards the chain and
  incurs another complete review.

**Neutral:**

- All four axes remain mandatory for the initial review.
- OCR and Semgrep remain mandatory external prerequisites.
- `/check`, protected-branch policy, commit signing, standing consent, and
  human-only GitHub publication remain unchanged.
- No new dependency, Pi extension, background worker, blanket bypass, or
  automatic waiver is introduced.

## Alternatives Considered

### Add `/pr --force`

Rejected. A blanket bypass cannot distinguish a complete review with accepted
advisories from missing axes or an unresolved concrete defect.

### Stop after a fixed number of review cycles

Rejected. An arbitrary retry count makes elapsed attempts, rather than defect
evidence, decide whether a branch is ready.

### Run one complete review and never review repairs

Rejected. A repair can fail to close the original defect or introduce a new
bug. The repair delta and closure evidence must still be reviewed.

### Continue full-branch review after every repair

Rejected. Repeated heuristic resampling of unchanged content is the source of
the unbounded loop and does not improve causal confidence in the repair.

### Automatically waive non-security findings

Rejected. Automatic waivers hide evidence and preserve severity-only policy.
Advisory classification is explicit, causal, visible, and requires no waiver.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
