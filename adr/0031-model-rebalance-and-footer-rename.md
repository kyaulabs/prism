# $KYAULabs: 0031-model-rebalance-and-footer-rename.md kyau@nova 2026/07/20 -0700 Exp $

# 0031. Model Rebalance for z.ai Pro Coding Plan and Commit Footer Rename

Date: 2026-07-20

## Status

Accepted

Supersedes ADR-0014. Amends ADR-0010 (terminology).

## Context

The project was paying per-token for DeepSeek-V4-Pro as the PRIMARY build
model while the z.ai Pro coding plan's flat-rate GLM-5.2 quota sat idle
(68M tokens used last week = 41% of weekly Pro quota; full capacity ≈ 166M
tokens/week with ~98M unused). The original model-rebalance plan
(2026-07-19) proposed moving to GLM-5.2 for heavy agents but was written
before ADR-0030 added the DESIGN tier (5th tier). It also prioritized
cost-shifting — right-sizing variants down (`max` only for codegen, `high`
for planning). This ADR replaces that philosophy with a quality-first
approach: maximize GLM usage for all planning, design, and coding work,
preserve DeepSeek for cross-model review diversity, and right-size variants
to the task (not to the budget).

Three governing principles:

1. **Maximize token usage on real work** — the abundant GLM quota is better
   spent on higher-quality exploration and planning (which feeds coding) than
   hoarded.
2. **Keep model diversity where it earns its keep** — DeepSeek-V4-Pro reviews
   GLM's code (catches GLM-specific blind spots); DeepSeek-V4-Flash handles
   latency-sensitive micro-tasks.
3. **Reserve DeepSeek-Flash for micro-tasks** — `title`, `summary`,
   `compaction`, `docs-writer`, `semgrep` stay fast and cheap; don't stall
   the UI on a 3-word title or waste reasoning budget on a trivial summary.

## Decision

### 1. Model rebalance

| Tier | Model | Variant | Agents |
|---|---|---|---|
| PRIMARY | `zai-coding-plan/glm-5.2` | `max` | build, tdd, debug, resolve-merge-conflicts, general |
| PLANNER | `zai-coding-plan/glm-5.2` | `max` | plan, from-issue, architect, consult |
| DESIGN | `zai-coding-plan/glm-5.2` | `max` | design |
| JUDGE | `deepseek/deepseek-v4-pro` | `medium` | code-review, standards-review, spec-review, test-audit, judge, explore |
| UTILITY | `deepseek/deepseek-v4-flash` | `medium` | compaction, title, summary, docs-writer, semgrep |

### 2. Variant bumps

`variants.planner` and `variants.design` are bumped from `high` to `max`.
PRIMARY's `max` is unchanged. The bump is justified by the abundant GLM
quota (41% utilization) and the principle that planning and design quality
directly determine downstream coding quality. Temperature still
differentiates DESIGN (`0.3`) from PLANNER (`0.1`).

### 3. Agent reassignments (7 of 21 agents)

| Agent | From | To | Rationale |
|---|---|---|---|
| `architect` | PRIMARY | PLANNER | Read-only analysis feeding planning; both now GLM @ `max`. |
| `consult` | PRIMARY | PLANNER | Conversational exploration feeding planning. |
| `code-review` | PRIMARY | JUDGE | Cross-model review — DeepSeek catches GLM blind spots. |
| `standards-review` | PRIMARY | JUDGE | Same cross-model principle. |
| `spec-review` | PRIMARY | JUDGE | Same. |
| `test-audit` | PRIMARY | JUDGE | Same. |
| `explore` | PRIMARY | JUDGE | See §3a (Graphify) below. |
| `general` | PRIMARY | PRIMARY | General research feeds coding; no Graphify backing. Stays GLM @ `max`. |

### 3a. `explore` → JUDGE (Graphify clause)

Graphify (Graphify-Labs/graphify) is a deterministic code-graph
intelligence layer that will take priority over typical Explorer behavior
in the near future. It builds a codebase graph using 36 tree-sitter
grammars + Leiden clustering and answers exploration questions via BFS
traversal rather than LLM file-reading. When Graphify takes priority, the
Explorer LLM becomes a synthesis wrapper over structured graph output —
spending GLM @ `max` behind that would burn tokens redundantly against the
tool's own design intent.

`explore` therefore lands on JUDGE (DeepSeek-Pro @ `medium`, functionally
`high`) as a pre-Graphify bridge, with the cross-model diversity benefit of
having a different model's eyes on the codebase before planning synthesizes
it.

**Revisit trigger:** When Graphify integration lands, re-evaluate whether
`explore` should move further down (UTILITY/Flash) or be replaced by a
Graphify-native agent.

### 4. Commit footer rename

| Current | New | Sourcing | Resolves to |
|---|---|---|---|
| `Plan-by:` | `Authored-by:` | `agent.plan.model` | `glm-5.2` |
| `Acked-by:` | `Tested-by:` | `agent.code-review.model` | `deepseek-v4-pro` |

`Authored-by:` covers the full creation pipeline (design, plan, build — all
GLM). `Tested-by:` covers the full verification pipeline (code-review,
standards-review, spec-review, test-audit, judge, explore — all
DeepSeek-Pro). `Signed-off-by:` is unchanged.

### 5. `Tested-by:` sourcing change

`Tested-by:` is re-sourced from `agent.code-review.model` (JUDGE tier,
DeepSeek-Pro) instead of `agent.build.model` (PRIMARY tier, now GLM). If
sourcing stayed on `build.model`, `Tested-by:` would resolve to `glm-5.2`,
defeating the cross-model diversity intent.

This is a semantic shift: the footer now represents the verification model
rather than the build model. The two-model diversity lives in the commit
metadata (GLM authored, DeepSeek verified), mirroring the cross-model
review invariant.

### 6. GLM `max` = ExtraHigh caveat

Variant values are provider-relative, not absolute. GLM's `max` maps to
ExtraHigh (equivalent to OpenAI's `xhigh`) — the highest reasoning GLM
offers, but not an absolute maximum across providers. DeepSeek's `max` is
its true maximum. JUDGE at `medium` (functionally `high` on DeepSeek per
variant collapse) is deliberately below DeepSeek's `max` to keep the review
pipeline cross-model rather than asymmetric.

### 7. `Tested-by:` semantic extension

In Linux kernel convention, `Tested-by:` traditionally means "I ran the
tests and they passed." This ADR extends it to cover the full verification
pipeline. `Tested-by:` was chosen over `Reviewed-by:` because it is a
recognized git trailer and fits the automated-verification framing better.

### 8. Tier structure preserved (5 tiers)

PRIMARY, PLANNER, and DESIGN converge on the same model+variant (GLM-5.2
@ `max`). ADR-0030's rationale for keeping the DESIGN tier — independent
configurability — applies equally here. The `{env:VAR}` pattern makes tier
convergence costless. Temperature still differentiates the converged tiers.
Collapsing would reduce future flexibility for zero quality gain today.

## Consequences

**Positive:**
- GLM quota is maximized for quality work (planning, design, coding) rather
  than hoarded.
- Cross-model review (DeepSeek reviews GLM's code) is preserved and
  strengthened — JUDGE now has 6 agents reviewing GLM-authored output.
- Footer names accurately reflect the two-model pipeline (GLM authors,
  DeepSeek verifies) rather than describing a pipeline that no longer exerts.
- Tier-membership guard tests (4 new in ModelConfigTest.php) prevent future
  drift of agent tier assignments.
- `{env:VAR}` pattern is preserved — only values change, not structure.
- ADR-0030's DESIGN tier rationale is strengthened (independent
  configurability demonstrated by the ability to bump DESIGN to
  a different model without touching PLANNER).

**Negative:**
- Aurora submodule retains old `Plan-by:`/`Acked-by:` footer names until a
  separate upstream PR lands. Aurora commits may need manual footer
  adjustment in the interim.
- `Tested-by:` semantic extension may confuse readers familiar with the
  Linux kernel convention. Documented here and in `model-configuration.md`
  §2 and the `conventional-commits` skill.
- Both `Authored-by` and `Tested-by` are custom/extended footers (neither
  is a strict git convention, though `Tested-by` is a recognized trailer).
- `explore` → JUDGE ties an agent assignment to an unshipped external tool
  (Graphify). The revisit trigger in §3a addresses this.

**Neutral:**
- ADR-0014 is superseded but its temperature-explicitness mandate and arch
  test guard survive unaffected.
- ADR-0010 is amended (terminology: `Plan-by` → `Authored-by`).
- `.envrc` requires no changes — it already sources all 5 tiers.

## Alternatives Considered

- **3-tier collapse (remove PLANNER + DESIGN):** Rejected. Loses independent
  configurability per ADR-0030's rationale. `{env:VAR}` makes convergence
  costless structurally.
- **`Reviewed-by:` instead of `Tested-by:`:** Rejected. `Reviewed-by:` is
  narrower (doesn't cover testing/judging) and `Tested-by:` better fits the
  automated-verification framing.
- **Keep old footer names (`Plan-by:`/`Acked-by:`):** Rejected. `Plan-by`
  doesn't cover design/build; `Acked-by` semantically means the build
  acknowledged it (singular model), not the verification model.
- **Keep PLANNER/DESIGN at `high`:** Rejected. Quota data shows abundant
  headroom (41% utilization). Planning/design quality directly determines
  coding quality; the `max` bump maximizes the quality of work that feeds
  coding.

## Cross-references

- ADR-0014 (superseded — model default rebalancing)
- ADR-0010 (amended — terminology: `Plan-by` → `Authored-by`)
- ADR-0012 (not contradicted — `{env:VAR}` pattern preserved)
- ADR-0013 (not contradicted — variant mechanism preserved)
- ADR-0022 (not contradicted — agent config in `opencode.jsonc` preserved)
- ADR-0029 (not contradicted — `setup.json` structure preserved)
- ADR-0030 (not contradicted — DESIGN tier rationale strengthened)
- Spec: `docs/specs/2026-07-20-model-rebalance-spec.md`

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
