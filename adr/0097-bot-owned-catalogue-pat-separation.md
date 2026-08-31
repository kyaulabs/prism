# 0097. Bot-owned catalogue PAT separation

Date: 2026-08-29

## Status

Accepted

Supersedes ADR-0096's GitHub App identity, App credential, and installation-token decisions. Retains ADR-0096's Actions-only workflow-dispatch transport, fixed publisher target, protected dispatch environment, and closed trigger inputs.

## Context

ADR-0096 separates Prism dispatch from publisher mutation through two GitHub App identities. The required operating model instead assigns automation authentication to the `kyaulabs-bot` account through fine-grained personal access tokens.

A fine-grained PAT is bearer authority owned by one account. If one PAT grants Actions, Contents, and Pull Requests write access to `kyaulabs/prism-adapters`, the Prism release job can exercise the publisher mutation authority that ADR-0095 keeps independent. Account ownership does not remove the need for credential-level authority separation.

Two existing fine-grained PATs have resource owner `kyaulabs`, select only `kyaulabs/prism-adapters`, and carry separate permission profiles. Both are non-expiring and have no planned rotation. That posture increases exposure duration and recovery dependence compared with expiring, rotated, or installation-scoped credentials. The operator accepts that debt for simplicity and expects a later refactor.

PAT values remain credential state. Agents, source, tests, issues, logs, artifacts, readiness evidence, and pull-request code cannot receive them. GitHub's API cannot reveal a stored Actions secret value or independently prove all human-reviewed fine-grained PAT settings without using the credential.

## Decision

We use two separately scoped fine-grained PATs owned by `kyaulabs-bot`.

The dispatch PAT has resource owner `kyaulabs`, selects only `kyaulabs/prism-adapters`, and grants Actions write only. Prism stores it as protected-environment secret `CATALOGUE_DISPATCH_TOKEN` and exposes it only to the fixed publisher workflow-dispatch step.

The publication PAT has resource owner `kyaulabs`, selects only `kyaulabs/prism-adapters`, and grants Contents write plus Pull Requests write only. The publisher stores it as protected-environment secret `CATALOGUE_PUBLICATION_TOKEN` and exposes it only to the protected publication command after evidence validation, signing, and reverification.

One combined PAT is prohibited. Either credential becomes invalid for readiness if it gains the other profile's write permission, another repository, another resource owner, or unrelated authority. A future request for one combined credential requires a new explicit security-boundary decision.

The Prism workflow removes GitHub App token minting and uses the dispatch PAT directly as the `GH_TOKEN` for one fixed API call. The publisher removes App JWT construction, installation discovery, and installation-token minting and uses the publication PAT directly as opaque bearer authority. Neither workflow assumes a token prefix, persists the PAT, passes it in command arguments, or emits it in diagnostics.

Human maintainers attest only non-secret metadata: credential type, credential owner, resource owner, selected repository, permission map, null expiration, and rotation policy `NONE_ACCEPTED`. Readiness fails on missing or over-broad authority. It reports non-expiry and no rotation as non-blocking `ADVISORY` checks so the accepted debt remains visible.

Both PATs remain non-expiring and have no scheduled rotation in this decision. Suspected exposure immediately disables production, revokes the affected PAT, reviews account and repository authority plus audit evidence, replaces only that credential, and reruns complete readiness. Future expiration, rotation, or machine-identity changes require reviewed follow-up work.

`CATALOGUE_SIGNING_ENABLED` remains absent throughout migration. Publisher direct-PAT support reaches protected `main` before Prism dispatch credentials are activated. Issue #469 owns the first production publication.

## Consequences

- **Positive:** authentication is owned by the requested `kyaulabs-bot` account.
- **Positive:** separate PATs preserve dispatch and publication authority boundaries.
- **Positive:** Prism dispatch has no Contents or Pull Requests write authority.
- **Positive:** publisher mutation has no Actions write authority.
- **Positive:** workflow code becomes simpler by removing App JWT and installation-token mechanics.
- **Negative:** PATs are long-lived bearer credentials rather than short-lived installation tokens.
- **Negative:** non-expiring credentials with no scheduled rotation increase exposure duration and make manual revocation more important.
- **Negative:** GitHub cannot prove all token scope metadata to readiness without credential use, so exact scope remains a human attestation.
- **Negative:** account compromise can affect both credentials even though their permission profiles remain separate.
- **Neutral:** protected environments, signing-key custody, independent evidence validation, sequence safety, and human-only merges remain unchanged.
- **Neutral:** no agent gains GitHub administration or credential access.

## Alternatives Considered

### One combined fine-grained PAT

Rejected because the Prism release job would gain publisher Contents and Pull Requests write authority, collapsing the accepted trust boundary.

### Keep separate GitHub Apps

Rejected because the required operating model assigns authentication ownership to `kyaulabs-bot`.

### Expiring PATs with scheduled rotation

Recommended for risk reduction but rejected for the current implementation by explicit operator choice. The absence of expiration and rotation remains visible advisory debt.

### Classic PATs

Rejected because broad scopes cannot express the selected-repository and separate permission profiles required by this decision.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
