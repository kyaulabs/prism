---
name: rcs-header
description: Use when creating or modifying any source file. Provides the required RCS-style header format, version bump rules, and vim modeline for all file types (PHP, SCSS, JS, Bash).
---

## RCS-Style Header (REQUIRED on every source file)

Every source file must begin with an RCS-style identifier. Update the version and date
on every modification.

```text
PHP:  <?php # $KYAULabs: filename.php,v 1.0.0 YYYY/MM/DD hh:mm:ss -0700 kyau Exp $
SCSS: // $KYAULabs: filename.scss,v 1.0.0 YYYY/MM/DD hh:mm:ss -0700 kyau Exp $
JS:   // $KYAULabs: filename.js,v 1.0.0 YYYY/MM/DD hh:mm:ss -0700 kyau Exp $
Bash: # $KYAULabs: filename.sh,v 1.0.0 YYYY/MM/DD hh:mm:ss -0700 kyau Exp $
```

Use the actual filename (not a path). Use the current date and time in the format shown.
Start new files at version `1.0.0`. Increment the patch version on each modification.

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

## No explanatory comments

Do not add inline comments explaining what the code does unless explicitly requested.
Code should be self-documenting through naming. Comments are for *why*, not *what*.
