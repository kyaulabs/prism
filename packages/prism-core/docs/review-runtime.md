# Review runtime and authority compatibility bridge

`prism-review` is Prism Core's bounded, skill-first review runtime. This release
provides two surfaces:

- ad hoc staged, commit, branch, and path reports remain non-authoritative and
  write no receipt or finalization state; and
- a dormant authority compatibility bridge can create immutable criteria,
  deterministic check, and schema-version-two review receipts when called
  deliberately from eligible installed packages.

Normal `/check`, `code-review`, finalization, consent, attribution, and release
workflows do not invoke the bridge. OCR and schema version one remain the normal
authority for this release.

## Commands and exits

Run the executable from the repository being reviewed:

```text
prism-review doctor --json
prism-review review staged --json
prism-review review commit --commit SHA --json
prism-review review branch --base SHA --head SHA --json
prism-review review path --path RELATIVE_TRACKED_PATH --json
```

The dormant bridge has this closed grammar:

```text
prism-review criteria record --source ROLE:COMMIT:PATH [--source ROLE:COMMIT:PATH ...] --json
prism-review criteria none --json
prism-review criteria inspect --json
prism-review check --base-ref origin/develop|origin/main --json
prism-review chain inspect --json
prism-review chain verify --base-ref origin/develop|origin/main --json
prism-review review authoritative --base-ref origin/develop|origin/main --json
prism-review review authoritative --base-ref origin/develop|origin/main --new-initial --json
prism-review review repair --base-ref origin/develop|origin/main --closures RELATIVE_PATH --json
```

`ROLE` is `SPEC`, `PLAN`, `ISSUE`, or `CONTEXT`. Criteria `COMMIT` is a full
lowercase Git object ID and must name an immutable ancestor of the reviewed
branch. `SHA` for ad hoc review must be a full 40- or 64-character lowercase
object ID. Path review reads tracked objects from `HEAD`; it rejects absolute
paths, traversal, Git metadata, symlink traversal, ignored files, and untracked
files.

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
`REVIEWED_WORKTREE`: it may run ad hoc review but cannot author authoritative
evidence.

When the target has an active adapter, its declarative review identity comes
from the protected base. Executable quality behavior must come from a matching
external adapter package outside the target repository. The package name,
version, provider protocol, declared gate IDs, profile, policy, skill bytes,
and executable bytes must match protected authority. Adapter code never
replaces Core axes, controls, or exemptions.

Bridge use requires a release, publication, and installation checkpoint:

1. release matching Core and adapter packages;
2. publish the reviewed package archives through the human-owned release path;
3. install those exact packages outside the target repository; and
4. call the bridge explicitly from that external installation.

This makes the bridge available for deliberate compatibility work; it does not
perform the separate cutover. OCR, the version-one review chain, standing OCR
consent, and existing finalization and attribution rules remain current.

Humans publish and install packages, push branches, create pull requests, and
merge. Prism does not perform those operations.

## Bridge evidence and state

Capture criteria after approval and before implementation or finalization
cleanup. `criteria record` stores exact committed source identities rather than
summaries. A workflow with no approved requirement source must use
`criteria none`, which records `NONE_DECLARED`; a missing receipt does not mean
that no criteria exist. Only the requirement-coverage axis can read criteria,
and successful authority requires complete byte exposure.

A deterministic check first publishes `RUNNING`, which immediately invalidates
the previous reusable `PASS`. Core owns language-independent gates, including
Semgrep. An active adapter owns its declared stack gates. A final `PASS` binds
the branch, base and HEAD, normalized commands, tools, provider, gates, and
bounded output or artifact digests. Failure, interruption, malformed output, or
snapshot drift leaves no reusable pass.

The first version-two segment is a complete four-axis initial review from the
attested base through the exact checked HEAD. Each continuous repair starts at
the prior reviewed HEAD, uses a fresh exact-HEAD check, receives the unchanged
criteria and prior open Blocking findings, and exposes the whole delta on all
four axes. Only independently verified `CONFIRMED` closure evidence can close a
Blocking finding. Advisory findings remain recorded and do not block.

Exact same-HEAD reuse returns the valid receipt without another model session.
It requires every bound Core, adapter, profile, policy, skill, model, snapshot,
criteria, and check identity to match. Inconclusive attempts publish only a
bounded diagnostic and do not advance the chain. Safe schema-one state is
`LEGACY` and can be replaced only by an explicitly authorized `--new-initial`
review that succeeds. Malformed, symlinked, or otherwise untrusted state is
`UNSAFE` and is never overwritten automatically.

The dual-read preflight selects one coherent chain: valid schema version one or
valid schema version two. It reports the selected version and never combines
evidence between versions. Version-two recovery from `ABSENT` is available only
when exact approved criteria and current PASS check receipts already exist;
legacy, partial, stale, dirty, Blocking, or unsafe state fails closed. `/pr`
never chooses criteria and never authorizes repair.

The bridge records private state under
`.pi/prism-tool/code-review/`: `criteria.json`, `check.json`,
`review-chain.json`, and bounded `review-attempt.json`. Criteria and check
inspection reports `ABSENT`, `VALID`, or `UNSAFE`; chain inspection also uses
`LEGACY` for safe schema-one evidence. A state that is malformed or cannot be
classified safely is never treated as absent. Directories use mode `0700`;
records use `0600`, bounded no-follow reads, and atomic publication. Receipts
retain identities, digests, outcomes, exposure, findings, and bounded
diagnostics—not source blobs, transcripts, or command logs.

One approved attempt includes all four axes and bounded verifier work. Exact
same-HEAD reuse is not another attempt. Every additional attempt requires fresh
explicit approval. A review can invoke the active Pi provider and may incur
provider cost.

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

## Ad hoc report data

A completed ad hoc report contains:

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

The bridge design and the future authority cutover are specified separately in
`docs/specs/2026-09-02-prism-review-authority-bridge-spec.md` and
`docs/specs/2026-09-02-prism-review-authority-cutover-spec.md` in the Prism
repository.
