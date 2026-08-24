# Spec: Testing-Ready Project Bootstrap

**Date:** 2026-08-20
**Status:** Superseded by [Empty-Directory Project Bootstrap](2026-08-23-empty-directory-project-bootstrap-spec.md)

## Problem Statement

Prism's `/setup` workflow can configure an existing Pi project, but it cannot take a new project from a non-Git directory to a complete, tested, locally enforced PHP/web development baseline. A user must currently initialize Git, create or reconcile dependency manifests, install development tools, build test and coverage configuration, add CI, activate hooks, run checks, and create the initial repository seed through separate manual steps.

Those steps cross multiple ownership and safety boundaries. Prism Core owns Git policy, hooks, launcher mechanics, readiness, commit provenance, and global configuration. The PHP/web stack adapter owns Composer and npm dependencies, linting, testing, coverage, browser support, and generated CI. Existing project files and repositories must be preserved, while missing canonical artifacts must be created without silently overwriting custom behavior.

The setup flow also needs a coherent authorization model. Selecting `/setup` should authorize the bounded network access required to complete that setup attempt without repeatedly asking for registry and browser-download permission, while file mutation, hook activation, standing OCR consent, global settings, GitHub mutation, and publication retain their appropriate boundaries.

## Solution

Extend `/setup` into an ordered, adapter-aware bootstrap that can safely create a missing Git repository, provision a complete application-free PHP/web testing scaffold, activate canonical Prism hooks, verify local and CI-equivalent quality, and create one signed initial root commit.

Prism Core first makes the launcher available and automatically performs create-only Git discovery and initialization. A newly created repository is an unborn SHA-1, files-ref `develop` worktree with no commits, refs, remotes, hooks, identity, or publication state. Existing repositories are inspected and preserved without reinitialization or normalization.

The PHP/web adapter then prepares one complete desired-state scaffold in its owned candidate workspace. It validates existing paths, resolves and audits exact dependency graphs, presents one combined plan, and applies the approved tree through a journaled transaction. The desired tree includes native manifests and locks, canonical lint and test configuration, a shared local/CI quality gate, coverage and browser probes, convention tests, empty stack directories, and one generated CI workflow. It creates no application behavior, database schema, production page, or deployment configuration.

After the adapter reports GO, Prism Core inspects and applies its canonical hook surface with a separate mutation approval. Setup stages only the attested project-local adapter configuration, canonical adapter scaffold, generated CI, and canonical hooks. It runs the shared quality implementation against that staged surface and, only when the Git repository was created by the current setup attempt, creates one signed root commit on `develop` through Prism's exclusive commit launcher.

Invoking `/setup` implies bounded network authorization for that setup attempt's Prism package acquisition, Composer and npm resolution and auditing, locked dependency population, and Chromium download. It does not authorize OCR beyond standing OCR consent, GitHub mutation, Git remote access, pushes, pull requests, web search, credential access, or arbitrary network activity. Package installation, scaffold mutation, hook activation, global preference writes, standing OCR consent, and GitHub changes retain their distinct mutation or consent gates.

Setup ends after verified root commit creation. It never configures a remote, pushes a branch, creates a pull request, merges, or applies GitHub rulesets. Those remain explicit human-owned next steps.

## User Stories

1. As a developer starting a PHP/web project, I want `/setup` to create a missing Git repository automatically, so that I do not need a preliminary manual Git command.
2. As a developer, I want every new Prism repository to begin on unborn `develop`, so that the initial seed aligns with Prism's protected-branch policy.
3. As a maintainer, I want Git initialization to ignore ambient branch, object-format, ref-format, template, and repository-redirection settings, so that setup is deterministic and cannot escape the project.
4. As a developer running setup inside an existing repository or subdirectory, I want Prism to preserve the containing repository without reinitializing or nesting another repository.
5. As a developer with incompatible existing Git state, I want setup to stop without rewriting branches, formats, hooks, remotes, or configuration.
6. As a user, I want selecting `/setup` to authorize its bounded dependency-related network activity for that attempt, so that registry and Chromium operations do not repeatedly interrupt the bootstrap.
7. As a security-conscious user, I want setup-implied networking excluded from OCR, GitHub, Git remotes, pushes, web search, credentials, and unrelated external effects.
8. As a user, I want package installation and project-file mutation disclosed separately from network access, so that implied networking never becomes implied filesystem consent.
9. As a PHP/web developer, I want the project-local adapter installed and activated, so that stack-specific skills, checks, tools, and safe-directory declarations are available.
10. As a developer, I want one complete scaffold plan before project files change, so that I can review the full desired state rather than approve incremental mutations.
11. As a developer with existing manifests, I want unrelated metadata and dependencies preserved while conflicting adapter-owned fields fail closed.
12. As a developer with existing lint, test, script, hook, or CI files, I want exact canonical files preserved and differing files left untouched rather than overwritten or weakly merged.
13. As a developer, I want missing manifests and lockfiles resolved and audited in an isolated candidate workspace before consumer mutation.
14. As a maintainer, I want known dependency advisories at any severity to block setup before the candidate reaches the project.
15. As a developer, I want a new project to contain a runnable PHP 8.5 smoke test, real coverage probe, Chromium smoke test, architecture checks, and RCS convention checks without generating application code.
16. As a developer, I want aggregate and changed-file coverage enforced at 80% from the first commit, so that new source enters the same quality contract as established projects.
17. As a maintainer, I want local and hosted CI to invoke one shared PHP/web quality implementation, so that the two gates cannot drift.
18. As a developer, I want the generated CI workflow to handle the first push without requiring a parent commit, so that the single-root seed receives full changed-file coverage.
19. As a developer, I want canonical hooks installed only after the adapter quality surface is ready, so that delegated hook checks cannot activate before their implementation exists.
20. As a developer with custom hooks or another hook manager, I want Prism to report displacement and stop rather than silently disable existing behavior.
21. As a maintainer, I want Core hook wrappers to remain language-agnostic while adapter-specific checks stay behind the active adapter boundary.
22. As a developer, I want setup to stage only its attested project configuration, scaffold, CI, and hook artifacts, so that unrelated pre-existing files are never silently included in the root commit.
23. As a developer with unrelated pre-existing files, I want those paths left unstaged and reported, so that setup ownership remains bounded.
24. As a developer, I want the complete staged seed to pass the shared quality gate before commit creation, so that the root commit is testing-ready rather than merely scaffolded.
25. As a contributor, I want the initial commit signed and attributed through Prism's ordinary commit launcher, so that provenance rules apply from the first commit.
26. As a user, I want setup to create the root commit only when this invocation created the repository, so that existing repositories are never auto-committed.
27. As a contributor in an existing repository with history, I want setup changes to remain subject to the normal work-branch and commit workflow.
28. As a developer rerunning setup, I want every stage to converge without rewriting canonical state or creating another root commit.
29. As a developer whose adapter apply fails before its durable commit point, I want only proven transaction-owned changes rolled back.
30. As a developer whose dependency population or verification fails after the scaffold commit point, I want the audited desired scaffold retained with a deterministic retry path.
31. As a developer whose hook installation or final quality gate fails, I want the scaffold retained but no root commit created.
32. As a developer whose commit operation fails, I want Prism to stop under the fatal reload-and-inspect policy rather than retrying an ambiguous history mutation.
33. As a repository owner, I want remote configuration, the initial push, and GitHub rulesets left to explicit later actions.
34. As a user, I want one final report that identifies completed stages, retained state, blocking remediation, and the single next action.

## Implementation Decisions

### Ownership and orchestration

- Prism Core owns the `/setup` orchestration, Git discovery and initialization, mandatory readiness, standing OCR consent, global and project package installation flow, canonical hook distribution, bounded seed staging, commit invocation, and final reporting.
- The active PHP/web stack adapter owns the complete testing scaffold, dependency candidate transaction, package population, Chromium installation, adapter verification, and shared local/CI quality implementation.
- Core coordinates owner-specific operations but does not absorb PHP, Pest, Composer, npm, browser, SCSS, JavaScript, Aurora, or generated-CI semantics.
- Fixed path attestation, state classification, staging, rollback, recovery, and commit mechanics live behind narrow launcher operations in accordance with ADR-0070 and ADR-0073. Prompt prose owns questions, presentation, and high-level ordering only.

### Authorization model

- Invoking `/setup` grants one bounded setup-network authorization for the active attempt. It covers required Prism package acquisition, Composer and npm registry access, candidate audits, locked dependency population, and Chromium download.
- A stopped or later resumed setup invocation receives a new bounded network authorization by virtue of the new invocation. No persistent network-consent record is created.
- Setup-implied networking does not cover standing OCR consent or live OCR use, GitHub operations, Git remotes, fetch, pull, push, web search, provider authentication, credential access, or an unrecognized adapter or dependency.
- Global Core installation and project-local adapter installation retain explicit mutation approval because they change Pi configuration and installed package state.
- The adapter desired-state plan retains one literal project-mutation approval after the exact candidate and dispositions are displayed.
- Canonical hook application retains a separate literal mutation approval after its inspect report is displayed.
- Global model-preference writes, standing OCR consent changes, and optional GitHub mutations retain their existing independent approvals.
- Automatic root commit creation receives no additional prompt. Selecting `/setup`, approving the bounded setup mutations, and reaching the disclosed seed stage authorizes that exact initial commit attempt, parallel to ADR-0074's workflow-selected commit authorization.

### Ordered critical path

1. Run read-only Pi and package preflight and ensure the Prism Core launcher is available.
2. When Core installation is required, display one supported install operation and require mutation approval before execution.
3. Run Core-owned Git initialization automatically and retain its structured disposition for the duration of the setup attempt.
4. Stop immediately on Git `CONFLICT` or orchestration-incompatible existing state, before adapter resolution, project mutation, or hook inspection.
5. Run local toolchain readiness, inspect standing OCR consent, gather consent only when absent, and run full doctor after consent is valid.
6. Detect project evidence and offer only the matching project-local stack adapter. Require mutation approval before adapter installation.
7. Inspect the active adapter and all scaffold destinations without mutation.
8. Under setup-implied networking, render the full candidate tree, resolve and audit dependency graphs, and return one combined desired-state plan.
9. Stop on any incompatibility or advisory. Offer mutation approval only for a GO plan.
10. Apply the approved adapter transaction through its durable journal and commit point.
11. After the scaffold commit point, populate Composer and npm dependencies from locks, install Chromium only, rerun audits, and verify the complete adapter-owned state.
12. Proceed only on adapter GO. Inspect canonical hook sources, targets, modes, legacy hooks, and effective hook configuration.
13. Stop on hook conflict or displacement. Otherwise present the hook plan, require mutation approval, apply create-only hooks, activate the canonical hook path as the final hook commit point, and verify it.
14. If and only if Git initialization returned `CREATE`, assemble the bounded seed from attested successful stage reports and stage exactly that inventory.
15. Run final seed verification against the staged surface.
16. Invoke the exclusive signed commit operation as the only tool call in its assistant batch.
17. Report the verified root commit and the human-owned remote, initial-push, and post-push ruleset actions. Perform none of them.

### Git initialization and existing repositories

- Use one automatic Core launcher operation with `CREATE`, `PRESERVE`, and `CONFLICT` dispositions.
- `CREATE` is permitted only when the current real project directory has no containing worktree and no `.git` entry.
- A created repository has unborn `develop`, SHA-1 objects, files refs, zero commits and refs, no remotes, no active hooks, and no identity, signing, credential, or publication configuration.
- `PRESERVE` never reruns initialization or changes repository state.
- An existing valid work branch may continue through adapter and hook setup but never enters automatic seed staging or commit creation.
- Existing protected-branch continuation, detached state, unsupported object format, unborn non-`develop` state, bare state, malformed Git metadata, symlinked `.git`, or contradictory roots are preserved and reported NO-GO.
- Only a repository whose current setup invocation returned `CREATE` is eligible for the automatic root seed. A manually initialized or previously preserved unborn repository is not eligible.

### Adapter desired state

- Treat the complete PHP/web scaffold as one adapter-owned desired-state transaction rather than a sequence of independent file creations.
- The desired state includes minimal native manifests and audited locks, canonical lint and test configuration, bootstrap and convention tests, coverage and browser probes, the shared quality implementation, a copied changed-file coverage gate, empty stack and seven-area test directories, and one generated hosted CI workflow.
- Seed missing manifests in the candidate workspace, preserve unrelated compatible manifest fields, and reject conflicting adapter-owned values before external dependency commands run.
- Preserve exact canonical static files without rewriting, touching, or changing modes. Preserve differing or unsafe paths and fail closed.
- Generate lockfiles only as package-manager output from the approved candidate manifests.
- Use a durable `prepared`, `applying`, `committed`, `post-apply`, and `complete` transaction state model.
- Before `committed`, recover or roll back only exact recorded states. Preserve evidence and stop on ownership mismatch or concurrent third-state changes.
- At and after `committed`, retain the complete desired scaffold. Dependency population, Chromium, audit, or verification failure is a retryable NO-GO, not a reason to restore old manifests or delete the scaffold.

### Testing-ready scaffold and CI

- The scaffold must pass its shared local quality implementation before application code exists.
- Include a minimal strict-typed coverage fixture with two outcomes so aggregate coverage produces a real non-degenerate report from the first run.
- Include PHP runtime, Chromium, architecture, and RCS convention tests that observe scaffold readiness without testing framework implementation details.
- Enforce both an 80% aggregate coverage backstop and a non-strict 80% per-changed-file line-coverage gate.
- Keep SCSS and JavaScript lint conditional until source exists while shipping their canonical configuration from the beginning.
- Generate one read-only hosted verify job that installs exact or bounded declared tools, uses lockfiles with lifecycle scripts disabled, installs Chromium only, runs local-only readiness, and invokes the shared quality implementation once.
- Use full history and the Git empty-tree object for first-push comparison. Do not rely on a parent commit.
- Preserve exact generated CI; differing existing CI remains untouched and blocks automatic parity claims.

### Canonical hooks

- Package exactly the four Core-owned commit and push hook wrappers already fixed by the hook-distribution decision.
- Keep wrappers thin and delegate generic policy and active-adapter checks through `prism-tool`.
- Inspect all sources, destinations, executable modes, active legacy hooks, and effective hook configuration before mutation.
- Create only absent canonical wrappers, preserve exact wrappers without writes, preserve unrelated custom hooks, and fail closed on differing canonical paths, mode drift, symlinks, unsafe path kinds, active legacy hooks, or another hook manager.
- Activate the repository-local canonical hook path only after every wrapper verifies. Configuration is the final hook commit point.
- Do not install hooks when adapter verification is NO-GO. Thus a post-scaffold dependency failure leaves hooks inactive until a later successful setup attempt.

### Bounded root seed

- Build the seed inventory only from attested outputs of successful setup stages. It includes project-local adapter activation data, canonical adapter scaffold files, manifests and locks, generated CI, and canonical Core hooks.
- Bind root-seed eligibility to a one-use Core launcher attestation returned only by the active invocation's `CREATE` disposition. Bind that attestation to the canonical project root, adapter identity, setup inventory and digests, hook inventory, and final staged-index digest; stale or substituted state fails closed.
- Never stage arbitrary paths, whole directories, application code, database artifacts, production configuration, credentials, environment files, or unrelated pre-existing content.
- Preserve and report unrelated untracked paths. Reject overlap, stale state, unsafe kinds, unexpected staged entries, or any condition that prevents proving the staged index equals the attested setup inventory.
- Run whitespace, conflict-marker, readiness, scaffold-integrity, hook-integrity, syntax, lint, browser, test, aggregate-coverage, and changed-file-coverage checks against the staged seed before commit creation.
- Use the same shared PHP/web quality implementation used locally and in generated CI. Do not add a weaker bootstrap-only bypass.
- Create the signed commit through `prism-tool commit create` with the reserved initial-seed type and deterministic header `ignore: bootstrap prism project`.
- Let the launcher resolve attribution, validate commitlint, run hooks, sign, verify `HEAD` advancement, and clean private commit state.
- The commit operation must be the only tool call in its assistant batch. No direct `git commit`, hook bypass, unsigned fallback, amend, second protected-branch commit, or automatic retry is permitted.
- On any commit error, activate the fatal commit-failure latch. The user must reload and inspect repository state before another attempt.
- On success, setup performs no later tool mutation. Its final response reports the exact commit and the next human-owned action.

### Reruns and failure handling

- Every stage is independently idempotent and revalidates its current state before mutation.
- A later stage never rolls back a verified earlier owner boundary: adapter failure does not remove a Core-created repository; hook failure does not remove a committed scaffold; quality failure does not remove scaffold or hooks.
- Pre-commit adapter apply failure rolls back only transaction-owned known states and leaves no partial approved tree.
- Post-commit adapter failure retains the desired tree and returns an exact retry phase. A new `/setup` invocation implies the network access needed for that retry without reauthorizing an unchanged committed scaffold mutation.
- Hook apply failure removes only safely attributable creations from that invocation and restores only its own configuration write.
- Final quality failure leaves the repository unborn and all verified setup artifacts available for diagnosis and rerun.
- A successful seed commit makes all future setup runs ineligible for root seeding. Reruns inspect and preserve the repository and canonical artifacts.
- Existing repositories with history use normal work branches, TDD, verification, `/check`, and ordinary commits for any setup-driven changes.

### Optional and deferred setup surfaces

- Model preferences, search-integration diagnostics, labels, and other optional configuration are outside the critical project-bootstrap transaction and cannot weaken its GO/NO-GO result.
- GitHub rulesets cannot be applied as part of a new repository's local seed because the remote and first push remain absent. Setup reports ruleset configuration as a post-push action.
- Remote creation or configuration, Git fetch/pull/push, repository hosting, pull-request creation, merge, and release behavior remain outside `/setup`.

### Architecture constraints

- Preserve the Prism Core and stack adapter boundary established by ADR-0058 and ADR-0060.
- Preserve launcher-owned deterministic mechanics under ADR-0070 and the safety-compatible instruction contract under ADR-0073.
- Preserve exact initial-root and protected-branch behavior under ADR-0044 and the oversized greenfield lifecycle under ADR-0050.
- Preserve the sole safety extension and single-agent topology.
- Preserve standing OCR consent as the only authorization for OCR connectivity and reviewed-code egress.
- Apply ADR-0076's invocation-scoped setup-network authorization without transferring consent to mutation or unrelated external effects.
- Apply ADR-0077's Core-owned create-only Git bootstrap, one-use seed attestation, exclusive signed root commit, and human-owned publication boundary.
- Apply ADR-0078's packaged create-only hook surface and launcher-owned Core/adapter dispatch boundary.

## Testing Decisions

- Treat the public `prism-tool` CLI in isolated disposable consumer projects as the primary deterministic seam.
- Exercise complete stage sequences and reruns through structured `CREATE`, `PRESERVE`, GO, NO-GO, conflict, transaction, hook, verification, and commit reports rather than private helper calls.
- Use disposable Git repositories to verify deterministic initialization, ambient configuration isolation, nested-worktree preservation, existing-repository preservation, exact new-repository eligibility, staged inventory, root history, signing invocation, and no remote or push behavior.
- Verify that only an initialization disposition produced by the active setup attempt enables automatic seed creation; preserved existing repositories, including unborn repositories, never auto-commit.
- Test hostile repository paths, symlinks, malformed gitfiles, redirection environment variables, bare repositories, detached heads, protected branches, unsupported formats, concurrent initialization, and partial failure cleanup.
- At the adapter public seam, test absent, exact, conflicting, stale, symlinked, interrupted, pre-commit-failure, committed-post-apply-failure, recovery, advisory, and idempotent states across the complete scaffold inventory.
- Execute the generated scaffold's shared quality implementation in both local and CI modes and prove identical ordered gates, aggregate coverage, changed-file coverage, Chromium smoke behavior, server cleanup, conditional frontend lint, and first-push empty-tree comparison.
- Test generated CI as inert canonical output: action pinning, read-only permissions, full history, exact runtimes and Prism packages, bounded external prerequisites, no OCR network use, lockfile-only installs, Chromium-only installation, and one shared-gate invocation.
- At the hook public seam, test package inventory, executable modes, create/preserve/conflict/displacement states, custom-hook preservation, config commit point, delegated argument and standard-input propagation, initial-root exception, and later protected-branch blocking.
- At the seed boundary, verify that unrelated paths remain unstaged, unexpected staged entries block commit, setup-owned paths cannot be substituted after attestation, the full staged quality gate runs before commit, and the commit launcher receives the exact deterministic initial-seed fields.
- Verify commit creation is an exclusive safety-boundary call. Simulate signing, hook, Git, timeout, and post-verification failures and assert the fatal latch prevents retry or subsequent tools until reload.
- Add prompt-contract tests that verify `/setup`'s stage order, one-question-at-a-time mutation and standing-consent gates, absence of registry/browser network prompts, bounded explanation of implied network scope, no root commit for existing repositories, and no remote, push, PR, or ruleset mutation.
- Pass every agent-visible executable command through the safety extension boundary separately from functional launcher tests.
- Reuse existing public launcher, candidate transaction, hook, coverage, CI, prompt-contract, and safety tests as prior art rather than testing private implementation details.

## Out of Scope

- Generating PHP application functions, classes, pages, an Aurora entry point, or a public webroot.
- Database schemas, migrations, fixtures, credentials, or MariaDB provisioning.
- nginx or production deployment configuration.
- SCSS, JavaScript, compiled CSS, or minified application assets.
- Automatically reconciling customized lint, test, script, manifest-owned, hook, or CI behavior that differs from the canonical contract.
- Converting, repairing, deleting, or normalizing incompatible existing Git repositories.
- Automatically committing setup changes in any repository not created by the active `/setup` invocation.
- Configuring Git identity, signing keys, credentials, remotes, hosting, default branches on a remote, or GitHub repository settings.
- Fetching, pulling, pushing, opening or merging pull requests, applying rulesets, or publishing releases.
- OCR authentication, provider configuration, credential handling, web search, or arbitrary network access.
- Supporting another stack adapter within this specification; future adapters may implement the same Core orchestration contract through their own desired state.
- Adding a second Pi extension, orchestration service, background agent, or general-purpose package manager.

## Further Notes

This specification merges the completed [testing-ready project bootstrap wayfinder map](https://github.com/kyaulabs/prism/issues/353). The detailed decisions remain in its linked child tickets and research assets:

- safe Core Git initialization;
- PHP/web scaffold transaction;
- canonical Core hook distribution;
- testing-ready PHP/web scaffold inventory;
- generated CI parity; and
- end-to-end setup orchestration.

Architecture review completed with a GO-WITH-CONDITIONS verdict and `ADR-required: 0076,0077,0078`. Those records are accepted and reflected in this approved specification and `CONTEXT.md`; ticketing or implementation may proceed through the normal pipeline.
