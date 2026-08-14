---
name: pest-browser
description: Use when writing browser tests with Pest 5. Covers plugin installation, Playwright setup, global config, CI workflow additions, and test examples. Reserve browser tests for critical UI flows only.
---

## When to Use Browser Tests

Reserve for critical UI flows only: login, checkout, critical forms.
Not for every page. Unit and Feature tests cover everything else.

## Installation

Adapter dependencies are provisioned through the toolchain contract, never
by hand-run Composer/npm commands. Run `prism-tool setup` (after the
registry and mutation approvals) to add Pest 5, the browser plugin, and
Playwright at their exact contract versions. Then install only the matching
Chromium build through the launcher:

```bash
prism-tool run playwright -- install chromium
```

The contract's `browserTargets` is exactly `["chromium"]`; no other browser
is installed. After changing a dependency version, commit each manifest with
its regenerated lockfile: `composer.json` with `composer.lock`, and
`package.json` with `package-lock.json`.

Verify `.gitignore` includes:
```text
tests/Browser/Screenshots/
```
(The template ships with this entry already present.)

## Global Config (`tests/Pest.php`)

```php
pest()->browser()->timeout(10000);
// pest()->browser()->headed(); // uncomment locally for visual debugging
```

## CI Setup (GitHub Actions)

Add to your workflow before the Pest run step:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: lts/*
- name: Install JS dependencies
  run: npm ci
- name: Install Playwright Chromium
  run: prism-tool run playwright -- install chromium
```

## Browser Test Examples

```php
it('loads the homepage without JS errors', function () {
    $page = visit('/');
    $page->assertSee('Expected Heading')
         ->assertNoJavaScriptErrors()
         ->assertNoConsoleLogs();
});

it('loads all public pages without smoke', function () {
    $pages = visit(['/', '/about', '/contact']);
    $pages->assertNoSmoke();
});
```

## Run in Debug / Headed Mode

```bash
prism-tool run pest -- --debug
```
