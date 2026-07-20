# $KYAULabs: 0030-design-primary-agent-and-tier.md kyau@nova 2026/07/19 -0700 Exp $

# 0030. Design primary agent and DESIGN model tier

Date: 2026-07-19

## Status

Accepted

## Context

The engineering pipeline is `brainstorming → spec → plan → execute → verify →
review` (AGENTS.md). For the project's lifetime, the entry point — the
brainstorming phase that turns a rough idea into a validated, committed spec —
has been a **skill** (`.opencode/skills/brainstorming/SKILL.md`), loaded on
demand via the Skill tool.

Skills are invisible until invoked. The only ways to reach brainstorming are:

1. The `/feature` command (subagent mode) which loads the skill, or
2. A primary agent (`build`) deciding mid-session to load the skill.

This has three problems:

1. **No visibility.** A new user has no signal that brainstorming exists or
   that it is the pipeline's front door. The TUI tab menu shows `build`,
   `plan`, `general`, `explore` — none of them suggest "start here with your
   idea."
2. **No context isolation.** Brainstorming sessions are long (grilling loops,
   spec iteration, approach exploration). Running them in the `build` tab
   pollutes the build context; running them in `plan` (read-only,
   delegation-only per ADR-0005) is impossible because brainstorming needs to
   write specs and run `new-branch.sh`.
3. **Pipeline asymmetry.** The pipeline has discrete phases — design, plan,
   execute — but the TUI only surfaces the latter two as tabs. The front door
   is buried behind a slash command.

The `/feature` command also conflates two concerns: brainstorming (a creative,
iterative phase) and branch creation (a mechanical git operation). Branch
creation was bolted onto `/feature` because there was nowhere else for it to
live.

## Decision

We add a new **`design` primary agent** (a TUI tab) that owns the
brainstorming workflow end-to-end, running on a new **DESIGN model tier**. We
delete `/feature`; its branch-creation logic moves into the brainstorming
skill's "After the design" section.

The pipeline becomes `design → spec → plan → execute`, with each phase a tab:
`design`, `plan`, `build`.

### The design agent

- `mode: "primary"`, defined inline in `opencode.jsonc`'s `agent` section
  (same pattern as `build`, `plan`, `judge`).
- Permission block mirrors `build`: `bash: { "*": "allow", "git add*": "ask",
  "git stage*": "ask", "git commit*": "ask", "git push*": "deny" }`,
  `lsp: "allow"`, `edit` default-allow. This makes the tab a self-contained
  workspace: the user can brainstorm, iterate on the spec, commit it, and
  create the feature branch without leaving the tab.
- Temperature `0.3` — warmer than `plan` (`0.1`) and `build` (`0.2`) to
  support creative exploration and approach generation, while remaining
  grounded enough for trade-off analysis.
- Thin prompt that loads the `brainstorming` skill and follows its workflow.
  The agent does NOT duplicate the skill's 8-phase workflow — it loads it.

### Cycle boundary

The design agent owns: grilling → exploration → design → spec → commit spec
→ `new-branch.sh`. The cycle **ends** when the spec is committed and the
feature branch is created. The agent then directs the user to the `plan` tab
for implementation planning. It does NOT invoke `writing-plans` (the plan
agent's job) or dispatch `@tdd` (downstream of planning).

### Hybrid skill split (dispatch-chain preservation)

OpenCode primary agents cannot be dispatched via `@mention` by other agents —
only subagents can. Today `@from-issue` and `@consult` (subagents) load the
`brainstorming` skill directly to do their grilling work. Promoting
brainstorming to a primary agent would break that dispatch chain.

We therefore keep the `brainstorming` skill as the **single source of
workflow truth**. The `design` agent's prompt loads it; `@from-issue` and
`@consult` keep loading it directly. Two surfaces, one source of truth. This
is the same split as `plan` agent vs `writing-plans` skill.

### DESIGN model tier

A 5th model tier (`PRIMARY`, `PLANNER`, `JUDGE`, `UTILITY`, `DESIGN`) is
added per the ADR-0012/0013/0014 `{env:VAR}` pattern:

- `OPENCODE_MODEL_DESIGN` / `OPENCODE_VARIANT_DESIGN` env vars.
- `.opencode/setup.json` gains `models.design` / `variants.design`.
- `.envrc` gains two jq emit lines + two exports, with `// .planner` fallback.

Defaults match PLANNER: `openrouter/z-ai/glm-5.2`, variant `high`. The
immediate behavioral differentiation is the design agent's temperature
(`0.3` vs plan's `0.1`). The durable value of a separate tier is independent
configurability — DESIGN can be swapped to a different model (e.g., a
stronger creative-reasoning model) via `/setup` without touching PLANNER.

### `/feature` deletion

`.opencode/commands/feature.md` is deleted. Its branch-creation logic moves
into the brainstorming skill's "After the design" section (new "Create
feature branch" step between spec commit and the plan-tab transition). All
`/feature` references in `AGENTS.md`, `README.md`, `router.md`, `consult.md`,
the wayfinder skill, and the harness tests are updated.

### jq fallback migration strategy

Rather than bumping `setup_version` to 5 with a migration script, `.envrc`'s
jq query uses `// .planner` fallback: `.models.design // .models.planner`.
This protects user-level `~/.config/opencode/setup.json` files that predate
this change and lack `.models.design` — they silently fall back to PLANNER
defaults, which are identical to DESIGN's defaults today. The fallback is
semantically correct and avoids a schema-bump migration for an additive,
backward-compatible key.

## Consequences

### Positive

- **Visibility.** Brainstorming is a first-class tab. The pipeline shape is
  reflected in the TUI.
- **Context isolation.** Long brainstorming sessions get their own context
  budget, separate from build/plan work.
- **Clean separation.** Branch creation is no longer bolted onto a slash
  command; it lives in the skill workflow where it belongs chronologically
  (after spec approval).
- **Independent model configurability.** DESIGN can be tuned separately from
  PLANNER as creative-reasoning model options evolve.
- **Pipeline symmetry.** `design → plan → build` mirrors the engineering
  phases as tabs.

### Negative

- **Solo tier.** The DESIGN tier initially contains exactly one agent
  (`design`). This mirrors ADR-0013's PLANNER tier precedent ("PLANNER is a
  single-agent tier — slightly wasteful"). The accepted cost is justified by
  independent configurability; the tier is a natural home for future
  design-phase agents (e.g., a design-review agent).
- **Tab count.** Adds a 5th user-facing primary tab (`build`, `plan`,
  `design`, `general`, `explore`; `judge` is also primary but eval-only).
  Users who prefer fewer tabs may want `judge` hidden — out of scope for this
  ADR.
- **Behavioral differentiation is temperature-only today.** Until DESIGN is
  re-pointed at a different model, the only runtime difference from PLANNER
  is temperature. The tier is a future-proofing vessel.
- **Handoff reliance.** The design→plan handoff depends on the user manually
  switching to the plan tab and the plan agent loading the `writing-plans`
  skill. This is consistent with the existing build↔plan tab-switching
  pattern.

### Neutral

- `@from-issue` and `@consult` are unaffected — they load the brainstorming
  skill directly, same as before.
- The `{env:VAR}` substitution pattern is unchanged.
- `/setup` will need a future update to expose the DESIGN tier in its
  interactive model-picker — out of scope for this ADR.

## Alternatives Considered

- **Full migration: move brainstorming skill content into the design agent
  prompt, delete the skill.** Rejected: OpenCode primary agents cannot be
  dispatched by subagents. `@from-issue` and `@consult` would lose their
  ability to brainstorm — a cross-cutting breakage affecting two on-ramps.
  The hybrid split preserves the dispatch chain with zero behavior change for
  those agents.
- **Variant override on PRIMARY tier (no new tier).** Rejected per the
  explicit preference for a full tier. A variant override would be lighter
  (no env vars, no setup.json/.envrc changes) but would not give independent
  model configurability — the design agent would track PRIMARY's model
  forever. The tier future-proofs against swapping DESIGN to a different
  model (e.g., Anthropic Claude for creative work) without disturbing the
  build/plan stack.
- **Keep `/feature`, add the design tab alongside.** Rejected: redundant.
  Two entry points for the same workflow invites drift. The tab fully
  subsumes `/feature`; branch creation moves into the skill where it belongs.
- **Make the design agent read-only (delegation-only, like `plan` per
  ADR-0005).** Rejected: the design agent produces committed artifacts
  (specs, branches). A read-only design tab would force the user to switch
  to `build` mid-brainstorm to commit the spec and create the branch —
  defeating the context-isolation motivation. The design agent mirrors
  `build`'s permission posture, not `plan`'s.
- **v5 schema bump with `migrate-setup.sh`.** Rejected: the jq fallback
  (`.models.design // .models.planner`) handles backward compatibility for
  additive keys without a migration. A schema bump is reserved for breaking
  changes.

## Cross-refs

- `adr/0005-plan-agent-delegation-only.md` — the delegation-only pattern the
  design agent deliberately does NOT follow (different role: constructive,
  not analytical).
- `adr/0012-configurable-model-variables.md` — the `{env:VAR}` + tier pattern
  this extends.
- `adr/0013-configurable-variant-via-env-var.md` — added JUDGE tier (4th);
  solo-tier precedent (PLANNER).
- `adr/0014-model-default-rebalancing.md` — temperature explicitness mandate;
  `0.3` is a new value documented in the living doc
  (`.opencode/docs/model-configuration.md`), not by amending this accepted
  ADR.
- `adr/0022-sub-agent-model-config-opencode-jsonc.md` — primary-agent config
  lives inline in opencode.jsonc (compliance).
- `adr/0027-plans-specs-lifecycle.md` — the spec-commit lifecycle the design
  agent participates in.
- `adr/0028-git-flow-branch-naming-enforcement.md` — the `new-branch.sh`
  contract the design agent invokes.
- `adr/0029-unified-setup-json-config.md` — the setup.json/.envrc structure
  the DESIGN tier extends.
- `.opencode/skills/brainstorming/SKILL.md` — the workflow source the design
  agent loads.
- `.opencode/docs/model-configuration.md` — the living tier/temperature
  tables.
- `AGENTS.md` — the engineering pipeline the design tab front-doors.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
