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
- **Strict-empty Core-only project transactions** — Blank setup collects only
  an editable project name and one-sentence summary, renders a private candidate
  beneath `.pi/prism-tool/bootstrap/`, and returns a digest-bound plan. The
  transaction progresses from `PLAN_READY` / `PREPARED` through `APPLYING` to
  `PROJECT_DURABLE`. Pre-durable failure returns `ROOT_RESTORED` when owned
  state is safely removed or `RECOVERY_REQUIRED` when ambiguous state must be
  preserved. Durable recovery returns `REPOSITORY_BOOTSTRAP` for the next setup
  slice. Application does not initialize Git, invoke dependency or quality
  commands, activate hooks, access the network, or invoke a subprocess.
- **Provider-composed Blank projects** — strict-empty Blank setup can select
  the exact PHP/web adapter as well as Core-only. Core remains stack-agnostic:
  it validates and composes generic provider reports, owns the outer durable
  transaction, and delegates stack outputs and effects to the validated
  project-local adapter. Failure before the durable marker restores strict
  emptiness when transaction ownership remains provable. Failure after the
  durable marker retains the complete scaffold and deterministic resume evidence.
  Canonical hooks and the root-seed attestation bind the adapter identity,
  activation file, and provider-report digest. Setup creates no remote and
  performs no publication or push; those operations remain human-owned.
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
