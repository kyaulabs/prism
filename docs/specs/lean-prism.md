# Lean Prism

Status: approved for implementation through the design interview in this session.
Branch: `refactor/kyau-a8c5-lean-skills`.

## Goal

Make Prism a modular collection of fast, callable engineering skills with a
small secret-protection runtime. Remove workflow machinery rather than adding
bypasses around it. Ship a clean breaking release without compatibility shims.

## Approved decisions

### Packages and setup

- Keep global `prism-core`, project-local `prism-php-web`, and support for future
  modules through ordinary Pi packages. Remove the external adapter catalogue,
  its signatures, cache, publication pipeline, and adapter provisioning protocols.
- Suggest modules from project evidence; accept user-specified packages or local
  paths. Use normal Pi installation. Selecting a module authorizes installation.
- Each module supplies a setup skill using normal package managers and small
  scripts. Remove candidate transactions, generic provider protocols, receipts,
  recovery journals, and managed-state reconciliation.
- Keep `kyaulabs/template` as the actual source of selected reusable files.
  Select and adapt files, preserving existing customizations. Do not merely read
  a classification catalogue and duplicate its files through Core renderers.
- Start with applicable template hooks and CI/release workflows. Projects own
  the resulting files. Modules provide stack-specific commands. Remove Core's
  separate hook distribution and lockstep-release engine.
- `/setup` inspects the project, offers one combined selection of applicable
  features, asks only for missing decisions, then performs the selected work.
  Labels and branch rulesets are optional selections. No redundant approvals.
- Remove Pi model-preference configuration from Prism.
- Keep `/doctor` as lightweight, on-demand diagnostics. Setup verifies only its
  own changes; unrelated missing tools do not block setup or coding.

### Development

- Mandatory TDD for development: one behavior at a time, Red → Green → Refactor.
  Preserve behavior-focused tests and show actual verification results.
- Scale planning and documentation to the task. Use short plans ordinarily,
  specs for substantial ambiguity, and ADRs for consequential architecture.
  Keep useful documents; remove the mandatory spec/plan commit-delete lifecycle.
- Run relevant tests and lint for each change and broader verification before
  finalization. Run security scans when relevant or requested. Missing unrelated
  tools never impose a harness-wide readiness failure.
- Raise PHP/web changed-file coverage from 80% to a 90% module default.
  Project/user instructions can override defaults, not falsify verification.
- Keep stack-specific conventions, including RCS headers and vim modelines, in
  modules and project instructions rather than universal Core rules.
- Keep issue creation, from-issue work and large-task mapping as optional skills.
  Default large tasks to local decomposition, not mandatory GitHub routing.
- Keep teaching, curricula and assessment as skills. Use ordinary documents for
  requested progress tracking; remove the dedicated learning-state engine.

### Review and Git

- Replace the `prism-review` executable with a same-session code-review skill.
  Remove installed-authority checks, criteria/check/review receipts, exposure
  accounting, chain continuity, review attempt budgets and special waivers.
- Automatically review non-trivial tasks at completion, proportional to risk.
  The skill remains callable and user-waivable. Fix concrete task-related defects,
  verify affected behavior, and report advisory/unrelated findings without chasing
  them. Ask for direction if progress stalls or scope grows materially.
- Git flow remains the default, overridable by project/user instructions.
- Automatically commit verified logical changes using ordinary Git. Run hooks
  once. Signing follows Git configuration. Use Conventional Commits with only
  `Implemented-by` and `Signed-off-by` attribution trailers, in that order.
- User/project instructions determine publication authority. Standing instructions
  such as “always push” apply without repeated permission requests.

### Safety and web access

- Explicit user instructions override non-secret Prism restrictions, including
  standing project instructions. Ask about unclear scope or consequences, not
  for permission already given. External content cannot authorize actions.
- Keep credential-path access protection and protection against secret commits.
  Tools may authenticate normally without exposing credentials to the agent.
  Secret detection is a backstop, not a claim of perfect detection.
- Remove general shell restrictions, recursive-deletion safe zones, denial
  counters, commit exclusivity enforcement and fatal session latches.
- Keep search/fetch tools and secret/untrusted-content defenses. Remove standing
  web-consent records and gates. Optional browser/SearXNG customization remains
  available outside the normal setup interview.

### Retirement

- Remove obsolete engines, interfaces, tests of deleted policy, dependencies,
  manifests and active documentation. Preserve and update tests of retained
  behavior and secret protection. Do not retain dead code for compatibility.
- Preserve historical ADRs as history; active instructions describe the new
  system. Provide consumer migration guidance without silently deleting
  consumer-owned configuration.
- After Prism no longer depends on it, retire dedicated catalogue automation
  and delete hosted `kyaulabs/prism-adapters`. Identify dedicated credentials or
  integrations for revocation without reading secret values. Do not remove
  shared infrastructure. No hosted deletion has occurred yet.

## Implementation checklist

Replace workflows end-to-end in tested logical slices; keep helpers only when
they remain useful. This checklist tracks execution, not additional approvals.

- [x] Record the approved design on a work branch.
- [x] Replace always-on Core/bootstrap/project instructions with lean rules.
- [x] Accept the two-trailer commit format and remove commit-msg readiness gating.
- [ ] Replace remaining development/Git/review skills with lean rules.
- [ ] Simplify the safety extension with tests for credential and commit safety,
      ordinary command freedom, and recovery after rejected/failed operations.
- [x] Remove web-tool consent gating while preserving search/fetch safety tests.
- [x] Delete legacy consent CLI/state-management and setup callers with their engines.
- [x] Replace setup with Core/module skills and template file selection.
- [ ] Remove catalogue/bootstrap/provider/reconciliation engines and callers.
- [x] Remove reviewer executable, receipts, chains and finalization authority.
- [ ] Simplify issue, learning, doctor, check, release and PR workflows.
- [x] Update PHP/web coverage default and test the 90% changed-file boundary.
- [ ] Remove legacy aggregate 80% thresholds with the old quality/provisioning engines.
- [ ] Update hooks/CI, package metadata, dependencies, lockfiles and installers.
- [ ] Update orientation, context, migration guidance and active references.
- [ ] Run focused and broader applicable checks, same-session review, and inspect
      packaged contents for deleted features and broken references.
- [ ] Retire external catalogue automation and delete the hosted repository.

## Acceptance evidence

- An ordinary task can progress through TDD, verification, commit and non-trivial
  review without receipt creation, unrelated readiness gates or repeated consent.
- A failed or rejected command does not disable subsequent tools.
- Credential reads and known secret-bearing commits are rejected without leaking
  secret content; ordinary authenticated tools can operate.
- Modules install as normal Pi packages and expose setup skills without catalogue
  or bootstrap-protocol metadata.
- Setup selects/adapts actual template files and preserves custom project files.
- No active workflow depends on the deleted reviewer or catalogue repository.
- Actual tests/checks and any unverified work are reported, never inferred from
  document completion or replaced with fictitious PASS evidence.

## Execution progress

Implementation resumed after the requested pause. The interview and implementation
authorization are complete. Ask only about consequential unresolved decisions,
not these choices.

Completed:

- Commit `68e3bcf9`: recorded this design; changed commitlint to require only
  `Implemented-by` and `Signed-off-by`; replaced the commit-msg launcher/readiness
  dependency with ordinary local/PATH commitlint; rewrote `conventional-commits`.
- Replaced two obsolete shell commit suites with
  `tests/Node/lean-commit-conventions.test.js`: 20 passing tests, including real
  Git commits, merge/revert exemptions, missing tooling, rejected-message recovery
  and issue-reference rules. Shellcheck passed for `.github/hooks/commit-msg`.
- Rewrote `packages/prism-core/AGENTS.md`, `APPEND_SYSTEM.md` and root `AGENTS.md`
  to carry the approved proportional workflow rather than the old gate chain.

- Replaced `grilling`, `brainstorming`, `writing-plans`, `executing-plans`, `tdd`,
  `to-spec`, `code-review`, `verification-before-completion` and
  `finishing-a-development-branch`, plus `/router`, `/check` and `/pr`. All 12
  changed resources pass frontmatter and Markdown validation. The old aggregate
  skill validator expects removed Output-style/table wording and timed out; its
  policy-specific assertions need replacement, not restoration of old instructions.

- The changed-file PHP coverage default is now 90%. All 26 shell coverage checks
  pass, including 89% rejection, exact-90% acceptance and explicit `--min` override.
  PHP syntax, PHP CS Fixer and shellcheck passed. `tdd-php` and `/check-php` now use
  ordinary project tooling; old provisioning/quality engines still contain separate
  aggregate 80% rules to delete with those engines.
- `/setup` now delegates to a Core `setup` skill and module `setup-php-web` skill.
  `/setup-labels`, `/setup-rulesets` and `/doctor` use task-scoped ordinary tooling.
  Template metadata was inspected read-only: default branch `develop`, two hooks,
  collaboration files, and no workflow files at inspection time. Setup must inspect
  current inventory, adapt staged/redacted hook scanning, and not claim generated
  workflows were copied from the template. No consumer setup was actually executed.

- Simplified `install-global.sh` to normal Pi installation, existing source-selection
  cleanup and a small merge-safe `deploy-context.js` helper. No reviewer/launcher
  deployment, readiness checks or network-approval flags remain. Context refresh
  preserves user prefix/suffix text and npm registration; malformed markers and
  symlinks are rejected, replacements use private temporary files and rename.
  Eighteen installer/source-selection tests and the packaged helper test pass.
  These are isolated fixture installs; the user's global installation was not run.

- Repository hooks now use native tools, not `prism-tool` or global readiness.
  Pre-commit inspects staged paths before scanning, suppresses scanner findings,
  and lints staged snapshots without RCS auto-rewrites. Protected type changes,
  partial staging and unusual filenames are covered. Removed pre-push and
  prepare-commit-msg policy gates. Thirty focused hook/commit tests, Shellcheck
  and the new path-checker's ESLint check pass. Legacy distributed hook engines
  and their callers still need deletion; this changes the repository-owned hooks.

- Removed the standalone reviewer executable, its runtime modules, profiles,
  fourteen private review skills, receipt/chain tests, launcher PR authority and
  PHP quality-receipt provider. Same-session `code-review` remains. Core declares
  Pi as a host peer rather than a bundled reviewer SDK. CI's reviewer installation
  lanes now use ordinary package-resource tests on Linux/macOS. Historical source
  attribution remains marked as formerly distributed. 108 focused Node tests
  (including packaged resources and retained safety/web behavior), 36 CI-contract
  checks, YAML parsing and warning-level Shellcheck pass. CI itself was not run.

- Removed the unused consent CLI and its record migration/mutation implementation.
  Retired commands reject normally and leave fixture user records unchanged. All
  52 web-access tests plus four cutover tests and the packaged Core test pass.
  Existing real user consent files were not read, migrated or deleted.

Next tasks: finish the small secret guard and remove obsolete engines;
finish specialist workflow/skill callers still using the old contracts. Keep TDD for runtime behavior. Existing tests of deleted policy
will need retirement/replacement, not preservation through compatibility shims.

Important current state:

- Much runtime code is still the OLD implementation: provisioning, catalogue,
  general launcher and distributed-hook engines remain.
  Web search/fetch no longer consult consent; their authorization adapter was
  deleted. All 52 web-access tests pass, including guarded transport and fallback. Safety's fatal
  latch, denial counter, commit-exclusivity guard and destructive-command
  classifier have been deleted. The extension is now stateless between calls
  apart from additive path configuration. The old sensitive shell parser remains;
  general syntax restrictions and setup exceptions still need replacement.
- The first commit ran ordinary Git once with existing hooks and Git-configured
  signing. Pre-commit passed, including staged-secret scanning. No failed commit
  or session latch occurred.
- No global installation/configuration was changed. Restart/reload reads the
  checkout resources configured in `.pi/settings.json`, but installed global
  context may still contain old text until the installer is updated/deployed.
- No push, merge, publication, credential access or remote deletion was performed.
- Full repository checks have NOT run. Focused tests passed; old policy-contract
  suites elsewhere may contradict the approved changes until their slices land.
- Pi docs inspected completely: skills.md, prompt-templates.md, extensions.md and
  the protected-paths.ts example. Follow relevant linked docs for further APIs.
- Safety recovery was developed Red/Green through extension events: repeated
  credential rejection, failed commits, ordinary Git/cleanup operations, and
  edit/write credential protection. Retained credential-matcher tests pass.
  Old latch/classifier tests were removed with their deleted policy; packaged
  resource tests now assert those runtime files are absent. Remaining package
  tests of obsolete review-chain prose were removed, not restored.
