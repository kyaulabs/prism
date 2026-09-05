# 0105. Established-project manifest and Core-only composition

Date: 2026-09-04

## Status

Accepted

Extends ADR-0078, ADR-0084, and ADR-0100.

## Context

ADR-0100 makes Core back-merge automation and canonical hooks applicable to
every Git-backed Prism project. Adapter quality automation applies only when
one validated active adapter declares it. ADR-0084 already treats a null
adapter as an explicit Core-only state for strict-empty bootstrap, hook
dispatch, and quality checks.

The established-project coordinator does not preserve that distinction. It
always calls required adapter discovery before it can inspect Core automation.
A repository with no active adapter therefore returns `NO-GO / CONFLICT`, even
though Core-only is a supported composition. The CLI then replaces the discovery
failure with a generic message that does not identify the failed provider or
prerequisite.

Established setup has a second ordering gap. Canonical hook wrappers require a
validated `.prism/project.json`, but the established route can activate those
wrappers without first creating a manifest. The next commit then fails before
it can establish the missing state. Strict-empty manifests cannot be copied
unchanged into this route because their `source` field attests a Blank or
Template bootstrap that did not occur.

A fix must preserve explicit Core-only operation without treating malformed or
ambiguous adapter evidence as absence. It must also create durable established
project identity before hooks become active, without inferring metadata,
overwriting human state, or weakening ADR-0100's approval, ownership, rollback,
and verification boundaries.

## Decision

We represent established Core-only operation as a first-class provider
composition and include project-manifest creation in the established desired-
state transaction.

### Composition and discovery

The automation coordinator always renders applicable Core providers. It uses
optional adapter discovery and appends adapter quality automation only when one
validated registration exists. Genuine absence selects `CORE_ONLY` and invokes
no adapter package, handler, quality command, or synthetic no-op provider.

Missing adapter evidence is distinct from invalid evidence. Multiple
registrations, malformed settings, escaping or symlinked package paths,
identity mismatch, unsupported contracts, and incomplete automation handlers
remain bounded `NO-GO` results. Inspection reports a closed composition value
of `CORE_ONLY` or `ADAPTER` and stable provider, output, or prerequisite checks.
It never returns raw exception text, arbitrary paths, or subprocess output.

### Established project manifest

A missing manifest in an established repository is an applicable Core-owned
output, not permission to infer project identity. Setup gathers the existing
normalized project metadata fields and an explicit composition choice before
planning mutation.

The established manifest uses project-manifest schema version two. It retains
the closed top-level project, capability, nullable adapter, and compatibility
records used by schema version one. Its source record is exactly:

```json
{"mode":"ESTABLISHED","evidence":null}
```

`ESTABLISHED` records route provenance only. They do not claim bootstrap,
repository-content, remote, branch, or commit provenance. The adapter field is
`null` for Core-only. When an adapter is selected, Core derives its exact
identity from validated project-local evidence rather than caller-supplied
package data.

Valid schema-one Blank and Template manifests remain supported and are not
rewritten merely because their project now has Git history. A missing manifest
may be created as schema two. A supported owned manifest may be updated only
through an explicit displayed migration. An unowned, malformed, customized,
symlinked, non-regular, unsupported, or ownership-ambiguous manifest is a
conflict and remains untouched.

### Transaction and activation order

The established automation plan includes the Core project-manifest provider
alongside applicable Core, adapter, and selected release providers. The plan
binds normalized metadata, composition, exact provider identities, candidate
bytes and modes, ownership dispositions, and the existing Git precondition.

One explicit project-mutation approval applies the complete displayed
established plan through ADR-0100's private journal, stale-state checks, atomic
publication, exact rollback, and bounded recovery rules. Verification rereads
the manifest without following symlinks, validates its closed schema and exact
Core and optional adapter identity, and revalidates every automation provider.

Canonical hook reconciliation remains a separate approval. Setup may offer it
only after the manifest and every applicable project-file provider verify
current. Hook dispatch reads the verified manifest, skips adapter quality when
the adapter is null, and fails closed on missing, stale, malformed, or
identity-incoherent evidence.

The established setup order is:

```text
route and local preflight
-> explicit composition and metadata
-> adapter/toolchain verification when applicable
-> inspect and plan complete established desired state
-> approve, apply, and verify project files
-> separately approve and verify canonical hooks
```

This decision does not add source-checkout routing. Prism checkout recognition
and preservation of repository-specific automation remain in issue #501.

## Consequences

- **Positive:** Core-only repositories can inspect, plan, apply, and verify Core
  automation without installing or invoking a stack adapter.
- **Positive:** established setup cannot activate canonical hooks before their
  project manifest exists and verifies.
- **Positive:** one transaction binds manifest identity to the same provider,
  ownership, Git-snapshot, rollback, and recovery evidence as automation.
- **Positive:** malformed or ambiguous adapter state remains distinguishable
  from valid adapter absence and fails closed.
- **Negative:** project-manifest schema version two and the automation report's
  composition field become compatibility surfaces requiring closed validation,
  migration tests, and package documentation.
- **Negative:** the established transaction gains normalized metadata input and
  one additional Core provider.
- **Neutral:** valid schema-one bootstrap manifests remain authoritative; there
  is no blanket in-place migration.
- **Neutral:** Core remains language-agnostic, hook approval remains separate,
  and no dependency, network authority, credential access, commit, push, or
  merge capability is added.

## Alternatives Considered

### Require every established project to install an adapter

Rejected because ADR-0084 and ADR-0100 define Core-only as a real composition.
A synthetic or mandatory adapter would move language-specific assumptions into
Core and prevent Node or policy-only repositories from using Prism.

### Treat every adapter-discovery error as Core-only

Rejected because malformed, ambiguous, substituted, or escaping adapter
evidence must not silently disable stack quality gates.

### Let hook dispatch infer Core-only when the manifest is absent

Rejected because absence would become authority and canonical hooks could run
without durable project identity, Core-version binding, or an approved setup
transaction.

### Write the manifest in a separate unjournaled setup step

Rejected because a partial failure could leave identity and automation from
different snapshots, and it would add another project-mutation approval and
rollback boundary.

### Mark an established repository as a Blank bootstrap

Rejected because it records provenance that did not occur and makes project
metadata evidence semantically false.

### Wait for source-checkout routing before correcting Core-only composition

Rejected because source-checkout preservation is a separate applicability
problem. Core-only consumer repositories can be made coherent without deciding
how Prism recognizes itself.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
