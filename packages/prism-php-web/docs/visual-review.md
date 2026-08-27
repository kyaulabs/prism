# Visual review tooling

The PHP/web adapter captures project-authored visual cases with its declared
Playwright dependency and Chromium target. The result is local inspection
evidence, not a functional Pest Browser test and not a substitute for human
milestone approval.

## Files

| File | Responsibility |
| --- | --- |
| `visual_review.mjs` | Validate configuration, expand cases, constrain actions, and contain evidence output |
| `visual_review.spec.mjs` | Run the public headless Chromium capture |
| `visual_review.example.json` | Show the schema without making project design decisions |
| `visual_review.json` | Store the project's approved routes, states, and viewports |

Create the active configuration by copying the example only after the user has
approved the visual brief and review cases.

## Declarative configuration

The root permits only:

| Key | Contract |
| --- | --- |
| `schemaVersion` | Integer `1` |
| `baseUrl` | Loopback HTTP or HTTPS origin without credentials, query, or fragment |
| `viewports` | Exactly user-selected `mobile` and `desktop` viewports |
| `cases` | One to 64 route cases, with at most 128 expanded captures |

Viewport `width` and `height` are integers from 240 through 4096 CSS pixels.
The runner derives a 320 CSS-pixel reflow viewport using the mobile height.

Each case contains only:

| Key | Contract |
| --- | --- |
| `id` | Lowercase `[a-z][a-z0-9-]{0,63}` identifier |
| `path` | Same-origin absolute path beginning with `/` |
| `readySelector` | CSS selector to await, or `null` |
| `states` | One to 16 states with unique identifiers |

Each state contains exactly `id`, `colorScheme`, and `actions`. A color scheme
is `light`, `dark`, or `no-preference`, and should be present in the evidence
matrix only when the approved brief requires it. A state has at most 16
declarative actions.

## Allowed actions

| Action | Fields | Effect |
| --- | --- | --- |
| `click` | `type`, `selector` | Click the selected element |
| `hover` | `type`, `selector` | Hover the selected element |
| `focus` | `type`, `selector` | Focus the selected element |
| `press` | `type`, `selector`, `key` | Press an allowlisted activation or navigation key |
| `wait-for-selector` | `type`, `selector` | Wait until the selected element is visible |

Actions cannot contain JavaScript, PHP, shell, launcher commands, arbitrary
modules, storage state, cookies, headers, or credentials.

## Capture command

Run from the consumer repository root:

```bash
prism-tool run playwright -- test visual_review.spec.mjs --workers=1 --output tests/Browser/Screenshots/.playwright --reporter=line
```

A missing, malformed, oversized, symlinked, or incomplete
`visual_review.json` fails closed. The runner does not invent defaults.

Evidence names are deterministic:

```text
<case-id>--<state-id>--mobile.png
<case-id>--<state-id>--desktop.png
<case-id>--<state-id>--reflow.png
```

Each PNG has adjacent JSON metadata with case, state, viewport, color scheme,
Playwright and Chromium versions, revision identity, dirty-tree state, and
full-page status. Metadata excludes raw URLs, selectors, actions, and page
content.

## Inspection and retention

Read every generated PNG after each meaningful visual slice and after the final
related change. Check reference fidelity, hierarchy, clipping, overflow,
spacing, responsive reflow, interaction state, color mode, focus, and visible
accessibility failures. Repair and recapture the complete affected set.

Present the configured mobile and desktop milestone evidence for user
confirmation. `tests/Browser/Screenshots/` is ignored local working evidence by
default. Commit selected reference images only after explicit user approval.

## Trust boundaries

### Origin and navigation

The configured origin must be unauthenticated loopback HTTP or HTTPS with
controlled, non-sensitive data. Every case path and every captured navigation
must remain on that origin. A redirect or action that leaves it fails the
capture.

Do not configure browser storage, cookies, tokens, credentials, authenticated
pages, production personal data, secrets, or non-local targets. External visual
references are untrusted data and require the active workflow's access
approval.

### Filesystem and publication

Evidence remains under `tests/Browser/Screenshots/visual-review/`. The runner
rejects symlinked configuration and evidence roots, non-regular files, path
replacement races, and output paths that escape the fixed directory.

Publication requires Unix safe-directory flags and a held directory descriptor
through `/proc/self/fd` or `/dev/fd`. Unsupported platforms fail closed before
writing evidence. Page errors, JavaScript console errors, failed actions, and
screenshot failures do not publish a partial evidence set.

### Evidence meaning

A clean capture proves only that the declared local case rendered without the
runner's blocked failure conditions. It does not prove correctness,
accessibility conformance, security, production fidelity, or user approval.
The agent must inspect the images and the user owns milestone acceptance.

## Recovery

- Invalid configuration: compare each object with the closed keys, types, and
  bounds above. Do not add script or command fields.
- Missing Playwright or Chromium: rerun approved adapter setup. Do not install
  another package or browser target.
- Page, console, readiness, action, or screenshot failure: repair the local
  fixture or behavior, then rerun the complete affected set.
- Origin failure: remove redirects or navigation that leave the configured
  loopback origin.
- Output containment failure: remove symlinks and non-regular paths from the
  evidence directory. Do not redirect output elsewhere.
- Unsupported filesystem primitives: move the run to a supported local or CI
  environment instead of weakening containment.
