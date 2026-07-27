# Prism GPT-5.6 Sol on DESIGN + PLANNER Tiers Spec

> **Date:** 2026-07-27
> **Status:** Approved (design phase)
> **Supersedes:** none
> **Target repo:** `kyaulabs/prism` (branch off `develop`)
> **Related:** ADR-0012 (configurable model variables), ADR-0013 (configurable
> variant), ADR-0022 (sub-agent config in opencode.jsonc), ADR-0029 (unified
> setup.json), ADR-0030 (design primary agent and DESIGN tier), ADR-0031 (prior
> model rebalance — the precedent this builds on)

---

## 1. Goal

Route the strongest model in the operator's arsenal — **OpenAI GPT-5.6 Sol** —
to the two highest-leverage *thinking* tiers (DESIGN, PLANNER), sourced via the
operator's existing **ChatGPT Plus subscription** through opencode's first-class
ChatGPT-Plus/Pro OAuth provider. PRIMARY stays on high-capacity flat-rate GLM-5.2 as
the daily-driver coder; Sol remains reachable ad-hoc for any tier via `/models`.

Two governing principles:

1. **Maximize quality-per-quota on high-leverage thinking.** Specs and plans are
   the foundation of all downstream work — "planning quality directly determines
   code quality" (ADR-0031). Sol is the flagship reasoning model (per OpenAI's
   own model catalog: "flagship model for complex reasoning and coding"), so it
   earns its place on the tiers where a single turn shapes the most downstream
   work.
2. **Reserve Sol for low/medium-frequency tiers; ride high-capacity GLM for volume.**
   GLM's flat-rate weekly cap (~166M tokens/week, ~41% utilized per ADR-0031)
   vastly exceeds Sol's Plus window. The binding constraint is the **ChatGPT Plus weekly window** (surfaced by
   `@slkiser/opencode-quota` v4.0.1), **not** per-token cost. PRIMARY is the
   highest-frequency tier (every build turn, every `@tdd` iteration); defaulting
   it to Sol would burn the weekly window fastest and risk running dry
   mid-session. DESIGN/PLANNER are low/medium-frequency — the defensible fit.

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
API-level `max` (§11 risk). This is a deliberate, documented trade-off: zero-config
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

## 3. What changes vs current state

### 3.1 Models (`.opencode/setup.json`)

| Key | From | To |
|---|---|---|
| `models.primary` | `zai-coding-plan/glm-5.2` | unchanged |
| `models.planner` | `zai-coding-plan/glm-5.2` | `openai/gpt-5.6-sol` |
| `models.design` | `zai-coding-plan/glm-5.2` | `openai/gpt-5.6-sol` |
| `models.judge` | `deepseek/deepseek-v4-pro` | unchanged |
| `models.utility` | `deepseek/deepseek-v4-flash` | unchanged |

### 3.2 Variants (`.opencode/setup.json`)

| Key | From | To |
|---|---|---|
| `variants.primary` | `max` | unchanged |
| `variants.planner` | `max` | `xhigh` |
| `variants.design` | `max` | `xhigh` |
| `variants.judge` | `medium` | unchanged |
| `variants.utility` | `medium` | unchanged |

### 3.3 `opencode.jsonc` — NO CHANGE

Every DESIGN/PLANNER agent already references `{env:OPENCODE_MODEL_DESIGN}` /
`{env:OPENCODE_MODEL_PLANNER}` and the matching variant env vars. The
`{env:VAR}` indirection means **no `opencode.jsonc` edit** — the env vars simply
resolve to new values at startup.

### 3.4 `.envrc` — NO CHANGE

`.envrc` reads `setup.json` via jq (l.45–51) and exports the env vars
dynamically. It auto-picks-up the new `models.*` / `variants.*` values with no
edit. (The `.models.design // .models.planner` fallback at l.46 is moot — both
are set explicitly.)

### 3.5 Agent tier membership — NO CHANGE

Unlike ADR-0031 (which reassigned 7 agents across tiers), **no agent moves
tier**. The 5-tier → env-var mapping is untouched; only the values two env vars
resolve to change. Blast radius is correspondingly smaller: 2 setup.json values
+ their doc/test reflections.

---

## 4. Test changes — `tests/Unit/Harness/ModelConfigTest.php`

| Test (line) | Change |
|---|---|
| `it('has correct default variant values')` (l.298–305) | `planner`/`design` assertions: `'max'` → `'xhigh'` |
| `it('CODING_HARNESS variant column reflects the max bump for planner and design')` (l.488–494) | **Rename + repurpose** → `…reflects xhigh for planner and design`. The current test negatively asserts the doc contains no `high` variant token (guarding the old ADR-0031 `high`→`max` bump). Repurpose to positively assert the doc lists `xhigh` for planner/design. Substring trap: `xhigh` contains `high`, so the implementer must match the full token, not a naive `contains('high')`. |
| **New test** (mirror of the l.307 judge model-lock) | `it('planner and design default to GPT-5.6 Sol')` — asserts `setup['models']['planner']` and `['design']` are both `'openai/gpt-5.6-sol'`, paralleling the existing judge model-value lock. |
| `it('README and CODING_HARNESS tier tables match setup.json defaults')` (l.452–475) | **No edit** — dynamically reads `setup.json`; will *fail* until README + CODING_HARNESS list `openai/gpt-5.6-sol` for planner/design. This test drives the §5 doc updates. |
| `it('README install verify comment matches the shipped Primary default')` (l.477–486) | **No edit** — only concerns PRIMARY, which is unchanged. |

---

## 5. Doc changes (enforced by the l.452 doc-parity test)

| File | Change |
|---|---|
| `.opencode/docs/model-configuration.md` §1 (tier table) | PLANNER + DESIGN rows: model → `openai/gpt-5.6-sol`, variant → `xhigh`. Add a note (row annotation or footnote) that these two tiers are **ChatGPT-Plus-OAuth-backed** — the first non-API-key tier backing in this harness. |
| `.opencode/docs/model-configuration.md` §2 (variant mapping) | OpenAI row: update effort ladder from `minimal/low/medium/high` → `none/low/medium/high/xhigh` (the refreshed opencode docs confirm this built-in set); add a note that the OpenAI *API* also exposes `max`, but opencode's built-in tops at `xhigh`. |
| `.opencode/docs/model-configuration.md` §4 (variant-per-tier) | PLANNER + DESIGN rows: variant guidance `max` → `xhigh`; add weekly-window rationale ("low/medium-frequency tiers; `xhigh` is OpenAI's built-in ceiling, near-peak quality without a custom variant block; chosen over custom `max` per §2.1 of the spec"). |
| `.opencode/docs/model-configuration.md` §7 (maintainer checklist) | No structural change; the existing 7-step checklist already covers this change. Optionally add a note that ChatGPT-Plus-OAuth-backed tiers introduce a weekly-window (not per-token) economic constraint. |
| `README.md` §Model Configuration (l.314–315) | Planner/Design model values → `openai/gpt-5.6-sol`. |
| `CODING_HARNESS.md` tier table + variant column | Planner/Design model + variant values updated (model → `openai/gpt-5.6-sol`; variant column reflects `xhigh`). |
| `.opencode/commands/setup.md` | Update the hardcoded summary table (l.124–127) and prompt defaults (l.137–147, l.151–165) for **all tiers**. This file is *already stale from ADR-0031* (still shows Primary=`deepseek/deepseek-v4-pro`, Planner/Design=`openrouter/z-ai/glm-5.2 @ high`, Judge=`glm-5.2`); this change remedies that pre-existing drift AND applies the GPT-5.6 values. **Not covered by the l.452 doc-parity test** (README + CODING_HARNESS only) — manual care required. |
| `CONTEXT.md` | **(Required)** Register `adr/0040-gpt-5-6-sol-on-design-planner-tiers.md` in the Architectural Decisions list (per the `adr` skill's acceptance step). *(Optional)* Boundary annotation under LLM providers (l.89): provider auth may be API-key *or* subscription-OAuth (ChatGPT-Plus), with the binding economic constraint varying by auth path (per-token vs rolling weekly window). |

`AGENTS.md` requires **no edit** — it describes the five-tier system and points
to `model-configuration.md` for values; it does not hardcode model strings.

---

## 6. ADR-0040 (new, Nygard format)

**File:** `adr/0040-gpt-5-6-sol-on-design-planner-tiers.md`

Documents:

1. **ChatGPT-Plus OAuth as a first-class opencode auth path** — the first
   non-API-key tier backing in this harness. Cite `providers.mdx` §OpenAI
   (l.1670–1695) and OpenAI's explicit permission for subscription use in
   third-party dev tooling.
2. **Weekly-window constraint** replaces per-token cost as the binding economic
   lever for Sol-backed tiers. Tier placement is therefore decided by call
   frequency × downstream leverage, not by per-token price (the $5/$30-per-MTok
   catalog price is moot under this auth path).
3. **Placement rationale** — DESIGN/PLANNER are high-leverage × low/medium
   frequency → best quality-per-quota. PRIMARY excluded as the highest-frequency
   burn risk (Sol reachable ad-hoc via `/models` instead).
4. **`xhigh` choice** over a custom `max` variant — built-in ceiling,
   provider-relative equivalent of the harness's "max reasoning" intent, zero
   config (spec §2.1).
5. **Preservation of the cross-model review property** — JUDGE stays DeepSeek;
   post-change it cross-reviews both OpenAI- and GLM-authored work (enriched,
   not weakened).
6. **Operating model** — manual `/models` fallback to GLM when the weekly window
   runs low; watch the `@slkiser/opencode-quota` toast/sidebar. No auto-fallback
   (YAGNI — opencode has no hook for it; two low-frequency tiers don't justify
   engineering one).
7. **`Authored-by:` footer-sourcing consequence.** ADR-0031 §4 sources
   `Authored-by:` from `agent.plan.model` (PLANNER). Post-change PLANNER = Sol
   while PRIMARY (build/tdd/debug) = GLM, so a `@tdd`-authored commit would carry
   `Authored-by: gpt-5.6-sol` — a semantic imprecision (metadata only; no
   functional impact) from splitting generator providers across PLANNER/PRIMARY.
   ADR-0031 §4's "all GLM" rationale no longer fully holds. ADR-0040 acknowledges
   this; re-sourcing `Authored-by:` (e.g., from the authoring agent's tier) is a
   potential follow-up, not in scope here.

**References (not supersedes):** ADR-0031 (prior rebalance — the precedent),
ADR-0030 (DESIGN tier definition), ADR-0013 (variant env var). Does not
supersede any ADR.

---

## 7. Operating model (documented, not engineered)

- **Watch the window.** The `@slkiser/opencode-quota` plugin (toast + TUI
  sidebar, `opencode-quota/quota-toast.json`) surfaces the Plus weekly window.
- **Manual fallback.** When the window runs low, switch DESIGN/PLANNER sessions
  back to GLM via `/models` for the remainder of the window. PRIMARY already
  rides unlimited GLM, so the daily `@tdd`/build loop never hits the wall.
- **Non-goal (YAGNI):** auto-fallback when quota is exhausted. opencode exposes
  no hook for it, and two low-frequency tiers do not justify engineering one. If
  quota exhaustion becomes a recurring friction point, revisit as a separate
  spec.

---

## 8. Out of scope / non-goals

- **PRIMARY, JUDGE, UTILITY tiers** — touching PRIMARY would burn the weekly
  window; touching JUDGE would destroy cross-model review; touching UTILITY
  would waste Sol on micro-tasks.
- **The OpenAI API-key billing path** — irrelevant under ChatGPT-Plus auth; the
  per-token catalog price does not apply.
- **"GPT-5.6 Sol Fast"** — the operator also sees this entry in `/models`; it is
  likely an opencode preset/variant. This spec targets flagship Sol at `xhigh`
  and does not investigate Fast.
- **Auto quota-fallback** — see §7.
- **Per-agent model overrides beyond the 5-tier system** — would require a
  structural tier split (new env var + new ADR), out of scope.
- **GLM variant bump on PRIMARY** — PRIMARY/GLM is already at `max` (ExtraHigh),
  GLM's ceiling; there is no higher rung. Not actionable.

---

## 9. Verification steps (before committing `setup.json`)

1. **Model ID verification.** Run `/models` and confirm `openai/gpt-5.6-sol`
   resolves under the ChatGPT-Plus-connected OpenAI provider. If the exact ID
   differs (e.g. the operator's `/models` shows a different string for the Sol
   entry), update `setup.json` only — the `{env:VAR}` indirection means no other
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
5. **Quota plugin.** Confirm `@slkiser/opencode-quota` toast/sidebar decrements
   on a DESIGN or PLANNER turn (proves the weekly window is being tracked for
   the OpenAI-backed tier).
6. **Functional smoke.** Run one DESIGN brainstorm and one PLANNER plan; confirm
   Sol is the backing model and the output quality is at least comparable to the
   prior GLM-`max` baseline.

---

## 10. Acceptance criteria

- [ ] `.opencode/setup.json` `models.planner`/`models.design` = `openai/gpt-5.6-sol`
- [ ] `.opencode/setup.json` `variants.planner`/`variants.design` = `xhigh`
- [ ] `opencode.jsonc` unchanged (env-var indirection verified — no hardcoded model strings introduced)
- [ ] `.envrc` unchanged (jq reads new values dynamically)
- [ ] No agent changes tier membership (PRIMARY/PLANNER/DESIGN/JUDGE/UTIlITY rosters intact)
- [ ] `ModelConfigTest.php`: variant-value assertions updated (`max` → `xhigh`); "max bump" test renamed to reflect `xhigh`; new `planner and design default to GPT-5.6 Sol` model-lock test added
- [ ] `model-configuration.md` §1 tier table, §2 OpenAI variant ladder, §4 variant-per-tier guidance updated
- [ ] `README.md` and `CODING_HARNESS.md` tier tables list `openai/gpt-5.6-sol` for planner/design (driven by the l.452 doc-parity test)
- [ ] `.opencode/commands/setup.md` summary table + prompt defaults updated for all tiers (remedies pre-existing ADR-0031 drift + applies GPT-5.6 values)
- [ ] `CONTEXT.md` Architectural Decisions list registers ADR-0040
- [ ] ADR-0040 written and committed (Nygard format; references ADR-0030/0031; acknowledges the `Authored-by:` consequence; supersedes none)
- [ ] `/models` confirms `openai/gpt-5.6-sol` resolves under ChatGPT-Plus auth
- [ ] `@slkiser/opencode-quota` decrements on a DESIGN/PLANNER turn (weekly window tracked)
- [ ] All harness tests green

---

## 11. Open questions / risks

- **Exact `/models` ID unverified.** `openai/gpt-5.6-sol` is the proposed value,
  confirmed against the vendored opencode docs (`zen.mdx` lists `gpt-5.6-sol`).
  The operator also reports a distinct "GPT-5.6 Sol Fast" entry whose nature
  (separate model vs. opencode variant) is unconfirmed. Verification step §9.1
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
- **`Authored-by:` footer semantic drift.** Post-change, `Authored-by:` (sourced
  from PLANNER) resolves to `gpt-5.6-sol` even for PRIMARY/GLM-authored commits.
  Acknowledged in ADR-0040 (metadata only; no functional impact). Re-sourcing
  from the authoring agent's tier is a potential follow-up. Related: `README.md`
  and `.opencode/commands/release.md` carry example commit messages with
  `Authored-by: glm-5.2` that become stale illustrations — optional polish.
- **`setup.md` doc-parity test gap.** The l.452 doc-parity test covers only
  `README.md` + `CODING_HARNESS.md`; `setup.md`'s hardcoded tier table/prompt
  defaults are unguarded and had silently drifted since ADR-0031. This change
  fixes the drift manually (§5); a follow-up to extend the test to `setup.md`
  would prevent recurrence.
- **`fetch.sh` doc-refresh loose end.** Refreshing the vendored opencode docs
  (to ground this spec) modified two unrelated files (`go.mdx`, `zen.mdx`). This
  spec assumes those land as a **separate fast-path `docs:` commit**, not folded
  into the feature branch — keeping the GPT-5.6 change atomic in git history.
- **Cross-cutting change → architect review (completed).** An `@architect`
  read-only pass was run against this spec. **Verdict: GO WITH CONDITIONS**
  (ADR-required: 0040). Conditions folded into this revision: the `Authored-by:`
  footer consequence (§6.7 + this section), the `setup.md` doc-drift omission
  (§5), and precision softening of the `xhigh` / "unlimited" framing (§1, §2.1).
  All scope-honesty claims verified (no agent moves tier; no `opencode.jsonc` /
  `.envrc` edit); frequency thesis and cross-model property confirmed sound.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
