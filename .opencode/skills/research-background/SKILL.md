---
name: research-background
description: Load when /research --background is invoked. Documents the background-subagent contract and the gating spike.
---

# Skill: research-background

Loaded by `/research --background` when the user requests async dispatch of a
research task. This skill documents the background-subagent contract, its
gating spike (ADR-0024 Phase 0), and the current state (pending manual
verification).

## Prerequisite

`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true` must be set in the
environment. The flag is defined in `prism.jsonc` (experimental section)
(auto-sourced by `.envrc`) pending the Phase-0 spike.

## Background-dispatch mechanism (gated on Phase-0 spike — see below)

The exact mechanism for dispatching a subagent in the background depends on
what the `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` flag enables in the
current opencode version. Three possible outcomes from the Phase-0 spike:

### Outcome A: Per-invocation parameter

If the `task` tool gains a `background` (or `async`) boolean parameter when
the flag is set, then `/research --background` dispatches the research
subagent with that parameter set to `true`:

```text
# Pseudocode — actual tool name and param depend on the spike finding
Use the task tool with background=true (or the equivalent per-invocation flag)
```

The agent does NOT wait for the subagent to complete. The user monitors the
background task via the opencode TUI session list or notification.

### Outcome B: Global toggle

If the flag flips ALL subagent dispatches to background/async mode globally,
then `/research --background` serves as an **advisory** signal — the agent
acknowledges the intent and notes that all subagent dispatches will be
backgrounded while the flag is set:

```text
Note: OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS is a global toggle in this
opencode version. All subagent dispatches from this session will be
backgrounded automatically. The --background flag here is advisory and
confirms the user's intent.

Proceed with the research as a regular subagent dispatch — it will run in the
background per the global setting.
```

The agent proceeds with the normal research subagent dispatch; the opencode
runtime handles backgrounding.

### Outcome C: Infeasible / no change

If the flag has no observable effect (the `task` tool schema is unchanged and
subagent dispatch is synchronous), then `/research --background` responds:

```text
Background subagents are not currently supported in this opencode version.
The OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS flag is set but does not change
dispatch behavior. The research task will proceed synchronously.

To run research asynchronously, start a second opencode session manually.
```

The agent then proceeds with the normal research flow synchronously.

## Phase-0 spike runbook

The spike must be run **manually** by the user (the agent cannot restart
opencode with a new env var):

1. Set `export OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true` in the shell.
2. Restart opencode from the project directory (so `.envrc` is sourced).
3. In a test session, issue: `/research --background test query`
4. Observe whether:
   - The `task` tool gains a `background`/`async` parameter → **Outcome A**.
   - All subagent dispatches become async/background globally → **Outcome B**.
   - No change is observed → **Outcome C**.
5. Record the finding in `ADR-0024` Context and update this skill accordingly.

## Cross-refs

- `ADR-0024` — Experimental Subagent Dependencies (full decision context)
- `prism.jsonc` experimental section — flag location
- `.opencode/commands/research.md` — `/research` command definition
- `.opencode/docs/research.md` — research source-trust heuristics
