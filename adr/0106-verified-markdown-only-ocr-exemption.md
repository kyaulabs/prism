# 0106. Verified Markdown-only OCR exemption

Date: 2026-09-05

## Status

Accepted

Selectively supersedes ADR-0080's unconditional external OCR requirement for
version-one review segments whose exact non-empty Git range is provably
Markdown-only. Retains complete local tooling/style inspection and the other
three axes. Depends on ADR-0063, ADR-0070, ADR-0074, ADR-0080, ADR-0081,
ADR-0090, ADR-0093, and ADR-0103.

## Context

OCR excludes Markdown from its selected review items. A Markdown-only branch
therefore returns a skipped external review even when local tooling/style
inspection and the other review axes complete. An empty selection proves no
external review occurred; it cannot establish that the supplied range had no
applicable input.

ADR-0080's active version-one chain does not distinguish that situation from
an incomplete tooling axis. Repeating the review spends another authorization
without supplying useful evidence. ADR-0093 consequently cannot complete
preparation-only `/pr` for a valid documentation-only change.

The user approved an exact-diff Markdown exemption, not a general exception for
skipped reviews. ADR-0103's separately released and installed authority cutover
must remain independent.

## Decision

Core permits the tooling-only version-one outcome `COMPLETE_NO_OCR` when local
tooling/style inspection is complete and Core proves that the segment's exact
non-empty immutable Git range affects only Markdown regular-file entries.
The outcome means OCR was not applicable. It never means an external review ran.

Recognized extensions are `.md` and `.markdown`, case-insensitively. Every
present old and new entry must qualify. Additions, modifications, deletions,
Markdown-to-Markdown renames, and mode changes between regular-file modes may
qualify. Non-Markdown paths, code-to-Markdown or Markdown-to-code renames,
symlinks, submodules, and unsupported kinds cannot qualify.

The classifier consumes bounded NUL-delimited Git metadata, never caller path
lists or OCR item counts. It disables external diff drivers and text conversion
and fails closed on empty ranges, missing objects, command failures, malformed
or truncated output, invalid encoding, and unsupported modes. Paths and Git
objects remain inert untrusted data; credential restrictions still apply.

Recording proves the exact range before publication. Authoritative verification
repeats the proof for every exempt segment. Structural parsing alone grants no
exemption. Initial and repair segments retain their own immutable ranges;
exempt repairs preserve prior findings and require ordinary closure evidence.

The closed record shape and schema version remain unchanged apart from the
bounded tooling outcome. Existing ordinary completion records remain valid.
Older tools reject an unknown outcome; no compatibility path rewrites it as
`COMPLETE`. Version-two evidence, profiles, byte exposure, and dispatch semantics
remain unchanged.

A local applicability probe supplies a workflow decision, not a review receipt.
For an eligible range, the workflow completes local tooling/style inspection,
structural review, requirement coverage, and configured static analysis without
an empty external OCR call. Mixed ranges keep the normal OCR requirement for
non-Markdown changes; no general zero-selection exemption exists.

Mandatory local readiness remains in force, including Semgrep
`>=1.173.0 <2.0.0` and OCR `>=1.9.1 <2.0.0`. Standing OCR consent remains the
sole authority for applicable OCR connectivity and code egress. The exemption
adds neither consent nor another review attempt. ADR-0081 and ADR-0093 retain
their authorization limits, exact finalization identities, absent-only recovery,
and preparation-only publication boundary.

PR verification discloses each exempt range as OCR not applicable, separately
from completed external reviews and the other axes. A skipped response remains
skipped even when subsequent Git proof establishes eligibility.

## Consequences

- Markdown-only changes can produce truthful, complete version-one finalization
  evidence without repeatedly invoking an external tool with no applicable input.
- Applicability becomes a shared deterministic boundary for recording,
  verification, and workflow selection. Git failures must never become exemptions.
- Persisted evidence gains one bounded outcome. Rollback to an older tool leaves
  those records unusable rather than weakening their interpretation.
- Review instructions and PR disclosures must change with the runtime; a prose
  waiver alone remains insufficient.
- This decision introduces no dependency, credential surface, installation,
  network operation, or publication authority.
- ADR-0103's later atomic cutover must retire this version-one-only behavior with
  the remaining OCR path; it must not transplant the exemption into version two.

## Alternatives Considered

### Treat any zero-item OCR result as success

Rejected. Tool selection failures or excluded non-Markdown files could bypass
required review. Git metadata, not an empty selection, must prove eligibility.

### Send Markdown through OCR

Rejected. The approved policy keeps Markdown excluded. Changing the external
tool's selection policy is unnecessary and outside this decision.

### Record ordinary completion with a prose waiver

Rejected. It hides the difference between external review and non-applicability
and gives authoritative verification nothing deterministic to check.

### Waive the whole tooling axis or all documentation review

Rejected. Markdown can change harness policy and workflow instructions. Local
tooling/style inspection and all other review gates remain required.

### Activate version-two authority early

Rejected. It would bypass ADR-0103's human publication and installation
checkpoint and change a separate trust boundary.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
