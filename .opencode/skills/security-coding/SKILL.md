---
name: security-coding
description: Use when writing or reviewing PHP that handles user input, sessions, auth, cookies, or SQL in this no-framework stack. Covers parameterized SQL, CSRF tokens, XSS output escaping, password hashing, session hardening, and input validation. Detection lives in the @semgrep agent; this skill is the defensive-coding guidance that prevents the findings.
---

This project has **no framework** — there is no ORM, no CSRF middleware, no
templating engine, no router. Every defensive control below must be applied by
hand. The `@semgrep` agent detects failures; this skill prevents them.

## SQL — parameterized, always

Never interpolate user data into a query string. Use Aurora's SQL handler or
PDO with bound parameters.

```php
// GOOD
$db->execute("SELECT id FROM users WHERE email = ?", [$email]);

// BAD — SQL injection
$db->query("SELECT id FROM users WHERE email = '" . $email . "'");
```

- Whitelist column/table names if they must be dynamic — never bind them from
  user input.
- `LIKE` wildcards (`%`, `_`) in user input must be escaped with
  `addcslashes($s, '%_')` before binding.

## XSS — escape on output

Escape for the **context** you're emitting into. Escaping happens at output
time, not input time.

- HTML body / attribute: `htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8')`
- JavaScript string: encode with `json_encode($s)` (never hand-roll)
- URL: `rawurlencode($s)`
- CSS: avoid putting user data in CSS; if unavoidable, hex-escape.

Never use `echo $userData` unescaped. If you must render trusted HTML, route
it through an explicit allowlist sanitizer and note the exception.

## CSRF — tokens on every state-changing request

- Every POST/PUT/DELETE form includes a CSRF token rendered as a hidden input.
- Token is session-scoped, generated **once per session** with `random_bytes()`
  (regenerating on every load breaks multi-tab forms — both tabs must share one
  token, or tab A's token is invalidated when tab B loads).
- Validate with `hash_equals()` (constant-time) on the server before any state
  change; never compare secrets with `==` or `===`.
- On mismatch, reject with 419 and do not reveal whether the session exists.
- Same-origin via `SameSite` cookies is a complement, not a replacement.

```php
// Generate once per session — reuse across requests so multiple tabs share
// one token (regenerating every load invalidates tab A after tab B loads).
if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

// Render into the form, escaped for the HTML attribute context:
// <input type="hidden" name="csrf" value="<?= htmlspecialchars($_SESSION['csrf'], ENT_QUOTES | ENT_HTML5, 'UTF-8') ?>">

// Validate on POST with constant-time comparison:
if (!hash_equals($_SESSION['csrf'] ?? '', $_POST['csrf'] ?? '')) {
    http_response_code(419);
    exit;
}
```

## Passwords — hash, never store plaintext

- Hash with `password_hash($pw, PASSWORD_DEFAULT)` (bcrypt/argon2id).
- Verify with `password_verify($pw, $hash)`.
- Never roll your own crypto. Never MD5/SHA1 a password.
- Reset tokens: `random_bytes(32)`, single-use, short TTL, invalidated on
  login.

## Session hardening

- `session.cookie_httponly = 1`, `session.cookie_samesite = "Lax"` (or
  `"Strict"` where feasible), `session.cookie_secure = 1` on HTTPS.
- Regenerate the session ID on privilege change (login, role escalation).
- Set a reasonable idle timeout; garbage-collect expired sessions.
- Never put secrets in the session; store only an identifier.

## Input validation — deny by default

- Validate on the server, every time. Client-side validation is UX only.
- Use a positive allowlist (validate the expected shape), not a denylist.
- Fail closed: on invalid input, reject and log — do not sanitize-and-proceed.
- Bounds-check integers, length-check strings, allowlist enums.

```php
$id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);
if ($id === false || $id < 1) {
    http_response_code(400);
    exit;
}
```

## File & command safety

- Never pass user input to `include`/`require`/`eval`/`exec`/`shell_exec`/
  `system`/`passthru` or backticks.
- File uploads: validate MIME and extension against an allowlist, generate a
  random stored filename, store outside the webroot, never execute uploaded
  content.
- `unserialize()` on untrusted data is forbidden — use `json_decode`.

## Headers

Send security headers on every response (via Aurora or nginx):

- `Content-Security-Policy` — restricts script/style/image sources.
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (or CSP `frame-ancestors`)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security` on HTTPS

### CSP and Aurora

Aurora emits **only external** `<script src>` tags with SRI hashes
(`integrity="sha512-..."` + `crossorigin="anonymous"`). No inline scripts
are emitted. The canonical CSP for every Aurora page is:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
```

- `'unsafe-inline'` is forbidden in production.
- No nonce is required today — Aurora's output is already strict-CSP-compatible.
- If a future feature requires inline scripts, implement a per-request
  nonce in Aurora (generate a random nonce, emit it on the `<script>` tag, and
  reflect it in `script-src 'nonce-<value>'`). See ADR-0001.

Cross-ref: `frontend-architecture` skill — CSP-friendly script rules for
page authors (inline scripts forbidden, SRI on external scripts).

## Secrets

- Never hardcode credentials. Load from environment or a non-web-root config.
- `.env` is gitignored — use `.env.example` only (see `AGENTS.md`).
- Never log secrets, tokens, or password hashes.

## Known sharp edges

These are documented footguns in first-party code that have caused production
incidents. The patterns below are unsafe and must not be used. Detection is
split between Semgrep rules (`.semgrep/kyaulabs.yml`) and Pest tests.

### Aurora constructor positional bools

```php
// DON'T — positional bools are ambiguous. Which is $status? Which is $html?
$site = new KYAULabs\Aurora("index.html", "/cdn", true, true);
// FIXED — named arguments make the dangerous $status param explicit
$site = new KYAULabs\Aurora(template: "index.html", cdn: "/cdn", status: env_bool('APP_DEBUG'), html: true);
```

- `$status=true` leaks stack traces, absolute paths, and SQL fragments to
  visitors on an unhandled error.
- Always use named arguments. Never use positional `true`/`false` for `$status`
  and `$html`.
- Detected by: `kyaulabs-aurora-status-true-literal` Semgrep rule + Pest
  `AuroraConstructorStatusTest.php`. See ADR-0002.

### Aurora constructor `display_errors` — canonical source

Aurora's constructor sets safe defaults (`display_errors='0'`,
`display_startup_errors='0'`, `html_errors='0'`) **before** the
`if ($status)` gate, and validation that throws `AuroraException` runs
**after** both — so `display_errors` stays `'0'` when `$status=false`.
There is no upstream bug. The canonical statement with file:line citation
lives in the `aurora-page` skill (Gotchas → "Constructor safe-defaults
order"); do not duplicate it here.

- Application code must never call `ini_set('display_errors', '1')`
  directly — detected by `kyaulabs-hardcoded-display-errors-on`.
- Deploy only with the template file and CDN directory confirmed present
  to avoid `AuroraException` during initialization.

## Suppressing findings

The `@semgrep` agent may flag patterns that are genuinely safe in context
(false positives). Suppress inline with a mandatory justification:

```php
// nosemgrep: <rule-id> -- <one-line justification>
```

- `rule-id` is required — bare `// nosemgrep` is forbidden (it silences all
  rules at that line).
- Justification is auditable and committed alongside the code. "I think it's
  fine" is not a valid justification; explain *why* the pattern is safe.
- Suppressions are re-reviewed when the named rule is updated — the
  `/security` command logs extant suppressions in its report.
- See the `/security` command for the full adjudication protocol.

## Cross-refs

- `@semgrep` agent — detects violations of the above.
- `audit-deps` skill — scans Composer/npm for known CVEs.
- `database` skill — schema and SQL style (this skill covers injection).
- `.opencode/docs/mocking.md` — boundary design for testable security code.
