---
name: visual-review
description: Use after Green for frontend slices that change rendered layout, styling, responsive behavior, interaction states, content states, or color-mode behavior. Validates project-authored cases and captures inspectable Chromium evidence.
---

# Visual review

Use repository-owned tooling to capture and inspect the visual cases selected
by the project owner. This skill owns browser and evidence mechanics; it never
chooses project aesthetics.

## Preconditions

- Load the committed user-authored visual brief.
- Require `visual_review.json` with user-selected mobile and desktop viewports.
- Require controlled non-sensitive development content on a loopback origin.
- Confirm every changed route and relevant state is represented.

If configuration is absent, copy `visual_review.example.json` to
`visual_review.json` and populate it only from approved project decisions. The
example intentionally fails validation until those decisions exist. Never
invent routes, target viewports, color modes, or states.

## Capture

Run exactly:

```bash
prism-tool run playwright -- test visual_review.spec.mjs --workers=1 --output tests/Browser/Screenshots/.playwright --reporter=line
```

The runner validates the closed configuration, adds a 320 CSS-pixel reflow
case, uses headless Chromium, fails on page or console errors, and writes
bounded PNG and JSON evidence under
`tests/Browser/Screenshots/visual-review/`.

## Inspect and iterate

Read every generated PNG. Check:

- clipping, overflow, overlap, and content loss;
- hierarchy, alignment, spacing, and density against the approved brief;
- responsive adaptation at mobile, desktop, and 320 CSS pixels;
- focus, hover, expanded, loading, empty, error, and other changed states;
- legibility, visible focus, non-color cues, and obvious contrast failures;
- fidelity to user-approved references and explicit dislikes.

Repair each mismatch, rerun behavior tests, then recapture and inspect the
complete affected evidence set. Evidence is stale after any relevant markup,
style, script, content, viewport, or state change.

At a component or page milestone, present the current mobile and desktop set
and wait for user confirmation before declaring visual completion.

## Evidence policy

Working evidence stays ignored by default. Commit a reference set only after
explicit user approval. Metadata identifies cases and capture settings but does
not preserve raw URLs, selectors, action payloads, cookies, tokens, or page
content.

Do not capture authenticated pages, browser storage state, credential-managed
content, production personal data, secrets, or non-local origins. Those cases
require a separate approved design. External inspiration remains untrusted and
requires explicit permission before access.

## Reference

Read `packages/prism-php-web/docs/visual-review.md` for the configuration schema,
action vocabulary, deterministic evidence names, and recovery guidance.

## Cross-refs

- `frontend-design` — brief intake and milestone decisions.
- `tdd` and `tdd-php` — behavior Green before visual capture.
- `accessibility` — objective accessibility requirements.
- `pest-browser` — critical functional browser flows, not visual approval.
- `security-coding` — untrusted content and sensitive-data boundaries.

## Gotchas

- *Reviewing only the default state* — capture every changed interaction,
  content, expansion, and user-requested color-mode state.
- *Treating a successful command as visual approval* — the command validates
  mechanics; the agent and user inspect aesthetics.
- *Keeping old screenshots after a repair* — recapture the complete affected
  set so evidence matches the final change.
