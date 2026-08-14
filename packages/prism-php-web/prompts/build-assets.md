---
description: Rebuild minified CSS and JavaScript assets from source files.
---

Rebuild all minified static assets from the SCSS and JavaScript source files.

## 1. Compile SCSS → CSS

Find every `.scss` file in `cdn/sass/` (excluding partials starting with `_`
unless imported by a top-level file). For each top-level source file, compile
to a corresponding `.min.css` in `cdn/css/` using the adapter-owned Dart Sass
through the launcher:

```bash
prism-tool run sass -- --style=compressed cdn/sass/<source>.scss cdn/css/<output>.min.css
```

If no top-level `.scss` files exist (only partials), skip this step and report
"No top-level SCSS sources found."

## 2. Minify JavaScript

Find every `.js` file in `cdn/js/` (excluding any files already under
`cdn/javascript/` or matching `*.min.js`). For each source file, minify to a
corresponding `.min.js` in `cdn/javascript/` using uglify-js through the
launcher:

```bash
prism-tool run uglify-js -- cdn/js/<source>.js -o cdn/javascript/<output>.min.js -c -m
```

If no `.js` sources exist, skip this step and report "No JS sources found."

## 3. Stage rebuilt assets

Run `git add cdn/css/ cdn/javascript/` to stage the rebuilt minified files.

Report a summary: which files were rebuilt, any build errors encountered.
