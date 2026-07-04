---
name: audit-deps
description: Scan PHP (Composer) and JavaScript (npm) dependencies for known CVEs. Parses structured output into severity tables with fix commands. Skips gracefully if manifests are absent.
---

## Composer Audit

If `composer.json` exists in the project root, run:

```bash
composer audit --format json
```

A `composer.lock` must also be present (audit checks locked versions). If only
`composer.json` exists without a lock file, note that and skip.

Parse the JSON output. Report findings grouped by severity:

| Severity | Meaning |
|---|---|
| critical | Remote code execution, critical data exposure |
| high | SQL injection, authentication bypass |
| medium | XSS, information disclosure, DoS |
| low | Minor issues, configuration weaknesses |

For each finding, show:
- Affected package and version
- CVE ID or advisory identifier
- Brief description
- Suggested fix: `composer update <package>`

If no vulnerabilities are found, report: "No known vulnerabilities in PHP dependencies."

---

## npm Audit

If `package.json` exists (check the project root first, then subdirectories like
`cdn/`, `.opencode/`), run:

```bash
npm audit --json
```

A `package-lock.json` must also be present. If not, note it and skip.

Parse the JSON output. npm audit nests advisories under affected packages.
Flatten them and group by severity:

| Severity | Meaning |
|---|---|
| critical | RCE, arbitrary code execution |
| high | Significant security impact |
| moderate | XSS, information disclosure |
| low | Minor issues |

For each finding, show:
- Affected package, installed version, and vulnerable version range
- CVE ID or GitHub Advisory ID
- Suggested fix: `npm update <package>` or `npm install <package>@latest`

If no vulnerabilities are found, report: "No known vulnerabilities in JavaScript dependencies."

---

## Rules

- Both tools are read-only — they never modify `composer.lock` or `package-lock.json`.
- Skip either check gracefully if the corresponding manifest files don't exist.
- If a lockfile is missing but the manifest exists, report a warning:
  lockfiles are required for auditing; a fresh clone cannot be audited until
  dependencies are installed against potentially unvetted versions. Committing
  lockfiles eliminates this gap (see the lockfile policy in AGENTS.md).
- If `composer audit --format json` returns a non-zero exit due to vulnerabilities,
  that's expected — parse the JSON output regardless.
- If `npm audit --json` times out (large dependency trees can be slow), note it and
  report the partial results.
- If either tool is not installed (e.g., `composer` or `npm` not in PATH), report
  the error and skip that check — do not attempt to install them.
