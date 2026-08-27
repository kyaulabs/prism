# 0082. Provider-composed empty-project bootstrap

Date: 2026-08-23

## Status

Accepted

Extends ADR-0058, ADR-0060, ADR-0070, ADR-0073, ADR-0075, ADR-0078, and
ADR-0079.

## Context

The accepted setup architecture can reconcile an established project's active
adapter, apply an adapter-owned testing scaffold, install canonical Core hooks,
verify quality, and produce a signed initial seed. A strictly empty project root
contains no trustworthy stack evidence, active project-local adapter, project
metadata, or existing transaction state from which that workflow can begin.

A maintained KYAULabs template can advertise a useful starting surface, but a
moving remote repository is not a trusted project generator. Importing its
bytes, history, hooks, scripts, package choices, or policy would allow remote
state to cross Core's ownership and execution boundaries. A blank starting mode
has the same composition problem without the remote catalogue.

ADR-0058 and ADR-0060 require Core to remain language-agnostic and adapters to
remain project-local owners of stack behavior. Established-project setup
already uses an adapter-owned candidate transaction and candidate workspace.
Redefining those terms for empty-project orchestration would hide a wider
transaction that also owns source evidence, provisional package state, project
metadata, optional language-agnostic profiles, plan approval, durable
application, rollback, and recovery.

The strict-empty path therefore needs one Core-owned composition boundary that
can select an exact supported adapter or an explicit adapterless result, invoke
only trusted package-owned renderers, reject ownership overlap, and present one
complete project plan without changing established-project behavior.

## Decision

We adopt a Core-owned **empty-project bootstrap transaction** for canonical
project roots that are strictly empty and belong to no existing or containing
Git worktree.

### Entry routing and catalogue ownership

Core classifies the project before setup routing. A strict-empty root receives
Template, Blank, and Cancel choices. Every other supported project continues
through the existing evidence-driven setup path and adapter-owned candidate
transaction unchanged.

Core ships schema-versioned closed catalogues for supported adapters,
capabilities, and trusted providers. A supported-adapter record contains a
stable ID, display name, exact project-local package identity and version, and
compatible bootstrap protocol version. Empty-project setup accepts no inferred,
caller-entered, registry-discovered, unversioned, or non-catalogued adapter.

Adapter absence is represented by a nullable adapter identity and an explicit
`CORE_ONLY` disposition. Core does not install or invoke a synthetic no-op
adapter. Core-only projects skip adapter package acquisition, dependency
population, stack checks, and adapter verification while retaining applicable
Core project, hook, quality, and seed policy.

### Provider boundary

Core owns the language-agnostic baseline, metadata broker, project metadata
manifest, supported optional-profile renderers, provider registry, report
validation, ownership composition, combined plan, application journal, and
recovery orchestration.

A selected adapter remains the sole owner of stack-specific scaffold files,
manifests, locks, dependencies, source and test layout, ignore policy, generated
CI, toolchain requirements, checks, and verification. Core passes normalized
choices and a launcher-designated attempt location through one generic
empty-project preparation interface. The adapter returns a closed bounded
report; Core does not absorb or reproduce stack behavior.

Trusted Core, adapter, and optional-profile providers accept only normalized
source mode, selected capability IDs, approved metadata, nullable adapter
identity, and launcher-designated paths. They return schema-versioned reports
containing bounded owned paths, kinds, modes, digests, toolchain requirements,
checks, and verification entry points. Unknown schemas, fields, identities,
states, paths, commands, or protocol versions fail closed.

The public `kyaulabs/template` manifest is untrusted catalogue data. After
immutable fixed-source validation, it may classify advertised capabilities and
select allowlisted provider IDs. It may not provide project bytes, executable
renderers, output paths, package coordinates, scripts, defaults, metadata, or
automatic capability selection. No remote template blob becomes a generated
project file or executes.

Template and Blank normalize into the same provider request, provider-report,
and combined-plan contracts. Source selection cannot change provider ownership
or application mechanics.

### Composition and mutation

Core rejects exact-path and prefix ownership overlap before displaying a plan.
It composes the validated Core baseline, committed project metadata, selected
optional-profile reports, project-local Pi activation state, and optional
adapter report into one closed digest-bound candidate plan.

The plan displays source disposition and immutable evidence, adapter or
Core-only selection, capabilities, public metadata, provider identities and
versions, complete path dispositions, dependency and browser effects, checks,
and recovery semantics. Only literal approval of that complete plan authorizes
durable project mutation. Source selection, adapter selection, provisional
installation, and setup-network authorization do not imply plan approval.

The launcher applies only the active attempt's plan after revalidating its
digests, provider reports, metadata, source evidence, and filesystem state.
Stale, substituted, caller-selected, overlapping, or changed state fails
closed.

### Transaction and recovery

The bootstrap workspace is a distinct Core-owned outer transaction boundary,
not a renamed adapter candidate workspace. Its transient state remains beneath
existing Core-owned project-local operational and safe-cleanup surfaces; this
decision adds no new safe directory.

A versioned journal records preparation, application, durable,
post-application, and complete phases. Before durable project application,
decline or caught failure removes or restores only exact attempt-owned source,
package/settings, provider, candidate, and plan state, then proves the original
root is empty. An unrecorded third filesystem state is preserved for manual
recovery rather than deleted.

Durable application atomically establishes the complete approved project tree
and inventory before Git exists. Failures after that point retain the complete
project and journal and return one deterministic resume phase. A later setup
attempt must revalidate the journal, applied inventory, providers, metadata,
and source evidence before continuing. There is no automatic Template-to-Blank
fallback, capability fallback, or provider substitution.

This decision adds no Pi extension, external dependency, archive parser,
template engine, arbitrary package-discovery service, Git transport, or new
stack adapter. Fixed multi-step mechanics remain behind the public `prism-tool`
launcher under ADR-0070 and prompts retain safety-compatible commands under
ADR-0073.

## Consequences

- **Positive:** strict-empty projects can select a supported stack or explicit
  Core-only result without inference from nonexistent evidence.
- **Positive:** all generated project bytes come from validated installed
  providers with explicit non-overlapping ownership.
- **Positive:** Template and Blank share one plan, mutation, rollback, recovery,
  and verification architecture.
- **Positive:** established-project setup and its adapter-owned candidate
  transaction remain behaviorally unchanged.
- **Positive:** remote template content is reduced to an untrusted capability
  catalogue and never becomes executable policy or project bytes.
- **Negative:** Core gains catalogues, provider protocols, metadata persistence,
  composition validation, an outer journal, rollback ownership, and recovery
  interfaces that must remain schema-versioned and fail closed.
- **Negative:** every adapter that supports empty-project creation must expose
  and test the generic preparation/report protocol in addition to its existing
  established-project operations.
- **Negative:** provisional project-local package activation must be proven
  transaction-owned so strict emptiness can be restored safely.
- **Neutral:** adapters continue to own all stack-specific scaffold and quality
  behavior; Core-only deliberately has no equivalent stack surface.
- **Neutral:** remote creation, pushes, pull requests, rulesets, releases, and
  publication remain outside setup.

## Alternatives Considered

### Copy the public template repository

Rejected because it would import moving remote bytes, history, hooks, scripts,
policy, and ownership assumptions across the project trust boundary.

### Let the template manifest describe files and renderers

Rejected because untrusted remote data would control output paths, package
selection, project content, or executable behavior. The manifest is limited to
classification and allowlisted provider advertisement.

### Infer an adapter after creating baseline files

Rejected because generated evidence would make Core's own output decide stack
ownership and would hide the user's adapter choice.

### Require an adapter and represent Core-only with a no-op adapter

Rejected because it makes absence ambiguous, complicates evidence and hook
routing, and creates an artificial package and protocol participant.

### Let each adapter own the entire empty-project transaction

Rejected because source acquisition, optional language-agnostic profiles,
metadata, plan approval, strict-empty rollback, Git ordering, and recovery are
Core concerns shared by every stack.

### Reuse the established-project candidate transaction as the outer transaction

Rejected because that transaction owns adapter manifests and lockfiles, not
source evidence, provisional package settings, Core/profile outputs, combined
plan approval, or byte-for-byte empty-root restoration.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
