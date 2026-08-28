# Spec: Recover a missing review chain during PR preparation

**Date:** 2026-08-27
**Status:** Approved

## Problem statement

The preparation-only `/pr` workflow requires a valid review chain ending at
its exact attested HEAD. Its current mechanical preflight treats every missing
or unusable chain as the same fatal error. A work branch that has completed its
other finalization gates can therefore stop at `/pr` only because no initial
review chain was recorded, even though the existing `code-review` workflow can
create that evidence.

The recovery must not weaken review-chain validation. Missing evidence is
recoverable; malformed, unsafe, stale, discontinuous, wrong-base, incomplete,
or Blocking evidence is not. `/pr` must remain preparation-only, and external
review must continue to require standing OCR consent.

## Solution

Split PR preflight into a pre-review probe and the existing strict final gate.
The probe will validate the deterministic repository prerequisites and report
whether the review chain is `VALID` or `ABSENT`. It will fail closed for every
other unusable chain state.

When the probe reports `ABSENT`, invoking `/pr` authorizes one complete initial
four-axis review. `/pr` will run the existing `code-review` skill against the
attested target-base-to-HEAD range, require it to record a complete chain, and
then rerun strict PR preflight. PR artifact generation continues only when the
strict preflight validates the new chain against the unchanged branch, base,
and HEAD.

A valid existing chain follows the current path without another review. A
failed or incomplete review, an unresolved Blocking finding, or repository
identity drift stops preparation. `/pr` does not repair findings or run a
second review automatically.

## User stories

1. As a maintainer, I want `/pr` to create missing initial review evidence so
   that PR preparation does not stop at a recoverable state.
2. As a reviewer, I want invalid review evidence to remain fail-closed so that
   automatic recovery cannot replace or conceal stale or unsafe state.
3. As an operator, I want one `/pr` invocation to authorize at most one missing-
   chain review so that repeated heuristic review still requires a fresh
   decision.
4. As a repository owner, I want `/pr` to remain preparation-only so that the
   recovery never pushes or mutates GitHub.

## Design decisions

### Split preflight interface

Add a deterministic command:

```bash
prism-tool pr review-preflight
```

It shares the existing PR preflight checks for:

- local toolchain readiness;
- a valid work branch;
- a clean working tree;
- the synchronized target remote-tracking reference;
- exact branch, base, HEAD, and merge-base identities;
- a non-empty branch commit range with at least one non-merge commit; and
- a non-empty net diff.

The command reports the existing attestation fields and one review-chain state:

```text
REVIEW_CHAIN=VALID
```

or:

```text
REVIEW_CHAIN=ABSENT
```

For a valid chain it also reports the Advisory count. An absent chain is a
successful probe result, not a valid finalization result.

The existing command remains strict:

```bash
prism-tool pr preflight
```

It continues to require a complete valid chain at the exact current identity
with no unresolved Blocking finding.

### Review-chain classification

The probe uses the existing bounded review-chain interface to distinguish
absence from unsafe state:

- `ABSENT` permits one initial review;
- `VALID` must still pass exact identity, continuity, axis-completion, and
  Blocking-finding verification;
- `UNSAFE`, malformed, stale, discontinuous, wrong-base, incomplete, and open-
  Blocking states stop preparation.

The launcher performs classification and repository validation only. It does
not orchestrate or interpret the four review axes.

### `/pr` orchestration

The prompt runs `review-preflight` before collecting PR artifacts.

When `REVIEW_CHAIN=VALID`, it proceeds through the existing authorization and
final-gate checks.

When `REVIEW_CHAIN=ABSENT`, it must:

1. require the other applicable finalization evidence, including a successful
   `/check` and exact attestation;
2. treat this `/pr` invocation as authorization for one complete initial
   four-axis review;
3. load and run the `code-review` skill over the attested base-to-HEAD range;
4. require all four axes to complete and the initial chain segment to be
   recorded;
5. stop on a failed or incomplete axis or an unresolved Blocking finding;
6. re-read the clean-tree, branch, base, and HEAD identities; and
7. run strict `prism-tool pr preflight` before generating artifacts.

Standing OCR consent remains the sole authority for OCR connectivity and
reviewed-code egress. `/pr` invocation does not authorize a second review,
repairs, pushing, pull-request creation, merging, issue creation, or any other
GitHub mutation.

### Drift and retry behavior

Any dirty-tree change, commit, checkout, base movement, or identity mismatch
during review prevents continuation. The resulting strict-preflight failure is
not converted into another automatic review.

If the initial review is incomplete or reports a Blocking finding, `/pr`
returns the review report and stops. Existing finalization policy governs
repairs, `/check` reruns, and approval for a later chain-selected review.

Advisory findings remain non-blocking and are disclosed in the prepared PR
body.

### Architecture record

Standalone `/pr` currently consumes existing authorized-finalization evidence.
Allowing its invocation to authorize one initial review changes the review-
authorization boundary recorded by ADR-0081. Before implementation planning,
the `architect` workflow must decide whether a new ADR should selectively
supersede that clause. Accepted ADR bodies will not be rewritten.

## Acceptance criteria

1. `/pr` continues directly when a valid chain ends at the exact current HEAD.
2. `/pr` automatically runs one complete initial review when and only when the
   chain state is `ABSENT`.
3. A successful automatic review is followed by strict PR preflight before any
   artifact is generated.
4. Unsafe, malformed, stale, discontinuous, wrong-base, incomplete, and open-
   Blocking chain states remain fatal.
5. Review failure, incomplete axes, or a Blocking finding stops without an
   automatic retry.
6. Branch, base, HEAD, or working-tree drift during review stops preparation.
7. Advisory findings do not block preparation and remain available for PR-body
   disclosure.
8. Existing successful `/check`, synchronization, attestation, and clean-tree
   requirements remain in force.
9. `/pr` never pushes, creates a pull request, merges, opens a browser, or
   mutates GitHub.
10. Standing OCR consent remains required before reviewed code leaves the
    repository boundary.

## Testing decisions

Implementation follows Red-Green-Refactor.

Node tests for the PR launcher must cover:

- `review-preflight` returning `ABSENT` with exact attestation fields;
- strict `preflight` continuing to reject an absent chain;
- both modes accepting a valid exact chain;
- SHA-1 and SHA-256 repository identities;
- unsafe, malformed, stale, wrong-base, incomplete, and open-Blocking chain
  failures;
- unchanged diagnostics for unrelated branch, tree, base, range, and diff
  failures; and
- command usage rejecting unsupported arguments.

Shell contract tests for `/pr` must cover:

- the pre-review probe running before strict preflight;
- automatic `code-review` invocation only for `ABSENT`;
- one-review authorization and standing-consent language;
- strict preflight rerunning after the review;
- no automatic retry after failed or Blocking review evidence;
- Advisory disclosure; and
- preservation of the preparation-only boundary.

Final verification must run the focused Node and shell suites, the full
repository test surface required by the active Core toolchain, and `/check`.

## Dependencies

No new dependency is required.

## Out of scope

- Automatically repairing review findings.
- Automatically running a second initial or repair-delta review.
- Recovering malformed, unsafe, stale, discontinuous, or wrong-base chains.
- Relaxing `/check`, synchronization, attestation, clean-tree, or review-axis
  requirements.
- Moving four-axis review judgment into `prism-tool`.
- Changing review-chain storage schema or finding classification.
- Pushing branches or mutating GitHub.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
