# Spec: Markdown-only OCR exemption

**Date:** 2026-09-05
**Status:** Draft — design confirmed; specification awaiting review

## Problem Statement

OCR excludes Markdown from its selected review items. A non-empty branch that
changes only Markdown therefore produces a skipped OCR report with no selected
items, even when local checks and the other review axes are complete. Prism
currently treats that result as an incomplete tooling axis and blocks review
chain completion and preparation-only `/pr`.

For the task-owned temporary-artifact policy change, the observed OCR report
identified the exact expected base and HEAD but returned `status: skipped`,
`terminal_state: skipped`, and empty selected/completed item lists. No external
review occurred. Repeated approval cannot change that selection or make the
report evidence of a completed OCR review.

Markdown should remain excluded from OCR. The missing behavior is an explicit,
verified not-applicable outcome, not Markdown-inclusive external review.

## Solution

Allow a non-empty, Markdown-only Git range to satisfy the OCR requirement as
**not applicable**. Preserve the distinction between an OCR review that ran and
an exemption established from immutable Git evidence.

Markdown remains excluded from required OCR work in mixed ranges. Non-Markdown
changes continue through the existing OCR review policy. An empty selection is
not sufficient evidence for an exemption when any non-Markdown change exists.

All other review axes, local quality gates, exact-identity checks, consent
boundaries, review-attempt approvals, and human-only publication rules remain
unchanged.

## User Stories

1. As a contributor changing only Markdown, I want review-chain completion to
   recognize that OCR has no applicable input, so documentation PR preparation
   does not require a meaningless retry.
2. As a contributor changing Markdown alongside code, I want the code to retain
   its existing OCR requirements without sending Markdown for review merely to
   make the item count nonzero.
3. As a reviewer, I want the recorded outcome and PR verification section to
   distinguish not-applicable OCR from an external review that actually ran.
4. As a maintainer, I want exemption claims checked against the exact Git range,
   so a renamed source file, stale record, or malformed command result cannot
   bypass required review.

## Implementation Decisions

### Applicability is determined locally

Core determines OCR applicability from the exact immutable `from` and `to`
commit IDs selected by the review workflow. Caller-provided path lists, branch
names, commit subjects, arbitrary exception strings, and OCR's selected-item
count are not applicability authority.

The recognized Markdown filename extensions are `.md` and `.markdown`, matched
case-insensitively. Names without one of these extensions are not automatically
classified by their contents. Additional extensions require a later explicit
policy change.

A range is eligible only when its net diff is non-empty and every affected old
and new file entry is a regular Git blob with a recognized Markdown extension.
Additions, modifications, deletions, and Markdown-to-Markdown renames can
qualify. Mode-only changes between regular-file modes can qualify. Any affected
symlink, submodule, unsupported file kind, or non-Markdown path prevents the
exemption. Renaming code to Markdown or Markdown to code must not qualify.

Classification uses bounded, NUL-delimited Git output without shell evaluation,
external diff drivers, or text conversion. It handles filenames containing
spaces without splitting them. Truncated output, invalid encoding, malformed
records, missing objects, command failure, and unsupported modes fail closed.
Git blobs and paths remain inert data; credential restrictions still apply.

### Evidence distinguishes completion from non-applicability

The version-one review chain gains a tooling-only completion outcome named
`COMPLETE_NO_OCR`. It means that local tooling/style review is complete and the
segment's non-empty Git range has no applicable OCR input. It does not mean OCR
ran, and it cannot stand in for another review axis.

The recorder proves Markdown-only applicability before accepting this outcome.
Authoritative chain verification repeats the proof for every segment carrying
it. Structural deserialization alone never grants the exemption. Generic
`SKIPPED`, `FAILED`, arbitrary not-applicable reasons, and an OCR report with no
selected items remain insufficient.

The existing closed record shape and schema version remain unchanged apart
from this bounded enum extension. Existing ordinary completion records remain
valid. Older installations that do not recognize the new outcome fail closed;
no record is silently downgraded to `COMPLETE` for compatibility.

Initial and continuous repair segments use their own exact ranges. A
Markdown-only repair can carry the exemption after an earlier code review, but
cannot erase or waive unresolved findings from that earlier segment. Existing
continuity, branch/base/HEAD binding, and closure checks remain authoritative.

### Review workflow and reporting

For a proven Markdown-only range, the workflow does not need to invoke OCR or
request another review attempt just to receive an empty selection. It still
runs the local readiness gate and completes tooling/style inspection, structural
review, requirement coverage, and configured static analysis under their
existing policies.

A previously observed skipped OCR response can be explained as expected for a
Markdown-only range, but the Git proof—not the response's absence of items—is
what authorizes the not-applicable outcome. The workflow must not falsify the
original OCR response or call a skipped external review complete.

For mixed or entirely non-Markdown ranges, retain normal OCR review behavior,
standing-consent enforcement, and failure handling. This change adds no general
zero-selection exemption and does not alter OCR selection policy for tests,
assets, or other non-Markdown files.

PR preflight accepts a complete, otherwise valid version-one chain containing
verified `COMPLETE_NO_OCR` tooling segments. PR artifacts disclose the
Markdown-only exemption explicitly, separately from the other completed axes.
A valid exemption does not trigger another OCR call.

### Authority and compatibility boundaries

This change applies to the active OCR/version-one finalization path. It does
not switch authority to the version-two reviewer, alter version-two review
profiles or byte-exposure requirements, or mix evidence versions.

The exception needs architectural evaluation against ADR-0080's complete-axis
contract and ADR-0093's missing-chain recovery contract before implementation.
ADR-0103's staged authority cutover remains unchanged. Mandatory local tool
readiness, standing OCR consent for applicable external operations, and fresh
approval for additional review attempts are not relaxed.

## Acceptance Criteria

1. A non-empty range affecting only qualifying Markdown entries is classified
   as OCR not applicable without an external review call.
2. Markdown additions, modifications, deletions, case-insensitive extensions,
   and Markdown-to-Markdown renames are supported through real Git fixtures.
3. Any non-Markdown entry in a mixed range prevents the Markdown-only exemption
   and retains normal OCR requirements.
4. Code-to-Markdown and Markdown-to-code renames cannot evade OCR applicability.
5. Symlinks, submodules, unsupported file modes, empty diffs, malformed or
   oversized output, command errors, and missing Git objects cannot establish
   the exemption.
6. The recorder accepts `COMPLETE_NO_OCR` only for tooling and only after proving
   the exact segment range eligible. Other axes cannot use that outcome.
7. Chain verification rechecks applicability for stored initial and repair
   segments; forged, stale, discontinuous, or wrong-identity evidence fails.
8. An exempt repair leaves prior Blocking findings and closure requirements
   unchanged.
9. PR preflight accepts verified exempt segments and rejects non-Markdown
   exemption claims without granting another review or publication authority.
10. Workflow instructions and generated PR disclosures say OCR was not
    applicable, rather than claiming an external review completed.
11. Ordinary complete version-one records remain compatible; version-two
    authority and evidence semantics do not change.
12. No generic skipped-result bypass, dependency, credential surface, or
    additional network operation is introduced.

## Testing Decisions

Use existing public Core seams for OCR applicability, review-chain recording
and verification, and PR preflight. Exercise real temporary Git repositories
with immutable base/HEAD commits; mock only external-process failure boundaries
and the OCR invocation itself.

The first regression is a non-empty Markdown-only range that currently cannot
record an explicit tooling not-applicable outcome. Add negative cases for mixed
ranges, rename direction, file kinds, malformed bounded output, stale identity,
and wrong-axis use before implementing each behavior.

Round-trip tests must prove that an exempt initial segment and an exempt repair
segment can be recorded and authoritatively verified. Tampering with a stored
outcome or pointing it at a non-Markdown range must be rejected even if the
record remains structurally valid. A prior open Blocking finding must continue
to block PR preflight after a Markdown-only repair unless properly closed.

Instruction contract tests verify the exception's narrow wording, continued
four-axis requirements, no false OCR-completion claim, and preparation-only PR
boundary. Existing normal-review and version-two dispatch tests remain green.

## Out of Scope

- Sending Markdown through OCR or installing/configuring another reviewer.
- Waiving all reviews or local checks for documentation changes.
- Treating every zero-item OCR selection as success.
- Changing which non-Markdown files OCR selects.
- Removing mandatory external-tool readiness checks.
- Changing the authority cutover, version-two profiles, or evidence dispatch.
- Altering the already committed temporary-artifact policy wording.
- Automatically publishing packages, updating installed global files, pushing,
  creating a PR, or mutating GitHub.

## Further Notes

The user confirmed the policy: a Markdown-only OCR exemption verified from the
exact Git diff, with other review gates unchanged. This specification records
that design; it does not authorize implementation before plan approval and
does not retroactively complete the current branch's absent review chain.
