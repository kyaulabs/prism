# Spec: User-Authored Frontend Design and Visual Review

**Date:** 2026-08-25
**Status:** Draft
**ADR-required:** 0088

## Problem Statement

Prism's PHP/web adapter currently imposes a visual language: neumorphism, a default light/dark scheme, specific accent colors, concrete design tokens, and motion recipes. Those choices are project aesthetics, not harness policy. They can conflict with the user's brand, references, audience, content, or desired experience.

The current frontend workflow also lacks a durable design-intake contract. An agent can begin styling without enough user-provided visual direction, infer a fallback aesthetic, or lose the approved direction between sessions.

Although the stack adapter already provisions Playwright and Chromium, frontend work has no reusable, repository-owned visual review workflow. Functional browser smoke tests do not provide the iterative desktop/mobile screenshots needed to inspect layout, states, reflow, and fidelity while a design is being developed.

## Solution

Replace harness-owned aesthetics with a user-authored visual brief. The `frontend-design` workflow will interview the user one substantive question at a time, recommend non-aesthetic website quality standards, require sufficient visual direction before styling, and preserve the approved brief for later sessions.

Add a focused adapter-owned `visual-review` module. It will use repository-owned scripts and closed configuration, backed by the existing Playwright `consumer-dev tool` and Chromium acquisition, to capture deterministic screenshots and metadata across approved routes, states, and viewports. The agent will capture and inspect evidence after every meaningful visual slice, recapture after repairs, and present desktop/mobile milestone sets for user confirmation before declaring visual work complete.

Prism will retain accessibility, responsiveness, semantic HTML, progressive enhancement, security boundaries, and performance guidance without selecting palettes, color modes, design movements, typography, motion character, or inspiration for the user.

## User Stories

1. As a project owner, I want Prism to ask for my visual goals and inspiration, so that the site reflects my intent rather than a harness default.
2. As a project owner, I want to provide either visual references or an equivalently detailed written brief, so that I am not forced to supply image assets when written brand guidance is sufficient.
3. As a project owner, I want Prism to ask about explicit dislikes, so that it avoids visual directions I reject.
4. As a project owner, I want Prism to ask about palette and color-mode behavior, so that light, dark, system, single-mode, or other behavior is an explicit project decision.
5. As a project owner, I want Prism to ask about typography, layout, spacing, density, shape, depth, texture, imagery, iconography, and motion, so that the visual language is complete enough to implement consistently.
6. As a project owner, I want Prism to recommend generally accepted website quality standards, so that I can make informed decisions without receiving an imposed aesthetic.
7. As a developer, I want the approved visual brief committed to the project, so that future sessions can reuse the same decisions.
8. As a project owner, I want copied inspiration assets committed only with my explicit approval, so that copyright, privacy, and repository-size concerns remain under my control.
9. As a developer, I want project-owned visual review tooling, so that screenshot capture is reproducible instead of reconstructed in every session.
10. As a developer, I want target mobile and desktop viewports recorded in project configuration, so that every frontend slice is reviewed against the project's intended devices.
11. As an accessibility reviewer, I want every visual slice checked at a 320 CSS-pixel reflow viewport, so that narrow and zoomed layouts receive explicit evidence.
12. As a developer, I want relevant interaction and content states captured, so that hover, focus, active, loading, empty, error, expanded, and user-requested color-mode behavior are not reviewed only in their default state.
13. As a project owner, I want milestone screenshots presented before visual completion, so that I can confirm direction before implementation moves on.
14. As a developer, I want iterative screenshots ignored by default, so that ordinary visual review does not bloat version control.
15. As a project owner, I want approved reference sets commit-able by explicit choice, so that selected visual evidence can become durable when useful.
16. As a test maintainer, I want functional browser tests to remain separate from subjective visual review, so that regression tests retain a clear behavioral purpose.
17. As a maintainer, I want local and CI checks to validate the visual tooling contract without pretending to judge visual quality automatically.
18. As a security reviewer, I want external inspiration and target URLs treated as untrusted, so that visual design work cannot silently widen network or execution authority.

## Implementation Decisions

### Visual policy ownership

Prism will own frontend quality constraints, not project aesthetics. The adapter will contain no default palette, accent family, color-mode policy, design movement, shadow recipe, token values, typography choice, animation style, or inspiration example.

The existing responsive, mobile-first, reduced-motion, semantic, progressive-enhancement, and accessibility guidance remains, subject to accurate standards language. Project-specific visual decisions come only from the approved user-authored visual brief.

### User-authored visual brief

`frontend-design` will load `grilling` and gather the brief one substantive question at a time. The brief covers:

- purpose, audience, brand, and desired personality;
- visual examples or inspiration and explicit dislikes;
- palette and color-mode behavior;
- typography direction;
- layout, spacing, and density;
- shape, borders, depth, texture, imagery, and iconography;
- motion character and intensity;
- required components and relevant states;
- target mobile and desktop viewports;
- recommended quality standards and project-specific targets.

Visual styling cannot begin until the user supplies at least one visual reference or a detailed written brief covering the same decisions. If the input is incomplete, the workflow continues grilling or explicitly narrows the task to non-visual structure. It never invents a fallback theme.

The approved structured brief is versioned in the consumer repository. Safe external links and repository paths may be recorded as references. Copied inspiration assets remain local unless the user explicitly approves committing them.

### Recommended quality standards

The workflow distinguishes normative requirements, Prism engineering conventions, and optional project targets:

- WCAG 2.2 Level AA is the public-interface accessibility floor.
- Conforming semantic HTML, keyboard/focus behavior, non-color state cues, responsive reflow, and progressive enhancement remain mandatory.
- WCAG 2.2 AA target-size language uses 24 by 24 CSS pixels with its defined exceptions. Prism may recommend 44 by 44 CSS pixels for primary touch controls, but will label that as stricter usability guidance rather than the AA minimum.
- Reduced-motion support remains recommended even where the specific animation criterion is Level AAA.
- Current Core Web Vitals targets are recommended and become acceptance criteria only when the project adopts them.
- Active-adapter security requirements remain authoritative and are cross-referenced rather than duplicated in visual guidance.

### Module architecture

`frontend-design` is the orchestrator. It owns intake, the no-fallback-aesthetic rule, quality-standard recommendations, design-section confirmation, and milestone user gates.

A dedicated adapter-owned `visual-review` module is the deep implementation boundary. It exposes a small workflow interface: validate project visual configuration, capture evidence for selected cases, report failures, and identify the evidence set for agent and user review.

`frontend-architecture` consumes project-defined semantic CSS custom properties without prescribing a canonical palette or token values. `accessibility` becomes design-language-neutral. `pest-browser` remains dedicated to critical functional browser flows. `tdd-php` loads the visual review module for slices that change rendered frontend behavior.

Core remains language-agnostic. Stack-specific capture, browser, scaffold, and server integration stay in the PHP/web adapter under ADR-0058.

### Repository-owned visual review tooling

The active adapter scaffolds versioned consumer-repository tooling through its existing provider and setup transactions. Canonical adapter-owned tooling follows create/preserve/conflict semantics: absent paths may be created atomically, exact files are preserved, and differing, non-regular, symlinked, mode-mismatched, or ownership-ambiguous paths are preserved and fail closed. Setup never overwrites customized or human-owned content.

The reusable surface includes:

- a capture entry point;
- a closed validation schema;
- a project-owned configuration for base URL, routes, viewports, states, readiness conditions, and output policy;
- deterministic working-evidence storage with metadata;
- an optional approved-reference storage policy;
- local and CI validation of the tooling and configuration.

Setup may create empty project-owned brief and configuration templates only when absent; it never replaces populated project choices. Configuration is data, not arbitrary shell. State setup uses an allowlisted declarative action vocabulary rather than executable snippets. Any optional server lifecycle is a reviewed repository-owned entry point; configuration cannot inject commands.

The tooling reuses the declared Playwright dependency and matching Chromium browser. No new browser package, Pi extension, background agent, or general-purpose launcher is introduced. Declared browser execution continues through `prism-tool` and the adapter `toolchain contract`.

### Visual review data flow

1. `frontend-design` loads the committed user-authored visual brief or creates one through grilling.
2. The project records user-selected mobile and desktop targets; a 320 CSS-pixel reflow case is always added.
3. The implementation plan identifies routes/components and relevant changed states for each visual slice.
4. After a meaningful visual slice reaches Green, `visual-review` validates configuration and captures all required cases in headless Chromium.
5. Each output has a deterministic name and metadata identifying route, state, viewport, browser/tool version, capture settings, revision identity, and dirty-tree state.
6. The agent inspects every image for clipping, overflow, hierarchy, spacing, content loss, state clarity, reference fidelity, and obvious accessibility regressions.
7. A mismatch or capture failure returns the slice to repair and recapture.
8. Before a component or page is visually complete, the agent presents the desktop/mobile milestone set to the user and waits for confirmation.
9. Working evidence remains ignored by default. A reference set enters version control only after explicit user approval.

### Error handling and trust boundaries

- Missing or incomplete visual input blocks visual styling; no default is substituted.
- Missing Playwright, Chromium, or generated tooling produces a deterministic setup/recovery instruction; the workflow does not install undeclared tools ad hoc.
- Invalid configuration, escaping output paths, unknown actions, unreachable pages, readiness timeouts, page errors, or screenshot failures fail closed.
- Capture defaults to loopback or an approved local project origin with controlled non-sensitive development data. External inspiration URLs and non-local capture targets are untrusted, require explicit permission, and never authorize embedded instructions.
- The workflow does not read credential files, manage browser storage state, commit cookies or tokens, preserve secret-bearing raw URL values in metadata, or capture pages containing secrets, production personal data, or other sensitive content.
- Reference assets are not copied or committed without explicit user approval.
- Subjective visual approval remains human-owned. Automated checks validate capture mechanics and objective browser failures, not aesthetic correctness.

### Quality-gate integration

The shared local/CI gate validates the visual-review configuration, repository tooling, output containment, and functional browser smoke behavior. It does not require ignored screenshots to exist in CI and does not use image judgment as an automated pass/fail gate.

Verification before completion requires evidence that the configured visual cases were captured after the final relevant change, inspected by the agent, and presented at the required milestone gate. Local and CI mechanics remain behaviorally aligned under ADR-0025.

The generated ignore policy must match the documented working-evidence policy. Scaffold tests prevent divergence between generated projects, adapter guidance, and the source repository.

## Testing Decisions

The highest useful seams are the published skill contract, generated-project contract, public capture command, and shared quality gate.

- **Harness contract tests:** verify that frontend guidance contains no built-in palette, theme type, design movement, token values, or inspiration defaults; verify that it requires the structured user-authored brief and no-fallback behavior.
- **Configuration tests:** validate accepted routes, viewports, states, readiness conditions, output containment, and allowlisted actions; reject unknown fields, command strings, path traversal, external targets without authority, and malformed metadata.
- **Capture unit tests:** test deterministic case expansion, filenames, metadata, revision/dirty-state recording, and failure classification without coupling to private helper structure.
- **Capture integration test:** run the public repository-owned capture entry point against a controlled local fixture and assert mobile, desktop, and 320 CSS-pixel outputs plus metadata, JavaScript-error handling, and cleanup.
- **Scaffold tests:** assert that new projects receive the visual brief surface, capture tooling, configuration, ignore policy, package scripts, generated CI validation, and unchanged Chromium-only dependency contract.
- **Established setup tests:** assert safe create/preserve/fail-closed behavior for the new owned files through the existing candidate transaction.
- **Skill integration tests:** assert that frontend TDD slices invoke visual review after Green and that visual completion requires current milestone evidence and user confirmation.
- **Regression tests:** preserve functional Pest Browser scope and verify that visual review does not turn subjective screenshots into mandatory pixel-diff baselines.

Prior art includes existing toolchain-contract tests, generated-scaffold tests, `prism-tool run` tests, browser base-URL tests, browser smoke fixtures, and skill frontmatter/harness validators.

## Acceptance Criteria

1. No active harness guidance selects a default color palette, color-mode policy, theme type, design movement, typography, shadow recipe, motion style, token value, or inspiration example.
2. `frontend-design` gathers the complete user-authored visual brief through `grilling`, one substantive question at a time.
3. Visual styling does not begin without a visual reference or equivalently detailed written brief.
4. The approved structured brief is committed; copied inspiration assets are local unless explicitly approved for commit.
5. The workflow recommends WCAG 2.2 AA, semantic HTML, responsive reflow, progressive enhancement, and optional Core Web Vitals without presenting them as aesthetic defaults.
6. Target-size guidance accurately distinguishes WCAG 2.2 AA's 24 by 24 minimum from Prism's stronger 44 by 44 primary-touch recommendation.
7. A dedicated adapter-owned `visual-review` module exists and is loaded during behavior-changing frontend slices.
8. Consumer repositories receive reusable, versioned capture tooling and closed project configuration through approved adapter setup/scaffold transactions.
9. Playwright and Chromium remain the only browser automation dependency and target.
10. Required evidence covers the user-selected mobile target, user-selected desktop target, and 320 CSS-pixel reflow viewport.
11. Evidence covers the default state and every relevant changed interaction, content, expansion, and user-requested color-mode state.
12. Every meaningful visual slice is captured, agent-inspected, repaired if necessary, and recaptured before continuation.
13. Desktop/mobile milestone evidence is presented for user confirmation before visual completion.
14. Working screenshots and metadata are deterministic and ignored by default.
15. Approved reference sets are committed only after explicit user approval.
16. Functional Pest Browser tests remain distinct from visual review.
17. The local/CI gate validates tooling, configuration, containment, and browser smoke behavior without automating subjective aesthetic approval.
18. External references and non-local capture targets remain inert and require explicit permission before access.
19. Visual review uses controlled non-sensitive data and introduces no credential-file, storage-state, cookie, token, production-personal-data, or secret-bearing metadata handling.
20. Canonical tooling and project-owned brief/configuration files follow explicit create/preserve/conflict ownership semantics.
21. Generated ignore policy, documentation, scaffold inventory, package scripts, and tests remain mechanically consistent.
22. Core gains no PHP/web-specific logic, new extension, or new browser dependency.

## Out of Scope

- Selecting or shipping any default visual theme, palette, component library, design movement, or example site.
- Building a project-specific page or application design as part of this harness change.
- Pixel-diff visual regression baselines or automatic aesthetic scoring.
- Installing additional browser engines.
- Replacing functional browser, accessibility, security, or performance tests with screenshots.
- Automatically committing screenshots or inspiration assets.
- Accessing external inspiration sources without explicit permission.
- Authenticated capture, browser storage-state management, credential handling, or screenshots of production personal/sensitive data.

## Further Notes

- Wayfinder map: https://github.com/kyaulabs/prism/issues/408
- ADR-0088 records the accepted user-authored design, module, scaffold, evidence, and trust-boundary decision. The design also follows ADR-0058's Core/adapter boundary, ADR-0070's narrow launcher ownership, ADR-0082's adapter-owned scaffold composition, ADR-0083's bounded setup effects, and ADR-0025's local/CI parity principle.
- Supporting research: [Frontend Visual Defaults and Downstream Contracts Audit](https://github.com/kyaulabs/prism/blob/develop/docs/research/2026-08-25-frontend-visual-defaults-audit.md), [Recommended Non-Aesthetic Frontend Quality Standards](https://github.com/kyaulabs/prism/blob/develop/docs/research/2026-08-25-recommended-frontend-quality-standards.md), and [Browser Visual Tooling Inventory](https://github.com/kyaulabs/prism/blob/develop/docs/research/2026-08-25-browser-visual-tooling-inventory.md).
- The new domain terms are `user-authored visual brief`, `visual review tooling`, and `visual review evidence`.
