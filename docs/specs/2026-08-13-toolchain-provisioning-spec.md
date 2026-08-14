# Spec: Scope-Owned Toolchain Provisioning

**Date:** 2026-08-13
**Status:** Approved

## Problem Statement

Prism's OpenCode-era development model assumed the harness ran from the Prism
repository, where one root `composer.json`, `package.json`, and their lockfiles
made every quality tool available. The Pi distribution no longer has that
shape: `@kyaulabs/prism-core` is installed globally and
`@kyaulabs/prism-php-web` is installed project-locally in an arbitrary trusted
consumer project.

The current package manifests do not provision the tools their resources
invoke. Prompts and hooks still assume binaries such as `vendor/bin/pest`,
`npx stylelint`, local commitlint, `git cliff`, Semgrep, and OCR happen to be
available from the current working directory or `PATH`. Missing tools are
sometimes skipped, so an incomplete environment can appear healthy until a
late pipeline gate fails.

Prism needs a deterministic toolchain contract that follows the core/adapter
boundary from ADR-0058, works outside the Prism source checkout, requires
explicit consent before network access or consumer-project mutation, and
fails closed when mandatory tools are unavailable.

## Solution

Adopt a hybrid, scope-owned provisioning model:

1. `prism-core` bundles its npm-native, unauthenticated command-line tools as
   exact runtime dependencies: commitlint, the conventional commitlint config,
   and git-cliff.
2. Semgrep and Open Code Review (`ocr`) remain externally installed mandatory
   core prerequisites. Prism verifies Semgrep's exact version and OCR's bounded
   compatible range, but never installs either tool autonomously.
3. `prism-php-web` provisions its Composer and npm development tools into the
   consumer project's manifests and lockfiles only after a preview and literal
   `yes` approval.
4. A real Node.js CLI named `prism-tool` provides stable machine operations;
   Pi prompt templates retain conversation, consent, and reporting ownership.
5. Machine-readable package toolchain manifests are the canonical source for
   ownership, exact managed versions, bounded external version requirements,
   commands, and provisioning behavior.
6. Candidate dependency graphs are resolved and audited under the consumer's
   project-owned `.pi/prism-tool/work/` area before consumer files are changed.
   Any known advisory blocks the update.
7. Missing or mismatched Semgrep or OCR stops every Prism toolchain entry point.
   OCR must also pass `ocr llm test` during global/core setup, `/setup`,
   `/doctor`, and immediately before `code-review`; other entry points perform
   the local executable/version check only. Semgrep authentication remains
   optional because local Semgrep scans work without login.

## Goals

- Make Prism's tools available from arbitrary trusted consumer projects rather
  than only from the Prism repository.
- Preserve the global-core/project-local-adapter boundary.
- Pin every managed direct tool to an exact known-good version.
- Keep consumer Composer/npm dependency resolution project-local.
- Make missing mandatory tools fail closed instead of being silently skipped.
- Require explicit approval before external registry access, OCR connectivity
  testing, browser downloads, or project mutation.
- Keep credentials out of Prism files, command arguments, logs, and agent
  context.
- Keep local development, CI, hooks, prompts, and published packages on the
  same tool versions and resolution rules.

## Toolchain Contract

### Core bundled tools

These packages are exact entries in `packages/prism-core/package.json`
`dependencies` and are reachable through `prism-tool`:

| Capability | Package | Exact version | Invocation |
| --- | --- | --- | --- |
| Commit validation | `commitlint` | `21.2.2` | `prism-tool run commitlint ...` |
| Commitlint preset | `@commitlint/config-conventional` | `21.2.2` | resolved by the commitlint launcher |
| Changelog generation | `git-cliff` | `2.13.1` | `prism-tool run git-cliff ...` |

Pi installs npm-package runtime dependencies in its managed global npm root.
`prism-tool` hides that internal location from prompts, hooks, and users.
The local-source development path resolves the same exact tools from the Prism
checkout and fails with deterministic remediation when they have not been
installed.

### Core external tools

Prism never installs these tools autonomously:

| Capability | Tool/package | Version requirement | Readiness rule |
| --- | --- | --- | --- |
| Static analysis | `semgrep` / PyPI `semgrep` | `1.173.0` | executable and exact version required; login optional |
| External code review | `ocr` / npm `@alibaba-group/open-code-review` | `>=1.9.1 <2.0.0` | executable and compatible 1.x version required; successful `ocr llm test` required at the defined cadence |

A missing executable or version mismatch is a hard toolchain failure. It is
not `SKIPPED`, optional, delegated, or a capability-only warning.

Semgrep may run local scans without an account. `/doctor` reports cloud
features as unavailable when no login is configured, but local-only status
remains valid.

OCR is stricter. Before a live OCR readiness point, the human configures OCR
directly with `ocr config provider` and `ocr config model`; Prism never receives
the API key. After separate approval for the external connection, Prism runs
`ocr llm test` during global/core setup, `/setup`, `/doctor`, and immediately
before `code-review`. A declined test, failed connection, missing model, or
authentication failure stops that operation. Other entry points perform only
the mandatory local executable/version check and do not contact the provider.
OCR review still requires a separate explicit code-egress approval because it
transmits reviewed content.

### PHP/web adapter Composer tools

`prism-php-web` adds these exact `require-dev` constraints to the consumer
project:

| Capability | Package | Exact version |
| --- | --- | --- |
| PHP formatting | `friendsofphp/php-cs-fixer` | `3.95.18` |
| PHP testing | `pestphp/pest` | `5.1.1` |
| Browser testing | `pestphp/pest-plugin-browser` | `5.0.1` |

Pest 5 becomes the adapter baseline. It requires PHP `^8.4`, PHPUnit `^13.3`,
and Symfony Process `^8.1`; the adapter continues to require PHP 8.5+. The
browser plugin requires `ext-sockets` and Pest `^5.0.4`. Setup fails before
mutation when the consumer project cannot resolve this baseline.

### PHP/web adapter npm tools

`prism-php-web` adds these exact development dependencies to the consumer
project:

| Capability | Package | Exact version |
| --- | --- | --- |
| SCSS compilation | `sass` | `1.102.0` |
| JavaScript minification | `uglify-js` | `3.19.3` |
| JavaScript linting | `eslint` | `10.8.1` |
| ESLint base config | `@eslint/js` | `10.0.1` |
| SCSS linting | `stylelint` | `17.14.1` |
| SCSS lint config | `stylelint-config-standard-scss` | `17.0.0` |
| Browser automation | `playwright` | `1.62.1` |

The supporting ESLint and Stylelint configuration packages are part of the
contract because the tracked project configurations import them. The adapter
installs the Playwright Chromium build matching `playwright@1.62.1`; it does
not install every browser.

`@stylelint/language-server` is not part of this contract and is removed from
the Prism source checkout unless another approved feature independently owns
it.

## Components

### Package toolchain manifests

Each package ships a `toolchain.json` with a versioned schema:

- `packages/prism-core/toolchain.json`
- `packages/prism-php-web/toolchain.json`

The manifests record package identity, command identity, either an exact
version or a structured bounded external version requirement, provisioning
mode (`bundled`, `external`, or `consumer-dev`), authentication mode, and
adapter browser requirements. Exact `version` and bounded `versionRequirement`
forms are mutually exclusive. Bundled and consumer-development components must
use exact versions; OCR alone uses `versionRequirement` with minimum `1.9.1`
and exclusive maximum `2.0.0`. They contain no credentials, URLs with
embedded secrets, or arbitrary shell command strings.

The core package's bundled npm versions are necessarily repeated in
`package.json`; harness validation enforces exact parity. Documentation,
prompts, and tests refer to the manifest rather than maintaining independent
version tables where practical.

### `prism-tool` CLI

`prism-tool` is a Node.js executable, not a skill or prompt. Its source lives
at `packages/prism-core/scripts/prism-tool.js` and the core package exposes it
through `package.json` `bin` metadata. `install-global.sh` deploys an
idempotent launcher into the user's executable path without overwriting an
unrelated existing executable.

Its public interface remains small:

```text
prism-tool doctor
prism-tool setup
prism-tool run TOOL_ID [ARGUMENT ...]
```

The CLI owns package-root discovery, tool resolution, manifest validation,
version parsing, subprocess boundaries, structured status, and exit codes. OCR
version parsing selects the installed version only from an anchored
`open-code-review vX.Y.Z` product line, ignoring update advertisements and all
other untrusted output. It does not own user interviews, login, code-egress
approval, or arbitrary command execution. `run` accepts only tool IDs declared by the validated active
contract and passes arguments as an argument array without shell evaluation.

The active adapter supplies its own toolchain manifest and handler. The core
launcher discovers the installed project-local adapter through Pi's documented
package locations/settings and delegates without embedding PHP package names
or commands in core.

### Pi prompt templates

`/setup` owns interactive setup and all approval gates. `/doctor` owns
read-only health reporting. `/check`, `/security`, `/release`, `/pr`, and the
`code-review` skill call the stable CLI rather than assuming the Prism checkout
or Pi's internal npm layout.

Skills explain when to use the operations; they are not executable tool
providers and cannot be dependencies of Git hooks.

## Setup Data Flow

### Global core installation

1. The human runs `install-global.sh` from a clone or installed npm package.
2. The script runs Pi's global core package installation and deploys the
   managed global `AGENTS.md` and `APPEND_SYSTEM.md` blocks as today.
3. It exposes `prism-tool` through the managed launcher.
4. It verifies bundled core dependency resolution.
5. It verifies Semgrep's exact executable version and OCR's bounded compatible
   executable version.
6. It instructs the human to run OCR's interactive provider/model setup when
   needed; Prism never handles the key.
7. After explicit network approval, it runs `ocr llm test`.
8. Any failed mandatory check exits non-zero and reports the declared safe
   human-run remediation without relaying raw tool output. The core resources may be installed, but the Prism toolchain
   is not ready and no later setup stage proceeds.

### Adapter provisioning

1. `/setup` detects the installed project-local adapter and reads its validated
   toolchain contract.
2. It inspects the consumer manifests, lockfiles, runtime versions, extensions,
   and current dependency constraints locally.
3. It displays the registries and read-only operations needed for candidate
   resolution, then asks for explicit network approval.
4. After approval, the adapter handler copies only the relevant manifests and
   lockfiles into `.pi/prism-tool/work/`. The core safe-directory contract owns
   cleanup of this project-local workspace.
5. It resolves exact candidate Composer and npm graphs with lifecycle scripts
   disabled.
6. It audits the candidate lockfiles. Any advisory at any severity, malformed
   audit output, unsupported runtime, or dependency conflict fails closed and
   leaves the consumer project byte-identical.
7. It displays the exact manifest/lock changes, install commands, browser
   download, and resulting versions.
8. `/setup` asks for literal `yes`. Every other response declines mutation.
9. On `yes`, the audited manifests and lockfiles are replaced atomically.
10. Deterministic `composer install --no-scripts` and
    `npm ci --ignore-scripts` operations populate `vendor/` and
    `node_modules/` from those lockfiles.
11. The already-installed Playwright CLI downloads the matching Chromium build
    after the approved network operation.
12. The handler verifies every executable and exact version, re-runs both
    dependency audits, and reports the project diff and final GO/NO-GO status.

## Failure and Recovery Behavior

- Toolchain manifests that are malformed, unsupported, duplicated, or out of
  parity fail closed.
- Missing Semgrep/OCR, an exact Semgrep mismatch, or an OCR version outside
  `>=1.9.1 <2.0.0` stops `prism-tool`, `/setup`, `/doctor`,
  `/check`, `/security`, `/release`, `/pr`, and `code-review` before their main
  operation.
- OCR connectivity is a hard readiness requirement during global/core setup,
  `/setup`, `/doctor`, and immediately before `code-review`. `ocr llm test`
  receives separate network approval; declining or failing it is NO-GO for
  that operation. Other entry points perform no live OCR connection.
- Semgrep login is not required for local scanning. Authentication-dependent
  cloud features are reported separately without weakening the mandatory local
  executable/version gate.
- Candidate-resolution and audit failures occur before consumer mutation and
  leave the project untouched.
- If installation or the browser download fails after audited lockfiles are
  applied, the valid desired manifests and lockfiles remain. Prism reports the
  failing phase and exact deterministic retry command instead of attempting a
  risky rollback of partially populated dependency directories.
- A package manager's non-zero vulnerability exit is parsed as findings when
  valid structured output is present; malformed output is a tool failure.
- No missing required formatter, linter, test runner, security scanner, or
  review CLI is silently skipped.

## Security and Consent

There are separate approvals for separate trust boundaries:

1. Read-only registry resolution and advisory queries.
2. OCR's external LLM connectivity test.
3. Consumer manifest/lockfile mutation and dependency installation.
4. OCR code egress during an actual review.

Approval for one boundary never implies approval for another.

All package names, versions, tool IDs, and operation names are validated
against fixed schema/allowlists. External registry, advisory, package-manager,
and OCR output remains untrusted data and is never evaluated as code or shell
syntax. Subprocesses receive argument arrays. Timeouts and bounded output apply
to every network or package-manager boundary.

Prism never reads OCR, Semgrep, Pi, SSH, cloud, or other credential files.
Secrets are entered only into the tools' own human-run login/configuration
interfaces or supplied through the user's environment. Presence checks never
print values. `ocr llm test` output is reduced to sanitized PASS/FAIL evidence;
credentials and provider responses are not logged.

Managed direct package versions and Semgrep are exact; OCR is the sole bounded
external exception at `>=1.9.1 <2.0.0`. Generated lockfiles pin transitive
versions. Both candidate and post-install graphs must have zero known
advisories before the toolchain is GO.

## Testing Decisions

### Manifest and resolver seam

Unit tests validate each `toolchain.json` through the public loader. They cover
schema versions, exact-version grammar, mutually exclusive bounded-range
grammar, range boundaries, package/command allowlists, duplicate tool IDs,
provisioning modes, authentication modes, and package-manifest parity. Resolver tests use isolated fake global/project package layouts to
prove published-package and local-source discovery without relying on the
process working directory.

### CLI and mandatory-preflight seam

CLI tests invoke the public `prism-tool` process with fake executable paths and
subprocess adapters. They prove:

- bundled commitlint/git-cliff resolution;
- argument-array forwarding without shell evaluation;
- stable structured and human-readable status;
- non-zero exits for missing/mismatched Semgrep or OCR, including both OCR
  range boundaries;
- non-zero exits for declined/failed `ocr llm test` at live-readiness entry
  points, and no live call from executable/version-only entry points;
- Semgrep local readiness without login;
- no later command runs after a mandatory preflight failure; and
- OCR installed-version selection ignores advertised-update noise; and
- bounded, sanitized failures that never expose supplied canary secrets.

No test reads a real credential file or contacts a live provider.

### Consent and transaction seam

Shell/integration tests use temporary consumer repositories and fake package
manager/network boundaries. They prove:

- no registry call before network approval;
- no OCR test before its separate approval;
- no consumer mutation before literal `yes`;
- every non-literal response declines;
- candidate failures leave all relevant files byte-identical;
- advisories at every severity block application;
- audited files are atomically applied;
- post-apply failures retain lockfiles and print deterministic recovery; and
- Playwright installs only the matching Chromium target after approval.

### Adapter compatibility seam

Adapter tests resolve the Pest 5/PHPUnit 13 contract against PHP 8.5 fixtures,
check the `ext-sockets` prerequisite, validate exact npm dependencies, and run
the existing Pest/browser, formatter, Stylelint, ESLint, Sass, and uglify-js
feedback loops. Existing behavior tests must pass after the Pest major upgrade.

### Packaging and installer seam

Package smoke tests inspect packed core/adapter archives and run from isolated
consumer projects. They verify inclusion and executable bits for manifests,
handlers, and `prism-tool`; Pi global/project install path resolution; and an
idempotent launcher deployment that refuses to overwrite an unrelated command.

The full verification run includes harness validation, shell regression tests,
Node checks, Pest with changed-file coverage, Composer/npm audits, `/check`,
and multi-axis code review.

## Acceptance Criteria

- [ ] Core package dependencies pin commitlint `21.2.2`, its conventional
      config `21.2.2`, and git-cliff `2.13.1` exactly.
- [ ] Semgrep `1.173.0` and OCR `>=1.9.1 <2.0.0` are externally installed
      mandatory prerequisites and are never installed autonomously.
- [ ] Missing or mismatched Semgrep/OCR stops every Prism toolchain entry point;
      OCR accepts the lower bound and later 1.x releases while rejecting older
      or 2.x releases.
- [ ] OCR readiness during global/core setup, `/setup`, `/doctor`, and
      immediately before `code-review` requires a separately approved
      successful `ocr llm test`; failure or refusal is NO-GO for that
      operation, while other entry points perform no live OCR connection.
- [ ] Semgrep remains usable for mandatory local scans without login.
- [ ] The PHP/web adapter provisions the approved exact Composer/npm tools into
      the consumer project only after literal `yes`.
- [ ] Pest `5.1.1`, browser plugin `5.0.1`, and the resulting PHPUnit 13 stack
      pass the project suite on PHP 8.5.
- [ ] Candidate lockfiles are audited before mutation; any advisory blocks the
      update and leaves consumer files unchanged.
- [ ] Post-install Composer and npm audits report zero advisories.
- [ ] `prism-tool` works from arbitrary trusted consumer directories and hides
      Pi's package-storage layout.
- [ ] Candidate work is confined to `.pi/prism-tool/work/`, and the core
      safe-directory contract permits deterministic cleanup there.
- [ ] Hooks/prompts no longer require execution from the Prism source folder or
      assume root `node_modules`/`vendor` unless those are adapter-owned
      consumer paths.
- [ ] Required tools fail rather than report `SKIPPED`.
- [ ] No credential file is read and no token/key appears in output, commands,
      fixtures, or tracked files.
- [ ] Root source-checkout manifests/lockfiles and CI pins use the approved
      exact managed versions; CI provisions an OCR release inside its declared
      compatible range.
- [ ] Documentation distinguishes bundled core, external mandatory core, and
      consumer-project adapter tools.
- [ ] `CONTEXT.md` uses Pi terminology for this boundary and defines
      `toolchain contract`.
- [ ] A new ADR records the hard-to-reverse provisioning, consent, and external
      readiness decisions.

## Out of Scope

- Automatically installing, upgrading, downgrading, logging into, or writing
  credentials for Semgrep or OCR.
- Requiring Semgrep cloud login for local SAST.
- Sending project code through OCR without separate explicit approval.
- Bundling PHP/Pest/SCSS/frontend tools into the global core.
- Installing adapter tools into isolated Pi package directories instead of the
  consumer project.
- Supporting Pest 4/PHPUnit 12 alongside the new Pest 5 baseline.
- Installing Playwright browsers other than the adapter's Chromium target.
- Adding another Pi extension, orchestration layer, background agent, or MCP
  server.
- General-purpose package management beyond the declared Prism toolchain.
- Automatically fixing dependency advisories or accepting a vulnerable graph.
- Rewriting frozen OpenCode-era ADRs.

## Documentation and Architecture

This change introduces the domain term **toolchain contract**: the
machine-readable, scope-owned declaration of Prism's required tools, exact
managed versions or bounded external requirements, provisioning mode,
readiness checks, and commands.

`CONTEXT.md` must update its stale OpenCode-oriented Purpose and toolchain
boundary language sufficiently to describe the Pi core/adapter model and add
the new glossary term. The accepted OpenCode-era ADRs remain frozen.

The decision is cross-cutting and hard to reverse because it defines package
ownership, executable resolution, project mutation, external authentication,
and failure semantics. A new Pi-era ADR is required after architectural review
and before implementation planning.

## Alternatives Rejected

### Verification only

Prism could install no tools and merely print remediation commands. This is
simple but leaves setup fragmented, preserves late failures, and does not make
core-native tools arrive with the core package.

### Fully isolated Prism tool stores

Prism could install every tool under Pi's package storage. This keeps consumer
manifests clean but breaks or complicates Composer autoloading, Pest plugin
resolution, ESLint imports, Stylelint configs, and project-lockfile parity.

### Bundle authenticated external tools

Prism could bundle OCR and attempt to install Semgrep during core setup. This
couples the package to global npm/Python mutation and still cannot safely own
provider credentials. Declared external prerequisite checks keep installation
and authentication under human control.

### Retain Pest 4

Keeping Pest 4 avoids a major test-framework upgrade but contradicts the
approved current-version policy and leaves the adapter on PHPUnit 12. Prism's
PHP 8.5 baseline supports the approved Pest 5/PHPUnit 13 stack, so one current
baseline is preferred over dual compatibility.
