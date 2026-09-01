# Trusted-Main Catalogue Notification Specification

Date: 2026-08-31
Status: Approved

**Originating issue:** #480

## Summary

Move credential-bearing adapter catalogue notification out of the pull-request-close release context and into a separate Prism workflow loaded from protected `main`. The release workflow will hand validated stable-release evidence to that workflow through a fixed same-repository `repository_dispatch` event. The trusted-main workflow will retain the existing protected environment, PAT scope, fixed publisher target, and closed workflow-dispatch inputs.

`/release` remains the single release entry point. It prepares the release branch and prints the human-run push and pull-request commands. After a human merges the release pull request, GitHub Actions publishes the repository release, reconciles package tags, opens the back-merge pull request, and starts catalogue notification. The publisher continues to validate and sign automatically, then opens a human-merged catalogue publication pull request. npm publication and both generated pull-request merges remain human-owned.

## Current Failure

`.github/workflows/release.yml` runs on a closed pull request targeting `main`. Its `notify-publisher` job requests the `catalogue-dispatch` environment, which permits only `main`. GitHub evaluates that policy from the immutable workflow event context before assigning a runner. For release v0.4.3, the notification job retained `head_branch: release/0.4.3`, failed before setup, and had no steps.

Checking out the merge commit does not change the job's event or deployment context. The credential-bearing job therefore cannot remain in the pull-request-triggered workflow while the environment remains restricted to `main`.

## Goals

- Complete a valid stable release run without a protected-environment rejection.
- Start automatic catalogue publication from workflow code loaded from protected `main`.
- Pass only the validated stable version and immutable merge commit between workflows.
- Preserve manual `workflow_dispatch` release recovery and publisher idempotency.
- Keep `catalogue-dispatch` restricted to `main` and keep the active `main` ruleset free of bypass actors.
- Preserve the existing dispatch PAT's Actions-write-only authority and exact fixed publisher target.
- Keep release workflow permissions, full action SHA pinning, disabled-publication behavior, active fail-closed behavior, and human merge gates unchanged.

## Non-Goals

- Automating npm publication.
- Automatically merging the Prism back-merge pull request or catalogue publication pull request.
- Changing publisher signing, evidence validation, sequence allocation, package eligibility, or publication-branch behavior.
- Weakening the `catalogue-dispatch` environment or adding a bypass actor.
- Adding an Actions dependency, npm dependency, Composer dependency, credential, or wider token permission.
- Installing the Prism-specific notification workflow in downstream package-release consumers.

## Architecture

### Release workflow handoff

The managed release workflow remains triggered only by closed pull requests to `main` and explicit `workflow_dispatch` recovery. Its existing publish job keeps exactly `contents: write` and `pull-requests: write` permissions.

Remove the credential-bearing `notify-publisher` job. Add a final handoff step to the publish job with an `always()` guard requiring:

- repository identity `kyaulabs/prism`;
- successful merge and package metadata validation;
- stable release classification;
- successful repository Release publication or idempotent recovery; and
- successful package-tag reconciliation.

The handoff remains reachable when back-merge pull-request creation fails, matching the current separation between publication and back-merge outcomes. It serializes a fixed local event and calls only the same repository's dispatch endpoint with the publish job's existing `GITHUB_TOKEN` authority. Obsolete cross-job release outputs are removed when no other caller remains.

`.github/workflows/release.yml` and `packages/prism-core/config/release.yml` remain byte-identical. The canonical package-release capability still owns only its existing configuration and release workflow; downstream consumers do not receive the Prism-specific notification workflow.

### Trusted-main notification workflow

Add `.github/workflows/catalogue-notify.yml` in the Prism repository. It triggers only on the fixed local repository-dispatch event type. GitHub loads repository-dispatch workflows and their ref context from the default branch, allowing the job to satisfy the `catalogue-dispatch` environment's exact `main` policy.

The workflow has one bounded notification job:

- exact repository and event guards;
- `ubuntu-latest` and a five-minute timeout;
- `environment: catalogue-dispatch`;
- an explicit empty `GITHUB_TOKEN` permission map;
- no checkout, cache, artifact, or third-party action;
- `CATALOGUE_DISPATCH_TOKEN` exposed only as `GH_TOKEN` on the fixed dispatch step; and
- one fixed call to `kyaulabs/prism-adapters`, `catalogue-signing.yml`, ref `main`, mode `release`.

The new workflow is Prism-specific trusted infrastructure. It is checked by catalogue-publication readiness but is not added to Core's package-release provider outputs.

## Data Contracts

### Same-repository event

The release workflow writes this closed JSON shape as inert data:

```json
{
  "event_type": "prism_adapter_release",
  "client_payload": {
    "schemaVersion": 1,
    "sourceRepository": "kyaulabs/prism",
    "version": "1.2.3",
    "mergeSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
```

The trusted-main workflow treats every event field as untrusted. It requires the exact top-level payload keys and values, exact `sourceRepository`, stable SemVer without a leading `v`, and a 40-character lowercase hexadecimal merge SHA. Unknown, missing, or malformed fields fail before the protected credential is used.

### Publisher workflow dispatch

After validation, the trusted-main workflow preserves the current publisher input contract:

```json
{
  "ref": "main",
  "inputs": {
    "mode": "release",
    "version": "1.2.3",
    "merge_commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
```

Event data cannot select the repository, workflow, ref, mode, credential, compatibility declaration, package, registry data, sequence, publication branch, signing input, or command.

## Failure and Recovery

- Prereleases, failed validation, failed Release publication, and failed or wrong-target package-tag reconciliation do not emit the local event.
- A local dispatch API failure fails the release run after publication. A manual rerun revalidates the immutable release state and safely emits the event again.
- Invalid local event data fails the trusted-main workflow before publisher API access.
- A publisher workflow-dispatch API failure fails the trusted-main workflow and remains visible for recovery.
- Duplicate local events are safe because the publisher independently validates release evidence and preserves its existing idempotent sequence and pull-request rules.
- Signing-disabled publication remains successful without entering protected signing. Signing-enabled publication continues to fail closed on invalid release, npm, signing, sequence, or publication evidence.
- npm publication remains a human prerequisite. If the immediate publisher run exhausts its bounded npm propagation retries, its existing schedule or manual recovery can retry after npm publication.

## Testing

Extend `tests/Shell/release_workflow_test.sh` through Red-Green-Refactor:

1. Add a regression assertion that fails when a pull-request-triggered workflow job enters `catalogue-dispatch`.
2. Parse both Prism workflow graphs and require the exact trigger, job, environment, permission, timeout, secret, endpoint, ref, and input contracts.
3. Execute the release handoff block with fake `gh`; verify stable validated evidence produces the exact local event.
4. Prove prereleases, malformed SHAs, partial publication, and failed reconciliation do not emit the event.
5. Execute the trusted-main dispatch block with fake `gh`; verify the exact publisher workflow-dispatch payload and fixed endpoint.
6. Prove malformed or expanded local payloads fail before publisher API access and API failures remain visible.
7. Verify manual release recovery reaches the same idempotent handoff.
8. Preserve byte parity between the installed and canonical managed release workflows and preserve full action SHA rules.

Extend `tests/Node/catalogue-publication-readiness.test.js` and `packages/prism-core/scripts/prism-tool/catalogue-publication-readiness.js` so readiness requires both Prism workflows to exist on `main`. Add drift coverage for a missing trusted-main notification workflow. Update `packages/prism-core/docs/catalogue-publication-provisioning.md` to identify the new secret-bearing workflow and the two-workflow readiness requirement without changing any credential instructions.

## Acceptance Criteria

- A valid stable release pull request merged into `main` completes without the original environment mismatch.
- No job in the pull-request-triggered release workflow requests `catalogue-dispatch` or receives `CATALOGUE_DISPATCH_TOKEN`.
- Successful stable publication and package-tag reconciliation emit exactly one fixed same-repository notification event per release run.
- The credential-bearing notification job runs from the trusted default-branch workflow and is accepted by the `main`-only environment.
- The publisher receives the validated version and immutable merge SHA through its existing closed workflow-dispatch interface.
- Release and notification workflow failures remain visible and safe to retry.
- Manual `workflow_dispatch` release recovery follows the same handoff and remains idempotent.
- The environment remains restricted to `main`, the active `main` ruleset has no bypass actor, and readiness verifies both trusted Prism workflows.
- Disabled publication succeeds without protected signing; active publication creates the next signed catalogue pull request when all external evidence, including npm publication, is available.
- Release permissions, PAT scope, fixed publisher target, full action SHA pinning, and human-owned npm publication and pull-request merges remain unchanged.

## Architecture Record

This design adds a same-repository event boundary between reviewed release publication and protected credential use. It extends ADR-0097's protected dispatch environment and Actions-only cross-repository transport rather than weakening either. Architect review must decide whether this trusted-main handoff requires a new ADR before implementation.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
