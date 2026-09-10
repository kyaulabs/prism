---
name: pest-browser
description: Use for PHP browser tests with Pest and Playwright through native project tools.
---

# Pest Browser Tests

Use project-local Composer Pest and npm Playwright tooling. Install Chromium
with `node_modules/.bin/playwright install chromium` when needed. Follow
`setup-php-web` for missing project tools; there is no global readiness gate.

Run `vendor/bin/pest` against a test-only application server. Reuse an existing
project fixture when available. Start an owned process on an available loopback
port, set `PEST_BROWSER_BASE_URL`, wait for readiness, and stop only that process
on completion or failure. Do not use production credentials or data.

Write behavior-focused browser tests, assert user-visible results, and avoid
fixed sleeps. Capture screenshots or traces only when useful; redact sensitive
content. Report missing browser dependencies instead of claiming tests passed.
