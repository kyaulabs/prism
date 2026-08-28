# 0083. Strict-empty setup acquisition authorization

Date: 2026-08-23

## Status

Superseded by ADR-0092.

Supersedes ADR-0076. Extends ADR-0063, ADR-0074, ADR-0075, ADR-0079, and
ADR-0082.

## Context

ADR-0076 defines one invocation-scoped setup-network authorization for package
resolution, audits, locked dependency population, selected Prism package
acquisition, and declared browser downloads. It deliberately excludes arbitrary
URLs, Git remotes, authenticated APIs, credentials, web search, OCR, GitHub
mutation, and project-file mutation.

Strict-empty project setup adds two effects that ADR-0076 does not authorize.
Template mode must read bounded public object data from the fixed
`kyaulabs/template` repository and pin the moving default branch to immutable
commit, tree, and manifest evidence. An empty project may also select an exact
adapter from Core's supported catalogue before project-local package state or
stack evidence exists.

Asking again whether to install the exact displayed adapter would repeat the
selection decision, but treating adapter selection or `/setup` invocation as
general package or filesystem permission would broaden authority beyond the
reviewed candidate. Template acquisition must likewise remain a fixed,
unauthenticated object-reading capability rather than permission for GitHub,
Git transport, redirects, archives, private repositories, or caller-selected
URLs.

The successor must preserve established-project adapter installation behavior,
the separate complete-project-plan mutation gate, separate hook activation,
standing OCR consent, and human-owned repository publication.

## Decision

Invoking `/setup` creates one disclosed, invocation-scoped, non-persistent
**setup-network attempt**. The attempt ends when setup completes or stops. A
later invocation creates a new authorization and Prism stores no standing setup
network consent.

Before the first network effect, setup discloses the bounded effects available
to the selected route. The authorization may cover only:

- acquisition of the explicitly selected Prism Core package or the exact
  selected project-local adapter package;
- Composer and npm registry resolution and audit of a validated active
  adapter's declared candidate graph;
- deterministic population from approved committed lockfiles with lifecycle
  scripts disabled;
- download of browser targets declared by the validated adapter contract,
  initially Playwright Chromium; and
- in strict-empty Template mode, the fixed unauthenticated HTTPS object
  sequence required to inspect public `kyaulabs/template` repository metadata,
  validate its default branch, resolve one immutable commit and complete tree,
  and acquire the classification manifest by immutable object identity.

Template acquisition is Core-owned and accepts no repository coordinate, host,
URL, branch, ref, object identity, header, credential, or transport chosen by
the caller. It enforces bounded responses and a fixed public endpoint sequence.
Authentication, redirects, Git clone/fetch/pull, archives, private repositories,
arbitrary blob acquisition, web search, and fallback sources are prohibited.
Fetched data remains untrusted and cannot execute or become project bytes.

On the strict-empty path, selecting a validated catalogue adapter explicitly
authorizes both network acquisition and provisional project-local installation
of that exact displayed package and version. No second adapter-installation
question is asked. The authorization does not transfer to another package,
version, provider, dependency, command, or registry and ends if validation
finds an identity, version, protocol, registration, handler, or containment
mismatch.

Provisional installation is part of ADR-0082's outer bootstrap transaction.
Before durable project application, decline or caught failure may remove only
ownership-proven package and settings state and must restore strict emptiness.
Adapter selection does not authorize the combined project plan, hook activation,
Git creation, or root commit. Those effects retain their own accepted workflow
and approval boundaries.

Established projects retain their existing explicit adapter-installation
question and evidence-driven adapter discovery. They never receive Template
network access or strict-empty provisional-install semantics merely by invoking
setup.

Setup-network authorization never covers:

- standing OCR consent, OCR connectivity, or reviewed-code egress;
- authenticated GitHub access or GitHub issue, pull-request, ruleset, release,
  label, repository-administration, or publication operations;
- Git remote creation, clone, fetch, pull, push, or any inherited remote state;
- caller-selected, private, or non-KYAULabs template sources;
- redirects, archives, arbitrary URLs, web search, or other external APIs;
- provider authentication, credentials, secrets, or identity/signing material;
- package lifecycle scripts or undeclared package-manager passthrough;
- global preferences or unrelated global package mutation; or
- project, hook, repository, or commit mutation not separately authorized by
  its accepted workflow.

Validated contracts, exact versions, allowlists, audits, lifecycle-script
prohibition, bounded subprocess execution, sanitized diagnostics, and
credential boundaries remain in force. Global Core installation continues to
obey ADR-0075's exclusive-source reconciliation. Optional package-release
capability remains subject to ADR-0079 and is not enabled by network authority
or package discovery.

## Consequences

- **Positive:** Template mode can acquire immutable public capability evidence
  without granting general GitHub, Git, archive, or URL access.
- **Positive:** explicit adapter selection is sufficient authorization for one
  exact provisional installation and avoids a redundant question.
- **Positive:** setup networking remains attempt-scoped, non-persistent,
  allowlisted, contract-bound, and independently testable.
- **Positive:** established-project setup and its adapter-installation approval
  remain unchanged.
- **Negative:** the setup disclosure and launcher must distinguish route-specific
  effects and prove that no unselected effect occurred.
- **Negative:** Core owns a fixed remote object protocol whose endpoints,
  response bounds, immutable evidence, and fail-closed behavior require
  dedicated regression fixtures.
- **Negative:** provisional package/settings cleanup becomes part of strict-empty
  transaction recovery and must preserve concurrent or ambiguous human state.
- **Neutral:** invoking setup may still contact approved registries and browser
  distribution infrastructure without separate per-stage network questions.
- **Neutral:** project mutation, hooks, OCR, GitHub operations, remotes, pushes,
  and publication keep their independent authority boundaries.

## Alternatives Considered

### Keep ADR-0076 and ask separate Template and adapter network questions

Rejected because the selected setup route and exact displayed adapter already
express those bounded transport decisions, while repeated questions add no new
choice.

### Treat `/setup` as general HTTPS or GitHub authorization

Rejected because it would allow unrelated APIs, repositories, redirects,
credentials, and URLs beyond the fixed public object-reading requirement.

### Use Git clone or an archive download for Template mode

Rejected because those transports acquire unneeded project bytes and metadata,
expand parser and path-application risk, and blur the prohibition on inherited
history and remote project content.

### Authorize adapter download but ask separately before provisional install

Rejected on the strict-empty path because selection names the exact package and
purpose. The complete generated project still retains its separate plan gate.

### Apply strict-empty adapter-selection semantics to established projects

Rejected because established projects have evidence, existing state, and an
accepted explicit installation contract that this decision does not reopen.

### Persist standing setup-network consent

Rejected because setup effects are occasional, route-specific, and
project-specific. A standing grant would be broader and harder to reason about
or revoke.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
