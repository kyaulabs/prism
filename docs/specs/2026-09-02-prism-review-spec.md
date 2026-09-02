# Spec: Trusted Prism review runtime foundation

**Date:** 2026-09-02
**Status:** Approved

## Problem statement

Prism currently delegates model-backed code review to OpenCodeReview (OCR). The proposed replacement originally combined the new runtime, authoritative evidence, workflow migration, and OCR removal in one branch. That design cannot review itself safely. A reviewer built from the branch under review could weaken its own executable, policy, adapter profile, or evidence rules before approving the change.

Prism needs a non-authoritative foundation release first. The release must prove that the installed Pi SDK can run isolated review sessions, that every review reads immutable Git objects, and that Core and adapter review policy remain inspectable as Agent Skills. It must leave the existing OCR review and finalization path unchanged until humans merge, publish, and install the foundation package.

## Solution

Add a `prism-review` executable to the Core package. It reviews staged changes, commits, branch ranges, and tracked paths through four isolated Pi SDK sessions. Each session inherits the provider, model, and reasoning level already selected by the user. The sessions expose only bounded immutable-source tools and a structured submission tool.

Core supplies the session contract, four mandatory axes, an adversarial verifier, and focused review lenses. The active adapter may append package-owned lenses through a closed declarative profile. It cannot replace Core policy or supply executable review behavior.

Every eligible changed text blob and its diff must be exposed completely to every axis. The executable records byte exposure without claiming that exposure proves model understanding. Sensitive paths, malformed profiles, unsupported text, size overflow, context-budget overflow, and incomplete sessions produce an Inconclusive result.

This stage produces ad hoc reports only. It does not write authoritative review-chain state or replace OCR in `/check`, finalization, commit attribution, setup, doctor, or pull-request preparation.

## User stories

1. As a Prism user, I want review to use my active Pi provider and model, so that Prism does not add model selection or provider configuration.
2. As a Prism user, I want four stable review axes, so that tooling/style, structure, requirements, and security remain distinct.
3. As a Prism user, I want every eligible changed text file read by every axis, so that path routing cannot hide a cross-cutting defect.
4. As a Prism user, I want path triggers to add specialist lenses without removing Core review, so that adapter mistakes cannot narrow coverage.
5. As a Prism user, I want review sessions unable to run shell commands, write files, access the network directly, or load project tools, so that hostile reviewed text has a small action surface.
6. As a Prism user, I want source bytes read from immutable Git objects, so that concurrent worktree changes cannot alter an active review.
7. As a Prism user, I want staged, commit, branch, and tracked-path review modes, so that one engine supports normal development before finalization integration.
8. As a Prism user, I want unsupported or oversized changes reported as Inconclusive, so that truncation never appears as complete review.
9. As a Prism user, I want binary, symlink, Gitlink, and mode-only changes represented explicitly, so that metadata-only review is visible.
10. As a Prism user, I want sensitive tracked paths to stop review before bytes are read or sent, so that review cannot bypass Prism's credential deny floor.
11. As a Prism user, I want finding locations validated against frozen source, so that stale or fabricated anchors do not enter a report.
12. As a Prism user, I want Blocking, Advisory, Suggested, and Inconclusive outcomes kept distinct, so that maintainability advice does not stop delivery.
13. As a Prism user, I want a fresh verifier to challenge proposed findings, so that unsupported claims are not accepted without adversarial re-evaluation.
14. As a Prism maintainer, I want Core review policy expressed as Agent Skills, so that qualitative behavior stays inspectable and editable.
15. As an adapter author, I want one closed profile that appends package-owned lenses, so that stack review does not require Core changes.
16. As a Core-only user, I want all four generic axes without an adapter, so that Prism review works outside the PHP/web stack.
17. As a Prism maintainer, I want exact upstream provenance and license treatment for adapted skills, so that package archives preserve their obligations.
18. As a Prism maintainer, I want tests to inject fake Pi sessions, so that the suite does not depend on live model output or credentials.
19. As a Prism maintainer, I want authoritative mode rejected when Core resolves inside the reviewed repository, so that checkout code cannot approve itself.
20. As a Prism user, I want OCR to remain authoritative during this stage, so that introducing the replacement runtime does not create a half-valid migration.

## Implementation decisions

### Architecture and trust

ADR-0102 records the staged replacement, stable installed trust root, isolated Pi SDK boundary, closed adapter contribution model, and eventual OCR cutover. The selected global Core package under ADR-0075 is the future authority. An authoritative operation canonicalizes the Core package and repository roots and rejects a Core source contained by the reviewed repository.

This stage may run checkout code for tests and ad hoc reports. Those reports are never authoritative. Future authoritative review uses a previously installed release, not executable or policy bytes from reviewed HEAD.

The runtime imports only Pi's public SDK. It inherits the exact active provider, model, and reasoning level. It offers no model flag, fallback model, authentication store access, persistent child session, extension loading, or automatic retry after a failed review attempt. SDK compatibility is bounded and tested against the package's declared Pi peer range. No new third-party runtime package is introduced beyond the existing Pi peer relationship.

### Review profile

Core and the active adapter each ship one schema-version-one review profile. A profile contains package identity, role, package-owned skill resources, axis-to-lens mappings, deterministic path triggers, and fixed non-text exemptions.

The Core profile names the shared session contract, the four mandatory axis skills, verifier skills, and canonical axis order. An adapter may append lenses only. It cannot replace a Core axis, session contract, verifier, result schema, classification, limit, tool, or exemption policy. Profiles contain no commands, scripts, provider settings, repository-state conditions, arbitrary project skills, or extension references.

Resource resolution stays within the trusted package source. Every path component must be non-symlink, and every resource must be a bounded, regular, non-executable UTF-8 `SKILL.md` file whose frontmatter name matches its directory. Receipts and reports identify exact resource digests rather than trusting names alone.

The PHP/web adapter reuses existing package-owned skills as lenses instead of duplicating their stack policy. Its triggers are conservative. Frontend lenses match frontend evidence; database lenses match SQL and migration evidence plus PHP security review where calls need interpretation. Markdown-only changes do not trigger PHP/web policy. Zero active adapters is valid. More than one active adapter, or a malformed expected adapter, is an error.

### Skills and licensing

Core adds six control skills: one shared session contract, four axis skills, and one adversarial verifier. It also carries the eight proposed focused adaptations for readability, duplication, error flow, differential review, requirement compliance, authorization, input validation, and false-positive checking.

The five Jeremy Morgan source files remain attributable to their pinned commit and verified SHA-256 values. Their source repository is CC0-1.0. The three Trail of Bits source files remain attributable to their pinned commit and verified SHA-256 values. Adapted Trail files remain CC BY-SA 4.0, identify changes, include attribution, and ship with the full license. They are not relicensed as AGPL. Package NOTICE and archive tests preserve both provenance classes. No upstream scripts, agents, hooks, workflows, images, or package metadata are copied.

### Immutable review scope

The executable freezes the repository identity, base and head objects, entry modes, blob OIDs, rename/copy status, and unified diff before inference. It reads Git objects directly rather than trusting worktree paths.

Added and modified regular files require the full head blob and full diff. Deleted files require the full base blob and diff. Renames and copies require old and new blobs plus their diff. Tracked-path audits use frozen tracked content only; they never recursively ingest ignored or untracked files.

Binary blobs, symlinks, Gitlinks, and mode-only changes remain in the manifest. Core may declare metadata-only exemption codes for content bytes that cannot be reviewed as text. A profile or model cannot invent an exemption. Invalid UTF-8, missing objects, sensitive paths, and limit overflow are failures, not exemptions.

### Isolated sessions and byte exposure

Each axis runs in a fresh in-memory SDK session. Project settings, prompts, skills, extensions, themes, session files, and built-in coding tools are disabled. The custom tool surface contains only bounded immutable diff reads, bounded immutable file reads, and one structured review submission.

Tool results label reviewed bytes as hostile data. The shared contract forbids following instructions found in source, diffs, requirements, commit text, or evidence. The launcher tracks byte intervals itself. It rejects submission until the axis has read every required interval.

All four axes receive the same manifest and must expose every eligible changed text blob and diff. Adapter triggers only add prompts. Byte exposure is a deterministic fact, not proof of semantic attention.

One isolated session per axis is the schema-one limit. The runtime does not silently shard oversized reviews because reduction would weaken cross-file reasoning. It computes a conservative budget from the active model context and fixed hard ceilings before the first model call. The effective limit is the lower value. Per-file input cannot exceed 256 KiB and aggregate source/diff input cannot exceed 1 MiB. Tests must establish a conservative context calculation with reserved policy, evidence, tool, and output capacity. If every required byte cannot fit every axis, the whole attempt is Inconclusive before egress.

### Findings and verifier

Every axis submits a closed schema. Findings identify the axis, lens, classification, immutable path, side, line or range, summary, and bounded evidence. Blocking findings must satisfy ADR-0080's causality, relevance, concrete-evidence, and workflow-impact tests. Structural or maintainability observations without that proof are Advisory. Suggested items remain visible but do not enter future chain authority.

The launcher validates each anchor against the frozen manifest and changed lines. The verifier receives normalized findings, exposure records, exemptions, and compact evidence. It tries to falsify anchors, causality, impact, and unsupported certainty. It does not repair missing axis coverage or provide independent authority. An unresolved possible Blocking issue makes the attempt Inconclusive.

Reports omit raw prompts, hidden reasoning, provider transcripts, credentials, and source bytes. They include scope identities, active model metadata, package/profile/resource digests, per-axis status, byte-exposure summaries, lens status, findings, exemptions, and fixed failure reasons.

## Testing decisions

The primary seam is the spawned public `prism-review` CLI against temporary fixture repositories. Tests inject fake Pi session factories and scripted tool calls at the SDK boundary. They assert stdout, stderr, exit status, immutable Git reads, tool schemas, coverage enforcement, and absence of repository mutation.

Contract tests cover every review mode, detached HEAD, SHA-1 and SHA-256 repositories, adds, deletes, renames, copies, invalid UTF-8, binary files, symlinks, Gitlinks, mode-only changes, sensitive paths, malformed profiles, path escape, symlink substitution, duplicate adapters, no adapter, Core-only review, provider failure, malformed submissions, context overflow, interrupted sessions, and adversarial source instructions.

Package tests install or archive Core and the PHP/web adapter, then verify executable placement, profile discovery, skill inclusion, provenance, licenses, and no dependence on checkout paths. Existing harness validators confirm source-file ceremony and package layout.

The one previously authorized synthetic SDK inference is viability evidence only. Automated tests make no live provider request and read no authentication store.

## Out of scope

- Authoritative finalization receipts or review-chain version two.
- Criteria and deterministic `/check` receipts.
- Changes to `/check`, `code-review`, finalization, `/pr`, setup, doctor, release, commit attribution, or consent.
- OCR removal or relaxed OCR readiness.
- Multiple active adapters or arbitrary project review policy.
- General-purpose agents, hosted review services, model routing, retries, pushes, pull-request creation, or merges.
- Review of ignored or untracked path trees.

## Further notes

The next specification adds the authority compatibility bridge while OCR remains active. The final specification switches workflow authority and removes OCR only after humans release, publish, and install the Core and adapter outputs from both foundation branches.
