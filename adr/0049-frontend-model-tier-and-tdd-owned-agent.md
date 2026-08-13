# 0049. FRONTEND Model Tier and TDD-Owned Frontend Agent

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-08-03

## Status

Accepted

Partially supersedes ADR-0043's exact schema-v5 and five-tier clauses. It does
not rewrite ADR-0043's accepted record. ADR-0040's fixed footer sourcing remains
in force.

## Context

Frontend implementation currently shares the high-frequency PRIMARY tier even
though visual design, responsive behavior, progressive enhancement, and
accessibility benefit from independent model selection. Skills are globally
loadable, so frontend standards are advisory rather than routed through one
specialist. A direct specialist would bypass Prism's mandatory TDD pipeline,
while denying those skills to @tdd would leave behavior selection uninformed.

The project Prism manifest validates five required tiers at setup_version 5.
Adding a required tier changes that validity contract. GPT-5.6 Sol also consumes
a rolling weekly window, so using it for implementation needs explicit fallback
guidance and attribution consequences.

## Decision

We add a sixth FRONTEND tier with defaults openai/gpt-5.6-sol and xhigh. The
hidden @frontend subagent is its sole consumer and uses literal temperature 0.3.

Frontend work follows build → @tdd → @frontend. subagent_depth is 3. @tdd has an
exact task allowlist for frontend; @frontend cannot dispatch. Before Red, @tdd
requests a standards checklist and permitted paths. @tdd writes and verifies the
failing test, then sends the behavior, failure output, and paths to @frontend.
@tdd retains Green, coverage, staging, commit-message, and commit ownership.

OpenCode permission.skill allows skills generally, then denies frontend-design,
frontend-architecture, scss-mobile-first, and accessibility. @frontend re-allows
exactly those names. aurora-page and pest-browser remain general. Validation
enforces membership and last-match-wins ordering.

The Prism manifest advances to setup_version 6. An idempotent in-place v5→v6
migration patches project setup_version and absent FRONTEND defaults while user
manifests patch only setup_version. Existing custom values, comments, unrelated
fields, file modes, atomicity, and fail-closed safety are preserved.

@frontend edits only handoff-approved presentation PHP/HTML, cdn/sass, and cdn/js
sources. It cannot edit tests, backend logic, harness configuration, Aurora,
dependencies, or generated assets. /build-assets remains generated-asset owner.

Implemented-by: remains PRIMARY-sourced under ADR-0040 even when FRONTEND
performs direct edits. This fixed-source attribution limitation is accepted for
consistency. Operators monitor the OpenAI weekly window and override the
FRONTEND manifest values or select another model manually when capacity is low;
automatic fallback is not added.

## Consequences

- Frontend model choice becomes independently configurable.
- Mandatory TDD remains the only implementation path.
- Nested issue execution needs one additional subagent depth, contained by exact
  task permissions and terminal frontend permissions.
- Existing v5 manifests require an explicit preservation-safe migration.
- Non-frontend agents cannot load the four frontend standards directly.
- Sol use expands to implementation and may consume weekly quota faster.
- OpenCode must be restarted after configuration changes.

## Alternatives Considered

- A primary frontend tab was rejected because it encourages direct
  implementation outside @tdd.
- Direct build → @frontend dispatch was rejected because it bypasses Red.
- Keeping setup_version 5 with fallback semantics was rejected because a new
  required tier changes the validity contract.
- Gating aurora-page and pest-browser was rejected because page structure and
  browser-test orchestration belong to the wider stack and @tdd respectively.
- Dynamic Implemented-by sourcing was rejected to preserve ADR-0040's fixed
  attribution model.
- Automatic quota fallback was rejected as unnecessary complexity.
