# $KYAULabs: model-configuration.md kyau@nova 2026/07/10 -0700 Exp $

# Model Configuration

This guide explains how the KYAULabs harness assigns models, variants, and
temperatures — and how to look up the correct values when swapping in a
non-default model. For the architectural decisions behind this system, see
ADR-0012 (configurable model variables), ADR-0013 (configurable variant via
env var), and ADR-0031 (model rebalance for z.ai Pro plan).

## 1. How the harness assigns models

The harness uses a **six-tier** system. Each tier maps to a model and a
variant, both driven by environment variable substitution (`{env:VAR}`):

| Tier | Model env var | Variant env var | Default model | Default variant | Agents |
| --- | --- | --- | --- | --- | --- |
| PRIMARY | `OPENCODE_MODEL_PRIMARY` | `OPENCODE_VARIANT_PRIMARY` | `zai-coding-plan/glm-5.2` | `max` | build, tdd, debug, resolve-merge-conflicts, general |
| PLANNER | `OPENCODE_MODEL_PLANNER` | `OPENCODE_VARIANT_PLANNER` | `openai/gpt-5.6-sol` | `xhigh` | plan, from-issue, architect, consult, tracker-operator |
| DESIGN | `OPENCODE_MODEL_DESIGN` | `OPENCODE_VARIANT_DESIGN` | `openai/gpt-5.6-sol` | `xhigh` | design |
| JUDGE | `OPENCODE_MODEL_JUDGE` | `OPENCODE_VARIANT_JUDGE` | `deepseek/deepseek-v4-pro` | `medium` | code-review, standards-review, spec-review, test-audit, judge, explore |
| UTILITY | `OPENCODE_MODEL_UTILITY` | `OPENCODE_VARIANT_UTILITY` | `deepseek/deepseek-v4-flash` | `medium` | compaction, title, summary, docs-writer, semgrep |
| FRONTEND | `OPENCODE_MODEL_FRONTEND` | `OPENCODE_VARIANT_FRONTEND` | `openai/gpt-5.6-sol` | `xhigh` | frontend |

PLANNER and DESIGN are backed by `openai/gpt-5.6-sol` via **ChatGPT-Plus
subscription OAuth** (not an API key) — the first such tier backing in this
harness. The binding economic constraint for those tiers is the Plus weekly
window (surfaced by `@slkiser/opencode-quota`), not per-token cost. See
ADR-0040.

FRONTEND also runs `openai/gpt-5.6-sol` via ChatGPT-Plus OAuth (ADR-0049),
sharing the same rolling weekly window as PLANNER and DESIGN. Sol use for
frontend implementation can consume weekly quota faster. When capacity is
low, operators override the FRONTEND manifest values
(`OPENCODE_MODEL_FRONTEND` / `OPENCODE_VARIANT_FRONTEND` via `/setup` or
`prism.jsonc`) or select another model manually — there is **no automatic fallback**.
The sole consumer of the FRONTEND tier is the hidden `@frontend`
subagent at literal temperature `0.3`. `@tdd` owns the Red → Green → Refactor
slice: it consults `@frontend` for a standards checklist before Red and
delegates implementation only after a failing test exists (ADR-0049).

The **judge** agent is `hidden: true` — it does not appear as a TUI tab.
It is eval-only (invocable by the eval runner by agent name, same mechanism
as the built-in hidden `compaction`/`title`/`summary` agents). See ADR-0030.

**`{env:VAR}` substitution:** Both `model` and `variant` fields in
`opencode.jsonc` use `{env:OPENCODE_MODEL_*}` and
`{env:OPENCODE_VARIANT_*}` references (per ADR-0022, `model:`/`variant:`
are rejected in `.opencode/agents/*.md` frontmatter — those files carry
only `description`, `mode`, `temperature` (literal), and `permission`).
These resolve at startup from the
environment.

**`temperature` is a literal:** Unlike model and variant, `temperature`
cannot use `{env:VAR}` — opencode does not coerce string env var values to
numeric (confirmed by prototype in ADR-0013). Every agent has an explicit
numeric `temperature` in its config. An arch test
(`every agent has an explicit temperature`) enforces this — if you add an
agent without a temperature, the test fails.

**Sourcing chain:**

1. `prism.jsonc` (models section) — committed defaults, extracted by
   direnv `.envrc` (via `prism_manifest.php env0`) on directory entry.
2. `~/.config/opencode/prism.jsonc` — user overrides (configured via `/setup`),
   field-by-field overlay on top of the project defaults per ADR-0043.
3. `OPENCODE_CONFIG_CONTENT` — inline JSON composed by
   `prism_manifest.php env0` from the resolved manifest; Prism owns MCP
   `enabled` leaves, quota plugin membership, and four literal
   `agent.frontend.permission.edit` leaves here, preserving all unrelated
   inline config keys and plugin entries (ADR-0045, ADR-0051).

## 2. What `variant` actually is

`variant` is a **reasoning-effort selector**. It is only meaningful for
reasoning / "thinking" models — a plain chat model will ignore or reject it.

### The four conventional values

| Value | Meaning |
| --- | --- |
| `max` | Highest reasoning effort. Most reasoning tokens per turn. Highest cost and latency. |
| `high` | Strong reasoning. Balanced cost/quality for complex tasks. |
| `medium` | Moderate reasoning. Lower cost, suitable for routine tasks. |
| `low` | Minimal reasoning. Lowest cost, for simple/deterministic tasks. |

### How variant maps to provider concepts

| Provider | What `variant` controls |
| --- | --- |
| Anthropic | Extended-thinking budget tokens |
| OpenAI | Reasoning effort (`none` / `minimal` / `low` / `medium` / `high` / `xhigh`). **Note:** the OpenAI API also exposes `max`, but opencode's built-in variants top at `xhigh` (ADR-0040). |
| Google | Thinking budget |
| DeepSeek | `reasoning_effort` parameter. **Note:** in thinking mode, `low` and `medium` are mapped to `high`; only `high` (default) and `max` produce distinct behavior. |
| Z.ai (GLM) | Thinking mode + effort level. **Note:** `max` maps to ExtraHigh (equivalent to OpenAI's `xhigh`) — the highest reasoning GLM offers, but not an absolute maximum across providers. DeepSeek's `max` is its true maximum. Variant values are provider-relative, not absolute. |
| OpenRouter | Passes through to the underlying provider |
| Ollama | Usually n/a (local, non-reasoning unless running a reasoning model) |

**Cost / latency / quality tradeoff:** More reasoning tokens = higher cost
and latency, with diminishing quality returns. `max` is not always better
than `high` — for read-only tasks (exploration, search, audits), `high` or
`medium` is often sufficient.

## 3. How to look up a model before configuring it

For each provider, the canonical source of truth for the model-ID string,
supported variants, context window, max output tokens, and pricing:

| Provider | Where to look |
| --- | --- |
| OpenCode registry | `opencode models` CLI command + the opencode.ai/docs models page |
| Anthropic | docs.anthropic.com — model names + extended-thinking support matrix |
| OpenAI | platform.openai.com/docs/models — reasoning effort support per model |
| Google AI | ai.google.dev/gemini-api/docs/models — thinking budget support |
| DeepSeek | api-docs.deepseek.com — reasoning-content models + thinking mode |
| Z.ai | docs.z.ai — GLM thinking models + effort levels |
| OpenRouter | openrouter.ai/models — best single cross-provider reference: context window, pricing, supported parameters, and reasoning support in one card |
| Ollama | ollama.com/library — local model library; check whether the tag is a reasoning model |

### Pre-configuration checklist

- [ ] Model ID matches the opencode `provider/model` format exactly
      (case-sensitive)
- [ ] Model supports `variant` (if you set one) — or confirm it's a no-op
- [ ] Context window &ge; the largest input the agent feeds (compaction needs
      the most — it feeds a full transcript)
- [ ] Max output tokens &ge; the agent's expected response length
- [ ] Pricing fits the tier's call frequency (UTILITY is the highest-frequency
      tier)

## 4. Choosing a variant per tier

The task-type &rarr; variant decision frame (applies within the six-tier
constraint — all agents in a tier share one variant):

| Task profile | Example agents | Recommended variant |
| --- | --- | --- |
| Complex code generation | build, tdd, debug, resolve-merge-conflicts | `max` |
| General research | general | `max` (feeds coding with cross-model diversity) |
| Planning / decomposition | plan, from-issue, architect, consult | `xhigh` (OpenAI/GPT-5.6 Sol via ChatGPT-Plus OAuth; planning quality directly determines code quality downstream; ADR-0040) |
| Creative design / approach exploration | design | `xhigh` (OpenAI/GPT-5.6 Sol via ChatGPT-Plus OAuth; warmer temperature `0.3` differentiates from PLANNER; ADR-0040) |
| Frontend implementation | frontend | `xhigh` (OpenAI/GPT-5.6 Sol via ChatGPT-Plus OAuth; literal temperature `0.3`; `@tdd`-owned two-phase handoff; ADR-0049) |
| Cross-model review | code-review, standards-review, spec-review, test-audit, judge | `medium` (functionally `high` on DeepSeek per variant collapse) |
| Codebase exploration | explore | `medium` (JUDGE-tier cross-model diversity before planning) |
| Routine summarisation | compaction, title, summary | `low`&ndash;`medium` |
| Doc generation / tool interpretation | docs-writer, semgrep | `medium` |

**Tier rigidity note:** All agents in a tier share one variant. When a tier
mixes task profiles (PRIMARY mixes codegen + read-only; UTILITY mixes
summarisation + doc-gen), pick the value that doesn't under-serve the most
demanding agent in the tier. Splitting a tier is a structural change (new env
var + new ADR) — only do it when measured cost or quality data justifies it.

**DeepSeek flash caveat:** On `deepseek-v4-flash` (the current UTILITY
model), `variant=medium` is functionally equivalent to `high` because
DeepSeek maps `low`/`medium` &rarr; `high` in thinking mode. The field is not a
no-op — it is accepted and processed — but the intermediate values collapse.
This is documented here so a future maintainer doesn't try to "fix" the
`medium` default or assume it's reducing cost.

## 5. Choosing a temperature per agent

`temperature` is a literal, set per-agent (not per-tier). The harness uses
these values:

| Temperature | Use case | Agents |
| --- | --- | --- |
| `0.0` | Deterministic grading / judgement | judge |
| `0.1` | Read-only analysis, search, audits | architect, code-review, test-audit, general, explore, plan, debug, docs-writer, semgrep, resolve-merge-conflicts |
| `0.2` | Structured output / faithful summarisation | build, tdd, compaction, summary |
| `0.3` | Creative design / approach exploration | design, frontend |
| `0.4` | Short-form natural generation | title |

**Why temperature can't be `{env:VAR}`:** See ADR-0013 prototype result —
opencode resolves `{env:VAR}` to a string, then rejects `"Expected number |
undefined"` when the field requires a numeric type.

**Override mechanism:** Prism composes `OPENCODE_CONFIG_CONTENT` from the resolved
manifest, owning the two MCP `enabled` leaves, quota plugin membership, and
four literal `agent.frontend.permission.edit` leaves — all other keys and
plugin entries are preserved (ADR-0045, ADR-0051). To change a single
agent's temperature without editing the repo, use the inline JSON
mechanism directly:

```bash
OPENCODE_CONFIG_CONTENT='{"agent":{"title":{"temperature":0.3}}}' opencode
```

Or edit the agent entry directly in `opencode.jsonc` (per ADR-0022, the `.opencode/agents/*.md` file carries only `description`/`mode`/`temperature`/`permission` — not `model` or `variant`).

## 6. Verifying a configuration

1. **Smoke check:** `opencode` launches without a "variant not supported" or
   "Expected number" error.
2. **Env var check:** After `direnv allow`, verify the sourcing chain:
   ```bash
   echo $OPENCODE_MODEL_PRIMARY
   echo $OPENCODE_VARIANT_PRIMARY
   ```
3. **Eval suite:** Run `.opencode/evals/` (see `.opencode/evals/bin/`)
   against the new model to measure quality before committing the change to
   `prism.jsonc` (models section).
4. **Harness tests:** Run the model-config tests:
   ```bash
   php vendor/bin/pest tests/Unit/Harness/ModelConfigTest.php
   ```
   The `every agent has an explicit temperature` test will fail if any agent
   is missing its temperature — that is intentional.

## 7. Changing the shipped defaults (maintainers)

1. Edit `prism.jsonc` — change the model and/or variant value(s)
   in the `models` section.
2. Update `tests/Unit/Harness/ModelConfigTest.php` — update the assertion(s)
   to match the new value(s).
3. Update the `/setup` summary table in `.opencode/commands/setup.md`.
4. Update the tier table in `CODING_HARNESS.md` &sect; Model Configuration.
5. Update the tier table in `README.md` &sect; Model Configuration.
6. Write or update the ADR (see `adr/` directory, Nygard format).
7. Run `php vendor/bin/pest tests/Unit/Harness/` to verify all tests pass.

The arch test (`every agent has an explicit temperature`) will fail if you
add an agent without a temperature — that is intentional.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
