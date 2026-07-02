---
description: Run Semgrep SAST scan and dependency CVE audit in one pass. Reports all findings grouped by severity.
subtask: true
---

Run a combined security scan and report all findings grouped by severity in a
single summary.

## 1. SAST scan

Invoke `@semgrep` in **diff audit** mode. Use `--baseline-commit <base>`
where `<base>` is the target branch (default `develop`, or `main` if the
user specifies). If no baseline is specified and the working tree is clean,
use `--baseline-commit HEAD~1` to scan the most recent commit.

## 2. Dependency audit

Load the `audit-deps` skill and run both the Composer and npm audits.

## 3. Combined report

Merge both sets of findings into a single report grouped by severity:

**CRITICAL / ERROR** — Must be fixed before deploy
**WARNING / HIGH** — Should be addressed in this release
**INFO / MODERATE / LOW** — Track and schedule

For each finding, show the source (semgrep or deps audit), file/package,
rule ID or CVE, and description.

At the end, give a go/no-go recommendation:
- "Safe to deploy — no critical or high findings."
- "Fix required — <N> critical findings must be resolved before deploy."
