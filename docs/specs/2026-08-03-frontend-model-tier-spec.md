# Spec: FRONTEND Model Tier and TDD-Owned Frontend Agent

**Date:** 2026-08-03
**Status:** Approved

## Problem Statement

Prism currently routes frontend implementation and visual work through the
PRIMARY model tier. That couples frontend quality and cost choices to the
general coding model, even though visual design, responsive behavior,
progressive enhancement, and accessibility benefit from a separately selected
model and a warmer temperature.

Frontend standards are also advisory rather than mechanically routed. Any
agent can currently load the frontend skills, while the mandatory TDD pipeline
has no specialist implementation stage. Adding a specialist without preserving
`@tdd` ownership would weaken Prism's Red → Green → Refactor invariant; gating
the skills without a handoff would prevent `@tdd` from selecting informed
frontend behaviors.

The Prism manifest currently validates schema v5 with five required model and
variant tiers. Making a sixth tier required changes the validity contract and
therefore needs an explicit, preservation-safe migration rather than a silent
reinterpretation of schema v5.

## Solution

Add a sixth, independently configurable FRONTEND model tier. Its shipped
defaults are `openai/gpt-5.6-sol` with variant `xhigh`. The sole consumer is a
hidden `@frontend` subagent with literal temperature `0.3`.

Frontend work remains TDD-owned. The implementation route is
`build → @tdd → @frontend`, including nested routes that begin at
`@from-issue`. `@tdd` consults `@frontend` before Red to obtain a standards
checklist and permitted-file list, selects the observable behavior, creates
and verifies the failing test, then delegates only the implementation and
frontend refactoring for that slice. `@tdd` verifies Green, coverage, and
commit readiness.

OpenCode-native skill permissions gate exactly `frontend-design`,
`frontend-architecture`, `scss-mobile-first`, and `accessibility`. All other
agents are denied those four skills, and `@frontend` explicitly re-enables
them. `aurora-page` and `pest-browser` remain generally available so page
structure and browser-test orchestration stay usable by the wider pipeline.

The Prism manifest advances to schema v6. An idempotent v5→v6 migration adds
the required FRONTEND defaults while preserving comments, unrelated fields,
file modes, and existing safety properties. Partial user manifests may omit
FRONTEND overrides and continue inheriting project defaults.

## User Stories

1. As a Prism operator, I want a FRONTEND model tier so that I can tune visual
   implementation independently from general coding.
2. As a Prism operator, I want a shipped Sol `xhigh` default so that frontend
   work starts with the same high-quality design reasoning as the DESIGN tier.
3. As a project user, I want `/setup` to round-trip frontend model and variant
   overrides so that personal choices remain in the user Prism manifest.
4. As a maintainer, I want schema-v5 manifests migrated explicitly so that a
   previously valid manifest never becomes invalid under the same version.
5. As a maintainer, I want migration to preserve comments and unrelated fields
   so that Prism retains its comment-preserving JSONC contract.
6. As a maintainer, I want partial user manifests to inherit project frontend
   defaults so that migration does not manufacture unnecessary personal pins.
7. As a developer, I want frontend behavior to remain coordinated by `@tdd`
   so that every behavior begins Red and is verified Green.
8. As `@tdd`, I want a pre-Red standards consultation so that accessibility,
   responsive, visual-language, and progressive-enhancement constraints shape
   the behavior under test.
9. As `@tdd`, I want to delegate only a failing frontend slice and permitted
   paths so that implementation ownership is narrow and explicit.
10. As `@frontend`, I want the four frontend skills and LSP access so that I
    can implement and refactor a slice using the canonical standards.
11. As a maintainer, I want `@frontend` unable to commit, push, install
    dependencies, access credentials, use the web, or dispatch more agents so
    that it remains a terminal implementation specialist.
12. As a maintainer, I want generated CSS and JavaScript excluded from
    `@frontend` edits so that canonical source and `/build-assets` ownership
    remain intact.
13. As a maintainer, I want exact skill-gate and dispatch permissions enforced
    by validation so that prompt drift cannot silently bypass the architecture.
14. As a user entering through `@from-issue`, I want nested frontend dispatch
    to work without bypassing the approved plan so that the issue on-ramp can
    execute the same TDD pipeline as build.
15. As a maintainer, I want documentation and the domain glossary to describe
    six tiers and the frontend implementation slice consistently.

## Implementation Decisions

- FRONTEND is a sixth model/variant tier with independently overridable values.
  Its defaults are `openai/gpt-5.6-sol` and `xhigh`.
- `@frontend` is a hidden subagent, not a primary TUI tab. Its model and
  variant assignment lives in OpenCode configuration; its agent definition
  carries a literal temperature of `0.3` and no model or variant frontmatter.
- `subagent_depth` becomes `3`. `@tdd` receives an exact task allowlist for
  `@frontend`, and `@frontend` has `task: deny`.
- The handoff has two phases. The consultation phase returns frontend
  constraints and permitted paths without editing. The implementation phase
  receives the selected behavior, failing-test output, and the same permitted
  paths. `@frontend` may then edit and run focused checks.
- `@tdd` remains responsible for behavior prioritization, tests, Red/Green
  verification, coverage, commit-message production, staging, and commits.
- `@frontend` may edit public presentation PHP/HTML and canonical frontend
  SCSS/JavaScript sources named by the handoff. It may not edit backend logic,
  tests, harness configuration, dependencies, Aurora, or generated assets.
- `@frontend` receives LSP and focused local lint/test permissions. It is
  denied dependency installation, generated-asset builds, web access,
  external-directory access, credential paths, git staging/commit/push/tag,
  and subagent dispatch.
- Skill gating uses OpenCode's native `permission.skill` surface. The global
  rule allows skills generally and then denies the four frontend skills;
  `@frontend` overrides those same names to allow. Last-match-wins ordering and
  exact membership are validated mechanically.
- `aurora-page` stays stack-specific and generally available.
  `pest-browser` stays available to `@tdd` and other test owners.
- The schema version advances from 5 to 6 because the new required tier is a
  breaking validation change. The migration supports v5→v6, rejects malformed
  or newer schemas, remains safe across skipped-version upgrade paths, and is
  byte-idempotent after the first successful write.
- Project manifests receive required FRONTEND defaults. User manifests advance
  to v6 while absent frontend keys continue to inherit the project values.
- Existing manifest guarantees remain: atomic writes, full JSONC comment
  preservation, unknown-field preservation, file-mode preservation, size and
  nesting limits, symlink refusal, and fail-closed diagnostics.
- Generated assets remain owned by the separate `/build-assets` workflow.
  `@frontend` edits source assets only.
- FRONTEND does not alter fixed commit-footer sourcing. `Implemented-by:`
  remains PRIMARY-sourced under ADR-0040 even when the frontend model performs
  direct edits; ADR-0049 records this deliberate attribution limitation.
- ADR-0049 records the tier split, schema-v6 migration, nested dispatch,
  skill-gating mechanism, Sol weekly-window exposure and fallback guidance,
  generated-asset ownership, and fixed footer sourcing. It partially
  supersedes ADR-0043's exact schema-v5/five-tier clauses without rewriting the
  accepted record.
- OpenCode configuration changes require the user to restart OpenCode before
  the new tier, agent, and permissions take effect.

## Testing Decisions

The first public seam is the resolved Prism manifest boundary. Tests invoke
the public manifest CLI and setup writers with isolated v5 project and user
fixtures, then observe the migrated JSONC and NUL-delimited environment pairs.
They prove schema advancement, required defaults, user inheritance,
comment/unknown-field/mode preservation, idempotency, error behavior, and the
two FRONTEND exports without testing private parser helpers.

The second seam is the harness configuration contract. Existing model-config
and harness-validation suites parse the OpenCode configuration and agent
frontmatter to prove six-tier wiring, the literal temperature, dispatch depth,
the exact `@tdd → @frontend` allowlist, terminal frontend permissions, LSP
membership, exact four-skill gating, catch-all ordering, documentation parity,
and the absence of model/variant fields in agent frontmatter.

The third seam is agent behavior. Isolated smoke evals verify that a
non-frontend agent cannot load each gated skill and that `@tdd` performs the
pre-Red consultation, creates Red itself, sends failing output and permitted
paths to `@frontend`, and retains Green/coverage ownership. These evals must
not access the network, credentials, or generated assets.

Unit tests cover manifest validation, migration projections, env-pair order,
model configuration, and documentation contracts. Shell tests cover the
actual migration and setup-writer boundaries, NUL transport, idempotency,
permissions validation, and isolated command behavior. Existing Prism
manifest, setup, harness-validation, and eval fixtures are the prior art.

## Out of Scope

- Promoting `@frontend` to a primary TUI tab.
- Letting build or `@from-issue` bypass `@tdd` for frontend implementation.
- Giving `@frontend` ownership of tests, coverage, commits, dependency
  installation, generated assets, or further delegation.
- Gating `aurora-page`, `pest-browser`, or any skill beyond the approved four.
- Changing PRIMARY, PLANNER, DESIGN, JUDGE, or UTILITY defaults.
- Changing commit-footer sources or introducing dynamic per-agent attribution.
- Automatically falling back when the OpenAI weekly window is exhausted;
  operators use manifest overrides or manual model selection.
- Hot-reloading OpenCode configuration.
- Adding a provider, dependency, frontend framework, asset watcher, or network
  call to automated tests.

## Further Notes

- Related issue: #285.
- Relevant accepted decisions include ADR-0012, ADR-0013, ADR-0022, ADR-0030,
  ADR-0040, ADR-0043, ADR-0047, and ADR-0048.
- OpenCode's vendored `skills.mdx` and `permissions.mdx` document native
  per-agent skill permissions and last-match-wins rule ordering.
- Architect review verdict: GO-WITH-CONDITIONS.
- ADR-required: 0049.
- ADR-0049 must be written and reviewed before implementation tasks following
  the architecture record proceed.
