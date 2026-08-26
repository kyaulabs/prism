# Browser Visual Tooling Inventory

Research for [Inventory reusable Chromium tooling and provisioning](https://github.com/kyaulabs/prism/issues/414).

## Exploration: existing browser automation, acquisition, screenshot, server, and artifact mechanisms

**Answer:** The PHP/web `stack adapter` already provisions an exact Playwright `consumer-dev tool` and matching Chromium browser, exposes it through `prism-tool run`, and generates a Pest Browser smoke-test server lifecycle. It does not provide a reusable visual-capture workflow, viewport manifest, screenshot metadata, review checkpoints, comparison support, or consistent generated artifact policy.

## Existing capabilities

- `packages/prism-php-web/toolchain.json:107-120` declares `playwright@1.62.1`, pass-through arguments, a five-minute execution timeout, and Chromium as the sole `browserTargets` value.
- `packages/prism-php-web/scripts/toolchain/transaction.js:158-167` resolves the project-local Playwright executable and installs exactly Chromium during the approved adapter transaction.
- `packages/prism-core/scripts/prism-tool/cli.js:1665-1788` resolves declared adapter tools, enforces the contract, runs consumer-development commands from the project root, and passes bounded arguments and timeouts. The existing launcher can therefore invoke Playwright's screenshot command without a new browser dependency.
- Playwright's installed `screenshot` command supports explicit viewport size or device emulation, full-page capture, color-scheme emulation, selector/time waits, locale, storage state, and Chromium selection.
- `packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js:301-328` generates a reusable local/CI check script that starts a PHP fixture server, waits for readiness, exports `PEST_BROWSER_BASE_URL`, runs Pest, and reliably stops only its own server.
- `packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js:441-470` generates the browser base-URL helper and one Pest Browser smoke test that verifies content, JavaScript errors, and console logs.
- `packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js:368` installs Playwright Chromium in generated CI before the shared quality gate.
- `packages/prism-php-web/skills/pest-browser/SKILL.md:13-53` documents Chromium-only provisioning and keeps functional browser tests limited to critical flows.

## Gaps

- No repository-owned capture command or script accepts a URL/page list and produces deterministic desktop/mobile screenshots.
- No project-owned viewport/state manifest records required widths, heights, color modes, routes, component states, or readiness selectors.
- No standard visual-artifact directory separates transient development captures from approved acceptance evidence.
- No metadata manifest binds a screenshot to route, viewport, browser/tool version, commit, timestamp, and capture settings.
- No workflow defines when the agent must capture, inspect, present, revise, and recapture during frontend implementation.
- No visual comparison or baseline semantics exist; adding pixel-diff regression would be a separate decision and is not required for screenshot review.
- Generated CI runs the functional browser smoke test but does not capture or upload visual-review artifacts.
- `packages/prism-php-web/skills/pest-browser/SKILL.md:28-31` says the template ships a `tests/Browser/Screenshots/` ignore rule, but `packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js:535` omits it from the generated `.gitignore`. The repository root contains the rule, so established and newly bootstrapped project behavior currently diverge.

## Boundary implications

1. Reuse adapter-provisioned Playwright Chromium; no new browser package is needed.
2. Keep functional Pest Browser tests and iterative visual review as separate concerns that share acquisition and server primitives.
3. Save capture scripts, viewport/state configuration, and documentation in the consumer repository so later frontend sessions can reproduce the same evidence.
4. Let the active adapter own generated paths and setup provisioning; Core should remain language-agnostic and only orchestrate generic workflow gates if necessary.
5. Default screenshot evidence can remain ignored/transient, while any committed acceptance evidence must be an explicit project decision rather than an automatic repository mutation.
6. Correct the generated `.gitignore` and add parity tests so the documented screenshot-artifact policy matches scaffold output.

**Uncertainty:** The desired retention policy and exact development checkpoints remain user decisions; the next Wayfinder ticket resolves them.
