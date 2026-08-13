---
name: accessibility
description: Use when writing or reviewing frontend markup, SCSS, or JS that produces UI. Covers WCAG 2.2 AA, semantic HTML over ARIA, focus management, motion safety, and contrast floors for neumorphic surfaces. Complements scss-mobile-first and frontend-design.
metadata:
  prism.frontend-skill-order: "40"
---

## WCAG 2.2 AA — the floor

Every public-facing UI must meet WCAG 2.2 Level AA. The quick checks below are
not exhaustive; when in doubt, consult the spec.

## Prefer semantic HTML over ARIA

Use the native element first. ARIA is a patch, not a replacement.

- `<button>` not `<div role="button">`
- `<a href>` not `<span role="link">`
- `<nav>`, `<main>`, `<header>`, `<footer>`, `<article>`, `<section>` for
  landmarks — do not sprinkle `role="navigation"` on a `<div>`.
- Only add `aria-*` when the native semantics are insufficient (tabs,
  accordions, live regions, custom widgets).

Rule of thumb: **if a native element exists, use it.**

## Focus management

- Every interactive element must be reachable and operable by keyboard.
- Never remove focus outlines without providing a visible alternative
  (`:focus-visible` is the modern choice).
- Focus order follows DOM order. Do not fight it with `tabindex` gymnastics.
- Modals and drawers must trap focus while open and restore it on close.
- Skip-to-content link as the first focusable element on each page.

## Touch targets

- Minimum **44 × 44 CSS px** for primary interactive targets on mobile.
- Adjacent targets need a gap (≥ 8px) to avoid mis-taps.

## Motion safety

- Honor `prefers-reduced-motion: reduce`.
- When reduced motion is requested, disable non-essential animations and
  transitions, including neumorphic shadow transitions. Snap to final state.
- Do not put essential content in motion that can't be paused or skipped.

## Contrast (neumorphism-specific)

Neumorphism relies on soft shadows on a mid-tone surface, which can fail
contrast. The floor:

- **Text on surface:** ≥ **4.5:1** (AA for normal text), ≥ 3:1 for large text.
- **UI component boundaries** (button edges, input borders): ≥ **3:1** against
  adjacent colors.
- If a neumorphic surface cannot meet the text contrast floor, add a
  visible border or darken the text — do not weaken the shadow.

When the `frontend-design` skill's token values produce a failing contrast
ratio, the accessibility floor wins. Adjust the token, not the component.

## Color & state

- Never rely on color alone to convey state (errors, success, disabled).
  Pair color with text or an icon.
- Form errors: announce with `aria-live="polite"` and associate via
  `aria-describedby` pointing at the error message.
- Disabled controls: use `disabled`/`aria-disabled` and a non-color cue.

## Images & media

- Decorative images: `alt=""` (empty). Do not omit the attribute.
- Informative images: describe the meaning, not the pixels.
- `loading="lazy"` on below-the-fold images; do not lazy-load the LCP image.
- Provide captions/transcripts for audio/video.

## Cross-refs

- `scss-mobile-first` — breakpoints, units, touch target sizes.
- `frontend-design` — neumorphic surface tokens and shadow recipes (contrast
  floor enforced here).
- `frontend-architecture` — JS module pattern for keyboard handlers.
