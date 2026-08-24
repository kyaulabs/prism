# Spec: Empty-Directory Project Bootstrap

**Date:** 2026-08-23
**Status:** Approved

## Problem Statement

Prism's approved testing-ready bootstrap contract can create a local repository, provision an adapter-owned scaffold, install canonical hooks, verify quality, and produce one signed root seed. It does not define how `/setup` should begin when its current project root is a strictly empty directory and therefore contains no trustworthy project evidence from which to select a stack or initial project surface.

Users starting a new project need a safe choice between a maintained KYAULabs project baseline and a blank Prism scaffold. The public template cannot be copied directly: its current files contain template identity, historical policy, optional governance choices, and incomplete or obsolete development surfaces. Treating a moving remote repository as executable setup input would also introduce branch races, path attacks, inherited Git state, arbitrary policy import, and unclear rollback ownership.

Empty-project setup must therefore compose a fresh project from trusted Prism providers while preserving the boundaries already established for Prism Core, stack adapters, setup networking, candidate transactions, canonical hooks, quality verification, root-seed creation, and human-owned publication. It must support an explicit Core-only project, make optional policy-bearing surfaces opt-in, collect only the metadata needed by selected capabilities, and restore strict emptiness when the user declines or preparation fails before durable project application.

The resulting contract must replace the active testing-ready bootstrap specification without maintaining two competing `/setup` bootstrap behaviors. Established-project setup must remain behaviorally unchanged.

## Solution

Extend `/setup` with a Core-owned empty-project bootstrap transaction that activates only when the canonical current project root is strictly empty.

The empty-project entry presents Template, Blank, and Cancel, with Template as the default. Template mode reads the public `kyaulabs/template` default branch through a fixed unauthenticated HTTPS object sequence, resolves it to immutable object data, validates a closed classification manifest, and uses that manifest only to advertise supported project capabilities and trusted provider identities. No remote blob becomes a project file and no remote content executes. Blank mode skips remote template acquisition. Both modes converge on the same trusted-provider composition contract before project mutation.

Core presents an exact-version supported-adapter catalogue and an explicit Core-only result. Selecting an adapter authorizes provisional installation of that exact project-local package without a redundant install question. The selected adapter remains the sole owner of stack-specific scaffold files, dependency requirements, checks, and verification. Core-only remains adapterless and skips adapter-specific stages.

Optional licensing, community, collaboration, security, ownership, support, funding, and release surfaces are independent capabilities disabled by default. Core collects only metadata required by selected capabilities, previews identity-bearing values before they become project content, persists approved normalized metadata in a versioned project manifest, and renders all language-agnostic project surfaces through trusted packaged providers. Adapters may contribute closed validated stack facts but cannot render or overlap Core-owned profile surfaces.

Core composes its baseline report, the optional adapter report, and selected profile reports into one closed, digest-bound candidate plan. The user reviews and explicitly approves that complete plan before project files change. Before the durable project-application point, decline or failure removes only exact transaction-owned state and proves that the project root is empty. After durable application, later failures retain the complete project tree and a journaled deterministic recovery phase.

Only after durable project application does Core initialize fresh unborn `develop` Git history. The accepted dependency, hook, quality, attestation, and signed-root-seed mechanics then apply. The one-use seed attestation expands to bind the selected source, immutable Template evidence when applicable, capabilities, providers, metadata, nullable adapter identity, applied plan, journal, hook inventory, and staged index. Setup ends after the verified signed root seed and never configures or publishes to a remote.

Existing projects continue through the current evidence-driven setup route. They do not see empty-project source, adapter, capability, metadata, or bootstrap-transaction behavior and never contact the public template.

## User Stories

1. As a developer in a strictly empty directory, I want `/setup` to recognize that state, so that project creation can begin without pre-existing files or Git history.
2. As a developer, I want Template, Blank, and Cancel choices, so that I can select a maintained baseline, a minimal scaffold, or leave the directory untouched.
3. As a developer, I want Template selected by default, so that the maintained KYAULabs capability catalogue is the recommended starting point without silently applying it.
4. As a developer who cancels setup, I want the directory restored to byte-for-byte emptiness, so that inspection alone does not leave project artifacts.
5. As an established-project maintainer, I want existing `/setup` behavior preserved, so that empty-project creation does not change adapter discovery or mutation semantics in my repository.
6. As a security-conscious user, I want Template mode restricted to the fixed public KYAULabs template, so that setup cannot fetch an arbitrary or private repository.
7. As a security-conscious user, I want the template branch resolved to immutable object data, so that a moving branch cannot change halfway through preparation.
8. As a maintainer, I want complete tree and manifest validation, so that truncated, oversized, malformed, or internally inconsistent source data fails closed.
9. As a maintainer, I want symlinks, submodules, executable blobs, unsafe modes, escaping paths, and operational-path collisions rejected, so that remote content cannot cross the project boundary unexpectedly.
10. As a developer, I want inherited template Git history, remotes, hooks, and settings excluded, so that my project starts with fresh Prism-owned repository state.
11. As a maintainer, I want the template manifest treated only as a capability catalogue, so that it cannot provide project bytes, renderers, scripts, packages, defaults, metadata, or arbitrary output paths.
12. As a maintainer, I want all project content rendered by trusted installed providers, so that Core and adapters remain the authoritative source of policy and scaffold behavior.
13. As a developer choosing Blank, I want no template network access, so that a local minimal project can be prepared without contacting the template source.
14. As a developer, I want Blank and Template to use the same plan and application transaction, so that source choice does not create divergent setup mechanics.
15. As a developer in an empty project, I want a closed list of supported adapters, so that I do not need existing stack evidence to select a supported stack.
16. As a security-conscious user, I want exact adapter package identities and versions shown before selection, so that setup cannot install an arbitrary or drifting package.
17. As a developer, I want selecting an adapter to authorize its provisional project-local installation, so that I do not answer a redundant second installation question.
18. As a developer, I want adapter installation to remain provisional until the project transaction commits, so that decline or early failure can restore the empty directory.
19. As a developer, I want an explicit Core-only result, so that I can create a Prism project without selecting a stack adapter.
20. As a maintainer, I want Core-only represented without a synthetic adapter, so that adapter absence remains explicit throughout reports, hooks, quality checks, and seed evidence.
21. As a stack-adapter author, I want one generic empty-project preparation interface, so that my adapter can render its application-free scaffold without Core absorbing stack behavior.
22. As a stack-adapter author, I want Blank and Template to call the same preparation interface, so that stack files have one owner and one verification path.
23. As a Prism maintainer, I want provider reports to use closed schemas and bounded ownership declarations, so that Core can validate them before composing a project.
24. As a developer, I want optional project surfaces disabled by default, so that setup does not infer licensing, governance, support, funding, security, ownership, collaboration, or release policy.
25. As a project owner, I want licensing independent from community governance, so that granting reuse rights does not imply a public contributor process.
26. As a project owner, I want collaboration templates independent from support routing, so that structured issue intake does not silently publish an external support destination.
27. As a project owner, I want support and funding independently selectable, so that either identity-bearing surface can be enabled without the other.
28. As a project owner, I want release management enabled only when I select it, so that package discovery alone cannot install release policy.
29. As a developer declining every optional capability, I want a useful minimal project, so that Core activation, project documentation, commit policy, hooks, and any selected adapter scaffold are still ready.
30. As a Core-only user, I want the minimal project to contain no adapter-owned files, so that adapter absence is reflected in the resulting tree.
31. As a project owner, I want setup to collect only a display name and summary for the minimal project, so that optional identity and policy details are not requested prematurely.
32. As a project owner, I want the display name suggested from the directory name but editable, so that setup offers convenience without fixing project identity from a path.
33. As a project owner enabling licensing, I want to select a supported SPDX license and any required copyright holder, so that Core can render reviewed versioned license text.
34. As a project owner enabling community standards, I want to provide a conduct-reporting email address or secure URL, so that the generated policy has an explicit reporting route.
35. As a project owner enabling GitHub collaboration, I want neutral issue and pull-request templates requiring no project identity metadata, so that collaboration can be enabled without stale labels, assignees, or platform-specific fields.
36. As a project owner enabling security disclosure, I want to choose a reporting route and supported-version policy, so that the generated policy reflects the project's actual security contract.
37. As a project owner enabling security disclosure, I want response-time wording omitted unless I explicitly provide it, so that setup does not invent a service promise.
38. As a project owner enabling repository ownership, I want at least one validated GitHub owner and optional path-specific rules, so that automatic review routing is explicit and contained.
39. As a project owner enabling support routing, I want to provide a secure destination with optional display text, so that users can be directed to an approved support channel.
40. As a project owner enabling funding, I want supported provider records or a secure custom destination, so that generated funding metadata contains only approved identities.
41. As a project owner enabling release management, I want to provide the intended public GitHub coordinate without creating or contacting that repository, so that release configuration can be rendered while publication remains separate.
42. As a user, I want identity-bearing metadata previewed before project mutation, so that I can see what information will become public project content.
43. As a returning user, I want approved normalized metadata persisted as the canonical renderer input, so that reruns are deterministic and generated documents are not parsed as configuration.
44. As a security-conscious user, I want metadata validation to use closed fields, bounded sizes, normalized text, secure destinations, and contained patterns, so that project rendering fails closed on unsafe values.
45. As a developer, I want one complete combined project plan, so that I can review every Core, adapter, and optional-profile output before approving mutation.
46. As a maintainer, I want provider ownership overlap rejected before plan display, so that two providers cannot claim the same project surface.
47. As a developer, I want unchanged canonical files preserved on rerun, so that idempotent setup does not touch or rewrite stable project state.
48. As a developer, I want stale plans and changed metadata rejected, so that approval applies only to the exact project candidate I reviewed.
49. As a developer, I want every pre-durable failure to restore emptiness, so that package, provider, source, or candidate preparation cannot strand a partial project.
50. As a developer, I want concurrent unexpected filesystem changes preserved for manual recovery, so that cleanup never deletes human work it cannot prove it owns.
51. As a developer, I want post-durable failures to retain the complete applied tree, so that later Git, dependency, hook, quality, or seed problems have a deterministic retry point.
52. As a developer, I want setup never to silently fall back from Template to Blank, so that a source-validation failure cannot change my selected project mode.
53. As a developer, I want Git absent until project application is durable, so that pre-application rollback can restore a genuinely empty root.
54. As a developer, I want fresh unborn `develop` history initialized after durable application, so that the project receives deterministic local repository state without template ancestry.
55. As a maintainer, I want root-seed eligibility bound to the active setup attempt, so that preserved or manually initialized repositories are never automatically committed.
56. As a maintainer, I want seed evidence to bind source, capabilities, providers, metadata, adapter, plan, journal, hooks, and staged state, so that substituted project content cannot reach the root commit.
57. As a developer, I want unrelated files and operational artifacts excluded from the root seed, so that setup commits only its attested project inventory.
58. As a developer, I want Core-only and adapter-selected projects to run their applicable public quality checks before the seed, so that every root commit is verified without inventing adapter behavior.
59. As a contributor, I want the root seed signed through Prism's exclusive commit boundary, so that the first commit follows the same provenance and fatal-failure policy as later work.
60. As a user, I want `/setup` invocation to cover its disclosed bounded networking, so that fixed template reads, package acquisition, dependency audits, locked population, and declared browser downloads do not require repetitive network questions.
61. As a user, I want adapter selection to authorize only the displayed provisional package installation, so that it cannot transfer permission to other packages or project mutation.
62. As a user, I want combined project mutation and hook activation to retain separate approval gates, so that network authorization does not become filesystem consent.
63. As a security-conscious user, I want setup networking excluded from OCR expansion, authenticated GitHub access, arbitrary URLs, credentials, Git remotes, pushes, web search, and publication, so that external-effect authority remains least-privilege.
64. As a developer rerunning setup after success, I want it to preserve existing repository and project state without creating another root seed, so that setup converges safely.
65. As a developer encountering failure, I want a final report naming the retained state, recovery phase, blocking condition, and single next action, so that remediation is deterministic.
66. As a repository owner, I want remote creation, initial push, hosted rulesets, pull requests, and publication left to explicit human actions, so that local project creation cannot publish autonomously.

## Implementation Decisions

### Entry classification and routing

- Core classifies the canonical current project root before choosing a setup route.
- Empty-project bootstrap applies only when the root is truly empty and belongs to no containing worktree or existing repository state.
- The empty route presents Template, Blank, and Cancel, with Template recommended and selected by default but never applied without later project-plan approval.
- Established projects retain evidence-driven adapter discovery, existing mutation gates, and their adapter-owned candidate transaction. They do not load the empty-project catalogue, contact the template source, or receive a metadata manifest retroactively.
- Empty-project creation introduces a Core-owned empty-project bootstrap transaction and bootstrap workspace. These remain distinct from the adapter-owned candidate workspace used by established-project setup.

### Template acquisition and classification

- Template mode supports only public `kyaulabs/template` through a fixed unauthenticated HTTPS protocol owned by the Core launcher.
- The protocol reads bounded repository metadata, validates the default branch, resolves one immutable commit and complete tree, and obtains the classification manifest by immutable object identity.
- Redirects, credentials, authenticated APIs, caller-selected URLs, Git transport, archives, lifecycle scripts, arbitrary package-manager passthrough, truncated results, excessive objects or bytes, unsafe paths, executable blobs, symlinks, submodules, unknown modes, and operational-path collisions fail closed.
- The manifest has one supported schema version, closed fields, complete classification coverage, and allowlisted capability and provider identifiers.
- Every non-manifest source object is classified as Core baseline, adapter-owned, optional capability, or template-maintenance-only.
- The manifest may advertise capabilities and select allowlisted provider identities. It may not supply project bytes, executable renderer code, output paths, package coordinates, scripts, metadata, defaults, or automatic capability selection.
- Current template blobs are not copied. Core regenerates its baseline, the selected adapter generates stack surfaces, optional Core providers generate selected project profiles, and maintenance-only artifacts are excluded.
- Blank mode omits source acquisition and records a blank source disposition. Template and Blank otherwise produce the same normalized provider requests and combined-plan schema.

### Supported adapters and Core-only bootstrap

- Core ships a schema-versioned supported-adapter catalogue containing stable IDs, display names, exact project-local package identities and versions, and compatible bootstrap protocol versions.
- Empty projects never infer a stack, query a registry catalogue, or accept a user-entered package coordinate.
- The selection UI presents Core only, every validated supported adapter, and Cancel. No adapter is selected merely because the project is empty.
- Selecting an adapter is explicit authorization for provisional project-local installation of that exact displayed package and its bounded setup-network transport. No redundant installation question follows.
- Provisional package and settings changes remain part of the outer bootstrap transaction and are removed on decline or pre-durable failure when ownership is proven.
- Unknown, duplicate, unversioned, incompatible, identity-mismatched, escaping, or non-catalogued adapters fail closed before executable adapter code is loaded.
- Core validates package identity, adapter registration, handler containment, toolchain containment, and bootstrap protocol compatibility.
- Core-only uses a nullable adapter identity and explicit Core-only disposition. It performs no adapter installation, adapter preparation, dependency population, or adapter quality delegation.
- A selected adapter receives normalized source mode, selected capability IDs, approved metadata, and a launcher-designated candidate root. It returns a closed desired-state report describing bounded owned outputs, modes, digests, toolchain requirements, checks, and one verification entry point.
- Stack-specific manifests, dependencies, source/test directories, ignore policy, generated stack CI, checks, and verification remain exclusively adapter-owned.

### Optional project capabilities

- Optional surfaces are independent capabilities rather than overlapping presets. Every capability is disabled by default in both Template and Blank modes.
- The supported capability set covers licensing, community standards, GitHub collaboration, security disclosure, repository ownership, support routing, funding, and release management.
- Support and funding remain independently selectable even when presented together.
- Capabilities do not imply one another. Template source, adapter choice, package discovery, and repository visibility cannot select a capability automatically.
- Every capability has a trusted owner, exact bounded output surface, compatibility rules, and closed validation contract.
- Release management may conditionally offer the already accepted package-release capability only after release management is selected and publishable packages pass existing discovery rules.
- The minimal project includes the Core/Pi project baseline, a project-specific README, canonical Core hooks and commit policy, and any selected adapter's complete application-free scaffold and ignore policy.
- Core-only minimal projects contain no adapter-owned surfaces.

### Project metadata and rendering

- Core owns the metadata broker, versioned project metadata manifest, minimal README, and every optional-profile output.
- Adapters may provide only closed validated facts such as a stack display name or canonical verification command. They cannot provide document fragments or claim Core-owned profile surfaces.
- The metadata manifest records source mode, selected capabilities, normalized project metadata, nullable adapter identity, and required compatibility information. It contains no credentials and is committed as canonical project state.
- Generated documents are deterministic outputs and never become metadata sources on rerun.
- Minimal metadata requires a project display name and one-sentence summary. The display name may default from the current directory but remains editable.
- Licensing requires a supported SPDX identifier and any copyright holder required by that license. Core uses bundled versioned license text and the current year. Unsupported or custom licensing is deferred to normal development.
- Community standards require a conduct-reporting email address or secure URL. Core renders the conduct and contribution policies; contribution guidance needs no additional identity metadata.
- GitHub collaboration requires no project-specific metadata. Core renders neutral bug, feature, and pull-request templates without labels, assignees, repository coordinates, or platform-specific diagnostics.
- Security disclosure requires a reporting email address or secure form and a selected supported-version policy. An acknowledgement target is optional and no response promise is emitted unless supplied.
- Repository ownership requires at least one validated GitHub user or team identifier and may include additional contained path-to-owner rules.
- Support routing requires a secure destination; display label and description are optional with Core defaults. Blank issue behavior depends deterministically on whether collaboration templates are also selected.
- Funding requires at least one supported funding-provider record and account identifier or a secure custom destination, subject to provider limits.
- Release management requires the intended public GitHub owner/repository coordinate and collects no initial version. It renders canonical changelog and repository-release surfaces without contacting or creating the remote.
- Setup requests fields only for selected capabilities and previews identity-bearing contacts, owners, destinations, coordinates, and funding identities before they enter the displayed plan.
- Previously approved same-type values may be suggested only as defaults requiring explicit confirmation; metadata never propagates silently between capabilities.
- Closed-field validation rejects control characters, unknown or duplicate fields, excessive sizes or counts, malformed email or HTTPS destinations, invalid GitHub identities or coordinates, escaping ownership patterns, unsupported licenses, providers, or policies, stale digests, and output overlap.
- Metadata validation performs no live GitHub, email, funding, support-service, or remote repository lookup.

### Provider composition and plan approval

- Core owns a closed trusted-provider registry and validates exact package ownership, provider identity, version, protocol, and output declaration before invoking a provider.
- Provider interfaces are intentionally narrow: normalized decisions enter; bounded desired-state reports leave. Providers receive no arbitrary shell, caller-selected source URL, arbitrary package coordinate, or authority outside the bootstrap workspace.
- Core validates report schemas, statuses, paths, kinds, modes, digests, toolchain requirements, checks, verification entry points, and ownership before composition.
- Unknown schemas, IDs, fields, dispositions, or provider states fail closed.
- Exact-path and prefix ownership overlap between Core, adapter, and optional-profile providers fails before a plan is displayed.
- Core composes one digest-bound candidate containing the metadata manifest, Core baseline, optional profile outputs, project-local Pi activation, and any selected adapter report.
- The displayed project plan identifies source mode and immutable source evidence, selected adapter or Core-only result, capabilities, metadata publication, providers, complete path dispositions, dependency and browser effects, checks, and recovery semantics.
- Only literal approval of that complete plan authorizes durable project mutation. Adapter selection and setup-network authorization do not imply project-plan approval.
- Plan application accepts only the active attempt's launcher-owned plan. Caller-selected plan paths, stale plan or metadata digests, changed provider reports, or changed project state fail closed.

### Transaction, rollback, and recovery

- The empty-project bootstrap transaction uses a versioned journal with explicit preparation, application, durable, post-application, and complete phases.
- Before durable application, Core may remove or restore only exact attempt-owned states recorded in the journal.
- Decline or caught failure before the durable marker must remove provisional source, package/settings, provider, candidate, and plan state and prove the canonical project root is byte-for-byte empty.
- If the filesystem contains an unrecorded third state, cleanup stops, preserves evidence, and reports manual recovery rather than deleting ambiguous content.
- Durable application atomically establishes the complete approved project tree and journaled inventory before Git exists.
- At and after the durable marker, Git, dependency population, browser acquisition, audit, hook, quality, or seed failure retains the complete project tree and returns an exact resume phase.
- A later `/setup` invocation revalidates the journal, project inventory, provider identities, metadata, and source evidence before resuming.
- There is no automatic fallback from Template to Blank, no partial capability fallback, and no silent provider substitution.
- Successful completion consumes or finalizes transient attempt state while retaining only canonical project metadata and required attestation evidence.

### Authorization model

- Invoking `/setup` creates one invocation-scoped, non-persistent setup-network authorization.
- For Template mode, authorization includes only the fixed unauthenticated public object sequence required to resolve and validate `kyaulabs/template`.
- For a selected catalogue adapter, authorization includes acquisition of that exact package and version.
- Existing accepted setup networking remains available for validated dependency resolution and audits, locked dependency population with lifecycle scripts disabled, and adapter-declared browser acquisition.
- Selecting an empty-project adapter is also the mutation authorization for its provisional project-local installation. Established-project adapter installation retains its existing explicit question.
- The displayed combined project plan and canonical hook activation retain independent mutation approvals.
- Global Core installation, global preferences, standing OCR consent, optional GitHub operations, and other existing boundaries remain independent.
- Setup networking never authorizes authenticated GitHub access, arbitrary or private template repositories, redirects, Git clone/fetch/pull, archives, arbitrary URLs, web search, provider authentication, credentials, OCR connectivity or reviewed-code egress, Git remotes, pushes, pull requests, rulesets, release publication, or undeclared packages and commands.
- A stopped attempt ends setup-network authorization. A new invocation creates a new bounded attempt without storing standing setup consent.

### Post-application Git, hooks, quality, and root seed

- Core Git initialization runs only after durable project application and only when the current canonical root still satisfies create-only repository conditions.
- The resulting local repository has fresh unborn `develop`, supported object and reference formats, zero commits and refs, no remotes, no inherited hooks, and no identity, signing, credential, or publication configuration introduced by initialization.
- A successful create disposition yields one-use root-seed eligibility bound to the active bootstrap attempt. Existing, containing, manually initialized, or previously preserved repositories never become eligible.
- The seed attestation binds source mode; immutable Template repository, branch, commit, tree, manifest, and classification evidence when applicable; selected capabilities; trusted provider identities and versions; approved metadata; nullable adapter identity; adapter report; combined plan; applied inventory; bootstrap attempt and durable journal; canonical hook inventory; and final staged-index digest.
- Template responses, remote blobs, source and provider workspaces, journals, backups, inherited Git state, remote state, credentials, environment files, application-specific content, and unrelated project paths never enter the seed.
- Adapter-selected projects run the accepted adapter dependency, audit, verification, generated-CI parity, and shared quality contract. Core-only projects skip adapter behavior and run only applicable Core verification.
- Canonical Core hook wrappers retain their create-only inspection, separate activation approval, ownership, delegation, and conflict behavior.
- Seed staging includes only the attested project metadata, Core baseline, selected profile outputs, project-local package activation, selected adapter scaffold when present, generated CI, and canonical hooks.
- Unexpected staged entries, unsafe path kinds, stale content, digest mismatch, ownership overlap, or inability to prove staged-inventory equality blocks the seed.
- The applicable shared public quality implementation runs against the staged project before commit creation. No bootstrap-only lint, test, coverage, hook, signing, or quality bypass is introduced.
- Core invokes the exclusive signed commit workflow for one deterministic root seed. Any failure retains the fatal reload-and-inspect behavior and is never retried automatically.
- Successful setup performs no later mutation. The final report names the root commit and the human-owned remote, initial-push, and post-push configuration actions.

### Reruns, reporting, and established projects

- Every operation is idempotent and revalidates current state before mutation.
- Exact canonical outputs are preserved without writes. Differing, unsafe, or ownership-ambiguous managed surfaces fail closed rather than being overwritten or weakly merged.
- A successful root seed makes future runs ineligible for automatic seed creation.
- Established repositories continue through normal work-branch, testing, verification, checking, review, and ordinary commit policy for setup-driven changes.
- Existing-project setup retains its current adapter evidence detection, adapter candidate transaction, package-release inspection, readiness, consent, preferences, hooks, optional search diagnostics, and optional GitHub setup behavior except where separately superseded by accepted decisions.
- Existing-project setup never contacts the template or creates the empty-project metadata manifest merely because it is rerun.
- Final reports use bounded structured statuses, checks, retained-state descriptions, recovery phases, and one actionable next step. Unknown report schemas or dispositions fail closed.

### Architecture and documentation disposition

- On approval, this specification becomes the single active `/setup` bootstrap contract and supersedes the testing-ready project bootstrap specification while retaining that document as historical evidence with a pointer to this replacement.
- The accepted testing-ready adapter scaffold, generated-CI parity, canonical hook, quality, signed-root-seed, fatal commit, and human-publication decisions are incorporated rather than reopened.
- A new architecture record will establish provider-rendered empty-project composition, the supported-adapter catalogue, Core-only semantics, capability ownership, and the Core-owned outer bootstrap transaction.
- A successor architecture record will preserve invocation-scoped setup networking while adding only fixed Template object acquisition and selected empty-project adapter acquisition/installation authorization.
- A separate successor architecture record will move strict-empty Git creation after durable project application and expand nullable-adapter root-seed attestation.
- Accepted ADR-0044, ADR-0050, ADR-0058, ADR-0060, ADR-0070, ADR-0073, ADR-0074, ADR-0075, ADR-0078, and ADR-0079 remain accepted and are extended rather than rewritten.
- Domain documentation will distinguish the Core-owned empty-project bootstrap transaction and bootstrap workspace from the adapter-owned candidate transaction and candidate workspace.
- No new Pi extension, external dependency, safe directory, Git transport, archive parser, template engine, package-discovery service, or stack adapter is introduced by this contract.

## Testing Decisions

### Primary integration seam

- Test through the public `prism-tool` CLI in isolated disposable project roots.
- Exercise complete orchestration through structured inspect, prepare, plan, apply, recover, verify, Git, hook, attestation, and seed reports rather than private helper functions.
- Assert externally observable status reports, exact filesystem state, process effects, and Git history.
- Stub only true system boundaries: fixed HTTPS responses, package registries and managers, browser acquisition, external prerequisites, signing, and other subprocesses.
- Use immutable source fixtures representing valid and hostile repository metadata, trees, manifests, and blobs without executing any fixture content.

### Prompt contract seam

- Extend the existing `/setup` shell contract tests rather than creating a second prompt-test framework.
- Verify strict-empty routing, Template-default presentation, Blank and Cancel behavior, exact adapter and Core-only choices, one-question-at-a-time gates, metadata questions limited to selected capabilities, identity-publication preview, and complete plan presentation.
- Verify the disclosed setup-network scope, absence of redundant empty-project adapter installation approval, retained plan and hook approval gates, and unchanged established-project installation behavior.
- Verify deterministic command ordering and launcher-owned mechanics rather than embedding transaction logic in prompt prose.
- Verify the prompt contains no authenticated GitHub, arbitrary URL, Git remote, push, credential, OCR-expansion, or publication authority.

### Source and manifest behavior

- Test strict-empty classification separately from established-project and containing-worktree state.
- Test the exact unauthenticated Template HTTPS sequence, default-branch validation, branch-to-commit pinning, immutable tree and manifest resolution, response bounds, and rejection of redirects or authentication.
- Test complete tree/manifest equality, duplicate or unknown classifications, unsupported schemas, unknown providers or capabilities, truncated trees, malformed JSON, oversized counts and blobs, unsafe encodings, path traversal, collisions, symlinks, submodules, executable blobs, and unknown modes.
- Prove that remote blobs never become candidate or project bytes and that no source content executes.
- Prove that Blank performs no template network operation and that Template failure never falls back to Blank.

### Adapter and provider behavior

- Test catalogue schema, duplicate IDs, exact-version rendering, Core-only selection, provisional installation, protocol mismatch, package identity mismatch, handler or toolchain escape, and absence of live adapter discovery.
- Verify selecting an adapter produces one installation authorization and no redundant question.
- Verify pre-durable cleanup removes only transaction-owned package/settings state and restores strict emptiness.
- Test the same adapter preparation interface and report schema for Blank and Template.
- Verify Core emits no stack-specific paths, dependencies, commands, checks, or generated stack CI.
- Test provider schema closure, identity and version validation, exact and prefix ownership overlap, path containment, mode and digest validation, stale report rejection, unknown checks, and incompatible provider combinations.
- Verify Core-only reports, hooks, quality behavior, and seed evidence accept a nullable adapter without inventing a no-op adapter.

### Capability and metadata behavior

- Test every capability disabled by default and identical selection semantics in Template and Blank modes.
- Test that capabilities do not imply one another and that support and funding are independently selectable.
- Test that Template manifests may advertise but never preselect capabilities.
- Test the minimal Core-only and adapter-selected outputs.
- Test conditional package-release offering only after release-management selection and accepted publishable-package discovery.
- Test that minimal setup requests only project name and summary and allows editing the directory-name suggestion.
- Test each capability's required and optional metadata, including license selection, conduct contact, zero-metadata collaboration, security policy and optional acknowledgement, ownership rules, support presentation, funding providers, and intended release coordinate.
- Test identity-publication preview, explicit confirmation before reusing prior same-type values, and no silent propagation between capabilities.
- Test metadata schema versions, unknown fields, duplicates, control characters, oversized values and collections, malformed email and secure URLs, invalid GitHub identifiers and coordinates, escaping ownership patterns, unsupported licenses and funding providers, stale digests, and output overlap.
- Verify metadata validation performs no live external lookup and generated documents are never parsed as canonical metadata.
- Verify deterministic rerendering from the persisted project metadata manifest.

### Transaction and recovery behavior

- Inject failure at every pre-durable phase and prove byte-for-byte restoration of the originally empty project root.
- Test decline before plan approval and during every separately approved stage.
- Test concurrent third-state changes and prove cleanup preserves evidence without deleting unowned content.
- Test stale attempt IDs, substituted plan paths, changed source objects, changed metadata, changed provider reports, journal corruption, ownership mismatch, and interrupted application.
- Inject failure at every post-durable phase and prove the complete project tree remains with an exact deterministic resume disposition.
- Test rerun recovery, successful completion, cleanup of transient state, and preservation of canonical metadata.
- Verify Git is absent before durable application and no template or provisional package state escapes into the durable tree.

### Git, hook, quality, and seed behavior

- Test fresh deterministic unborn `develop` creation only after durable application.
- Test containing, existing, manually initialized, malformed, bare, detached, protected-branch, unsupported-format, symlinked Git, and concurrent initialization states without repair or normalization.
- Verify only the active attempt's create disposition yields one-use root-seed eligibility.
- Test complete attestation binding for Blank, Template, Core-only, and adapter-selected results.
- Verify immutable Template evidence, capability and provider identities, metadata, nullable adapter, plan, journal, hooks, and staged index are all required and substitution fails closed.
- Verify source responses, temporary workspaces, journal and backup artifacts, inherited Git state, remote state, unrelated paths, credentials, and environment files never enter the seed.
- Reuse accepted canonical-hook tests for package inventory, modes, create/preserve/conflict behavior, custom-hook preservation, activation commit point, and Core/adapter delegation.
- Reuse the selected adapter's public quality and generated-CI parity seam, including first-push behavior, dependencies, audits, browser checks, coverage, and application-free scaffold verification.
- Test Core-only quality behavior independently and prove no adapter command is dispatched.
- Test exact staged inventory, unexpected-index rejection, final quality verification, exclusive signed commit invocation, success verification, fatal commit-failure latching, and prohibition on automatic retry.
- Assert no remote, fetch, pull, push, hosted repository, pull request, ruleset, release, or publication operation occurs.

### Established-project regression behavior

- Run the current established-project setup contract tests unchanged as regression coverage.
- Prove non-empty projects never call the Template source reader, empty-project adapter catalogue, capability selector, metadata broker, provider composer, or outer bootstrap transaction.
- Verify existing adapter discovery, candidate resolution/application/verification, package-release handling, hook behavior, readiness, consent, preferences, optional diagnostics, and final reporting retain their accepted behavior.
- Verify no automatic root seed or empty-project metadata manifest is introduced into an existing repository.

## Out of Scope

- Supporting arbitrary, user-selected, authenticated, or private template repositories.
- Copying any current template blob directly into a generated project.
- Git clone, fetch, pull, archive download or extraction, inherited history, or remote configuration.
- Applying Template or Blank project creation to a non-empty directory or established repository.
- Automatically detecting a stack in an empty directory.
- Accepting arbitrary adapter package coordinates or implementing additional stack adapters.
- Generating application-specific source behavior, pages, routes, database schemas, migrations, production configuration, credentials, or deployment configuration.
- Inferring or automatically enabling licensing, governance, collaboration, security, ownership, support, funding, or release policy.
- Custom or unsupported license authoring.
- Verifying contacts, GitHub identities, repository coordinates, support destinations, or funding accounts against live external services.
- Configuring Git identity, signing credentials, remotes, hosted repositories, default branches on a remote, rulesets, labels, pull requests, pushes, merges, releases, or publication.
- Expanding standing OCR consent, accessing credentials, performing web search, or granting general network authority.
- Adding another Pi extension, orchestration service, background agent, template engine, archive parser, general package discovery, or new external dependency.
- Replacing adapter ownership of stack-specific scaffold, dependency, test, coverage, lint, browser, or generated-CI behavior.
- Retroactively creating empty-project metadata manifests for established repositories.

## Further Notes

This specification merges the completed [empty-directory project creation wayfinder map](https://github.com/kyaulabs/prism/issues/377). Detailed decisions remain in its linked child tickets for template inventory, safe acquisition, empty-project adapter selection, optional capabilities, project metadata renderers, architecture reconciliation, and final contract approval.

On approval, this document supersedes the approved testing-ready project bootstrap specification as the single active `/setup` bootstrap contract. The earlier specification remains historical evidence for the adapter scaffold, generated CI, hooks, quality, and seed mechanics incorporated here.

The design is cross-cutting and changes setup networking, project composition, transaction ownership, metadata persistence, and repository-bootstrap ordering. Run the `architect` skill before ticketing or implementation. Architecture review must account for one new provider-composition decision and separate successors to ADR-0076 and ADR-0077.

The confirmed test strategy uses the public `prism-tool` CLI in disposable project roots as the primary integration seam, the existing `/setup` shell contract tests as the supporting prompt seam, and each selected adapter's declared public quality command for stack-specific verification.
