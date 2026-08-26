# Recommended Non-Aesthetic Frontend Quality Standards

Research for [Research recommended non-aesthetic web standards](https://github.com/kyaulabs/prism/issues/410).

## Summary

- Use WCAG 2.2 Level AA as the normative accessibility floor, independent of the user's visual language. [1]
- Require conforming, semantic HTML as the structural baseline; aesthetic choices must not replace native meaning and behavior. [6]
- Require responsive reflow for non-exempt content at 320 CSS pixels, which corresponds to 400% zoom from a 1280 CSS-pixel viewport. [2]
- Keep contrast, keyboard/focus, non-color state cues, and motion safety as quality constraints while leaving palette, theme behavior, and animation style to the user brief. [1][3][5]
- Recommend measurable performance goals using current Core Web Vitals: LCP no more than 2.5 seconds, INP no more than 200 milliseconds, and CLS no more than 0.1 at the 75th percentile, segmented by mobile and desktop. [7]
- Correct Prism's target-size wording: WCAG 2.2 AA requires 24 by 24 CSS pixels with defined exceptions, not 44 by 44. Prism may recommend 44 by 44 for primary touch controls as a stricter usability convention, but must not describe it as the AA floor. [4]

## Findings

### Normative standards to retain

#### Accessibility

WCAG 2.2 Level AA should remain mandatory for public-facing UI. It is visual-language-neutral and covers perceivability, operability, understandability, and robustness rather than prescribing aesthetics. [1]

The frontend workflow should surface the relevant checks during design intake and implementation: text contrast, non-text contrast, visible focus, keyboard operation, alternatives for media, non-color state cues, reflow, and target size. Concrete requirements should continue to live in `accessibility`, with `frontend-design` linking to them rather than duplicating them.

#### Semantic, conforming HTML

The WHATWG HTML Living Standard defines author conformance and the semantics, structure, and APIs of HTML documents. The harness should require native semantic elements and valid interaction primitives before visual styling or custom ARIA. [6]

#### Responsive reflow

WCAG 2.2 Reflow requires non-exempt horizontal-language content to fit a 320 CSS-pixel-wide viewport without two-dimensional scrolling. The W3C guidance explicitly connects this requirement with responsive web design practices. [2]

This supports retaining responsive behavior and screenshot checks at narrow and wide viewports. Mobile-first remains a Prism implementation convention, not a user-selected theme or a universal normative web standard.

### Visual constraints without visual defaults

The user must provide the palette, color-mode behavior, typography direction, spacing character, shape language, imagery, motion character, and inspiration examples. Prism should not provide a fallback theme, design movement, color family, or token values.

The approved visual choices remain constrained by WCAG. Normal text needs at least 4.5:1 contrast and large text at least 3:1. [3] Focus and state cannot rely on color alone, and non-text controls need applicable contrast under WCAG 2.2. [1]

### Interaction and motion

WCAG 2.2 AA Target Size (Minimum) uses 24 by 24 CSS pixels with spacing and other exceptions. [4] The existing `accessibility` skill's 44 by 44 requirement is a stricter usability recommendation and should be labelled as such rather than presented inside the AA floor.

Animation from interactions is a Level AAA success criterion, not AA, but W3C recommends avoiding unnecessary animation, offering a way to disable it, or honoring the operating-system reduced-motion preference. [5] Prism should retain reduced-motion handling as a recommended safety baseline while asking the user to define the desired motion character and intensity.

### Performance and stability

Core Web Vitals are broadly used, measurable recommendations rather than W3C conformance requirements. The current thresholds are:

- LCP at or below 2.5 seconds;
- INP at or below 200 milliseconds;
- CLS at or below 0.1;
- evaluated at the 75th percentile separately for mobile and desktop. [7]

The frontend workflow should recommend these targets and capture development-time evidence where available. Field measurement remains distinct from lab checks; the cited guidance says lab testing is useful for regressions but does not replace field data. [7]

### Recommended Prism intake categories

The frontend-design interview should distinguish:

1. **User-owned visual decisions:** references/inspiration, palette, light/dark or other mode behavior, typography, spacing density, shape language, imagery, motion character, and explicit dislikes.
2. **Mandatory quality constraints:** WCAG 2.2 AA, semantic HTML, keyboard/focus behavior, responsive reflow, progressive enhancement, and active-adapter security requirements.
3. **Recommended measurable targets:** Core Web Vitals, 44 by 44 primary touch targets, reduced-motion support, and screenshot review across agreed desktop/mobile states.

Progressive enhancement and mobile-first are Prism engineering practices supported by the existing adapter contracts; they should be presented as implementation recommendations, not as user-supplied aesthetics or external conformance standards.

## Confidence

**High.** Normative claims come from W3C/WAI and WHATWG specifications; performance thresholds come from current official web.dev guidance. The 44 by 44 recommendation is deliberately identified as stricter Prism guidance rather than a WCAG 2.2 AA requirement.

## Open questions

- Whether screenshot evidence should be retained only during development or committed for selected acceptance checkpoints.
- Whether Core Web Vitals are advisory by default or become project-specific acceptance criteria when the user opts in.

## Sources

[1] Web Content Accessibility Guidelines (WCAG) 2.2 — https://www.w3.org/TR/WCAG22/ (accessed 2026-08-25)

[2] Understanding Success Criterion 1.4.10: Reflow — https://www.w3.org/WAI/WCAG22/Understanding/reflow.html (accessed 2026-08-25)

[3] Understanding Success Criterion 1.4.3: Contrast (Minimum) — https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html (accessed 2026-08-25)

[4] Understanding Success Criterion 2.5.8: Target Size (Minimum) — https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html (accessed 2026-08-25)

[5] Understanding Success Criterion 2.3.3: Animation from Interactions — https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html (accessed 2026-08-25)

[6] HTML Living Standard — https://html.spec.whatwg.org/multipage/ (accessed 2026-08-25)

[7] Web Vitals — https://web.dev/articles/vitals (accessed 2026-08-25)
