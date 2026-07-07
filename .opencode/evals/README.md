# Eval Framework

Harness self-evaluation: structural validation catches rot in the prompt
files; scenario evals verify that agents and skills actually produce the
expected behavior.

**Status:** Phase 2 — automated runner implemented. Run evals with the PHP CLI
scripts under `bin/`. See Usage below.

## Usage

### Run a single eval case

```bash
php .opencode/evals/bin/run-eval.php .opencode/evals/smoke/tdd-red-green.json
```

Options: `--timeout <seconds>` (default 120), `--dry-run` (print command, don't execute).

Output: JSON result object to stdout. Exit code 0 = PASS, 1 = FAIL, 2 = SKIPPED.

### Run a suite

```bash
php .opencode/evals/bin/run-suite.php .opencode/evals/smoke/
```

Options: `--tag <tag>` (filter by tags field), `--timeout <seconds>` (per case).

Output: markdown summary table to stdout, detailed JSON to `results/<timestamp>.json`.
Exit code 0 = all passed, 1 = one or more failures.

### In pre-commit/pre-push hooks

```bash
php .opencode/evals/bin/run-suite.php .opencode/evals/smoke/ --tag smoke
if [ $? -ne 0 ]; then
    echo "Eval suite failed — review results before pushing."
    exit 1
fi
```

### Test integration

The integration test (`tests/Integration/Eval/RunEvalIntegrationTest.php`) is tagged
`@group slow` and **excluded from default `pest` runs** via `phpunit.xml`.
This prevents a routine `/check` from launching a live 180s LLM agent on any
machine with opencode installed.

To run the eval integration tests explicitly:

```bash
php vendor/bin/pest --group slow
```

### Worktree isolation

Each eval case runs the agent inside a **disposable git worktree**
(`git worktree add --detach` under the system temp directory). The agent's
file writes land in the worktree, never in the source working tree. The
worktree is removed in a `finally` path after the case completes (or times
out), so a real eval run leaves `git status --porcelain` unchanged in the
source repo.

The LLM judge runs as a dedicated **read-only `judge` agent** (see
`opencode.json`) with `edit` and `bash` denied — it cannot mutate files or
run shell commands even if prompted to.

## Structure

```text
.opencode/evals/
├── README.md           ← This file
├── schema.json         ← JSON Schema for eval case definitions
├── bin/                ← Runner scripts
│   ├── includes/
│   │   └── EvalRunner.php  ← Shared classes (EvalCase, EvalResult, Runner)
│   ├── run-eval.php    ← Single-case runner
│   └── run-suite.php   ← Batch suite runner
├── smoke/              ← Minimal smoke evals (one per critical agent)
│   ├── tdd-red-green.json
│   ├── receiving-code-review-triage.json
│   ├── finishing-a-development-branch-checklist.json
│   ├── finding-duplicate-functions-two-phase.json
│   └── opencode-docs-reference.json
└── results/            ← Generated result files (gitignored)
    └── <timestamp>.json
```

## Eval case format

Each eval case is a JSON file conforming to `schema.json`. Fields:

| Field | Required | Description |
|---|---|---|
| `name` | yes | Short, unique identifier (kebab-case) |
| `description` | yes | What behavior this eval verifies |
| `agent` | yes | Which agent or skill is under test (e.g. `@tdd`, `brainstorming`) |
| `input` | yes | The prompt or scenario to feed the agent |
| `expected_behavior` | yes | Array of observable behaviors the output must satisfy |
| `pass_criteria` | yes | How to determine pass/fail (e.g. "all behaviors observed", "no errors in output") |
| `expected_string` | conditional | Required when `pass_criteria` is `"output contains expected string"`. The substring that must appear in stdout |
| `tags` | no | For filtering (e.g. `["smoke", "tdd", "critical"]`) |

### Pass criteria

| `pass_criteria` value | How pass/fail is decided |
|---|---|
| `all behaviors observed` | LLM judge — all expected behaviors rated YES |
| `exit code zero` | Deterministic — agent exit code is 0 |
| `output contains expected string` | Deterministic — `expected_string` substring found in stdout |
| `no errors in output` | Deterministic — stderr contains no error-severity line (warnings/progress are OK; see `Runner::ERROR_SEVERITY_PATTERN`) |
| `manual inspection required` | Returns UNDETERMINED — a human must review |

## Planned runner

When an automated runner is available, evals will be driven non-interactively
against each case file — the schema and case format below are stable; only the
runner is pending. In the meantime, eval cases serve as behavioral
specifications: when you change a skill or agent, add or update its eval case
in the same commit to document the expected behavior.

## Authoring conventions

1. **One behavior per eval case.** Compound cases are harder to debug when
   they fail.
2. **Smoke evals are minimal.** Each critical agent gets one smoke case that
   exercises the happy path. Deep edge-case testing lives in dedicated eval
   suites outside `smoke/`.
3. **Eval cases are versioned alongside the prompt.** When you change a
   skill or agent, add or update its eval case in the same commit. This
   creates a before/after record of behavior changes.
4. **Before/after comparison.** When modifying a prompt, run the eval suite
   before and after the change. Diff the results. If the eval suite doesn't
   have a case covering the change you're making, add one first.

## Cross-refs

- `AGENTS.md` § Git Workflow — no-squash policy (commit history is the eval log)
- `AGENTS.md` § Linting & Enforcement — structural validation of frontmatter
  is planned via CI; until then, validate manually when adding or changing
  skills, agents, or commands
