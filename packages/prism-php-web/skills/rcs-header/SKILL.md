---
name: rcs-header
description: Use when creating or modifying any source file. Provides the required RCS-style header format, vim modeline, and PHPDoc conventions.
---

## RCS-Style Header (REQUIRED on every source file)

Every source file must carry an RCS-style header. The pre-commit hook
(`.github/hooks/pre-commit`) is an idempotent normalizer: on every commit it
strips and re-inserts a canonical header using the committer's identity and the
commit date, plus the vim modeline (see ADR-0041). Authors never hand-edit the
header — the hook manages it.

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

- `creator@host` — `git config user.email` username @ `hostname`, refreshed by the hook on every commit.
- `YYYY/MM/DD ±TZ` — commit date and timezone offset, refreshed by the hook on every commit (last-commit marker, not creation date; provenance is in git history).

The header is a provenance marker managed by the pre-commit hook, analogous to a
`Signed-off-by` trailer at the file level. Version and modification history are
tracked by git; the in-file date reflects the last commit that touched the file.
Do not hand-edit the header — the normalizer overwrites manual changes on the
next commit (see ADR-0041).

### Placement

- **PHP**: after `<?php` and optional `declare(strict_types=1);`, before code.
  - Ordering is enforced by `tests/Unit/Harness/RcsHeaderConventionTest.php`.
- **SCSS/JS/TS**: first line of the file.
- **Bash**: after the shebang line (`#!/usr/bin/env bash`), before code.

### Automation

The `.github/hooks/pre-commit` hook is a strip-then-insert idempotent normalizer
(ADR-0041). For every staged source file it strips all existing `$KYAULabs:`
headers and `vim: ft=` modelines, rebuilds the file with exactly one canonical
header (committer identity + commit date) and one modeline, and re-stages if the
content changed. A placeholder guard blocks commits containing literal
`creator@host` or `YYYY/MM/DD` template text. Run
`bash "$(prism-tool resolve scripts)/install-hooks.sh"` once after cloning to activate it.

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

The "no explanatory comments" policy is owned by `AGENTS.md` (Commenting section) and
`packages/prism-php-web/docs/conventions.md` (PHP Standards). Refer to those authoritative sources.

## Gotchas

- *Header date changes on every commit* — the hook's normalizer refreshes the
  `$KYAULabs:` date to the commit date. This is not a bug; the header is a
  last-commit marker (ADR-0041), not a creation stamp. Creation provenance lives
  in git history.
