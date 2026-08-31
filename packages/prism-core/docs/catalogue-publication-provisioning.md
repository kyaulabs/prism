# Catalogue Publication Provisioning

This runbook provisions the two fine-grained personal access tokens used by the
catalogue publication transaction. Authentication is owned by the
`kyaulabs-bot` account, but dispatch and publication remain separate
credentials with disjoint write authority.

Humans perform every account, token, environment, secret, retention, and
activation operation in GitHub's web interface. Never place a token value in
chat, an agent-visible terminal, source, tests, issues, pull requests, logs,
artifacts, screenshots, or the readiness attestation. Do not ask an agent to
inspect a token or verify it by using it.

## Authority profiles

Both credentials must have:

- token type: fine-grained personal access token;
- credential owner: `kyaulabs-bot`;
- resource owner: `kyaulabs`;
- repository access: **Only select repositories**;
- selected repository: only `prism-adapters`;
- no account permissions;
- no organization permissions; and
- every repository permission not listed below set to no access.

The token named `prism-catalogue-dispatch` has only:

- **Actions: write**.

It must not have Contents or Pull requests write authority.

The token named `prism-adapters-catalogue-publication` has only:

- **Contents: write**; and
- **Pull requests: write**.

It must not have Actions write authority. One token carrying all three write
permissions is prohibited because it would let the Prism release job exercise
publisher mutation authority.

Both approved tokens are non-expiring and have no planned rotation. The
readiness attestation records `rotationPolicy` as `NONE_ACCEPTED`, and readiness
reports this accepted security debt as `ADVISORY`. Do not interpret that status
as a recommendation for future credentials.

## Before provisioning

1. Verify that `kyaulabs/prism-adapters` protected `main` contains the direct
   publication-token workflow and no GitHub App token-minting step.
2. Verify that Prism's proposed release workflow uses
   `CATALOGUE_DISPATCH_TOKEN` directly and targets only
   `kyaulabs/prism-adapters`, `catalogue-signing.yml`, and `main`.
3. In both repositories, open **Settings → Rules → Rulesets**. Confirm the
   active `main` ruleset has no bypass actor and requires deletion protection,
   non-fast-forward protection, signed commits, and pull requests.
4. In `kyaulabs/prism-adapters`, open **Settings → Secrets and variables →
   Actions → Variables**. Keep `CATALOGUE_SIGNING_ENABLED` absent. If it exists,
   delete it before continuing.
5. Do not enter either PAT until both trusted workflow revisions are on their
   protected default branches.

## Verify the existing PAT metadata

Sign in to GitHub as `kyaulabs-bot`. Open **Settings → Developer settings →
Personal access tokens → Fine-grained tokens**. Open each token's metadata page
without copying or displaying its value outside the browser.

For `prism-catalogue-dispatch`, verify:

1. **Resource owner** is `kyaulabs`.
2. **Repository access** is **Only select repositories**.
3. The only selected repository is `kyaulabs/prism-adapters`.
4. Under **Repository permissions**, Actions is read and write.
5. Contents and Pull requests are not read and write.
6. No unrelated permission is read and write.
7. The token has no expiration.

For `prism-adapters-catalogue-publication`, verify:

1. **Resource owner** is `kyaulabs`.
2. **Repository access** is **Only select repositories**.
3. The only selected repository is `kyaulabs/prism-adapters`.
4. Under **Repository permissions**, Contents is read and write.
5. Pull requests is read and write.
6. Actions is not read and write.
7. No unrelated permission is read and write.
8. The token has no expiration.

Stop if either page identifies a classic PAT, another owner, another repository,
an extra write permission, or one combined credential. Correct the token in the
browser and repeat the complete metadata review. Do not send screenshots that
could contain credential or account-recovery data.

## Provision the dispatch environment

In `kyaulabs/prism`:

1. Open **Settings → Environments**.
2. Create or open `catalogue-dispatch`.
3. Under **Deployment branches and tags**, select **Selected branches and
   tags**, add custom deployment branch `main`, and remove every other policy.
4. Under **Environment secrets**, remove retired
   `CATALOGUE_DISPATCH_APP_PRIVATE_KEY` if present.
5. Under **Environment variables**, remove retired
   `CATALOGUE_DISPATCH_APP_ID` if present.
6. Add environment secret `CATALOGUE_DISPATCH_TOKEN`.
7. Retrieve the dispatch PAT through the approved out-of-band human custody
   process and paste it directly into GitHub's secret-value field. Save it
   without exposing the value to this session.
8. Confirm the environment contains exactly the one expected secret name and
   no environment variable.

The release workflow exposes this secret only as `GH_TOKEN` on the fixed
workflow-dispatch step. Its workflow `GITHUB_TOKEN` permissions remain empty.

## Provision the publication environment

In `kyaulabs/prism-adapters`:

1. Open **Settings → Environments**.
2. Create or open `catalogue-signing`.
3. Under **Deployment branches and tags**, select **Selected branches and
   tags**, add custom deployment branch `main`, and remove every other policy.
4. Retain the separate signing secrets `CATALOGUE_SIGNING_PRIVATE_KEY` and
   `CATALOGUE_SIGNING_PASSPHRASE`.
5. Remove retired `CATALOGUE_PUBLICATION_APP_PRIVATE_KEY` if present.
6. Remove retired environment variable `CATALOGUE_PUBLICATION_APP_ID` if
   present.
7. Add environment secret `CATALOGUE_PUBLICATION_TOKEN`.
8. Retrieve the publication PAT through the approved out-of-band human custody
   process and paste it directly into GitHub's secret-value field. Save it
   without exposing the value to this session.
9. Confirm the environment contains exactly the three expected secret names
   and no environment variable.

The protected publisher command receives the publication PAT only after
unprivileged evidence validation, synthetic-key tests, production signing, and
reverification succeed.

## Bound Actions settings

For each repository, open **Settings → Actions → General**:

1. Require Actions to be pinned to a full-length commit SHA.
2. Set artifact and log retention to **seven days**.
3. Save and reopen the page to verify both settings persisted.

Readiness treats a missing full-SHA policy or retention other than seven days
as a blocking failure.

## Create the non-secret attestation

Create `.pi/prism-tool/catalogue-publication-readiness.json` in the local Prism
checkout. This ignored file contains metadata only. It must be a regular,
non-symlink file. Do not add credential values, token prefixes, custody paths,
account-recovery data, or unrelated GitHub metadata.

Use this exact schema, replacing `checkedAt` with the UTC time when the human
metadata review finished:

```json
{
  "schemaVersion": 2,
  "checkedAt": "2026-08-29T20:00:00Z",
  "dispatchCredential": {
    "type": "FINE_GRAINED_PAT",
    "label": "prism-catalogue-dispatch",
    "credentialOwner": "kyaulabs-bot",
    "resourceOwner": "kyaulabs",
    "repositories": ["kyaulabs/prism-adapters"],
    "permissions": {"actions": "write"},
    "expiresAt": null,
    "rotationPolicy": "NONE_ACCEPTED"
  },
  "publicationCredential": {
    "type": "FINE_GRAINED_PAT",
    "label": "prism-adapters-catalogue-publication",
    "credentialOwner": "kyaulabs-bot",
    "resourceOwner": "kyaulabs",
    "repositories": ["kyaulabs/prism-adapters"],
    "permissions": {"contents": "write", "pullRequests": "write"},
    "expiresAt": null,
    "rotationPolicy": "NONE_ACCEPTED"
  },
  "credentialSeparationReviewed": true,
  "retentionDays": {"prism": 7, "prismAdapters": 7},
  "administratorAccessReviewed": true,
  "offlineRecoveryCustodyReviewed": true
}
```

The attestation asserts what a human reviewed; it does not prove the credential
value or make that value available to readiness.

## Pre-activation readiness

Keep `CATALOGUE_SIGNING_ENABLED` absent and run:

```text
prism-tool catalogue-publication readiness --phase=pre-activation --json
```

A ready report has status `GO`, one `credential-lifecycle` `ADVISORY`, and only
`PASS` for every other check. Stop on `FAIL`, `MANUAL`, malformed output, or an
unexpected advisory. Correct the GitHub setting or attestation metadata, then
rerun the complete command.

While activation remains absent, use the GitHub Actions web interface to run
one release-mode `catalogue-signing` dispatch with a known stable Prism release
version and its immutable lowercase merge commit. Confirm unprivileged trigger
validation runs and the protected publication path does not execute. Do not
invent release evidence and do not enable signing to make this check pass.

Issue #469 owns activation, the first credential-bearing production
publication, and raw catalogue verification. At that later gate, the human sets
repository variable `CATALOGUE_SIGNING_ENABLED` to exact `true` and runs:

```text
prism-tool catalogue-publication readiness --phase=active --json
```

Do not activate as part of issue #468.

## Suspected exposure and replacement

For suspected exposure of the dispatch PAT:

1. Ensure `CATALOGUE_SIGNING_ENABLED` is absent or not `true`.
2. As `kyaulabs-bot`, revoke only `prism-catalogue-dispatch`.
3. Review bot-account access, organization access, selected repositories,
   permission changes, audit events, release workflow revisions, and unexpected
   publisher dispatches.
4. Create a replacement fine-grained PAT with the exact dispatch profile.
5. Replace only `CATALOGUE_DISPATCH_TOKEN` through the environment web page.
6. Recheck metadata, update only `checkedAt`, and rerun pre-activation
   readiness.

For suspected exposure of the publication PAT:

1. Ensure `CATALOGUE_SIGNING_ENABLED` is absent or not `true`.
2. As `kyaulabs-bot`, revoke only
   `prism-adapters-catalogue-publication`.
3. Review bot-account access, organization access, selected repositories,
   permission changes, audit events, publisher workflow revisions, publication
   branches, and pull requests.
4. Create a replacement fine-grained PAT with the exact publication profile.
5. Replace only `CATALOGUE_PUBLICATION_TOKEN` through the environment web page.
6. Recheck metadata, update only `checkedAt`, and rerun complete readiness.

If the affected credential cannot be identified, revoke both, review both
profiles independently, and replace them as two distinct PATs. Never broaden a
replacement temporarily. Signing-key exposure follows ADR-0094's separate
Core-first emergency process.

## Recovery and succession

At each security review, verify that `kyaulabs-bot` remains controlled by the
approved maintainers, both PAT profiles remain disjoint, the environments and
rulesets remain restricted, and recovery authority is available out of band.
Record only non-secret review time, workflow revisions, repository selections,
permission profiles, environment and ruleset status, retention, and activation
state.

A successor receives bot-account administration, token replacement authority,
signing custody, and recovery procedures through the approved out-of-band
human process. Repository documentation must not identify custody locations,
recovery codes, credential values, or individual secret holders. The successor
must repeat the full metadata and readiness review before activation.

The current non-expiring, no planned rotation posture is accepted debt, not a
permanent standard. A future reviewed change may introduce expiration,
scheduled rotation, or another machine identity without combining dispatch and
publication authority.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
