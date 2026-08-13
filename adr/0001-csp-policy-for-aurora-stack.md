# 0001. CSP Policy for the Aurora Stack

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-04

## Status

Accepted

## Context

Two skills give contradictory guidance on Content Security Policy:

- `security-coding` mandates a `Content-Security-Policy` header but does not
  specify the policy (only a one-line reminder that CSP exists).
- `frontend-architecture` forbids inline `<script>` tags "outside the
  controlled header/footer emitted by Aurora" — implying Aurora might emit
  inline scripts, which would collide with a strict CSP.

Inspecting Aurora's code (`aurora/aurora.inc.php:247-294`) reveals that
Aurora emits **only** external `<script src>` tags with SRI hashes
(`integrity="sha512-..."` + `crossorigin="anonymous"`). The `comment()`
method (`:439-444`) emits an HTML comment, not JavaScript. No inline scripts,
event handlers, or `eval`-style patterns exist in Aurora's output.

The gap is a documentation gap: neither skill states the canonical CSP, so
the first implementer must reverse-engineer Aurora's output to write one,
risking either an over-permissive policy or a broken site.

## Decision

We adopt a strict CSP as the canonical default for every Aurora page:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
```

- `script-src 'self'` — Aurora's external script tags with SRI hashes pass
  cleanly. No `'unsafe-inline'`, no `'unsafe-eval'`.
- `object-src 'none'` — blocks legacy plugin vectors.
- `base-uri 'self'` — prevents base-tag injection.
- `frame-ancestors 'none'` — replaces `X-Frame-Options: DENY` at the CSP
  level (the `X-Frame-Options` header remains as a fallback for older
  browsers).

**`'unsafe-inline'` is forbidden in production.** There is no valid reason
for inline scripts in this stack: Aurora handles all script emission, and
pages register scripts declaratively via `$site->js`.

**Nonce escape hatch (for the future).** If a future feature requires inline
script content (e.g., a JSON configuration blob), Aurora SHOULD generate a
per-request cryptographically-random nonce, emit it on the inline `<script>`
tag (`<script nonce="...">`), and reflect it in the CSP header
(`script-src 'self' 'nonce-<value>'`). Hash-based allowlisting is acceptable
only for fully-static inline scripts, but is discouraged — nonce is the
preferred mechanism for dynamic content.

## Consequences

- **Easier:** every new Aurora project starts with a strict CSP; no
  `'unsafe-inline'` drift; external scripts with SRI are already compatible.
- **Harder:** if inline scripts are ever needed (a new Aurora feature or a
  third-party integration that requires them), a nonce implementation in
  Aurora is required upfront. No shortcut via `'unsafe-inline'`.
- **Follow-up:** implement the nonce mechanism in Aurora (`aurora/`
  submodule) if inline script emission is ever added.

## Alternatives Considered

- **`'unsafe-inline'`** — defeats the XSS protection value of CSP. Rejected.
- **Hash-based allowlisting** — works for static inline scripts but does not
  cover dynamic inline content (the most likely Aurora scenario). Rejected as
  the primary mechanism; acceptable as a secondary option for known-static
  snippets.
- **Per-request nonce today** — overengineered for current needs (Aurora
  emits no inline content). Rejected as unnecessary complexity; documented
  above as the escape hatch when needed.
