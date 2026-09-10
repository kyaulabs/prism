---
description: Run applicable PHP/web tests, lint and 90% changed-file coverage using normal project tools.
argument-hint: "[scope]"
---

# PHP/Web Check

Check $ARGUMENTS, or the current task's PHP/web changes. Follow project overrides.

1. Inspect changed paths and project configuration. Use existing scripts where
   available; discover the actual source/test layout rather than assuming a webroot.
2. Run relevant PHP syntax/tests and PHP CS Fixer in dry-run mode. Typical commands
   are `vendor/bin/pest` and `vendor/bin/php-cs-fixer fix --dry-run --diff`.
3. For changed SCSS/JavaScript, run the project's local Stylelint/ESLint commands
   with its configuration. Build affected assets from source, never edit minified
   files directly. Browser/visual checks apply when relevant to changed behavior.
4. Before non-trivial PHP completion, generate Clover coverage with Pest and run
   the module's `coverage-gate.php` against the task's changed PHP paths. The
   changed-file default is 90%; use an explicit project threshold when configured.
   Load `tdd-php` for invocation details. No extra overall threshold is imposed.
5. Report each actual command and result. Group actionable failures by tool;
   distinguish unavailable, not-run and not-applicable checks from PASS.

No installed reviewer, receipt, clean unrelated working tree or global toolchain
readiness is required. Use owned test-server processes only as needed. Repair
failures when within the active development request; otherwise report them.
