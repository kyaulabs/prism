---
name: rcs-header
description: Use when creating or modifying any source file. Provides the required RCS-style header format, vim modeline, and PHPDoc conventions.
---

## RCS-Style Header (REQUIRED on every source file)

Every source file must carry an RCS-style header when this module convention
applies. The author or agent maintains the header and vim modeline during
authorized source edits. The repository's pre-commit hook scans and lints staged
content; it does not normalize or restage source.

Applies to **source files only**: `.php`, `.js`, `.scss`, `.sh`, `.ts`. Markdown, JSON,
YAML, and other non-source files do not carry RCS headers.

```text
PHP:  <?php # $KYAULabs: filename.php creator@host YYYY/MM/DD ±TZ Exp $
SCSS: // $KYAULabs: filename.scss creator@host YYYY/MM/DD ±TZ Exp $
JS:   // $KYAULabs: filename.js creator@host YYYY/MM/DD ±TZ Exp $
Bash: # $KYAULabs: filename.sh creator@host YYYY/MM/DD ±TZ Exp $
TS:   // $KYAULabs: filename.ts creator@host YYYY/MM/DD ±TZ Exp $
```

Use the actual filename (not a path). The fields are:

- `creator@host` — real project identity, using the `git config user.email`
  username and actual `hostname` unless the project specifies otherwise.
- `YYYY/MM/DD ±TZ` — actual edit date and timezone offset, maintained by the
  author or agent when editing the source, not an automatic commit-date marker.

The header is an edit-time provenance marker. Git records version and
modification history; the header does not prove the date of the last commit.
Maintain applicable metadata without unrelated header churn or invented values.

### Placement

- **PHP**: after `<?php` and optional `declare(strict_types=1);`, before code.
- **SCSS/JS/TS**: first line of the file.
- **Bash**: after the shebang line (`#!/usr/bin/env bash`), before code.

### Automation

Maintain headers while editing source when this convention applies to the
project. Do not use hooks that rewrite and restage files: they can destroy
partial staging or change already-verified content. Project instructions may
override these module defaults. Never insert placeholder identities or dates.

## Vim Modeline (REQUIRED at end of every source file)

```text
PHP:  // vim: ft=php sts=4 sw=4 ts=4 et :
SCSS: // vim: ft=scss sts=2 sw=2 ts=2 et :
JS:   // vim: ft=javascript sts=4 sw=4 ts=4 et :
Bash: # vim: ft=sh sts=4 sw=4 ts=4 et :
TS:   // vim: ft=typescript sts=4 sw=4 ts=4 et :
```

The modeline is the very last line of the file, after all code.

## PHPDoc (PSR-5) — Required on all PHP classes, methods, and functions

```php
/**
 * Short one-line description.
 *
 * Longer description if needed.
 *
 * @param  string $email  User email address.
 * @param  string $password  Plain-text password.
 * @return string  Session token.
 * @throws InvalidCredentialsException  If credentials are invalid.
 * @throws InvalidArgumentException    If email is empty.
 */
```

Document all `@param`, `@return`, and `@throws`. Align the descriptions.

The module's inline-comment convention lives in
[PHP conventions](../../docs/conventions.md), under PHP and Aurora.

## Gotchas

- *Expecting automatic updates* — commits do not refresh header identity, date
  or modelines. Maintain them during authorized source edits using real project
  identity and actual dates; project instructions may override module defaults.
