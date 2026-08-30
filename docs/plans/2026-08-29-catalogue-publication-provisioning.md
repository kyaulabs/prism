# Catalogue Publication Provisioning Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans`, `tdd`, `security-coding`, `rcs-header`, and `tdd-php`
> skills. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor inline.

**Goal:** Replace broad, incompatible catalogue release notification with a fixed Actions-only workflow dispatch, then provide tested non-secret readiness checks and detailed human provisioning instructions.

**Architecture:** Prism's stable-release job calls the publisher's existing `workflow_dispatch` release interface with an Actions-write token from a separate dispatch App. A Core readiness module inspects fixed GitHub metadata and one exact local non-secret attestation, while a durable runbook keeps all App, environment, secret, activation, rotation, and exposure mutations human-owned.

**Tech Stack:** GitHub Actions YAML, `actions/create-github-app-token` v2 pinned by SHA, CommonJS Node.js 22.19+, built-in `node:test`, Bash workflow drift tests, GitHub CLI read-only API calls, Markdown

**Originating issue:** #468

## Global constraints

- Follow `docs/specs/2026-08-29-catalogue-publication-provisioning-spec.md`, ADR-0094, ADR-0095, and ADR-0096.
- The publisher target is fixed to `kyaulabs/prism-adapters`, `.github/workflows/catalogue-signing.yml`, and `main`.
- Dispatch inputs are exactly `mode=release`, stable `version`, and lowercase 40-hex `merge_commit`.
- The dispatch App token is narrowed to `prism-adapters` and `Actions: write`; it receives no Contents or Pull Requests permission.
- Dispatch and publication use separate GitHub App identities.
- Production credential values never enter agent context, commands, source, tests, logs, output, artifacts, caches, summaries, issues, plans, specifications, or readiness evidence.
- GitHub App, environment, secret, variable, retention, and activation mutations remain human-only web administration.
- Readiness uses only fixed read-only GitHub API endpoints and the fixed ignored attestation path `.pi/prism-tool/catalogue-publication-readiness.json`.
- Readiness distinguishes `PASS`, `FAIL`, and `MANUAL`; it never treats secret presence as proof that a secret value is correct.
- No new dependency is added.
- Every new or modified `.js` or `.sh` source file retains the RCS header and final vim modeline managed by the hook.

---

### Task 1: Persist the approved security boundary

**Files:**

- Modify: `CONTEXT.md`
- Modify: `adr/0095-cross-repository-catalogue-publication-transaction.md`
- Create: `adr/0096-actions-only-catalogue-workflow-dispatch.md`
- Create: `docs/specs/2026-08-29-catalogue-publication-provisioning-spec.md`
- Create: `docs/plans/2026-08-29-catalogue-publication-provisioning.md`

**Interfaces:**

- Consumes: issue #468, ADR-0094 signing custody, ADR-0095 publication transaction, and the approved test seams.
- Produces: accepted ADR-0096 and one issue-provenanced plan governing all later tasks.

- [x] **Step 1: Verify the architecture artifacts and provenance**

Run:

```bash
rg -n "^\*\*Originating issue:\*\* #468$|^# 0096\.|Partially superseded by ADR-0096|adr/0096-actions-only" CONTEXT.md adr/0095-cross-repository-catalogue-publication-transaction.md adr/0096-actions-only-catalogue-workflow-dispatch.md docs/plans/2026-08-29-catalogue-publication-provisioning.md
```

Expected: one plan provenance match, ADR-0096 title, ADR-0095 successor pointer, and CONTEXT.md decision entry.

- [x] **Step 2: Lint the maintained Markdown artifacts**

Stage only the five listed paths, then run:

```bash
prism-tool markdown lint --cached
```

Expected: exit `0` with no Markdown diagnostics.

- [x] **Step 3: Create the architecture commit**

Run `git add` for the five listed paths. Load `conventional-commits`, then run this as the only tool call in its assistant batch:

```bash
prism-tool commit create --type docs --scope architecture --subject "record catalogue provisioning boundary" --refs 468
```

Expected: one signed documentation commit and a clean index.

---

### Task 2: Narrow and align the release notification

**Files:**

- Modify: `tests/Shell/release_workflow_test.sh:320-430`
- Modify: `packages/prism-core/config/release.yml:611-665`
- Modify: `.github/workflows/release.yml:611-665`

**Interfaces:**

- Consumes: successful stable publication outputs `version` and `merge-sha`.
- Produces: one `workflow_dispatch` request to the publisher's existing release interface.

The resulting notification job contract is exactly:

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
      - name: Mint publisher dispatch token
        id: publisher-token
        uses: actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349 # v2
        with:
          app-id: ${{ vars.CATALOGUE_DISPATCH_APP_ID }}
          private-key: ${{ secrets.CATALOGUE_DISPATCH_APP_PRIVATE_KEY }}
          owner: kyaulabs
          repositories: prism-adapters
          permission-actions: write

      - name: Dispatch validated adapter release
        env:
          GH_TOKEN: ${{ steps.publisher-token.outputs.token }}
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

- [x] **Step 1: Change the workflow graph test to require the narrow contract**

Replace the notification assertions in `validate_workflow_graph()` with assertions that:

```javascript
assert.equal(notifyJob.environment, 'catalogue-dispatch');
assert.equal(token.with['permission-actions'], 'write');
assert.equal(token.with['permission-contents'], undefined);
assert.equal(
    Object.keys(token.with).sort().join(','),
    'app-id,owner,permission-actions,private-key,repositories',
);
assert.match(
    dispatch.run,
    /repos\/kyaulabs\/prism-adapters\/actions\/workflows\/catalogue-signing[.]yml\/dispatches/,
);
assert.match(dispatch.run, /ref: 'main'/);
assert.match(dispatch.run, /mode: 'release'/);
assert.match(dispatch.run, /version: process[.]env[.]RELEASE_VERSION/);
assert.match(dispatch.run, /merge_commit: process[.]env[.]MERGE_SHA/);
assert.doesNotMatch(dispatch.run, /repository_dispatch|client_payload|event_type|sourceRepository|mergeSha/);
```

Retain the existing exact App variable/secret source assertions, stable publication guard, empty `GITHUB_TOKEN` permissions mapping, forbidden authority words, and reordered-output coverage.

- [x] **Step 2: Run the focused workflow test to verify Red**

Run:

```bash
bash tests/Shell/release_workflow_test.sh
```

Expected: FAIL because the job lacks `catalogue-dispatch`, still requests `permission-contents`, and posts repository-dispatch data.

- [x] **Step 3: Implement the canonical workflow contract**

Replace the canonical notification job with the complete YAML above, then copy the canonical bytes exactly to `.github/workflows/release.yml`.

- [x] **Step 4: Run focused tests to verify Green**

Run:

```bash
bash tests/Shell/release_workflow_test.sh
```

Expected: PASS, including canonical/repository byte parity and all notification graph checks.

Run:

```bash
node --test tests/Node/toolchain-packaging.test.js
```

Expected: PASS, proving the corrected canonical workflow remains packaged exactly.

- [x] **Step 5: Create the trigger correction commit**

Run `git add` for the three listed paths. Load `conventional-commits`, then run this as the only tool call in its assistant batch:

```bash
prism-tool commit create --type fix --scope security --subject "narrow catalogue dispatch authority" --refs 468
```

---

### Task 3: Report non-secret catalogue readiness

**Files:**

- Create: `packages/prism-core/scripts/prism-tool/catalogue-publication-readiness.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js:45-60,1879-1897`
- Create: `tests/Node/catalogue-publication-readiness.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js:145-175`

**Interfaces:**

- Consumes: `prism-tool catalogue-publication readiness --phase=pre-activation|active --json`, fixed GitHub metadata, and `.pi/prism-tool/catalogue-publication-readiness.json` beneath the detected project root.
- Produces: `{schemaVersion:1, command:"catalogue-publication readiness", phase, status:"GO"|"NO-GO", checks:[{id,status,message}]}` and exit `0` only when every check is `PASS`.

The attestation has exactly this non-secret schema:

```json
{
  "schemaVersion": 1,
  "checkedAt": "2026-08-29T20:00:00Z",
  "dispatchApp": {
    "appId": 10001,
    "installationId": 20001,
    "repository": "kyaulabs/prism-adapters",
    "permissions": {"actions": "write"}
  },
  "publicationApp": {
    "appId": 10002,
    "installationId": 20002,
    "repository": "kyaulabs/prism-adapters",
    "permissions": {"contents": "write", "pullRequests": "write"}
  },
  "retentionDays": {"prism": 7, "prismAdapters": 7},
  "administratorAccessReviewed": true,
  "offlineRecoveryCustodyReviewed": true
}
```

The production endpoint allowlist is exactly:

```text
repos/kyaulabs/prism/contents/.github/workflows/release.yml?ref=main
repos/kyaulabs/prism-adapters/contents/.github/workflows/catalogue-signing.yml?ref=main
repos/kyaulabs/prism/rulesets
repos/kyaulabs/prism/rulesets/<digits-only-id>
repos/kyaulabs/prism-adapters/rulesets
repos/kyaulabs/prism-adapters/rulesets/<digits-only-id>
repos/kyaulabs/prism/environments/catalogue-dispatch
repos/kyaulabs/prism/environments/catalogue-dispatch/deployment-branch-policies
repos/kyaulabs/prism/environments/catalogue-dispatch/secrets
repos/kyaulabs/prism/environments/catalogue-dispatch/variables
repos/kyaulabs/prism-adapters/environments/catalogue-signing
repos/kyaulabs/prism-adapters/environments/catalogue-signing/deployment-branch-policies
repos/kyaulabs/prism-adapters/environments/catalogue-signing/secrets
repos/kyaulabs/prism-adapters/environments/catalogue-signing/variables
repos/kyaulabs/prism/actions/permissions
repos/kyaulabs/prism-adapters/actions/permissions
repos/kyaulabs/prism-adapters/actions/variables
```

- [x] **Step 1: Write failing public-command tests**

Create fixture-driven Node tests that inject `context.projectRoot` and `context.request(endpoint)`. The complete behavior matrix is:

```javascript
const expectedChecks = [
    'prism-workflow',
    'publisher-workflow',
    'prism-main-rules',
    'publisher-main-rules',
    'dispatch-environment',
    'signing-environment',
    'dispatch-secret-presence',
    'signing-secret-presence',
    'dispatch-app-id',
    'publication-app-id',
    'activation',
    'sha-pinning',
    'manual-attestation',
];
```

Tests must assert:

1. canonical metadata plus the exact attestation returns `GO`, all checks `PASS`, and exit `0` in each phase;
2. pre-activation accepts an absent or non-`true` activation variable, while active phase requires exact `true`;
3. each missing workflow, ruleset, environment, branch policy, expected secret name, expected App-ID variable, or SHA-pinning setting returns `NO-GO` and exit `3`;
4. duplicate owned rules, unexpected bypass actors, malformed JSON, unauthorized API responses, non-digits rule IDs, unknown attestation keys, symlinked attestation, App-ID mismatch, extra App permissions, retention other than seven days, or false manual review returns `NO-GO`;
5. secret checks consume names and timestamps only and never accept or render a `value` field;
6. output contains no fixture credential canary and every requested endpoint is in the exact allowlist above;
7. unknown command arguments return usage exit `2` without a GitHub request.

Run through the exported command, not private helpers:

```javascript
const status = cataloguePublicationReadinessCommand(
    ['readiness', '--phase=pre-activation', '--json'],
    context,
);
assert.equal(status, 0);
assert.deepEqual(JSON.parse(output).checks.map(({id}) => id), expectedChecks);
```

- [x] **Step 2: Run the focused Node test to verify Red**

Run:

```bash
node --test tests/Node/catalogue-publication-readiness.test.js
```

Expected: FAIL because the module and CLI route do not exist.

- [x] **Step 3: Implement the minimal readiness module**

Implement and export:

```javascript
function cataloguePublicationReadinessCommand(args, context = {})
function inspectCataloguePublicationReadiness({phase, attestation, request})
function validateAttestation(value)
```

Use `lstatSync` to require one regular, non-symlink attestation at the fixed path. Validate exact object keys, positive safe integer IDs, fixed repository names, exact permission objects, RFC 3339 `checkedAt`, both seven-day retention values, and both review booleans. Do not print the attestation or API bodies.

Production `request(endpoint)` must call:

```javascript
runBounded('gh', ['api', endpoint], {
    env: context.env ?? process.env,
    timeout: 30000,
    maxBuffer: 1048576,
});
```

Reject nonzero status, timeout, malformed JSON, oversized output, and endpoints outside the fixed allowlist. Discover ruleset IDs from list responses, require digits-only IDs before the detail request, and accept a `main` rule only when active with no bypass actors plus deletion, non-fast-forward, signatures, and pull-request rules.

Require each environment to use custom deployment-branch policies containing exactly `main`. Require the expected secret-name sets without inspecting values. Match the environment App-ID variables to attested numeric IDs. Require `sha_pinning_required === true` for both repositories. Render only stable check IDs, statuses, and messages.

Add the CLI route:

```javascript
const {
    cataloguePublicationReadinessCommand,
} = require('./catalogue-publication-readiness');
```

```javascript
if (command === 'catalogue-publication') {
    return cataloguePublicationReadinessCommand(args, context);
}
```

- [x] **Step 4: Verify Green and package ownership**

Run:

```bash
node --test tests/Node/catalogue-publication-readiness.test.js
```

Expected: PASS.

Add `catalogue-publication-readiness` to the exact Core module list in `toolchain-packaging.test.js`, then run:

```bash
node --test tests/Node/toolchain-packaging.test.js
```

Expected: PASS and the module is present in the packed Core tarball.

- [x] **Step 5: Create the readiness commit**

Run `git add` for the four listed paths. Load `conventional-commits`, then run this as the only tool call in its assistant batch:

```bash
prism-tool commit create --type fix --scope security --subject "report catalogue provisioning readiness" --refs 468
```

---

### Task 4: Publish the human provisioning and response runbook

**Files:**

- Create: `packages/prism-core/docs/catalogue-publication-provisioning.md`
- Modify: `packages/prism-core/docs/adapter-catalogue.md:187-215`
- Modify: `tests/Node/toolchain-packaging.test.js:130-220`

**Interfaces:**

- Consumes: ADR-0096, the readiness command, and human-only GitHub administration.
- Produces: a package-owned procedure for initial setup, pre-activation checking, activation, smoke verification, rotation, exposure response, recovery, and succession.

- [ ] **Step 1: Write failing documentation contract tests**

Extend `toolchain-packaging.test.js` to require the new packaged document and these exact contract markers:

```javascript
assert.match(runbook, /catalogue-dispatch/);
assert.match(runbook, /catalogue-signing/);
assert.match(runbook, /Actions: write/);
assert.match(runbook, /Contents: read and write/);
assert.match(runbook, /Pull requests: read and write/);
assert.match(runbook, /CATALOGUE_DISPATCH_APP_ID/);
assert.match(runbook, /CATALOGUE_DISPATCH_APP_PRIVATE_KEY/);
assert.match(runbook, /CATALOGUE_SIGNING_PRIVATE_KEY/);
assert.match(runbook, /CATALOGUE_SIGNING_PASSPHRASE/);
assert.match(runbook, /CATALOGUE_PUBLICATION_APP_ID/);
assert.match(runbook, /CATALOGUE_PUBLICATION_APP_PRIVATE_KEY/);
assert.match(runbook, /CATALOGUE_SIGNING_ENABLED/);
assert.match(runbook, /seven days/);
assert.match(runbook, /pre-activation/);
assert.match(runbook, /--phase=active/);
assert.match(runbook, /suspected exposure/i);
assert.match(runbook, /succession/i);
assert.doesNotMatch(runbook, /BEGIN (?:RSA |ENCRYPTED )?PRIVATE KEY|gh secret set|echo .*PRIVATE_KEY|\.env/);
```

Also require `adapter-catalogue.md` to link to the new runbook.

- [ ] **Step 2: Run the documentation test to verify Red**

Run:

```bash
node --test tests/Node/toolchain-packaging.test.js
```

Expected: FAIL because the runbook is absent.

- [ ] **Step 3: Write the complete operator procedure**

The runbook must give exact GitHub web UI steps in this order:

1. verify corrected `main` workflow revisions and active no-bypass `main` rules in both repositories;
2. create a dispatch App with webhooks disabled, no event subscriptions, only Actions read/write permission, and selected installation only on `kyaulabs/prism-adapters`;
3. create Prism environment `catalogue-dispatch`, restrict deployment branches to custom policy `main`, store the App ID as `CATALOGUE_DISPATCH_APP_ID`, and enter the private key as `CATALOGUE_DISPATCH_APP_PRIVATE_KEY` without exposing it to chat or an agent;
4. create a separate publication App with webhooks disabled, no event subscriptions, only Contents and Pull requests read/write, and selected installation only on `kyaulabs/prism-adapters`;
5. create adapter environment `catalogue-signing`, restrict it to custom policy `main`, enter the encrypted Ed25519 key, passphrase, and publication App key as three separate environment secrets, and store the publication App ID as an environment variable;
6. require full-SHA action pinning and set Actions retention to seven days in both repositories;
7. keep `CATALOGUE_SIGNING_ENABLED` absent, prepare the exact non-secret attestation JSON under `.pi/prism-tool/`, and run `prism-tool catalogue-publication readiness --phase=pre-activation --json`;
8. stop on any `FAIL` or unresolved `MANUAL`, correct the setting in GitHub, and rerun;
9. while activation remains absent, perform one human-observed release-mode workflow dispatch and verify that unprivileged trigger validation runs but the protected environment is not entered;
10. set repository variable `CATALOGUE_SIGNING_ENABLED` to exact `true`, then run `prism-tool catalogue-publication readiness --phase=active --json`; issue #469 owns the first credential-bearing production publication;
11. record only non-secret App/installation IDs, permissions, repository selections, workflow revisions, environment/ruleset status, retention, activation status, and verification time;
12. document routine App-key rotation, signing-key Core-first rotation, immediate disablement on suspected exposure, audit review, recovery, and out-of-band succession without naming custody locations.

Do not include credential-generation commands, secret-setting shell commands, credential values, private storage paths, or instructions for agents to perform administration.

- [ ] **Step 4: Verify documentation Green**

Run:

```bash
node --test tests/Node/toolchain-packaging.test.js
```

Expected: PASS.

Stage the two Markdown files and run:

```bash
prism-tool markdown lint --cached
```

Expected: exit `0` with no diagnostics.

- [ ] **Step 5: Hold the terminal commit for human readiness**

Present the completed runbook. Stop while the human performs GitHub administration outside agent tools. Do not request credential values. Resume only when the human confirms the fixed non-secret attestation exists.

Run:

```bash
prism-tool catalogue-publication readiness --phase=pre-activation --json
```

Expected: `status` is `GO` and every check is `PASS`.

After the human enables production in GitHub, run:

```bash
prism-tool catalogue-publication readiness --phase=active --json
```

Expected: `status` is `GO` and every check is `PASS`.

Run `git add` for the three listed paths. Load `conventional-commits`, then run this as the only tool call in its assistant batch:

```bash
prism-tool commit create --type docs --scope security --subject "document catalogue publication provisioning" --fixes 468
```

---

## Final verification and handoff

After Task 4 is committed:

1. Load `verification-before-completion` and rerun:

   ```bash
   bash tests/Shell/release_workflow_test.sh
   ```

   ```bash
   node --test tests/Node/catalogue-publication-readiness.test.js tests/Node/toolchain-packaging.test.js
   ```

   ```bash
   prism-tool catalogue-publication readiness --phase=active --json
   ```

2. Confirm `git diff --check` passes and no credential canary, private-key block, debug marker, temporary dispatch JSON, or attestation file is tracked.
3. Run `/check` until green.
4. Finalize through `finishing-a-development-branch`, including the authorized four-axis review and preparation-only `/pr`.
5. The human pushes and merges. Issue #469 owns the first production publication and fixed raw-endpoint verification.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
