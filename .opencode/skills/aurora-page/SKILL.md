---
name: aurora-page
description: Use when creating a new PHP page. Provides the standard Aurora Framework page template with RCS header, htmlHeader/htmlFooter pattern, DNS prefetch, CSS/JS registration, and required includes.
---

## Aurora Standard Page Template

New PHP pages follow this exact structure. Replace `<app>`, `<domain>`, and page-specific
values:

```php
<?php
# $KYAULabs: index.php,v 1.0.0 YYYY/MM/DD hh:mm:ss -0700 kyau Exp $

$rus = getrusage();
require_once(__DIR__ . "/../aurora/aurora.inc.php");

$site = new KYAULabs\Aurora("index.html", "/cdn", true, true);
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

// vim: ft=php sts=4 sw=4 ts=4 et :
```

## Aurora Key Facts

- Repository: `kyaulabs/aurora` (git submodule at `aurora/`)
- Entry point: `require_once(__DIR__ . "/../aurora/aurora.inc.php")`
- Main class: `KYAULabs\Aurora`
- Provides: HTML header/footer templating, SRI, resource preloading, SQL handler, performance statistics
- `$rus = getrusage()` must be called before the Aurora include — it captures start-of-request resource usage for the performance footer

## Aurora Constructor Parameters

```php
new KYAULabs\Aurora(string $template, string $cdnPath, bool $sri, bool $perf)
```

- `$template` — base HTML template name (e.g. `"index.html"`)
- `$cdnPath` — path prefix for CDN assets (e.g. `"/cdn"`)
- `$sri` — enable Subresource Integrity hashes
- `$perf` — enable performance statistics in footer
