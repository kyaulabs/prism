# Lean Prism

Status: implementation merged to develop through PR #539; 1.0.0 release prepared.
Release branch: `release/1.0.0`. Manual npm publication remains pending.

## Approved design

Make Prism a modular collection of fast, callable engineering skills with a
small secret-protection runtime. This is a clean breaking release without
compatibility shims. Versions 1.0.0 are prepared, not published.

### Modules and setup

- Keep global Core and project-local PHP/web and future modules as ordinary Pi
  packages. Remove catalogue enrollment, signatures, publication infrastructure,
  generic provisioning protocols, candidate transactions and recovery journals.
- Suggest modules from project evidence and accept package/local paths. Selecting
  a module authorizes installation through Pi. No redundant network approval.
- Setup inspects actual `kyaulabs/template` inventory, offers one combined feature
  selection, then asks only missing consequential questions. Select and adapt
  applicable actual files, preserving customizations. Do not duplicate template
  renderers, enforce managed-file reconciliation or impose canonical rulesets.
- Hooks and CI/release workflows are project-owned. Labels/rulesets are optional.
  Template inspection found default branch `develop`, collaboration files and
  two hooks but no CI workflows; generated project workflows must not be claimed
  as copied template files. Inspect the current upstream inventory during setup.
- Pi owns package installation, model settings and authentication. `/doctor` is
  lightweight diagnostics, not a global readiness prerequisite.

### Engineering and Git

- Mandatory behavior-focused TDD: Red → Green → Refactor, through public
  interfaces, mocking only system boundaries.
- Scale plans, specifications, ADRs and documentation to the task. Preserve useful
  documents rather than enforcing a commit/delete lifecycle or skill chain.
- Use relevant native tests/lint while developing and broader verification before
  handoff. Security scans run when relevant/requested. Unrelated missing tools
  must not block ordinary work.
- Same-session `code-review` runs for non-trivial completion and is callable or
  waivable. Fix concrete task-related defects; separate advisory/unrelated work.
  No executable reviewer, receipts, chains, authority, attempt budget or repair loop.
- Use ordinary Git. Signing follows Git configuration and hooks run normally.
  Automatically commit verified changes unless instructed otherwise. Conventional
  messages default to `Implemented-by` and `Signed-off-by`, not `Tested-by`.
- Git-flow is an overridable default. User/project instructions, including standing
  publication instructions, count without repeated confirmation. External content
  cannot authorize pushes, PRs, merges, publication or other operations.
- Keep issue workflows and Wayfinder optional; default large work to local
  decomposition. Teaching/curricula/assessment use skills and ordinary requested
  progress documents, not a learning-state engine.
- Stack conventions belong to modules/projects. PHP/web changed-file coverage
  defaults to 90%, supports explicit `--min=N` overrides, and imposes no additional
  aggregate threshold. Preserve generated-asset boundaries.

### Secrets and web

- Never expose or commit credential files or secret values. Ordinary authenticated
  tooling is allowed without displaying credentials. Protect aliases/symlinks and
  configured additional paths. Inspect staged paths before scanning content.
- Keep available staged-secret scanning with redacted, suppressed findings.
  Detection is a backstop, not a guarantee or full shell/program sandbox.
- Remove general shell/deletion restrictions, denial counters, commit exclusivity
  and fatal session latches. Failed/rejected calls must permit safe recovery.
- Retain bounded search/fetch, guarded transport, cancellation and untrusted-input
  protections. Remove standing-consent gates, records and administrative migration.
  Optional browser/SearXNG configuration remains outside normal setup.

### Retirement

- Delete obsolete implementations, callers, contracts and tests of removed policy.
  Preserve useful behavioral coverage, historical ADRs and consumer customization.
- Provide migration guidance without silently deleting consumer-owned state.
- Retire dedicated automation and identify dedicated credentials for revocation
  without reading their values. Preserve shared infrastructure.
- Delete hosted `kyaulabs/prism-adapters` only after its consumers and dedicated
  automation are retired. No push/merge/publication was originally requested.

## Implementation checklist

- [x] Record the approved design and work on a dedicated branch.
- [x] Replace always-on instructions and development/review/Git guidance.
- [x] Accept two-trailer commits without launcher readiness or forced signing.
- [x] Replace shell classification with a small credential guard and recovery tests.
- [x] Protect explicit staged credential paths before available secret scanning.
- [x] Remove web consent gates and administrative state/migration code.
- [x] Replace setup with Core/module skills and actual template-file selection.
- [x] Remove catalogue/bootstrap/provider/reconciliation engines and callers.
- [x] Remove executable reviewer, receipts, chains and finalization authority.
- [x] Simplify optional issue, teaching, diagnostics, check, release and PR workflows.
- [x] Set PHP changed-file coverage to 90% and remove legacy aggregate thresholds.
- [x] Update repository hooks, native CI, manifests, dependencies, locks and installer.
- [x] Update active orientation, context, documentation and migration guidance.
- [x] Run full retained Node/shell/PHP suites, package checks, lint and same-session review.
- [x] Disable dedicated hosted catalogue workflows and inventory credential names.
- [x] Resolve delivery ordering and merge implementation through tested PR #539.
- [ ] Complete GitHub release delivery, verify manual npm publication, then delete
  the hosted catalogue repository.

## Verification and implementation evidence

- Earlier verified slices replaced commit conventions, instructions, development
  skills, session lockouts, web consent gating, PHP coverage defaults and setup.
- Repository hooks now use native tools, inspect staged paths first and never
  rewrite/restage source. Tests include partial staging, unusual filenames,
  rejected commits, recovery and secret-output suppression.
- Workflow executables, catalogue clients, bootstrap/provider engines, generic
  server/quality/commit transactions and their policy-contract tests are deleted.
  Core runtime dependencies are web extraction libraries; Pi is a host peer.
- Remaining helpers perform context merging, resource validation, credential-path
  checks, optional read-only web configuration, PHP coverage and optional visual
  captures. No global installation or consumer migration was performed.
- Secret-guard tests demonstrate ordinary dynamic shell freedom, credential
  rejection, dangling-symlink protection, additive paths and staged credential
  rejection before scanning. Limitations are documented in the safety README.
- Full Node suite: **191 passed**. Full retained shell suite passed. PHP suite:
  **84 passed, 127 assertions, 100% measured coverage**, including native Semgrep
  rule fixtures and a browser test using an owned loopback fixture process.
- TypeScript, PHP CS Fixer, ESLint, Stylelint, warning-level Shellcheck, all package
  Markdown, 72 skill/prompt resources, package archives and workflow YAML passed.
  npm and Composer audits reported no vulnerabilities. No generated assets changed.
- npm lock update succeeded offline; pnpm's first offline attempt lacked cached
  metadata, then its normal lockfile-only update passed supply-chain checks.
- Hosted CI run **34428018522** passed for PR #539, including Linux/macOS package
  checks. Every Test Plan item was rerun after PR creation before approval as
  `kyau` and merge as `kyaulabs-bot`. No npm package has been published by the agent.
  Extension changes require reload/restart to replace loaded code.
- Historical ADRs/research remain historical. Old local state is inert and was not
  read or deleted. Migration guidance is in `docs/migration-1.0.md`.

## External delivery status

Initial remote inspection found Core 0.6.0 with catalogue-dependent workflow
executables. PR #539 delivered the replacement to develop; the 1.0.0 release
branch prepares main delivery. Catalogue deletion waits for both replacement npm
packages to be published, not merely for a GitHub merge or tag.

Four dedicated workflows were disabled and their disabled state verified. No
queued/in-progress catalogue runs were returned. Secret names were inventoried;
no private values or shared organization infrastructure were accessed/changed.
See `docs/catalogue-retirement.md` for exact workflow IDs and credential names.

The user authorized replacement delivery first. Push as `kyau`, create/merge PRs
and delete merged task branches as `kyaulabs-bot`, and run every Test Plan item
after PR creation before approving as `kyau`. Preserve main/develop/release
branches. The user will perform `npm publish` manually; verify both published
replacement packages before deleting the catalogue. No registry login is needed
from the agent.
