# 0099. Trusted-main catalogue notification handoff

Date: 2026-08-31

## Status

Accepted

Extends ADR-0097's protected dispatch environment and Actions-only cross-repository workflow-dispatch transport. ADR-0046, ADR-0079, ADR-0094, ADR-0095, ADR-0097, and ADR-0098 remain accepted.

## Context

Prism release CI publishes a stable repository Release, reconciles package tags, and notifies the adapter catalogue publisher through a protected `catalogue-dispatch` environment. That environment stores the Actions-write-only dispatch PAT and permits only `main`.

The notification job currently runs in `.github/workflows/release.yml`, which is triggered by closing a release pull request into `main`. GitHub evaluates an environment's deployment branch policy from the workflow event context before assigning a runner. The release v0.4.3 notification job retained `head_branch: release/0.4.3`, failed against the environment's `main` policy, and executed no steps. Checking out the merge commit does not change that event context.

Weakening the environment would expose the dispatch PAT to release-branch workflow execution and contradict ADR-0097. Giving the release workflow new Actions-write authority in Prism would broaden permissions and create another workflow-dispatch capability. A `workflow_run` handoff would need an artifact or another durable state channel to carry validated manual-recovery inputs.

The existing publish job already has same-repository `contents: write` authority for release and package-tag publication. GitHub permits `repository_dispatch` events created with `GITHUB_TOKEN` to start another workflow. Repository-dispatch workflows load from the default branch, providing the trusted `main` context required by the protected environment. ADR-0096 rejected cross-repository repository dispatch because it would grant Contents write in `kyaulabs/prism-adapters`; a same-repository handoff using Prism's existing authority does not cross that rejected boundary.

## Decision

We split release evidence validation from credential-bearing catalogue notification with one same-repository event handoff.

After stable repository Release publication and package-tag reconciliation succeed at the validated merge commit, the managed release workflow emits a fixed `repository_dispatch` event to `kyaulabs/prism`. The handoff uses the publish job's existing `GITHUB_TOKEN` and adds no permission. It carries only a schema version, exact source repository, stable release version, and immutable merge commit. It remains reachable after a back-merge pull-request failure, and explicit release recovery emits the same idempotent event.

A separate Prism-specific workflow triggers only on that fixed event type. GitHub loads it from protected `main`; its sole notification job enters `catalogue-dispatch`, receives no `GITHUB_TOKEN` permission, and exposes `CATALOGUE_DISPATCH_TOKEN` only to the fixed publisher workflow-dispatch step.

The notification workflow treats the local event as untrusted trigger data. It requires an exact closed payload, exact Prism source identity, stable SemVer, and a lowercase 40-hex merge commit before publisher API access. The destination repository, workflow, ref, mode, credential, and input names remain fixed in reviewed default-branch code. The publisher continues to reconstruct release, package, npm, signing, sequence, and publication authority independently.

The local repository-dispatch failure and the cross-repository workflow-dispatch failure remain visible as separate failed workflow runs. Duplicate events are safe under the publisher's existing idempotency and sequence rules. Prereleases and unsuccessful or partial release states do not emit the local event.

The new notification workflow belongs only to the Prism repository. It does not become a Core package-release provider output and is not installed in downstream consumers. Catalogue-publication readiness requires both the managed release workflow and the Prism-specific notification workflow to exist on `main` before activation or publication.

The `catalogue-dispatch` environment remains restricted to `main`; the active `main` ruleset retains no bypass actor. The dispatch and publication PATs, signing authorities, human npm publication, human pull-request merges, and no-agent-push boundary remain unchanged.

## Consequences

- **Positive:** the dispatch PAT is exposed only to workflow code running in a context accepted by the `main`-only environment.
- **Positive:** release CI keeps its existing permission map and gains no credential, third-party action, or artifact transport.
- **Positive:** automatic release and manual recovery use one validated, idempotent handoff.
- **Positive:** downstream package-release consumers do not receive Prism's catalogue integration.
- **Negative:** one release produces two Prism workflow runs, so release handoff and publisher dispatch have separate conclusions and diagnostics.
- **Negative:** the same-repository event is an additional trust boundary that requires closed-payload validation, drift tests, and readiness checks.
- **Negative:** a successful local handoff cannot guarantee that the asynchronous protected notification run succeeds; recovery must inspect and rerun the failed boundary.
- **Neutral:** publisher evidence validation treats the event as a wake-up signal rather than authority.
- **Neutral:** npm availability can still delay catalogue publication until a scheduled or manual publisher retry.
- **Neutral:** no dependency, credential, token scope, protected-branch exception, or automated merge is added.

## Alternatives Considered

### Keep notification in the pull-request workflow

Rejected. The job cannot satisfy the `main`-only environment because GitHub checks the immutable pull-request event context before any checkout or step.

### Weaken or bypass the environment branch policy

Rejected. It would expose the dispatch PAT outside trusted default-branch workflow execution and contradict ADR-0097.

### Dispatch a second Prism workflow with Actions write

Rejected. It would add Actions-write authority to Prism's release runtime despite an available same-repository handoff using the existing permission map.

### Use `workflow_run` with an artifact

Rejected. It would add artifact transport, action pins, permissions, retention concerns, and another validation surface solely to carry version and merge-SHA values. Manual historical recovery would also require preserving inputs not present in the downstream run context.

### Send repository dispatch directly to the publisher

Rejected. ADR-0096 removed that transport because it requires Contents write in `kyaulabs/prism-adapters`. The local event may wake only trusted Prism default-branch code; cross-repository transport remains Actions-only workflow dispatch.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
