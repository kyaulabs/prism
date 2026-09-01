# Publication Commit-Signing Readiness Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Make catalogue-publication readiness attest the separate OpenPGP
publication commit-signing authority and accept exactly the reviewed five-secret
publisher environment.

**Architecture:** Advance the ignored local attestation to a closed schema 3,
validate one explicit `publicationCommitSigning` object, and keep the publisher
repository authoritative for fingerprints and signing mechanics. Extend the
existing exact-name GitHub metadata check from three to five secrets and expose
one distinct custody PASS check without requesting secret values.

**Tech Stack:** Node.js CommonJS, `node:test`, Prism's bounded `gh api` wrapper,
Markdown runbooks, Nygard ADRs

**Originating issue:** #476

## Global constraints

- Keep `CATALOGUE_SIGNING_ENABLED` absent during implementation and
  pre-activation verification.
- Require exactly five `catalogue-signing` secret names; missing, extra,
  duplicate, malformed, or value-bearing entries fail closed.
- Never request or emit credential values, private keys, passphrases, token
  prefixes, recovery locations, or human custodian identities.
- Preserve signed-commit and pull-request rules on protected `main`; add no
  bypass actor.
- Schema 2 and every schema other than 3 fail before GitHub access; perform no
  automatic attestation migration.
- Keep OpenPGP fingerprints, commit construction, signing mechanics, and
  GitHub verification policy owned by `kyaulabs/prism-adapters`.
- Add no dependencies.
- Do not hand-edit RCS headers; the commit hook normalizes modified JavaScript
  source and test files.

---

### Task 1: Record the approved architecture contract

**Files:**

- Create: `adr/0098-attested-publication-commit-signing-custody.md`
- Create: `docs/specs/2026-09-01-publication-commit-signing-readiness-spec.md`
- Create: `docs/plans/2026-09-01-publication-commit-signing-readiness.md`
- Modify: `CONTEXT.md:57-58,513-514`

**Interfaces:**

- Consumes: approved issue #476 design and architect verdict
- Produces: accepted ADR-0098, the canonical domain term
  `publication commit-signing authority`, and the implementation contract used
  by Tasks 2 and 3

- [x] **Step 1: Verify the approved artifacts are internally consistent**

Confirm all four conditions directly in the files:

```text
ADR-0098 status is Accepted.
The spec contains "ADR-required: 0098" and "Status: Approved design".
CONTEXT.md defines "publication commit-signing authority".
CONTEXT.md lists ADR-0098 under Architectural Decisions.
```

- [x] **Step 2: Stage only the architecture artifacts**

```bash
git add CONTEXT.md adr/0098-attested-publication-commit-signing-custody.md docs/specs/2026-09-01-publication-commit-signing-readiness-spec.md docs/plans/2026-09-01-publication-commit-signing-readiness.md
```

- [x] **Step 3: Verify Markdown structure**

Run:

```text
prism-tool markdown lint --cached
```

Expected: exit 0 with no Markdown lint findings.

- [x] **Step 4: Create the architecture commit**

Load the `conventional-commits` skill, then run this as a standalone tool call:

```text
prism-tool commit create --type docs --scope architecture --subject "attest publication commit signing custody" --refs 476
```

Expected: one signed commit containing only the four staged architecture
artifacts.

---

### Task 2: Enforce schema 3 and the exact five-secret contract

**Files:**

- Modify: `tests/Node/catalogue-publication-readiness.test.js:14-350`
- Modify: `packages/prism-core/scripts/prism-tool/catalogue-publication-readiness.js:8-220`

**Interfaces:**

- Consumes: attestation schema and protected-environment contract from ADR-0098
- Produces: `validateAttestation(value)` support for the closed schema-3 object,
  exact five-name environment validation, and the
  `publication-commit-signing-custody` report check

- [ ] **Step 1: Write failing readiness tests**

Add this canonical name set near `EXPECTED_CHECKS`:

```javascript
const SIGNING_SECRET_NAMES = Object.freeze([
    'CATALOGUE_SIGNING_PRIVATE_KEY',
    'CATALOGUE_SIGNING_PASSPHRASE',
    'CATALOGUE_PUBLICATION_TOKEN',
    'CATALOGUE_COMMIT_SIGNING_PRIVATE_KEY',
    'CATALOGUE_COMMIT_SIGNING_PASSPHRASE',
]);
```

Insert the new check between `credential-separation` and
`credential-lifecycle`:

```javascript
'publication-commit-signing-custody',
```

Replace the canonical publisher secret fixture with:

```javascript
['repos/kyaulabs/prism-adapters/environments/catalogue-signing/secrets', {
    secrets: SIGNING_SECRET_NAMES.map((name) => ({name})),
}],
```

Advance `attestation()` to `schemaVersion: 3` and insert this object after
`publicationCredential`:

```javascript
publicationCommitSigning: {
    type: 'OPENPGP',
    identity: 'kyaulabs-bot <actions@kyaulabs.com>',
    privateMaterialOutsideRepositoriesReviewed: true,
    offlineRecoveryCustodyReviewed: true,
    separatedFromCatalogueSigningReviewed: true,
    separatedFromPublicationCredentialReviewed: true,
},
```

In `credentialDriftCases`, change the old-schema mutation to version 2 and add
these closed-schema cases:

```javascript
['old schema', (value) => { value.schemaVersion = 2; }],
['wrong commit-signing type', (value) => {
    value.publicationCommitSigning.type = 'SSH';
}],
['wrong commit-signing identity', (value) => {
    value.publicationCommitSigning.identity = 'different-bot <actions@example.com>';
}],
['repository-held commit-signing material', (value) => {
    value.publicationCommitSigning.privateMaterialOutsideRepositoriesReviewed = false;
}],
['unreviewed commit-signing recovery', (value) => {
    value.publicationCommitSigning.offlineRecoveryCustodyReviewed = false;
}],
['commit signing combined with catalogue signing', (value) => {
    value.publicationCommitSigning.separatedFromCatalogueSigningReviewed = false;
}],
['commit signing combined with publication authorization', (value) => {
    value.publicationCommitSigning.separatedFromPublicationCredentialReviewed = false;
}],
['unknown commit-signing key', (value) => {
    value.publicationCommitSigning.unexpected = true;
}],
```

Add this parameterized environment drift test after the existing `driftCases`
loop:

```javascript
const signingSecretDriftCases = [
    ...SIGNING_SECRET_NAMES.map((missing) => [
        `missing ${missing}`,
        (entries) => entries.filter(({name}) => name !== missing),
    ]),
    ['retired publication App secret', (entries) => [
        ...entries,
        {name: 'CATALOGUE_PUBLICATION_APP_PRIVATE_KEY'},
    ]],
    ['duplicate commit-signing secret', (entries) => [
        ...entries,
        {name: 'CATALOGUE_COMMIT_SIGNING_PRIVATE_KEY'},
    ]],
    ['malformed secret entry', (entries) => [...entries, {}]],
    ['secret value exposure', (entries) => entries.map((entry, index) =>
        index === 0 ? {...entry, value: 'credential-canary'} : entry)],
];

for (const [name, mutate] of signingSecretDriftCases) {
    test(`fails signing-secret-presence for ${name}`, (t) => {
        const state = fixture();
        t.after(() => fs.rmSync(state.context.projectRoot, {recursive: true, force: true}));
        const endpoint = 'repos/kyaulabs/prism-adapters/environments/catalogue-signing/secrets';
        const entries = state.responses.get(endpoint).secrets;
        state.responses.set(endpoint, {secrets: mutate(entries)});

        const status = cataloguePublicationReadinessCommand(
            ['readiness', '--phase=pre-activation', '--json'],
            state.context,
        );
        const output = state.output();
        const report = JSON.parse(output);

        assert.equal(status, 3, name);
        assert.equal(report.status, 'NO-GO', name);
        assert.equal(
            report.checks.find(({id}) => id === 'signing-secret-presence').status,
            'FAIL',
            name,
        );
        assert.doesNotMatch(output, /credential-canary/, name);
    });
}
```

Keep the existing credential drift harness assertion that `state.requests` is
empty. It proves schema 2 and every invalid nested assertion fail before GitHub
access.

- [ ] **Step 2: Run the readiness tests to verify Red**

Run:

```text
npm run test:node
```

Expected: FAIL in `catalogue-publication-readiness.test.js`; the current source
rejects schema 3 and still expects only three publisher secret names.

- [ ] **Step 3: Implement the minimal closed contract**

Add the canonical source constant after `REPOSITORY`:

```javascript
const SIGNING_SECRET_NAMES = Object.freeze([
    'CATALOGUE_SIGNING_PRIVATE_KEY',
    'CATALOGUE_SIGNING_PASSPHRASE',
    'CATALOGUE_PUBLICATION_TOKEN',
    'CATALOGUE_COMMIT_SIGNING_PRIVATE_KEY',
    'CATALOGUE_COMMIT_SIGNING_PASSPHRASE',
]);
```

Add this validator after `validCredential`:

```javascript
function validPublicationCommitSigning(value) {
    return exactKeys(value, [
        'type', 'identity', 'privateMaterialOutsideRepositoriesReviewed',
        'offlineRecoveryCustodyReviewed',
        'separatedFromCatalogueSigningReviewed',
        'separatedFromPublicationCredentialReviewed',
    ]) && value.type === 'OPENPGP' &&
        value.identity === 'kyaulabs-bot <actions@kyaulabs.com>' &&
        value.privateMaterialOutsideRepositoriesReviewed === true &&
        value.offlineRecoveryCustodyReviewed === true &&
        value.separatedFromCatalogueSigningReviewed === true &&
        value.separatedFromPublicationCredentialReviewed === true;
}
```

Change the root validation to require `publicationCommitSigning`, schema 3, and
the new validator:

```javascript
if (!exactKeys(value, [
    'schemaVersion', 'checkedAt', 'dispatchCredential', 'publicationCredential',
    'publicationCommitSigning', 'credentialSeparationReviewed', 'retentionDays',
    'administratorAccessReviewed', 'offlineRecoveryCustodyReviewed',
]) || value.schemaVersion !== 3 ||
    typeof value.checkedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value.checkedAt) ||
    Number.isNaN(Date.parse(value.checkedAt)) ||
    new Date(Date.parse(value.checkedAt)).toISOString().replace('.000Z', 'Z') !== value.checkedAt ||
    !validCredential(value.dispatchCredential, {
        label: 'prism-catalogue-dispatch',
        permissions: {actions: 'write'},
    }) ||
    !validCredential(value.publicationCredential, {
        label: 'prism-adapters-catalogue-publication',
        permissions: {contents: 'write', pullRequests: 'write'},
    }) ||
    !validPublicationCommitSigning(value.publicationCommitSigning) ||
    value.dispatchCredential.label === value.publicationCredential.label ||
    value.credentialSeparationReviewed !== true ||
    !exactKeys(value.retentionDays, ['prism', 'prismAdapters']) ||
    value.retentionDays.prism !== 7 || value.retentionDays.prismAdapters !== 7 ||
    value.administratorAccessReviewed !== true ||
    value.offlineRecoveryCustodyReviewed !== true) {
    throw new Error('catalogue publication attestation is invalid');
}
```

Use the constant in `signing-secret-presence`:

```javascript
evaluate('signing-secret-presence', 'signing credential names are present', () =>
    namesReady(request(`${signingPrefix}/secrets`), 'secrets', SIGNING_SECRET_NAMES)),
```

Insert the explicit PASS check after `credential-separation`:

```javascript
pass(
    'publication-commit-signing-custody',
    'publication commit-signing custody is attested',
),
```

Do not change report schema version 1; the report envelope did not change.

- [ ] **Step 4: Run the Node suite to verify Green**

Run:

```text
npm run test:node
```

Expected: PASS for the complete Node suite, including canonical pre-activation,
active-phase, schema drift, all five missing-name cases, extra/duplicate/name
malformation, and redaction.

- [ ] **Step 5: Create the runtime commit**

Stage only the source and focused test:

```bash
git add packages/prism-core/scripts/prism-tool/catalogue-publication-readiness.js tests/Node/catalogue-publication-readiness.test.js
```

Load the `conventional-commits` skill, then run this as a standalone tool call:

```text
prism-tool commit create --type fix --scope security --subject "enforce commit signing readiness" --refs 476
```

Expected: one signed runtime commit; no documentation or ignored attestation is
included.

---

### Task 3: Document provisioning, recovery, and packaged evidence

**Files:**

- Modify: `tests/Node/toolchain-packaging.test.js:215-253`
- Modify: `packages/prism-core/docs/catalogue-publication-provisioning.md:1-285`

**Interfaces:**

- Consumes: schema 3 and five-name behavior from Task 2
- Produces: packaged human runbook evidence for provisioning, exposure,
  rotation, succession, and fresh attestation

- [ ] **Step 1: Write the failing packaged-documentation assertions**

Add these assertions to
`documents human-only bot-owned catalogue publication provisioning`:

```javascript
assert.match(runbook, /CATALOGUE_COMMIT_SIGNING_PRIVATE_KEY/);
assert.match(runbook, /CATALOGUE_COMMIT_SIGNING_PASSPHRASE/);
assert.match(runbook, /"schemaVersion": 3/);
assert.match(runbook, /"type": "OPENPGP"/);
assert.match(runbook, /kyaulabs-bot <actions@kyaulabs[.]com>/);
assert.match(runbook, /privateMaterialOutsideRepositoriesReviewed/);
assert.match(runbook, /offlineRecoveryCustodyReviewed/);
assert.match(runbook, /separatedFromCatalogueSigningReviewed/);
assert.match(runbook, /separatedFromPublicationCredentialReviewed/);
assert.match(runbook, /publication commit-signing custody is attested/);
assert.match(runbook, /commit-signing.*suspected exposure/is);
assert.match(runbook, /commit-signing.*succession/is);
```

Retain the existing negative credential-material assertion.

- [ ] **Step 2: Run the Node suite to verify Red**

Run:

```text
npm run test:node
```

Expected: FAIL in `toolchain-packaging.test.js` because the runbook still
documents schema 2 and only three publisher secrets.

- [ ] **Step 3: Update the authority and provisioning sections**

Revise the introduction to state that the transaction uses two PATs plus a
separate OpenPGP publication commit-signing authority. Add this authority
profile after the PAT profiles:

```markdown
The publication commit-signing authority has:

- type: OpenPGP;
- public identity: `kyaulabs-bot <actions@kyaulabs.com>`;
- private key material stored outside repository worktrees;
- offline recovery custody reviewed by a human; and
- no shared private material with catalogue-envelope signing or either PAT.

The publisher repository owns the public fingerprints, canonical commit
construction, signing implementation, and GitHub verification gate. This Core
runbook records the public identity and custody boundary only.
```

In **Before provisioning**, require a browser review that the bot account has
the publisher-approved public OpenPGP key and that the protected publisher
workflow verifies GitHub's exact `valid` result before creating a sequence ref.
Do not copy a fingerprint into Core documentation.

Replace the publisher environment steps so they retain or add exactly these
five names and no environment variable:

```text
CATALOGUE_SIGNING_PRIVATE_KEY
CATALOGUE_SIGNING_PASSPHRASE
CATALOGUE_PUBLICATION_TOKEN
CATALOGUE_COMMIT_SIGNING_PRIVATE_KEY
CATALOGUE_COMMIT_SIGNING_PASSPHRASE
```

State that a human retrieves both OpenPGP values through approved out-of-band
custody and pastes them directly into GitHub. The private key, passphrase,
recovery location, and holder identities must not enter the terminal or any
agent-visible state.

- [ ] **Step 4: Replace the attestation template and readiness evidence**

Change the template to schema 3 and insert this exact object after
`publicationCredential`:

```json
"publicationCommitSigning": {
  "type": "OPENPGP",
  "identity": "kyaulabs-bot <actions@kyaulabs.com>",
  "privateMaterialOutsideRepositoriesReviewed": true,
  "offlineRecoveryCustodyReviewed": true,
  "separatedFromCatalogueSigningReviewed": true,
  "separatedFromPublicationCredentialReviewed": true
},
```

Explain that schema 2 cannot be migrated mechanically. A human must repeat the
commit-signing custody and separation review, set a fresh `checkedAt`, and write
schema 3 without private details.

Update pre-activation readiness so the expected report includes exactly one
`credential-lifecycle` advisory, a
`publication-commit-signing-custody` PASS with message
`publication commit-signing custody is attested`, and PASS for every other
check.

- [ ] **Step 5: Add exposure, rotation, and succession procedures**

Add a separate commit-signing exposure procedure with these exact operations:

```markdown
For suspected exposure of publication commit-signing material:

1. Ensure `CATALOGUE_SIGNING_ENABLED` is absent or not `true`.
2. Remove both `CATALOGUE_COMMIT_SIGNING_*` environment secrets in the GitHub
   web interface and stop publication.
3. Review bot-account signing keys, publisher workflow revisions, sequence
   branches, pull requests, GitHub verification results, and relevant audit
   events without copying private material.
4. Through the approved out-of-band human process, create a distinct
   replacement OpenPGP authority, retain its recovery material outside
   repositories, and register its public key for `kyaulabs-bot`.
5. Update and human-merge the publisher-owned public fingerprint policy and
   verification tests under the protected signed-commit ruleset.
6. Add replacement values to the two commit-signing environment secrets
   through GitHub's web interface.
7. Repeat the complete authority-separation and recovery review, write a fresh
   schema-3 attestation, and rerun pre-activation readiness and the disabled
   publication-path test.
```

State that a public identity change requires a reviewed Core contract update
before activation; a fingerprint-only rotation remains publisher-owned.

Expand **Recovery and succession** so a successor receives the three separate
authorities through approved out-of-band custody and repeats the OpenPGP public
identity, external storage, offline recovery, and separation review. Keep human
holder identities and custody locations out of repository documentation.

- [ ] **Step 6: Run documentation and Node verification**

Stage the two changed files:

```bash
git add packages/prism-core/docs/catalogue-publication-provisioning.md tests/Node/toolchain-packaging.test.js
```

Run:

```text
prism-tool markdown lint --cached
```

Expected: exit 0 with no Markdown lint findings.

Run:

```text
npm run test:node
```

Expected: PASS for the complete Node suite, including every new packaged
runbook assertion and the existing private-material negative assertion.

- [ ] **Step 7: Create the terminal implementation commit**

Load the `conventional-commits` skill, then run this as a standalone tool call:

```text
prism-tool commit create --type docs --scope security --subject "document commit signing recovery" --fixes 476
```

Expected: one signed terminal implementation commit with the sole closing
reference for #476.

---

## Completion Verification

After all three task commits:

1. Load `verification-before-completion` and rerun `npm run test:node` from the
   committed branch state.
2. Confirm `git status --short` contains no tracked or untracked implementation
   artifacts and the ignored local attestation is not staged.
3. Run the project `/check` gate and resolve every failure without weakening a
   test or security assertion.
4. With `CATALOGUE_SIGNING_ENABLED` still absent, request a fresh human-reviewed
   schema-3 local attestation before running the live bounded command:

   ```text
   prism-tool catalogue-publication readiness --phase=pre-activation --json
   ```

5. Require exit 0, overall `GO`, one lifecycle advisory, the explicit
   publication commit-signing custody PASS, and no unexpected check status.
6. Hand the green branch to `finishing-a-development-branch` for synchronization,
   the initial four-axis review, cleanup of this plan and its matching spec,
   and preparation-only `/pr`. The human pushes and merges.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
