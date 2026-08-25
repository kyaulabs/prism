# Security and Project-Identity Capabilities Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Add independent disabled-by-default security-disclosure, repository-ownership, support-routing, and funding providers to strict-empty Blank and Template bootstrap projects, with closed metadata, deterministic rendering, durable recovery, and exact root-seed evidence.

**Architecture:** Extend the existing Core capability catalogue and metadata broker rather than adding another setup path. Each selected capability invokes one trusted Core profile provider with exact path ownership; `.prism/project.json` remains the canonical normalized renderer input, while Blank and Template continue through the same provider composition, transaction, recovery, hook, and root-seed contracts.

**Tech Stack:** Node.js 22+, CommonJS, Node's built-in test runner, existing `prism-tool` bootstrap provider/report protocol version 1, deterministic Markdown/YAML text rendering without new dependencies.

## Global constraints

- The canonical capability order becomes `licensing`, `community-governance`, `github-collaboration`, `security-disclosure`, `repository-ownership`, `support-routing`, `funding`.
- Every capability is independent and disabled by default. Template may advertise but never preselect a capability.
- Security disclosure requires one normalized email address or credential-free absolute HTTPS reporting destination and one supported-version policy.
- Supported-version policies are exactly `current-development`, `latest-release`, `latest-major-line`, and `custom`.
- A custom supported-version policy requires 1–20 ordered rows, each with a unique normalized version label and status `supported` or `unsupported`; non-custom policies accept no rows.
- Security acknowledgement timing is optional. When supplied it is an integer from 1 through 8760 hours; no acknowledgement promise is rendered when absent.
- Repository ownership requires 1–20 unique normalized GitHub owners in `@user` or `@org/team` form. It may add at most 50 unique root-contained path rules, each with 1–20 owners.
- Ownership patterns must begin with `/`, contain no whitespace, backslash, control character, `!`, `#`, `..` segment, or absolute/escaping normalization, and may use only ordinary path characters plus `*`, `**`, and `?` glob syntax.
- Support routing requires one credential-free absolute HTTPS destination. Optional display label and description default to `Support` and `Get help with this project.`.
- Support-only rendering keeps `blank_issues_enabled: true`; selecting GitHub collaboration and support together renders `blank_issues_enabled: false`.
- Funding accepts 1–15 records from the closed provider order `github`, `patreon`, `open_collective`, `ko_fi`, `tidelift`, `community_bridge`, `liberapay`, `issuehunt`, `lfx_crowdfunding`, `polar`, `thanks_dev`, `custom`.
- `github` and `custom` accept at most four records each; every other funding provider accepts at most one. Custom records require credential-free absolute HTTPS destinations; other records require bounded provider account identifiers.
- Core owns `SECURITY.md`, `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/config.yml`, and `.github/FUNDING.yml` for these four providers.
- Metadata validation performs no live GitHub, email, support-service, or funding-account lookup.
- Identity-bearing metadata is exposed by inspection with exact publication targets and persists only after complete project-plan approval.
- Unknown fields, duplicate values, excessive values, control characters, malformed contacts, invalid owners, escaping patterns, unsupported providers/policies, stale digests, and provider ownership overlap fail closed.
- Adapter providers receive selected capability IDs and normalized metadata as inert context but never render or overlap Core profile paths.
- Pre-durable failure restores strict emptiness when ownership is proven; post-durable failure retains the complete project and deterministic recovery state.
- Setup creates no remote, performs no authenticated GitHub operation, and publishes nothing.
- No new dependency, Pi extension, safe directory, external API, or template engine is introduced.
- Every created or modified `.js` file retains the required RCS header and vim modeline.
- Interactive prompt orchestration remains task 12; this task exposes and verifies the public launcher contract only.

---

### Task 1: Expand the closed capability catalogue and metadata contract

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-capabilities.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-metadata.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-plan.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-profile-providers.js`
- Test: `tests/Node/prism-tool-bootstrap-capabilities.test.js`
- Test: `tests/Node/toolchain-packaging.test.js`

**Interfaces:**
- Rename `TASK_NINE_CAPABILITIES` to `PROJECT_CAPABILITIES` and export the seven IDs in canonical order.
- Metadata inspection adds these exact fields and publication targets:

```javascript
{
    securityDisclosure: {
        fields: [
            'security-disclosure.reportingContact',
            'security-disclosure.supportedVersionPolicy',
            'security-disclosure.supportedVersionRows',
            'security-disclosure.acknowledgementHours',
        ],
        outputs: ['SECURITY.md'],
    },
    repositoryOwnership: {
        fields: [
            'repository-ownership.owners',
            'repository-ownership.rules',
        ],
        outputs: ['.github/CODEOWNERS'],
    },
    supportRouting: {
        fields: [
            'support-routing.destination',
            'support-routing.displayLabel',
            'support-routing.description',
        ],
        outputs: ['.github/ISSUE_TEMPLATE/config.yml'],
    },
    funding: {
        fields: ['funding.records'],
        outputs: ['.github/FUNDING.yml'],
    },
}
```

- Raw selected-capability metadata uses this closed shape:

```javascript
{
    'security-disclosure': {
        reportingContact: 'security@example.test',
        supportedVersionPolicy: 'custom',
        supportedVersionRows: [
            {version: '2.x', status: 'supported'},
            {version: '1.x', status: 'unsupported'},
        ],
        acknowledgementHours: 72,
    },
    'repository-ownership': {
        owners: ['@example', '@example/core'],
        rules: [
            {pattern: '/docs/**', owners: ['@example/docs']},
        ],
    },
    'support-routing': {
        destination: 'https://example.test/support',
        displayLabel: 'Project support',
        description: 'Ask usage and troubleshooting questions.',
    },
    funding: {
        records: [
            {provider: 'github', account: 'example'},
            {provider: 'custom', destination: 'https://example.test/fund'},
        ],
    },
}
```

- Normalized persisted metadata uses this exact shape:

```javascript
{
    'security-disclosure': {
        reportingContact: {kind: 'email', value: 'security@example.test'},
        supportedVersions: {
            policy: 'custom',
            rows: [
                {version: '2.x', status: 'supported'},
                {version: '1.x', status: 'unsupported'},
            ],
        },
        acknowledgementHours: 72,
    },
    'repository-ownership': {
        owners: ['@example', '@example/core'],
        rules: [
            {pattern: '/docs/**', owners: ['@example/docs']},
        ],
    },
    'support-routing': {
        destination: 'https://example.test/support',
        displayLabel: 'Project support',
        description: 'Ask usage and troubleshooting questions.',
    },
    funding: {
        records: [
            {provider: 'github', value: 'example'},
            {provider: 'custom', value: 'https://example.test/fund'},
        ],
    },
}
```

- [x] **Step 1: Write failing selection, inspection, and normalization tests**

Add public metadata-inspection tests for each new capability and all seven in non-canonical input order. Replace the former rejection of `security-disclosure` with acceptance, while retaining rejection of duplicate, whitespace, empty-segment, unknown, and task-11 `release-management` selections.

Add normalization tests using the exact fixtures above plus policy-only security metadata:

```javascript
const policyOnly = {
    'security-disclosure': {
        reportingContact: 'https://security.example.test/report',
        supportedVersionPolicy: 'latest-release',
    },
};
```

Add table-driven rejection tests for unknown keys, malformed email/HTTP/credential URLs, non-custom rows, empty/duplicate/oversized custom rows, invalid acknowledgement hours, malformed owners, duplicate owners/rules, escaping ownership patterns, missing support destination, unsafe support text, duplicate/unsupported funding providers, excessive provider records, malformed account IDs, and insecure custom destinations.

- [x] **Step 2: Run focused tests and verify Red**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/toolchain-packaging.test.js
```

Expected: FAIL because the closed catalogue still rejects task-10 IDs and the metadata broker has no task-10 schemas.

- [x] **Step 3: Implement canonical selection and inspection**

Replace every production reference to `TASK_NINE_CAPABILITIES` with `PROJECT_CAPABILITIES`. Extend `inspectCapabilityMetadata()` with required/optional markers, choices, count bounds, and publication targets for the four new capabilities without mutating the root.

- [x] **Step 4: Implement closed normalization and persisted validation**

Refactor the existing contact validator into a label-aware email-or-HTTPS helper shared by conduct and security contacts. Add bounded helpers for optional single-line text, GitHub owner IDs, contained ownership patterns, security policy rows, support fields, and funding records. `validateNormalizedProjectMetadata()` must reconstruct and compare normalized values without live lookup or calendar-dependent recomputation.

- [x] **Step 5: Run focused tests and verify Green**

Run the Step 2 command.

Expected: PASS with all seven capabilities in canonical order and no filesystem or network effect.

- [x] **Step 6: Commit the metadata slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-capabilities.js packages/prism-core/scripts/prism-tool/bootstrap-metadata.js packages/prism-core/scripts/prism-tool/bootstrap-plan.js tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/toolchain-packaging.test.js
prism-tool commit create --type feat --scope setup --subject "define security identity capability metadata" --issue 390 --reference refs
```

---

### Task 2: Render trusted security and repository-ownership providers

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-profile-providers.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-providers.js`
- Test: `tests/Node/prism-tool-bootstrap-capabilities.test.js`

**Interfaces:**
- Add exact provider ownership:

```javascript
{
    'security-disclosure': ['SECURITY.md'],
    'repository-ownership': ['.github/CODEOWNERS'],
}
```

- `SECURITY.md` renders one of these supported-version sections:

```markdown
## Supported versions

Security fixes are provided for the current development branch.
```

```markdown
## Supported versions

| Version | Supported |
| --- | --- |
| 2.x | Yes |
| 1.x | No |
```

- It always renders the normalized reporting route and conditionally renders this sentence only when explicitly supplied:

```markdown
We aim to acknowledge complete vulnerability reports within 72 hours.
```

- `.github/CODEOWNERS` renders deterministic tab-separated records with the default rule first:

```text
*\t@example @example/core
/docs/**\t@example/docs
```

- [x] **Step 1: Write failing renderer and ownership tests**

Add provider tests for email and HTTPS security routes, every supported-version policy, custom rows, absent/present acknowledgement timing, default ownership, path-specific ownership, canonical provider identities, output modes `0644`, SHA-256 digests, empty effects, one PASS check, one verification declaration, and deterministic rerendering.

Assert rendered security content contains no timing promise when `acknowledgementHours` is absent. Assert CODEOWNERS contains no path outside the normalized rules and no owner omitted or inferred.

- [x] **Step 2: Run focused tests and verify Red**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-capabilities.test.js
```

Expected: FAIL because the profile registry has no security or ownership renderer.

- [x] **Step 3: Implement deterministic security rendering**

Add `renderSecurityDisclosure()` using only normalized metadata. Escape Markdown link labels with the existing trusted helper, render fixed policy wording for the three non-custom policies, render custom rows from normalized labels/statuses, and omit acknowledgement wording unless the integer exists.

- [x] **Step 4: Implement deterministic CODEOWNERS rendering**

Add `renderRepositoryOwnership()` with `*` followed by normalized owners and each normalized path rule in user-approved order. Render one trailing newline, one tab between pattern and owner list, and no comments, repository coordinates, or inferred teams.

- [x] **Step 5: Register the two providers and README links**

Extend `PROFILE_OUTPUTS`, provider check labels, renderer dispatch, and `projectReadme()` links. The trusted registry must expose only selected descriptors in canonical capability order.

- [x] **Step 6: Run focused tests and verify Green**

Run the Step 2 command.

Expected: PASS with deterministic, non-overlapping `SECURITY.md` and `.github/CODEOWNERS` reports.

- [x] **Step 7: Commit the security and ownership renderer slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-profile-providers.js packages/prism-core/scripts/prism-tool/bootstrap-providers.js tests/Node/prism-tool-bootstrap-capabilities.test.js
prism-tool commit create --type feat --scope setup --subject "render security and ownership providers" --issue 390 --reference refs
```

---

### Task 3: Render trusted support-routing and funding providers

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-profile-providers.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-providers.js`
- Test: `tests/Node/prism-tool-bootstrap-capabilities.test.js`

**Interfaces:**
- Add exact provider ownership:

```javascript
{
    'support-routing': ['.github/ISSUE_TEMPLATE/config.yml'],
    funding: ['.github/FUNDING.yml'],
}
```

- Support-only output is exact YAML-compatible text:

```yaml
blank_issues_enabled: true
contact_links:
  - name: "Support"
    url: "https://example.test/support"
    about: "Get help with this project."
```

- Support plus GitHub collaboration changes only the first value to `false`.
- Funding output follows closed provider order and emits scalar values for single-record providers and JSON-compatible YAML arrays for multi-record `github` or `custom` values:

```yaml
github: ["example", "example-team"]
open_collective: "example"
custom: ["https://example.test/fund"]
```

- [x] **Step 1: Write failing support and funding renderer tests**

Add independent support and funding provider tests, default and explicit support labels/descriptions, support-only versus collaboration-plus-support blank-issue behavior, every funding provider, multi-value GitHub/custom limits, canonical provider ordering, exact outputs/modes/digests, deterministic rerendering, and no live lookup.

Add negative renderer-boundary tests proving normalized request validation rejects changed capability metadata, unsupported providers, insecure destinations, and output overlap before returning a valid report.

- [x] **Step 2: Run focused tests and verify Red**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-capabilities.test.js
```

Expected: FAIL because support and funding providers are unavailable.

- [x] **Step 3: Implement support config rendering**

Add a JSON-string YAML scalar helper so quotes, colons, and Unicode remain inert data. Render the normalized destination, label, and description. Set `blank_issues_enabled` from whether `request.capabilities` also contains `github-collaboration`; do not inspect generated issue templates.

- [x] **Step 4: Implement funding rendering**

Group normalized records by the closed provider order. Emit one scalar for providers limited to one record and arrays for `github` and `custom`. Preserve normalized record order within each provider, emit one trailing newline, and never construct external links for non-custom providers.

- [x] **Step 5: Register providers and README links**

Extend profile descriptors, checks, verification declarations, dispatch, and Core README link rendering without changing adapter outputs.

- [x] **Step 6: Run focused tests and verify Green**

Run the Step 2 command.

Expected: PASS with support and funding independently selectable and no ownership overlap.

- [x] **Step 7: Commit the support and funding renderer slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-profile-providers.js packages/prism-core/scripts/prism-tool/bootstrap-providers.js tests/Node/prism-tool-bootstrap-capabilities.test.js
prism-tool commit create --type feat --scope setup --subject "render support and funding providers" --issue 390 --reference refs
```

---

### Task 4: Compose task-10 profiles into Blank and Template plans

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-plan.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-providers.js`
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-source.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Test: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Test: `tests/Node/prism-tool-bootstrap-capabilities.test.js`

**Interfaces:**
- Provider reports persist under registry-derived names:

```text
reports/profile-security-disclosure.json
reports/profile-repository-ownership.json
reports/profile-support-routing.json
reports/profile-funding.json
```

- Plan provider order remains Core baseline, selected profiles in `PROJECT_CAPABILITIES` order, then selected adapter.
- `.prism/project.json` stores selected IDs and exact normalized task-10 metadata; generated files never become metadata inputs.

- [x] **Step 1: Write failing plan-composition tests**

Through `prism-tool setup project plan`, cover Blank and Template, Core-only and PHP/web, each task-10 capability independently, support plus funding, collaboration plus support, and all seven capabilities. Assert canonical capability/provider order, exact output ownership, persisted report modes `0600`, metadata digest binding, Template advertisement requirements, no Template preselection, no Blank source request, unchanged adapter outputs/effects, and overlap rejection.

- [x] **Step 2: Run focused tests and verify Red**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-capabilities.test.js
```

Expected: FAIL until every plan/source/CLI validator accepts the expanded canonical catalogue and report set.

- [x] **Step 3: Generalize remaining task-9 assumptions**

Replace remaining three-capability assumptions with `PROJECT_CAPABILITIES`. Keep dynamic report persistence and composition registry-derived; do not add caller-selected report paths or special-case Blank versus Template.

- [x] **Step 4: Bind expanded metadata and outputs into validation**

Require exact equality among input metadata, persisted metadata report, private plan, candidate `.prism/project.json`, provider reports, composed outputs, and Template catalogue advertisements. Unknown/missing profile report files and changed task-10 output bytes make the attempt stale.

- [x] **Step 5: Run focused tests and verify Green**

Run the Step 2 command.

Expected: PASS for all source/adapter combinations with unchanged minimal and task-9 behavior.

- [x] **Step 6: Commit the plan-composition slice**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-plan.js packages/prism-core/scripts/prism-tool/bootstrap-providers.js packages/prism-core/scripts/prism-tool/bootstrap-source.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-capabilities.test.js
prism-tool commit create --type feat --scope setup --subject "compose security identity capability plans" --issue 390 --reference refs
```

---

### Task 5: Preserve task-10 metadata and outputs through recovery, hooks, and seed evidence

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/hook.js`
- Modify only if generic evidence validation requires it: `packages/prism-core/scripts/prism-tool/bootstrap-seed.js`
- Test: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Test: `tests/Node/prism-tool-bootstrap-seed.test.js`
- Test: `tests/Shell/bootstrap_hook_dispatch_test.sh`

**Interfaces:**
- Durable validation continues to use `.prism/project.json` plus the digest-bound plan; generated policy files are never parsed as metadata.
- Seed attestation retains the existing exact `capabilities`, `providers`, and `metadataDigest` fields and stages task-10 outputs only because they are declared plan outputs.

- [x] **Step 1: Write failing continuity, hook, and seed tests**

After planning, mutate one security contact, policy row, acknowledgement value, owner, ownership rule, support destination/default, funding record, profile report, generated output, metadata digest, candidate manifest, durable manifest, attestation capability order, provider identity, and staged entry at a time. Assert validation, apply, recovery, hook dispatch, seed readiness, or seed completion fails closed before further mutation.

Add valid Blank and Template hook/seed scenarios with all seven capabilities and an adapter scenario proving adapter quality and activation behavior are unchanged.

- [x] **Step 2: Run focused tests and verify Red**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js
bash tests/Shell/bootstrap_hook_dispatch_test.sh
```

Expected: FAIL where hook or seed validation still assumes only task-9 metadata; otherwise the new regression must initially expose the first missing continuity check before production changes.

- [x] **Step 3: Enforce generic expanded metadata validation**

Use `validateNormalizedProjectMetadata()` wherever persisted project metadata crosses plan restoration, durable validation, hook dispatch, or seed preparation. Remove only obsolete task-9 assumptions; retain all existing source, adapter, journal, hook, index, one-use, and recovery checks.

- [x] **Step 4: Prove exact staging and exclusion**

Assert task-10 outputs are staged and `.pi/prism-tool/`, provider reports, Template responses/blobs, journal/backup artifacts, package resources, remote state, and unrelated files remain excluded. Do not add task-10-specific staging logic when generic `plan.outputs` is sufficient.

- [x] **Step 5: Run focused tests and verify Green**

Run the Step 2 commands.

Expected: PASS for Blank/Template, Core-only/adapter, pre-/post-durable recovery, hooks, and exact root-seed evidence.

- [x] **Step 6: Commit the continuity and attestation slice**

```bash
git add packages/prism-core/scripts/prism-tool/hook.js packages/prism-core/scripts/prism-tool/bootstrap-seed.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Shell/bootstrap_hook_dispatch_test.sh
prism-tool commit create --type feat --scope setup --subject "attest security identity capability outputs" --issue 390 --reference refs
```

During execution, omit `bootstrap-seed.js` from staging if the generic implementation requires tests only and the file remains unchanged.

---

### Task 6: Complete public regressions and documentation

**Files:**
- Modify: `tests/Node/prism-tool-bootstrap-capabilities.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-seed.test.js`
- Modify: `tests/Node/prism-tool-php-web-bootstrap.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `packages/prism-core/README.md`
- Modify: `docs/plans/2026-08-25-security-project-identity-capabilities.md`

**Interfaces:**
- Produces complete task-10 evidence through the public launcher. Interactive prompt orchestration remains task 12.

- [ ] **Step 1: Add public Core-only end-to-end regressions**

Exercise metadata inspection, Blank and Template planning, plan validation, durable application, recovery, repository creation, hook activation, and seed preparation with each task-10 capability independently and all seven together. Assert zero default selection, capability independence, deterministic rerendering, identity publication previews, exact output inventory, no Template preselection, and no external lookup beyond already authorized Template acquisition.

- [ ] **Step 2: Add selected-adapter parity regressions**

Prove PHP/web receives normalized decisions but owns none of the task-10 paths, its report/effects/checks remain source- and capability-independent, and profile selection composes without overlap.

- [ ] **Step 3: Add the failure matrix**

Cover malformed security routes/policies/timing, invalid owners and patterns, unsafe support fields, unsupported or excessive funding records, missing Template advertisements, profile overlap, stale metadata, pre-durable renderer failure, and post-durable output drift. Assert strict-empty restoration or exact retained recovery state as appropriate.

- [ ] **Step 4: Document the public task-10 contract**

Extend the Core README with the four new disabled-by-default capabilities, exact output ownership, security policies and optional timing, CODEOWNERS rules, support defaults/blank-issue interaction, funding provider limits, identity-preview behavior, Template advertisement-only semantics, and the task-12 prompt-orchestration deferral.

Do not modify `packages/prism-core/prompts/setup.md` in task 10.

- [ ] **Step 5: Run focused and full Node verification**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-php-web-bootstrap.test.js tests/Node/toolchain-packaging.test.js
npm run test:node
```

Expected: PASS with task-9 regressions unchanged and task-10 behavior green.

- [ ] **Step 6: Mark the plan complete and create the closing commit**

Mark every completed checkbox in this plan, then load `verification-before-completion`.

```bash
git add tests/Node/prism-tool-bootstrap-capabilities.test.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-php-web-bootstrap.test.js tests/Node/toolchain-packaging.test.js packages/prism-core/README.md docs/plans/2026-08-25-security-project-identity-capabilities.md
prism-tool commit create --type test --scope setup --subject "regress security identity capability bootstrap" --issue 390 --reference fixes
```

The final `Fixes: #390` trailer is deliberate so the issue closes when the human merges the pull request. If GitHub does not close it after merge, close it explicitly before claiming task 11.

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

- Spec coverage: independent task-10 selection, closed metadata, security routing/version policy/optional timing, ownership defaults and contained rules, support defaults and blank-issue interaction, funding provider limits, identity preview, Template advertisement-only behavior, Blank/Template parity, provider ownership, overlap rejection, durable recovery, exact staging, and seed attestation are each assigned to a task.
- Deliberate deferral: release management remains task 11; interactive prompt orchestration remains task 12.
- Placeholder scan: no unresolved placeholder, unspecified output path, or deferred task-10 implementation instruction remains.
- Type consistency: `PROJECT_CAPABILITIES`, `capabilities`, `capabilityMetadata`, provider IDs, report filenames, normalized metadata fields, metadata digest, and attestation fields use the same names across selection, rendering, planning, recovery, hooks, and seed evidence.
- Architecture: the task extends ADR-0082's accepted provider-composition boundary and requires no new ADR, dependency, extension, external service, or ownership transfer.
- Tracker continuity: intermediate commits use `Refs: #390`; the final regression commit uses `Fixes: #390`.
