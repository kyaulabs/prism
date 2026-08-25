# Release-Management Capability Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Add an independent disabled-by-default `release-management` capability to strict-empty Blank and Template bootstrap projects, rendering canonical release files from a validated intended GitHub coordinate and enabling ADR-0079 package-release configuration only when validated publishable npm packages exist.

**Architecture:** Extend the existing Core capability, metadata, trusted-provider, and candidate-plan contracts rather than adding another setup route. Release rendering stays pure and candidate-local: it reuses ADR-0079 package discovery and canonical managed-file bytes, while ADR-0082's outer bootstrap transaction remains the sole owner of project mutation, rollback, recovery, verification, staging, and root-seed evidence. Established-project `prism-tool package-release inspect|plan|apply|verify` behavior remains unchanged.

**Tech Stack:** Node.js 22+, CommonJS, Node's built-in test runner, existing `prism-tool` bootstrap provider/report protocol version 1, existing package-release discovery and canonical workflow resources, deterministic TOML/Markdown/JSON/YAML rendering without new dependencies.

## Global constraints

- The canonical capability order becomes `licensing`, `community-governance`, `github-collaboration`, `security-disclosure`, `repository-ownership`, `support-routing`, `funding`, `release-management`.
- Every capability remains independent and disabled by default. Template may advertise `release-management` but never preselect it.
- Release management requires exactly one intended public GitHub coordinate in `owner/repository` form and collects no initial version.
- Coordinate validation is local and closed: no live GitHub lookup, repository creation, authentication, credential access, remote configuration, or hosted mutation.
- Normalize the coordinate to one canonical lowercase `owner/repository` value after validating bounded GitHub owner and repository components.
- Core owns the release-management profile and these exact outputs: `CHANGELOG.md`, `cliff.toml`, `.github/workflows/release.yml`, and `.prism/release.json`.
- `CHANGELOG.md` starts with the canonical project-neutral changelog header; `cliff.toml` renders links from the approved coordinate; the workflow bytes remain the canonical Core-owned ADR-0079 workflow.
- `.prism/release.json` uses ADR-0079's schema, ownership marker, `lockstep` policy, and non-empty validated package paths.
- Release management is available only when the selected candidate contains at least one publishable npm package accepted by the existing root/workspace discovery rules. A private-only, malformed, ambiguous, duplicate, escaping, symlinked, or package-less candidate fails closed and does not silently degrade to repository-only release setup.
- Package discovery never enables release management by itself and cannot select another capability.
- The bootstrap renderer reuses pure package-release discovery and desired-file generation; it must not invoke or nest the established-project package-release operation directory, lock, apply transaction, or mutation workflow.
- For selected adapters, discover packages only from the adapter-owned candidate tree after its report is rendered. Core must not absorb package manifests or stack-specific behavior.
- For Core-only projects, discovery runs against the Core candidate tree; because the current baseline has no publishable package, selected release management fails before plan display and restores strict emptiness.
- Provider descriptors retain exact output ownership and one report/check/verification entry for the selected capability.
- Plan validation must revalidate release metadata, candidate package discovery, canonical resource bytes, and rendered outputs rather than trusting retained report digests alone.
- Pre-durable decline or failure restores strict emptiness when ownership is proven; post-durable failure retains the complete project and deterministic recovery state.
- Selected outputs participate in provider composition, durable application, verification, hook checks, exact staging, seed attestation, and rerun continuity.
- Existing established-project package-release behavior, ownership/migration rules, lockstep versions, workflow parity, recovery semantics, and human npm publication boundary remain unchanged.
- Setup performs no npm authentication/publication, Git tag creation, GitHub Release, push, pull request, ruleset, remote, or hosted-repository mutation.
- No new dependency, Pi extension, safe directory, external API, or stack-specific Core logic is introduced.
- Every created or modified `.js` file retains the required RCS header and vim modeline.
- Interactive `/setup` question ordering and final reporting remain task 12; this task exposes and verifies the launcher/provider contract only.

---

### Task 1: Add release-management selection and closed coordinate metadata

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-capabilities.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-metadata.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-providers.js`
- Modify: `tests/Node/prism-tool-bootstrap-capabilities.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Create: `docs/plans/2026-08-25-release-management-capability.md`

**Interfaces:**
- `PROJECT_CAPABILITIES` adds `release-management` last.
- Metadata inspection adds exactly:

```javascript
{
    id: 'release-management.repository',
    required: true,
    suggestedValue: null,
    maximumLength: 140,
}
```

- The identity-publication preview is:

```javascript
{
    capability: 'release-management',
    field: 'release-management.repository',
    outputs: [
        'CHANGELOG.md',
        'cliff.toml',
        '.github/workflows/release.yml',
        '.prism/release.json',
    ],
}
```

- Raw selected metadata uses:

```javascript
{
    'release-management': {
        repository: 'Example-Org/Example-Project',
    },
}
```

- Persisted normalized metadata uses:

```javascript
{
    'release-management': {
        repository: 'example-org/example-project',
    },
}
```

- The coordinate validator accepts one owner and repository separated by one `/`, rejects credentials, schemes, extra path segments, `.git` suffixes, whitespace, controls, empty components, invalid punctuation, overlong components, and live lookup.
- `README.md` adds a selected-capability link to `CHANGELOG.md`.

- [x] **Step 1: Write failing metadata-inspection tests**

Add public launcher tests proving `release-management` is disabled by default, appears last in canonical order, requests only the repository coordinate when selected, exposes the exact publication targets, and is accepted in Blank capability selection.

- [x] **Step 2: Run the focused tests to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/toolchain-packaging.test.js
```

Expected: FAIL because `release-management` is still rejected and no coordinate field exists.

- [x] **Step 3: Implement canonical selection and coordinate normalization**

Extend capability inspection, raw metadata normalization, normalized metadata validation, project-manifest round-tripping, and README links with the exact interfaces above. Keep the metadata schema closed and retain the current canonical ordering checks.

- [x] **Step 4: Add the coordinate failure matrix**

Cover missing/unknown fields, duplicate top-level JSON fields, schemes, credentials, whitespace, controls, multiple slashes, empty owner/repository, leading or trailing punctuation, `.git`, overlong values, and malformed normalized metadata. Assert no project-root mutation and no external process/network call.

- [x] **Step 5: Run the focused tests to verify Green**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/toolchain-packaging.test.js
```

Expected: PASS with all seven existing capabilities unchanged and `release-management` last.

- [x] **Step 6: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-capabilities.js packages/prism-core/scripts/prism-tool/bootstrap-metadata.js packages/prism-core/scripts/prism-tool/bootstrap-providers.js tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/toolchain-packaging.test.js docs/plans/2026-08-25-release-management-capability.md
prism-tool commit create --type feat --scope setup --subject "define release management capability metadata"
```

---

### Task 2: Extract pure ADR-0079 desired-file rendering and add canonical release resources

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/package-release.js`
- Create: `packages/prism-core/config/bootstrap/release/cliff.toml`
- Modify: `packages/prism-core/config/release.yml` only if a parity-safe packaged marker is required; otherwise preserve bytes exactly
- Modify: `tests/Node/prism-tool-package-release-discovery.test.js`
- Modify: `tests/Node/prism-tool-package-release-transaction.test.js`
- Modify: `tests/Shell/release_workflow_test.sh`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `docs/plans/2026-08-25-release-management-capability.md`

**Interfaces:**
- Add one pure exported helper:

```javascript
function renderReleaseCapabilityFiles({projectRoot, coreRoot}) {
    return Object.freeze({
        candidates: Object.freeze([
            {name: '@example/package', path: '.', version: '0.1.0', tagPrefix: 'package'},
        ]),
        files: Object.freeze({
            '.prism/release.json': Buffer.from('...'),
            '.github/workflows/release.yml': Buffer.from('...'),
        }),
    });
}
```

- The helper calls the existing double-read `discoverReleasePackages`, `renderManagedConfiguration`, and canonical workflow reader. It performs no write, lock, operation-directory creation, mutation, subprocess, network call, or cleanup.
- Refactor `planReleaseCapability` to consume this helper so established-project planning and bootstrap rendering share one source of truth.
- Package `config/bootstrap/release/cliff.toml` as a bounded trusted template with one exact `{{REPOSITORY_COORDINATE}}` token used for every GitHub repository link.
- The canonical initial changelog content is deterministic UTF-8:

```markdown
# 📜 Changelog

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for versioning.
```

- [x] **Step 1: Write failing pure-renderer tests**

Prove valid root/workspace candidates return exact config/workflow bytes; private packages are excluded; no candidates, malformed workspaces, duplicates, escaping paths, symlinks, invalid names/versions, and changing double-read inputs fail closed.

- [x] **Step 2: Run package-release tests to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-package-release-discovery.test.js tests/Node/prism-tool-package-release-transaction.test.js tests/Node/toolchain-packaging.test.js
```

Expected: FAIL because the pure helper and packaged cliff resource do not exist.

- [x] **Step 3: Refactor package-release desired-state generation**

Extract the pure helper without weakening the existing inspect/plan/apply/verify ownership checks, operation containment, locking, rollback, or verification. Keep established-project output schemas and dispositions byte-for-byte compatible.

- [x] **Step 4: Add and validate the packaged cliff template**

Copy the canonical git-cliff behavior into the Core-owned template, replace only repository-coordinate literals with the exact token, reject missing/duplicate tokens during provider rendering, and add package inventory assertions.

- [x] **Step 5: Re-run package-release and workflow parity tests**

Run:

```bash
node --test tests/Node/prism-tool-package-release-discovery.test.js tests/Node/prism-tool-package-release-transaction.test.js tests/Node/toolchain-packaging.test.js
bash tests/Shell/release_workflow_test.sh
```

Expected: PASS with established-project package-release behavior and workflow safety invariants unchanged.

- [x] **Step 6: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/package-release.js packages/prism-core/config/bootstrap/release/cliff.toml tests/Node/prism-tool-package-release-discovery.test.js tests/Node/prism-tool-package-release-transaction.test.js tests/Shell/release_workflow_test.sh tests/Node/toolchain-packaging.test.js docs/plans/2026-08-25-release-management-capability.md
prism-tool commit create --type refactor --scope release --subject "share package release candidate rendering"
```

---

### Task 3: Render the trusted release-management profile

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/bootstrap-release-provider.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-profile-providers.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-providers.js`
- Modify: `tests/Node/prism-tool-bootstrap-capabilities.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `docs/plans/2026-08-25-release-management-capability.md`

**Interfaces:**
- `PROFILE_OUTPUTS['release-management']` is exactly:

```javascript
[
    'CHANGELOG.md',
    'cliff.toml',
    '.github/workflows/release.yml',
    '.prism/release.json',
]
```

- Add a focused renderer:

```javascript
function renderReleaseManagementProvider({
    coreRoot,
    candidateRoot,
    packageRoot,
    request,
}) {
    // Returns provider report schema version 1.
}
```

- `packageRoot` is the candidate tree from which ADR-0079 package discovery reads manifests; `candidateRoot` is the Core profile output root.
- The report identity remains:

```javascript
{
    id: 'release-management',
    packageName: '@kyaulabs/prism-core',
    packageVersion: '<exact core version>',
    protocolVersion: 1,
}
```

- The report has no network effects, one `release-management-render` PASS check, and one `release-management-inventory` verification using `setup project validate`.
- The renderer replaces every cliff repository token with the normalized metadata coordinate, writes all four outputs at mode `0644`, and uses `renderReleaseCapabilityFiles` for `.prism/release.json` and the workflow.

- [x] **Step 1: Write failing provider tests**

Create isolated candidate roots proving exact descriptor ownership, deterministic bytes, normalized coordinate rendering, non-empty package configuration, unchanged canonical workflow bytes, no output overlap, and no operation artifacts under `.pi/prism-tool/package-release`.

- [x] **Step 2: Add renderer failure tests**

Cover no publishable package, private-only packages, malformed package manifests/workspaces, stale or malformed normalized metadata, missing/duplicate cliff tokens, changed canonical workflow resources, candidate output collisions, and symlinked package roots.

- [x] **Step 3: Run focused tests to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/toolchain-packaging.test.js
```

Expected: FAIL because the release provider and four owned outputs are unavailable.

- [x] **Step 4: Implement the focused provider module**

Keep package discovery/rendering in `bootstrap-release-provider.js`; leave the existing governance/security profile renderers focused on their current surfaces. Delegate from `renderCoreProfileProviders` only when the selected ID is `release-management`.

- [x] **Step 5: Run focused tests to verify Green**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/toolchain-packaging.test.js
```

Expected: PASS with an exact four-file provider report and no mutation outside the candidate root.

- [x] **Step 6: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-release-provider.js packages/prism-core/scripts/prism-tool/bootstrap-profile-providers.js packages/prism-core/scripts/prism-tool/bootstrap-providers.js tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/toolchain-packaging.test.js docs/plans/2026-08-25-release-management-capability.md
prism-tool commit create --type feat --scope setup --subject "render release management provider"
```

---

### Task 4: Compose release management after adapter candidate preparation

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-plan.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Modify: `tests/Node/prism-tool-php-web-bootstrap.test.js`
- Modify: `docs/plans/2026-08-25-release-management-capability.md`

**Interfaces:**
- Extend profile rendering with an explicit package source:

```javascript
renderCoreProfileProviders({
    coreRoot,
    candidateRoot,
    packageRoot,
    request,
});
```

- Core-only plans pass the Core candidate root as `packageRoot`.
- Adapter plans render the adapter report first, then pass the adapter-owned candidate root as `packageRoot`, while preserving final provider order as Core baseline → selected profiles → adapter.
- Plan validation resolves the same package root and semantically revalidates release-management outputs from normalized metadata, current candidate manifests, and current Core resources.
- Retained reports remain exactly `profile-release-management.json`; unknown or unselected reports fail closed.

- [x] **Step 1: Write a successful public adapter-plan regression**

Use an isolated trusted adapter fixture whose candidate report owns a valid publishable npm root package. Through `prism-tool setup project plan`, select `release-management` and assert provider order, exact four outputs, candidate package list, normalized coordinate, no package-release operation artifacts, and a valid digest-bound plan.

- [x] **Step 2: Write unavailable-candidate regressions**

Prove current Blank Core-only and PHP/web private-only candidates reject selected release management before plan display, restore strict emptiness when ownership is proven, and do not fall back to an unconfigured repository-only profile.

- [x] **Step 3: Write Template and capability-independence regressions**

Prove Template may advertise but never preselect release management; selecting it requires advertisement and valid package candidates; selecting another capability neither triggers package discovery nor emits release files.

- [x] **Step 4: Run plan tests to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-php-web-bootstrap.test.js
```

Expected: FAIL because profiles are rendered before adapter candidates and release outputs are not semantically revalidated.

- [x] **Step 5: Reorder candidate preparation and add semantic validation**

Render adapter candidate state before release management without changing adapter ownership, normalized request data, provider composition order, report inventory, plan schemas, or established capability behavior. During validation, recompute expected release bytes and compare exact output digests/contents so rebound private digests cannot substitute package lists, workflow bytes, cliff links, or changelog content.

- [x] **Step 6: Run plan tests to verify Green**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-php-web-bootstrap.test.js
```

Expected: PASS with strict-empty cleanup on unavailable candidates and successful planning for the publishable adapter fixture.

- [x] **Step 7: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-plan.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-php-web-bootstrap.test.js docs/plans/2026-08-25-release-management-capability.md
prism-tool commit create --type feat --scope setup --subject "compose release management project plans"
```

---

### Task 5: Preserve release outputs through recovery, hooks, and root-seed evidence

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-journal.js` only if closed validation needs an explicit eighth-capability update
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-seed.js` only if explicit capability inventory logic requires it
- Modify: `packages/prism-core/scripts/prism-tool/hook.js` only if persisted manifest validation requires it
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-seed.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-capabilities.test.js`
- Modify: `docs/plans/2026-08-25-release-management-capability.md`

**Interfaces:**
- `.prism/project.json` persists:

```javascript
{
    capabilities: ['release-management'],
    capabilityMetadata: {
        'release-management': {repository: 'example-org/example-project'},
    },
}
```

- The durable inventory and seed include all four release outputs and their provider identity/digests.
- Operational package-release locks/plans, bootstrap reports/journals, credentials, remotes, tags, releases, and unrelated files remain excluded.
- Hook/project validation accepts the exact normalized release metadata and rejects malformed coordinates, changed package lists, changed workflow/cliff/changelog bytes, missing outputs, unselected outputs, and unknown capability fields.

- [x] **Step 1: Add durable apply and rollback regressions**

For the publishable adapter fixture, inject failures before durable application and assert strict emptiness. Apply successfully and inject post-durable drift/failure, asserting the complete four-file release surface and deterministic recovery phase remain.

- [x] **Step 2: Add rerun and hook validation regressions**

Prove unchanged canonical release state validates without rewriting; changed metadata, candidate package manifests, provider report, project manifest, workflow, config, cliff, or changelog fails closed. Confirm no package-release apply transaction runs during bootstrap recovery.

- [x] **Step 3: Add seed attestation and exact-staging regressions**

Prepare repository/hook/seed state and assert the attestation binds `release-management`, normalized coordinate metadata, provider/report digests, package configuration, canonical workflow, cliff config, changelog, and exact staged inventory. Reject omission, substitution, extra operational files, unexpected index entries, or candidate drift.

- [x] **Step 4: Run recovery and seed tests to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/prism-tool-bootstrap-seed.test.js
```

Expected: FAIL at the missing release continuity assertions.

- [x] **Step 5: Implement only required closed-validation updates**

Prefer the existing generic plan-output and seed-inventory mechanics. Modify journal, hook, or seed source only where an explicit seven-capability or metadata-shape assumption blocks the new profile; do not add release-specific mutation behavior there.

- [x] **Step 6: Run recovery and seed tests to verify Green**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/prism-tool-bootstrap-seed.test.js
```

Expected: PASS with release outputs included solely through the accepted generic provider/plan/seed contracts.

- [x] **Step 7: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-journal.js packages/prism-core/scripts/prism-tool/bootstrap-seed.js packages/prism-core/scripts/prism-tool/hook.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/prism-tool-bootstrap-seed.test.js docs/plans/2026-08-25-release-management-capability.md
prism-tool commit create --type feat --scope setup --subject "attest release management outputs"
```

During execution, stage only files that actually changed; do not touch generic journal/hook/seed modules if their existing contracts already pass the new tests.

---

### Task 6: Complete public regressions and documentation

**Files:**
- Modify: `packages/prism-core/README.md`
- Modify: `tests/Node/prism-tool-bootstrap-capabilities.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-seed.test.js`
- Modify: `tests/Node/prism-tool-php-web-bootstrap.test.js`
- Modify: `tests/Node/prism-tool-package-release-discovery.test.js`
- Modify: `tests/Node/prism-tool-package-release-transaction.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `tests/Shell/release_workflow_test.sh`
- Modify: `docs/plans/2026-08-25-release-management-capability.md`

**Interfaces:**
- The Core README documents the eighth disabled-by-default capability, intended-coordinate validation, exact four-file ownership, candidate eligibility, Template advertisement-only semantics, current Core-only/PHP-web unavailability, established-project parity, and human-owned remote/publication actions.
- Interactive prompt orchestration remains task 12; do not modify `packages/prism-core/prompts/setup.md` in task 11.

- [x] **Step 1: Add complete launcher regressions**

Cover metadata inspection, Blank and Template selection, publishable-adapter planning, plan validation, durable application, recovery, repository creation, hook activation, seed preparation, all-eight-capability composition, deterministic rerendering, identity preview, no preselection, and no external lookup.

- [x] **Step 2: Add established-project parity regressions**

Prove `prism-tool package-release inspect|plan|apply|verify` schemas/dispositions remain unchanged, repositories without managed release configuration remain repository-only, existing owned/migration/conflict behavior remains fail closed, and bootstrap selection never mutates established projects.

- [x] **Step 3: Add the final failure matrix**

Cover invalid coordinates, unavailable package candidates, malformed workspaces/manifests, private-only packages, duplicate package identities/tag prefixes, symlink and containment attacks, changed package discovery between reads, missing Template advertisement, provider overlap, stale resource/report/metadata/plan/journal evidence, pre-durable renderer failure, and post-durable output drift.

- [x] **Step 4: Document the public task-11 contract**

Explain that release management is opt-in, local-only during setup, package-candidate-gated, Core-owned, deterministic, and non-publishing. State explicitly that setup creates no GitHub repository or remote and that humans retain initial push, hosted configuration, releases, and npm publication.

- [x] **Step 5: Run focused and full verification**

Run:

```bash
node --test tests/Node/prism-tool-package-release-discovery.test.js tests/Node/prism-tool-package-release-transaction.test.js tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-php-web-bootstrap.test.js tests/Node/toolchain-packaging.test.js
bash tests/Shell/release_workflow_test.sh
npm run test:node
```

Expected: PASS with tasks 1–10 and established-project release behavior unchanged.

- [x] **Step 6: Mark the plan complete and create the closing commit**

Mark every completed checkbox in this plan, then load `verification-before-completion`.

```bash
git add packages/prism-core/README.md tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-php-web-bootstrap.test.js tests/Node/prism-tool-package-release-discovery.test.js tests/Node/prism-tool-package-release-transaction.test.js tests/Node/toolchain-packaging.test.js tests/Shell/release_workflow_test.sh docs/plans/2026-08-25-release-management-capability.md
prism-tool commit create --type test --scope setup --subject "regress release management capability bootstrap" --issue 391 --reference fixes
```

The final `Fixes: #391` trailer is deliberate. After the human merges the pull request, verify issue #391 closed before claiming task 12; if GitHub leaves it open, close it explicitly so epic #380 stays synchronized.

---

## Final verification

After every task is green:

1. Load `verification-before-completion` and rerun every focused command from the plan.
2. Run `npm run test:node` and `bash tests/Shell/run-all.sh`.
3. Run `/check` and resolve every failure without bypasses.
4. Confirm changed-file coverage meets the active adapter gate.
5. Confirm `git status --short` contains no debug artifacts, package-release operation leftovers, unplanned generated files, or modified minified assets.
6. Confirm no dependency, credential file, remote, pushed ref, tag, release, external lookup, package publication, or hosted mutation was introduced.
7. Hand the completed branch to `finishing-a-development-branch` for artifact cleanup, target synchronization, unlimited `/check` reruns, one four-axis review, revalidation, and preparation-only `/pr`.

## Self-review

- Spec coverage: independent disabled selection, intended coordinate metadata, no initial version, local validation, exact Core output ownership, canonical changelog/cliff/workflow/config rendering, package-candidate eligibility, Template advertisement-only behavior, Core-only/adapter behavior, no live lookup, established-project parity, durable recovery, exact staging, seed attestation, and human publication boundaries each map to a task.
- Deliberate deferral: interactive `/setup` sequencing, question wording, disclosure order, plan/hook gates, and final reporting remain task 12.
- Placeholder scan: no unresolved placeholder, unspecified output path, or deferred task-11 implementation instruction remains. `{{REPOSITORY_COORDINATE}}` is an intentional validated packaged-resource token with exact replacement rules.
- Type consistency: `release-management`, `release-management.repository`, normalized `repository`, `renderReleaseCapabilityFiles`, `renderReleaseManagementProvider`, `profile-release-management.json`, and the four output paths remain consistent across metadata, rendering, planning, validation, recovery, hooks, documentation, and seed evidence.
- Architecture: the task extends ADR-0079 and ADR-0082 without nesting mutation transactions, moving stack behavior into Core, adding external authority, or requiring a new ADR.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
