---
name: rcs-header
description: Use when creating or modifying any source file. Provides the required RCS-style header format, vim modeline, and PHPDoc conventions.
---

## RCS-Style Header (REQUIRED on every source file)

Every source file must begin with an RCS-style creation stamp. Write it once when
the file is first created. Never update it. The pre-commit hook auto-adds the
header if you miss one.

Applies to **source files only**: `.php`, `.js`, `.scss`, `.sh`. Markdown, JSON,
YAML, and other non-source files do not carry RCS headers.

```text
PHP:  <?php # $KYAULabs: filename.php creator@host YYYY/MM/DD ±TZ Exp $
SCSS: // $KYAULabs: filename.scss creator@host YYYY/MM/DD ±TZ Exp $
JS:   // $KYAULabs: filename.js creator@host YYYY/MM/DD ±TZ Exp $
Bash: # $KYAULabs: filename.sh creator@host YYYY/MM/DD ±TZ Exp $
```

Use the actual filename (not a path). The fields are:

- `creator@host` — `git config user.name`@`hostname` at creation time.
- `YYYY/MM/DD ±TZ` — creation date and system timezone offset.

The header is a one-time creation marker, like a `Signed-off-by` trailer at the
file level. Version and modification history are tracked by git. Do not bump the
version, update the timestamp, or otherwise modify the header after creation.

### Placement

- **PHP**: after `<?php` and optional `declare(strict_types=1);`, before code.
- **SCSS/JS**: first line of the file.
- **Bash**: after the shebang line (`#!/usr/bin/env bash`), before code.

### Automation

The `.github/hooks/pre-commit` hook checks staged source files. If a file is
missing an RCS header, the hook inserts one automatically. Run
`bash .github/scripts/install-hooks.sh` once after cloning to activate it.

## Vim Modeline (REQUIRED at end of every source file)

```text
PHP:  // vim: ft=php sts=4 sw=4 ts=4 et :
SCSS: // vim: ft=scss sts=2 sw=2 ts=2 et :
JS:   // vim: ft=javascript sts=4 sw=4 ts=4 noet :
Bash: # vim: ft=sh sts=4 sw=4 ts=4 et :
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

The "no explanatory comments" policy is owned by `AGENTS.md` (Commenting section) and
`.opencode/docs/conventions.md` (PHP Standards). Refer to those authoritative sources.
