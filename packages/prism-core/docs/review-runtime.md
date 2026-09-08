# Review runtime and authority

The installed `prism-review` engine is Prism's only finalization authority.
It owns immutable criteria, deterministic check receipts, and version-two
four-axis review receipts. Ad hoc reports remain non-authoritative.
The reviewed checkout cannot define its own authority. Legacy state never
passes PR preflight. The active task includes two automatic review attempts with provider cost and
code egress; the third and every later attempt need fresh explicit approval.
See [Review attempt policy](review-attempt-policy.md) for counting, continuation,
and the unchanged mandatory review gate.
Standing web consent never authorizes review.

## Isolated Semgrep scans

`prism-tool run semgrep -- scan` and Core's deterministic Semgrep gate share one
isolation boundary. They export committed eligible input into a private temporary
Git repository outside the consumer. Baseline identities, required ancestry,
and the effective merge base are retained; no-baseline scans still report
existing findings. Gitlinks stay opaque and unpopulated. Sensitive paths,
private state, and dependency trees are excluded before blob export.

For example, replace `BASE_SHA` with the validated baseline commit:

```text
prism-tool run semgrep -- scan --config .semgrep/kyaulabs.yml --baseline-commit BASE_SHA --metrics off --disable-version-check --json
```

The closed grammar accepts tracked local configuration files or the fixed
presets `p/php`, `p/secrets`, and `p/javascript`; optional relative tracked
files/directories select targets. Preset retrieval remains subject to the active
workflow's network authorization. Local configurations are passed as explicit
`./` paths. Supported controls are `--json`, `--error`, `--metrics off`,
`--disable-version-check`, `--x-ignore-semgrepignore-files`, and one
`--baseline-commit` selector. `SEMGREP_BASELINE_COMMIT` may supply a baseline;
if both forms are present they must resolve to the same commit. Exact
`scan --help` uses an empty private workspace without consuming stdin or a
baseline. Stdin selectors, arbitrary URLs, `auto` configuration, output-file,
authentication, mutation, and unsupported controls are rejected.

Scans require a clean supported independent Git checkout and locally available
historical objects. Dirty input, unsafe paths or encodings, redirected roots,
unsupported administration, and missing objects fail without stash, reset,
fetch, repair, or consumer-scan fallback. Source Git configuration is revalidated
around each Git read. An inactive `config.worktree` left by checkout tooling is
not read or modified. Git parses the held main-config snapshot with includes
disabled to determine whether worktree configuration is enabled; an enabled
secondary configuration remains unsupported. Scanner execution has a private
home/cache and sanitized environment without inherited credentials,
authentication state, or Git commands.

The total launcher budget is ten minutes, including preparation and cleanup;
callers may impose a shorter deadline. Git calls have a thirty-second ceiling.
Limits are 100,000 paths, 4,096 bytes per path, 64 MiB aggregate metadata,
32 MiB per blob, 256 MiB aggregate blob bytes, and 1 MiB per output stream.
Preparation supports cancellation and reserves time for preservation and cleanup.
Interruptions, timeout, output overflow, and scanner failure terminate owned
process groups and attempt cleanup once.

Consumer file identities and Git administration are checked independently of
scanner success. Preservation or cleanup failure blocks the result even after
scanner exit zero; Prism does not repair consumer drift. Managed health then
checks runtime permissions and composition after review and before either PR
route succeeds. Its diagnostics do not discard completed review evidence or
authorize another review. See [Project manifest](project-manifest.md#read-only-health).

## SDK prerequisite check

`prism-review sdk --json` checks package-relative SDK import, version, and
required public APIs without Git, model selection, credentials, or inference.
It returns exit 0 with `GO`, or exit 3 with `NO-GO`, a stable `reason`, and static
`remediation`. This does not establish review authority or authentication.

Core supplies the SDK as a runtime dependency. Its SDK and host-peer metadata
use `>=0.84.1 <=5.0.0`, including 5.0.0. An in-range version must also satisfy
required runtime APIs; version acceptance alone never establishes compatibility.

Doctor additionally checks external provenance, the selected model, isolated
resources, profiles, adapter providers, and receipt state. Authentication stays
`UNKNOWN`; doctor does not read credential files or probe a provider.

| Reason | Meaning |
| --- | --- |
| `SDK_MISSING` | Core cannot resolve its declared SDK |
| `SDK_METADATA_INVALID` | SDK package/version evidence is unsafe or malformed |
| `SDK_PROVENANCE_INVALID` | SDK code resolves inside the reviewed repository |
| `SDK_VERSION_UNSUPPORTED` | Version is outside the supported stable interval |
| `SDK_API_UNSUPPORTED` | A required public or returned-object API is missing |
| `SDK_LOAD_FAILED` | The resolved SDK or a transitive dependency cannot load |
| `MODEL_CONTROLS_INVALID` | Active Pi controls are absent or malformed |
| `MODEL_UNAVAILABLE` | The selected model is not in the local catalogue |
| `MODEL_REASONING_UNSUPPORTED` | The selected reasoning level is unsupported |
| `MODEL_RUNTIME_FAILED` | Local model runtime initialization failed |
| `RESOURCE_ISOLATION_FAILED` | Isolated session resources failed validation |
| `PROFILE_INVALID` | Expected package-owned review policy is invalid |
| `ADAPTER_PROVIDER_INVALID` | Matching external provider evidence is unavailable |
| `AUTHORITY_INELIGIBLE` | Core is not outside the reviewed repository |
| `RECEIPT_STATE_UNSAFE` | Existing authority state cannot safely be reused |
| `CLEANUP_FAILED` | Temporary runtime cleanup failed |
| `RUNTIME_READINESS_FAILED` | An unclassified prerequisite failed closed |

Restore a verified Core dependency graph or install a Core release tested with
the SDK when API compatibility fails. Do not point the reviewer at checkout
code or repair resolution with `NODE_PATH`. No readiness result bypasses human package installation or grants review authority.

## Package compatibility verification

Root `npm ci` verifies the committed development dependency graph. Separate
installed-package CI lanes pack Core and the adapter, install Core into an
independent consumer with peer installation and lifecycle scripts disabled,
and replay the generated consumer lock with offline `npm ci`.

The fixed lanes use SDK 0.84.1 and 0.85.1 on Linux and macOS with Node 24.
A separate lane selects the latest stable SDK within `>=0.84.1 <=5.0.0` and
records its exact version. It may equal a fixed baseline; it does not claim a
newer release was tested when none exists. Missing versions and failed API or
isolation checks fail the lane rather than silently skipping it.

Each smoke run exercises real SDK import and isolated doctor initialization
without inference. A test-only guard detects credential-file access, including
attempts caught by the SDK. Installed-copy negative cases must report
`SDK_MISSING`, `SDK_API_UNSUPPORTED`, and `SDK_VERSION_UNSUPPORTED`.

CI retains only the consumer manifest, generated lock, Core archive, and exact
version report for replay. These tests do not replace fixed-baseline release
evidence. Only the human's post-release, externally
installed consumer doctor result satisfies released-consumer acceptance.

## Commands and exits

Run the executable from the repository being reviewed:

```text
prism-review doctor --json
prism-review review staged --json
prism-review review commit --commit SHA --json
prism-review review branch --base SHA --head SHA --json
prism-review review path --path RELATIVE_TRACKED_PATH --json
```

The authority launcher has this closed grammar:

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

Normal finalization uses this installed authority. Both ordinary commit model
trailers derive from validated active `PI_MODEL`; exact review provenance is
retained in the receipt. Consent schema three contains only `webAccess`.

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
`LEGACY` and can be replaced only by a `--new-initial`
review within the shared attempt budget that succeeds. Malformed, symlinked, or otherwise untrusted state is
`UNSAFE` and is never overwritten automatically.

Preflight accepts only valid schema version two and never combines evidence
between versions. Version-two recovery from `ABSENT` is available only
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

One attempt includes all four axes and bounded verifier work. Exact
same-HEAD reuse is not another attempt. Two attempts run automatically per active
task; the third and every later attempt require fresh explicit approval. Failed
or interrupted attempts count; changing commands, HEAD, or sessions does not
reset the budget. A review can invoke the active Pi provider and may incur
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

ADR-0102 and ADR-0103 define the runtime trust root and authority cutover.
