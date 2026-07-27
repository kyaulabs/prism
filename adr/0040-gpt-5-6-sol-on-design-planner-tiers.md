# 0040. GPT-5.6 Sol on DESIGN+PLANNER Tiers and `Implemented-by` Commit Footer

Date: 2026-07-27

## Status

Accepted

References ADR-0031 (prior rebalance + footer rename — the precedent this
extends), ADR-0030 (DESIGN tier), ADR-0013 (variant env var), ADR-0010
(footer/issue-ref convention). Does not supersede any ADR.

## Context

The operator acquired a ChatGPT Plus subscription, giving access to GPT-5.6 Sol
(OpenAI's flagship reasoning/coding model) through opencode's first-class
ChatGPT-Plus/Pro OAuth provider — a path OpenAI explicitly permits for
third-party developer tooling (unlike Anthropic, which prohibits the
equivalent). opencode authenticates via `/connect` → OpenAI → "ChatGPT
Plus/Pro"; no API key, no per-token billing. The binding economic constraint is
therefore the ChatGPT Plus **weekly window** (surfaced by the
`@slkiser/opencode-quota` plugin), not pay-per-token cost.

This is the **first harness tier backed by a subscription-OAuth auth model
rather than an API key.** It also creates a footer-attribution gap: ADR-0031 §4
sourced `Authored-by:` from `agent.plan.model` (PLANNER) on the rationale that
the creation pipeline (design → plan → build) was "all GLM". Once PLANNER moves
to Sol while PRIMARY (build/tdd) stays on GLM, that rationale breaks — a
`@tdd`-authored commit would carry `Authored-by: gpt-5.6-sol`, mislabelling
GLM-authored code. The `@architect` review flagged this as its leading
condition.

Two governing principles:

1. **Maximize quality-per-quota on high-leverage thinking** — DESIGN/PLANNER
   are low/medium-frequency, high-leverage tiers; Sol earns its place there.
2. **Attribute every model in the pipeline** — add an `Implemented-by:` footer
   sourced from PRIMARY so Sol (plan), GLM (code), and DeepSeek (review) are
   each represented, resolving the ADR-0031 §4 drift.

## Decision

### 1. Route GPT-5.6 Sol to DESIGN + PLANNER at `xhigh`

| Tier | Model | Variant | Agents |
|---|---|---|---|
| PRIMARY | `zai-coding-plan/glm-5.2` | `max` | build, tdd, debug, resolve-merge-conflicts, general |
| PLANNER | `openai/gpt-5.6-sol` | `xhigh` | plan, from-issue, architect, consult |
| DESIGN | `openai/gpt-5.6-sol` | `xhigh` | design |
| JUDGE | `deepseek/deepseek-v4-pro` | `medium` | code-review, standards-review, spec-review, test-audit, judge, explore |
| UTILITY | `deepseek/deepseek-v4-flash` | `medium` | compaction, title, summary, docs-writer, semgrep |

Only `setup.json` values change. The `{env:VAR}` indirection (ADR-0012/0022)
means no `opencode.jsonc`, `.envrc`, or agent-tier-membership edit. No agent
moves tier (unlike ADR-0031's 7-agent reassignment).

### 2. ChatGPT-Plus OAuth auth path; weekly-window economics

Tier placement is decided by call frequency × downstream leverage, not
per-token price. PRIMARY (highest frequency: every build turn, every `@tdd`
iteration) is excluded as the burn risk; Sol stays reachable ad-hoc via
`/models`. DESIGN (once per brainstorm) and PLANNER (once per feature) are the
defensible fit — high leverage, low window consumption. PRIMARY stays on
high-capacity flat-rate GLM (~166M tokens/week, ~41% utilized per ADR-0031),
which never hits the wall.

### 3. `xhigh` over a custom `max` variant

opencode's built-in OpenAI variants top at `xhigh`
(`none · minimal · low · medium · high · xhigh`); the API exposes a higher
`max` that opencode does not ship built-in. We choose the built-in `xhigh` for
zero-config reliability over the absolute peak. Per ADR-0031's "variant values
are provider-relative" principle, this is not a downgrade of intent: both GLM
`max` (ExtraHigh) and OpenAI `xhigh` are their provider's opencode-native
reasoning ceiling among shipped variants. The absolute-ceiling path (custom
`max` variant) is the documented fallback (spec §2.1 option B).

### 4. Cross-model review preserved and enriched

JUDGE stays DeepSeek. Post-change the generators span two providers (OpenAI on
DESIGN/PLANNER, GLM on PRIMARY) and the reviewer is a third (DeepSeek), so
DeepSeek now cross-reviews both OpenAI- and GLM-authored work. Moving JUDGE to
Sol would collapse the cross-model property into a self-review.

### 5. Operating model: manual `/models` fallback

When the weekly window runs low, the operator switches DESIGN/PLANNER sessions
back to GLM via `/models` for the remainder of the window. The
`@slkiser/opencode-quota` toast/sidebar surfaces the window. No auto-fallback
is engineered (YAGNI — opencode exposes no hook for it; two low-frequency
tiers don't justify one).

### 6. `Implemented-by:` commit footer (resolves the ADR-0031 §4 drift)

Add a fourth required trailer sourced from the PRIMARY tier:

| Footer | Tier source | Resolves to | Stage |
|---|---|---|---|
| `Authored-by:` | PLANNER (`agent.plan.model`) | `gpt-5.6-sol` | design/plan |
| `Implemented-by:` | PRIMARY (`agent.tdd.model` / `agent.build.model` inherit `{env:OPENCODE_MODEL_PRIMARY}`) | `glm-5.2` | code |
| `Tested-by:` | JUDGE (`agent.code-review.model`) | `deepseek-v4-pro` | review |
| `Signed-off-by:` | user (`resolve-identity.sh`) | `kyau <git@kyaulabs.com>` | human |

Pipeline order: `Refs:`/`Fixes:` → `Authored-by:` → `Implemented-by:` →
`Tested-by:` → `Signed-off-by:`. The commitlint `trailers-exist` rule is
extended to require `Implemented-by:`; the `issue-ref-convention` rule
(Refs/Fixes before Authored-by) is unchanged. Like the existing footers,
`Implemented-by:` is a fixed-source trailer applied uniformly regardless of
which agent authors the commit (dynamic per-author re-sourcing is explicitly
out of scope). This extends ADR-0031's footer-rename lineage and leaves
ADR-0010's ordering rule unaffected.

## Consequences

**Positive:**
- The strongest available model drives the two tiers where a single turn
  shapes the most downstream work (specs, plans).
- All three models in the pipeline are attributed in commit metadata
  (Sol/GLM/DeepSeek) — one footer per stage.
- The ADR-0031 §4 `Authored-by:` semantic drift is resolved (not merely
  documented) by the `Implemented-by:` addition.
- Cross-model review is enriched (DeepSeek reviews two generator providers).
- The change is mechanically minimal: 2 `setup.json` values flow through
  existing `{env:VAR}` indirection; no structural edit.

**Negative:**
- The Plus weekly window is a qualitative budget (not a published token count);
  exhaustion during heavy DESIGN/PLANNER use requires manual `/models` fallback.
- `Implemented-by:` (like the existing footers) is mechanically sourced from
  PRIMARY regardless of authoring agent, so a design-agent docs commit carries
  `Implemented-by: glm-5.2` even though no code was implemented — the same
  fixed-source imprecision the harness already accepts for `Authored-by`/
  `Tested-by` on docs commits.
- The `commit-msg_test.sh` footer-fixture ripple (13 fixtures) adds test
  maintenance surface, though breakage is detection-easy (commitlint rejects
  3-trailer messages noisily).

**Neutral:**
- PRIMARY, JUDGE, and UTILITY tiers are unchanged.
- The OpenAI API-key billing path is unused (irrelevant under ChatGPT-Plus
  auth).
- ADR-0031 is referenced, not superseded.

## Alternatives Considered

- **Put Sol on PRIMARY (the highest-volume tier):** Rejected. PRIMARY is the
  burn risk on a weekly window; defaulting it to Sol would exhaust the window
  during heavy `@tdd` sprints. Sol remains reachable ad-hoc via `/models`.
- **Put Sol on all thinking + coding tiers (DESIGN+PLANNER+PRIMARY):**
  Rejected. Same burn-risk problem, amplified.
- **Move JUDGE to Sol:** Rejected. Collapses the cross-model review property
  into a self-review.
- **Custom `max` variant over built-in `xhigh`:** Rejected as the default.
  Preserves the literal `max` string and hits Sol's absolute ceiling, but adds
  a config block and depends on the AI SDK passing `reasoningEffort:"max"`
  through (unverified). Kept as the documented fallback.
- **Document the `Authored-by:` drift as a known limitation (the architect's
  fallback):** Rejected in favour of the active fix. Adding `Implemented-by:`
  resolves the drift; mere documentation would leave commit metadata
  inaccurate.
- **Dynamic per-commit footer re-sourcing (footer = actual authoring agent's
  model):** Rejected. A different model from the harness's fixed-source footer
  convention; retained fixed-source for consistency.

## Cross-references

- ADR-0031 (referenced — prior rebalance + footer rename; the precedent extended)
- ADR-0030 (referenced — DESIGN tier independent-configurability rationale, exercised here)
- ADR-0013 (not contradicted — variant env-var mechanism preserved)
- ADR-0012 (not contradicted — `{env:VAR}` pattern preserved)
- ADR-0022 (not contradicted — agent config in `opencode.jsonc` preserved)
- ADR-0029 (not contradicted — `setup.json` structure preserved)
- ADR-0010 (not contradicted — issue-ref-before-Authored-by ordering preserved)
- Spec: `docs/specs/2026-07-27-gpt-5-6-sol-design-planner-tiers-spec.md`
- Plan: `docs/plans/2026-07-27-gpt-5-6-sol-design-planner-tiers.md`

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
