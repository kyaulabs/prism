# 0011. Plan Agent Complexity Assessment via Prompt Heuristics and Elevated Variant

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-10

## Status

Accepted

## Context

GitHub issue #110 requested dynamic GLM-5.2 variant selection for the `plan`
agent — automatically switching between `high` (cost-efficient) and `max`
(deep reasoning, thinking enabled) based on real-time task complexity
assessment.

Investigation of opencode's config schema, plugin hook system, and SDK
revealed that **dynamic per-turn variant switching is not possible**:

1. **No config key:** `dynamic_variant` does not exist in opencode's config
   schema. The `variant` key on agents is static, loaded once at startup.

2. **No plugin hook for model selection:** The plugin system exposes ~23
   hooks across 10 categories. The closest, `experimental.chat.system.transform`,
   fires *after* model resolution and can only modify the system prompt
   (string array) — it cannot change the model or variant. See ADR-0008.

3. **No SDK intercept:** The SDK's `session.prompt()` accepts a per-call
   `model` override, but only from external programs — not from within
   opencode's own agent processing loop. It also doesn't accept `variant`,
   only `providerID`/`modelID`.

4. **`thinking` is provider-level, not agent-level:** The `thinking` option
   is configured under `provider.<name>.models.<id>.options`, not as an
   agent-level key. It applies to all agents using that model, not per-turn.

The model and variant are resolved statically from config/CLI/agent settings
before any plugin hook fires. True dynamic variant switching would require a
new upstream opencode feature (e.g., an `experimental.chat.model.select` hook
that fires before model resolution).

## Decision

Implement a **prompt-based complexity assessment** as a pragmatic alternative:

1. **Elevate the plan agent's variant** from `medium` to `high` — providing
   better reasoning capacity for all planning tasks without the full token
   cost of `max`.

2. **Add a Complexity Assessment Protocol** to the plan agent's system prompt
   — instructing the agent to classify task complexity and adjust reasoning
   depth accordingly:
   - **Complex** (deeper reasoning, alternatives exploration, @architect
     dispatch): architectural changes, security-sensitive work, database
     schema changes, cross-cutting refactors, complex multi-system bugs,
     performance optimizations, non-trivial new features
   - **Simple** (concise, skip alternatives): documentation, style fixes,
     minor bugs, routine test additions, dependency patches

3. **Document the infeasibility** of dynamic variant switching in
   `CODING_HARNESS.md` to prevent re-investigation.

This leverages GLM-5.2's native turn-level reasoning capability — the model
adjusts its reasoning depth based on prompt guidance, without requiring
config-level variant switching.

## Consequences

**Positive:**
- Better plan quality for complex tasks via explicit complexity classification
- `high` variant provides a cost/quality balance — more capable than `medium`,
  less expensive than `max`
- Prompt heuristics are trivially reversible and adjustable
- Config assertion tests lock in the intended variant and prompt content

**Negative:**
- All planning tasks use `high` variant — simple tasks pay slightly more token
  cost than they would with `medium`
- Prompt-based heuristics rely on the model's compliance — not a hard
  guarantee like a config-level variant switch would be
- Dynamic variant switching remains impossible without upstream opencode
  support

**Fallback:**
- If `high` variant proves too costly, revert to `medium` — the prompt
  heuristics still provide value regardless of variant
- If upstream opencode adds a model selection hook, revisit dynamic variant
  switching and supersede this ADR

## Alternatives Considered

1. **`max` variant for all planning tasks** — rejected. `max` consumes
   significantly more tokens than `high` across all tasks without
   proportionate quality gains for simple tasks. The `build`, `general`,
   and `explore` agents use `max` because they execute code; the plan agent
   only analyzes and writes plans.

2. **Plugin-based prompt injection via `experimental.chat.system.transform`**
   — rejected. Functionally equivalent to editing the agent prompt directly
   (the hook can only push strings into the system prompt). Adds plugin
   complexity without adding capability. See ADR-0008.

3. **Upstream feature request only** — rejected as sole approach. While a
   feature request against `anomalyco/opencode` for a model selection hook
   is worthwhile long-term, it doesn't address the immediate need. The
   prompt-based approach provides value now.

4. **Reject the issue entirely** — rejected. The intent (deeper reasoning for
   complex tasks) is valid and addressable through prompt engineering, even
   though the proposed mechanism (dynamic variant switching) is not.
