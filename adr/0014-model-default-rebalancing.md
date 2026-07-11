# $KYAULabs: 0014-model-default-rebalancing.md kyau@nova 2026/07/10 -0700 Exp $

# 0014. Model Default Rebalancing and Temperature Explicitness

Date: 2026-07-10

## Status

Accepted

Partially supersedes the default-value column of ADR-0013 (the variant
substitution mechanism itself stands unchanged).

## Context

ADR-0013 shipped `OPENCODE_VARIANT_PRIMARY='max'` and omitted the
`temperature` field on six agents (`general`, `explore`, `compaction`,
`title`, `summary` in `opencode.json`; `test-audit` in
`.opencode/agents/test-audit.md`). These six agents silently inherited
opencode's built-in default temperature — an invisible behaviour that drifts
if opencode changes its default and is almost certainly wrong for at least
`title` (too low → repetitive titles) and `compaction`/`summary` (too high →
unfaithful summaries).

GitHub issue #113 proposed two changes:
1. **Re-tune the PRIMARY variant** from `max` to `high` (Path A) to reduce
   cost/latency on the five read-only PRIMARY agents.
2. **Add explicit temperatures** to the six under-specified agents.

The temperature gaps are clear and uncontested — they are fixed in this ADR.
The variant change was evaluated against two paths:

- **Path A (change to `high`):** Reduces reasoning-token spend on five
  read-only PRIMARY agents (architect, code-review, test-audit, general,
  explore). Users who need `max` override via `~/.config/opencode/models.env`.
- **Path B (keep `max`):** Retains highest reasoning quality for the four
  codegen agents (build, tdd, debug, resolve-merge-conflicts) at higher cost.
  The discovery doc (`.opencode/docs/model-configuration.md`) carries the
  cost-guidance for users who want to override.

Additionally, research into `deepseek/deepseek-v4-flash` (the UTILITY-tier
model) revealed that it **does accept `variant`** — it is a reasoning model
with thinking mode enabled by default (source: DeepSeek API docs, OpenRouter).
However, DeepSeek maps `low` and `medium` to `high` in thinking mode; only
`high` (default) and `max` produce distinct behavior. This means the UTILITY
tier's `variant=medium` is functionally equivalent to `high`. The field is
not a no-op, but the intermediate values collapse.

## Decision

1. **Keep `OPENCODE_VARIANT_PRIMARY='max'`** (Path B). The shipped default
   retains the highest reasoning quality for codegen agents. Users who want
   to reduce cost can override to `high` via `~/.config/opencode/models.env`
   — the escape hatch already exists and is documented in the discovery guide.

2. **Add explicit temperatures** to the six under-specified agents:

   | Agent | Location | Temperature | Rationale |
   | --- | --- | --- | --- |
   | `general` | `opencode.json` | `0.1` | Read-only multi-step research; wants determinism |
   | `explore` | `opencode.json` | `0.1` | Read-only pattern search; wants determinism |
   | `compaction` | `opencode.json` | `0.2` | Faithful summarisation; matches `build`/`tdd` |
   | `title` | `opencode.json` | `0.4` | Short-form natural generation; avoids repetitive titles |
   | `summary` | `opencode.json` | `0.2` | Faithful summarisation; matches `compaction` |
   | `test-audit` | `.opencode/agents/test-audit.md` | `0.1` | Deterministic audit; matches `architect`/`code-review` |

3. **Keep `OPENCODE_VARIANT_UTILITY='medium'`** — the DeepSeek variant
   mapping (`medium` → `high`) is documented in the discovery guide. Do not
   split the UTILITY tier in this issue — that is a structural change for a
   separate follow-up if cost data justifies it.

4. **Add an arch test** (`every agent has an explicit temperature — no silent
   default inheritance`) to `tests/Unit/Harness/ModelConfigTest.php` that
   fails if any agent in `opencode.json` or `.opencode/agents/*.md` omits
   `temperature`. This prevents the silent-inheritance gap from recurring.

5. **Create a discovery document** (`.opencode/docs/model-configuration.md`)
   that tells a user — for any model, on any supported provider — where to
   look up the model ID, which variant values it accepts, what its context
   window / max-output-token budget is, and how to map a task type onto a
   `variant` + `temperature` pair. Includes eight per-provider references
   (OpenCode registry, Anthropic, OpenAI, Google, DeepSeek, Z.ai, OpenRouter,
   Ollama) and the DeepSeek variant-mapping caveat.

## Consequences

**Positive:**
- All 16 agents now have explicit, reviewable temperature values — no more
  silent inheritance of opencode defaults
- Arch test prevents future temperature drift (adding an agent without
  temperature fails the test intentionally)
- Discovery doc replaces the "guess" approach with a procedure for
  non-default models
- DeepSeek variant-mapping caveat is documented so future maintainers don't
  try to "fix" the `medium` default or assume it's reducing cost
- `/setup` variant prompts now include `low` and point to the discovery doc
- README tier table is now a consistent 4-tier table (Judge was previously
  missing as a separate row)

**Negative:**
- PRIMARY retains `max` — higher cost than `high` for the five read-only
  PRIMARY agents; users must explicitly override to reduce cost
- UTILITY `medium` is functionally `high` on DeepSeek — no cost savings from
  the intermediate value on the current defaults

**Neutral:**
- ADR-0013's variant substitution mechanism stands unchanged
- ADR-0012's model-ID tier decision remains
- Direenv sourcing chain unchanged
- The `{env:VAR}` → numeric temperature problem remains unsolved (per ADR-0013
  prototype — opencode does not coerce string env var values to numeric)

## Alternatives Considered

1. **Path A — change PRIMARY to `high`** (the issue's original recommendation)
   — rejected per user decision. `max` retains the highest reasoning quality
   for codegen agents; users who want to reduce cost can override via
   `~/.config/opencode/models.env`.
2. **Split the UTILITY tier** — rejected. The tier rigidity constraint means
   changing `medium` to `low` would risk quality for `docs-writer` and
   `semgrep`. Splitting is a structural change for a separate follow-up if
   cost data justifies it.
3. **Leave temperatures as inherited defaults** — rejected. The silent
   inheritance is invisible to reviewers, drifts if opencode changes its
   default, and is almost certainly wrong for `title` and `compaction`/`summary`.

## Cross-references

- ADR-0011 — Plan agent complexity assessment (variant per task type)
- ADR-0012 — Configurable model variables (the `{env:VAR}` mechanism)
- ADR-0013 — Configurable variant via env var (partially superseded — the
  variant mechanism stands; the default-value column is re-examined here)
- GitHub issue #113 — the feature request this addresses

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
