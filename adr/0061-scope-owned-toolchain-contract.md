# 0061. Scope-Owned Deterministic Toolchain Contract

Date: 2026-08-13

## Status

Accepted

Depends on ADR-0025, ADR-0047, ADR-0048, ADR-0056, ADR-0058, and ADR-0060.
Partially supersedes ADR-0002's soft-prerequisite treatment of Semgrep; the
opencode-era record remains frozen.

## Context

ADR-0058 split Prism into a globally installed language-agnostic core and
project-local stack adapters. ADR-0060 established how Pi loads those packages,
but neither decision says where the executable tools invoked by package
resources come from. Current hooks, prompts, skills, and CI still assume the
Prism source checkout's root `node_modules`, `vendor`, or `PATH`. Some gates
skip missing tools, allowing an incomplete installation to appear healthy.

Installing every tool globally would violate the core/adapter boundary and
break stack-native resolution. Requiring consumers to assemble the toolchain
manually would preserve path assumptions and version drift. Authenticated or
platform-managed tools also cannot be installed or configured safely by the
harness without crossing credential and system-ownership boundaries.

The decision is cross-cutting: it affects package distribution, setup, health
checks, hooks, local and CI gates, security review, releases, consumer
manifests, external network use, and the global filesystem surface. It must
preserve ADR-0025's local/CI parity, ADR-0047/0048's credential deny floor,
ADR-0056's sole-extension constraint, and ADR-0058's package ownership split.

## Decision

We adopt a **scope-owned deterministic toolchain contract** with the following
rules.

### 1. Versioned package contracts

Each Prism package that invokes development tools ships a versioned,
machine-readable `toolchain.json`. The contract declares tool IDs, ownership,
exact direct versions, provisioning modes, authentication modes, and allowed
commands. It contains data, never credentials or arbitrary shell strings.

The contract is authoritative for tool identity, ownership, and direct-version
policy. Package manifests repeat the dependency declarations required by their
package managers; harness validation rejects drift between these sources.
Unknown schemas, duplicate IDs, ranges where exact versions are required, and
conflicting active contracts fail closed.

### 2. Ownership follows execution scope

The global core bundles its unauthenticated npm-native tools as exact runtime
dependencies: commitlint, its conventional configuration, and git-cliff.
`prism-tool` resolves them relative to the installed core package rather than
the consumer's working directory.

Semgrep and Open Code Review (`ocr`) are mandatory external core prerequisites.
Prism verifies their exact approved versions but never installs, upgrades,
downgrades, logs in to, or writes credentials for them. This partially
supersedes ADR-0002's soft Semgrep-prerequisite clause; its first-party rule-pack
decision remains historical context.

The PHP/web adapter owns php-cs-fixer, Pest, the Pest browser plugin, Sass,
uglify-js, ESLint and its base configuration, Stylelint and its SCSS
configuration, and Playwright. It provisions them as exact consumer-project
development dependencies so Composer autoloading, plugins, configuration
imports, and browser assets resolve in their native project context. The
initial PHP test baseline is Pest 5 on PHPUnit 13; Pest 4 compatibility is not
retained.

Changing a tool version is a routine contract and lockfile update when
ownership, provisioning mode, and trust boundaries do not change. Moving a
tool across scopes or changing an external prerequisite's mandatory status
requires a superseding ADR.

### 3. Stable launcher and adapter handoff

The core exposes a real Node.js executable named `prism-tool` with a narrow
allowlisted interface for health checks, setup operations, and declared tool
execution. It owns contract validation, package-root discovery, executable
resolution, version parsing, argument-array subprocess invocation, bounded
sanitized output, structured status, and stable exit codes. It never evaluates
shell text or acts as a general package manager.

Adapters register their contract and handler through package metadata and a
direct Pi project declaration. Discovery may inspect Pi's documented managed
npm root and paths explicitly declared by project settings. It must not parse
human-oriented `pi list` output, scan arbitrary directories, or hard-code PHP
tool names in core. Published npm packages and explicitly declared local
source packages are both supported. Ambiguous registrations, undeclared
handlers, and tool-ID collisions fail closed.

Prompts retain ownership of conversation, consent, and reporting. Hooks and
CI invoke the same launcher and contract rather than duplicating resolution
logic.

### 4. Mandatory readiness and OCR cadence

Every Prism toolchain entry point verifies the exact Semgrep and OCR executable
versions before its main operation. A missing executable or mismatch is a hard
failure, never `SKIPPED`.

A live `ocr llm test` is required during global/core setup, `/setup`, `/doctor`,
and immediately before `code-review`. Other entry points perform only the
local OCR executable/version check; they do not contact the provider. A live
test requires separate network approval, and a failed or declined test makes
that operation NO-GO. An actual OCR review requires another explicit approval
because reviewed code leaves the machine. A connectivity-test approval never
implies code-egress approval.

Semgrep login remains optional for local scans. Missing cloud authentication
may disable cloud-only features but does not weaken the mandatory local
executable/version gate.

### 5. Consent-gated transactional adapter setup

Registry resolution and advisory queries require explicit network approval.
The adapter resolves candidate Composer and npm graphs with lifecycle scripts
disabled under the project-owned `.pi/prism-tool/work/` area, audits the
candidate lockfiles, and presents the exact proposed manifest and lockfile
changes. Any advisory at any severity, malformed audit output, dependency
conflict, or unsupported runtime fails before consumer manifests change.

Only literal `yes` authorizes replacement of consumer manifests and lockfiles.
Every other response declines. Approved files are replaced atomically, then
installed deterministically from their locks with lifecycle scripts disabled.
The matching Playwright Chromium download is a separately disclosed network
operation; no other browser is installed.

The candidate workspace is an ephemeral operational surface, not a consumer
manifest mutation. Prism owns only `.pi/prism-tool/work/`, adds that exact path
to the safe-cleanup contract, removes it after success, decline, or handled
failure, and validates an ownership marker before recursive cleanup. An
interrupted run may leave the workspace; the next run detects and safely
recovers or fails closed. Prism never treats other `.pi` content as disposable.

A pre-apply failure leaves consumer files byte-identical. If dependency
population or browser download fails after valid audited locks are applied,
the desired manifests and locks remain and Prism reports a deterministic retry
instead of attempting to roll back partially populated dependency directories.

### 6. Locks, audits, and parity

Exact direct versions are declared without ranges. Transitive versions are
captured by the lockfile belonging to the installation scope:

- the Prism source checkout's root npm and Composer lockfiles cover its local
  development graph and repeat the core/adapter direct pins needed here;
- Pi's managed global npm lock records the installed core graph; and
- each consumer's Composer and npm locks record its adapter graph.

The source checkout does not introduce independent nested package locks for
the same graph. Validation proves contract/package/root-manifest parity. Pi
core installation and adapter setup run post-resolution audits; adapter
candidate graphs are additionally audited before application. A known
advisory or unparseable audit result prevents GO status. Local hooks, `/check`,
and CI use the same contract versions and launcher semantics.

Automated npm and Composer dependency installation disables lifecycle scripts.
Any future tool that requires an install script needs a separate reviewed
exception; Playwright's approved browser command is explicit and is not a
package lifecycle script.

### 7. Narrow global launcher ownership

ADR-0060's global installer additionally deploys a managed launcher at
`~/.local/bin/prism-tool` by default, with an explicit alternate bin directory
allowed. It does not edit shell startup files or silently change `PATH`.

The launcher carries an ownership marker and resolves the currently installed
core package. Installation is idempotent. An unrelated existing path is never
overwritten; replacement and removal are allowed only when the ownership
marker validates. Tests redirect the home/bin roots into disposable fixtures
and never modify the operator's real home directory.

### 8. Credential and extension boundaries remain unchanged

Prism never reads OCR, Semgrep, Pi, SSH, cloud, or other credential files and
never includes secrets in arguments, logs, fixtures, contracts, or status
output. Humans configure external tools through those tools' own interfaces.
Subprocess output from readiness checks is captured, bounded, and reduced to
sanitized evidence.

No additional Pi extension, MCP server, orchestration layer, or background
agent is introduced. The existing safety extension remains the sole extension
under ADR-0056.

## Consequences

- **Positive:** core commands work from arbitrary trusted projects without a
  checkout-local `node_modules`; stack tools resolve where their ecosystems
  expect them; local, hook, prompt, and CI behavior share one contract.
- **Positive:** exact direct pins, lockfiles, pre-apply candidate audits, and
  fail-closed version checks make readiness measurable rather than assumed.
- **Positive:** registry access, project mutation, OCR connectivity, and OCR
  code egress are distinct consent boundaries.
- **Positive:** the adapter remains replaceable because core consumes a generic
  registration and contract rather than PHP-specific commands.
- **Negative:** mandatory Semgrep and OCR deliberately couple every Prism
  entry point to externally managed executable availability.
- **Negative:** the same direct pins appear in contracts and package/root
  manifests, requiring mechanical parity validation.
- **Negative:** setup must coordinate two package managers, audits, atomic
  replacement, interrupted-work recovery, and a browser download.
- **Negative:** `install-global.sh` gains another narrowly owned global file
  outside Pi's native package resources.
- **Neutral:** exact-version upgrades do not require a new ADR unless they
  alter scope, provisioning, or trust boundaries.

## Alternatives Considered

- **Verification only; install nothing.** Rejected because it preserves manual
  setup, late failures, and checkout-local assumptions for core-native tools.
- **Install every tool into Pi's private package roots.** Rejected because
  Composer autoloading, Pest plugins, ESLint/Stylelint imports, and consumer
  lockfile parity require project-local ecosystem resolution.
- **Install every tool into the consumer project.** Rejected because core
  commands should follow the globally installed core and must not force
  language-independent dependencies into each project.
- **Bundle or configure Semgrep and OCR.** Rejected because global Python/npm
  mutation and provider credentials remain human/system responsibilities.
- **Resolve tools directly from the current working directory or `PATH`.**
  Rejected because it is nondeterministic and recreates the source-checkout
  assumption this decision removes.
- **Mutate consumer manifests before resolving and auditing.** Rejected because
  dependency conflicts or advisories would leave partially modified projects.
- **Run `ocr llm test` before every Prism command.** Rejected because it would
  add unnecessary network traffic and provider cost to operations that do not
  use OCR. Setup/doctor plus immediate pre-review testing validates the
  boundary at the points where the result matters.
