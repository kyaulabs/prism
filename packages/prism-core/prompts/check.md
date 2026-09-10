---
description: Run relevant project tests, lint and coverage checks and report actual results without receipts or global readiness gates.
argument-hint: "[scope]"
---

# Check

Verify $ARGUMENTS, or the current task's changes when no scope is supplied.

1. Inspect changed paths and project/module test configuration.
2. Load `verification-before-completion`. Run applicable checks, including the
   module's check skill or prompt where useful. Use focused commands for scoped
   work and broader suites for cross-cutting changes or explicit full-check requests.
3. Report commands, results and limitations. Separate not-run and not-applicable
   checks from PASS. Missing unrelated tools never block the requested check.

Do not require a clean unrelated working tree, installed reviewer, criteria or
check receipts. Do not change code unless repairs were requested or are within
the active development task. Never print secrets while inspecting changes.
