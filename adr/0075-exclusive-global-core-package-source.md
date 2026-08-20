# 0075. Exclusive Global Prism Core Package Source

Date: 2026-08-20

## Status

Accepted

Extends ADR-0058 and ADR-0060. Preserves ADR-0056, ADR-0064, ADR-0070,
ADR-0073, and ADR-0074.

## Context

Prism Core is globally installed so its safety extension, skills, prompts, and
always-on instructions apply across trusted projects (ADR-0058 and ADR-0060).
The global installer supports both the published npm package and a local
checkout for development.

Pi identifies npm and local-path package sources separately. Installing one
after the other therefore does not replace the prior entry: both remain active
in global settings. When both copies expose the same prompt, skill, or
extension, resource selection is ambiguous. The observed failure loaded a
stale npm `/release` prompt instead of the current checkout prompt. That stale
prompt contradicted ADR-0064's three-footer attribution and ADR-0074's atomic
commit launcher.

The selected global core source must be authoritative. Leaving multiple active
copies weakens the always-on guarantee because the harness cannot prove which
policy and safety implementation Pi loaded.

## Decision

A successful Prism Core global installation leaves exactly one active
`@kyaulabs/prism-core` package source in Pi global settings.

`packages/prism-core/scripts/install-global.sh` installs the requested source
first, then invokes a narrow first-party reconciler that atomically removes all
competing Prism Core settings entries while preserving the selected entry and
all unrelated configuration.

The reconciler recognizes:

- npm sources whose package name is exactly `@kyaulabs/prism-core`, with an
  optional version suffix; and
- local-path sources whose canonical package root contains a regular
  `package.json` with the exact name `@kyaulabs/prism-core`.

String and object package-entry forms are supported. Duplicate selected entries
collapse to one. Unrelated entries retain their order and content.

The settings file is treated as untrusted structured data. Reconciliation uses
bounded JSON parsing, canonical paths, exact package-name allowlisting,
regular-file and symlink checks, and same-directory atomic replacement. It
never evaluates settings content, removes package caches, or accesses
credential files.

Installation precedes reconciliation. If installation fails, the prior working
source remains registered. If reconciliation fails, the original settings
file remains byte-identical and the installer stops before refreshing context
files or the managed launcher.

## Consequences

**Positive:**

- Prism Core has one authoritative global resource set after every successful
  install or source switch.
- Stale npm/local prompts, skills, and duplicate safety extensions cannot
  shadow the selected source.
- npm-to-local and local-to-npm development workflows become deterministic.
- Atomic settings replacement prevents partial global configuration writes.

**Negative:**

- The installer owns a small amount of Pi settings reconciliation logic in
  addition to delegating package installation to Pi.
- Package identification must track Pi's supported string and object settings
  forms.
- A malformed settings file blocks installation until the human repairs it.

**Neutral:**

- Inactive npm or local package files may remain on disk; only active settings
  registration is in scope.
- The safety extension remains Prism's sole extension.
- Commit attribution remains the three ADR-0064 footers, created through the
  ADR-0074 launcher.
- Humans still control package publication, branch push, and pull-request
  merge.

## Alternatives Considered

### Remove only the npm entry during local installation

Rejected. It fixes the observed direction only and leaves local-to-npm,
alternate-checkout, duplicate-selected, and object-entry cases ambiguous.

### Mask the npm prompt in this repository's `.pi/settings.json`

Rejected. It hides one duplicate prompt in the dogfooding checkout but leaves
duplicate global skills and safety extensions active and does not protect
other projects.

### Delete competing package cache directories

Rejected. Active registration is owned by settings; cache deletion adds a
destructive filesystem boundary without improving resource selection.

### Change Pi's package identity or prompt precedence

Rejected. Pi is an external runtime boundary. Prism can make its own installer
deterministic without modifying upstream semantics.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
