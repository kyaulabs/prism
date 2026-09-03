# Review runtime foundation

`prism-review` is Prism Core's bounded, skill-first review runtime. This release
provides ad hoc reports only. Every report is non-authoritative: it writes no
review-chain segment, receipt, consent record, or finalization state, and it
does not replace the current `code-review` workflow.

## Commands and exits

Run the executable from the repository being reviewed:

```text
prism-review doctor --json
prism-review review staged --json
prism-review review commit --commit SHA --json
prism-review review branch --base SHA --head SHA --json
prism-review review path --path RELATIVE_TRACKED_PATH --json
```

`SHA` must be a full 40- or 64-character lowercase object ID. Path review uses
tracked objects from `HEAD`; it rejects absolute paths, traversal, Git metadata,
symlink traversal, ignored files, and untracked files.

| Exit | Meaning |
| --- | --- |
| `0` | Readiness passed, or review completed without a confirmed Blocking finding |
| `2` | The command did not match the closed grammar |
| `3` | Runtime preparation or readiness failed before an attempt |
| `4` | The result is Blocking or Inconclusive |

A report can contain confirmed Advisory or Suggested findings with exit `0`.
Read the `outcome` and `findings` fields rather than treating the exit alone as
a clean-code claim.

## Trust and authority

The authority-eligible trust root is an installed `@kyaulabs/prism-core`
package outside the repository under review. Its source class is
`INSTALLED_EXTERNAL`. Core loaded from the reviewed checkout is
`REVIEWED_WORKTREE` and is refused as an authority source.

That distinction does not make this foundation authoritative. Both source
classes always produce `authoritative: false`. A protected-base adapter profile
may add inert policy and skill bytes, but an adapter cannot replace Core axes,
controls, or exemptions.

Authoritative use requires a release, publication, and installation checkpoint:

1. release matching Core and adapter packages;
2. publish the reviewed package archives through the human-owned release path;
3. install those exact packages outside the target repository; and
4. complete the separately specified authority bridge and cutover.

Until those stages land together, OpenCodeReview (`ocr`), the version-one
review chain, standing OCR consent, and existing finalization and attribution
rules remain current.

## Scope freezing

The runtime freezes review input through Git objects rather than later
worktree reads:

- staged review compares `HEAD` with one stable index identity;
- commit review compares one non-merge commit with its parent, or the empty tree
  for a root commit;
- branch review compares the two supplied commit objects; and
- path review inventories exact tracked `HEAD` objects.

Every entry records canonical old and new paths, modes, full object IDs, line
counts, byte counts, zero-context hunk ranges, and SHA-256 entry and diff
digests. Worktree edits cannot change frozen commit, branch, or path bytes. An
index change makes a staged snapshot stale.

Sensitive paths use the same deny-floor classifier as Core's safety extension.
Invalid UTF-8, malformed Git output, inconsistent raw and numstat records,
timeouts, output overflow, more than 512 changed paths, a file over 256 KiB, or
aggregate input over 1 MiB makes the attempt Inconclusive or prevents it from
starting.

## Axes, lenses, and exposure

Each complete attempt runs fresh sessions in this order:

1. tooling and style;
2. structural smells;
3. requirement coverage; and
4. static security.

Every eligible text entry and its full required diff reaches all four axes.
Path triggers add focused adapter lenses; they never narrow Core coverage.
Binary files, symbolic links, Gitlinks, and unsupported modes are metadata-only
and use fixed Core exemption IDs. Adapters cannot add exemptions.

The launcher records byte intervals returned by `read_file` and `read_diff`.
An axis cannot submit successfully until every required interval is delivered.
This is delivery evidence, not proof that a model understood the bytes.

Proposed findings must identify immutable source by path, side, line, and a
matching bounded snippet. Blocking findings also require causal, relevance, and
workflow-impact statements tied to the reviewed change. A Blocking anchor
outside a changed hunk must bind one changed source line to that exact target
line and side. Rename, copy, and mode metadata do not make every source line
changed. Fresh verifier
sessions try to disprove normalized findings in chunks of at most sixteen.
Uncertain Blocking findings, incomplete verification, stale input, or any
incomplete axis makes the final result Inconclusive.

## Pi session boundary

The runtime inherits the exact `PI_PROVIDER`, `PI_MODEL`, and
`PI_REASONING_LEVEL` selected by pi. It does not select a fallback. Each axis
and verifier uses an in-memory session with compaction and retries disabled,
private empty directories, no inherited skills, prompts, themes, extensions,
AGENTS files, or appended system text, and no built-in tools.

Only immutable `read_file`, immutable `read_diff`, and one terminating
submission tool are registered. Policy, evidence, source, diff, finding, and
tool-result bytes are labelled as hostile data. The runtime rejects premature,
missing, duplicate, malformed, and post-termination submissions. Context
budgeting conservatively reserves one token for every UTF-8 input byte, then
reserves the fixed output allowance and a twenty-percent safety margin.

A review invokes the selected provider and may incur possible provider cost.
`doctor --json` resolves model metadata and validates isolation without running
inference. It reports authentication as unknown; the runtime learns about an
authentication failure only from an actual bounded review call. Prism code does
not inspect an authentication store.

## Report data

A completed report contains:

```text
schemaVersion, command, authoritative, sourceClass, outcome, scope,
model, policyDigest, planDigest, manifestDigest, axes, byteExposure,
lenses, exemptions, findings, verifier, limits
```

`byteExposure` records object and diff digests plus per-axis delivery or
exemption status. Reports omit full source blobs, full diffs, prompts, model
transcripts, package paths, temporary paths, credentials, and private session
state. Finding evidence remains a bounded source snippet required to validate
its anchor.

## Automated test seam

Automated inference tests use a test-owned CommonJS preload through
`NODE_OPTIONS=--require=...`. The preload intercepts the packaged
`session-runner.js` import and supplies scripted sessions. Production exposes no
fake-runner command flag, preload path, or environment-based module override.
The tests construct no live `ModelRuntime`, make no provider request, and read
no credential file.

The bridge and authority cutover are specified separately in
`docs/specs/2026-09-02-prism-review-authority-bridge-spec.md` and
`docs/specs/2026-09-02-prism-review-authority-cutover-spec.md` in the Prism
repository.
