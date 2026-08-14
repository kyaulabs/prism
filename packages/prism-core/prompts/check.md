---
description: Pre-push gate. Runs language-agnostic repository checks and the verification-before-completion checklist, then delegates stack-specific lint, tests, and coverage to the active adapter.
---

Run the project's full pre-push check suite and report failures grouped by
gate. Do not push, commit, or auto-fix anything.

## 1. Mandatory local readiness

Run the fail-closed local doctor before any gate that depends on declared
tools (hooks, /check, /pr, and release all perform local-only readiness):

```bash
prism-tool doctor --local-only
```

A missing launcher or failed Semgrep/OCR readiness is blocking — report the
remediation and stop.

## 2. Verification evidence

Load the `verification-before-completion` skill and apply its checklist to the
completed work. Evidence must be current: run the commands that prove each
claim rather than relying on an earlier summary.

## 3. Repository state

```bash
set -euo pipefail
git status --short
git diff --check
```

- `git status --short` must be empty for the pre-push gate. If it is not,
  report every staged, unstaged, and untracked path and mark this gate FAIL.
- `git diff --check` must report no whitespace errors or conflict markers.
- Confirm the current branch is not `main` or `develop` unless this is the
  documented single-root greenfield seed exception (ADR-0044).

## 4. Debug-artifact audit

Inspect every file changed from the branch merge-base and confirm no temporary
instrumentation, breakpoints, scratch files, focused-test flags, or debug-only
logging remains. Use the active adapter's conventions to identify concrete
markers; do not delete or edit findings automatically.

Also run the language-agnostic conflict-marker check:

```bash
if git grep -nE '^(<<<<<<< |=======|>>>>>>> )' -- . ':!adr/**' ':!docs/plans/**'; then
    echo "FAIL: unresolved conflict marker(s) found"
else
    echo "PASS: no unresolved conflict markers"
fi
```

Historical examples in frozen ADRs and plans are excluded; inspect any other
hit as inert text before deciding whether it is a real conflict marker.

## 5. Harness validation

When this repository contains the Prism packages, run:

```bash
if [ -x packages/prism-core/scripts/validate-harness.sh ]; then
    bash packages/prism-core/scripts/validate-harness.sh
else
    echo "SKIPPED: prism-core source validator is not present in this project"
fi
```

A validator failure is blocking. In an ordinary consumer project where the
package source is not checked out, report this gate SKIPPED rather than
inventing a package path.

## 6. Active adapter gate

Delegate framework-specific lint, tests, coverage, syntax, and asset checks to
the active stack adapter:

- If the PHP/web adapter is active, expand and run `/check-php`.
- For another adapter, run its documented check prompt (for example,
  `/check-python` or `/check-rust`).
- If project evidence identifies an adapter but its check prompt is missing,
  mark this gate FAIL and tell the user which adapter package to install.
- If no stack adapter applies (documentation-only or language-agnostic
  repository), report this gate SKIPPED with the reason.

Do not guess stack commands in this core wrapper. The adapter owns exact test,
coverage, formatter, linter, and build invocations.

## Output

Group results by gate. For each gate print PASS / FAIL / SKIPPED with evidence.
End with one go/no-go result:

- **GO** — repository state is clean, no debug artifacts remain, verification
  evidence is current, harness validation passes when applicable, and the
  active adapter gate passes.
- **NO-GO** — list every blocking failure. Do not suggest a push until all
  failures are resolved.

## Rules

- Never auto-fix, commit, or push. Report only.
- Do not claim a command passed without fresh output from this run.
- `/check` is the aggregate pre-push gate;
  `verification-before-completion` is the per-task evidence gate. Both run.
- Stack specifics belong to the active adapter, not this core template.
