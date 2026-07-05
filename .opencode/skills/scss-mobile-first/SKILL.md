---
name: scss-mobile-first
description: Use when writing or reviewing SCSS. Covers mobile-first design rules, responsive breakpoints, unit preferences, touch targets, and stylelint configuration.
---

## Mobile-First Design Rules

All styling is developed mobile-first. This means:

- **Base styles target the smallest viewport** (320px mobile)
- **Scale up with `min-width` media queries** — never `max-width` for layout
- Use `min-width` breakpoints: `768px` (tablet), `1024px` (desktop)

```scss
// Correct — mobile-first
.container {
    padding: 1rem;

    @media (min-width: 768px) {
        padding: 2rem;
    }
}

// Wrong — desktop-first
.container {
    padding: 2rem;

    @media (max-width: 767px) {
        padding: 1rem;
    }
}
```

## Units

- Use `rem`, `%`, `vw`, `vh`, `clamp()` for layout and spacing
- Avoid fixed `px` values for widths and margins
- Use `clamp()` for fluid typography and spacing:

```scss
font-size: clamp(1rem, 2.5vw, 1.5rem);
padding: clamp(1rem, 4vw, 2rem);
```

- Avoid fixed `px` widths on layout containers — use `max-width` + responsive padding
- Touch targets ≥ 44×44px — see the `accessibility` skill for the WCAG minimum and adjacent-target gap rule

## Stylelint

Config: `.stylelintrc.json`
Run: `npx stylelint "cdn/sass/**/*.scss"`

Stylelint runs automatically in the pre-commit hook on staged `.scss` files.
Fix violations before committing — the hook blocks on failure.

## SCSS Source Location

Edit files in `cdn/sass/`. Never edit `cdn/css/*.min.css` — those are generated.

Compile:
```bash
sass --style=compressed cdn/sass/source.scss cdn/css/output.min.css
```
