---
name: aurora-page
description: Use when creating a new PHP page. Provides the standard Aurora Framework page template with RCS header, htmlHeader/htmlFooter pattern, DNS prefetch, CSS/JS registration, and required includes.
---

## Before Generating

Verify the Aurora submodule is present. If `aurora/aurora.inc.php` does not exist, output
this error and **stop** — do not generate any code:

```text
✗ Aurora submodule is missing.

Fix:
  git submodule add https://github.com/kyaulabs/aurora aurora
  git submodule update --init
```

## Aurora Standard Page Template

New PHP pages follow this exact structure. Replace `<app>`, `<domain>`, and page-specific
values:

```php
<?php
# $KYAULabs: index.php kyau@host YYYY/MM/DD -0700 Exp $

$rus = getrusage();
require_once(__DIR__ . "/../aurora/aurora.inc.php");
require_once(__DIR__ . "/../backend/env.php");
load_env(__DIR__ . '/../.env');

$site = new KYAULabs\Aurora(template: "index.html", cdn: "/cdn", status: env_bool('APP_DEBUG'), html: true);
$site->title = "Page Title";
$site->description = "Page description for search engines.";
$site->dns = ["cdn.<domain>"];
$site->css = [ 'css/site.min.css' => '//cdn.<domain>/css/site.min.css' ];
$site->js = [ 'javascript/site.min.js' => '//cdn.<domain>/javascript/site.min.js' ];
$site->preload = [
    '/css/site.min.css' => 'style',
    '/javascript/site.min.js' => 'script',
];
$site->htmlHeader();
// page content here
$site->htmlFooter();
echo $site->comment($rus, basename(__FILE__));

// vim: ft=php sts=4 sw=4 ts=4 et :
```

## Aurora Key Facts

- Repository: `kyaulabs/aurora` (git submodule at `aurora/`)
- Entry point: `require_once(__DIR__ . "/../aurora/aurora.inc.php")`
- Main class: `KYAULabs\Aurora`
- Provides: HTML header/footer templating, unconditional SRI hashes, resource preloading, SQL handler, performance statistics via `comment()`
- `$rus = getrusage()` must be called before the Aurora include — it captures start-of-request resource usage for the `comment()` performance footer

## Aurora Constructor Parameters

```php
new KYAULabs\Aurora(?string $template = null, ?string $cdn = '/cdn', bool $status = false, bool $html = false, ?string $templateDir = null)
```

- `$template` — base HTML template name (e.g. `"index.html"`)
- `$cdn` — CDN directory path (e.g. `"/cdn"`)
- `$status` — **debug mode**: enables `display_errors`, `display_startup_errors`, `E_ALL` reporting, and `html_errors`. Must be `false` in production. Wire to `env_bool('APP_DEBUG')`.
- `$html` — **HTML output mode**: sets `mb_http_output('UTF-8')` and sends `Content-Type: text/html; charset=UTF-8` header
- `$templateDir` — optional custom template overlay directory (checked first; falls back to Aurora's default `html/` directory)

**Always use named arguments** at the call site. The constructor has positional
bool parameters (`$status`, `$html`) that are a documented sharp edge — a call
using bare `true, true` is ambiguous and has caused production incidents where
error display was accidentally enabled. Named arguments make the dangerous
`$status` parameter explicit and self-documenting. PHP 8.0+ is required; no
API change to Aurora is needed.

## Gotchas

- *Using `$status = true` in production* — enables full error display with
  stack traces, absolute paths, and SQL fragments rendered to any visitor on
  an unhandled error. Always use `env_bool('APP_DEBUG')` for
  the `$status` parameter. `APP_DEBUG` must be `false` in `.env` for
  production deployments.
- *Constructor safe-defaults order* — Aurora's constructor sets
  `display_errors='0'`, `display_startup_errors='0'`, and `html_errors='0'`
  before any validation that may throw. Only then does it apply the
  `if ($status)` gate to enable verbose display. Validation that throws
  `AuroraException` (missing template, bad CDN directory) runs after both
  the safe defaults and the gate, so `display_errors` stays `'0'` when
  `$status=false`. The `exceptionHandler` checks `ini_get('display_errors')`
  and routes to `error_log()` in production mode, never echoing error
  details to the visitor. This is the canonical statement of Aurora's
  `display_errors` behavior; other skills cross-reference it rather than
  duplicating. Source: `aurora/aurora.inc.php` `__construct()` — safe
  defaults (lines 67-70) → `if ($status)` gate (lines 73-78) → validation
  that throws (line 84+); pinned at submodule commit `7a00fc4`.
- *SRI is unconditional in Aurora* — the constructor has no SRI toggle.
  `htmlStyles()`, `htmlScripts()`, and `htmlPreload()` always emit
  `integrity="sha512-..."` attributes regardless of constructor arguments.
- *`$rus` without `comment()`* — `$rus = getrusage()` captures
  start-of-request resource usage but only produces visible output when
  paired with `$site->comment($rus, basename(__FILE__))`. Both must be
  present in the page template for the performance footer to render.
- *`load_env()` must be called explicitly* — `.env` is not loaded
  automatically. The page template calls `load_env(__DIR__ . '/../.env')`
  after the `require_once` for `backend/env.php`. If debug mode isn't
  activating, verify that: (a) `.env` exists at the expected path, (b)
  `load_env()` is called before `env_bool('APP_DEBUG')`, and (c) the file
  format follows KEY=VALUE with no shell-style `export` prefix.
- *Absent `.env` is silent* — `load_env()` returns void and produces no
  warning if the file is missing. This is by design for production safety.
  If `env_bool('APP_DEBUG')` returns false unexpectedly, check whether `.env`
  exists and is readable.
