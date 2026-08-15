# 0065. Self-Locating Script Resolution

Date: 2026-08-15

## Status

Accepted

Depends on ADR-0058 (core/adapter package split), ADR-0060 (global-core
install), ADR-0061 (toolchain contract, superseded where moot by ADR-0062).

## Context

ADR-0060 made the core globally installed (`pi install
npm:@kyaulabs/prism-core`), relocating the package from the source checkout
to `~/.pi/agent/npm/node_modules/@kyaulabs/prism-core/` (global) or
`.pi/npm/...` (project-local). The toolchain-contract ADRs (0061/0062/0063)
solved *tool* resolution through the `prism-tool` launcher, but the
instruction layer — AGENTS.md, skills, prompts, and git hooks — still
referenced harness scripts with checkout-relative paths
(`bash packages/prism-core/scripts/...`). In any consumer project those
invocations failed with "No such file or directory" (exit 127).

## Decision

Instruction-layer executable references resolve through the launcher:

1. `prism-tool resolve scripts|skills` prints the prism-core package's
   `scripts/` or `skills/` directory. It walks up from the working directory
   and prefers the first ancestor containing `packages/prism-core/<kind>`
   (the source checkout wins for dogfooding); otherwise it falls back to the
   running package's own `<kind>` directory (the launcher's canonicalized
   install path).
2. AGENTS.md, skills, and prompts invoke harness scripts only as
   `bash "$(prism-tool resolve scripts)/<tool>.sh"` (skill scripts via
   `resolve skills`). If `prism-tool` is unavailable in a prism checkout,
   the checkout copy at `packages/prism-core/` is the fallback.
3. Git hooks prefer the checkout copy (`$REPO_ROOT/packages/prism-core/...`)
   and fall back to the resolver; the pre-push validate-harness gate remains
   checkout-only (it validates the prism package tree).
4. `validate-harness.sh` flags any `bash packages/prism-core/(scripts|skills)/`
   reference in AGENTS.md files, skills, prompts, or hooks.
5. Historical and documentation references (ADRs, specs, plans, READMEs,
   writing-skills layout tables) are exempt — they describe the checkout
   layout or record decisions.

This corrects the stale install-path example in ADR-0060 (".../npm/
@kyaulabs/..." is missing the `node_modules/` segment); the record itself
is immutable and stands.

## Consequences

- **Positive:** every instruction-layer reference resolves in every install
  context; dogfooding keeps using the checkout copy via the CWD walk; the
  gate prevents regression; one mechanism serves scripts and tools.
- **Negative:** references require the `prism-tool` launcher (already the
  declared toolchain boundary; install-global.sh deploys it). Consumers
  need a package release that contains the resolver.
- **Follow-up:** publish a fresh `@kyaulabs/prism-core` npm release so
  installed consumers receive the launcher and resolver.
