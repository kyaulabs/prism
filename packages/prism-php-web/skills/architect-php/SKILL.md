---
name: architect-php
description: Use alongside the core architect skill when evaluating a PHP/Aurora web change. Adds the Aurora submodule and PHP/web stack boundaries from php-web-stack.
compatibility: "PHP 8.5+, Aurora framework, MariaDB, nginx"
---

# PHP/Web Architect Addendum

Load the core `architect` skill first and follow its full read-only evaluation
protocol and `ADR-required:` output contract. Then load `php-web-stack` before
reading the source files the proposed change would touch.

## Adapter boundary check

Apply the stack, production environment, no-MVC architecture, and directory
structure from `php-web-stack` when answering the core review's boundary
questions.

Answer this PHP/Aurora-specific form explicitly:

**Within boundaries?** Does it touch something outside the project's ownership
(external API, the Aurora submodule, a system boundary)? If so, is that flagged
and is the boundary interface designed for it?

## Rules

- This addendum does not replace the core `architect` skill.
- Never edit, write, or stage files. This is a read-only review.
- Treat a proposed Aurora submodule change as cross-boundary work.

## Gotchas

- *Reviewing without `php-web-stack`* — the core architecture checks remain
  valid, but the PHP/web boundaries and production topology may be missing.
