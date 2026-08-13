---
name: code-review
description: "Use before push to run a read-only, four-axis review of a staged, commit, branch, or directory diff: tooling/style, Fowler structural smells, requirement coverage, and static security analysis. Reports each axis separately and never auto-fixes."
---

# Multi-Axis Code Review

Run four review axes in the single agent and assemble their findings into one
report. Do NOT auto-fix anything — report only.

For the strongest cross-model review, suggest that the human cycle to
`deepseek-v4-pro` with Ctrl+P before continuing. Proceed on the current model
if they decline.

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

Prefer existing project checks and the active adapter's `/check-<stack>`
guidance. If the `ocr` CLI is available and the human explicitly approves its
external data egress, run it as an additional read-only diff review:

- Verify `command -v ocr` first. If missing, mark the optional OCR component
  SKIPPED; do not install it autonomously.
- Choose `ocr review` (diff) or `ocr scan` (full path) based on scope.
- Use `--audience agent --format json`.
- If it fails, retry ONCE with the same command. If it fails again, record the
  exact error and continue.
- `ocr` transmits reviewed content to a third-party service. Never invoke it
  without explicit permission and never send secrets.

The axis still reports project lint/check evidence when OCR is skipped.

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
- External review services require explicit permission because code leaves the
  repository boundary.
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
- *Sending code to OCR without approval* — it is an external service; ask
  before egress.
- *Treating SKIPPED as green* — a skipped or failed axis is incomplete
  evidence, never a pass.
