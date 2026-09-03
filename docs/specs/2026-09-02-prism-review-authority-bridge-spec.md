# Spec: Prism review authority compatibility bridge

**Date:** 2026-09-02
**Status:** Approved

## Problem statement

The trusted review runtime can produce bounded ad hoc reports, but finalization also needs immutable approved requirements, deterministic check evidence, replayable review receipts, repair-delta continuity, and pull-request preflight support. Building those features in the same branch that switches authority would force the new workflow to trust unreviewed local code.

Prism needs a second OCR-reviewed foundation release. It must complete the future authority path while preserving version-one OCR behavior as the active workflow. Once humans publish and install that release, the installed package can review the cutover branch as a pre-existing trust root.

## Solution

Add three stable evidence systems to the released review engine: approved criteria-source receipts, head-bound deterministic check receipts, and review-chain version-two receipts. ADR-0103 records this evidence authority and staged migration. Extend the active adapter boundary with a deterministic quality-provider operation rather than allowing skills or the model to assert test status.

Add authoritative finalization orchestration to `prism-review`, but permit it only when the executable and policy resolve from a stable Core package outside the reviewed repository. Add dual-read pull-request preflight so the existing OCR workflow continues to accept version-one evidence while a stable engine can produce and verify version-two evidence.

This stage does not switch any normal workflow to the new authority and does not remove OCR.

## User stories

1. As a Prism user, I want approved requirement sources captured before development changes and cleanup, so that requirement review uses the accepted scope.
2. As a Prism user, I want immutable source identities rather than extracted summaries to be authoritative, so that omitted criteria remain detectable.
3. As a Prism user, I want a deterministic `/check` receipt bound to one HEAD, so that a model cannot fabricate a passing gate.
4. As a Prism user, I want starting a new check to invalidate the prior active PASS immediately, so that interruption cannot leave stale evidence in force.
5. As an adapter author, I want stack tests, lint, coverage, and dependency evidence to remain adapter-owned, so that Core stays language-agnostic.
6. As a Prism user, I want Semgrep retained as deterministic Core evidence, so that static findings remain available to security review.
7. As a Prism user, I want review receipts to bind the exact snapshot, policy, criteria, checks, adapter, and model, so that drift invalidates reuse.
8. As a Prism user, I want a complete initial review followed by continuous repair deltas, so that unchanged branch content is not repeatedly sampled.
9. As a Prism user, I want every repair delta read on all four axes, so that a small fix cannot bypass an axis.
10. As a Prism user, I want confirmed Blocking findings kept open until supported closure evidence is reviewed, so that repair is auditable.
11. As a Prism user, I want exact same-HEAD review reuse, so that accidental repetition does not spend another model attempt.
12. As a Prism user, I want malformed, stale, legacy, or unsafe state classified explicitly, so that it is never treated as absent.
13. As a Prism user, I want `/pr` preflight to understand both chain versions during the bridge, so that either valid workflow remains coherent.
14. As a Prism user, I want standalone `/pr` recovery to remain narrow, so that it cannot choose requirements or authorize repair.
15. As a Prism maintainer, I want the public CLIs tested with fake sessions and fixture providers, so that authority mechanics have deterministic failure coverage.
16. As a Prism user, I want OCR to remain the normal authority through this release, so that the bridge cannot approve its own introduction.

## Implementation decisions

### Criteria evidence

A criteria record captures one or more exact committed source identities after plan/spec approval and before implementation changes. Each identity includes the commit, path, Git blob OID, byte digest, and source role. The record may include a bounded index of criterion summaries, but the requirement axis receives the immutable source blobs and treats them as authority.

A workflow with no declared requirements must create an explicit `NONE_DECLARED` record. Missing criteria state is not equivalent. The record uses Prism's managed-state protections: bounded UTF-8, no-follow open, inode checks, private engine-created directories, atomic publication, and directory synchronization. It does not claim protection from another hostile process running as the same user.

The initial cutover plan records its criteria through the installed bridge before implementation begins. Standalone `/pr` recovery cannot create or select criteria.

### Deterministic quality evidence

The active adapter contract gains one quality-provider operation. It reports closed gate IDs and lets the trusted launcher invoke stack tests, lint, coverage, build checks, and locked-dependency audit behavior owned by that adapter. Core continues to own language-agnostic checks and Semgrep. Review profiles do not contain commands.

A check run atomically publishes a RUNNING attempt before invoking any gate. That publication makes any prior active PASS unusable. Completion publishes PASS only when every required Core and adapter gate returns a valid result. Failure, interruption, timeout, malformed provider output, changed repository identity, or missing gate leaves no reusable PASS.

The receipt binds branch, base reference and SHA, HEAD, provider identity, gate IDs, normalized commands, tool versions, status, and bounded output/artifact digests. It does not retain unbounded logs. Adapter code and commands come from the trusted installed package or protected-base source selected by the trust-root rules.

### Review-chain version two

The engine, not a model-authored input file, writes version-two receipts after validating every session and verifier result. A receipt contains:

- branch, base reference, base SHA, reviewed range, and HEAD;
- snapshot, criteria, check, Core package, adapter package, profile, policy, and skill digests;
- provider, model, and reasoning metadata inherited from Pi;
- per-axis status and complete file/diff exposure matrix;
- triggered lens status and fixed exemption codes;
- validated findings, verifier decisions, closure evidence, and open Blocking fingerprints; and
- bounded failure or reuse metadata.

The first segment covers the attested base SHA through HEAD. A repair segment starts at the prior reviewed HEAD and ends at the new attested HEAD. It receives the same immutable criteria, a fresh exact-HEAD PASS check receipt, prior open Blocking findings, closure evidence, directly affected tests, and every repair-delta text blob on all four axes.

A valid exact same-HEAD receipt is returned without inference and does not consume another review authorization. Reuse requires exact receipt identities; changed base, HEAD, policy, profile, resources, adapter, criteria, checks, or trust root selects a new review or fails closed.

Inconclusive attempts write diagnostic attempt state but no valid chain segment. Complete reviews with open confirmed Blocking findings record the segment and block finalization. Advisory findings remain visible and non-blocking under ADR-0080.

Version-one and recognized obsolete state are reported as `LEGACY`, never `ABSENT`. An authorized complete `--new-initial` review may replace safe legacy state only after the new receipt succeeds. Unsafe state is never overwritten or removed automatically.

### Authority and authorization

Authoritative commands canonicalize the selected Core source and reviewed repository. They fail when Core is inside the repository. Core policy and executable bytes come from the stable installed package. If an active adapter resolves inside the worktree, its declarative profile and skill bytes come from the protected base commit. The engine never executes adapter code from a raw Git blob. Quality-provider execution requires a separately installed stable adapter package outside the reviewed worktree whose identity and version match protected-base declarations. Missing or mismatched trusted adapter quality behavior is Inconclusive.

Plan approval authorizes one bounded initial review attempt after the exact check receipt exists. Each later attempt requires fresh explicit approval. One attempt comprises the four axis sessions and bounded verifier work. There is no separate standing review-egress consent because the command uses the active Pi provider selected for the current session. The workflow discloses that effect before approval. Prism adds no provider, model, credential, or authentication configuration.

### Pull-request compatibility

Mechanical preflight accepts either a valid version-one chain or a valid version-two chain during this bridge release. It reports the version and never merges evidence across them. Strict preflight verifies identity, continuity, complete axes, check and criteria evidence where required by the version, and no open Blocking finding.

Standalone `/pr` recovery keeps ADR-0093's limits. A version-two `ABSENT` state may use the invocation's one initial authorization only when exact attestation, approved criteria, and current PASS check receipts already exist. `LEGACY`, invalid, stale, dirty, missing-criteria, missing-check, or unsafe state stops. `/pr` does not authorize repair or a second attempt.

The existing OCR finalization continues to write and consume version-one state in this stage. New bridge features are dormant unless called deliberately from a stable external installation.

## Testing decisions

The primary seam is the spawned public `prism-review` CLI with fixture repositories, deterministic quality providers, and fake Pi sessions. Tests assert managed-state modes, no-follow behavior, interrupted attempt semantics, exact identity binding, chain replay, finding fingerprints, closure rules, same-HEAD reuse, and absence of raw source or transcripts.

Spawned `prism-tool` tests cover the adapter quality protocol and dual-read preflight. The PHP/web adapter suite proves that its existing quality commands and minimum coverage policy are reported through the shared operation without moving stack details into Core.

Fault tests cover missing criteria, explicit no-criteria state, modified criteria, stale checks, failed Semgrep, failed dependency audit, partial gate output, provider timeout, malformed model results, missing exposure, changed HEAD or base, changed policy, local-source authority rejection, safe legacy replacement, unsafe state preservation, and absent-chain `/pr` recovery.

Package tests install the bridge release outside a fixture repository and prove that it can review a separate checkout while refusing self-authority. A final compatibility test proves that normal finalization still uses OCR and version-one state before cutover.

## Out of scope

- Switching `/check`, `code-review`, finalization, `/pr`, setup, doctor, release, or global instructions to version-two authority.
- Removing OCR, OCR consent, or OCR-derived `Tested-by` attribution.
- Installing or publishing a package automatically.
- Changing the four-axis coverage decision.
- Multiple active adapters or executable profile content.
- Push, pull-request creation, merge, or hosted review service behavior.

## Further notes

After this branch and the runtime foundation merge, humans publish and install the resulting Core and adapter releases. Cutover starts only when doctor evidence proves that `prism-review` and the adapter quality provider resolve outside the checkout and that the compatible protected-base adapter profile is available.
