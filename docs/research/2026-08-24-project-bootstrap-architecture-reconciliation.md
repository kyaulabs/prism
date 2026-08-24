# Project-bootstrap architecture reconciliation

## Summary

The empty-directory setup effort should replace the approved testing-ready
bootstrap specification as the single active `/setup` bootstrap contract while
preserving its settled adapter scaffold, generated CI, hook, quality, signed
seed, and human-publication mechanics.

The replacement changes only the strict-empty entry path and the architecture
needed to compose it safely:

- `/setup` routes a truly empty current directory to Template (default), Blank,
  or Cancel, while established projects retain the existing evidence-driven
  path;
- Template data is an untrusted, immutable capability catalogue, never a source
  of project bytes or executable policy;
- one Core-owned outer bootstrap transaction composes trusted Core, selected-
  adapter, and optional-profile provider reports into one approved plan;
- adapter selection uses a Core-shipped exact-version catalogue, authorizes one
  provisional project-local install, and permits an explicit Core-only result;
- optional capabilities remain independent and disabled by default;
- durable project application precedes Core's create-only Git initialization;
  and
- the fresh root-seed attestation expands to bind source, capability, provider,
  metadata, nullable-adapter, project-plan, hook, and staged-index evidence.

This requires three new architecture records: one new composition decision and
separate successors to ADR-0076 and ADR-0077. Accepted ADR bodies must not be
rewritten.

## Existing contract disposition

### Replacement specification

The future empty-directory specification should explicitly supersede
`docs/specs/2026-08-20-testing-ready-project-bootstrap-spec.md` as the active
bootstrap contract. Until the replacement is approved, the existing spec
remains the accepted baseline. On replacement acceptance, retain the old file
as historical evidence and mark its status with a pointer to the replacement;
do not maintain two active setup specifications.

The replacement should incorporate rather than reopen these settled mechanics
from the testing-ready bootstrap map:

- the adapter-owned desired-state scaffold transaction;
- the application-free testing-ready scaffold inventory;
- local/generated-CI quality parity and first-push coverage behavior;
- packaged create-only Core hook wrappers and adapter delegation;
- deterministic fresh unborn `develop` Git state;
- exact bounded seed staging, signed root commit, fatal commit-failure handling;
  and
- no remotes, pushes, hosted repository creation, pull requests, rulesets, or
  publication inside setup.

It should replace these parts of the old contract:

- Git initialization before candidate preparation;
- empty-project adapter inference from existing project evidence;
- a mandatory non-null active adapter;
- a separate install question after an empty-project adapter has been selected;
- one PHP/web-only empty-project outcome;
- absence of Template, Blank, Cancel, optional capability, metadata-renderer,
  and strict-empty rollback semantics; and
- seed attestation that lacks template source, capability, provider, metadata,
  combined-plan, and bootstrap-journal bindings.

The closed testing-ready wayfinder map remains historical and needs no update.

## ADR disposition

The next available ADR numbers are currently 0082–0084. Number them at the time
they are written rather than reserving a number in implementation prose.

### New: provider-rendered empty-project bootstrap composition

Write one new ADR for the cross-cutting composition decision. It should record
that:

- Core owns a schema-versioned supported-adapter catalogue, provider registry,
  strict-empty entry router, outer bootstrap transaction, combined plan,
  ownership-overlap checks, durable application, and recovery orchestration;
- Core-only is represented by a nullable adapter identity and explicit
  `CORE_ONLY` disposition, not a synthetic adapter;
- the selected adapter remains the sole owner of stack-specific scaffold bytes,
  toolchain requirements, checks, and verification;
- Core and trusted package-owned optional-profile providers own only their
  declared language-agnostic surfaces;
- the remote template manifest may classify capabilities and choose allowlisted
  provider IDs but may not supply project bytes, renderers, output paths,
  packages, scripts, defaults, or metadata;
- Blank and Template converge on one normalized provider-report and combined-
  plan contract before durable project mutation; and
- existing-project setup keeps its current evidence-driven adapter path and
  adapter-owned candidate transaction.

This extends ADR-0058, ADR-0060, ADR-0070, ADR-0073, ADR-0075, ADR-0078, and
ADR-0079. It supersedes none of them.

Do not silently redefine the existing `candidate workspace` domain term, which
currently denotes the adapter-owned transaction used by established-project
setup. Introduce a distinct **empty-project bootstrap transaction** and
**bootstrap workspace** for the Core-owned outer composition boundary. An
adapter may prepare its bounded report inside a delegated attempt subdirectory,
but Core does not absorb stack behavior.

### Supersede ADR-0076: bounded setup acquisition authorization

Write a successor ADR rather than editing ADR-0076's accepted body. The
successor should preserve invocation-scoped, non-persistent setup networking
and add only two strict-empty effects:

1. Template mode authorizes the fixed unauthenticated HTTPS object sequence for
   public `kyaulabs/template`: repository metadata, default-branch resolution,
   immutable commit/tree resolution, and manifest-blob acquisition.
2. Selecting a catalogue adapter authorizes acquisition of that one exact
   project-local package/version. The selection itself is also the explicit
   mutation authorization for its provisional installation on the strict-empty
   path; there is no redundant install question.

The successor must retain separate approval for the displayed combined project
plan and preserve independent consent/mutation boundaries for global Core
installation, standing OCR consent, global preferences, hooks, GitHub
operations, remotes, pushes, credentials, and publication. Existing-project
adapter installation behavior remains unchanged.

It must continue to reject authenticated GitHub access, arbitrary/private
repositories, caller-selected URLs, Git clone/fetch/pull, archives, redirects,
web search, lifecycle scripts, and undeclared package-manager passthrough.

### Supersede ADR-0077: post-application repository bootstrap and root seed

Write a separate successor rather than editing ADR-0077's accepted body. It
should retain create-only deterministic Git state, active-attempt eligibility,
one-use attestation, bounded seed staging, exclusive signed commit creation,
fatal failure recovery, and human-owned publication, while changing the
strict-empty ordering to:

```text
strict-empty attestation
-> provisional source/package/provider preparation
-> approved combined plan
-> durable project application
-> Core Git CREATE
-> dependency/hook/quality verification
-> attested signed root seed
```

The successor should permit nullable adapter identity and require the root-seed
attestation to bind:

- source mode;
- for Template, repository identity, validated default branch, immutable commit,
  tree and manifest identities/digests, and classification digest;
- selected capabilities and trusted provider identities/versions;
- approved metadata digest;
- nullable adapter identity and adapter report digest;
- combined candidate-plan, applied-inventory, bootstrap-attempt, and durable-
  journal digests;
- canonical hook inventory; and
- final staged-index digest.

Source responses, the manifest, temporary/provider workspaces, journal files,
backups, inherited Git data, and remote state never enter the seed.

### Records that remain accepted unchanged

- ADR-0044: the single-root protected-branch exception and human initial push
  remain intact.
- ADR-0050: oversized-work routing and the greenfield walking-skeleton lifecycle
  remain intact; a strictly empty setup root is not a redefinition of its
  repository classifier.
- ADR-0058 and ADR-0060: Core remains language-agnostic and adapters remain
  project-local stack owners.
- ADR-0070 and ADR-0073: fixed orchestration stays behind narrow launcher
  operations and prompt commands remain safety-compatible.
- ADR-0074: workflow-selected root-commit authorization and fatal commit failure
  remain intact.
- ADR-0075: exactly one global Core source remains intact.
- ADR-0078: canonical hook ownership and activation remain intact.
- ADR-0079: release management remains an opt-in Core-owned capability and can
  be exposed through the optional-profile contract without changing its
  release semantics.

No additional extension, external dependency, safe directory, Git transport,
archive parser, template engine, or package-discovery service is required.
Node's existing HTTPS/fetch, URL, JSON, and cryptographic primitives are
sufficient.

## Target architecture

### Context

```text
Human
  | selected mode, adapter, capabilities, metadata, plan approval
  v
Pi /setup prompt
  | normalized decisions only
  v
Prism Core bootstrap launcher
  |-- fixed unauthenticated object reads --> public kyaulabs/template (Template only)
  |-- validated provider request ---------> Core/profile providers
  |-- validated provider request ---------> selected project-local adapter (optional)
  |-- approved combined tree ------------> empty current project root
  |-- durable applied inventory ----------> Core Git initializer and seed attestation
  v
Fresh local develop repository
  | human-only remote/push/ruleset actions
  v
GitHub repository
```

The public template, package registries, provider reports, project metadata, and
filesystem state all cross trust boundaries. Only the launcher and validated
installed providers are trusted code.

### Components

```text
Setup entry router
  |- established project -> existing setup path, unchanged
  `- truly empty root ----> empty-project bootstrap coordinator

Empty-project bootstrap coordinator
  |- strict-empty classifier and attempt journal
  |- fixed template source reader/validator (Template only)
  |- supported-adapter catalogue and provisional installer
  |- capability/provider registry
  |- metadata broker (exact fields pending the metadata-renderer ticket)
  |- provider-report validator and ownership composer
  |- combined-plan presenter and durable applier
  |- recovery/resume classifier
  `- Git CREATE and root-seed handoff
```

The coordinator is a deep module: prompt prose chooses among bounded options;
the launcher hides network resolution, validation, provider composition,
journaling, rollback, recovery, Git ordering, and attestation.

## Interface constraints

The exact CLI spelling is an implementation detail, but the architecture should
expose narrow structured operations equivalent to:

- inspect/classify the current root without mutation;
- begin or resume one strict-empty attempt;
- prepare Template or Blank with fixed normalized choices;
- return available adapter and capability IDs from closed catalogues;
- collect only metadata required by selected capabilities;
- prepare and validate provider reports;
- display one digest-bound combined plan;
- apply only that attempt's approved plan;
- recover or resume by journal phase; and
- hand the durable inventory to the accepted Git/hook/quality/seed operations.

Provider interfaces must be materially smaller than their implementations.
They accept normalized source mode, selected capability IDs, approved metadata,
nullable adapter identity, and a launcher-designated candidate root. They
return one closed schema containing bounded owned paths, kinds, modes, digests,
toolchain requirements, checks, and verification entry points. They do not
receive arbitrary shell, source URLs, or caller-selected package coordinates.

Errors are part of the interface. Reports should use closed dispositions such
as GO, NO-GO, CONFLICT, RESUME, and CORE_ONLY plus bounded check/recovery
records. Unknown schema versions, IDs, fields, states, or ownership overlap fail
closed.

## Security and failure boundary

- **Assets:** strict-empty root integrity, trusted Prism policy, exact package
  selection, fresh Git history, bounded authorization, and rollback/recovery
  evidence.
- **Untrusted inputs:** GitHub metadata/tree/blob responses, the template
  manifest, package metadata, provider reports, approved project metadata,
  filesystem state, and subprocess output.
- **Primary abuse cases:** remote code/policy injection, branch races, path
  traversal, symlink/submodule/executable import, arbitrary package loading,
  capability preselection, provider output overlap, stale-plan application,
  partial mutation, cleanup of concurrent human work, inherited Git state, and
  network-authority expansion.
- **Fail closed:** immutable fixed-source acquisition, closed schemas and
  allowlists, trusted provider rendering only, digest-bound plan approval,
  create-only publication, exact ownership rollback before the durable marker,
  retained state after it, and no automatic fallback from Template to Blank.

Before durable project application, decline or caught failure must remove only
exact attempt-owned source, package/settings, provider, and candidate state and
prove that the root is empty. Any third state preserves evidence for manual
recovery. After the durable marker, later Git, dependency, hook, quality, or
seed failure retains the complete project tree and resumes from a fixed phase.

## Domain-document consequences

After the successor ADRs are accepted, update `CONTEXT.md` to:

- add `empty-project bootstrap transaction`, `bootstrap workspace`, `project
  capability`, `trusted provider`, `supported-adapter catalogue`, and `template
  source attestation` to the glossary;
- allow an active adapter to be selected explicitly in a strict-empty project,
  while established projects remain evidence-driven;
- distinguish the Core-owned outer bootstrap transaction from the adapter-owned
  candidate transaction;
- extend setup-attempt networking to the fixed Template object sequence;
- allow repository-seed attestations with a nullable adapter and provider/
  source/metadata evidence;
- record Core ownership of fixed template acquisition, provider composition,
  strict-empty rollback/recovery, and durable-application-to-Git handoff; and
- preserve adapters as the sole owners of stack-specific scaffold and quality
  behavior.

## Replacement-spec test seams

The replacement specification should preserve all accepted public tests from
the testing-ready bootstrap contract and add end-to-end seams for:

1. strict empty versus established-project routing and unchanged established
   behavior;
2. Template-default, Blank, and Cancel presentation;
3. exact adapter catalogue, Core-only, provisional install authorization, and
   rollback;
4. fixed unauthenticated template object acquisition and immutable pinning;
5. complete tree/manifest validation and no remote project bytes;
6. disabled-by-default independent optional capabilities;
7. metadata questions limited to selected outputs;
8. closed provider reports, ownership/prefix-overlap rejection, and identical
   Blank/Template plan schemas;
9. byte-for-byte emptiness after every pre-durable decline/fault and third-state
   evidence preservation;
10. durable retention and deterministic resume after every post-application
    fault;
11. absence of `.git` before durable application and fresh unborn `develop`
    afterward;
12. Core-only and adapter-selected hook/quality behavior;
13. complete expanded root-seed attestation and exact staged inventory; and
14. no remote, push, GitHub mutation, credential, or publication effects.

The exact metadata fields and renderer ownership remain delegated to the open
project-metadata decision. Final human approval of the consolidated setup
contract must wait for that decision, so the contract-approval ticket should be
natively blocked by the metadata-renderer ticket.

## Frontier consequence

No new ticket is required. After this architecture decision closes:

- the project-metadata renderer decision is the next frontier; and
- the final revised-contract approval remains blocked until project metadata is
  settled.

The map's current fog can be cleared because every remaining unknown is now a
sharp live ticket.

## Evidence

- `CONTEXT.md` — Core/adapter, candidate transaction, repository bootstrap,
  consent, safety, and publication invariants.
- `docs/specs/2026-08-20-testing-ready-project-bootstrap-spec.md` — accepted
  mechanics and superseded Git-first empty-project assumptions.
- `docs/research/2026-08-23-safe-template-acquisition-transaction.md` — fixed
  source acquisition, manifest/provider trust boundary, rollback, durable
  application, and revised Git ordering.
- ADR-0058, ADR-0060, ADR-0070, ADR-0073, ADR-0074, ADR-0075, ADR-0076,
  ADR-0077, ADR-0078, and ADR-0079.
- Pi 0.84.2 `docs/prompt-templates.md` — package prompt templates are Markdown
  prompts with simple argument expansion, so deterministic orchestration must
  remain launcher-owned rather than embedded as prompt control logic.
- Pi 0.84.2 `docs/packages.md` — project-local package selection writes
  `.pi/settings.json`, installs under `.pi/`, and missing trusted-project
  packages may be acquired automatically; provisional adapter state therefore
  belongs inside the strict-empty bootstrap attempt.
- The empty-directory map decisions for safe template acquisition, supported
  adapter bootstrap, template inventory, and optional project profiles.

Repository evidence was reviewed at commit
`b63736b6456307eb3a8c71faeef8ab1232f832b2`.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
