# Frontend Visual Defaults and Downstream Contracts Audit

## Scope

Audit for [Audit visual defaults and downstream contracts](https://github.com/kyaulabs/prism/issues/409).

## Findings

### Aesthetic policy source

`packages/prism-php-web/skills/frontend-design/SKILL.md` is the only active harness resource that selects a visual movement, palette, color-mode behavior, shadow recipe, or concrete visual token values. It currently prescribes:

- neumorphism as the default design language;
- a light/dark color scheme;
- sky-blue or light-purple accents;
- concrete surface, shadow, text, accent, hover, and focus token values;
- default interactive transition timing;
- entrance, scroll-reveal, and stagger animation recipes.

Responsive and reduced-motion requirements in the same skill are quality constraints rather than aesthetic choices. They should remain, but the motion style and timing should become user-brief decisions subject to accessibility limits.

### Downstream consumers

- `packages/prism-php-web/skills/frontend-architecture/SKILL.md` consumes the visual-token contract and incorrectly describes tokens as canonically defined by `frontend-design`. It can continue to require CSS custom properties, but token names and values must come from the approved user-authored design brief rather than a harness palette.
- `packages/prism-php-web/skills/accessibility/SKILL.md` contains neumorphism-specific contrast guidance and cross-references default shadow/token recipes. Its WCAG, semantic HTML, focus, touch-target, motion-safety, state, and media guidance remains applicable; the neumorphism-specific language should become design-language-neutral contrast guidance.
- `packages/prism-php-web/skills/tdd-php/SKILL.md` loads `frontend-design` for frontend slices. That orchestration remains valid, but observable behavior should include visual-review evidence rather than assuming a fixed standards checklist.
- `packages/prism-core/AGENTS.md` advertises the current mandatory neumorphic light/dark theme in the `frontend-design` skill description. The generated/global instruction surface and any mirrored skill catalogue must be updated with the changed trigger and contract.
- `packages/prism-php-web/README.md` lists the frontend skill suite without repeating aesthetic defaults; only wording changes needed by any renamed or newly introduced skill would affect it.

### Existing browser boundary

The PHP/web `stack adapter` already owns Playwright as a `consumer-dev tool`, limits `browserTargets` to Chromium, installs the matching browser through approved setup transactions, and generates a browser smoke test. This is a viable base for reusable visual-review tooling; no new browser dependency is inherently required.

The current `pest-browser` guidance reserves browser tests for critical functional flows and ignores screenshot output. Visual design iteration therefore needs a separate development-review contract rather than weakening the functional browser-test scope.

## Design implications

1. Remove aesthetic defaults from `frontend-design`; do not replace them with another fallback style.
2. Make user visual inputs and inspiration a hard precondition for visual-language decisions.
3. Preserve responsive, accessible, progressively enhanced, and performant implementation constraints.
4. Generalize token consumption and contrast guidance so they are independent of any design movement or palette.
5. Define visual screenshot iteration separately from functional browser tests while reusing adapter-provisioned Playwright Chromium.
6. Update catalogue text and add regression checks that reject future built-in palettes, theme prescriptions, and visual movements.
