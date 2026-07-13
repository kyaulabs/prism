# Build Pipeline

On-demand reference. Not auto-loaded — only `AGENTS.md` and `conventions.md` load every session.

Assets are built **manually** — no watchers, no automatic pipelines.

## SCSS → CSS

Source: `cdn/sass/*.scss`
Output: `cdn/css/*.min.css` (GENERATED — never edit directly)

```bash
sass --style=compressed cdn/sass/source.scss cdn/css/output.min.css
```

## JavaScript → Minified

Source: `cdn/js/*.js`
Output: `cdn/javascript/*.min.js` (GENERATED — never edit directly)

```bash
uglifyjs cdn/js/source.js -o cdn/javascript/output.min.js -c -m
```

## Post-Deploy

After `git pull` on production:

1. Clear PHP opcache
2. If `cdn/sass/` source changed → rebuild CSS
3. If `cdn/js/` source changed → rebuild JS

## Rules

- Never commit changes to `cdn/css/*.min.css` or `cdn/javascript/*.min.js` directly
- Always rebuild from source after any SCSS or JS change
- These files ARE committed to the repo (they serve from cdn.<domain>)
