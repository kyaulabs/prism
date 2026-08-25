# Governance and Collaboration Capabilities Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Add independent disabled-by-default licensing, community-governance, and GitHub-collaboration providers to strict-empty Blank and Template bootstrap plans, with closed metadata, deterministic rendering, durable recovery, and exact root-seed evidence.

**Architecture:** Keep capability selection and metadata normalization in Prism Core, then invoke one trusted optional-profile provider per selected capability. The Core baseline remains the sole owner of `.prism/project.json`; it records the selected capability IDs and canonical normalized metadata, while profile providers own only their exact generated governance or collaboration paths. Blank and Template share the same local provider registry, report composition, durable transaction, hook validation, and root-seed path.

**Tech Stack:** Node.js 22+, CommonJS, Node's built-in test runner, packaged UTF-8 resources, existing `prism-tool` bootstrap provider/report protocol version 1.

## Global constraints

- The supported task-9 capability IDs are exactly `licensing`, `community-governance`, and `github-collaboration`, in that canonical order.
- Every capability is disabled by default. Capabilities never imply one another, and Template advertisements never preselect a capability.
- Licensing initially supports the closed SPDX catalogue `AGPL-3.0-only` and `MIT`; both require a normalized copyright holder in this renderer contract.
- The normalized licensing year is the UTC year at plan preparation and is persisted in canonical metadata so later validation and rerendering do not change at a calendar boundary.
- Community governance requires one normalized conduct contact: either an email address or an absolute `https:` URL.
- GitHub collaboration requires no capability-specific metadata.
- Core owns `.prism/project.json`, `README.md`, `LICENSE`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, and `.github/pull_request_template.md` as declared by the selected Core providers.
- Collaboration templates contain no labels, assignees, repository coordinates, operating-system diagnostics, support destination, or other project identity.
- Adapter providers receive the selected capability IDs and normalized metadata as inert context but never render, modify, or overlap Core profile outputs.
- Metadata validation performs no network lookup. Unknown fields, duplicate or unavailable selections, control characters, malformed contacts, excessive values, stale digests, and provider overlap fail closed.
- Template mode requires every selected capability to be advertised by the immutable validated catalogue. Blank mode performs no Template acquisition.
- Pre-durable failure restores strict emptiness when ownership is proven; post-durable failure retains the complete project and deterministic recovery state.
- Setup creates no remote, performs no authenticated GitHub operation, and publishes nothing.
- No new dependency, Pi extension, safe directory, external API, or template engine is introduced.
- Every created or modified `.js` file retains the required RCS header and vim modeline.

---

### Task 1: Define closed capability selection and canonical metadata

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/bootstrap-capabilities.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-metadata.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Create: `tests/Node/prism-tool-bootstrap-capabilities.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`

**Interfaces:**
- Produces from `bootstrap-capabilities.js`:

```javascript
const TASK_NINE_CAPABILITIES = Object.freeze([
    'licensing',
    'community-governance',
    'github-collaboration',
]);

function normalizeCapabilitySelection(value) {}
function inspectCapabilityMetadata({projectRoot, capabilities}) {}
function validateNormalizedProjectMetadata({metadata, capabilities}) {}
```

- `normalizeCapabilitySelection('')` returns `[]`; a comma-separated non-empty selection returns unique IDs in canonical order and rejects whitespace, duplicates, unknown IDs, empty segments, and IDs outside task 9.
- Project-plan input remains backward compatible for the minimal profile:

```javascript
{
    schemaVersion: 1,
    displayName: 'Example Project',
    summary: 'A deterministic project.',
}
```

- A selected-profile input adds exactly one `capabilityMetadata` record:

```javascript
{
    schemaVersion: 1,
    displayName: 'Example Project',
    summary: 'A deterministic project.',
    capabilityMetadata: {
        licensing: {
            spdxId: 'MIT',
            copyrightHolder: 'Example Organization',
        },
        'community-governance': {
            conductContact: 'conduct@example.test',
        },
        'github-collaboration': {},
    },
}
```

- Normalized metadata always has this closed shape:

```javascript
{
    schemaVersion: 1,
    displayName: 'Example Project',
    summary: 'A deterministic project.',
    capabilityMetadata: {
        licensing: {
            spdxId: 'MIT',
            year: 2026,
            copyrightHolder: 'Example Organization',
        },
        'community-governance': {
            conductContact: {
                kind: 'email',
                value: 'conduct@example.test',
            },
        },
        'github-collaboration': {},
    },
}
```

- [x] **Step 1: Write failing capability and metadata tests**

Through the public launcher seam, add tests proving:

1. omitting `--capabilities` selects none;
2. `--capabilities=licensing,community-governance,github-collaboration` normalizes into canonical order;
3. duplicates, whitespace variants, unknown IDs, empty segments, and a later-epic ID such as `security-disclosure` return usage or transaction failure without changing the project root;
4. metadata inspection returns only `displayName` and `summary` for the minimal profile;
5. licensing adds `licensing.spdxId` and `licensing.copyrightHolder` fields with the two supported SPDX choices;
6. community governance adds only `community-governance.conductContact`;
7. GitHub collaboration adds no metadata field;
8. identity-bearing fields include publication targets in the inspection report; and
9. package tests require the new module.

- [x] **Step 2: Run the focused tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/toolchain-packaging.test.js`

Expected: FAIL because the capability module and `--capabilities` contract do not exist.

- [x] **Step 3: Implement selection and inspection**

Add the closed task-9 catalogue, deterministic ordering, exact CLI parsing, and dynamic metadata inspection. Extend both:

```text
prism-tool setup project metadata --source=template|blank --adapter=core-only|PACKAGE [--capabilities=CSV] [--json]
prism-tool setup project plan --source=template|blank --adapter=core-only|PACKAGE [--attempt=UUID] [--capabilities=CSV] [--network-approved=yes] [--json]
```

Keep the source/network/adapter rules unchanged. Metadata inspection must be read-only and strict-empty, and it must expose publication targets without rendering files.

- [x] **Step 4: Implement closed metadata normalization**

Extend `normalizeProjectMetadata()` to accept `{capabilities, currentYear}`. Validate UTF-8, NFC, bounds, exact keys, the two SPDX identifiers, holder text, email/HTTPS conduct contacts, and the empty collaboration record. Store conduct contacts as `{kind, value}` and inject a safe integer UTC year from `new Date().getUTCFullYear()` unless the test context supplies `currentYear`.

Export `validateNormalizedProjectMetadata()` for plan, durable-project, hook, and seed revalidation. It must validate persisted normalized data without recomputing the year.

- [x] **Step 5: Run the focused tests and verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/toolchain-packaging.test.js`

Expected: PASS with no filesystem mutation and no external lookup.

- [x] **Step 6: Commit the selection and metadata slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-capabilities.js packages/prism-core/scripts/prism-tool/bootstrap-metadata.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/toolchain-packaging.test.js
prism-tool commit create --type feat --scope setup --subject "define governance capability metadata" --issue 389 --reference refs
```

---

### Task 2: Render trusted licensing, governance, and collaboration providers

**Files:**
- Create: `packages/prism-core/config/bootstrap/licenses/AGPL-3.0-only.txt`
- Create: `packages/prism-core/config/bootstrap/licenses/MIT.txt`
- Create: `packages/prism-core/config/bootstrap/community/contributor-covenant-2.1.md`
- Create: `packages/prism-core/scripts/prism-tool/bootstrap-profile-providers.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-providers.js`
- Modify: `tests/Node/prism-tool-bootstrap-capabilities.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`

**Interfaces:**
- Produces:

```javascript
function loadCoreProfileProviderDescriptors({coreRoot, capabilities}) {}
function renderCoreProfileProviders({coreRoot, candidateRoot, request}) {}
```

- Provider ownership is exact:

```javascript
{
    licensing: ['LICENSE'],
    'community-governance': ['CODE_OF_CONDUCT.md', 'CONTRIBUTING.md'],
    'github-collaboration': [
        '.github/ISSUE_TEMPLATE/bug_report.yml',
        '.github/ISSUE_TEMPLATE/feature_request.yml',
        '.github/pull_request_template.md',
    ],
}
```

- [x] **Step 1: Write failing provider-rendering tests**

Create candidate-root tests that call the trusted provider boundary with each capability independently and all three together. Assert exact provider identities, output paths, modes `0644`, SHA-256 digests, empty effects, one PASS check, one verification declaration, and byte-for-byte deterministic rerendering from the same normalized request.

Assert overlap, an unselected metadata record, a selected capability missing metadata, changed package resources, unsupported SPDX IDs, and a request containing a later-epic capability fail before a valid report is returned.

- [x] **Step 2: Run the focused tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/toolchain-packaging.test.js`

Expected: FAIL because profile descriptors, resources, and renderers do not exist.

- [x] **Step 3: Add packaged reviewed resources**

Copy the repository's current `LICENSE` bytes verbatim into `AGPL-3.0-only.txt`. Add the standard MIT license text to `MIT.txt` with the rendered copyright line supplied by code. Add the Contributor Covenant 2.1 body from the repository's current `CODE_OF_CONDUCT.md`, replacing only the repository-specific enforcement destination with one exact renderer token.

The provider must read each resource through the existing bounded, no-follow regular-file seam and verify package identity before rendering.

- [x] **Step 4: Implement deterministic profile rendering**

Render:

- `LICENSE` from the selected packaged SPDX resource plus persisted year/holder;
- `CODE_OF_CONDUCT.md` from Contributor Covenant 2.1 with the normalized mailto or HTTPS enforcement destination;
- `CONTRIBUTING.md` with generic Prism branch, TDD, verification, signed-commit, human-push, and pull-request guidance and no repository coordinate;
- two GitHub issue-form YAML files with neutral summaries, descriptions, reproduction/acceptance fields, and no labels or assignees; and
- one neutral pull-request Markdown template with Summary, Changes, Verification, and Checklist sections.

Use trusted code-owned string rendering only; do not accept remote or caller-provided templates, paths, labels, or fragments.

- [x] **Step 5: Register closed provider descriptors**

Extend `loadTrustedProviderRegistry()` to return `core-baseline` plus only the selected profile descriptors. Each descriptor uses package `@kyaulabs/prism-core`, the installed exact version, protocol 1, its exact output list, no effects, and one fixed check/verification declaration.

- [x] **Step 6: Run the focused tests and verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/toolchain-packaging.test.js`

Expected: PASS with resources included in the packed Core package.

- [x] **Step 7: Commit the trusted renderer slice**

```bash
git add packages/prism-core/config/bootstrap/licenses/AGPL-3.0-only.txt packages/prism-core/config/bootstrap/licenses/MIT.txt packages/prism-core/config/bootstrap/community/contributor-covenant-2.1.md packages/prism-core/scripts/prism-tool/bootstrap-profile-providers.js packages/prism-core/scripts/prism-tool/bootstrap-providers.js tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/toolchain-packaging.test.js
prism-tool commit create --type feat --scope setup --subject "render governance capability providers" --issue 389 --reference refs
```

---

### Task 3: Compose selected profiles into Blank and Template project plans

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-plan.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-providers.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-source.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-capabilities.test.js`

**Interfaces:**
- Provider request remains:

```javascript
{
    schemaVersion: 1,
    source,
    capabilities: ['licensing', 'community-governance', 'github-collaboration'],
    metadata: normalizedMetadata,
    adapter,
}
```

- Plan `providers`, `outputs`, `checks`, and `verification` become dynamic: Core baseline, selected profiles in canonical capability order, then the adapter provider when present.
- Persist selected profile reports as launcher-owned files named from the closed registry:

```text
reports/profile-licensing.json
reports/profile-community-governance.json
reports/profile-github-collaboration.json
```

- [x] **Step 1: Write failing plan-composition tests**

Through `prism-tool setup project plan`, cover Blank and Template, Core-only and PHP/web, for each individual capability and all three together. Assert:

1. default plans remain capability-free with the existing seven Core outputs;
2. selected capability IDs are canonical and appear in `.prism/project.json`;
3. normalized capability metadata is present in `.prism/project.json` and hashes into `metadataDigest`;
4. provider order and output ownership are deterministic;
5. selected profile report files are mode `0600` beneath the active attempt;
6. Template requires the selected advertisement but never derives selection from the manifest;
7. Blank performs no Template request; and
8. adapter output bytes and effects are unchanged by Core profile selection.

- [x] **Step 2: Run the focused tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-capabilities.test.js`

Expected: FAIL because project planning still requires an empty capability list and one or two providers.

- [x] **Step 3: Generalize Core and adapter provider requests**

Replace every `capabilities: []` restriction with closed task-9 selection validation. Pass normalized selected IDs and metadata to Core baseline, profile providers, and the adapter provider. The Core baseline must render `.prism/project.json` with exact top-level keys:

```javascript
[
    'schemaVersion', 'source', 'capabilities', 'project',
    'capabilityMetadata', 'adapter', 'compatibility',
]
```

Keep profile metadata out of README except for deterministic links to selected generated documents.

- [x] **Step 4: Compose and persist dynamic reports**

Render and validate Core baseline, each selected profile provider, and the optional adapter report against one closed registry. Run `composeProviderReports()` once across the complete set so exact-path and prefix overlap fail before plan display. Persist and restore each report through registry-derived filenames rather than caller-provided names.

- [x] **Step 5: Generalize plan validation**

Validate unique canonical capabilities, dynamic provider count, exact provider order, one check and verification declaration per provider, normalized metadata, source catalogue continuity, and exact report/output recomposition. Unknown profile report files or a missing selected report make the attempt stale.

- [x] **Step 6: Run the focused tests and verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-capabilities.test.js`

Expected: PASS for all source/adapter combinations with unchanged minimal plans.

- [x] **Step 7: Commit the plan-composition slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-plan.js packages/prism-core/scripts/prism-tool/bootstrap-providers.js packages/prism-core/scripts/prism-tool/bootstrap-source.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-capabilities.test.js
prism-tool commit create --type feat --scope setup --subject "compose governance capability plans" --issue 389 --reference refs
```

---

### Task 4: Preserve capability metadata through durable application and hook checks

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-transaction.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-journal.js`
- Modify: `packages/prism-core/scripts/prism-tool/hook.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Modify: `tests/Shell/bootstrap_hook_dispatch_test.sh`

**Interfaces:**
- The journal continues to bind `metadataDigest`; plan validation proves the canonical metadata and selected capabilities before every phase transition.
- Durable `.prism/project.json` is the canonical rerender input for selected Core profiles.

- [x] **Step 1: Write failing continuity and hook tests**

After planning, independently mutate the selected capability list, normalized holder, persisted licensing year, conduct-contact kind/value, profile report, profile output, metadata digest, candidate manifest, durable manifest, and journal metadata digest. Assert validation, apply, recovery, hook dispatch, and durable revalidation fail closed before further mutation.

Add hook tests for Blank and Template manifests with all three selected capabilities and for invalid order, duplicates, unknown IDs, missing metadata, extra metadata, and malformed conduct contacts. Assert adapter quality still runs only when an adapter is present.

- [x] **Step 2: Run the focused tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js && bash tests/Shell/bootstrap_hook_dispatch_test.sh`

Expected: FAIL because durable and hook validation still require an empty capability array and do not validate canonical capability metadata.

- [x] **Step 3: Enforce durable metadata continuity**

Use `validateNormalizedProjectMetadata()` in plan restoration and durable project validation. Compare manifest capabilities and `capabilityMetadata` byte-for-byte to the plan, require every selected output in the applied inventory, and retain the existing pre-/post-durable rollback boundary.

Do not parse generated `LICENSE`, governance documents, or GitHub templates as metadata; `.prism/project.json` remains canonical.

- [x] **Step 4: Generalize hook project validation**

Replace the hook's Blank-only, empty-capability checks with `validateBootstrapSource()` plus the task-9 capability and normalized-metadata validators. Preserve package-version, adapter-identity, local-readiness, Core-only, and adapter-quality behavior.

- [x] **Step 5: Run the focused tests and verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-plan.test.js && bash tests/Shell/bootstrap_hook_dispatch_test.sh`

Expected: PASS with no generated-document parsing and no source-dependent capability behavior.

- [x] **Step 6: Commit the durable continuity slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-transaction.js packages/prism-core/scripts/prism-tool/bootstrap-journal.js packages/prism-core/scripts/prism-tool/hook.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Shell/bootstrap_hook_dispatch_test.sh
prism-tool commit create --type feat --scope setup --subject "bind governance metadata through recovery" --issue 389 --reference refs
```

---

### Task 5: Attest and stage selected capability outputs in the root seed

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-seed.js`
- Modify: `tests/Node/prism-tool-bootstrap-seed.test.js`

**Interfaces:**
- Seed attestation adds an exact `capabilities` array beside `providers` and `metadataDigest`.
- Exact seed entries remain `plan.outputs` plus adapter activation when present; no operational report or resource path is staged.

- [x] **Step 1: Write failing seed tests**

Prepare Blank and Template Core-only seeds and one selected-adapter seed with all three capabilities. Assert the attestation binds capabilities, all Core provider identities, metadata digest, adapter evidence, plan digest, applied inventory, journal digest, hook inventory, and staged-index digest.

Assert the staged inventory contains the selected generated outputs and excludes `reports/`, packaged resource paths, `.pi/prism-tool/`, Template blobs, source catalogues, and any remote state.

- [x] **Step 2: Run the focused tests and verify Red**

Run: `node --test tests/Node/prism-tool-bootstrap-seed.test.js`

Expected: FAIL because the active seed attestation does not yet declare or validate selected capabilities.

- [x] **Step 3: Bind capabilities into seed evidence**

Add `capabilities` to attestation creation and closed validation. Require exact equality with the durable plan and project manifest. Keep the existing provider digest, metadata digest, source, adapter, journal, hook, index, and one-use checks unchanged.

- [x] **Step 4: Add substitution and exclusion regressions**

Mutate one capability ID/order, provider identity, metadata digest, rendered output, and staged entry at a time. Assert readiness or completion fails without silently changing the index or consuming the attestation.

- [x] **Step 5: Run the focused tests and verify Green**

Run: `node --test tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-bootstrap-plan.test.js`

Expected: PASS for Blank and Template, Core-only and selected-adapter roots.

- [x] **Step 6: Commit the seed-attestation slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-seed.js tests/Node/prism-tool-bootstrap-seed.test.js
prism-tool commit create --type feat --scope setup --subject "attest governance capability outputs" --issue 389 --reference refs
```

---

### Task 6: Complete public regressions and documentation

**Files:**
- Modify: `tests/Node/prism-tool-bootstrap-capabilities.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-seed.test.js`
- Modify: `tests/Node/prism-tool-php-web-bootstrap.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `packages/prism-core/README.md`
- Modify: `docs/plans/2026-08-25-governance-collaboration-capabilities.md`

**Interfaces:**
- Produces end-to-end task-9 evidence through the public launcher. Interactive prompt orchestration remains task 12.

- [ ] **Step 1: Add public Core-only end-to-end regressions**

Exercise metadata inspection, Blank and Template planning, plan validation, durable application, recovery, repository creation, hook activation, and seed preparation with each capability independently and all together. Assert capability independence, zero default selection, deterministic rerendering, publication preview data, exact output inventory, no Template preselection, and no network lookup beyond the already authorized Template source sequence.

- [ ] **Step 2: Add selected-adapter parity regressions**

Prove the PHP/web adapter receives normalized decisions but owns none of the profile paths, its report/effects/checks remain source- and capability-independent, and Core profile selection composes without adapter overlap.

- [ ] **Step 3: Add the failure matrix**

Cover invalid SPDX IDs, malformed holders, invalid conduct contacts, unknown/duplicate capability selection, missing Template advertisement, changed package resources, profile overlap, stale metadata, pre-durable renderer failure, and post-durable output drift. Assert strict-empty restoration or exact retained recovery state as appropriate.

- [ ] **Step 4: Document the public task-9 contract**

Update the Core README with the three available disabled-by-default capabilities, exact output ownership, supported SPDX IDs, closed metadata rules, deterministic persisted year/contact behavior, Template advertisement-only semantics, and the statement that prompt orchestration for selecting them is completed separately.

Do not modify `packages/prism-core/prompts/setup.md`; interactive selection, one-question-at-a-time metadata collection, and preview confirmation belong to task 12.

- [ ] **Step 5: Run focused and full Node verification**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-php-web-bootstrap.test.js tests/Node/toolchain-packaging.test.js
npm run test:node
```

Expected: PASS with minimal-profile, Template, Blank, Core-only, adapter, recovery, hook, and seed regressions green.

- [ ] **Step 6: Mark the plan complete and commit with the closing reference**

Mark every completed checkbox in this plan, then load `verification-before-completion`.

```bash
git add tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-php-web-bootstrap.test.js tests/Node/toolchain-packaging.test.js packages/prism-core/README.md docs/plans/2026-08-25-governance-collaboration-capabilities.md
prism-tool commit create --type test --scope setup --subject "regress governance capability bootstrap" --issue 389 --reference fixes
```

The final `Fixes: #389` trailer is deliberate: after the human merges the pull request, GitHub closes task 9 and advances epic #380 to 9/12.

---

## Final verification

After every task is green:

1. Load `verification-before-completion` and rerun every focused command from the plan.
2. Run `npm run test:node`.
3. Run `/check` and resolve every failure without bypasses.
4. Confirm `git status --short` contains no debug artifacts, unplanned generated files, or modified minified assets.
5. Confirm no dependency, credential file, remote, pushed ref, external lookup, or hosted mutation was introduced.
6. Hand the completed branch to `finishing-a-development-branch` for artifact cleanup, target synchronization, unlimited `/check` reruns, one four-axis review, revalidation, and preparation-only `/pr`.

## Self-review

- Spec coverage: disabled-by-default selection, capability independence, closed metadata, identity preview data, two supported SPDX IDs, persisted current year, Contributor Covenant rendering, neutral collaboration templates, Template advertisement-only behavior, Blank/Template parity, provider ownership, overlap rejection, durable recovery, exact staging, and seed attestation are each assigned to a task.
- Deliberate deferral: security disclosure, repository ownership, support, funding, release management, and interactive prompt orchestration remain tasks 10–12.
- Placeholder scan: no unresolved placeholder, unspecified output path, or deferred implementation instruction remains.
- Type consistency: `capabilities`, `capabilityMetadata`, provider IDs, report filenames, metadata digest, and attestation fields use the same names across metadata, providers, plans, journal validation, durable application, hooks, and seed evidence.
- Tracker continuity: intermediate commits use `Refs: #389`; the final regression commit uses `Fixes: #389` so the completed sub-issue closes on merge.
