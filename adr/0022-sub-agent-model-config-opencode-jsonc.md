# 0022. Sub-Agent Model Configuration Lives in opencode.jsonc, Not .md Frontmatter

Date: 2026-07-16

## Status

Accepted

Partially supersedes ADR-0012 (model-location clause).
Partially supersedes ADR-0013 (variant-location clause).
ADR-0014 (temperature explicitness) is unaffected.

## Context

ADR-0012 ("Configurable Model Variables via {env:VAR} Substitution")
established that `{env:VAR}` model references would live in both
`opencode.json` (for primary agents) and `.opencode/agents/*.md` frontmatter
(for subagents). It explicitly rejected the alternative "Remove explicit
`model:` fields, use top-level inheritance only" — reasoning that this would
lose three-tier differentiation.

In practice, and as enforced by `tests/Unit/Harness/ModelConfigTest.php`, all
20 agents have their `model`, `variant`, and `temperature` fields defined in
**`opencode.jsonc`'s `agent` section** — not in `.opencode/agents/*.md`
frontmatter. The `.md` files carry only `description`, `mode: subagent`,
`temperature` (literal, per ADR-0014), and `permission`.

The `@opencode-ai/plugin` v1.18.3 runtime rejects `model:` and `variant:`
fields in sub-agent `.md` frontmatter with a configuration error. Three
agents (`@code-review`, `@spec-review`, `@standards-review`) were added with
redundant `model:` lines in their `.md` frontmatter during the 4-axis code
review coordinator work — these lines duplicated the authoritative config
already present in `opencode.jsonc`.

ADR-0012's rejected alternative (remove explicit model fields from .md files)
feared loss of tier differentiation. This fear is unfounded:
tier-separated model assignment is fully preserved via `opencode.jsonc`'s
`agent` section, where each agent has an independently specified `model`
field using `{env:OPENCODE_MODEL_*}` references.

## Decision

1. **Model and variant config lives exclusively in `opencode.jsonc`'s
   `agent` section.** The `.opencode/agents/*.md` files do NOT carry
   `model:` or `variant:` frontmatter fields.

2. **The `.md` files carry only `description`, `mode: subagent`,
   `temperature` (a literal numeric value, per ADR-0014), and
   `permission`** — the fields that the runtime accepts from sub-agent
   frontmatter.

3. **A regression test (`ModelConfigTest.php`) asserts no `.md` file
   contains `model:` or `variant:`** — a repeat of the three redundant
   lines will fail the test suite.

4. **Tier differentiation is preserved** — each agent in the `agent`
   section of `opencode.jsonc` has its own `model` + `variant` fields,
   independently targeting PRIMARY, PLANNER, JUDGE, or UTILITY tiers.

5. **The `@opencode-ai/plugin` dependency is updated** from 1.17.15 to
   1.18.3, matching the runtime version that introduced the frontmatter
   restriction.

## Consequences

**Positive:**
- `.md` files are simpler — only runtime-supported fields, no redundant
  duplication with `opencode.jsonc`.
- Single source of truth for model/variant assignment — `opencode.jsonc`
  `agent` section.
- Runtime configuration error is fixed — sub-agents no longer trigger
  rejection on `model:`/`variant:` frontmatter fields.
- Regression test prevents re-emergence of redundant model/variant lines.

**Negative:**
- None material. Tier differentiation is preserved; no agent changes model.

**Neutral:**
- Temperature remains duplicated across both `opencode.jsonc` and `.md`
  frontmatter (pre-existing, required by both `ModelConfigTest.php` and
  ADR-0014's explicitness mandate). This duplication is outside the scope
  of this ADR.
- The `opencode.json` vs `opencode.jsonc` naming inconsistency in AGENTS.md
  (line 149 — `opencode.json`) is a pre-existing issue in a comment about
  `Plan-by:` derivation, not addressed here.

## Alternatives Considered

### Keep `model:` in `.md` frontmatter (status quo)

**Rejected.** The runtime (plugin 1.18.3+) rejects it. This is not a
choice — it is a configuration error that prevents the agent from loading.

### Remove explicit model from both locations; rely on top-level inheritance

**Rejected.** This would lose the three-tier differentiation that
ADR-0012/0013/0014 were designed to support. `@docs-writer` and `@semgrep`
must remain on the UTILITY tier; `@from-issue` must remain on the PLANNER
tier. Top-level inheritance would collapse all sub-agents to PRIMARY.

### Move ALL agent config to `.md` files and remove from `opencode.jsonc`

**Rejected.** The runtime does not accept `model:`/`variant:` in `.md`
frontmatter. Even if it did, `.md` YAML frontmatter is less structured
than `opencode.jsonc`'s JSON — variants and temperatures would need
quoting, and the harness tests would need substantial rewrites.

## Cross-references

- ADR-0012 — partially superseded (model-location clause; the `{env:VAR}`
  mechanism and tier system stand)
- ADR-0013 — partially superseded (variant-location clause; the `{env:VAR}`
  variant mechanism and JUDGE tier stand)
- ADR-0014 — unaffected (temperature explicitness stands; temperature is
  still required as a literal in both opencode.jsonc and .md frontmatter)
- GitHub issue #139 — the issue whose branch carries this fix
