# Prism GPT-5.6 Sol on DESIGN+PLANNER Tiers and `Implemented-by` Commit Footer Spec

> **Date:** 2026-07-27
> **Status:** Approved (design phase, revised, reconciled with implementation)
> **Supersedes:** none
> **Target repo:** `kyaulabs/prism` (branch off `develop`)
> **Related:** ADR-0010 (issue-closing keyword/footer convention), ADR-0012
> (configurable model variables), ADR-0013 (configurable variant), ADR-0022
> (sub-agent config in opencode.jsonc), ADR-0029 (unified setup.json),
> ADR-0030 (design primary agent and DESIGN tier), ADR-0031 (prior model
> rebalance + footer rename — the precedent this extends)

---

## 1. Goal

Two coupled concerns, both motivated by the same operator change (acquiring
ChatGPT Plus / GPT-5.6 Sol access):

1. **Route GPT-5.6 Sol to the two highest-leverage *thinking* tiers**
   (DESIGN, PLANNER), sourced via the operator's existing **ChatGPT Plus
   subscription** through opencode's first-class ChatGPT-Plus/Pro OAuth
   provider. PRIMARY stays on high-capacity flat-rate GLM-5.2 as the
   daily-driver coder; Sol remains reachable ad-hoc for any tier via `/models`.
2. **Add an `Implemented-by:` commit footer** sourced from the PRIMARY tier, so
   that all three models in the pipeline are attributed — `Authored-by:`
   (PLANNER/Sol, the design/plan), `Implemented-by:` (PRIMARY/GLM, the code),
   `Tested-by:` (JUDGE/DeepSeek, the review). This resolves (rather than merely
   documents) the `Authored-by:` semantic-drift consequence that the tier split
   creates.

Three governing principles:

1. **Maximize quality-per-quota on high-leverage thinking.** Specs and plans are
   the foundation of all downstream work — "planning quality directly determines
   code quality" (ADR-0031). Sol is the flagship reasoning model (per OpenAI's
   own model catalog: "flagship model for complex reasoning and coding"), so it
   earns its place on the tiers where a single turn shapes the most downstream
   work.
2. **Reserve Sol for low/medium-frequency tiers; ride high-capacity GLM for volume.**
   GLM's flat-rate weekly cap (~166M tokens/week, ~41% utilized per ADR-0031)
   vastly exceeds Sol's Plus window. The binding constraint is the **ChatGPT Plus weekly window**
   (surfaced by `@slkiser/opencode-quota` v4.0.1), **not** per-token cost. PRIMARY is the
   highest-frequency tier (every build turn, every `@tdd` iteration); defaulting
   it to Sol would burn the weekly window fastest and risk running dry
   mid-session. DESIGN/PLANNER are low/medium-frequency — the defensible fit.
3. **Attribute every model in the pipeline.** Once PLANNER and PRIMARY diverge
   to different providers (Sol vs GLM), a single `Authored-by:` (sourced from
   PLANNER) mislabels `@tdd`/build (PRIMARY) commits. Adding `Implemented-by:`
   (PRIMARY) gives one footer per pipeline stage and resolves the drift the
   `@architect` review flagged (CONDITION 1).

### 1.1 Auth-path note (first of its kind in this harness)

opencode ships a built-in **ChatGPT-Plus/Pro OAuth** auth path for the OpenAI
provider (`/connect` → OpenAI → "ChatGPT Plus/Pro"), distinct from the API-key
path. OpenAI explicitly permits ChatGPT subscriptions in third-party developer
tooling (unlike Anthropic, which prohibits the equivalent). This is the **first
harness tier backed by a subscription-OAuth auth model rather than an API key**.
The implication: the binding economic constraint is a *rolling weekly window*
(quota plugin), not pay-per-token billing — which is why tier placement is
decided by call frequency and downstream leverage, not by per-token price.

---

## 2. Post-change tier table

| Tier | Model | Variant | Agents | Why this variant |
|---|---|---|---|---|
| **PRIMARY** | `zai-coding-plan/glm-5.2` | `max` | build, tdd, debug, resolve-merge-conflicts, general | Unchanged. Highest-volume tier rides high-capacity flat-rate GLM quota (~166M tokens/week per ADR-0031). Sol reachable ad-hoc via `/models`. |
| **PLANNER** | `openai/gpt-5.6-sol` | `xhigh` | plan, from-issue, architect, consult | Sol flagship for planning/decomposition. `xhigh` is OpenAI's opencode-built-in reasoning ceiling (provider-relative equivalent of the harness's "max reasoning" intent). |
| **DESIGN** | `openai/gpt-5.6-sol` | `xhigh` | design | Sol flagship for design/spec authorship. Temperature 0.3 still differentiates from PLANNER. Same `xhigh` rationale. |
| **JUDGE** | `deepseek/deepseek-v4-pro` | `medium` | code-review, standards-review, spec-review, test-audit, judge, explore | Unchanged. Cross-model review preserved — DeepSeek catches both GLM (PRIMARY) and OpenAI (DESIGN/PLANNER) blind spots. |
| **UTILITY** | `deepseek/deepseek-v4-flash` | `medium` | compaction, title, summary, docs-writer, semgrep | Unchanged. Latency-sensitive micro-tasks. |

### 2.1 Why `xhigh`, not a custom `max`

opencode's **built-in** OpenAI variants are `none · minimal · low · medium ·
high · xhigh` (`models.mdx` §Variants). The OpenAI *API* also exposes a literal
`max` for Sol, but opencode does not ship it as a built-in. Two paths were
considered:

| Option | Verdict |
|---|---|
| **(A) `xhigh` (built-in)** — chosen | Zero custom config; guaranteed to resolve; *is* the provider-relative equivalent of "max reasoning" per ADR-0031's principle that variant values are provider-relative, not absolute. Slightly easier on the weekly window than a true `max`. |
| (B) Custom `max` variant | Preserves the literal `max` string and hits Sol's absolute ceiling, but adds a `provider.openai.models."gpt-5.6-sol".variants.max` block and depends on the AI SDK passing `reasoningEffort:"max"` through (unverified). `xhigh` is the documented fallback if `max` is rejected. |

The harness's own principle (ADR-0031 §2.1: "Variant values are
provider-relative") means switching DESIGN/PLANNER from GLM `max` (ExtraHigh) to
OpenAI `xhigh` is **not a downgrade of intent** — both are their provider's
opencode-native reasoning ceiling *among shipped variants*. Strictly, GLM was at
its provider's absolute ceiling, while OpenAI `xhigh` sits one rung below the
API-level `max` (§12 risk). This is a deliberate, documented trade-off: zero-config
reliability over the absolute peak. The variant *string* changes (`max` →
`xhigh`); the *intent* (highest built-in reasoning for the provider) is preserved.

### 2.2 Cross-model review property (preserved, enriched)

Post-change the generators span two providers — OpenAI (DESIGN/PLANNER) and GLM
(PRIMARY) — and the reviewer is a third (DeepSeek, JUDGE). The cross-model review
property is therefore preserved *and* enriched: DeepSeek now cross-reviews both
OpenAI- and GLM-authored work, catching provider-specific blind spots across the
full generation surface. JUDGE is deliberately left on DeepSeek @ `medium`
(functionally `high` per DeepSeek's variant collapse) — moving it to Sol would
collapse the cross-model property into a self-review.

---

## 3. Commit footer enhancement — `Implemented-by:`

### 3.1 Motivation

ADR-0031 §4 sources `Authored-by:` from `agent.plan.model` (PLANNER) on the
rationale that the creation pipeline (design → plan → build) was "all GLM", so a
single footer covered it. After this change PLANNER = Sol while PRIMARY (build,
tdd, debug) = GLM, so a `@tdd`-authored commit would carry
`Authored-by: gpt-5.6-sol` — a semantic imprecision flagged by the `@architect`
review (CONDITION 1). This spec resolves it by adding a third model-attribution
footer rather than documenting the drift.

### 3.2 The four-stage footer pipeline

| Footer | Tier source | Resolves to (post-change) | Meaning |
|---|---|---|---|
| `Authored-by:` | PLANNER (`agent.plan.model`) | `gpt-5.6-sol` | the design/plan that guided the work — unchanged |
| **`Implemented-by:`** | **PRIMARY** (`agent.tdd.model` / `agent.build.model` inherit `{env:OPENCODE_MODEL_PRIMARY}`) | **`glm-5.2`** | **the agent that wrote the code — NEW** |
| `Tested-by:` | JUDGE (`agent.code-review.model`) | `deepseek-v4-pro` | the review/verification agent — unchanged |
| `Signed-off-by:` | user (`resolve-identity.sh`) | `kyau <git@kyaulabs.com>` | the human owner — unchanged |

One footer per pipeline stage; all three models in use are attributed.

### 3.3 Ordering and enforcement

Documented commit-message order (pipeline sequence):

```
<type>[scope]: <subject>

<body>

Refs: #NN            (only if referencing an issue; must precede Authored-by:)
Authored-by: <PLANNER model id segment>
Implemented-by: <PRIMARY model id segment>
Tested-by: <JUDGE model id segment>
Signed-off-by: <user>
```

**Hook enforcement** (`commitlint.config.js`): the `trailers-exist` rule is
extended to require all four model/identity trailers (`Authored-by:`,
`Implemented-by:`, `Tested-by:`, `Signed-off-by:`) on every non-merge,
non-revert commit. The existing `issue-ref-convention` rule (Refs/Fixes must
precede `Authored-by:`) is unchanged and still hook-enforced. **Inter-trailer
ordering among the four model trailers is a documented convention, not
hook-enforced** (commitlint does not order them beyond the Refs-before-Authored-by
rule) — the agent prompts and the `conventional-commits` skill enforce the
pipeline order by example.

### 3.4 Uniform application

Consistent with the existing three required trailers, `Implemented-by:` applies
to **all** non-merge/non-revert commits (including docs commits), sourced
mechanically from the PRIMARY tier regardless of which agent actually authors
the commit. This preserves the harness's fixed-source-footer model (vs. a
dynamic per-author scheme — see §9).

### 3.5 Precedent

ADR-0031 combined a tier rebalance with a footer rename (`Plan-by`→`Authored-by`,
`Acked-by`→`Tested-by`). This spec follows the same pattern: tier reassignment
**+** the footer enhancement that the reassignment motivates, in one ADR.

---

## 4. What changes vs current state

### 4.1 Models (`.opencode/setup.json`)

| Key | From | To |
|---|---|---|
| `models.primary` | `zai-coding-plan/glm-5.2` | unchanged |
| `models.planner` | `zai-coding-plan/glm-5.2` | `openai/gpt-5.6-sol` |
| `models.design` | `zai-coding-plan/glm-5.2` | `openai/gpt-5.6-sol` |
| `models.judge` | `deepseek/deepseek-v4-pro` | unchanged |
| `models.utility` | `deepseek/deepseek-v4-flash` | unchanged |

### 4.2 Variants (`.opencode/setup.json`)

| Key | From | To |
|---|---|---|
| `variants.primary` | `max` | unchanged |
| `variants.planner` | `max` | `xhigh` |
| `variants.design` | `max` | `xhigh` |
| `variants.judge` | `medium` | unchanged |
| `variants.utility` | `medium` | unchanged |

### 4.3 Commit-footer enforcement (`commitlint.config.js`)

| Line | Change |
|---|---|
| l.137 `'trailers-exist'` rule | Add `'Implemented-by:'` to the required trailer array: `['Authored-by:', 'Implemented-by:', 'Tested-by:', 'Signed-off-by:']`. |

No other commitlint rule changes. `issue-ref-convention` (Refs/Fixes before
Authored-by) and the type/header rules are untouched.

### 4.4 `opencode.jsonc` — NO CHANGE (tier wiring)

Every DESIGN/PLANNER agent already references `{env:OPENCODE_MODEL_DESIGN}` /
`{env:OPENCODE_MODEL_PLANNER}` and the matching variant env vars. The
`{env:VAR}` indirection means **no tier-wiring edit**.

### 4.5 `opencode.jsonc` agent prompts — NO-OP (reconciled)

> **Post-implementation correction:** exploration found that **no agent prompt
> in `opencode.jsonc` mentions footer tokens** — they all defer to `AGENTS.md`
> (loaded every session) and the `conventional-commits` skill. The footer
> convention therefore lives in `AGENTS.md` + skills + `release.md` +
> `CONTRIBUTING.md` (see §6), not in agent prompts. This subsection was
> originally written as an "EDIT"; it is in fact a no-op and was dropped from
> the implementation (the §11 acceptance item for it is struck through).

### 4.6 `.envrc` — NO CHANGE

`.envrc` reads `setup.json` via jq (l.45–51) and exports the env vars
dynamically. It auto-picks-up the new `models.*` / `variants.*` values with no
edit. (The `.models.design // .models.planner` fallback at l.46 is moot — both
are set explicitly.)

### 4.7 Agent tier membership — NO CHANGE

Unlike ADR-0031 (which reassigned 7 agents across tiers), **no agent moves
tier**. The 5-tier → env-var mapping is untouched; only the values two env vars
resolve to change. Blast radius is correspondingly smaller.

---

## 5. Test changes

### 5.1 `tests/Unit/Harness/ModelConfigTest.php`

| Test (line) | Change |
|---|---|
| `it('has correct default variant values')` (l.298–305) | `planner`/`design` assertions: `'max'` → `'xhigh'` |
| `it('CODING_HARNESS variant column reflects the max bump for planner and design')` (l.488–494) | **Rename + repurpose** → `…reflects xhigh for planner and design`. The current test negatively asserts the doc contains no `high` variant token (guarding the old ADR-0031 `high`→`max` bump). Repurpose to positively assert the doc lists `xhigh` for planner/design. Substring trap: `xhigh` contains `high`, so the implementer must match the full token, not a naive `contains('high')`. |
| **New test** (mirror of the l.307 judge model-lock) | `it('planner and design default to GPT-5.6 Sol')` — asserts `setup['models']['planner']` and `['design']` are both `'openai/gpt-5.6-sol'`, paralleling the existing judge model-value lock. |
| `it('README and CODING_HARNESS tier tables match setup.json defaults')` (l.452–475) | **No edit** — dynamically reads `setup.json`; will *fail* until README + CODING_HARNESS list `openai/gpt-5.6-sol` for planner/design. Drives the §6 doc updates. |
| `it('README install verify comment matches the shipped Primary default')` (l.477–486) | **No edit** — only concerns PRIMARY, which is unchanged. |

### 5.2 `tests/Shell/commit-msg_test.sh`

The canonical valid-footer fixture `Authored-by: x\nTested-by: x\nSigned-off-by: x <x@x>`
appears **13 times** across the test cases (l.60, 92, 127, 190, 249, 272, 295,
318, 341, 364, 387, 410, 433). Once commitlint requires `Implemented-by:`, every
one of these fixtures must insert `Implemented-by: x` in pipeline position
(between `Authored-by` and `Tested-by`) or the test will fail (commitlint rejects
messages missing the trailer). **Test 5 (l.190, "Valid commit with trailers
passes") is the critical one** — it actively asserts a 3-trailer message is
*accepted*, so without the 4th trailer it breaks (not merely cosmetic).

| Change | Detail |
|---|---|
| Update all 13 valid-footer fixtures | Insert `Implemented-by: x` between `Authored-by: x` and `Tested-by: x`. |
| **New test** | "rejects a commit missing Implemented-by" — assert a 3-trailer message (Authored/Tested/Signed-off only) is now rejected by the commit-msg hook (added as Test 16). |

### 5.3 `tests/Shell/commit_template_footer_test.sh`

l.28–33 checks the release.md template carries Authored-by/Tested-by/Signed-off-by.
Extend the `grep` chain to also require `Implemented-by:`.

---

## 6. Doc changes

| File | Change |
|---|---|
| `.opencode/docs/model-configuration.md` §1 (tier table) | PLANNER + DESIGN rows: model → `openai/gpt-5.6-sol`, variant → `xhigh`. Add a note (row annotation or footnote) that these two tiers are **ChatGPT-Plus-OAuth-backed** — the first non-API-key tier backing in this harness. |
| `.opencode/docs/model-configuration.md` §2 (variant mapping) | OpenAI row: update effort ladder from `minimal/low/medium/high` → `none/low/medium/high/xhigh` (the refreshed opencode docs confirm this built-in set); add a note that the OpenAI *API* also exposes `max`, but opencode's built-in tops at `xhigh`. |
| `.opencode/docs/model-configuration.md` §4 (variant-per-tier) | PLANNER + DESIGN rows: variant guidance `max` → `xhigh`; add weekly-window rationale ("low/medium-frequency tiers; `xhigh` is OpenAI's built-in ceiling, near-peak quality without a custom variant block; chosen over custom `max` per §2.1"). |
| `.opencode/docs/model-configuration.md` §7 (maintainer checklist) | No structural change; optionally add a note that ChatGPT-Plus-OAuth-backed tiers introduce a weekly-window (not per-token) economic constraint. |
| `README.md` §Model Configuration (l.314–315) | Planner/Design model values → `openai/gpt-5.6-sol`. |
| `README.md` footer-convention section (l.507–529, l.513/553/563) | Document the `Implemented-by:` trailer + PRIMARY sourcing + pipeline ordering; update the token list, required-footers sentence, and example commit messages to include `Implemented-by:`. |
| `CODING_HARNESS.md` tier table + variant column | Planner/Design model + variant values updated (model → `openai/gpt-5.6-sol`; variant column reflects `xhigh`). |
| `.opencode/commands/setup.md` | Update the hardcoded summary table (l.124–127) and prompt defaults (l.137–147, l.151–165) for **all tiers**. This file is *already stale from ADR-0031* (still shows Primary=`deepseek/deepseek-v4-pro`, Planner/Design=`openrouter/z-ai/glm-5.2 @ high`, Judge=`glm-5.2`); this change remedies that pre-existing drift AND applies the GPT-5.6 values. **Not covered by the l.452 doc-parity test** (README + CODING_HARNESS only) — manual care required. |
| `.opencode/commands/release.md` | The release/changelog commit template (l.41) gains `Implemented-by:` in pipeline position; update the example footer block. |
| `AGENTS.md` (footer paragraph, l.167) | Document `Implemented-by:` (sourced from PRIMARY / `agent.tdd.model`), the four-stage pipeline ordering, and uniform application. |
| `conventional-commits` skill | Document the `Implemented-by:` trailer, its PRIMARY-tier sourcing, ordering, and uniform-application rule. |
| `CONTRIBUTING.md` (l.43–53) | Add `Implemented-by:` to the Required trailers section (PRIMARY sourcing). |
| `finishing-a-development-branch` skill (l.32) | Add `Implemented-by:` to the commit-footer checklist item. |
| `writing-plans` skill (l.155, l.175) | Add `Implemented-by:` to the example commit command + the no-placeholder rule. |
| `CONTEXT.md` | **(Required)** Register `adr/0040-…` in the Architectural Decisions list (per the `adr` skill's acceptance step). *(Optional)* Boundary annotation under LLM providers (l.89): provider auth may be API-key *or* subscription-OAuth (ChatGPT-Plus), with the binding economic constraint varying by auth path. |

`AGENTS.md`'s tier-system paragraph (no model values) is otherwise unchanged.

---

## 7. ADR-0040 (new, Nygard format)

**File:** `adr/0040-gpt-5-6-sol-on-design-planner-tiers.md`

Documents:

1. **ChatGPT-Plus OAuth as a first-class opencode auth path** — the first
   non-API-key tier backing in this harness. Cite `providers.mdx` §OpenAI
   (l.1670–1695) and OpenAI's explicit permission for subscription use in
   third-party dev tooling.
2. **Weekly-window constraint** replaces per-token cost as the binding economic
   lever for Sol-backed tiers. Tier placement decided by call frequency ×
   downstream leverage, not per-token price.
3. **Placement rationale** — DESIGN/PLANNER are high-leverage × low/medium
   frequency → best quality-per-quota. PRIMARY excluded as the highest-frequency
   burn risk (Sol reachable ad-hoc via `/models` instead).
4. **`xhigh` choice** over a custom `max` variant — built-in ceiling,
   provider-relative equivalent of the harness's "max reasoning" intent, zero
   config (§2.1).
5. **Preservation of the cross-model review property** — JUDGE stays DeepSeek;
   post-change it cross-reviews both OpenAI- and GLM-authored work (enriched,
   not weakened).
6. **Operating model** — manual `/models` fallback to GLM when the weekly window
   runs low; watch the `@slkiser/opencode-quota` toast/sidebar. No auto-fallback
   (YAGNI).
7. **`Implemented-by:` footer addition (resolves the Authored-by drift).** The
   tier split makes a single `Authored-by:` (PLANNER/Sol) mislabel PRIMARY/GLM
   code commits. Rather than document the drift, this change adds
   `Implemented-by:` sourced from the PRIMARY tier, giving one footer per
   pipeline stage (Authored-by → Implemented-by → Tested-by). Extends ADR-0031's
   footer-rename lineage; ADR-0010's issue-ref-before-Authored-by ordering rule
   is unaffected.

**References (not supersedes):** ADR-0031 (prior rebalance + footer rename — the
precedent), ADR-0030 (DESIGN tier definition), ADR-0013 (variant env var),
ADR-0010 (footer/issue-ref convention). Does not supersede any ADR.

---

## 8. Operating model (documented, not engineered)

- **Watch the window.** The `@slkiser/opencode-quota` plugin (toast + TUI
  sidebar, `opencode-quota/quota-toast.json`) surfaces the Plus weekly window.
- **Manual fallback.** When the window runs low, switch DESIGN/PLANNER sessions
  back to GLM via `/models` for the remainder of the window. PRIMARY already
  rides high-capacity GLM, so the daily `@tdd`/build loop never hits the wall.
- **Non-goal (YAGNI):** auto-fallback when quota is exhausted. opencode exposes
  no hook for it, and two low-frequency tiers do not justify engineering one. If
  quota exhaustion becomes a recurring friction point, revisit as a separate
  spec.

---

## 9. Out of scope / non-goals

- **PRIMARY, JUDGE, UTILITY tier model/variant** — touching PRIMARY would burn
  the weekly window; touching JUDGE would destroy cross-model review; touching
  UTILITY would waste Sol on micro-tasks.
- **The OpenAI API-key billing path** — irrelevant under ChatGPT-Plus auth; the
  per-token catalog price does not apply.
- **"GPT-5.6 Sol Fast"** — the operator also sees this entry in `/models`; it is
  likely an opencode preset/variant. This spec targets flagship Sol at `xhigh`
  and does not investigate Fast.
- **Auto quota-fallback** — see §8.
- **Per-agent model overrides beyond the 5-tier system** — would require a
  structural tier split (new env var + new ADR), out of scope.
- **GLM variant bump on PRIMARY** — PRIMARY/GLM is already at `max` (ExtraHigh),
  GLM's ceiling; there is no higher rung. Not actionable.
- **Dynamic per-commit footer re-sourcing** — `Implemented-by:` (like the
  existing footers) is a *fixed-source* trailer (PRIMARY tier), applied
  uniformly regardless of which agent authors the commit. Switching to dynamic
  per-actual-author footers is a different model and is explicitly out of scope;
  the fixed-source model is retained for consistency.
- **Inter-trailer ordering hook-enforcement** — the four model trailers' order
  is documented convention only; commitlint keeps enforcing just
  Refs-before-Authored-by. Promotably tightening this is out of scope.

---

## 10. Verification steps (before committing the changes)

1. **Model ID verification.** Run `/models` and confirm `openai/gpt-5.6-sol`
   resolves under the ChatGPT-Plus-connected OpenAI provider. If the exact ID
   differs, update `setup.json` only — the `{env:VAR}` indirection means no other
   file hardcodes the model string.
2. **Smoke check.** `opencode` launches without a "variant not supported" or
   "Expected number" error at `xhigh`.
3. **Env var check.** After `direnv allow`:
   - `echo $OPENCODE_MODEL_PLANNER` = `openai/gpt-5.6-sol`
   - `echo $OPENCODE_MODEL_DESIGN` = `openai/gpt-5.6-sol`
   - `echo $OPENCODE_VARIANT_PLANNER` = `xhigh`
   - `echo $OPENCODE_VARIANT_DESIGN` = `xhigh`
   - `echo $OPENCODE_MODEL_PRIMARY` = `zai-coding-plan/glm-5.2` (unchanged)
4. **Harness tests.** `php vendor/bin/pest tests/Unit/Harness/` — all green,
   including the renamed variant test and the new planner/design model-lock.
5. **Footer tests.** `bash tests/Shell/commit-msg_test.sh` (all 13 fixtures
   pass with the 4-trailer set; the new "rejects missing Implemented-by" test
   passes) and `bash tests/Shell/commit_template_footer_test.sh`.
6. **Commitlint smoke.** `git commit --dry-run` (or a scratch commit) with a
   3-trailer message is rejected; with the 4-trailer pipeline-ordered message is
   accepted.
7. **Quota plugin.** Confirm `@slkiser/opencode-quota` toast/sidebar decrements
   on a DESIGN or PLANNER turn (weekly window tracked for the OpenAI-backed tier).
8. **Functional smoke.** Run one DESIGN brainstorm and one PLANNER plan; confirm
   Sol is the backing model and output quality is at least comparable to the
   prior GLM-`max` baseline.

---

## 11. Acceptance criteria

- [ ] `.opencode/setup.json` `models.planner`/`models.design` = `openai/gpt-5.6-sol`
- [ ] `.opencode/setup.json` `variants.planner`/`variants.design` = `xhigh`
- [ ] `opencode.jsonc` tier wiring unchanged (no hardcoded model strings introduced)
- [ ] `.envrc` unchanged (jq reads new values dynamically)
- [ ] No agent changes tier membership (PRIMARY/PLANNER/DESIGN/JUDGE/UTILITY rosters intact)
- [ ] `ModelConfigTest.php`: variant-value assertions updated (`max` → `xhigh`); "max bump" test renamed to reflect `xhigh`; new `planner and design default to GPT-5.6 Sol` model-lock test added
- [ ] `commitlint.config.js` `trailers-exist` rule requires `Implemented-by:` (4 trailers)
- [ ] `commit-msg_test.sh` all 13 fixtures updated to the 4-trailer set; new "rejects missing Implemented-by" test added
- [ ] `commit_template_footer_test.sh` checks release.md for `Implemented-by:`
- [ ] ~~`opencode.jsonc` agent prompts emit `Implemented-by:` in pipeline position~~ — **dropped (no-op; see §4.5 reconciliation)**
- [ ] `model-configuration.md` §1 tier table, §2 OpenAI variant ladder, §4 variant-per-tier guidance updated
- [ ] `README.md` (tier table + footer-convention section) and `CODING_HARNESS.md` tier tables list `openai/gpt-5.6-sol` for planner/design (driven by the l.452 doc-parity test) and document `Implemented-by:`
- [ ] `.opencode/commands/setup.md` summary table + prompt defaults updated for all tiers (remedies pre-existing ADR-0031 drift + applies GPT-5.6 values)
- [ ] `.opencode/commands/release.md` commit template includes `Implemented-by:`
- [ ] `AGENTS.md` footer paragraph documents `Implemented-by:` (PRIMARY sourcing) + pipeline ordering
- [ ] `conventional-commits` skill documents `Implemented-by:`
- [ ] `CONTEXT.md` Architectural Decisions list registers ADR-0040
- [ ] ADR-0040 written and committed (Nygard format; references ADR-0010/0030/0031; documents both the tier change and the `Implemented-by:` footer; supersedes none)
- [ ] `/models` confirms `openai/gpt-5.6-sol` resolves under ChatGPT-Plus auth
- [ ] `@slkiser/opencode-quota` decrements on a DESIGN/PLANNER turn (weekly window tracked)
- [ ] All harness + shell tests green

---

## 12. Open questions / risks

- **Exact `/models` ID unverified.** `openai/gpt-5.6-sol` is the proposed value,
  confirmed against the vendored opencode docs (`zen.mdx` lists `gpt-5.6-sol`).
  The operator also reports a distinct "GPT-5.6 Sol Fast" entry whose nature
  (separate model vs. opencode variant) is unconfirmed. Verification step §10.1
  resolves the canonical Sol ID before commit; "Fast" is explicitly out of scope.
- **Weekly-window capacity unknown.** The Plus weekly window is qualitative
  (surfaced by the quota plugin) rather than a published token budget. If
  DESIGN/PLANNER at `xhigh` proves to exhaust it faster than expected in
  practice, the documented response is manual `/models` fallback to GLM, or
  stepping the variant down to `high` (kept in reserve per §2.1) — neither
  requires a new spec.
- **opencode built-in `xhigh` vs. API `max`.** `xhigh` is opencode's documented
  OpenAI ceiling; the API exposes a higher `max`. Choosing the built-in `xhigh`
  trades Sol's absolute ceiling for zero-config reliability. If the operator
  later wants the absolute ceiling, §2.1 option (B) defines the custom-variant
  path with `xhigh` as the verified fallback.
- **`Implemented-by:` uniform-application imprecision (docs commits).** Like the
  existing footers, `Implemented-by:` is sourced mechanically from PRIMARY
  regardless of authoring agent, so a design-agent docs commit carries
  `Implemented-by: glm-5.2` even though no code was implemented. This is the
  same fixed-source imprecision the harness already accepts for `Authored-by`/
  `Tested-by` on docs commits; accepted for consistency (§9 documents dynamic
  re-sourcing as out of scope).
- **Footer-test ripple.** The `commit-msg_test.sh` change touches 13 fixtures;
  a missed fixture will fail noisily (commitlint rejects the 3-trailer message),
  so the risk is detection-easy, not silent. The new "rejects missing
  Implemented-by" test guards the requirement going forward.
- **Bootstrapping / transition.** The commitlint requirement, agent-prompt
  updates, and test updates land atomically in this feature branch, so there is
  no window where the hook requires a trailer the prompts don't emit. Commits
  *on this branch* during implementation will already need the 4-trailer set
  once the commitlint edit lands — the implementing `@tdd` agent must emit
  `Implemented-by:` from that point on.
- **`setup.md` doc-parity test gap.** The l.452 doc-parity test covers only
  `README.md` + `CODING_HARNESS.md`; `setup.md`'s hardcoded tier table/prompt
  defaults are unguarded and had silently drifted since ADR-0031. This change
  fixes the drift manually (§6); a follow-up to extend the test to `setup.md`
  would prevent recurrence.
- **Cross-cutting change → architect review (completed).** An `@architect`
  read-only pass was run against the prior revision. **Verdict: GO WITH
  CONDITIONS** (ADR-required: 0040). Conditions folded in: the `Authored-by:`
  footer consequence (resolved by §3's `Implemented-by:` addition, no longer a
  mere acknowledged limitation), the `setup.md` doc-drift omission (§6), and
  precision softening of the `xhigh` / "unlimited" framing (§1, §2.1). The
  footer-enhancement scope addition (§3) postdates that review; it is additive
  documentation/enforcement (a new fixed-source trailer + hook/tests/docs), does
  not touch the tier architecture the architect validated, and follows ADR-0031's
  tier+footer-combination precedent. A re-review is not warranted but available
  on request.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
