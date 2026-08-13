# 0013. Configurable Variant via {env:VAR} Substitution

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-10

## Status

Accepted

Partially supersedes ADR-0012 (variant clause only).
Partially superseded by ADR-0022 (variant-location clause).

Sourcing clauses superseded by ADR-0029 (delivery mechanism changed from shell-sourced .env files to jq-parsed setup.json). {env:VAR} substitution pattern preserved.

## Context

ADR-0012 established `{env:VAR}` substitution for model IDs across three tiers
(PRIMARY, PLANNER, UTILITY) but explicitly decided that `variant` remain as
hard-coded literals:

> variant and temperature remain as literals in opencode.json and agent .md
> frontmatter. The {env:VAR} mechanism returns strings; temperature is a numeric
> type. More importantly, variant and temperature are behavior-tuning
> parameters... not model-selection parameters.

GitHub issue #112 requested configurable model variants for agent assignments.
The issue proposed `${variable.variant}` syntax with a custom `~/.opencode/setup.json`
schema. Investigation against vendored opencode docs (v0.59.0+) confirmed that
opencode supports only two substitution mechanisms — `{env:VAR}` and `{file:path}`
— and does not support custom resolution logic. The proposed `${variable.variant}`
syntax is infeasible.

However, a prototype was conducted to test whether opencode's native `{env:VAR}`
substitution works in the `variant` field of agent configs. Results:

| Field | `{env:VAR}` | Result |
|-------|-------------|--------|
| `variant` (string) | `{env:OPENCODE_VARIANT_TEST}` with env=`max` | PASS — resolved correctly |
| `temperature` (numeric) | `{env:OPENCODE_TEMP_TEST}` with env=`0.2` | FAIL — resolved to empty string, config invalid |

Temperature is numeric and opencode does not coerce string env var values
to numeric for the `temperature` field. Temperature remains a hard-coded literal.

ADR-0011 investigated and rejected *dynamic* per-turn variant switching (no
plugin hook, no `dynamic_variant` config key). This ADR addresses *static*
variant configuration — the value is resolved once at config-load time via
`{env:VAR}`, consistent with ADR-0012's model pattern.

A tier conflict emerged: the PLANNER tier contained `plan` (variant=high) and
`judge` (variant=medium). A single `OPENCODE_VARIANT_PLANNER` env var would
force them to share, either upgrading judge to high or downgrading plan to
medium. Adding a separate JUDGE tier preserves each agent's behavior.

## Decision

We extend ADR-0012's `{env:VAR}` pattern to also cover the `variant` field in
all agent configs. We add a fourth tier (JUDGE) to resolve the PLANNER tier
conflict between plan and judge variants. Temperature remains a hard-coded
literal (confirmed infeasible for `{env:VAR}` by prototype).

### Four-tier system (8 env vars total)

| Tier | Model Env Var | Variant Env Var | Default Model | Default Variant | Agents |
|------|--------------|-----------------|---------------|-----------------|--------|
| PRIMARY | `OPENCODE_MODEL_PRIMARY` | `OPENCODE_VARIANT_PRIMARY` | `deepseek/deepseek-v4-pro` | `max` | build, general, explore, @architect, @code-review, @debug, @resolve-merge-conflicts, @tdd, @test-audit |
| PLANNER | `OPENCODE_MODEL_PLANNER` | `OPENCODE_VARIANT_PLANNER` | `openrouter/z-ai/glm-5.2` | `high` | plan |
| JUDGE | `OPENCODE_MODEL_JUDGE` | `OPENCODE_VARIANT_JUDGE` | `openrouter/z-ai/glm-5.2` | `medium` | judge |
| UTILITY | `OPENCODE_MODEL_UTILITY` | `OPENCODE_VARIANT_UTILITY` | `deepseek/deepseek-v4-flash` | `medium` | compaction, title, summary, @docs-writer, @semgrep |

### What ADR-0012's decision is superseded

ADR-0012's clause: "variant and temperature remain as literals in opencode.json
and agent .md frontmatter." — This is partially superseded:
- **variant** — now uses `{env:VAR}` substitution, consistent with the model field.
- **temperature** — remains a hard-coded literal (confirmed infeasible for `{env:VAR}`).

### What remains from ADR-0012

- The tier-based model assignment pattern (now four tiers)
- `{env:VAR}` as the sole substitution mechanism
- `.opencode/models.default.env` as the committed defaults file
- `.envrc` (direnv) sourcing chain
- `/setup` command for interactive configuration
- Harness tests enforcing invariants
- `variant` is a string field — `{env:VAR}` returns strings, so no type coercion needed

### JUDGE tier rationale

The PLANNER tier previously contained both `plan` (variant=high) and `judge`
(variant=medium). A single env var per field would force them to share values.
Adding a separate JUDGE tier preserves each agent's independently configurable
variant while defaulting to their current values. The JUDGE tier's default model
remains `openrouter/z-ai/glm-5.2` (same as PLANNER) but is now independently
overridable.

### Temperature stays literal

The prototype confirmed that `{env:VAR}` substitution in the `temperature` field
resolves to an empty string `""`, not the env var value. Opencode reports:
`Expected number | undefined, got "" agent.test-agent.temperature`. Temperature
is a numeric field and opencode does not coerce string env var values to numeric.
Temperature remains a hard-coded literal in `opencode.json` and agent `.md`
frontmatter. Future opencode versions may add type coercion; if they do, this
ADR can be amended.

## Consequences

**Positive:**
- Variant is now user-configurable without editing config files
- Consistent `{env:VAR}` pattern for model and variant fields
- JUDGE tier gives judge agent independent configurability
- `/setup` command provides guided variant configuration per tier
- No type coercion risk — `variant` is a string field, `{env:VAR}` returns strings
- Plan agent's `high` variant remains the default (preserves ADR-0011's complexity assessment intent)

**Negative:**
- 8 env vars total (4 models + 4 variants) — more complex than the original 3
- Temperature is still hard-coded (infeasible with current opencode)
- Tier rigidity — all agents within a tier share variant values
- PLANNER is a single-agent tier (only plan) — slightly wasteful
- JUDGE tier shares model default with PLANNER (duplicate env var)

**Neutral:**
- ADR-0012's model-ID tier decision remains unchanged
- ADR-0011's dynamic switching finding remains in effect (this is static config)
- direnv sourcing chain unchanged
- Merge semantics unchanged

## Alternatives Considered

1. **Keep variant as literals (status quo)** — rejected; issue #112 explicitly
   requests variant configurability, and the prototype confirms feasibility for
   string fields.
2. **`${variable.variant}` syntax with custom resolution** — rejected; opencode
   does not support custom variable syntax or resolution hooks.
3. **Per-agent env vars** — rejected; 8+ env vars for variant alone is excessive
   and defeats the tier-based simplification.
4. **3-tier system, force PLANNER uniformity** — rejected; would change either
   plan's or judge's variant behavior. The 4th JUDGE tier preserves both.
5. **Include temperature** — rejected after prototype failure; opencode does
   not coerce string→numeric for `temperature`. Temperature stays literal.

## Cross-references

- ADR-0012 — partially superseded (variant clause only; model-ID and temperature decisions remain)
- ADR-0011 — dynamic variant switching infeasible; this ADR is static-only
- ADR-0007 — `/setup` token strategy; variant values are not identity tokens
- GitHub issue #112 — the feature request this addresses (7 of 10 criteria addressed)
