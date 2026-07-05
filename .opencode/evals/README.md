# Eval Framework

Harness self-evaluation: structural validation catches rot in the prompt
files; scenario evals verify that agents and skills actually produce the
expected behavior.

**Status:** Phase 1 — schema and case format are stable; an automated,
non-interactive runner is planned but not yet built. Until a runner exists,
eval cases serve as documentation of expected agent behavior and provide a
convention for authoring test cases alongside prompt changes.

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
