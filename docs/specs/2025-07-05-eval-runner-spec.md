# Eval Runner — Phase 2 Specification

**Date:** 2025-07-05
**Status:** Approved
**Scope:** Build an automated, non-interactive eval runner that executes
`.opencode/evals/smoke/*.json` cases against `opencode run` and reports
pass/fail per expected behavior.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Behavior checking | Two-pass: deterministic gate + LLM judge | "All behaviors observed" requires LLM judgment; deterministic criteria (exit code, string match) don't |
| Language | PHP CLI | No new dependencies — PHP is the project stack; json_decode is built-in |
| Sandboxing | In-repo | Agent needs to read .opencode/ skills and AGENTS.md to function; CI runs in a fresh clone |
| Output | Markdown summary to stdout + JSON results file | Human-readable for manual review; machine-parseable for CI |
| Filtering | `--tag <tag>` on run-suite.php | Matches against eval case `tags` field |

## Files

| File | Type | Purpose |
|---|---|---|
| `.opencode/evals/bin/run-eval.php` | New | Single-case eval runner |
| `.opencode/evals/bin/run-suite.php` | New | Batch suite runner with aggregation |
| `.opencode/evals/README.md` | Modified | Update to Phase 2 status, document CLI usage |
| `.opencode/evals/results/` | New directory | Generated result files (gitignored) |
| `.opencode/.gitignore` | Modified | Add `evals/results/` |
| `tests/Unit/Eval/RunEvalTest.php` | New | Unit tests for parsing, judge prompt, dispatch |
| `tests/Unit/Eval/RunSuiteTest.php` | New | Unit tests for filtering, aggregation, formatting |

## run-eval.php

### Interface

```
php .opencode/evals/bin/run-eval.php <case-file> [--timeout <seconds>] [--dry-run]
```

- `<case-file>` — required, path to a single eval case JSON file
- `--timeout` — optional, default 120 seconds
- `--dry-run` — optional, construct opencode run command but don't execute; print it
- Exit code: 0 on PASS, 1 on FAIL/TIMEOUT/INVALID, 2 on SKIPPED (opencode not found)
- Stdout: JSON result object

### Flow

1. **Parse** — read and json_decode the case file. Validate required fields against schema.json. If invalid, emit INVALID result and exit 1.
2. **Build command** — construct `opencode run --prompt "<input>" --mode build` with --permissions for bash, edit, and task. Use the repo root as --path.
3. **Execute** — run opencode, capture stdout, stderr, exit code. Apply timeout. If timeout exceeded, emit TIMEOUT result and exit 1. If opencode not found in PATH, emit SKIPPED and exit 2.
4. **Deterministic gate** — dispatch on pass_criteria:
   - `exit code zero`: PASS if exit code is 0
   - `no errors in output`: PASS unless stderr contains a line matching an error-severity prefix (Fatal error, Parse error, Uncaught, Error:, TypeError:, ReferenceError:, SyntaxError:, Unhandled promise rejection, Segmentation fault, etc.). Benign chatter (warnings, progress, deprecation notices) does not fail the criterion. See `Runner::ERROR_SEVERITY_PATTERN`.
   - `output contains expected string`: PASS if the expected_string field is found in stdout
   - `manual inspection required`: return a result with verdict UNDETERMINED (human must review)
   - `all behaviors observed`: skip this gate, proceed to LLM judge
5. **LLM judge** — construct a judge prompt containing the expected_behavior array and the captured agent output. Run `opencode run` with the judge prompt. Parse the judge's JSON response. For each behavior, extract verdict (YES/NO/UNCLEAR) and rationale. Overall PASS if all behaviors are YES.
6. **Output JSON result** — see Result Schema below.

### Judge prompt template

```
You are evaluating whether an AI agent's output satisfies expected behaviors.
Below is the eval case and the agent's full output. For each expected behavior,
answer YES if the output demonstrates it, NO if it does not, or UNCLEAR if
you cannot determine. Provide a one-sentence rationale per answer.

Eval case: <name>
Description: <description>

Expected behaviors:
<numbered list>

Agent output:
---
<captured stdout + stderr>
---

Respond with ONLY a valid JSON array. No prose, no markdown fences.
[{"behavior": "<exact text>", "verdict": "YES|NO|UNCLEAR", "rationale": "<one sentence>"}, ...]
```

### Result schema

```json
{
  "name": "<eval case name>",
  "agent": "<agent under test>",
  "pass_criteria": "<criteria string>",
  "verdict": "PASS|FAIL|TIMEOUT|INVALID|SKIPPED|UNDETERMINED",
  "behaviors": [
    {"behavior": "<text>", "verdict": "YES|NO|UNCLEAR", "rationale": "<sentence>"}
  ],
  "deterministic_checks": {
    "<criterion-specific key>": {"pass": true}
  },
  "duration_ms": 12345,
  "judge_used": true|false,
  "error": "<if runner-level error>"
}
```

## run-suite.php

### Interface

```
php .opencode/evals/bin/run-suite.php <directory> [--tag <tag>] [--timeout <seconds>] [--dry-run]
```

- `<directory>` — required, path to directory containing eval case JSON files
- `--tag` — optional, filter by `tags` field
- `--timeout` — optional, default 120 seconds per case
- Exit code: 0 if ALL PASS, 1 if ANY non-PASS (FAIL/TIMEOUT/INVALID)
- Stdout: markdown summary table
- Side effect: writes JSON to `results/<YYYY-MM-DDTHHmmss>.json`

### Markdown table format

```
| # | Eval Case | Agent | Verdict | Behaviors | Duration | Judge |
|---|---|---|---|---|---|---|
| 1 | tdd-red-green | @tdd | PASS | 6/6 | 12.3s | yes |
| 2 | receiving-code-review-triage | receiving-code-review | FAIL | 5/7 | 18.1s | yes |
| 3 | opencode-docs-reference | opencode-docs | PASS | 7/7 | 8.7s | yes |

**Suite: 2/3 passed (1 failed, 0 timeout, 0 skipped, 0 invalid)**

Detailed results: .opencode/evals/results/2025-07-05T120000.json
```

## Testing

### Unit tests (fast, no LLM)

- `tests/Unit/Eval/RunEvalTest.php`: JSON parsing + validation, deterministic check dispatch (exit code zero, output contains, no errors), judge prompt construction, markdown table row formatting
- `tests/Unit/Eval/RunSuiteTest.php`: file discovery, --tag filtering, aggregation logic, exit code logic

### Integration test (slow, requires LLM)

- `tests/Integration/Eval/RunEvalIntegrationTest.php`: runs `tdd-red-green.json` through the full pipeline. `@group slow`, skipped in default pest runs. Verified manually or on pre-commit/pre-push hook.

## Non-goals (for this phase)

- Watch mode / file-watching. Re-run manually or via CI trigger.
- Before/after diffing. The suite runs all cases; diffing is a human or CI concern.
- CI workflow definition. CI integration is a separate task — this runner produces the artifacts CI consumes (exit code, JSON results).
- Parallel execution. Sequential is fine for the current 5-case suite.
- Sub-suite directories beyond `smoke/`. The directory structure supports them, but none exist yet.
