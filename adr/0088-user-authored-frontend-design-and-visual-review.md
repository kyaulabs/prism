# 0088. User-authored frontend design and adapter-owned visual review

Date: 2026-08-25

## Status

Accepted

Extends ADR-0025, ADR-0058, ADR-0056, ADR-0063, ADR-0070, ADR-0073,
ADR-0082, ADR-0083, and ADR-0084.

## Context

The PHP/web adapter currently selects a visual movement, palette families,
color-mode behavior, concrete token values, shadow recipes, and motion recipes.
Those are project aesthetics, not stack constraints. They can conflict with a
user's brand, audience, content, references, or explicit preferences.

Prism still needs stable frontend quality policy. Accessibility, semantic HTML,
responsive reflow, progressive enhancement, security, performance guidance,
and reproducible verification are engineering constraints that should not
vanish when aesthetic defaults are removed.

The adapter already owns exact Playwright provisioning and Chromium acquisition
through the `toolchain contract`, plus functional Pest Browser smoke coverage.
It does not provide reusable consumer-repository tooling for iterative visual
inspection. Ad hoc screenshot commands would drift between sessions, while
folding screenshot mechanics into `frontend-design` or `pest-browser` would mix
user decisions, browser process mechanics, and functional regression tests.

Visual evidence also crosses trust boundaries. Screenshots can contain personal
data, secrets, authenticated state, private content, or copyrighted reference
material. A capture workflow must not turn local design iteration into implicit
network access, credential handling, or automatic repository publication.

The module boundary, scaffold ownership, configuration contract, and evidence
retention policy affect multiple skills, setup transactions, generated project
files, tests, and quality gates. Consumer projects will depend on them, making
the choice cross-cutting and expensive to reverse.

## Decision

We adopt a user-authored visual-design contract and an adapter-owned visual
review module.

### Aesthetic and quality ownership

Prism owns frontend quality constraints, not project aesthetics. No active
harness resource selects a default palette, theme type, color-mode policy,
design movement, typography, shadow recipe, motion style, token values, or
inspiration example.

The user supplies an approved **user-authored visual brief**. The brief records
purpose, audience, visual intent, inspiration and dislikes, palette and mode
behavior, typography, layout, spacing, density, shape, depth, texture, imagery,
iconography, motion, component states, target viewports, and adopted quality
targets.

Visual styling starts only after the user supplies at least one visual reference
or an equivalently detailed written brief. Missing visual direction blocks
styling or narrows the work to non-visual structure; Prism supplies no fallback
aesthetic.

WCAG 2.2 AA, semantic HTML, keyboard and focus behavior, non-color state cues,
responsive reflow, progressive enhancement, and active-adapter security remain
mandatory. Reduced-motion handling, 44 by 44 CSS-pixel primary touch targets,
and current Core Web Vitals are recommendations unless the project adopts them
as acceptance criteria. WCAG's 24 by 24 CSS-pixel Level AA target-size minimum
and its exceptions are described accurately.

### Module boundary

`frontend-design` remains the orchestration skill. It loads `grilling`, gathers
and confirms the visual brief, recommends quality standards, prevents fallback
aesthetics, and owns user confirmation at visual milestones.

A new adapter-owned `visual-review` module hides browser and evidence mechanics
behind three operations:

1. validate the project visual-review contract;
2. capture the selected evidence cases; and
3. report the evidence set and bounded failures.

The interface exposes project concepts—cases, states, viewports, and evidence—
not Playwright internals. `frontend-architecture`, `accessibility`, and
`tdd-php` consume this contract. `pest-browser` remains dedicated to critical
functional browser flows.

```text
Project owner
    -> frontend-design (brief and milestone decisions)
        -> visual-review (validate, capture, report)
            -> repository tooling
                -> adapter-declared Playwright -> Chromium

/check and CI
    -> validate tooling/configuration and functional smoke
    -X-> subjective visual approval
```

### Consumer-repository ownership

The PHP/web adapter scaffolds reusable visual-review tooling through its
existing provider and setup transactions. No stack-specific behavior moves to
Core.

Canonical adapter-owned files include the capture entry point, closed schema,
and reusable validation mechanics. Setup applies create/preserve/conflict
semantics:

- an absent canonical path may be created atomically;
- exact canonical bytes and mode are preserved without rewrite;
- differing bytes, mode, symlink, non-regular path, or ownership ambiguity are
  preserved and fail closed; and
- setup never overwrites customized or human-owned content.

The visual brief and project routes/viewports/states configuration are
project-owned mutable records. Setup may create an initial empty template only
when absent and never replaces populated project choices. `frontend-design`
populates or updates them only after user confirmation.

Configuration uses a closed data schema. State preparation is limited to an
allowlisted declarative action vocabulary. Configuration cannot contain or
construct arbitrary shell, JavaScript, PHP, or launcher commands. Optional
server lifecycle uses a separately reviewed repository-owned entry point rather
than command text from configuration.

The existing exact Playwright `consumer-dev tool`, Chromium-only target, browser
acquisition, and `prism-tool run` boundary remain unchanged. This decision adds
no dependency, browser engine, Pi extension, background agent, or new setup
network effect.

### Visual evidence lifecycle

Each project records a user-selected mobile viewport and desktop viewport. A
320 CSS-pixel reflow case is always included. Relevant default, hover, focus,
active, loading, empty, error, expanded, and user-requested color-mode states
are captured when changed by the active slice.

After every meaningful frontend visual slice reaches Green, the agent captures
and inspects the required cases. Failures or mismatches return the slice to
repair and recapture. Before a component or page is visually complete, the
agent presents the desktop/mobile milestone set for user confirmation.

Working **visual review evidence** uses deterministic names and bounded metadata
and remains in an ignored repository-local area by default. Metadata records
case identities and capture settings without preserving secret-bearing raw URL
values. A reference set or copied inspiration asset enters version control only
after explicit user approval.

Capture defaults to loopback or an approved local project origin and controlled
non-sensitive development data. Non-local targets require explicit permission.
The workflow does not read credential files, manage browser storage state,
commit cookies or tokens, or capture pages containing secrets, production
personal data, or other sensitive content. Authenticated or credential-managed
capture requires a separate future design.

### Verification boundary

Local and CI gates validate schema, canonical tooling, output containment,
Chromium-only execution, deterministic metadata, and functional browser smoke.
They do not require ignored screenshots in CI, perform aesthetic scoring, or
substitute pixel comparison for human review.

Verification before completion requires current capture evidence, agent
inspection, recapture after the final relevant change, and the required user
milestone confirmation. Generated ignore policy, setup inventory,
documentation, and tests remain mechanically consistent under ADR-0025.

Production pages retain ADR-0001's CSP boundary. Visual-review state setup does
not require production inline scripts or weaken production policy.

## Consequences

### Positive

- Project aesthetics come from the user rather than the harness.
- Quality standards remain stable and are separated from visual preference.
- A deep `visual-review` module makes browser capture reproducible across
  sessions while hiding Playwright details.
- Existing Playwright/Chromium provisioning is reused without a dependency or
  network-boundary expansion.
- Functional browser tests and subjective visual review retain distinct
  purposes.
- Local-by-default evidence and explicit commit approval reduce privacy,
  copyright, and repository-size risks.

### Negative

- The adapter gains canonical tooling, a versioned configuration schema,
  create/preserve/conflict setup behavior, and more scaffold parity tests.
- Agents must perform repeated captures and image inspection during frontend
  slices, increasing development runtime.
- Projects must maintain their brief and capture cases as frontend behavior
  evolves.
- The allowlisted state-action vocabulary may require versioned expansion for
  new interaction patterns.

### Neutral

- Subjective visual approval remains human-owned.
- Pixel-diff baselines remain outside this decision.
- Authenticated capture and storage-state management remain outside this
  decision.
- Core continues to orchestrate generic pipeline policy without PHP/web capture
  logic.

## Alternatives Considered

### Retain a default harness theme

Rejected because palettes, theme types, visual movements, and examples are
project decisions. A fallback would continue to bias projects even when the
workflow asks for preferences.

### Put all mechanics in `frontend-design`

Rejected because the skill would combine interviewing, standards, browser
process management, configuration, evidence storage, and verification. The
interface would be as complex as the implementation and increase progressive-
disclosure cost.

### Extend `pest-browser`

Rejected because functional regression tests and iterative subjective
screenshots have different cadence, retention, and approval semantics.
Conflating them would either overuse browser tests or weaken their behavioral
purpose.

### Generate ad hoc scripts during each frontend task

Rejected because unversioned commands drift, are not setup-owned, are harder to
review, and do not satisfy the reusable consumer-repository requirement.

### Adopt pixel-diff visual regression now

Rejected because baseline generation, update authorization, rendering
stability, tolerance policy, and CI artifacts are a separate design. Iterative
human-reviewed screenshots provide the requested feedback loop without locking
in those semantics.

### Support authenticated browser storage state

Rejected for this change because storage state, cookies, tokens, private pages,
and production data create credential and privacy boundaries that require a
separate threat model and explicit architecture decision.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
