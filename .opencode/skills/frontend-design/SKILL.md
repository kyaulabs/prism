---
name: frontend-design
description: Use when writing or reviewing SCSS/CSS that defines visual language. Sets the mandatory baseline — responsive always, mobile-first, CSS transitions for ease, CSS-driven load/scroll flow, neumorphic design language, and the default light/dark theme with sky-blue or light-purple highlights. Defines the canonical :root tokens consumed by frontend-architecture.
---

## Mandatory baseline

The following are non-negotiable defaults for every project. Deviating
requires a documented exception (an ADR or a page-level note in `CONTEXT.md`).

### 1. Responsive — always

- No fixed-px container widths. Use `max-width` + fluid padding.
- Layout breakpoints and `min-width` mechanics live in the `scss-mobile-first`
  skill. This skill does not redefine them.

### 2. Mobile-first mindset

- Base styles target the smallest viewport (320px).
- Scale up with `min-width` media queries. Never `max-width` for layout.

### 3. Transitions for ease

- Default to `transition: <property> 200–300ms ease` on interactive states
  (hover, focus, active).
- Only transition transform, opacity, color, background, border, box-shadow.
- Never transition layout-affecting properties (`width`, `height`, `top`,
  `left`, `margin`, `padding`) — they cause reflow and jank.
- Honor `prefers-reduced-motion: reduce` — see the `accessibility` skill.

### 4. CSS-driven load & scroll flow

The site should appear to flow as it loads and scrolls, achieved primarily
with CSS.

- **Entrance animations** via `@keyframes` + `animation`.
- **Scroll reveals** via `IntersectionObserver` adding an `.is-visible` class
  (the JS module lives in `frontend-architecture`). Progressive enhancement
  rules apply: default the element to **visible** if JS fails — only hide via
  a `.js .will-reveal` selector that requires JS to have run. Do not gate
  content visibility behind JS.
- **Stagger siblings** with `animation-delay` / `transition-delay` using
  `calc(var(--i) * 80ms)` and inline `--i` per element.
- Keep total entrance duration ≤ **600ms**. Faster is better.
- Respect `prefers-reduced-motion` — snap to final state, no animation.

### 5. Neumorphism — default design language

Soft-UI: dual shadows (a light one top-left, a dark one bottom-right) on a
monochrome mid-tone surface. Inset shadows for pressed/active states.

**Shadow recipes:**

```scss
// Raised (default interactive surface)
box-shadow: 6px 6px 12px var(--shadow-dark),
            -6px -6px 12px var(--shadow-light);

// Pressed / active / inset
box-shadow: inset 6px 6px 12px var(--shadow-dark),
            inset -6px -6px 12px var(--shadow-light);

// Hover lift
box-shadow: 8px 8px 16px var(--shadow-dark),
            -8px -8px 16px var(--shadow-light);
```

- Surface must be a **mid-tone**. Neumorphism fails on pure white or pure
  black — there's no range for the dual shadow to play in.
- Pressed/inset state replaces the raised shadow; do not stack both.
- Keep shadow radii consistent across components on a page.

**Contrast floor:** neumorphic surfaces can fail text/UI contrast. The
`accessibility` skill enforces ≥ 4.5:1 for text and ≥ 3:1 for component
boundaries. If the default tokens fail, add a visible border or darken the
text — never weaken the shadow to fake contrast.

**Exceptions:** neumorphism is the default. Documented exceptions are allowed
where readability or density wins (article body text, dense data tables). Note
the exception in an ADR or a page-level note in `CONTEXT.md`.

### 6. Color scheme

- **If the user or page specifies a palette, use it verbatim.** Do not impose
  the default on an explicit request.
- **Otherwise** use the default below:

| Mode | Surface | Text | Accent options |
| --- | --- | --- | --- |
| Light | neutral grey (`#e0e5ec`-ish) | dark | sky blue **or** light purple |
| Dark | dark neutral | light | sky blue **or** light purple |

- Sky blue: `#38bdf8` (accent), `#87ceeb` (soft).
- Light purple: `#a78bfa` (accent), `#c4b5fd` (soft).
- Respect `prefers-color-scheme` unless the user overrides it explicitly.
- Accents are for highlights, active states, focus rings — not large fills.

## Canonical tokens (`:root`)

These are the source of truth. `frontend-architecture` and components consume
them via `var(--token)`. Define in the base SCSS file (e.g.
`cdn/sass/_tokens.scss`), never in component files.

```scss
:root {
    // Surface
    --surface: #e0e5ec;

    // Shadows (neumorphism)
    --shadow-light: #ffffff;
    --shadow-dark: #b8bcc4;

    // Text
    --text: #2d3748;
    --text-muted: #5a6472;

    // Accents (pick one of the two; both provided as options)
    --accent: #38bdf8;        // sky blue
    --accent-soft: #87ceeb;
    // --accent: #a78bfa;     // light purple (uncomment to switch)
    // --accent-soft: #c4b5fd;
    --accent-hover: #0ea5e9;

    // Focus ring (accessibility — must meet 3:1)
    --focus-ring: #2563eb;
}

@media (prefers-color-scheme: dark) {
    :root {
        --surface: #2d3340;
        --shadow-light: #353d4d;
        --shadow-dark: #1a1f2a;
        --text: #e2e8f0;
        --text-muted: #a0aec0;
    }
}

@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```

## Cross-refs

- `scss-mobile-first` — breakpoints, units, build mechanics.
- `accessibility` — contrast floors, motion safety, focus management.
- `frontend-architecture` — how to consume tokens in JS and component SCSS.
- `aurora-page` — where the base CSS file is registered.
