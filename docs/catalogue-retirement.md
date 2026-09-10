# Hosted Catalogue Retirement

## Verified state

The local Lean Prism implementation no longer ships a catalogue client,
publication integration, signatures, provisioning protocol or notification
workflow. Both replacement packages were manually published as **1.0.0** by the
user and independently confirmed through public registry metadata.

PRs #539, #540 and #541 delivered the replacement to main and develop. GitHub
release `v1.0.0` exists at `198dc104c00ddd60216b53bfb724cd6e66b39fcf`.
The owner deleted `kyaulabs/prism-adapters` after publication. Subsequent GitHub
API inspection returned HTTP 404, consistent with that confirmation. Retirement
is complete. Earlier agent attempts lacked `delete_repo` scope; no authentication
configuration was changed to bypass that limit.

PRs #542–#543 restored workflow-only release-on-merge and automatic back-merge.
Both hosted workflows succeeded, and all three 1.0.0 release/package tags resolve
to the release commit above. Published package contents were unchanged.

## Automation retired

The following workflows were disabled through GitHub's API and subsequently
verified as `disabled_manually`:

| Repository | Workflow | ID |
| --- | --- | --- |
| `kyaulabs/prism` | Catalogue notification | 350261337 |
| `kyaulabs/prism-adapters` | Catalogue publication | 345660164 |
| `kyaulabs/prism-adapters` | Continuous integration | 345650342 |
| `kyaulabs/prism-adapters` | Back-merge main to develop | 345660162 |

No queued or in-progress catalogue runs were returned after disabling them.
No repository webhook or deploy-key entries were returned. Shared organization
infrastructure was not changed.

## Credential inventory for the owner

Only secret **names**, not values, were inspected. Before repository deletion,
the catalogue's `catalogue-signing` environment contained:

- `CATALOGUE_COMMIT_SIGNING_PASSPHRASE`
- `CATALOGUE_COMMIT_SIGNING_PRIVATE_KEY`
- `CATALOGUE_PUBLICATION_TOKEN`
- `CATALOGUE_SIGNING_PASSPHRASE`
- `CATALOGUE_SIGNING_PRIVATE_KEY`

Prism's `catalogue-dispatch` environment formerly contained
`CATALOGUE_DISPATCH_TOKEN`. That dedicated environment has been deleted and its
absence verified; the unrelated `copilot` environment was preserved.
The catalogue also held the `CATALOGUE_SIGNING_ENABLED` variable. These names
identify dedicated storage and workflows; they do not establish whether an
underlying account token or signing identity is shared elsewhere.

Deleting a GitHub secret or repository removes stored material but does not
necessarily revoke an underlying token. The owner should revoke dedicated
account tokens and signing registrations after checking their other uses.
Do not read private values or revoke shared identities to automate this step.
No credential values were read and no account-level credentials were revoked.

## Authorized delivery order

The user selected replacement delivery first and authorized automatic push,
PR, review, merge and publication. Push as `kyau`; create and merge PRs and
delete merged task branches as `kyaulabs-bot`. Run every PR Test Plan item after
PR creation before approving as `kyau`. Preserve `main`, `develop` and release
branches. The user completed manual npm publication, then deleted the catalogue.
No repository-deletion action remains. The credential inventory above remains
for owner-side review of underlying token/signing identities; deletion is not
proof of account-level revocation.

The Prism release/back-merge workflows are retained: GitHub Actions may use its
own identity. Coding-agent account roles are scoped to agent operations in the
repository-local `AGENTS.md`, not imposed on Actions or downstream Prism users.
