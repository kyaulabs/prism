# Spec: Catalogue Publication Provisioning

**Date:** 2026-08-29
**Status:** Draft

## Problem Statement

The signed adapter catalogue workflows now exist in Prism and the adapter publisher, but their release-notification contracts do not agree. Prism emits a repository dispatch with one event and field vocabulary, while the publisher accepts another. The current dispatch also requires `Contents: write`, which exceeds the dispatch-only authority required for the Prism release runtime.

The repositories are not ready for production publication. The protected signing environment, App credentials, signing secrets, activation control, and short retention policy remain unprovisioned. Maintainers need a precise setup procedure and a read-only readiness check that identifies missing controls without retrieving credential values. Production activation must remain blocked until the corrected workflows are on protected default branches and every manual custody check is complete.

## Solution

Prism will notify the existing publisher workflow through `workflow_dispatch`. The dispatch runtime will use a dedicated GitHub App token narrowed to the adapter repository and `Actions: write`; it will not receive repository contents or pull-request authority. The request will target the trusted `main` publisher workflow and carry only release mode, stable version, and immutable merge commit inputs already accepted by the publisher.

Dispatch and publication will use separate GitHub App identities. The dispatch App will provide only the publisher-workflow trigger authority used by Prism. The publication App will remain installed only on the adapter repository with repository contents and pull-request write access for its protected publication step. Neither App will receive merge, administration, release, npm, or unrelated repository authority.

Human maintainers will provision two protected environments. Prism's dispatch environment will expose the dispatch App credential only to the trusted release-notification job. The adapter repository's `catalogue-signing` environment will hold the encrypted signing key, its separately protected passphrase, and the publication App credential. Both repositories will retain pull-request-only `main` rules with no workflow bypass actor. Production activation will remain absent or disabled until environment restrictions, App installations, secret scopes, workflow revisions, retention, and recovery custody pass review.

Prism will provide a read-only readiness operation and a detailed operator runbook. The operation will inspect only GitHub administration metadata available to the authenticated maintainer, report each missing or drifted control, and emit no credential values. Controls that GitHub does not expose through the maintainer's read-only API view, including App registration grants and retention settings, will remain explicit manual checks. Readiness output and retained provisioning evidence will contain only non-secret identifiers, permission names, and status.

## User Stories

1. As a release maintainer, I want Prism to invoke the publisher through one closed workflow-dispatch contract, so that stable release evidence reaches the publisher without schema drift.
2. As a security maintainer, I want the Prism dispatch token to have Actions authority without repository contents authority, so that the release runtime cannot modify publisher branches.
3. As a security maintainer, I want dispatch and publication to use separate App identities, so that compromise of one App credential does not grant the other runtime's authority.
4. As a publisher maintainer, I want production signing secrets available only to trusted `main` workflow code after unprivileged validation passes, so that pull requests and untrusted jobs cannot sign a catalogue.
5. As a publisher maintainer, I want the encrypted signing key and passphrase stored separately, so that disclosure of one secret does not immediately yield usable signing authority.
6. As a repository maintainer, I want protected `main` branches with no workflow bypass actors, so that automation cannot push or merge protected branches.
7. As an operator, I want publication disabled until every workflow, environment, credential scope, App grant, retention setting, and recovery control has been reviewed, so that partial setup cannot activate production signing.
8. As an operator, I want a read-only readiness check with precise diagnostics, so that I can correct missing administration without exposing credentials.
9. As an incident responder, I want separate App-credential and catalogue-signing-key procedures, so that exposure response revokes the affected authority without conflating two trust roots.
10. As a successor maintainer, I want a detailed custody and rotation runbook, so that responsibility can transfer without recording secret values or sensitive locations.
11. As a reviewer, I want provisioning evidence limited to non-secret IDs, permissions, workflow revisions, and status, so that review does not create another credential copy.
12. As a new Prism user, I want scheduled catalogue renewal to remain available after one missed run, so that strict-empty adapter discovery does not fail because of an expired catalogue.

## Implementation Decisions

### Trigger authority

- Prism will call the publisher's existing workflow-dispatch interface rather than repository dispatch.
- The target is the trusted publisher workflow on `main`; event data cannot choose another workflow or ref.
- Inputs are closed to release mode, stable release version, and immutable merge commit. Compatibility, package, registry, sequence, branch, and signing data remain forbidden.
- The dispatch App and publication App are separate identities. Installation tokens are narrowed to one repository and the minimum permission subset granted to each App.
- Prism's release-notification job uses an environment-scoped App credential. Pull-request jobs, unrelated workflows, and preceding release jobs receive no dispatch credential.

### Protected environments and activation

- Prism owns a protected dispatch environment restricted to trusted `main` release execution.
- The adapter publisher owns the existing `catalogue-signing` environment restricted to trusted `main` publication execution.
- The publisher environment stores the encrypted PKCS#8 Ed25519 key, passphrase, and publication App credential as separate secrets. App IDs and the activation switch are non-secret variables.
- Required environment reviewers remain disabled because unattended release notification and renewal are intentional. Repository and environment administrators remain part of the accepted trust base under ADR-0094.
- The activation switch remains absent or false until the complete readiness procedure passes. Disabling it is the first response to suspected publisher credential exposure.

### Branch, workflow, and retention controls

- `main` remains pull-request-only in both repositories, with signed commits, no force pushes or deletion, and no workflow bypass actor.
- Workflow actions remain pinned to reviewed immutable commits. Actions debug tracing is disabled for credential-bearing jobs.
- Publisher runs share non-cancelling serialization. The daily schedule retains the publisher's verified three-day renewal gate and six-day catalogue validity model.
- Actions log retention is seven days for the credential-bearing repositories. No signing or App credential enters logs, outputs, summaries, caches, artifacts, fixtures, issue content, or committed evidence.

### Readiness and evidence

- The readiness operation is read-only. It checks default-branch workflow presence, trigger contract, protected-environment metadata, expected secret and variable presence, activation state, branch rules, and other API-visible controls.
- Missing, unauthorized, or ambiguous metadata fails closed with a stable diagnostic. The operation never requests a secret value and does not treat secret presence as proof of correct value.
- App registration permissions, installation selection, environment administrator access, offline recovery custody, and retention settings receive explicit manual verification where GitHub's read-only repository API cannot prove them.
- Provisioning evidence records only non-secret App and installation IDs, permission names, repository selection, environment and workflow names, immutable workflow revisions, retention duration, branch-rule status, activation status, and verification time.
- The runbook separates initial provisioning, activation, routine rotation, suspected exposure, and maintainer succession. It never instructs an agent to receive or operate on production credentials.

### Security boundaries

- Assets are the catalogue signing key, its passphrase, both App credentials, protected-branch integrity, and catalogue authenticity.
- Trust boundaries are release event data, GitHub API metadata, pull-request code, default-branch workflow code, protected environments, and human administration.
- Primary abuse cases are confused-deputy dispatch, privilege escalation through broad App grants, credential exposure to untrusted jobs, direct protected-branch mutation, forged activation evidence, and secret leakage through diagnostics.
- Every readiness or publication ambiguity fails before credential use, signing, dispatch, or repository mutation.

## Testing Decisions

The first public seam is the release workflow contract. Existing release workflow tests will verify that stable publication success mints a token with only Actions write authority, targets the fixed adapter repository and trusted workflow on `main`, and sends only the publisher's accepted release inputs. Extracted negative cases will reject alternate workflows, refs, permissions, field names, and extra authority.

The second public seam is the read-only readiness operation. Shell tests will replace `gh` with deterministic fixtures and cover complete, missing, drifted, unauthorized, malformed, and ambiguous administration states. The tests will assert exact endpoint allowlists, fail-closed exit codes, redacted output, and the absence of any secret-value request or mutation.

Documentation contract tests will require the complete provisioning, activation, rotation, exposure, recovery, and succession procedure while rejecting credential values and sensitive storage instructions.

Live acceptance occurs only after a human provisions both repositories. The operator runs the same readiness check, confirms the manual controls, and performs one disabled-state trigger check that cannot enter the protected environment. The operator then enables production and reruns active-state readiness. Issue #469 owns the first credential-bearing production publication. The resulting evidence contains only non-secret identifiers, permissions, immutable revisions, and status.

## Out of Scope

- Generating, importing, reading, copying, displaying, or validating production credential values.
- Agent-driven GitHub App, environment, secret, variable, ruleset, or retention mutation.
- Changing publisher evidence validation, catalogue rendering, signing, sequence allocation, or pull-request publication behavior.
- Giving Prism repository contents or pull-request authority in the adapter repository.
- Giving either App merge, administration, release, npm, or unrelated repository authority.
- Automating npm authentication or publication.
- Bypassing protected branches, enabling auto-merge, or merging publication pull requests.
- Recording offline custody locations or other sensitive paths in repository documentation or issue content.

## Further Notes

- Originating issue: #468.
- Parent epic: #462.
- ADR-0094 defines protected Actions signing custody.
- ADR-0095 defines the cross-repository publication transaction and must be updated because the notification transport changes from repository dispatch to workflow dispatch while preserving its closed trigger-hint semantics.
- The adapter publisher already accepts the selected workflow-dispatch input contract; no publisher source change is required for the trigger correction.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
