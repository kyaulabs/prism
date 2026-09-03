# 0102. Trusted skill-first review runtime

Date: 2026-09-02

## Status

Accepted

Depends on ADR-0047, ADR-0048, ADR-0055, ADR-0058, ADR-0060, ADR-0067,
ADR-0070, ADR-0073, ADR-0075, ADR-0080, ADR-0081, and ADR-0091.
Partially supersedes ADR-0055 only where that record rules out bounded child
sessions for review. The single interactive agent, no general-purpose
subagents, no background workers, and human-controlled model selection remain
in force.

## Context

Prism uses OpenCodeReview (OCR) for the model-backed part of final code
review. OCR adds a separate executable, provider configuration, authentication
boundary, connectivity check, consent grant, and attribution source. Its report
also sits beside three review axes performed in the interactive Pi session.
That split cannot prove which immutable source bytes each axis received, and it
makes the final report depend on prose coordination.

Pi exposes a public SDK that can create isolated in-memory sessions with a
caller-supplied provider, model, reasoning level, system prompt, resource
loader, and custom tools. A prototype against Pi 0.84.1 and 0.84.4 confirmed
that a session can inherit the active model exactly, expose only one custom
submission tool, terminate after one submission, and avoid transmitting
repository content during a synthetic call. The prototype also showed that SDK
cwd framing and batch termination need explicit handling and that local
authentication readiness is not reliable enough to authorize review.

Moving review into Prism creates a self-review problem. The Prism repository
contains the executable, Core skills, adapter profile, and adapter skills that
would define the new reviewer. Hashing bytes from reviewed HEAD records
self-modification but does not make those bytes trustworthy. The runtime needs
a pre-existing source independent of the reviewed delta.

The review policy must preserve the Core/adapter split. Generic axes,
classification, bounds, and evidence rules belong to globally installed Core.
Stack-specific interpretation belongs to the active project-local adapter.
Arbitrary project instructions cannot become authoritative review policy.
Reviewed files, diffs, requirements, commit text, tool output, and model output
are hostile data.

## Decision

We add a deep, package-owned executable named `prism-review` to Prism Core. It
owns deterministic review mechanics. Agent Skills own qualitative review
policy.

### Stable trust root

The authoritative executable, Core profile, Core skills, schemas, limits, and
verifier policy come from the one selected global Core package source under
ADR-0075. Before an authoritative operation, the executable canonicalizes its
package root and the reviewed repository root. It refuses authority when the
Core source is contained by the reviewed repository. Checkout code may produce
ad hoc reports and run tests, but it cannot write authoritative chain evidence.

A normal consumer uses review resources from its validated installed active
adapter. When adapter registration points inside the repository being
reviewed, the engine reads the declarative adapter profile and Markdown skill
blobs from the protected base commit rather than reviewed HEAD. It treats those
bytes as inert policy and never executes adapter code materialized from Git.
Any adapter executable needed for authoritative deterministic evidence must
come from a separately installed compatible adapter package outside the
reviewed worktree.

Receipts identify package versions, source classes, and policy/resource
digests. They do not persist raw local package paths. A policy change becomes
authoritative only after human merge, release, publication, and installation.
The prior installed release therefore reviews changes to its successor.

The trust claim excludes a compromised installed package, protected base, Pi
runtime, provider, Git executable, operating-system account, or hostile process
running as the same user.

### Closed review profiles

Core and an active adapter each ship one schema-version-one declarative review
profile. A profile contains exact package identity and role, bounded
package-owned `SKILL.md` resources, axis-to-lens mappings, deterministic path
triggers, and fixed non-text exemptions.

The Core profile names one shared session contract, four mandatory axis skills,
verifier skills, and canonical axis order. The four axes are tooling/style,
structural smells, requirement coverage, and static security. An adapter may
append triggered lenses only. It cannot replace or weaken a Core axis, session
contract, verifier, result schema, classification, limit, tool, or exemption.
Profiles contain no commands, scripts, provider settings, repository-state
conditions, arbitrary project skills, executable assets, or extension
references.

Every profile resource resolves within its trusted package or protected-base
source. All path components are non-symlink. Each resource is a bounded,
regular, non-executable UTF-8 `SKILL.md` file whose frontmatter name matches its
directory. The engine hashes the exact bytes it loads. Zero adapters is valid;
more than one active adapter, a malformed expected profile, an escaping path,
or an oversized resource makes authoritative review Inconclusive.

Core adds six control skills: one shared session contract, four axis skills,
and one adversarial verifier. Focused adapted skills may add review methods,
but they remain report-only and cannot widen the tool surface. Adapted files
retain immutable upstream provenance and their source licenses. CC BY-SA 4.0
derivatives remain separately licensed and attributed inside the AGPL package.

The PHP/web adapter initially reuses existing package-owned skills as review
lenses rather than duplicating stack policy. Conservative triggers add a lens
only for relevant changed evidence. Triggers never remove source bytes from an
axis.

### Immutable scope and complete byte exposure

The engine freezes full Git object identities for the branch or explicit
scope, target base, reviewed head, entry modes, blob OIDs, rename/copy status,
and unified diff before inference. It reads immutable Git objects rather than
mutable worktree files. Staged review freezes index identities; tracked-path
review does not recursively ingest ignored or untracked content.

Every eligible changed text blob and its full diff must be exposed to every
axis. Added and modified files require the complete head blob. Deleted files
require the complete base blob. Renames and copies require old and new blobs.
The launcher, not the model, tracks byte intervals and rejects a submission
until that axis has read every required interval.

Binary blobs, symlinks, Gitlinks, and mode-only changes stay in the manifest.
Core may assign fixed metadata-only exemption codes for content that cannot be
reviewed as text. A profile or model cannot invent an exemption. Sensitive
paths stop the attempt before their objects are read or transmitted. Invalid
UTF-8, missing objects, snapshot drift, size overflow, and insufficient model
context are Inconclusive failures rather than exemptions.

Byte exposure proves which immutable bytes entered a session. It does not
prove attention, understanding, or semantic coverage, and Prism does not label
it that way.

Schema version one uses one session per axis and does not silently shard an
oversized review. Before egress, the engine computes a conservative budget
from the active model's context metadata and fixed hard ceilings, reserving
space for policy, evidence, tools, and output. The effective limit is the lower
value. Per-file text is capped at 256 KiB and aggregate source/diff input at 1
MiB. If all required bytes cannot fit every axis, the attempt is Inconclusive
before the first model call.

### Isolated Pi sessions

Each axis runs in a fresh synchronous in-memory Pi SDK session. The engine
inherits the provider, model, and reasoning level already selected by the
human. It exposes no model or provider flag, fallback, routing rule, credential
read, or authentication configuration.

Project settings, prompts, skills, extensions, themes, session files, and
built-in coding tools are disabled. The custom tool surface contains only
bounded immutable diff reads, bounded immutable file reads, and one closed
review submission. Tool results frame all repository and evidence text as
hostile data. A second submission, malformed output, unknown field, unsupported
classification, tool-budget breach, timeout, or provider failure makes the
axis Inconclusive.

All four axes must complete. A fresh bounded verifier session receives
normalized findings, byte-exposure records, exemptions, and compact evidence.
It attempts to falsify anchors, causality, impact, and certainty. It is an
adversarial re-evaluation by the same selected model, not independent authority.
It cannot repair incomplete axis coverage. An unresolved possible Blocking
issue makes the review Inconclusive.

The engine validates finding anchors against immutable changed source.
Blocking findings must satisfy ADR-0080's causality, relevance, concrete
evidence, and changed-workflow impact tests. Other findings remain Advisory or
Suggested.

Reports and future receipts include immutable scope, package/profile/resource
digests, active model metadata, per-axis status, byte-exposure and lens ledgers,
fixed exemptions, normalized findings, and stable failure reasons. They omit
source bytes, prompts, hidden reasoning, provider transcripts, credentials, and
unbounded tool output.

### Staged introduction

The runtime first ships as a non-authoritative foundation. Its public staged,
commit, branch, and tracked-path modes write reports but no finalization chain.
OCR, current consent, commit attribution, `/check`, finalization, and
version-one chain behavior remain authoritative while the foundation branches
are reviewed and merged.

ADR-0103 defines deterministic authority and the later cutover. Human release,
publication, and installation separate foundation from authority migration.

## Consequences

- Prism gains a substantial executable boundary, but its CLI is smaller than
  exposing SDK, Git, profile, and evidence internals to prompts.
- Review policy stays inspectable as skills while deterministic containment,
  immutable reads, bounds, schemas, and hashes stay in code.
- Every text file reaches every axis. Reviews may cost four model passes plus
  verifier work and may fail closed on changes that exceed the selected model's
  context.
- Adapter authors can add stack interpretation without changing Core, but
  authoritative adapter development requires a pre-existing installed adapter
  for executable quality behavior.
- The reviewer can report deterministic byte exposure and provenance. It
  cannot prove model comprehension or defend against compromise below its
  stated trust root.
- Core depends on Pi's public SDK compatibility through its existing host peer
  relationship. The package declares and tests a bounded compatible Pi range;
  it adds no separate model SDK or provider dependency.
- Adapted review skills add provenance and license-maintenance obligations to
  package validation and release archives.
- The initial foundation remains reversible because it does not replace the
  current authority. Removing it restores the prior OCR-only behavior.

## Alternatives considered

### Run review policy from reviewed HEAD

Rejected. Hashes would record self-modification but would not stop a branch
from weakening its own reviewer.

### Put all review behavior in `prism-tool`

Rejected. Git snapshotting, SDK sessions, byte accounting, and receipt logic
form a deep review module with a narrower dedicated interface. `prism-tool`
continues to own existing general workflow and compatibility mechanics.

### Keep all four axes in the interactive agent

Rejected. The interactive session carries project tools, prior conversation,
and mutable context. It cannot prove isolated tool surfaces or complete byte
exposure.

### Route each file only to matching axes

Rejected. A bad trigger could hide a cross-cutting defect. Triggers add lenses;
all axes receive all eligible text.

### Shard oversized reviews automatically

Rejected for the first schema. A reducer that sees only shard summaries weakens
cross-file reasoning and makes the authoritative claim harder to state.

### Load arbitrary project skills

Rejected. Reviewed HEAD could define policy that suppresses its own findings or
widens the session tool surface.

### Add another Pi extension

Rejected. Review is an explicit synchronous command, not an always-on runtime
capability. The accepted safety and web-access extensions remain unchanged.

### Replace OCR in the foundation branch

Rejected. The local implementation would become its own first authority. The
release/install checkpoint is required for a pre-existing trust root.
