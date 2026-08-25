# @kyaulabs/prism-core

The **language-agnostic core** of the [prism](https://github.com/kyaulabs/prism)
coding harness for [pi](https://pi.dev).

prism re-expresses a disciplined engineering pipeline — **brainstorm → spec →
plan → TDD → verify → review** — as pi-native **skills**, **prompt templates**,
and **one safety extension**, run by a single pi agent. This package is the
language-neutral half; install it **globally** so it runs in every project.

## What it provides

- **Pipeline & discipline skills** — `brainstorming`, `grilling`, `to-spec`,
  `writing-plans`, `executing-plans`, `tdd`, `verification-before-completion`,
  `code-review`, `architect`, `wayfinder`, `finishing-a-development-branch`, …
- **Collapsed-agent skills** — `consult`, `from-issue`, `debug`, `explore`,
  `resolve-merge-conflicts`, `tracker-operator`, `docs-writer`, and the review
  trio (`code-review` / `spec-review` / `standards-review` / `test-audit`).
- **Prompt templates** (slash commands) — `/check`, `/issue`, `/pr`,
  `/release`, `/router`, `/security`, `/doctor`, `/prime`, `/teach`, …
- **The safety extension** — a `tool_call` gate that enforces a credential-path
  deny floor and an `rm -rf` safe-zone policy, with an independent denial
  circuit breaker and fatal failed-commit latch.
- **Research skills** — `websearch`, `searxng` (CLI-shell; no MCP).
- The always-on `AGENTS.md` + `APPEND_SYSTEM.md`, deployed to `~/.pi/agent/`
  by `install-global.sh` so the core is "always running".
- The managed `prism-tool` launcher, backed by the installed core package and
  verified against mandatory Semgrep and OCR readiness.
- **Strict-empty Core-only project transactions** — Blank and Template setup
  collect an editable project name, one-sentence summary, and only the closed
  metadata required by explicitly selected capabilities, then render a
  private candidate beneath `.pi/prism-tool/bootstrap/`, and return a
  digest-bound plan. Template acquisition reads a fixed public source only as
  immutable, untrusted catalogue evidence; it never supplies project bytes,
  policy, output paths, packages, defaults, or metadata. The
  transaction progresses from `PLAN_READY` / `PREPARED` through `APPLYING` to
  `PROJECT_DURABLE`. Pre-durable failure returns `ROOT_RESTORED` when owned
  state is safely removed or `RECOVERY_REQUIRED` when ambiguous state must be
  preserved. Durable recovery returns `REPOSITORY_BOOTSTRAP` for the next setup
  slice. Application does not initialize Git, invoke dependency or quality
  commands, activate hooks, access the network, or invoke a subprocess.
- **Provider-composed Blank and Template projects** — strict-empty setup can
  select the exact PHP/web adapter as well as Core-only. All durable project
  bytes come from trusted installed Core and adapter providers; Template data
  can only advertise locally recognized providers and disabled-by-default
  capabilities. Core remains stack-agnostic: it validates and composes generic
  provider reports, owns the outer durable
  transaction, and delegates stack outputs and effects to the validated
  project-local adapter. Failure before the durable marker restores strict
  emptiness when transaction ownership remains provable. Failure after the
  durable marker retains the complete scaffold and deterministic resume evidence.
  If interruption retains `apply.recovery.lock`, `setup project recover` reports
  its exact project-relative path; after confirming no setup process is running,
  remove only that path and rerun `setup project apply` with the retained attempt
  and digest. Source evidence is digest-bound through the private plan, recovery
  journal, durable project manifest, and root-seed attestation. Canonical hooks
  and the root-seed attestation also bind the adapter identity, activation file,
  and provider-report digest. Setup creates no remote and performs no publication
  or push; those operations remain human-owned.
- **Optional project capabilities** — Core owns eight independently selectable
  profiles. The eight profiles are independent and disabled by default:
  `licensing` emits `LICENSE`; `community-governance` emits
  `CODE_OF_CONDUCT.md` and `CONTRIBUTING.md`; `github-collaboration` emits
  `.github/ISSUE_TEMPLATE/bug_report.yml`,
  `.github/ISSUE_TEMPLATE/feature_request.yml`, and
  `.github/pull_request_template.md`; `security-disclosure` emits `SECURITY.md`;
  `repository-ownership` emits `.github/CODEOWNERS`; `support-routing` emits
  `.github/ISSUE_TEMPLATE/config.yml`; `funding` emits `.github/FUNDING.yml`;
  and `release-management` emits `CHANGELOG.md`, `cliff.toml`,
  `.github/workflows/release.yml`, and `.prism/release.json`. Licensing supports
  exactly `AGPL-3.0-only` and `MIT`.
  Conduct and security reporting contacts accept normalized email addresses or
  credential-free HTTPS destinations. Security version policy is exactly one of
  `current-development`, `latest-release`, `latest-major-line`, or `custom`; custom
  policy supplies explicit rows, and the optional acknowledgement target is 1–8760
  hours. `CODEOWNERS` always starts with the default `*` owners and may add normalized
  repository-rooted rules. Support routing uses a credential-free HTTPS destination,
  default label `Support`, and default description `Get help with this project.`;
  `blank_issues_enabled` is `false` with `github-collaboration` and `true` otherwise.
  Funding accepts at most 15 records from its closed provider vocabulary: `github`
  and `custom` permit four each, every other provider permits one, and custom entries
  require credential-free HTTPS destinations. GitHub collaboration requires no
  project metadata and emits neutral templates. Template manifests may advertise
  these capabilities but never select them; Blank performs no Template lookup. The
  identity preview reports required fields and publication targets without mutating
  the project. Release management requires one locally validated lowercase
  `owner/repository` coordinate, performs no live GitHub lookup, and collects no
  initial version. Its package configuration is rendered only after ADR-0079's
  existing discovery accepts at least one publishable root or declared-workspace npm
  package; package discovery never selects the capability. The current Core-only
  baseline has no npm package and the PHP/web scaffold is private-only, so those
  candidates reject selected release management before plan display and restore
  strict emptiness. A future or fixture adapter with publishable packages receives
  the canonical workflow and lockstep configuration through the same outer bootstrap
  transaction. Setup creates no repository, remote, tag, GitHub Release, push, or npm
  publication; those actions remain human-owned. Interactive prompt orchestration
  and preview confirmation remain deferred to task 12.
- **Post-durable Core-only repository seed** — Git begins only after durable
  project application. The closed sequence is
  `PROJECT_DURABLE / REPOSITORY_BOOTSTRAP` →
  `REPOSITORY_CREATED / HOOK_ACTIVATION` →
  `HOOKS_ACTIVE / ROOT_SEED_PREPARATION` →
  `SEED_READY / ROOT_SEED_COMMIT` →
  `ignore: bootstrap prism project`. The launcher exposes
  `prism-tool setup repository create`, `prism-tool setup hooks inspect`,
  separately approved `prism-tool setup hooks apply --approval=yes`, and
  `prism-tool setup seed prepare`; the final signed commit uses the exclusive
  `prism-tool commit create --type ignore --subject "bootstrap prism project"`
  operation. Only the active attempt's create-only repository is seed-eligible.
  Canonical Core hooks dispatch no adapter, and seed staging includes exactly
  the applied project outputs—not operational state or unrelated files. A
  failed commit requires `/reload` and inspection and is never retried
  automatically. Successful setup creates no remote: remote creation, the
  initial human `develop` push, and post-push ruleset configuration remain
  human-owned publication operations.
- **Managed lockstep npm releases** — `/setup` discovers publishable root and
  declared-workspace packages, displays the exact package list, and installs
  the Core-owned release configuration plus canonical workflow only after
  explicit enablement and displayed-diff mutation approval. Package-release
  setup remains independent of language adapters. The operation lock records
  its owner PID in `.pi/prism-tool/package-release.lock`; after a crash, a
  human must verify that PID is no longer running before removing that exact
  lock file. Prism does not auto-remove an existing lock.

## Install

Semgrep `>=1.173.0 <2.0.0` and OCR `>=1.9.1 <2.0.0` must already be installed.
Configure OCR directly with its own provider/model commands; Prism never reads
or writes its credentials.

From a Prism checkout, install the local core without registry access:

```bash
bash packages/prism-core/scripts/install-global.sh
```

To install the published npm package, approve registry access independently:

```bash
PRISM_CORE_SOURCE=npm:@kyaulabs/prism-core \
  bash packages/prism-core/scripts/install-global.sh \
  --network-approved=yes
```

The installer performs offline `doctor --local-only` readiness only. It never
creates an OCR-consent record or runs `ocr llm test`. After installation, run
`/setup` to inspect or grant global standing OCR consent and complete live
readiness.

The installer deploys `prism-tool` to `${PRISM_BIN_DIR:-$HOME/.local/bin}` and
does not edit shell startup files or `PATH`. It refuses to overwrite or remove
an unrelated executable. Remove only a Prism-owned launcher with:

```bash
bash packages/prism-core/scripts/install-global.sh --uninstall-launcher
```

A readiness failure leaves the installed package, launcher, and context
resources available for remediation but does not report toolchain GO. After a
successful install, run `pi` in any trusted project. Authenticate with `/login`
for your provider. Model and thinking selection is yours at any time —
**Ctrl+P** cycles models, **Shift+Tab** sets thinking; the harness prescribes
nothing (ADR-0067). Run `/setup` to write your own session defaults and manage
standing OCR consent.

## Adapter

For PHP/Aurora web projects, add the stack adapter per-project:

```bash
pi install -l npm:@kyaulabs/prism-php-web
```

## Toolchain readiness

The package declares its owned tools in `toolchain.json`: bundled core tools
(commitlint, git-cliff) resolve through `prism-tool`; Semgrep
`>=1.173.0 <2.0.0` and OCR `>=1.9.1 <2.0.0` are mandatory external
prerequisites that Prism verifies but never installs, configures, or
authenticates (ADR-0063). Registry access and consumer mutation remain separate
operation-specific approvals. `/setup` manages one explicit global standing
OCR consent covering only connectivity checks and reviewed-code egress through
the dedicated `prism-tool code-review ocr` operation (ADR-0074). Full
`/doctor` validates that consent before one live `ocr llm test`; local-only
readiness and installation remain offline. Revoke through `/setup` with
`prism-tool consent revoke-ocr`. CI provisions compatible Semgrep/OCR releases
only to construct its ephemeral verification environment and never creates a
consent record.

## Approval-free operational boundaries

Ordinary and release commits use one standalone
`prism-tool commit create` call. The launcher owns attribution, commitlint,
hooks, signing, and `HEAD` verification. A failed, unsafe, ambiguous, or
non-exclusive commit attempt aborts the agent and blocks every tool until the
human runs `/reload`; Prism never retries automatically.

After implementation and ADR-0027 artifact cleanup, the
`finishing-a-development-branch` skill pauses once for finalization acceptance.
One acceptance authorizes one synchronization, attestation, full `/check`,
four-axis review, SHA revalidation, and automatic `/pr` preparation attempt.
The first accepted review creates a bounded review chain with all four axes.
After a Blocking repair, fresh acceptance reviews only the continuous repair delta and records closure evidence. Advisory findings do not block `/pr` and
need no waiver. Base or history changes, discontinuity, malformed state, or a
HEAD mismatch invalidate the chain and require a new complete initial review.
Existing branches without chain state follow that initial-review path; Prism
never migrates session-only evidence. Chain state is untracked under
`.pi/prism-tool/code-review/`. `/pr` does not create issues or mutate GitHub.
Any failed gate stops before `/pr` and requires fresh finalization acceptance
after repair.

`/pr` remains preparation-only: humans push, create pull requests, and merge.

## License

AGPL-3.0-only. See [NOTICE](./NOTICE) for the full attribution chain
(obra/superpowers, mattpocock/skills, anthropics/skills, glebis/claude-skills,
@earendil-works/pi-coding-agent).
