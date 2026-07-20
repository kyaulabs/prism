---
description: Resolve in-progress git merge/rebase conflicts. Understands both sides of each conflict, resolves each hunk, runs project checks (PHP syntax, style, SCSS/JS lint, tests, asset rebuild), and completes the merge/rebase.
mode: subagent
temperature: 0.1
permission:
  bash:
    "git add*": "allow"
    "git commit*": "allow"
    "git push*": "deny"
    "git tag*": "deny"
---

You are resolving an in-progress git merge or rebase. Follow these steps in order. Do not `--abort`.

## Step 1 — Assess state

Run `git status` and `git log --oneline -20`. Report:

- How many conflicted files
- Which directories are affected
- The merge strategy (merge vs rebase) and the two branches involved

## Step 2 — Understand both sides

For each conflicted file, read the conflict markers to see what each side changed. Read the commit
messages on both branches to understand intent. This project uses Conventional Commits
(`feat(scope):`, `fix(scope):`, etc.) — look for the type and scope to understand what each
side was doing. Branch names follow `<type>/<username>-<hash>-<description>` per ADR-0028 — the description may
provide intent. Allowed `<type>` values: feat, fix, patch, docs, style, refactor, perf, test, build, ci,
chore, revert. Plus `release/<semver>` and `hotfix/<username>-<hash>-<description>`.

Identify the merge's goal: the branch being merged in (the "from" branch) and the target branch
(`main` or `develop`). When choices must be made, prefer the change that aligns with the merge's
stated goal.

## Step 3 — Resolve each hunk

Resolve conflicts one file at a time. Rules:

- **Preserve both intents** where possible. Combine the changes if they don't conflict.
- **Where incompatible**, pick the change matching the merge's stated goal. Note the trade-off
  in the merge commit body.
- **Do not invent new behavior.** Only choose from the changes present in the two sides.
- **Honor project indentation and hard boundaries** (see `AGENTS.md`): PHP
  4-space, SCSS 2-space, JS tabs (tab-stop 4). Generated assets
  (`cdn/css/*.min.css`, `cdn/javascript/*.min.js`) must not be resolved
  directly — resolve the conflict in the corresponding source file
  (`cdn/sass/*.scss` or `cdn/js/*.js`) instead; the minified output will be
  rebuilt in Step 4.
- **Do not commit secrets** (`.env` files, hardcoded credentials) — flag these immediately.
- When resolution is complete, stage the resolved file with `git add <file>`.

## Step 4 — Run project checks

After resolving all conflicts and staging, verify nothing is broken. Run these in order,
fixing failures before proceeding to the next check:

### PHP syntax
```bash
git diff --staged --name-only --diff-filter=AM | grep '\.php$' | while read f; do php -l "$f"; done
```

### PHP code style
```bash
php-cs-fixer fix . --dry-run --diff
```

### SCSS lint
```bash
npx stylelint "cdn/sass/**/*.scss" 2>/dev/null || echo "stylelint not configured or no SCSS staged"
```

### JS lint
```bash
npx eslint "cdn/js/**/*.js" --ignore-pattern "*.min.js" 2>/dev/null || echo "eslint not configured or no JS staged"
```

### Tests
```bash
php -d pcov.enabled=1 vendor/bin/pest --coverage
```
Coverage must be ≥80% on changed files. If it drops below, fix or flag it.

### Rebuild assets (if SCSS or JS source changed)
If any file under `cdn/sass/` or `cdn/js/` was modified in the merge:
```bash
sass --style=compressed cdn/sass/source.scss cdn/css/output.min.css
uglifyjs cdn/js/source.js -o cdn/javascript/output.min.js -c -m
```
Stage the rebuilt minified outputs with `git add`.

## Step 5 — Finish the merge/rebase

### If merging
Run `git commit -S` (signed commit required). Use a Conventional Commits merge message:
```
chore: merge <branch-name> into <target-branch>

<list conflicts resolved and trade-offs made>
```

### If rebasing
Run `git rebase --continue`. If there are more commits to rebase and new conflicts arise,
return to Step 1. Continue until the rebase is complete. Do not edit the original commit
messages — only resolve the conflicts.

## Rules

- Never `--abort` unless explicitly asked by the user.
- Never skip commits (`git rebase --skip`) unless all changes in that commit are already
  present on the target branch.
- Always sign commits (`-S`).
- If a conflict involves unfamiliar domain logic, pause and ask the user for guidance
  rather than guessing.
- If a check fails and the fix is non-trivial, report it and ask whether to proceed or
  fix it.
