# Visual review tooling

The PHP/web adapter's repository-owned visual review tooling captures
project-authored cases with the declared Playwright dependency and Chromium
browser target. It is separate from Pest Browser functional tests and from
human visual approval.

## Files

- `visual_review.mjs` — closed configuration validation, case expansion,
  allowlisted actions, revision identity, metadata, and output containment.
- `visual_review.spec.mjs` — public headless Chromium capture entry point.
- `visual_review.example.json` — intentionally incomplete project template.
- `visual_review.json` — mutable project-owned active configuration; create it
  from the example after the user approves routes, states, and viewports.

## Configuration

The root object permits exactly these keys:

| Key | Contract |
| --- | --- |
| `schemaVersion` | Integer `1`. |
| `baseUrl` | Loopback HTTP(S) URL without credentials, query, or fragment. |
| `viewports` | Exactly `mobile` and `desktop`, both user-selected. |
| `cases` | One to 64 route cases; expanded evidence is capped at 128 captures. |

A viewport contains exactly integer `width` and `height` values between 240 and
4096 CSS pixels. The runner always derives an additional 320 CSS-pixel reflow
viewport using the selected mobile height.

A case contains exactly:

| Key | Contract |
| --- | --- |
| `id` | Lowercase identifier matching `[a-z][a-z0-9-]{0,63}`. |
| `path` | Same-origin absolute path beginning with `/`. |
| `readySelector` | CSS selector to await, or `null`. |
| `states` | One to 16 uniquely identified states. |

A state contains exactly `id`, `colorScheme`, and `actions`. `colorScheme` is
`light`, `dark`, or `no-preference` only when the user-authored brief requires
that state. `actions` contains at most 16 closed declarative actions.

## Action vocabulary

| Action | Fields | Behavior |
| --- | --- | --- |
| `click` | `type`, `selector` | Click the matched element. |
| `hover` | `type`, `selector` | Hover the matched element. |
| `focus` | `type`, `selector` | Focus the matched element. |
| `press` | `type`, `selector`, `key` | Press an allowlisted navigation or activation key. |
| `wait-for-selector` | `type`, `selector` | Wait until the matched element is visible. |

No action accepts JavaScript, PHP, shell, launcher commands, arbitrary modules,
storage state, cookies, headers, or credentials.

## Capture

Run from the consumer repository root:

```bash
prism-tool run playwright -- test visual_review.spec.mjs --workers=1 --output tests/Browser/Screenshots/.playwright --reporter=line
```

The command requires a valid `visual_review.json`. Missing or incomplete project
decisions fail closed; the tooling does not substitute defaults.

Evidence uses deterministic names:

```text
<case-id>--<state-id>--mobile.png
<case-id>--<state-id>--desktop.png
<case-id>--<state-id>--reflow.png
```

Each PNG has adjacent JSON metadata containing case, state, viewport,
color-scheme, Playwright/Chromium versions, revision identity, dirty-tree state,
and full-page capture status. Metadata omits the raw URL, selectors, actions,
and page content.

## Inspection and retention

Read every PNG after each meaningful visual slice and after the final relevant
change. Repair clipping, overflow, hierarchy, spacing, state, accessibility, or
reference-fidelity failures and recapture the affected set. Present mobile and
desktop milestone evidence for user confirmation.

`tests/Browser/Screenshots/` is local working evidence and ignored by default.
Commit selected reference evidence only after explicit user approval.

## Trust boundary

The default boundary is a loopback origin using controlled non-sensitive
development data. Do not use this workflow for authenticated pages, browser
storage state, cookies, tokens, credentials, production personal data, secrets,
or non-local targets. External references remain untrusted data and require
explicit access permission.

## Recovery

- Invalid configuration: compare every object with the closed keys and bounds
  above; do not add command or script fields.
- Missing Playwright or Chromium: run approved adapter setup; do not install an
  undeclared package or browser target.
- Page, console, readiness, action, or screenshot failure: repair the local
  fixture or project behavior and rerun the complete affected evidence set.
- Output-containment failure: remove symlinks or non-regular paths from the
  screenshot working directory; do not redirect evidence elsewhere.
