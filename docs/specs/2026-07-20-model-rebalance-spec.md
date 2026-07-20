# Prism Model Rebalance and Commit Footer Rename Spec

> **Date:** 2026-07-20
> **Status:** Approved (design phase)
> **Supersedes:** ADR-0014 (model default rebalancing)
> **Target repo:** `kyaulabs/prism` (branch off `develop`)
> **Related:** ADR-0012 (configurable model variables), ADR-0013 (configurable
> variant), ADR-0022 (sub-agent config in opencode.jsonc), ADR-0029 (unified
> setup.json), ADR-0030 (design primary agent and DESIGN tier)

---

## 1. Goal

Maximize the value of the z.ai Pro coding plan (abundant flat-rate GLM-5.2
quota) by routing all planning, design, and coding work to GLM-5.2 @ `max`,
while preserving cross-model review diversity by keeping the verification
pipeline on DeepSeek. The rebalance is justified by measured quota headroom:
68M tokens used last week = 41% of weekly Pro quota (full capacity ≈ 166M
tokens/week; ~98M unused).

Three governing principles (revised from the original 2026-07-19 plan, which
prioritized cost-shifting over quality):

1. **Maximize token usage on real work** — GLM-5.2 @ `max` (ExtraHigh) for
   all planning, design, and coding. The abundant quota is better spent on
   higher-quality exploration and planning (which feeds coding) than hoarded.
2. **Keep model diversity where it earns its keep** — DeepSeek-V4-Pro reviews
   GLM's code (catches GLM-specific blind spots); DeepSeek-V4-Flash handles
   latency-sensitive micro-tasks. A different model verifies GLM's work across
   the full verification pipeline.
3. **Reserve DeepSeek-Flash for micro-tasks** — `title`, `summary`,
   `compaction`, `docs-writer`, `semgrep` stay fast and cheap; don't stall
   the UI on a 3-word title or waste reasoning budget on a trivial summary.

---

## 2. Post-rebalance tier table

| Tier | Model | Variant | Agents | Why this variant |
|---|---|---|---|---|
| **PRIMARY** | `zai-coding-plan/glm-5.2` | `max` | build, tdd, debug, resolve-merge-conflicts, general | Highest-logic model for all actual coding + general research that feeds coding. Abundant flat-rate quota. |
| **PLANNER** | `zai-coding-plan/glm-5.2` | `max` | plan, from-issue, architect, consult | Highest-logic model for all planning. `high`→`max` bump: planning quality directly determines code quality downstream. |
| **DESIGN** | `zai-coding-plan/glm-5.2` | `max` | design | Highest-logic model for design/spec authorship. `high`→`max` bump: spec quality determines plan quality. Temperature 0.3 still differentiates from PLANNER. |
| **JUDGE** | `deepseek/deepseek-v4-pro` | `medium` | code-review, standards-review, spec-review, test-audit, judge, explore | Cross-model review — DeepSeek catches GLM blind spots. `medium` is functionally `high` per DeepSeek variant-collapse. Explore lands here as pre-Graphify bridge; post-Graphify synthesizes graph output. |
| **UTILITY** | `deepseek/deepseek-v4-flash` | `medium` | compaction, title, summary, docs-writer, semgrep | Latency-sensitive micro-tasks + tool interpretation. Unchanged. |

### 2.1 Variant semantics caveat (provider-relative, not absolute)

Variant values are **provider-relative**, not absolute. The current
`model-configuration.md` §2 documents DeepSeek's collapse (`low`/`medium` →
`high`) but does not document GLM's mapping. This spec adds the missing
caveat:

| Provider | `max` maps to | Notes |
|---|---|---|
| Z.ai (GLM) | **ExtraHigh** (equivalent to OpenAI's `xhigh`) | Highest reasoning GLM offers, but not an absolute maximum across providers. |
| DeepSeek | **Max** (true maximum) | DeepSeek's `max` is its true maximum reasoning effort. |

**Implication for JUDGE:** DeepSeek's `max` would be a higher absolute tier
than GLM's `max`/ExtraHigh, creating an asymmetric review pipeline rather
than a cross-model one. JUDGE stays at `medium` (functionally `high`) to
keep the review pipeline cross-model rather than asymmetric. This is a
deliberate choice, not an oversight.

---

## 3. What changes vs current state

### 3.1 Models (`.opencode/setup.json`)

| Key | From | To |
|---|---|---|
| `models.primary` | `deepseek/deepseek-v4-pro` | `zai-coding-plan/glm-5.2` |
| `models.planner` | `openrouter/z-ai/glm-5.2` | `zai-coding-plan/glm-5.2` |
| `models.design` | `openrouter/z-ai/glm-5.2` | `zai-coding-plan/glm-5.2` |
| `models.judge` | `openrouter/z-ai/glm-5.2` | `deepseek/deepseek-v4-pro` |
| `models.utility` | `deepseek/deepseek-v4-flash` | unchanged |

### 3.2 Variants (`.opencode/setup.json`)

| Key | From | To |
|---|---|---|
| `variants.primary` | `max` | `max` (unchanged) |
| `variants.planner` | `high` | `max` |
| `variants.design` | `high` | `max` |
| `variants.judge` | `medium` | `medium` (unchanged) |
| `variants.utility` | `medium` | `medium` (unchanged) |

### 3.3 Agent reassignments (`opencode.jsonc`)

Seven agents change tier membership; `general` is documented as
unchanged for guardrail purposes (a future accidental reassignment would
break the "highest-logic model for research that feeds coding" invariant).
For each changing agent, the `model` and `variant` env-var references on
its agent block change:

| Agent | From tier | To tier | Rationale |
|---|---|---|---|
| `architect` | PRIMARY | PLANNER | Read-only architectural analysis; feeds planning. Both tiers now GLM @ `max`, so this is a tier-label change for independent configurability. |
| `consult` | PRIMARY | PLANNER | Conversational project exploration; feeds planning. Same rationale. |
| `general` | PRIMARY | PRIMARY (unchanged) | General-purpose research that feeds coding with no Graphify-style tool backing. Stays on GLM @ `max`. |
| `explore` | PRIMARY | JUDGE | Pre-Graphify bridge (DeepSeek-Pro sufficient for glob/grep/read exploration); post-Graphify synthesizes graph output. Graphify will absorb exploration logic, making GLM @ `max` redundant. |
| `code-review` | PRIMARY | JUDGE | Cross-model review — DeepSeek catches GLM blind spots. |
| `standards-review` | PRIMARY | JUDGE | Same cross-model principle on structural review. |
| `spec-review` | PRIMARY | JUDGE | Same — reviews GLM-authored specs against requirements. |
| `test-audit` | PRIMARY | JUDGE | Same — reviews GLM-authored tests. |

**Net effect:** PRIMARY membership shrinks 12 → 5. JUDGE membership grows
1 → 6. PLANNER membership grows 2 → 4. DESIGN unchanged (1 agent).
UTILITY unchanged (5 agents).

### 3.4 Graphify context for `explore` reassignment

Graphify (Graphify-Labs/graphify) is a deterministic code-graph intelligence
layer that will take priority over typical Explorer behavior in the near
future. From its architecture:

- Builds a codebase graph using 36 tree-sitter grammars + Leiden clustering
- Three core commands answer every exploration question pattern:
  - `graphify query "<question>"` — BFS traversal returning a scoped subgraph
  - `graphify path <nodeA> <nodeB>` — shortest-hop path between concepts
  - `graphify explain <node>` — deep inspection of a specific node
- Explicit value proposition: "fewer tokens per query" — graph traversal
  replaces LLM file-reading

When Graphify takes priority, the Explorer LLM's job changes from "reason
about which files are relevant, read them, synthesize an answer" to "call
`graphify query`, read the scoped subgraph, write a concise summary for the
caller." The reasoning-heavy work moves into Graphify's deterministic graph
algorithms. Putting GLM @ `max` behind that would spend max-reasoning
tokens to synthesize a graph that was designed to *reduce* the need for
reasoning — burning tokens redundantly against the tool's own design intent.

`explore` therefore lands on JUDGE (DeepSeek-Pro @ `medium`, functionally
`high`) — sufficient for both pre-Graphify exploration and post-Graphify
graph-output synthesis, with the cross-model diversity benefit of having a
different model's eyes on the codebase before planning synthesizes it.

---

## 4. Commit footer rename

### 4.1 The rename

| Current | New | Sourcing | Resolves to |
|---|---|---|---|
| `Plan-by:` | `Authored-by:` | `agent.plan.model` (PLANNER → GLM-5.2) | `glm-5.2` |
| `Acked-by:` | `Tested-by:` | **`agent.code-review.model`** (JUDGE → DeepSeek-V4-Pro) | `deepseek-v4-pro` |
| `Signed-off-by:` | unchanged | `resolve-identity.sh` (3-tier fallback per ADR-0029) | user |

### 4.2 Sourcing change for `Tested-by:`

`Tested-by:` must be re-sourced from `agent.code-review.model` (JUDGE tier,
DeepSeek-Pro) instead of `agent.build.model` (PRIMARY tier, now GLM). If
sourcing stayed on `build.model`, `Tested-by:` would resolve to `glm-5.2` —
defeating the cross-model diversity intent.

This is a **semantic shift in what the footer represents**:

- Old `Acked-by:` (from `build.model`) = "the build agent acked this commit"
  (DeepSeek built it)
- New `Tested-by:` (from `code-review.model`) = "the verification pipeline
  model" (DeepSeek reviews/tests/audits GLM's work)

The footer now represents the **verification model**, not the build model.
This is honest: GLM authors (spec→plan→code), DeepSeek verifies
(review→test→audit→judge). The two-model diversity lives in the commit
metadata, mirroring the cross-model review invariant.

### 4.3 `Tested-by:` semantic extension note

In Linux kernel convention, `Tested-by:` traditionally means "I ran the
tests and they passed." This spec extends it to cover the full verification
pipeline (code-review, standards-review, spec-review, test-audit, judge,
explore). `Tested-by:` was chosen over `Reviewed-by:` because:

1. It is a recognized git trailer (git's `--format="%b"` and trailer
   machinery parse it natively).
2. It fits the "CICD testing" framing specified by the user.
3. `Reviewed-by:` would under-represent testing/judging/explore — "review"
   is narrower than what DeepSeek now does.

The semantic extension is documented in ADR-0031 so a future maintainer
understands the choice.

### 4.4 Trailer convention status

| Trailer | Status |
|---|---|
| `Signed-off-by:` | Standard — git core |
| `Tested-by:` | Standard — git core (Linux kernel convention) |
| `Authored-by:` | Custom — KYAULabs trailer (not a git convention, but git accepts any `Token: value` trailer) |

The rename trades one standard trailer (`Acked-by:`) for another standard
trailer (`Tested-by:`), and replaces one custom trailer (`Plan-by:`) with a
more accurate custom trailer (`Authored-by:`). Net: convention-alignment is
preserved on the verification footer and improved on the authorship footer.

---

## 5. File delta

### 5.1 Model configuration (the rebalance itself)

| File | Change |
|---|---|
| `.opencode/setup.json` | `models.primary/planner/design/judge` updated per §3.1; `variants.planner/design` updated per §3.2 |
| `opencode.jsonc` | 7 agents reassigned per §3.3: `architect`, `consult`, `explore`, `code-review`, `standards-review`, `spec-review`, `test-audit` change `model`/`variant` env-var references; `general` unchanged |

### 5.2 Commit footer rename

| File | Change |
|---|---|
| `commitlint.config.js` | `PLAN_BY_RE` regex: `Plan-by` → `Authored-by`; `trailers-exist` rule array: `['Plan-by:', 'Acked-by:', 'Signed-off-by:']` → `['Authored-by:', 'Tested-by:', 'Signed-off-by:']`; `issueRefConvention` function: `planByIdx` → `authoredByIdx`, placement rule message updated; comments referencing `Plan-by`/`Acked-by` updated |
| `.opencode/skills/conventional-commits/SKILL.md` | Footer names throughout; sourcing rule for `Tested-by:` = `agent.code-review.model`; all examples updated with new footer names + new model values (`glm-5.2` / `deepseek-v4-pro`); CAUTION block updated with `Tested-by:` semantic extension note |
| `.opencode/skills/writing-plans/SKILL.md` | Commit message examples (lines 155, 175): `Plan-by`/`Acked-by` → `Authored-by`/`Tested-by` with new model values |
| `AGENTS.md` | §Git Workflow (lines 166-178): footer names, sourcing rules, examples updated; `Tested-by:` sourcing documented as `agent.code-review.model` |
| `README.md` | §Model Configuration / commit footer section (lines 512-563): footer names, examples updated |
| `CONTRIBUTING.md` | Footer descriptions (lines 45-46): `Plan-by` → `Authored-by`, `Acked-by` → `Tested-by` with updated sourcing |
| `CONTEXT.md` | Line 119: ADR-0010 reference updated (`Plan-by` → `Authored-by`) |

### 5.3 Tests

| File | Change |
|---|---|
| `tests/Shell/commit-msg_test.sh` | All test cases: `Plan-by: x` → `Authored-by: x`, `Acked-by: x` → `Tested-by: x` (every `printf` and `VALID=` assignment); Test 11 comment: "Fixes: after Plan-by: rejected" → "Fixes: after Authored-by: rejected" |
| `tests/Unit/Harness/ModelConfigTest.php` | `it('has correct default variant values')`: `variants.planner` assertion `high` → `max`; `variants.design` assertion `high` → `max` |
| | `it('has OPENCODE_MODEL_JUDGE with correct default')`: assertion `openrouter/z-ai/glm-5.2` → `deepseek/deepseek-v4-pro` |
| | **New test:** `it('architect and consult use PLANNER tier')` — guard architect + consult model = `{env:OPENCODE_MODEL_PLANNER}` |
| | **New test:** `it('explore code-review standards-review spec-review test-audit use JUDGE tier')` — guard the 5 reassigned agents model = `{env:OPENCODE_MODEL_JUDGE}` |
| | **New test:** `it('general stays on PRIMARY tier')` — guard general model = `{env:OPENCODE_MODEL_PRIMARY}` (prevents accidental reassignment) |

### 5.4 Documentation

| File | Change |
|---|---|
| `.opencode/docs/model-configuration.md` | §1 tier table: update model values, variant values, agent membership (7 agents move tiers); §2 variant mapping: add GLM `max` = ExtraHigh caveat (provider-relative, not absolute max); note DeepSeek `max` = true Max; §4 variant-per-tier guidance: update PLANNER and DESIGN rows (`high` → `max`); update task-profile table for reassigned agents; §5 temperature table: unchanged |
| `.opencode/commands/setup.md` | Verify and update any footer name or tier table references during implementation |

### 5.5 ADRs

| File | Change |
|---|---|
| `adr/0031-model-rebalance-and-footer-rename.md` | **New ADR** (Nygard format). Supersedes ADR-0014. Documents: (1) model rebalance with quota justification (68M/166M = 41%); (2) variant bumps (PLANNER/DESIGN `high`→`max`); (3) agent reassignments with rationale per agent; (4) footer rename (`Plan-by`→`Authored-by`, `Acked-by`→`Tested-by`); (5) `Tested-by:` sourcing change (`build.model`→`code-review.model`); (6) GLM `max`=ExtraHigh caveat; (7) Graphify-driven `explore`→JUDGE decision; (8) `Tested-by:` semantic extension note |
| `adr/0010-issue-closing-keyword-convention.md` | Cross-ref update: `Plan-by` → `Authored-by` in placement rule description (lines 13, 30, 45). Not superseded — terminology update only. |
| `adr/0012-configurable-model-variables.md` | Cross-ref note added: "See ADR-0031 for the model rebalance that reassigns tier membership." Not superseded. |
| `adr/0022-sub-agent-model-config-opencode-jsonc.md` | Cross-ref note added: footer sourcing change documented in ADR-0031. Not superseded. |

### 5.6 Out of scope (flagged as follow-up)

| File | Reason |
|---|---|
| `aurora/AGENTS.md`, `aurora/commitlint.config.js`, `aurora/.opencode/skills/writing-plans/SKILL.md` | Aurora submodule — separate upstream PR required. The footer rename will cause Aurora's commitlint to reject commits if not updated, but Aurora commits are rare and can be handled case-by-case until the upstream PR lands. |
| `docs/plans/2026-07-19-git-flow-identity-config-consolidation.md` | Historical plan document — contains `Plan-by`/`Acked-by` examples in commit message templates. Historical artifacts; updating would rewrite history. Leave as-is. |

---

## 6. Verification steps (before committing `setup.json`)

1. **Provider string:** Run `opencode models` after connecting to Z.AI Coding
   Plan to confirm `zai-coding-plan/glm-5.2` is the exact provider ID. If
   different, update `setup.json` only — the `{env:VAR}` indirection means no
   other files hardcode the model string.
2. **Smoke check:** `opencode` launches without "variant not supported" or
   "Expected number" error.
3. **Env var check:** After `direnv allow`, verify:
   - `echo $OPENCODE_MODEL_PRIMARY` = `zai-coding-plan/glm-5.2`
   - `echo $OPENCODE_VARIANT_PLANNER` = `max`
   - `echo $OPENCODE_VARIANT_DESIGN` = `max`
   - `echo $OPENCODE_MODEL_JUDGE` = `deepseek/deepseek-v4-pro`
4. **Harness tests:** `php vendor/bin/pest tests/Unit/Harness/` — all tests
   green including the new tier-membership guards.
5. **Shell tests:** `bash tests/Shell/commit-msg_test.sh` — all footer tests
   pass with new names.
6. **Commitlint:** Make a test commit with `Authored-by:`/`Tested-by:`/
   `Signed-off-by:` footers — commit-msg hook accepts it.
7. **Eval suite:** Run `.opencode/evals/bin/` against GLM-5.2 @ `max` for
   PLANNER/DESIGN to measure quality before committing.

---

## 7. Acceptance criteria

- [ ] `.opencode/setup.json` models and variants match §3.1 and §3.2
- [ ] `opencode.jsonc` has 7 agents reassigned per §3.3
- [ ] `commitlint.config.js` enforces `Authored-by:`, `Tested-by:`,
      `Signed-off-by:` trailers
- [ ] `conventional-commits` skill documents `Tested-by:` sourcing from
      `agent.code-review.model`
- [ ] All shell tests pass with new footer names
- [ ] All harness tests pass, including new tier-membership guards
- [ ] `model-configuration.md` tier table, variant mapping, and
      variant-per-tier guidance updated
- [ ] ADR-0031 written and committed; ADR-0010/0012/0022 cross-refs updated
- [ ] `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `CONTEXT.md` updated
- [ ] Provider string verified via `opencode models`
- [ ] Eval suite run against GLM-5.2 @ `max` for PLANNER/DESIGN

---

## 8. Open questions / risks

- **Provider string unverified.** `zai-coding-plan/glm-5.2` is the proposed
  value. The vendored opencode docs confirm Z.AI is a provider with a "GLM
  Coding Plan" option in `/connect`, but don't document the resulting
  provider ID string. Verification step §6.1 resolves this before commit.
- **Aurora submodule drift.** The footer rename will cause Aurora's
  commitlint to reject commits until the upstream PR lands. Aurora commits
  are rare; case-by-case handling is acceptable in the interim.
- **`Tested-by:` semantic extension.** The trailer's Linux kernel meaning
  ("I ran the tests and they passed") is extended to cover the full
  verification pipeline. Documented in ADR-0031 to prevent future maintainer
  confusion.
- **GLM `max` = ExtraHigh, not absolute max.** Variant values are
  provider-relative. This is documented in `model-configuration.md` §2 and
  ADR-0031 to prevent a future maintainer from assuming GLM `max` and
  DeepSeek `max` are equivalent absolute tiers.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
