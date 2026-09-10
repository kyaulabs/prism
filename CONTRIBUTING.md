# Contributing

Read `AGENTS.md` and the relevant package skills. Preserve unrelated work and
consumer customization. Use behavior-focused TDD for development and native
project tools. Review non-trivial work in the current session before completion.

## Checks

```bash
npm ci --ignore-scripts
composer install --no-interaction --no-scripts
node --test --test-concurrency=2 tests/Node/*.test.js tests/Node/*.test.ts
bash packages/prism-core/scripts/validate-harness.sh
bash tests/Shell/run-all.sh
php -d pcov.enabled=1 vendor/bin/pest --coverage
```

Browser tests require Chromium and a loopback fixture server serving
`tests/Browser/fixtures`; set `PEST_BROWSER_BASE_URL` accordingly. Semgrep rule
tests require native Semgrep. Run task-relevant checks while developing and
broaden verification before handoff. Report unavailable checks explicitly.

The repository hooks inspect staged paths, scan secrets without displaying
findings, lint applicable staged content and validate commit messages. They do
not rewrite source, impose branch policy or require unrelated tools.

Use Conventional Commits with `Implemented-by` and `Signed-off-by` attribution.
Signing follows Git configuration. Git-flow is a default, not an immutable
runtime gate. Push, PR, merge and release operations follow user/project scope.
Never include credentials, scanner matches or private local state in commits.
