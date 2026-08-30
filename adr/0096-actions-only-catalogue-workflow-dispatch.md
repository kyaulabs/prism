# 0096. Actions-only catalogue workflow dispatch

Date: 2026-08-29

## Status

Superseded

Superseded by ADR-0097. ADR-0097 replaces GitHub App authentication with two bot-owned fine-grained PATs while retaining this record's Actions-only workflow-dispatch transport.

Partially supersedes ADR-0095's repository-dispatch transport and dispatch-App authentication clauses. ADR-0095's independent evidence validation, sequence safety, publication authority, protected-branch behavior, and human-only merge decision remain accepted.

## Context

ADR-0095 connects a successful stable Prism release to the adapter catalogue publisher through `repository_dispatch`. The implemented Prism and publisher workflows use incompatible event names and payload fields, so the publisher rejects Prism's release notification.

The mismatch exposed a more important authority problem. GitHub's current server-to-server permission data assigns creation of a repository dispatch event to `Contents: write`. A Prism release token with that permission in `kyaulabs/prism-adapters` can do more than wake the publisher: it has repository contents authority in the repository whose branches and publication state Prism must not control.

GitHub assigns workflow dispatch to `Actions: write`. The publisher already owns a closed `workflow_dispatch` release input contract and validates all release evidence independently. Calling that fixed interface removes contents authority from the Prism runtime without making event data authoritative.

Installation tokens can be narrowed to selected repositories and a subset of the App's granted permissions, but the App credential can mint any authority granted to that App installation. Reusing the publisher App in Prism would therefore collapse dispatch and publication custody even when each workflow requests a narrower runtime token.

The dispatch credential, publisher credential, signing key, and signing passphrase remain production credential state. Agents, pull requests, untrusted jobs, tests, logs, artifacts, and repository content cannot receive their values.

## Decision

We notify the adapter catalogue publisher through its existing workflow-dispatch release interface.

The Prism release workflow targets the fixed `kyaulabs/prism-adapters` publication workflow on `main`. It supplies exactly the publisher's closed release inputs: release mode, stable version, and immutable Prism merge commit. Event data cannot select the repository, workflow, ref, compatibility, package, registry, sequence, publication branch, or signing input.

A dedicated dispatch GitHub App is separate from the publication GitHub App. The dispatch App is installed only on `kyaulabs/prism-adapters` and grants Actions write authority without repository contents, pull-request, merge, administration, release, npm, or unrelated repository authority. Prism mints a one-hour installation token narrowed to that repository and Actions write permission.

The Prism notification job uses a dedicated protected environment restricted to trusted `main` release execution. The environment stores the dispatch App credential; its numeric App ID is non-secret configuration. Pull-request workflows, preceding release jobs, reusable workflows, and unrelated jobs receive no dispatch credential.

The publisher continues to use its separate publication App, protected `catalogue-signing` environment, independent evidence validation, synthetic-key tests, signing custody, sequence-specific work branches, and human-merged pull requests under ADR-0094 and ADR-0095.

Actions write authority can operate on more than one Actions endpoint. We accept that residual scope with these controls: a separate App identity, one selected repository, a fixed workflow and `main` ref in reviewed code, protected-environment credential scope, immutable action pins, short-lived narrowed tokens, default-branch workflow protection, read-only readiness checks, and drift tests that reject alternate workflows, refs, permissions, or inputs.

Human maintainers provision Apps, environments, credentials, retention, variables, and activation. Prism provides a detailed runbook and read-only readiness operation that reports API-visible drift without requesting credential values. Controls that GitHub cannot prove through the maintainer's read-only API view remain explicit manual attestations. Production activation is the final human step and remains disabled until both default branches and every readiness control are verified.

## Consequences

- **Positive:** Prism release runtime loses repository contents authority in the adapter publisher.
- **Positive:** Dispatch and publication credential compromise have separate blast radii and rotation paths.
- **Positive:** Prism and the publisher share one existing closed release-trigger interface.
- **Positive:** Publisher evidence remains independently reconstructed; workflow-dispatch inputs remain trigger hints rather than authority.
- **Positive:** Readiness can report missing administration without exposing or validating secret values.
- **Negative:** Two GitHub App identities, two protected environments, separate credentials, and separate rotation procedures increase operational work.
- **Negative:** Actions write permission is broader than one workflow-dispatch endpoint; the decision relies on reviewed fixed-target code and protected credential custody as compensating controls.
- **Negative:** Some App grants, administrator access, retention, and offline recovery controls require manual verification because repository API metadata cannot prove them completely.
- **Neutral:** The publisher's daily schedule, verified three-day renewal gate, six-day validity window, signing behavior, sequence allocation, branch publication, and human merge remain unchanged.
- **Neutral:** Agents still cannot administer GitHub Apps, environments, secrets, rulesets, retention, protected branches, or production activation.

## Alternatives Considered

### Align the existing repository-dispatch schema

Rejected because it would repair interoperability while retaining Contents write authority in the Prism release runtime.

### Reuse the publication App with a narrowed dispatch token

Rejected because the App credential stored in Prism could mint any permission granted to the shared installation, collapsing dispatch and publication custody despite runtime token narrowing.

### Use `GITHUB_TOKEN`

Rejected because the Prism repository token has no cross-repository authority in `kyaulabs/prism-adapters`.

### Keep repository dispatch and rely on branch rules

Rejected because branch rules protect selected refs but do not turn Contents write into endpoint-specific dispatch authority. The token would still exceed the intended runtime boundary.

### Add a custom dispatch service

Rejected because it would introduce another hosted trust boundary, credential protocol, availability dependency, and operational owner when GitHub's existing workflow-dispatch permission provides the required separation.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
