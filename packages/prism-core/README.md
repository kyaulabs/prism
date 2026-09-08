# <img src="https://raw.githubusercontent.com/kyaulabs/prism/main/.github/media/prism-dark-panel.png" alt="Prism" width="45%" />

## @kyaulabs/prism-core

Prism Core is the language-independent half of the Prism coding harness for
[pi](https://pi.dev). Install it globally so its instructions, skills, prompts,
safety and bounded web-access extensions, and launcher are available in every
trusted project.

## Package responsibility

Core owns:

- the engineering workflow and language-independent skills;
- Core prompt templates such as `/setup`, `/check`, `/pr`, and `/release`;
- global `AGENTS.md` and `APPEND_SYSTEM.md` resources;
- the safety enforcement and bounded web-access extensions;
- the `prism-tool` launcher and Core toolchain contract;
- the `prism-review` ad hoc runtime, installed version-two authority,
  and closed Core review policy;
- strict-empty setup orchestration and generic project-provider composition;
- repository creation, canonical hooks, root-seed preparation, and recovery;
- optional project capabilities;
- managed release configuration and review-chain state.

Stack behavior belongs to project-local adapters. The PHP/web adapter supplies
PHP, Aurora, MariaDB, nginx, SCSS, JavaScript, Pest, and browser guidance while
Core remains stack-agnostic.

The package archive includes `extensions/`, `skills/`, `prompts/`, `scripts/`,
`config/`, `docs/`, `toolchain.json`, `safe-dirs.json`, `AGENTS.md`,
`APPEND_SYSTEM.md`, and `NOTICE`.

## Install

Semgrep `>=1.173.0 <2.0.0` must already be installed. Prism verifies it but
never installs, configures, authenticates, or reads its credentials.

From a Prism checkout:

```bash
bash packages/prism-core/scripts/install-global.sh
```

For an npm source, the installer requires separate registry authorization:

```bash
PRISM_CORE_SOURCE=npm:@kyaulabs/prism-core bash packages/prism-core/scripts/install-global.sh --network-approved=yes
```

The installer deploys `prism-tool` and `prism-review` to
`${PRISM_BIN_DIR:-$HOME/.local/bin}` and installs the global instruction
resources. It does not edit shell startup files or `PATH`, and it refuses to
overwrite an unrelated launcher. Remove the Prism-owned launcher set with:

```bash
bash packages/prism-core/scripts/install-global.sh --uninstall-launcher
```

Before deploying launchers or context resources, installation verifies the
packaged review executable and runs `prism-review sdk --json`. SDK failure
stops deployment and cannot count as installation readiness success; an
already-downloaded package may remain for remediation. Model, profile, and
authentication availability are not installer prerequisites.

After deployment, installation runs `prism-tool doctor --local-only`, creates
no web-access consent, and makes no live provider or
public-web request. Failure at this toolchain check leaves the package,
launchers, and context resources installed for remediation.

After installation, run `/setup` to manage standing web-access consent, optional
closed web configuration, and optional Pi session defaults. Revoke web consent
with `prism-tool consent revoke-web`. Only explicitly approved setup migration
converts legacy consent to web-only schema three. Review has one-attempt
authorization, not standing consent. Provider login and model selection remain
Pi operations; Prism does not prescribe them.

Install a stack adapter in the consumer project. For PHP/web:

```bash
pi install -l npm:@kyaulabs/prism-php-web
```

## Toolchain and Markdown readiness

`toolchain.json` declares exact bundled Core tools and compatible external
prerequisites. Core bundles commitlint, git-cliff, and `markdownlint-cli2`.
Semgrep remains the mandatory external tool. Routine gates never install or
update tools.

Run offline readiness with:

```bash
prism-tool doctor --local-only
```

Full `/doctor` verifies installed reviewer trust, SDK compatibility, model
metadata, Core policy, and the active adapter without inference. Optional web
readiness is reported separately. CI creates no consent and runs no provider
review or web access.

The installed `prism-review` engine owns criteria, deterministic checks, and
version-two review authority. Ad hoc staged, commit, branch, and path reports
remain non-authoritative. Authoritative commands include:

```text
prism-review criteria record --source ROLE:COMMIT:PATH [--source ROLE:COMMIT:PATH ...] --json
prism-review criteria none --json
prism-review check --base-ref origin/develop|origin/main --json
prism-review review authoritative --base-ref origin/develop|origin/main --json
prism-review review repair --base-ref origin/develop|origin/main --closures RELATIVE_PATH --json
```

The bridge can author schema-version-two evidence only from installed Core
outside the reviewed repository and, when an adapter is active, a matching
external installed adapter. Checkout Core cannot author that evidence. The
engine is the only finalization authority. Humans release, publish, and install
matching packages outside the reviewed checkout. See [Review runtime](docs/review-runtime.md)
for grammar, receipt state, limits, provider cost, and fail-closed preflight.

Use `prism-review sdk --json` to check Core’s runtime SDK dependency without
model selection, credentials, or inference. See [SDK prerequisite checks and
readiness diagnostics](docs/review-runtime.md#sdk-prerequisite-check) before
running the consumer-specific doctor.

The Core Markdown profile checks changed ADRs, `docs/`, maintained root docs,
package READMEs and package docs, and maintained extension READMEs:

```bash
prism-tool markdown lint --cached
prism-tool markdown lint --changed-from REVISION
```

The checker reads staged or committed Git blobs, uses the packaged
configuration, and never loads project-local Markdown configuration, plugins,
or custom rules. Skills, prompts, agent instructions, generated history, legal
text, and unrelated templates require separate format-aware treatment.

Semgrep scans run in disposable private Git repositories, never in the consumer
checkout. Supported inputs, preservation checks, and bounds are documented in
[Review runtime](docs/review-runtime.md#isolated-semgrep-scans).

Managed project readiness is read-only:

```bash
prism-tool automation health --json
```

It verifies manifest composition, automation, and effective canonical hooks.
`CURRENT` means configured state passed; `NOT_CONFIGURED` reports inapplicable
checks as `SKIPPED`; `CONFLICT` blocks readiness without repair. Runtime readers
accept safe restrictive permissions after Git recreation; creation remains
`0644` for data and `0755` for executable wrappers. See
[Project manifest](docs/project-manifest.md#public-managed-file-permissions).

## Supervised test servers

Adapters may declare foreground-scoped loopback server profiles for test
suites. Run one permitted client within a profile's lifecycle with:

```text
prism-tool server run PACKAGE:PROFILE --tool TOOL_ID -- ARGUMENTS
```

Each adapter profile declares its preferred port and trusted server, health,
and client settings. Core chooses the nearest available valid port, never
reuses an occupied listener, waits for readiness, passes the selected endpoint
to the client, and cleans up only its owned process group when the client ends.
Arbitrary project server commands and non-loopback listeners are rejected.

## Bounded web access

The web-access extension exposes only `web_search` and `fetch_content`. Both
require independent standing web-access consent managed by `/setup`. Search
routes through a confined supported Chromium-family browser when available,
optional credential-free loopback SearXNG second, and guarded DuckDuckGo HTML
last. Public content fetching is browser-free and returns bounded readable or
raw textual pages.

The extension rejects private or mixed DNS answers, pins connections, validates
redirects, enforces textual MIME and decompression limits, accepts no
credentials or caller headers, and keeps no persistent search state. Optional
configuration is a private closed record containing only browser `auto` or
`disabled` and an optional loopback SearXNG URL. See
[`extensions/web-access/README.md`](extensions/web-access/README.md).

## Source-checkout setup

`prism-tool setup route --json` recognizes independent Prism development clones
and forks structurally, without remote lookup, pristine source requirements, or
a directory-name convention. A verified source reports `SOURCE_CHECKOUT` and
`SOURCE_CHECKOUT_SETUP` in the closed schema-two route. Incomplete or unsafe
claims fail closed; source-shaped linked worktrees remain unsupported.

`/setup` checks retained bootstrap continuity before proceeding. The source
branch preserves repository-owned workflows, hooks, coverage infrastructure,
release configuration, manifests, lockfiles, and disk-backed adapter activation.
Consumer metadata, automation and release reconciliation, scaffold/dependency
provisioning, and canonical hook activation are not applicable. Missing or
invalid source adapter activation requires human remediation, not an implicit
Core-only result or an installation that rewrites tracked settings.

Shared global installation, independent standing consent, optional model/web
preferences, and optional GitHub operations retain their existing approvals.
Source recognition grants none of those effects. Source validation reuses
`/check` and the resolved harness validator, including existing clean-tree and
branch gates. Failures remain NO-GO; setup never repairs files or uses the
normalizing pre-commit hook as a read-only validator. Identity is revalidated
before source execution and final success. Reports distinguish preserved source
files and inapplicable consumer reconciliation from actual validation PASS/FAIL.
Recognition itself does not certify quality or bypass commit/review gates.

## Established and strict-empty setup

Established projects keep the existing evidence-driven setup path. They do not
enter strict-empty source selection, adapter acquisition, or bootstrap
transactions. Established repositories use a schema two project manifest with
exact `ESTABLISHED` source evidence. Core creates or migrates the manifest in
the same journaled transaction as repository automation, verifies all providers,
and only then offers separate canonical-hook activation.

A Core-only (`CORE_ONLY`) established composition records a null adapter and
runs hooks without loading adapter code. An `ADAPTER` composition must match one exact
project-local registration; malformed or ambiguous adapter evidence is not
absence. Valid schema-one Blank and Template manifests remain supported and are
not rewritten only because the repository is established. See
[Project manifest](docs/project-manifest.md).

Strict-empty setup offers Template, Blank, or Cancel. Template is recommended.
Blank performs no Template lookup. Cancel exits without creating bootstrap
state. The next choice is Core-only or PHP/web; strict-empty setup may select
the exact PHP/web adapter after displaying its package and version. Adapter
selection is the installation authorization.

Optional capabilities are disabled by default. Setup renders an identity preview
of public fields and publication targets before the complete project plan and
its one literal mutation approval.

### Provider-composed Blank and Template projects

All durable project bytes in Provider-composed Blank and Template projects
come from trusted installed Core and adapter providers. Template acquisition supplies
only immutable, untrusted catalogue evidence. Template manifests may advertise
recognized providers and capabilities but never select them, define project
bytes, add packages, or control policy.

Core validates and composes generic provider reports. The same generic
preparation, provider-report, and quality contracts apply to Core-only and
adapter projects. Core owns the outer transaction; adapters own stack output.

Source and provider evidence remain digest-bound through the private plan,
recovery journal, durable project manifest, and root-seed attestation. Canonical
hooks also bind the adapter identity, activation file, and provider-report
digest.

Before the durable marker, a failure restores strict emptiness when transaction
ownership is provable. After the durable marker, Prism retains the complete
project and deterministic resume evidence. If `apply.recovery.lock` remains
after interruption, then after confirming no setup process is running, remove only
the reported lock path and rerun the retained apply operation.

### Application states and effects

The application transaction moves through:

```text
PLAN_READY -> PREPARED -> APPLYING -> PROJECT_DURABLE
```

A pre-durable failure reports `ROOT_RESTORED` when owned state is removed or
`RECOVERY_REQUIRED` when ambiguous evidence must remain. Durable recovery
reports `REPOSITORY_BOOTSTRAP`.

Application does not initialize Git, run dependency or quality commands,
activate hooks, or access the network. It creates no remote, performs no
publication, and makes no push.

## Optional project capabilities

The eight profiles are independent and disabled by default:

| Capability | Owned output |
| --- | --- |
| `licensing` | `LICENSE` |
| `community-governance` | `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md` |
| `github-collaboration` | `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, `.github/pull_request_template.md` |
| `security-disclosure` | `SECURITY.md` |
| `repository-ownership` | `.github/CODEOWNERS` |
| `support-routing` | `.github/ISSUE_TEMPLATE/config.yml` |
| `funding` | `.github/FUNDING.yml` |
| `release-management` | `CHANGELOG.md`, `cliff.toml`, `.github/workflows/release.yml` |

Licensing supports `AGPL-3.0-only` and `MIT`. Security policy is one of
`current-development`, `latest-release`, `latest-major-line`, or `custom`.
Custom policies provide explicit rows. An optional acknowledgement target is
bounded from 1 to 8760 hours.

`CODEOWNERS` starts with the default `*` rule. Support routing defaults to label
`Support` and description `Get help with this project.` The
`blank_issues_enabled` value is `false` when `github-collaboration` is enabled
and `true` otherwise.

Repository release management does not require a publishable package. The
separate package-release transaction owns `.prism/release.json` and accepts the
managed release workflow as a required, read-only dependency.

Funding accepts at most 15 records. The `github` and `custom` providers allow
four records each; every other provider allows one. Custom destinations must be
credential-free HTTPS URLs.

The identity preview lists required fields and publication targets without
mutation. Template manifests may advertise capabilities but never select them;
Blank performs no Template lookup.

Release management accepts one validated lowercase `owner/repository`
coordinate, performs no live GitHub lookup, and collects no initial version.
Package discovery requires at least one publishable root or declared-workspace npm
package. The current Core-only scaffold has no npm package and the PHP/web
scaffold is private-only, so release management stops before plan display for
those candidates.

Setup creates no repository, remote, tag, GitHub Release, push, or npm
publication during planning or application. These remain human-owned.

## Repository creation, hooks, and root seed

Git begins only after durable project application. The closed sequence is:

```text
PROJECT_DURABLE / REPOSITORY_BOOTSTRAP
REPOSITORY_CREATED / HOOK_ACTIVATION
HOOKS_ACTIVE / ROOT_SEED_PREPARATION
SEED_READY / ROOT_SEED_COMMIT
ignore: bootstrap prism project
```

`prism-tool setup repository create` creates the eligible repository.
`prism-tool setup hooks inspect` presents canonical hooks, and separately
approved `prism-tool setup hooks apply --approval=yes` activates them.
`prism-tool setup seed prepare` stages exactly the applied outputs and records
the root-seed attestation. Separate hook approval precedes the signed root seed.
The commit uses:

```bash
prism-tool commit create --type ignore --subject "bootstrap prism project"
```

A failed commit requires `/reload` and inspection. Prism never retries it.
Successful setup creates no remote. The human configures the hosted repository and remote, then owns the initial `develop` push: push `develop` before configuring rulesets.

## Recovery and approval boundaries

Pre-durable failures restore strict emptiness when ownership remains provable.
Post-durable failures retain one exact resume action. Operational state is
private beneath `.pi/prism-tool/` and is never staged into the root seed.

Registry access, consumer mutation, review-attempt authorization, standing web-access
consent, reviewed-code egress, hook activation, and complete project-plan
application are distinct approval boundaries. Local readiness, installation
checks, hooks, and CI do not create consent.

Ordinary commits use one standalone `prism-tool commit create` call. The
launcher owns attribution, commitlint, hooks, signing, and `HEAD` verification.
A failed, unsafe, ambiguous, or non-exclusive attempt blocks all tools until
`/reload`.

Branch completion uses one finalization acceptance for synchronization,
attestation, `/check`, all four axes, SHA revalidation, and automatic `/pr`
preparation. One complete initial review starts the review chain. After a
Blocking repair, fresh acceptance reviews only the repair delta. Advisory
findings do not block `/pr`. Advisory findings do not block publication or need
a waiver. Base or history changes, discontinuity, incomplete axes, malformed
state, or a `HEAD` mismatch require a new complete initial review. Managed health
runs after review and before PR readiness without discarding completed evidence
or authorizing another review attempt. A health-only failure does not invalidate
unchanged reviewed identities; repairs that change those identities follow the
existing review-chain rules. Any additional review requires fresh finalization acceptance.

A standalone `/pr` invocation may authorize one complete initial review only
when deterministic preflight classifies the review chain as absent. Invalid
review chain evidence continues to fail closed. A failed or second review
requires fresh explicit approval. `/pr` remains preparation-only.

`/pr` is preparation-only. Humans push branches, create pull requests, and
merge.

## Managed lockstep npm releases

For applicable consumer projects, `/setup` discovers publishable packages and
displays the exact package list. Source checkouts preserve their release files
without consumer reconciliation.
It installs Core-owned release configuration only after explicit enablement and displayed-diff mutation approval. The package-release lock records its owner
PID; a human confirms that the process has stopped before removing the exact
lock path.

`/release` versions configured packages in lockstep. Release CI creates the
GitHub Release and package tags. npm publication remains one human-run command
per configured package.

## License

Prism Core is licensed under AGPL-3.0-only. See [NOTICE](NOTICE) for attribution
and retained upstream licenses.
