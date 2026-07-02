---
name: pest-browser
description: Use when writing browser tests with Pest v4. Covers plugin installation, Playwright setup, global config, CI workflow additions, and test examples. Reserve browser tests for critical UI flows only.
---

## When to Use Browser Tests

Reserve for critical UI flows only: login, checkout, critical forms.
Not for every page. Unit and Feature tests cover everything else.

## Installation

```bash
composer require pestphp/pest-plugin-browser --dev
npm install playwright@latest
npx playwright install
```

Add to `.gitignore`:
```text
tests/Browser/Screenshots/
```

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
- name: Install Playwright browsers
  run: npx playwright install --with-deps
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
php vendor/bin/pest --debug
```
