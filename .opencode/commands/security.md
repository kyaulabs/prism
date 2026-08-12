---
description: Run Semgrep SAST scan and dependency CVE audit in one pass. Reports all findings grouped by severity with false-positive adjudication protocol.
agent: build
subtask: true
---

Run a combined security scan and report all findings grouped by severity in a
single summary.

## Baseline argument

The user may specify a baseline commit or branch: $ARGUMENTS

If empty, default to `develop` (or `main` if on `main`). If still empty and
the working tree is clean, use `--baseline-commit HEAD~1`.

## 1. SAST scan

Invoke `@semgrep` in **diff audit** mode. Use `--baseline-commit` with the
baseline specified in the argument section above. If the argument is empty
and the working tree is clean, use `--baseline-commit HEAD~1` to scan the
most recent commit.

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

## 4. False-positive adjudication

After reporting findings, adjudicate each one. For every finding above INFO
severity, classify it:

| Classification | Action |
|---|---|
| **True positive (TP)** | Fix or schedule a fix. Do not suppress. |
| **False positive (FP)** | Suppress with `// nosemgrep: <rule-id> -- <justification>`. Justification is mandatory and must explain *why* the pattern is safe in this specific context. |
| **Acceptable risk** | Document the acceptance and suppress with the same syntax. Justification must reference the risk assessment (e.g., a threat model or ADR). |

**Suppression syntax:**

```php
// nosemgrep: kyaulabs-sqli-interpolated-query -- static SQL with no user input; table name is a build-time constant
// nosemgrep: kyaulabs-unserialize-request-data -- input is already json_decode'd; unserialize targets a pre-validated cache key
```

- Bare `// nosemgrep` (no rule-id) is forbidden — it suppresses every rule at that line.
- Justification must be a single line after `--`. No essays, no placeholders.
- Suppressions are committed to the repository and reviewed alongside the code.

**Re-review triggers:** when a named rule in `.semgrep/kyaulabs.yml` is
updated, the `@semgrep` agent notes existing suppressions for that rule and
flags them for re-evaluation. Suppressed findings that are no longer valid
FP/acceptable-risk must be raised as new issues.

**Suppression log:** at the end of the report, list all extant suppressions
in the scanned scope:

```
Suppression log (reviewed against current rule set):
  kyaulabs-sqli-interpolated-query  backend/reports.php:42  -- static SQL, no user input
  kyaulabs-missing-csrf-token       backend/internal.php:18  -- internal cron endpoint, no browser sessions
```
