# Hosted Catalogue Retirement

## Verified state

The local Lean Prism implementation no longer ships a catalogue client,
publication integration, signatures, provisioning protocol or notification
workflow. The replacement packages are prepared as 1.0.0, not published.

Remote inspection confirmed that the live default branch of `kyaulabs/prism`
still declares Core 0.6.0 with the old workflow executables and protocol metadata.
This refactor has not been pushed or merged. Deleting the catalogue now can
break those existing consumers before the replacement is delivered.

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

Only secret **names**, not values, were inspected. The catalogue's
`catalogue-signing` environment contains:

- `CATALOGUE_COMMIT_SIGNING_PASSPHRASE`
- `CATALOGUE_COMMIT_SIGNING_PRIVATE_KEY`
- `CATALOGUE_PUBLICATION_TOKEN`
- `CATALOGUE_SIGNING_PASSPHRASE`
- `CATALOGUE_SIGNING_PRIVATE_KEY`

Prism's `catalogue-dispatch` environment contains `CATALOGUE_DISPATCH_TOKEN`.
The catalogue also has the `CATALOGUE_SIGNING_ENABLED` variable. These names
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
branches. Repository deletion has not occurred.

The user will perform `npm publish` manually. GitHub delivery proceeds
automatically; catalogue deletion waits for confirmation that both replacement
packages are published. Do not request tokens or attempt registry login.
