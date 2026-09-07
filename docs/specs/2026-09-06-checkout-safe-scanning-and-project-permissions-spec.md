# Spec: Checkout-safe scanning and umask-compatible managed files

**Date:** 2026-09-06
**Status:** Approved; focused implementation plan approved with `go`

## Problem Statement

Issue #520 reports that Semgrep baseline scanning recreated files in
`prism-adapters`, causing managed pre-commit and pre-push hooks to fail despite
a clean Git status. Under umask `0077`, files became `0600` and hooks `0700`;
Prism required exactly `0644` and `0755`.

The issue's first scope amendment confirms that ordinary Git synchronization
can produce the same failure without a scan. Both scanner isolation and
umask-compatible managed-file validation are needed.

The later proposal to enforce owner/group-only permissions throughout every
project is withdrawn. This revision returns to #520 and its first amendment,
not the original body's now-amended requirement to retain exact runtime modes.

## Solution

Keep Semgrep baseline operations away from the consumer checkout. Accept safe
restrictive permissions on Git-managed public files already validated by
Prism, without changing canonical creation modes or requiring migration.
Keep verification read-only and explain genuine validation failures.

## User Stories

1. As a developer, I want review to leave my checkout and Git state unchanged,
   so that passing review does not break my hooks.
2. As a developer, I want ordinary checkout, branch switching, and fast-forward
   pulls under umasks `0022`, `0027`, and `0077` to remain usable without chmod.
3. As a maintainer, I want unsafe files and invalid managed content rejected
   with useful diagnostics, without weakening credential or private-state rules.

## Implementation Decisions

### Isolated Semgrep execution

Core owns the isolation boundary used by the launcher and Core quality
executor. Baseline-capable callers, including environment-selected baselines,
must not run against the consumer working tree. Rule-pack tests use disposable
fixtures rather than exposing the developer checkout to baseline resets.

Use a private independent scan checkout. Preserve the requested baseline/HEAD
comparison, existing-versus-new filtering, and consumer-relative finding paths.
Do not share mutable Git administration with the consumer or fall back to
in-place scanning when isolation fails. Local changes must remain untouched;
unsupported dirty inputs may be rejected before scanner execution.

Preserve credential, private-state, dependency, and submodule exclusions before
reading or exporting content, including historical content. Do not acquire
credentials, change authentication, add network authority, or silently fetch
missing objects. Unsupported inputs fail with an explanation.

Bound preparation, scanner execution, output, and cleanup. Terminate owned
processes and clean only task-owned temporary artifacts after failure or handled
interruption. Verify consumer HEAD, index, contents, modes, and relevant Git
administrative state after scanning. A clean Git status alone is not proof of
preservation. Report scanner outcome separately from preservation failure;
never reset, repair, or automatically retry the consumer checkout.

### Umask-compatible managed-file validation

Change runtime acceptance only for Git-managed public files that Prism already
validates, such as metadata, workflows, and hook wrappers. Do not add a
repository-wide permission inventory for ordinary source and documentation.

Retain canonical creation declarations of `0644` for data and `0755` for
executables. Runtime validation requires owner read for data, and owner read
and execute for executable wrappers. Accept restrictive subsets of those
canonical modes that retain required owner access, including `0640`/`0600`
and `0750`/`0700`. Existing `0644`/`0755` files remain valid.

Continue to reject group/other write, unexpected executable data, special bits,
missing required owner access, unsafe ownership, symlinks, non-regular files,
and tampered content. Keep ownership, containment, identity, schema, and content
integrity checks independent of mode acceptance.

Private records, credentials, receipts, journals, and scratch directories retain
their existing strict contracts. Do not relax a shared private-record helper to
fix a public-file reader. Installed package resources retain their own contract.
Exact candidate, approved observed-state, and rollback checks remain exact;
accepting two runtime modes does not make an intervening mode change invisible.

Keep valid existing managed files unchanged during inspection and reconciliation.
Verification never chmods files or changes the global umask. Report an affected
public path, observed mode, and required/allowed access for permission failures;
distinguish them from ownership, content, and metadata errors. Do not expose
protected paths or suggest chmod as a repair for tampered or unowned files.

### Compatibility and readiness

No canonical output-mode, provider-report, bootstrap-protocol, or release
metadata change is part of this fix. Ordinary fresh CI checkouts remain valid;
there is no CI permission preparation or developer migration operation.

Check managed-file health after review and before reporting PR readiness,
including the existing absent-chain recovery route. Keep tool-version readiness
separate from managed-file health. Missing metadata must remain distinguishable
from invalid metadata; checking must not invoke setup or fabricate a manifest.

A local validation failure must not erase completed review evidence or authorize
another OCR attempt. Preserve current review authority, consent, attribution,
release/install boundaries, and human-owned publication. ADR-0103's OCR cutover
remains separate work.

## Testing Decisions

Use the existing launcher, Core quality, managed-file, automation, hook, and PR
interfaces. Test behavior in disposable repositories, not a new policy engine
or a baseline scan of a real developer checkout. Mock external boundaries only.

Acceptance criteria:

- Baseline scanning preserves consumer HEAD, index, contents, permissions, and
  relevant Git administrative state on success, failure, and handled interruption.
- A regression starts with `0644` managed metadata and `0755` hooks under umask
  `0077` and verifies that scanning leaves them unchanged.
- Native findings retain correct relative paths and baseline filtering.
- Existing local changes survive, or unsupported inputs fail before scanning.
- Real checkout, branch-switch, and fast-forward operations recreate managed
  files under `0022`, `0027`, and `0077`; validation and hooks remain usable
  without recurring permission repair.
- Unsafe write/special bits, missing owner access, unsafe ownership, symlinks,
  and tampered content still fail. Private-record rejection remains unchanged.
- Validation is read-only, distinguishes failure categories, and detects
  post-review managed-permission drift before declaring readiness.
- Existing provider declarations and canonical outputs remain compatible;
  ordinary CI needs no permission-preparation step.

Implementation must follow Red → Green → Refactor and pass the existing hooks,
Core and adapter checks, and local/CI regression suites. PHP changes retain the
80% changed-file coverage gate. Earlier prototype results are not evidence for
this revision. No implementation or full completion check is claimed here.

## Out of Scope

- Repository-wide permissions for ordinary source or documentation.
- New `0640`/`0750` creation defaults or rejection of valid `0644`/`0755` files.
- Permission migration commands, a general inventory service, or a CI
  preparation engine and its receipts/bundles.
- Bootstrap protocol two, provider-schema changes, or catalogue activation.
- Global umask changes or automatic developer-checkout repairs.
- New dependencies, tool installation, authentication, or network grants.
- Source-checkout setup, OCR removal, package publication, pushes, or merges.

## Further Notes

Authority is [issue #520](https://github.com/kyaulabs/prism/issues/520), its
[first scope amendment](https://github.com/kyaulabs/prism/issues/520#issuecomment-5557363098),
and the user's subsequent instruction to return to that scope. Later planning
map decisions do not authorize the withdrawn permission-policy expansion.

ADR-0107 covers scanner isolation; ADR-0108 covers managed-file runtime
acceptance only. Both were accepted after plan approval; the affected earlier
ADRs receive Status notes only. The relevant-ADR review returned GO-WITH-CONDITIONS;
ADR-required: 0107,0108. Its conditions and the replacement implementation plan
are recorded in `docs/plans/2026-09-06-checkout-safe-scanning-and-project-permissions.md`.
The user approved that plan with `go`; implementation follows its TDD and
verification requirements.

For #520 only, the user approved a focused planning exception: review relevant
ADRs and describe implementation boundaries and behavioral tests without
prewriting complete code. Permanent Prism rules, TDD, branches, signed commits,
hooks, quality gates, and review requirements remain unchanged. The withdrawn
plan is retained only as ignored historical material under `audits/`.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
