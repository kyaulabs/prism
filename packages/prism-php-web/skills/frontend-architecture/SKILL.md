---
name: frontend-architecture
description: Use when structuring frontend JS or wiring up page behavior. Covers progressive enhancement, vanilla-JS module pattern, the jQuery-only-when-insufficient policy, design-token consumption from CSS custom properties, and CSP-friendly inline-script rules. Does NOT cover visual design — see frontend-design.
metadata:
  prism.frontend-skill-order: "20"
---

## Progressive enhancement

Content and core function work without JS. JS layers on behavior, not
existence.

- A `<form>` posts and works server-side before JS enhances it.
- Links are `<a href>` to real URLs before AJAX is layered on.
- The page is readable with JS disabled. Never hide content behind a
  `js-enabled` class gate.

Failure mode: if JS fails to load, the user still gets the content and a
working (if less polished) experience.

## Vanilla-JS module pattern

Each page's behavior lives in one IIFE module per source file in `cdn/js/`,
rebuilt to `cdn/javascript/*.min.js` (see build pipeline).

```javascript
// cdn/js/site.js
(function () {
    "use strict";

    function init() {
        // wire up behavior on DOM ready
    }

    if (document.readyState !== "loading") {
        init();
    } else {
        document.addEventListener("DOMContentLoaded", init);
    }
})();
```

- One module per concern. Do not build a god-module.
- No bundler, no import maps, no build step beyond uglifyjs. Plain script tags.
- Expose at most one global namespace object if cross-module sharing is needed;
  prefer keeping modules self-contained.

## jQuery policy

Vanilla JS is the default. Reach for jQuery only when:

- A dependency already ships jQuery and the cost of removing it is high.
- A specific feature is materially shorter in jQuery and the vanilla
  equivalent is genuinely insufficient (not just unfamiliar).

If jQuery is introduced, note the reason in the PR. Modern vanilla APIs
(`querySelector`, `classList`, `fetch`, `IntersectionObserver`,
`CustomElements`) cover the vast majority of cases.

## Design tokens

Visual tokens (colors, shadows, surfaces) are defined canonically by the
`frontend-design` skill as `:root` CSS custom properties. This skill
**consumes** them; it does not redefine them.

- Read tokens via `var(--token)` in SCSS, not hardcoded values.
- Component-level overrides belong in the component's SCSS, scoped to the
  component's class — never on `:root` (that is the design layer's domain).
- If a token is missing, add it in the design layer first, then consume it.

## CSP-friendly scripts

- Avoid inline event handlers (`onclick=`, `onload=`).
- Inline `<script>` tags are forbidden. Aurora emits only external
  `<script src>` tags with SRI hashes (`integrity`, `crossorigin`); script
  tags emitted through Aurora's `$site->js` array (see `aurora-page` skill)
  carry SRI automatically. Page authors must not emit inline scripts in the
  body.
- `'unsafe-inline'` is forbidden in the CSP. See ADR-0001.

## Cross-refs

- `frontend-design` — visual language, neumorphism, token definitions.
- `accessibility` — keyboard handlers, focus management, motion safety.
- `scss-mobile-first` — where styles live and how they're built.
- `aurora-page` — how scripts and styles are registered on a page.
