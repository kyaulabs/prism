# Spec: Installed reviewer SDK readiness

**Date:** 2026-09-07
**Status:** Approved — architecture conditions satisfied by accepted ADR-0110 and ADR-0111
**ADR-required:** 0110,0111
**Originating issue:** #535
**Additional user-approved scope:** Remove Prism's session-handoff capability.

## Problem Statement

Prism Core 0.6.0 can install successfully while its standalone reviewer cannot
import the Pi SDK. Pi's managed npm installation deliberately disables peer
dependency installation. Core declares the SDK only as a peer, and the extension
loader's host aliases do not apply to the standalone executable.

The installer verifies the reviewer version rather than SDK readiness. Doctor
then returns a generic readiness failure, hiding the missing dependency. Core's
former Pi compatibility ceiling also excludes 0.85.1 without establishing an
API incompatibility.

## Solution

Core declares the Pi SDK as a runtime dependency so a supported installation
supplies it even when peer installation is disabled. Shipped Pi compatibility
metadata uses `>=0.84.1 <=5.0.0`, including 5.0.0. Runtime capability validation
remains mandatory: accepting a version does not establish API compatibility.

Installation verifies the installed reviewer's SDK boundary without requiring
model credentials, inference, or a consumer review profile. Doctor separately
checks the selected model, isolated resources, profiles, provider provenance,
and existing authority prerequisites. Failures identify their category and a
bounded remediation rather than exposing raw exceptions or configuration.

## User Stories

1. As a consumer, I want Core installation to supply the standalone reviewer's
   SDK without relying on checkout dependencies or inherited module paths.
2. As a Pi user, I want in-range releases admitted by version policy while
   missing or incompatible required APIs still fail closed.
3. As a consumer, I want readiness failures to distinguish a missing SDK,
   unsupported version, incompatible API, unavailable model, and profile or
   provider failures.
4. As a maintainer, I want package smoke tests to exercise actual SDK imports
   and readiness, not merely demonstrate that a command exits nonzero.
5. As a maintainer, I want reproducible baseline checks and a latest-stable
   compatibility lane that detects drift.
6. As a reviewer, I want external Core and adapter provenance preserved, with
   OCR and current review authority unchanged until their separate cutover.
7. As a Pi user, I want long-running work to continue through native compaction,
   without Prism stopping to produce a session-handoff document.

## Implementation Decisions

- The SDK becomes a Core runtime dependency, not an installer-provisioned peer.
  This is a new runtime dependency declaration for an SDK already used by Core.
- Relevant manifests, lockfiles, CI declarations, and maintained installation
  documentation agree on the inclusive compatibility range
  `>=0.84.1 <=5.0.0`. No replacement narrow minor ceiling is introduced.
- Package-relative ESM import is authoritative for SDK availability. A CommonJS
  resolution probe alone is insufficient because the SDK exposes an
  import-only entry point.
- The standalone reviewer never falls back to reviewed checkout code,
  consumer dependencies, extension-loader aliases, or inherited `NODE_PATH`.
- Version validation and API capability validation are separate requirements.
  Required runtime factories, resource isolation interfaces, and session
  interfaces are validated before their use. In-range incompatible runtimes
  fail with an API-specific diagnostic and documented remediation.
- SDK prerequisite verification is model-independent and local-only. It does
  not silently acquire dependencies, change the active Pi installation,
  select a model, configure authentication, or establish consent.
- Doctor retains exit status 3 and `NO-GO` for readiness failures. It exposes
  bounded classifier-owned categories and static remediation for missing SDK,
  unsupported SDK version, incompatible SDK API, model selection or
  availability, resource isolation, profiles, and adapter provider failures.
  Unknown failures remain fail-closed and redacted.
- Diagnostics do not include raw exception messages, stack traces, filesystem
  paths, credentials, or raw configuration. Doctor performs no inference or
  live authentication probe; authentication remains unknown until an
  authorized review attempt.
- Release verification uses exact baseline SDK versions and committed
  dependency evidence. CI covers 0.84.1, 0.85.1, and the latest stable release
  within `>=0.84.1 <=5.0.0` through a separately identifiable compatibility
  lane. The selected version may equal a pinned baseline. The compatibility
  lane records the exact version tested and cannot substitute for baseline
  release evidence.
- The selected provider, model, and reasoning level remain human-controlled.
  Test fixtures use isolated in-memory credentials and do not inspect the
  user's credential files.
- Core and adapter trust-root and protected-base requirements remain enforced.
  The repair neither removes OCR nor switches finalization authority.
- Remove the packaged `/handoff` prompt, its command listings, and active
  workflow instructions recommending session-handoff documents. Remove fixed
  context-percentage rules that require a fresh session; rely on Pi's native
  compaction and retain current task, approval, and verification state in
  existing workflow-owned artifacts. Do not change Pi settings or add a
  replacement compaction extension, command, or persistence mechanism.
- Preserve normal transitions between skills, isolated review sessions, fatal
  tool-state recovery, and human-requested session changes. A real blocker
  still stops unsafe work; session length alone does not.
- Historical ADR bodies and changelog entries remain intact. Do not delete
  user-authored historical handoff documents or unrelated artifacts.

## Testing Decisions

The user confirmed these seams:

- Installed-package integration: install packed Core into an unrelated private
  consumer with Pi-equivalent peer omission. Exercise real package-relative
  ESM resolution and readiness using real supported SDKs, with only the
  credential boundary replaced by in-memory test state. No inference occurs.
- Existing CLI and session-runtime interfaces: cover positive readiness,
  missing SDK, unsupported version, incompatible required API, unavailable
  model, isolation failure, invalid profiles, provider mismatch, and bounded
  diagnostics. Tests retain trust and provenance rejection coverage.
- Version boundaries: accept 0.84.1 and 5.0.0; reject versions below 0.84.1 and
  above 5.0.0. Accept 0.85.1 and newer in-range fixtures by version alone while
  independently rejecting missing capabilities.
- Installer and package smoke: assert SDK readiness explicitly. Neither
  `--version` success nor an arbitrary nonzero command exit proves readiness.
- Handoff-removal contract: packaged prompt discovery no longer exposes
  `/handoff`; active command listings and continuation guidance contain no
  session-handoff command or document recommendation. Assert native compaction
  guidance remains and genuine blocker/approval gates are preserved. Historical
  records and ordinary skill transitions are outside the removal assertion.
- CI: retain exact minimum and 0.85.1 baselines and add a latest-stable lane.
- Human release checkpoint: after publication and installation, run doctor
  from the independent consumer with valid model, profile, and provider
  prerequisites. Require `GO` and external provenance evidence before claiming
  the released-consumer acceptance criterion. Local probes cannot satisfy it.

Existing doctor CLI tests, isolated-session tests, installer shell tests, and
unrelated-consumer package smoke provide prior art. The integration tests must
not mock the SDK import or replace the whole readiness operation with success.

## Out of Scope

- OCR removal, consent migration, or review-authority cutover.
- Model or provider selection, authentication setup, or credential access.
- Changes to the user's global installation during agent implementation.
- Automatic compatibility fallback, checkout fallback, or `NODE_PATH` repair.
- A guarantee of compatibility with every future Pi API.
- Publication, pushes, or GitHub pull-request mutations by the agent.

## Further Notes

During execution, npm reported no version matching `>0.85.1 <=5.0.0`.
The human approved tracking the latest stable in the full supported range,
including a version equal to the baseline, rather than waiting for a newer
release. This does not widen version policy or weaken API checks.

Clean temporary installs reproduced missing ESM imports with peer installation
disabled. Pi 0.84.1 and 0.85.1 both imported successfully and passed Core 0.6.0's
isolated-runtime initialization with in-memory credentials and no inference.
These probes establish neither full review compatibility nor released-consumer
doctor `GO`.

ADR-0060 governs global installation. ADR-0102 governs the external trust root
and isolated reviewer; ADR-0110 narrowly replaces its host-peer
SDK dependency assumption. ADR-0111 replaces ADR-0055's session-handoff
guidance with native Pi continuity. ADR-0103 preserves the separate human
release/install checkpoint and OCR cutover. The human accepted both ADRs and approved the implementation plan. Execution
follows that plan's TDD, verification, and finalization gates.
