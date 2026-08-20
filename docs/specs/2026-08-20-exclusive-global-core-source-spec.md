# Exclusive Global Prism Core Source Specification

Date: 2026-08-20
Status: Approved

## Problem

`packages/prism-core/scripts/install-global.sh` delegates package registration
to `pi install`, but Pi identifies npm and local-path package sources
separately. Switching between `npm:@kyaulabs/prism-core` and a checkout path
therefore leaves both entries active in global settings. Duplicate prompt
names are then ambiguous; in the observed failure, the stale npm `/release`
prompt won over the current checkout prompt and instructed the agent to bypass
the ADR-0064 footer contract and ADR-0074 atomic commit launcher.

The repository copy of `packages/prism-core/prompts/release.md` is already
correct. The installer must make the selected Prism Core source exclusive.

## Goals

1. A successful global Prism Core install leaves exactly one active
   `@kyaulabs/prism-core` source in Pi global settings.
2. Switching npm to local or local to npm removes competing Prism Core entries
   without removing unrelated packages or settings.
3. Settings reconciliation is atomic and fails closed on malformed or unsafe
   input.
4. The selected package remains installed before competing entries are
   removed, so a failed installation does not remove the previously working
   source.
5. Existing launcher deployment, managed context deployment, registry-consent,
   and readiness behavior remains unchanged.

## Non-goals

- Modifying files outside the project during implementation or tests.
- Changing Pi's package identity or prompt precedence rules.
- Changing the ADR-0064 three-footer commit contract.
- Changing `/release` behavior beyond ensuring the current selected prompt is
  the only active Prism Core copy.
- Removing inactive package-cache directories after their settings entries are
  removed.

## Design

### Source selection

`install-global.sh` determines one canonical selected source before invoking
Pi:

- npm mode: the validated literal `npm:@kyaulabs/prism-core` source supplied
  through `PRISM_CORE_SOURCE`;
- explicit local mode: the canonical absolute `PRISM_CORE_SOURCE` path;
- checkout mode: the canonical absolute package root containing the installer.

The existing npm network-approval gate remains unchanged.

### Reconciliation helper

Add a narrow first-party Node helper under
`packages/prism-core/scripts/` that receives:

1. the Pi global settings path;
2. the selected canonical source.

The helper parses the settings document and classifies Prism Core package
entries in both string and object forms:

- npm entries whose package name is exactly `@kyaulabs/prism-core`, with an
  optional version suffix;
- local-path entries whose resolved package root contains a `package.json`
  whose `name` is exactly `@kyaulabs/prism-core`.

It retains one selected entry, removes all competing Prism Core entries, and
preserves every unrelated key and package entry in order. Duplicate selected
entries collapse to one.

The helper writes a same-directory temporary file with restrictive mode,
flushes it, and renames it over `settings.json`. It does not delete package
cache directories or inspect credential paths.

### Installer sequencing

1. Run the existing `pi install` for the selected source.
2. Only after Pi reports success, invoke the reconciliation helper against
   `$PI_CODING_AGENT_DIR/settings.json`.
3. If reconciliation fails, stop before deploying refreshed context files or
   the launcher and report a generic settings-reconciliation failure.
4. Continue the existing context deployment, launcher deployment, and local
   readiness checks after successful reconciliation.

This sequencing preserves the prior working source when installation itself
fails. A reconciliation failure may leave Pi's successful install entry beside
the prior entry, but it never deletes or partially rewrites settings; rerunning
with corrected settings is safe.

## Security and failure model

- **Asset:** integrity and availability of Pi global package configuration and
  the Prism safety/prompt resource set.
- **Trust boundary:** existing Pi settings content and local package metadata
  are data, never shell source.
- **Abuse cases:** malformed JSON, path traversal, symlink substitution,
  accidental removal of unrelated packages, duplicate stale Prism resources,
  and partial settings writes.
- **Controls:** argument-array invocation, canonical paths, exact package-name
  allowlisting, regular-file checks, bounded input size, no shell evaluation,
  same-directory atomic replacement, and generic diagnostics.
- **Fail-closed behavior:** invalid settings or selected-source metadata stops
  installation without replacing the settings file.

## Test seams

Extend `tests/Shell/install_global_toolchain_test.sh` with hermetic fixture
settings and a fake Pi installer that records the selected entry. Cover:

1. npm plus stale local entries reconciled to npm only;
2. local plus stale npm and alternate-local entries reconciled to the selected
   local source only;
3. duplicate selected entries collapse to one;
4. object-form package entries are recognized;
5. unrelated package entries and top-level settings remain unchanged and in
   order;
6. malformed JSON fails without changing the original bytes;
7. a local entry with a different package name is preserved;
8. installation failure occurs before reconciliation;
9. reconciliation failure stops before context and launcher deployment;
10. the existing installer test suite remains green.

Add focused Node tests if the shell fixture cannot exercise helper validation
and atomic-write failures without obscuring intent.

## Acceptance criteria

- Reproducing the observed global settings state and running the local
  installer leaves only the checkout Prism Core source active.
- Running npm installation after local development leaves only the npm Prism
  Core source active.
- No unrelated global package or setting is removed or rewritten
  semantically.
- Malformed settings remain byte-identical after failure.
- `/release` resolves from the selected Prism Core source after Pi reloads.
- `prism-tool commit create` remains the sole ordinary agent commit path.
- `/check` and code review pass before handoff.

## Release-branch handling

This correction is explicitly requested on `release/0.2.0`. The fix is
committed as its own atomic `fix(installer)` commit. `CHANGELOG.md` is then
regenerated so v0.2.0 includes the correction, followed by the standard atomic
`chore(release): v0.2.0` commit. No branch is pushed, tagged, published, or
cleaned up by the agent.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
