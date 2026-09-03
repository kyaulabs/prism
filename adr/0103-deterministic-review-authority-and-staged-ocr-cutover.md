# 0103. Deterministic review authority and staged OCR cutover

Date: 2026-09-02

## Status

Accepted

Depends on ADR-0063, ADR-0064, ADR-0067, ADR-0074, ADR-0075, ADR-0080,
ADR-0081, ADR-0091, ADR-0093, ADR-0100, and ADR-0102.

When the authority-cutover stage lands, this record partially supersedes:

- ADR-0063's mandatory OCR prerequisite, connectivity cadence, and OCR tool
  contract while retaining mandatory bounded Semgrep;
- ADR-0064's OCR source for `Tested-by` while retaining the three-trailer shape;
- ADR-0074's standing OCR consent while retaining approval-free atomic commits,
  plan-approved first finalization review, and fresh approval for each later
  review attempt;
- ADR-0080's version-one axis and segment schema while retaining complete
  initial review, continuous repair deltas, diff-causal Blocking, and visible
  Advisory findings;
- ADR-0081's inline four-axis implementation while retaining finalization order,
  unlimited local check/repair loops, one initial review authorization,
  revalidation, and preparation-only `/pr`;
- ADR-0091's shared consent-record references to OCR while retaining separately
  revocable bounded web-access consent; and
- ADR-0093's version-one review preflight while retaining absent-chain-only
  standalone recovery and one-attempt limits.

Until cutover lands, those OCR and version-one clauses remain operational.
This record extends ADR-0100 with a deterministic adapter quality-provider
operation and does not change repository-automation ownership.

## Context

ADR-0102 creates a review runtime that can inspect a separate repository from a
stable installed Core package. A trustworthy finalization decision needs more
than model output. It needs the exact approved requirements before development
artifacts are removed, actual test and analysis results bound to reviewed HEAD,
and a replayable chain that distinguishes an initial branch review from later
repair deltas.

The current workflow deletes completed plans and specifications before review,
then lets an agent reconstruct requirement coverage. `/check` reports results
in the interactive session but publishes no exact-HEAD deterministic receipt.
The version-one chain accepts a model-authored segment file with four completion
values and finding summaries. It cannot bind immutable requirement sources,
check artifacts, policy digests, per-axis byte exposure, adapter lenses, active
model provenance, or verifier decisions.

Replacing those mechanics and OCR in one branch would still be self-approval.
The code that validates version-two evidence and pull-request preflight must be
released before it judges the cutover. The migration also affects a mandatory
external prerequisite, global consent, commit attribution, setup, doctor,
release, finalization, and the active adapter contract. Each intermediate
release must remain coherent.

## Decision

We adopt deterministic criteria and check receipts, review-chain version two,
and a three-stage OCR authority migration.

### Immutable criteria receipts

After the human approves a specification and plan, and before implementation
changes or ADR-0027 cleanup, the stable review executable records the exact
committed requirement sources. Each source identity contains its commit, path,
Git blob OID, byte digest, and role. A bounded criterion index may help reports,
but it is not authoritative. The requirement axis receives the immutable
source blobs and can detect omitted statements.

A branch with no declared criteria records an explicit `NONE_DECLARED`
disposition. Missing state is not equivalent. Standalone `/pr` cannot choose or
create requirement authority.

Criteria records use the existing managed-record discipline: contained private
directories created as mode 0700, regular mode-0600 files, no-follow and inode
checks, strict bounded UTF-8 schemas, atomic replacement, file and directory
synchronization, and fail-closed unsafe state. Ordinary project ancestors are
not required to be private.

### Deterministic check receipts

Core extends the active-adapter protocol with a closed quality-provider
operation. Core owns generic gates and Semgrep. The adapter owns its stack
tests, lint, coverage, build checks, browser checks where applicable, and
locked-dependency audit. Review profiles contain no commands, and skills or
models cannot assert PASS.

An authoritative check run atomically publishes RUNNING before it invokes any
gate, immediately making an older active PASS unusable. It publishes PASS only
when every required Core and adapter gate completes successfully against the
same branch, base reference, base SHA, and HEAD. Failure, interruption,
timeout, malformed provider output, identity drift, or a missing gate leaves no
reusable PASS.

The receipt stores gate and provider identities, normalized commands, tool
versions, status, and bounded output or artifact digests. It does not retain
unbounded logs. When the active adapter is developed inside the reviewed
repository, its quality provider must come from a separately installed stable
adapter package outside the worktree and must match the protected-base adapter
identity and version. The engine never executes adapter code extracted from a
Git blob.

`/check` becomes the human-readable coordinator over this operation at
cutover. Plan approval continues to authorize unlimited local check runs and
plan-scoped repairs without another question.

### Review-chain version two

The stable engine writes a version-two segment directly after validating all
axis and verifier results. It does not accept a model-authored authoritative
segment input. A receipt binds:

- branch, base reference, base SHA, reviewed range, and HEAD;
- snapshot, criteria, check, Core, adapter, profile, policy, and skill digests;
- inherited Pi provider, model, and reasoning level;
- complete per-axis byte-exposure and lens ledgers;
- fixed metadata-only exemptions;
- validated findings, verifier decisions, closure evidence, and open Blocking
  fingerprints; and
- bounded diagnostic or exact-reuse metadata.

The initial segment covers the attested target base through HEAD. A repair
segment begins at the previous reviewed HEAD and ends at the new attested HEAD.
It requires the same immutable criteria authority, a fresh exact-HEAD PASS
check receipt, prior open Blocking findings, closure evidence, directly
affected tests, and complete four-axis exposure of the repair delta.

An exact same-HEAD invocation returns a valid matching receipt without another
model call or review authorization. Reuse requires matching base, HEAD, trust
root, policy, profile, resource, adapter, criteria, check, and snapshot
identities.

Incomplete axes, incomplete byte exposure, malformed model output, provider
failure, verifier failure, stale state, or an unresolved possible Blocking
issue are Inconclusive and create no valid chain segment. A complete review
with a confirmed open Blocking finding records the segment and blocks
finalization. Advisory findings remain visible and do not require waivers.

Version-one and recognized obsolete records are `LEGACY`, never `ABSENT`. One
authorized complete `--new-initial` review may replace safe legacy state only
after the new segment succeeds. Unsafe state is never overwritten, removed, or
silently downgraded.

### Authorization and provider boundary

Plan approval discloses and authorizes one bounded review attempt using the
provider, model, and reasoning level already active in Pi. One attempt includes
four isolated axis sessions and bounded adversarial verifier work. A failed,
Inconclusive, or Blocking attempt consumes the authorization. Every later
attempt requires fresh explicit approval. A deliberate ad hoc invocation
authorizes only its non-authoritative attempt.

Prism creates no standing review-egress grant. The review uses the same Pi
provider selected for the active session and introduces no provider setting,
model flag, fallback, credential read, or authentication probe. `/doctor`
checks SDK, metadata, package, profile, adapter, and trust-root readiness
without inference. Live authentication failure surfaces only during an
authorized review attempt.

### Finalization and pull-request preparation

After cutover, finalization keeps this order:

1. retain the approved criteria receipt;
2. complete implementation and task verification;
3. remove matching completed development artifacts;
4. require a clean tree;
5. synchronize the target and record exact attestation;
6. run deterministic `/check` until an exact-HEAD PASS exists;
7. consume one authorization for the chain-selected review;
8. require a complete version-two chain with no open Blocking finding;
9. revalidate the clean tree and attested identities; and
10. invoke preparation-only `/pr`.

A changed HEAD requires a new check. A repair after review requires a new check
and fresh review authorization. Pushes, pull-request creation, merges, package
publication, and package installation remain human-owned.

Standalone `/pr` preserves ADR-0093's narrow recovery. It may authorize one
complete initial review only when preflight reports exactly `ABSENT` and exact
attestation, approved criteria, and current PASS check evidence already exist.
Valid evidence is reused. `LEGACY`, invalid, stale, dirty, missing-criteria,
missing-check, or unsafe state stops. `/pr` does not select requirements,
repair findings, run checks, migrate state, or authorize a second attempt.

### Three-stage migration

Stage one ships ADR-0102's non-authoritative runtime, closed profiles, skills,
immutable snapshots, isolated sessions, complete byte exposure, verifier, and
ad hoc review modes. OCR and version one remain authoritative.

Stage two ships criteria and check receipts, the adapter quality provider,
version-two chain mechanics, guarded finalization review, and dual-read
pull-request preflight. The normal workflow still uses OCR and version one.
Both foundation branches are reviewed under OCR. Humans then merge, release,
publish, and install the new Core and adapter packages. Cutover cannot begin
until doctor evidence proves that both authoritative executable packages are
outside the checkout and match protected-base identities.

Stage three uses that installed foundation to review one authority-cutover
branch. The branch switches `/check`, code review, finalization, `/pr`, doctor,
setup, release, commit attribution, and global instructions to version two. It
then removes OCR's package/toolchain declaration, wrapper, version and
connectivity checks, model resolver, review dispatch, consent commands,
documentation, tests, and lockfile entries in the same release. Semgrep remains
mandatory.

### Attribution and consent after cutover

Ordinary commits keep `Implemented-by`, `Tested-by`, and `Signed-off-by` in the
established order. Both model trailers derive from the launcher's validated
active `PI_MODEL` identifier. Review receipts store the full provider, model,
and reasoning provenance. The cutover branch itself may contain old
OCR-derived trailers because the prior stable launcher creates those commits.

Consent schema version three contains only `webAccess`. Its parser accepts
schema-one and schema-two records as read-only legacy state and preserves the
web choice. OCR fields no longer authorize any operation. `/setup` alone may
migrate legacy state after displaying the preserved value and receiving
explicit approval. It writes schema three when web access is enabled or removes
an all-false record through the managed-record boundary. Decline preserves
readable legacy state. Unsafe state is never overwritten or removed.

Legacy or unsafe consent no longer blocks review or mandatory doctor because
neither depends on it. Unsafe consent disables optional web access and reports
human remediation. Installation never creates, grants, revokes, migrates, or
removes consent.

## Consequences

- Finalization authority binds qualitative review to deterministic immutable
  requirements, actual checks, exact policy, and exact reviewed Git objects.
- Starting a check is fail-safe: interruption cannot leave an older PASS active.
- Stack quality remains adapter-owned, but adapter development needs a stable
  installed prior release for authoritative execution.
- Review consumes the active Pi provider and can incur five or more bounded
  inference operations inside one authorized attempt. No separate standing
  consent hides that cost or egress.
- Version-two state is richer and more expensive to validate. It can explain
  reuse and invalidation without retaining source or provider transcripts.
- The bridge temporarily supports two chain versions, but only OCR/version one
  drives normal workflow until human publication and installation establish the
  new trust root.
- OCR removal reduces external tooling, authentication, consent, and model
  configuration. It requires coordinated changes across Core, adapter,
  lockfiles, prompts, skills, hooks, docs, tests, and accepted decision
  references.
- `Tested-by` no longer identifies a distinct external reviewer. Final review
  provenance moves to the review receipt, while commit trailers continue to
  record the active Pi model passively.
- Historical ADRs and changelog entries continue to mention OCR. Current
  shipped contracts do not.

## Alternatives considered

### Switch authority in the runtime foundation branch

Rejected. Checkout code would approve its own first authoritative release.

### Keep OCR as a permanent fallback

Rejected. Two authorities would retain duplicate readiness, consent, provider,
attribution, and chain semantics and make failures ambiguous.

### Let a skill produce check JSON

Rejected. Qualitative instructions cannot prove process exit status or exact
artifact identity. The trusted launcher and adapter provider own this evidence.

### Extract criterion summaries as the sole authority

Rejected. Structural validation cannot prove that an extractor omitted no
accepted requirement. Immutable source blobs remain authoritative.

### Auto-migrate version-one chains or consent during installation

Rejected. Installation must not rewrite project review authority or global
consent. Safe legacy state remains readable until an explicitly authorized
workflow replaces it.

### Require standing review consent

Rejected. The bounded plan or ad hoc invocation already identifies the model
attempt and uses the active Pi provider. A second persistent grant would obscure
rather than clarify per-attempt cost and egress.

### Retry failed model sessions automatically

Rejected. Retry would spend provider cost and repeat source egress after the
one authorized attempt's failure semantics become ambiguous.

### Run adapter quality code from protected-base Git blobs

Rejected. Inert profile and Markdown policy can come from protected base, but
executable adapter code and dependency resolution require a separately
installed stable package outside the reviewed repository.
