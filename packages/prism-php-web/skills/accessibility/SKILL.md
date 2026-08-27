---
name: accessibility
description: Use when writing or reviewing frontend markup, SCSS, or JS that produces UI. Covers WCAG 2.2 AA, semantic HTML over ARIA, focus management, motion safety, contrast, target size, and accessible media. Complements scss-mobile-first and frontend-design.
metadata:
  prism.frontend-skill-order: "40"
---

## WCAG 2.2 AA — the floor

Every public-facing UI must meet WCAG 2.2 Level AA. The quick checks below are
not exhaustive; when in doubt, consult the specification.

## Prefer semantic HTML over ARIA

Use the native element first. ARIA is a patch, not a replacement.

- `<button>` not `<div role="button">`.
- `<a href>` not `<span role="link">`.
- Use `<nav>`, `<main>`, `<header>`, `<footer>`, `<article>`, and `<section>`
  for landmarks rather than redundant roles on generic elements.
- Add `aria-*` only when native semantics are insufficient for a component.

## Focus management

- Every interactive element must be reachable and operable by keyboard.
- Never remove focus outlines without providing a visible alternative.
- Focus order follows DOM order; avoid positive `tabindex` values.
- Modals and drawers trap focus while open and restore it on close.
- Put a skip-to-content link first in the focus order on each page.

## Touch targets

- WCAG 2.2 AA Target Size (Minimum) is 24 × 24 CSS px with its defined
  exceptions.
- Use 44 × 44 CSS px for primary touch controls as a stricter Prism recommendation.
- Keep adjacent targets separated so users can avoid accidental activation.

## Motion safety

- Honor `prefers-reduced-motion: reduce`.
- Disable non-essential animation and transitions when reduced motion is
  requested; snap to the final state.
- Do not place essential content in motion that cannot be paused or skipped.

## Contrast

- Normal text: at least 4.5:1.
- Large text: at least 3:1.
- Applicable component boundaries and focus indicators: at least 3:1.
- If the user-authored palette fails, revise the palette or add a visible
  boundary; never weaken the accessibility floor.

## Color and state

- Never rely on color alone for errors, success, selection, or disabled state.
- Associate form errors with their controls and announce updates as needed.
- Use native disabled semantics and a non-color cue for disabled controls.

## Images and media

- Decorative images use `alt=""`.
- Informative images describe meaning rather than appearance alone.
- Lazy-load below-the-fold images, but not the likely LCP image.
- Provide captions or transcripts for audio and video.

## Cross-refs

- `scss-mobile-first` — responsive and touch-oriented implementation.
- `frontend-design` — user-authored visual brief and quality recommendations.
- `frontend-architecture` — progressive enhancement and keyboard behavior.
- `visual-review` — configured viewport and state evidence.
