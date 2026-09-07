# 0107. Isolated read-only Semgrep execution

Date: 2026-09-06

## Status

Accepted

Approved with the focused #520 implementation plan. Extends ADR-0063,
ADR-0070, and ADR-0080. ADR-0103's review-authority cutover remains separate.

## Context

Issue #520 reports that Semgrep 1.173.0 implements baseline comparison by
resetting a clean repository to the baseline and back. Files can be recreated
under the caller's umask, changing permissions and invalidating managed hooks
while HEAD, content, and Git status appear unchanged. The investigation also
reported changed index bytes and reflogs and environment-selected baselines.

Changing umask would not prevent Git administrative changes. Restoring the
consumer after a scan would turn verification into repair and could overwrite
concurrent work. Removing baseline comparison would change finding semantics.

Ordinary Git recreation also exposes Prism's exact-mode validation defect;
that separate part of #520 is addressed by ADR-0108, without a new
repository-wide permission policy.

## Decision

Core owns an isolated Semgrep execution boundary used by the ordinary launcher
and Core quality executor. Baseline-capable callers, including environment
baseline selection, must not run against the consumer working tree. Rule-pack
tests use disposable fixtures rather than a developer checkout subject to reset.

Run scans in a private independent checkout, without shared mutable consumer
Git administration. Preserve the requested baseline/HEAD comparison, native
existing-versus-new filtering, and consumer-relative finding paths. Isolation
failure never falls back to scanning or resetting the consumer checkout.

Leave existing local changes untouched. Unsupported dirty states or unavailable
required objects may be rejected before scanning. Do not stash, commit, reset,
implicitly fetch, or rewrite review identities to make an input acceptable.

Apply credential, private-state, dependency, and submodule exclusions before
reading or exporting content, including historical blobs. Do not copy consumer
credentials or enable hooks, executable filters, authentication, or additional
network effects. Existing external-tool and registry authorization remains in
force. Isolation is not permission to clone unrelated sensitive history.

Keep task-owned scan directories private (`0700`), data `0600`, and necessary
executables `0700`, without changing the caller's global umask. Bound preparation,
execution, output, and cleanup. On failure or handled interruption, terminate
owned processes before cleaning only task-owned temporary artifacts. An
unhandled kill may leave private residue; it is not successful evidence.

Verify consumer HEAD, index, public file contents and modes, and relevant Git
administrative state around scanning. Do not read credentials or private
contents merely to build a preservation proof. A clean Git status is
insufficient. Missing preservation evidence or failed cleanup prevents success;
report that failure separately from the scanner's actual outcome. Never repair
or automatically retry after drift.

This protects the consumer from scanner-driven Git operations; it is not an
operating-system sandbox against a malicious executable. The replacement plan
must choose the smallest implementation that meets these boundaries and test
native baseline behavior before relying on it. No new general Git workspace or
permission-management framework is required by this decision.

## Consequences

- Review no longer uses the consumer checkout as Semgrep's mutable working state.
- Baseline semantics remain, with isolated preparation and cleanup to test.
- Unsupported inputs fail before scanning rather than risking developer state.
- The change needs process-failure and Git-state regression coverage, not just
  assertions about final file contents or Git status.
- No dependency, credential, installation, publication, review retry, or
  review-authority permission is added.

## Alternatives Considered

### Change the caller's umask

Rejected because baseline resets still change Git state and creation policy
belongs to the caller.

### Restore the consumer checkout after scanning

Rejected because verification would mutate developer state and could overwrite
concurrent work.

### Disable baseline comparison

Rejected because it discards the intended existing-versus-new finding behavior.

### Use a workspace that shares mutable consumer Git administration

Rejected because it does not isolate the state that the scan must preserve.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
