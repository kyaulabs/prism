---
name: code-review
description: "Use before push to run a read-only, four-axis review of a staged, commit, branch, or directory diff: tooling/style, Fowler structural smells, requirement coverage, and static security analysis. Reports each axis separately and never auto-fixes."
---

# Multi-Axis Code Review

Run four review axes in the single agent and assemble their findings into one
report. Do NOT auto-fix anything — report only.

## Coordinator workflow

### 1. Empty-diff guard (MUST run first)

Determine the diff scope (staged, commit, branch range, or explicit path). If
the diff is **empty**, FAIL immediately with a clear message:

> "Empty diff — nothing to review. The code-review skill requires at least one
> changed file."

Do not run any review axis when the diff is empty.

### 2. Determine scope

Infer the review scope from context:

| Context | Scope |
|---|---|
| "review my staged changes" | Staged diff (`git diff --staged`) |
| "review the last commit" | `HEAD` commit |
| "review this branch" | `develop..HEAD` |
| "audit <path>" | Full scan of the explicit path |

If unclear, ask before proceeding.

### 3. Run four axes inline

The single agent runs the axes sequentially. Keep each axis's findings and
native severity separate; do not re-rank across axes.

#### Axis 1 — Tooling / style / lint

Run the fail-closed local readiness first (missing launcher or
Semgrep/OCR mismatch blocks the review):

```bash
prism-tool doctor --local-only
```

Standing OCR consent is established globally by `/setup`; ask no connectivity
or code-egress question here. Run exactly one dedicated OCR operation based on
scope:

```bash
prism-tool code-review ocr -- review --audience agent --format json
```

For an explicit full-path audit, use only:

```bash
prism-tool code-review ocr -- scan PATH --audience agent --format json
```

The launcher validates standing consent, local versions, connectivity, the
exact argument form, and scan-path containment before code leaves the
repository boundary. Never call OCR through generic `prism-tool run`, invoke
`ocr` directly, retry a failed OCR operation, or send secrets. If OCR fails,
mark this axis `FAILED` with the launcher's fixed error and continue the other
three axes. The axis still reports project lint/check evidence when OCR is
unavailable.

#### Axis 2 — Standards review (Fowler baseline)

Load the `standards-review` skill and apply it to the exact same diff scope.
Keep its structural-smell findings separate from style and lint.

#### Axis 3 — Spec review (requirement coverage)

Load the `spec-review` skill and apply it to the current branch and exact same
diff scope.

#### Axis 4 — Static security analysis

Run the project's configured read-only static security scanner for the exact
scope. Use the active adapter or `/security` guidance for the concrete command.
If no scanner is configured, mark the axis SKIPPED with that reason. Never
install a scanner or download rules autonomously.

### 4. Assemble output

Report every axis's completion status at the top:

```text
## Code Review — Multi-Axis Report

Axis status: tooling COMPLETE · standards-review COMPLETE · spec-review COMPLETE · sast COMPLETE

### 1. Tooling / Style / Lint
<findings grouped by Blocking / Suggested / Informational>

### 2. Standards Review — Structural Smells
<standards-review findings>

### 3. Spec Review — Requirement Coverage
<spec-review findings>

### 4. SAST — Security Scan
<scanner findings>
```

Each axis is `COMPLETE`, `FAILED` (with the exact error), or `SKIPPED` (with
the reason). Always return the report when one or more axes fail — partial
review evidence is useful, but it is explicitly incomplete.

### 5. De-duplication contract

Each axis has defined territory:

- **tooling** owns formatter/style/lint failures, required file ceremony, and
  active-adapter convention checks.
- **standards-review** owns structural design smells (Duplicated Code, Long
  Method, Large Class, and related Fowler smells). It must NOT re-report
  formatter/style/lint findings already covered by tooling or `/check`.
- **spec-review** owns requirement-coverage traceability. It does NOT report
  code quality or security issues.
- **sast** owns static security findings and secret-pattern scanning. It does
  NOT report code style or structural smells.

If overlap appears, note it in the report but do not suppress either finding —
let the reviewer decide.

## Rules

- Never auto-apply fixes. Report and stop.
- Run all axes in the single agent; do not dispatch workers or claim parallel
  execution.
- If an axis fails, report the exact error and continue with the remaining
  axes.
- The review never freezes or hides partial evidence: always return per-axis
  status (`COMPLETE` / `FAILED` / `SKIPPED`). A human may explicitly waive an
  incomplete axis in-session.
- External OCR review requires valid global standing consent because code
  leaves the repository boundary.
- If the diff is empty, fail early before any axis runs.

## Cross-refs

- `standards-review` skill — structural smell axis.
- `spec-review` skill — requirement coverage axis.
- `receiving-code-review` skill — normalizes and triages this report.
- `/check` prompt — aggregate local quality gate (Stage 3).
- `/security` prompt — configured SAST + dependency audit (Stage 3).

## Gotchas

- *Running axes in parallel by inventing workers* — the pi conversion is
  single-agent. Run each axis inline and preserve separate output sections.
- *Sending code to OCR outside the dedicated operation* — standing consent is
  enforced by `prism-tool code-review ocr`; never bypass it or ask again.
- *Treating SKIPPED as green* — a skipped or failed axis is incomplete
  evidence, never a pass.
