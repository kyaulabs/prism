# GPT-5.6 Sol DESIGN+PLANNER Tiers + `Implemented-by` Footer Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use `- [ ]`. Each task
> follows Red → Green → Refactor and ends green + committed. Test-driving tasks
> (T2, T4) go through `@tdd`; docs tasks (T1, T3, T5, T6) are fast-path inline.
> Branch: `feat/kyau-6480-gpt-5-6-sol-design-planner-tiers`.

**Goal:** Route GPT-5.6 Sol (ChatGPT-Plus OAuth) to DESIGN+PLANNER at `xhigh`, and add an `Implemented-by:` commit footer (PRIMARY tier) so all three pipeline models are attributed.

**Architecture:** Two coupled concerns, one ADR-0040. Tier change = 2 values in `setup.json` flowing through existing `{env:VAR}` indirection (no `opencode.jsonc`/`.envrc` edit) + test/doc couplings. Footer change = commitlint rule + test fixtures + convention docs. No application code.

**Spec:** `docs/specs/2026-07-27-gpt-5-6-sol-design-planner-tiers-spec.md` (this plan corrects 4 spec inaccuracies — see T6).

## Global constraints
- Conventional Commits + signed commits (`git commit -S`), single `-m` with `$'...\n...'`.
- Footer sourcing: `Authored-by` ← PLANNER (`agent.plan.model`); `Implemented-by` ← PRIMARY (new, enforced from T4); `Tested-by` ← `agent.code-review.model` (JUDGE/DeepSeek); `Signed-off-by` ← `resolve-identity.sh` = `kyau <git@kyaulabs.com>`.
- **Bootstrap rule:** commitlint requires `Implemented-by:` from **T4 onward**. T1–T3 (and this plan file's commit) use 3-trailer; T4's own commit onward use 4-trailer.
- No `git push` (human only). Never amend pushed commits.

## Execution order
T1 (ADR) → T2 (tier core, @tdd) → T3 (tier docs) → T4 (footer enforce, @tdd) → T5 (footer docs) → T6 (spec reconcile).

---

## Task 1: ADR-0040 + CONTEXT.md registration (decision-first)

**Files:**
- Create: `adr/0040-gpt-5-6-sol-on-design-planner-tiers.md`
- Modify: `CONTEXT.md:151` (append ADR-0040); `CONTEXT.md:89` (optional boundary note)

**Steps:**
- [ ] Write `adr/0040-…md` (Nygard: Title/Status/Context/Decision/Consequences/Alternatives). Decision = 7 points: ChatGPT-Plus OAuth path; weekly-window constraint; placement rationale; `xhigh` choice; cross-model preservation; manual-fallback operating model; `Implemented-by:` footer resolving the Authored-by drift. References (not supersedes) ADR-0010/0030/0031/0013.
- [ ] `CONTEXT.md` append after l.151: `- `adr/0040-gpt-5-6-sol-on-design-planner-tiers.md` — Route GPT-5.6 Sol (ChatGPT-Plus OAuth) to DESIGN+PLANNER at `xhigh`; add `Implemented-by:` commit footer (PRIMARY tier) to attribute all three pipeline models. References ADR-0031/0030.` Optional l.89: add OpenAI to provider list.
- [ ] Commit: `docs(adr): add ADR-0040 GPT-5.6 Sol tiers + Implemented-by footer` (3-trailer).

---

## Task 2: Tier reassignment — test-gated core (@tdd; Red → Green → Refactor)

**Files:**
- Modify: `tests/Unit/Harness/ModelConfigTest.php:300-301` (variant), `:307` region (new model-lock), `:488-494` (rename/repurpose)
- Modify: `.opencode/setup.json:15-16` (models), `:22-23` (variants)
- Modify: `README.md:314-315`, `CODING_HARNESS.md:92-93`

**Steps:**
- [ ] **Red:** ModelConfigTest — l.300-301 planner/design variant `'max'`→`'xhigh'`; add `it('has planner and design defaulting to GPT-5.6 Sol')` asserting both models = `openai/gpt-5.6-sol` (mirror l.307 judge lock); l.488 rename to `…reflects xhigh for planner and design` + flip `assertStringNotContainsString('`high`',…)` → `assertStringContainsString('`xhigh`',…)`.
- [ ] **Red verify:** `php vendor/bin/pest tests/Unit/Harness/ModelConfigTest.php` → FAIL.
- [ ] **Green:** `setup.json:15-16` planner/design → `openai/gpt-5.6-sol`; `:22-23` variants → `xhigh`. `README.md:314-315` Planner/Design Default → `openai/gpt-5.6-sol`. `CODING_HARNESS.md:92-93` model → `openai/gpt-5.6-sol`, variant → `xhigh`.
- [ ] **Green verify:** `php vendor/bin/pest tests/Unit/Harness/` → PASS. `direnv allow && echo $OPENCODE_MODEL_PLANNER` (= `openai/gpt-5.6-sol`), `echo $OPENCODE_VARIANT_DESIGN` (= `xhigh`). `/models` resolves `openai/gpt-5.6-sol`.
- [ ] Commit: `feat(tiers): route GPT-5.6 Sol to DESIGN+PLANNER at xhigh` (3-trailer; Authored-by still glm-5.2 since this commit lands before PLANNER flip takes effect at next session — use `glm-5.2`).

---

## Task 3: Tier docs (inline; remedies setup.md ADR-0031 drift)

**Files:** `.opencode/docs/model-configuration.md:19-20,71,120-121`; `.opencode/commands/setup.md:124-165`

**Steps:**
- [ ] `model-configuration.md` §1 l.19-20 (PLANNER/DESIGN): model → `openai/gpt-5.6-sol`, variant → `xhigh`; footnote ChatGPT-Plus-OAuth-backed.
- [ ] §2 l.71 OpenAI row: `minimal / low / medium / high` → `none / low / medium / high / xhigh` (+ note API exposes `max`, opencode built-in tops at `xhigh`).
- [ ] §4 l.120-121 (Planning/Design): variant `max` → `xhigh`.
- [ ] `setup.md` full refresh — l.124-128 table ALL rows (Primary→`zai-coding-plan/glm-5.2`, Planner/Design→`openai/gpt-5.6-sol`+`xhigh`, Judge→`deepseek/deepseek-v4-pro`); l.137-147 model prompts; l.154-158 variant prompts (add `xhigh` to Common values). Remedies pre-existing ADR-0031 drift.
- [ ] Verify: `php vendor/bin/pest tests/Unit/Harness/` still green (these files aren't l.452-gated). Visual check.
- [ ] Commit: `docs(tiers): refresh model-configuration + setup.md for GPT-5.6 Sol` (3-trailer).

---

## Task 4: Footer enforcement — commitlint + shell tests (@tdd; Red → Green)

**Files:** `commitlint.config.js:137`; `tests/Shell/commit-msg_test.sh` (13 fixtures + new test); `tests/Shell/commit_template_footer_test.sh:22-35`; `.opencode/commands/release.md:41,46-47`

**Steps:**
- [ ] **Red:** add new test to `commit-msg_test.sh` (mirror Tests 4/5 harness): `printf 'feat: missing impl\n\nAuthored-by: x\nTested-by: x\nSigned-off-by: x <x@x>\n'` → expect REJECT (exit != 0).
- [ ] **Red verify:** `bash tests/Shell/commit-msg_test.sh` → new test FAILS.
- [ ] **Green (enforce):** `commitlint.config.js:137` → `['Authored-by:', 'Implemented-by:', 'Tested-by:', 'Signed-off-by:']`.
- [ ] **Green (fix fixtures):** insert `Implemented-by: x\n` between Authored-by and Tested-by in all **13 fixtures** (l.60, 92, 127, 190, 249, 272, 295, 318, 341, 364, 387, 410, 433). **Test 5 (l.190) is critical** — asserts acceptance, breaks without the 4th trailer.
- [ ] **Green (template + release.md):** `commit_template_footer_test.sh:28-33` add `&& grep -qF "Implemented-by:" "$RELEASE"`; `release.md:41` insert `\nImplemented-by: glm-5.2`; l.46-47 prose add Implemented-by.
- [ ] **Green verify:** `bash tests/Shell/commit-msg_test.sh && bash tests/Shell/commit_template_footer_test.sh` → PASS.
- [ ] **Commit (first 4-trailer):** `feat(commit): require Implemented-by footer from PRIMARY tier` — footers `Authored-by: gpt-5.6-sol` / `Implemented-by: glm-5.2` / `Tested-by: deepseek-v4-pro` / `Signed-off-by: kyau <git@kyaulabs.com>`.

---

## Task 5: Footer convention docs (inline)

**Files:** `AGENTS.md:167,178-179`; `.opencode/skills/conventional-commits/SKILL.md:19-51,118-141,163,182`; `README.md:507-529,553-554,563-564`; `CONTRIBUTING.md:43-53`; `.opencode/skills/finishing-a-development-branch/SKILL.md:32`; `.opencode/skills/writing-plans/SKILL.md:155,175`

**Steps:**
- [ ] `AGENTS.md:167` insert `Implemented-by:` (PRIMARY / `agent.tdd.model`, segment after last `/`) between Authored-by/Tested-by + pipeline order; l.178-179 add `Implemented-by +`.
- [ ] `conventional-commits` skill: "three footers"→"four" (l.23); add Implemented-by block; update CAUTION (l.36-42), examples (l.121-123,130-132,138-140,182), enforcement (l.163).
- [ ] `README.md`: l.513-515 token list add `'Implemented-by',`; l.525 add to required list; l.553-554 + l.563-564 examples insert `Implemented-by: glm-5.2`.
- [ ] `CONTRIBUTING.md:43-53` add Implemented-by (PRIMARY sourcing).
- [ ] `finishing-a-development-branch` l.32 + `writing-plans` l.155/175 add Implemented-by.
- [ ] Verify: `bash tests/Shell/commit_template_footer_test.sh` green; manual consistency review.
- [ ] Commit: `docs(footers): document Implemented-by across harness, skills, CONTRIBUTING` (4-trailer).

---

## Task 6: Spec reconciliation (inline; the "A" choice)

**File:** `docs/specs/2026-07-27-gpt-5-6-sol-design-planner-tiers-spec.md`

**Steps:** fix the 4 inaccuracies the plan corrected:
- [ ] §4.5 "opencode.jsonc agent prompts" → drop / reframe as no-op (footer convention lives in AGENTS.md + skills, not agent prompts).
- [ ] §5.2 "~15 fixtures" → 13; note Test 5 actively breaks.
- [ ] §6 footer-doc table → add CONTRIBUTING.md, finishing-a-development-branch skill, writing-plans skill; correct README footer line refs (l.168-173 → l.507-529).
- [ ] Commit: `docs(specs): reconcile GPT-5.6 spec with implementation` (4-trailer).

---

## Post-execution
- Run `/check` (php-cs-fixer + stylelint + eslint + pest --coverage).
- `@code-review` on the staged branch before push.
- Then `finishing-a-development-branch` (merge/PR/keep/discard; delete plan+spec per lifecycle).

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
