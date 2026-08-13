---
description: Drive post-pull production deployment — conditional asset rebuild, opcache clear, and log tail. Prints commands for the remote host; runs nothing destructive automatically.
---

Production deployment after a `git pull` on the server. Follows the
post-deploy steps below.

## 1. Identify the app and domain

From `AGENTS.md`:

- App name: the public webroot directory name (`<app>/`).
- Domain: derived from `<app>.<domain>`.
- Web root: `/nginx/https/<domain>/www` (symlinked from `/nginx/git/<app>/`).
- Logs: `/nginx/logs/<domain>/`.

Confirm the app name and domain with the user before running anything.

## 2. Detect what changed

```bash
git log --oneline -10
git diff --name-only HEAD~10..HEAD
```

Classify the changes:

- SCSS source changed (`cdn/sass/`) → rebuild CSS.
- JS source changed (`cdn/js/`) → rebuild JS.
- PHP changed → clear opcache.
- Schema/migration files changed → flag for manual DB migration (do not run
  automatically; see the `database` skill).
- `.env.example` changed → flag for manual `.env` sync.

## 3. Rebuild assets (only if source changed)

```bash
sass --style=compressed cdn/sass/source.scss cdn/css/output.min.css
uglifyjs cdn/js/source.js -o cdn/javascript/output.min.js -c -m
```

Only run the line for the source type that actually changed. Report which
outputs were rebuilt.

## 4. Clear opcache

Only if PHP files changed:

```bash
php -r 'if (function_exists("opcache_reset")) { opcache_reset(); echo "opcache cleared\n"; } else { echo "opcache not available\n"; }'
```

For a multi-PHP-FPM setup, clear via the FPM pool rather than the CLI (CLI
opcache and FPM opcache are separate). The canonical server-side reset is:

```bash
cachetool opcache:reset --fcgi=/run/php/php8.5-fpm.sock
```

This requires `cachetool` installed on the production host. Download and
verify the specific release:

```bash
CACHETOOL_VERSION="10.0.0"
CACHETOOL_SHA256="cbe90e7acdde7beafe26b592a753c2b923a99d2033e073dc55e42fba2883bd1d"
curl -sOL "https://github.com/gordalina/cachetool/releases/download/${CACHETOOL_VERSION}/cachetool.phar"
echo "${CACHETOOL_SHA256}  cachetool.phar" | sha256sum -c -
```

If `cachetool` is unavailable, reload the FPM pool as a fallback:

```bash
systemctl reload php8.5-fpm
```

## 5. Smoke check

- Tail the PHP and nginx error logs for the domain and watch for new entries:

```bash
tail -50 /nginx/logs/<domain>/php.log
tail -50 "/nginx/logs/<domain>/error-<app>_<domain>.log"
```

- Hit the homepage and confirm a 200:

```bash
curl -sI https://<app>.<domain>/ | head -1
```

## Rules

- Never run database migrations automatically. If schema files changed, flag
  them and stop for manual review (see the `database` skill).
- Never edit `.env` from this command — only flag if `.env.example` changed.
- Prefer printing commands for confirmation before running destructive ops.
- If running on the production host directly, confirm the domain/app before any
  write.
- If opcache reset fails, report it — do not attempt alternative resets without
  confirmation.
