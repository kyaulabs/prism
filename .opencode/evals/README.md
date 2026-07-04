# Eval Framework

Harness self-evaluation: structural validation catches rot in the prompt
files; scenario evals verify that agents and skills actually produce the
expected behavior.

**Status:** Phase 1 — skeleton in place; live execution pending API access.

## Structure

```text
.opencode/evals/
├── README.md           ← This file
├── schema.json         ← JSON Schema for eval case definitions
└── smoke/              ← Minimal smoke evals (one per critical agent)
    └── tdd-red-green.json
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
| `tags` | no | For filtering (e.g. `["smoke", "tdd", "critical"]`) |

## Running evals

Execution requires an OpenCode instance with API access. When that is
available:

```bash
# Run smoke evals only
opencode eval .opencode/evals/smoke/

# Run all evals
opencode eval .opencode/evals/
```

Until then, the framework defines the convention so that eval cases can be
authored alongside prompt changes.

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

- `.github/scripts/validate-harness.sh` — structural frontmatter validation
  (runs in CI; catches malformed files before they cause silent failures)
- `AGENTS.md` § Git Workflow — no-squash policy (commit history is the eval log)
