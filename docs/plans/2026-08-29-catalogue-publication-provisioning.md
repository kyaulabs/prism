# Catalogue Publication Provisioning Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans`, `tdd`, and `security-coding` skills. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each task follows Red → Green → Refactor
> inline.

**Goal:** Replace catalogue GitHub App authentication with two separately scoped fine-grained PATs owned by `kyaulabs-bot`, while preserving dispatch/publication authority separation and providing non-secret readiness evidence plus human setup instructions.

**Architecture:** Prism passes a dispatch-only PAT from protected environment `catalogue-dispatch` directly to one fixed workflow-dispatch API call. The publisher separately consumes a publication-only PAT from `catalogue-signing`; Prism readiness validates exact human-attested credential metadata and reports the accepted non-expiring/no-rotation posture as advisory.

**Tech Stack:** GitHub Actions YAML, CommonJS Node.js 22.19+, built-in `node:test`, Bash workflow drift tests, GitHub CLI read-only API calls, Markdown

**Originating issue:** #468

## Global constraints

- Follow `docs/specs/2026-08-29-catalogue-publication-provisioning-spec.md`, ADR-0094, ADR-0095, and ADR-0097.
- Never request, read, print, copy, validate, or store either PAT value in agent context, commands, repository files, tests, logs, output, artifacts, caches, summaries, issues, plans, specifications, or readiness evidence.
- Both credentials are fine-grained PATs owned by `kyaulabs-bot`, with resource owner `kyaulabs` and repository selection limited to `kyaulabs/prism-adapters`.
- The dispatch PAT grants Actions write only and is stored as `CATALOGUE_DISPATCH_TOKEN` in Prism environment `catalogue-dispatch`.
- The publication PAT grants Contents write and Pull Requests write only and is stored as `CATALOGUE_PUBLICATION_TOKEN` in publisher environment `catalogue-signing`.
- A single combined PAT is prohibited.
- Both PATs are non-expiring and have no planned rotation; readiness reports that accepted debt as `ADVISORY`.
- `CATALOGUE_SIGNING_ENABLED` remains absent throughout implementation and human setup.
- The publisher target remains fixed to `kyaulabs/prism-adapters`, `.github/workflows/catalogue-signing.yml`, and `main`.
- Dispatch inputs remain exactly `mode=release`, stable `version`, and lowercase 40-hex `merge_commit`.
- GitHub account, PAT, environment, secret, retention, and activation mutations remain human-only web administration.
- Readiness uses only fixed read-only GitHub API endpoints and the fixed ignored attestation path `.pi/prism-tool/catalogue-publication-readiness.json`.
- No new dependency is added.
- Every modified `.js` or `.sh` source file retains its RCS header and final vim modeline.

## Required external prerequisite

This plan cannot modify the sibling `prism-adapters` project. Before Task 1 begins, a separate trusted session in that project must implement and merge direct publication-PAT support to protected `main`:

- `.github/workflows/catalogue-signing.yml` exposes `secrets.CATALOGUE_PUBLICATION_TOKEN` only to the protected publication command;
- App ID, App private-key, JWT, installation discovery, and installation-token minting are removed;
- publisher code consumes the PAT as an opaque environment value, never persists or logs it, and keeps existing bounded branch/pull-request mutations;
- `test/workflow.test.js` and `test/github-publication.test.js` prove the new boundary and reject the retired App flow;
- `CATALOGUE_SIGNING_ENABLED` remains absent;
- the publisher's full check and security review pass before human secret entry.

The executor records only the merged publisher workflow revision SHA as non-secret evidence. It does not receive the PAT.

---

### Task 1: Dispatch with the account-owned Actions PAT

**Files:**

- Modify: `tests/Shell/release_workflow_test.sh:352-426`
- Modify: `packages/prism-core/config/release.yml:610-671`
- Modify: `.github/workflows/release.yml:610-671`
- Modify: `docs/plans/2026-08-29-catalogue-publication-provisioning.md`

**Interfaces:**

- Consumes: protected secret `${{ secrets.CATALOGUE_DISPATCH_TOKEN }}` and validated release outputs `version` and `merge-sha`.
- Produces: one fixed `workflow_dispatch` request with no App-token minting step.

- [x] **Step 1: Change the workflow graph test to require direct PAT use**

Replace the App-token assertions in `validate_workflow_graph()` with:

```javascript
const dispatch = notifyJob.steps.find(({name}) =>
    name === "Dispatch validated adapter release"
);
if (
    notifyJob.steps.length !== 1 ||
    dispatch === undefined ||
    dispatch.env.GH_TOKEN !== "${{ secrets.CATALOGUE_DISPATCH_TOKEN }}" ||
    dispatch.env.RELEASE_VERSION !== "${{ needs.publish.outputs.version }}" ||
    dispatch.env.MERGE_SHA !== "${{ needs.publish.outputs.merge-sha }}" ||
    Object.keys(dispatch.env).sort().join(",") !== "GH_TOKEN,MERGE_SHA,RELEASE_VERSION" ||
    !dispatch.run.includes(
        "repos/kyaulabs/prism-adapters/actions/workflows/" +
            "catalogue-signing.yml/dispatches"
    ) ||
    !dispatch.run.includes("ref: " + quote + "main" + quote) ||
    !dispatch.run.includes("mode: " + quote + "release" + quote) ||
    !dispatch.run.includes("version: process.env.RELEASE_VERSION") ||
    !dispatch.run.includes("merge_commit: process.env.MERGE_SHA") ||
    /repository_dispatch|client_payload|event_type|sourceRepository|mergeSha/.test(
        dispatch.run
    )
) process.exit(1);

const notificationSource = JSON.stringify(notifyJob);
for (const forbidden of [
    "create-github-app-token",
    "CATALOGUE_DISPATCH_APP_ID",
    "CATALOGUE_DISPATCH_APP_PRIVATE_KEY",
    "publisher-token",
    "permission-actions",
    "compatibility",
    "coreRange",
    "integrity",
    "npm",
    "sequence",
    "upload-artifact",
    "actions/cache",
]) {
    if (notificationSource.includes(forbidden)) process.exit(1);
}
```

Replace the two App-source mutation fixtures with one direct-secret fixture:

```javascript
const fs = require("node:fs");
const source = fs.readFileSync(process.argv[1], "utf8");
const before = "${{ secrets.CATALOGUE_DISPATCH_TOKEN }}";
if (!source.includes(before)) process.exit(1);
fs.writeFileSync(process.argv[2], source.replace(
    before,
    "${{ secrets.WRONG_DISPATCH_TOKEN }}",
));
```

Require `validate_workflow_graph()` to reject that fixture and update the test message to `publisher dispatch requires the approved protected secret source`.

- [x] **Step 2: Run the focused workflow test to verify Red**

Run:

```bash
bash tests/Shell/release_workflow_test.sh
```

Expected: FAIL because the workflow still mints an App installation token and does not source `CATALOGUE_DISPATCH_TOKEN` directly.

- [x] **Step 3: Replace App token minting with the protected PAT**

Replace the canonical `notify-publisher` job with:

```yaml
  notify-publisher:
    name: Notify adapter catalogue publisher
    needs: publish
    if: >-
      ${{ always()
       && github.repository == 'kyaulabs/prism'
       && needs.publish.outputs.stable == 'true'
       && needs.publish.outputs.publish-outcome == 'success'
       && needs.publish.outputs.reconcile-outcome == 'success'
       }}
    runs-on: ubuntu-latest
    timeout-minutes: 5
    environment: catalogue-dispatch
    permissions: {}
    steps:
      - name: Dispatch validated adapter release
        env:
          GH_TOKEN: ${{ secrets.CATALOGUE_DISPATCH_TOKEN }}
          RELEASE_VERSION: ${{ needs.publish.outputs.version }}
          MERGE_SHA: ${{ needs.publish.outputs.merge-sha }}
        run: |
          set -euo pipefail

          if ! printf '%s' "$RELEASE_VERSION" | grep -qE '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'; then
            echo "::error::publisher dispatch requires a stable release version" >&2
            exit 1
          fi
          if ! printf '%s' "$MERGE_SHA" | grep -qE '^[0-9a-f]{40}$'; then
            echo "::error::publisher dispatch requires a validated merge SHA" >&2
            exit 1
          fi

          node - <<'NODE'
          const fs = require('node:fs');

          const payload = {
            ref: 'main',
            inputs: {
              mode: 'release',
              version: process.env.RELEASE_VERSION,
              merge_commit: process.env.MERGE_SHA,
            },
          };
          fs.writeFileSync(
            '.prism-adapter-release-dispatch.json',
            `${JSON.stringify(payload)}\n`,
            {mode: 0o600}
          );
          NODE

          gh api --method POST \
            repos/kyaulabs/prism-adapters/actions/workflows/catalogue-signing.yml/dispatches \
            --input .prism-adapter-release-dispatch.json
```

Copy the canonical bytes exactly to `.github/workflows/release.yml`.

- [x] **Step 4: Verify the direct-PAT workflow Green**

Run:

```bash
bash tests/Shell/release_workflow_test.sh
```

Expected: PASS, including executable graph simulation and canonical/installed byte parity.

Run:

```bash
node --test tests/Node/toolchain-packaging.test.js
```

Expected: PASS, proving the corrected canonical workflow remains packaged.

- [x] **Step 5: Commit the dispatch migration**

Stage the four listed files. Load `conventional-commits`, then run this as the only tool call in its assistant batch:

```bash
prism-tool commit create --type fix --scope security --subject "use bot-owned catalogue dispatch token" --refs 468
```

---

### Task 2: Attest separate PAT authority without credential access

**Files:**

- Modify: `tests/Node/catalogue-publication-readiness.test.js`
- Modify: `packages/prism-core/scripts/prism-tool/catalogue-publication-readiness.js`
- Modify: `docs/plans/2026-08-29-catalogue-publication-provisioning.md`

**Interfaces:**

- Consumes: attestation schema version `2`, environment secret names, fixed GitHub metadata, and phase `pre-activation|active`.
- Produces: readiness checks with `PASS`, `FAIL`, `MANUAL`, or `ADVISORY`; `GO` accepts only `PASS` and `ADVISORY`.

The exact credential object is:

```javascript
{
    type: 'FINE_GRAINED_PAT',
    label: 'prism-catalogue-dispatch',
    credentialOwner: 'kyaulabs-bot',
    resourceOwner: 'kyaulabs',
    repositories: ['kyaulabs/prism-adapters'],
    permissions: {actions: 'write'},
    expiresAt: null,
    rotationPolicy: 'NONE_ACCEPTED',
}
```

The publication object differs only by label `prism-adapters-catalogue-publication` and permissions `{contents: 'write', pullRequests: 'write'}`.

- [ ] **Step 1: Rewrite readiness fixtures for the two closed PAT profiles**

Change `EXPECTED_CHECKS` to:

```javascript
const EXPECTED_CHECKS = [
    'prism-workflow',
    'publisher-workflow',
    'prism-main-rules',
    'publisher-main-rules',
    'dispatch-environment',
    'signing-environment',
    'dispatch-secret-presence',
    'signing-secret-presence',
    'activation',
    'sha-pinning',
    'dispatch-credential-scope',
    'publication-credential-scope',
    'credential-separation',
    'credential-lifecycle',
    'manual-attestation',
];
```

Use environment secret fixtures containing exactly `CATALOGUE_DISPATCH_TOKEN` and, for the publisher, `CATALOGUE_SIGNING_PRIVATE_KEY`, `CATALOGUE_SIGNING_PASSPHRASE`, and `CATALOGUE_PUBLICATION_TOKEN`. Remove environment App-ID variable fixtures.

Replace the attestation fixture with:

```javascript
{
    schemaVersion: 2,
    checkedAt: '2026-08-29T20:00:00Z',
    dispatchCredential: {
        type: 'FINE_GRAINED_PAT',
        label: 'prism-catalogue-dispatch',
        credentialOwner: 'kyaulabs-bot',
        resourceOwner: 'kyaulabs',
        repositories: ['kyaulabs/prism-adapters'],
        permissions: {actions: 'write'},
        expiresAt: null,
        rotationPolicy: 'NONE_ACCEPTED',
    },
    publicationCredential: {
        type: 'FINE_GRAINED_PAT',
        label: 'prism-adapters-catalogue-publication',
        credentialOwner: 'kyaulabs-bot',
        resourceOwner: 'kyaulabs',
        repositories: ['kyaulabs/prism-adapters'],
        permissions: {contents: 'write', pullRequests: 'write'},
        expiresAt: null,
        rotationPolicy: 'NONE_ACCEPTED',
    },
    credentialSeparationReviewed: true,
    retentionDays: {prism: 7, prismAdapters: 7},
    administratorAccessReviewed: true,
    offlineRecoveryCustodyReviewed: true,
}
```

The canonical readiness assertion must require `GO`, exactly one `ADVISORY` check named `credential-lifecycle`, and every other check `PASS`.

Add table-driven failing cases for a classic PAT type, wrong owner, wrong resource owner, another repository, Actions on the publication credential, Contents on the dispatch credential, duplicate labels, false separation review, an expiration string, a rotation policy other than `NONE_ACCEPTED`, old schema version `1`, and unknown keys. Keep credential-canary redaction coverage.

- [ ] **Step 2: Run readiness tests to verify Red**

Run:

```bash
node --test tests/Node/catalogue-publication-readiness.test.js
```

Expected: FAIL because App-shaped schema version `1`, App-ID variables, and App private-key secret names remain implemented.

- [ ] **Step 3: Implement exact PAT metadata validation and advisory reporting**

Replace `validApp()` with:

```javascript
function validCredential(value, {label, permissions}) {
    return exactKeys(value, [
        'type', 'label', 'credentialOwner', 'resourceOwner', 'repositories',
        'permissions', 'expiresAt', 'rotationPolicy',
    ]) && value.type === 'FINE_GRAINED_PAT' && value.label === label &&
        value.credentialOwner === 'kyaulabs-bot' && value.resourceOwner === 'kyaulabs' &&
        Array.isArray(value.repositories) && value.repositories.length === 1 &&
        value.repositories[0] === REPOSITORY &&
        exactKeys(value.permissions, Object.keys(permissions)) &&
        Object.entries(permissions).every(([name, access]) => value.permissions[name] === access) &&
        value.expiresAt === null && value.rotationPolicy === 'NONE_ACCEPTED';
}
```

Change `validateAttestation()` to require exact root keys:

```javascript
[
    'schemaVersion', 'checkedAt', 'dispatchCredential', 'publicationCredential',
    'credentialSeparationReviewed', 'retentionDays',
    'administratorAccessReviewed', 'offlineRecoveryCustodyReviewed',
]
```

Require schema version `2`, both exact profiles through `validCredential()`, distinct labels, `credentialSeparationReviewed === true`, seven-day retention, and both existing review booleans.

Remove environment-variable endpoints and App-ID checks. Change expected environment secret names to the direct-token names. Add:

```javascript
function advisory(id, message) {
    return {id, status: 'ADVISORY', message};
}
```

Append successful metadata checks:

```javascript
pass('dispatch-credential-scope', 'dispatch credential scope is attested'),
pass('publication-credential-scope', 'publication credential scope is attested'),
pass('credential-separation', 'separate credential authority is attested'),
advisory('credential-lifecycle', 'non-expiring credentials have no planned rotation'),
pass('manual-attestation', 'manual custody and retention controls are attested'),
```

Compute `GO` with:

```javascript
const status = checks.every(({status: checkStatus}) =>
    checkStatus === 'PASS' || checkStatus === 'ADVISORY'
) ? 'GO' : 'NO-GO';
```

Never render the attestation or API response bodies.

- [ ] **Step 4: Verify PAT readiness Green**

Run:

```bash
node --test tests/Node/catalogue-publication-readiness.test.js
```

Expected: PASS, including exact scope, separation, advisory, malformed evidence, endpoint allowlist, and redaction cases.

Run:

```bash
node --test tests/Node/toolchain-packaging.test.js
```

Expected: PASS with the readiness module still present in the packed Core tarball.

- [ ] **Step 5: Commit the readiness migration**

Stage the two listed files. Load `conventional-commits`, then run this as the only tool call in its assistant batch:

```bash
prism-tool commit create --type fix --scope security --subject "attest separated catalogue token authority" --refs 468
```

---

### Task 3: Publish the PAT provisioning and recovery runbook

**Files:**

- Create: `packages/prism-core/docs/catalogue-publication-provisioning.md`
- Modify: `packages/prism-core/docs/adapter-catalogue.md`
- Modify: `tests/Node/toolchain-packaging.test.js`
- Modify: `docs/plans/2026-08-29-catalogue-publication-provisioning.md`

**Interfaces:**

- Consumes: ADR-0097, readiness schema version `2`, and human-only GitHub administration.
- Produces: packaged setup, verification, exposure, recovery, and succession instructions without credential values.

- [ ] **Step 1: Write failing documentation contract tests**

Require the new packaged document, require `adapter-catalogue.md` to link to it, and assert:

```javascript
assert.match(runbook, /kyaulabs-bot/);
assert.match(runbook, /fine-grained personal access token/i);
assert.match(runbook, /CATALOGUE_DISPATCH_TOKEN/);
assert.match(runbook, /CATALOGUE_PUBLICATION_TOKEN/);
assert.match(runbook, /Actions: write/);
assert.match(runbook, /Contents: write/);
assert.match(runbook, /Pull requests: write/);
assert.match(runbook, /catalogue-dispatch/);
assert.match(runbook, /catalogue-signing/);
assert.match(runbook, /NONE_ACCEPTED/);
assert.match(runbook, /non-expiring/i);
assert.match(runbook, /no planned rotation/i);
assert.match(runbook, /CATALOGUE_SIGNING_ENABLED/);
assert.match(runbook, /pre-activation/);
assert.match(runbook, /--phase=active/);
assert.match(runbook, /suspected exposure/i);
assert.match(runbook, /succession/i);
assert.match(runbook, /issue #469/i);
assert.doesNotMatch(
    runbook,
    /github_pat_[A-Za-z0-9_]+|gh secret set|echo .*TOKEN|BEGIN (?:RSA |ENCRYPTED )?PRIVATE KEY|[.]env/,
);
```

- [ ] **Step 2: Run the documentation test to verify Red**

Run:

```bash
node --test tests/Node/toolchain-packaging.test.js
```

Expected: FAIL because the PAT runbook is absent.

- [ ] **Step 3: Write the complete human procedure**

Write these ordered sections:

1. hard prohibition on placing token values in chat, terminals observed by agents, repository files, logs, issues, or attestation;
2. publisher-first migration verification and continued absence of `CATALOGUE_SIGNING_ENABLED`;
3. GitHub UI verification that each token is fine-grained, owned by `kyaulabs-bot`, resource-owned by `kyaulabs`, selected only for `prism-adapters`, and has exactly its approved permission profile;
4. Prism `catalogue-dispatch` environment restricted to custom branch `main`, with direct browser entry of `CATALOGUE_DISPATCH_TOKEN`;
5. publisher `catalogue-signing` environment restricted to custom branch `main`, with direct browser entry of `CATALOGUE_PUBLICATION_TOKEN` alongside the two signing secrets;
6. full-SHA Actions policy and seven-day retention in both repositories;
7. exact schema-version-2 attestation using only the metadata object from Task 2;
8. pre-activation readiness, disabled-state dispatch, and stop conditions for `FAIL` or `MANUAL`;
9. activation deferred to issue #469, followed by active readiness;
10. independent disable/revoke/replace/reverify procedures for suspected exposure of either PAT;
11. explicit accepted non-expiring/no-rotation debt and future migration guidance;
12. out-of-band account access and credential succession without custody locations.

Do not include token creation commands, secret-setting commands, token values, private storage paths, or instructions for an agent to perform administration.

- [ ] **Step 4: Verify the runbook Green**

Run:

```bash
node --test tests/Node/toolchain-packaging.test.js
```

Expected: PASS.

Stage only the runbook and linked catalogue documentation, then run:

```bash
prism-tool markdown lint --cached
```

Expected: exit `0` with no Markdown diagnostics.

- [ ] **Step 5: Stop at the human-administration gate**

Present the runbook and stop. The human enters each existing PAT through GitHub's web UI and creates the non-secret attestation without providing values to the agent. Do not activate production.

After the human confirms setup, run:

```bash
prism-tool catalogue-publication readiness --phase=pre-activation --json
```

Expected: `GO`, one `ADVISORY` for credential lifecycle, no `FAIL`, and no `MANUAL`.

Run the focused verification suite:

```bash
bash tests/Shell/release_workflow_test.sh
```

```bash
node --test tests/Node/catalogue-publication-readiness.test.js tests/Node/toolchain-packaging.test.js
```

Stage the three listed Task 3 files. Load `conventional-commits`, then run this as the only tool call in its assistant batch:

```bash
prism-tool commit create --type docs --scope security --subject "document bot-owned catalogue provisioning" --fixes 468
```

---

## Final verification and handoff

After Task 3 is committed:

1. Load `verification-before-completion` and rerun the focused suite.
2. Confirm `git diff --check` passes and no PAT-shaped value, private-key block, debug marker, dispatch payload, or attestation is tracked.
3. Run `/check` until green.
4. Finalize through `finishing-a-development-branch`, including the authorized four-axis review and preparation-only `/pr`.
5. The human pushes and merges. Issue #469 owns activation, first credential-bearing production publication, and fixed raw-endpoint verification.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
