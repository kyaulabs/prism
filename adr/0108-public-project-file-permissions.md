# 0108. Umask-compatible runtime permissions for managed public files

Date: 2026-09-06

## Status

Accepted

Approved with the focused #520 implementation plan. The earlier repository-wide
creation policy, migration machinery, and CI preparation proposal are withdrawn.

Partially supersedes the exact public runtime-mode equality
clauses of ADR-0078, ADR-0088, and ADR-0100, and extends ADR-0105's managed
project-manifest validation. Canonical creation declarations, package-resource
checks, private records, ownership, content integrity, and transaction authority
remain unchanged.

## Context

Prism requires some managed public files to be exactly `0644` or `0755`.
Git preserves the executable distinction, not complete Unix permissions.
Ordinary checkout, switching, and fast-forward pulls under umask `0027` or
`0077` can therefore recreate valid files as `0640`/`0600` or `0750`/`0700`.

Issue #520 reports this blocking `prism-adapters` hooks after both baseline
scanning and ordinary synchronization. Scanner isolation addresses scan-driven
mutation but cannot fix a validator that rejects healthy Git checkouts.

Enforcing a new owner/group-only policy throughout the repository would solve
a different problem. It would reject existing `0644`/`0755` files and require
migration and CI preparation. The user has withdrawn that expanded scope.

## Decision

Limit the change to runtime validation of Git-managed public files already
owned or inspected by Prism, including managed metadata, workflows, and hooks.
Keep canonical creation declarations at `0644` for data and `0755` for
executables. Do not introduce a project-wide source/documentation inventory.

Data requires owner read and permits only bits contained in `0644`.
Executables require owner read and execute and permit only bits contained in
`0755`. Owner write and optional group/other read or execute bits may be absent.
Thus ordinary results of umasks `0022`, `0027`, and `0077` remain acceptable.
Group/other write, special bits, data execution, and missing required owner
access remain failures.

Mode acceptance does not replace ownership, regular-file/no-symlink,
containment, held-identity, schema, or canonical-content validation. Private
records, credentials, journals, receipts, scan scratch, and installed package
resources retain their separate contracts. Exact candidates, approved observed
state, and rollback evidence are not relaxed into runtime predicates. A change
between two acceptable modes still invalidates approval bound to the old state.
Where a retained private plan currently conflates canonical and observed modes,
record the observation separately and version that private plan format. Old
plans require regeneration; this does not change provider reports or the
Core-to-adapter bootstrap protocol.

Inspection and reconciliation preserve healthy existing managed files without
chmod or rewriting them merely to add optional access. Verification remains
read-only. Diagnostics distinguish permissions from ownership, content, and
metadata errors and identify the affected public path, observed mode, and
accepted requirements without exposing protected paths.

Managed-file checks run after review and before PR readiness, including the
existing recovery route. They do not invoke setup, grant another review
attempt, erase completed external evidence, or change review authority.

No new creation-mode policy, provider report format, bootstrap protocol,
release declaration, developer migration, or CI preparation follows from this
runtime bug fix. If planning discovers a necessary incompatible change, report
that specific conflict rather than silently restoring the withdrawn expansion.

## Consequences

- Healthy Git checkouts remain usable without repeated manual chmod.
- Existing canonical outputs and ordinary CI checkouts remain valid.
- Public readers and reconciliation need focused changes and regression tests;
  private-record and transaction checks must retain their existing protections.
- Read-only diagnostics expose genuine failures without becoming a repair tool.
- This does not attest ACLs or whole-filesystem confidentiality and introduces
  no new repository-wide access policy.

## Alternatives Considered

### Keep exact runtime equality

Rejected because normal Git operations reproduce the hook failure.

### Require owner/group-only permissions on all project files

Withdrawn as outside #520's amended bug-fix scope. It creates migration and CI
requirements that are unnecessary for umask-compatible runtime validation.

### Change the global umask or automatically chmod during verification

Rejected because the caller owns creation policy and verification must not
repair developer state.

### Relax every mode comparison

Rejected because runtime public files, package resources, exact candidates,
and private transaction records have different responsibilities.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
