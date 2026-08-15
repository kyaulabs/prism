# Model-Agnostic Harness Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Remove every model/thinking selection, pin, restriction, and prescription from the harness (config, docs, skills, prompts, scripts, records), keep commit footers as passive recording, and add a user-driven, consent-gated model-preference step to `/setup`.

**Architecture:** A docs/config sweep across Prism-owned living surfaces (one shared grep-based contract test provides the red/green cycle), plus one new ADR (0067) superseding the model-selection clauses of ADR-0057, and one new optional `/setup` section whose only write is mirroring the user's own answers into `~/.pi/agent/settings.json`.

**Tech Stack:** bash (contract test), Markdown/JSON edits, pi settings keys (`defaultProvider`, `defaultModel`, `defaultThinkingLevel`, `enabledModels`), Nygard-format ADR.

**Spec:** `docs/specs/2026-08-15-model-agnostic-harness-spec.md`

## Global constraints

- No living harness file may name a model as default/recommended/primary/judge, pin a default model or thinking level, restrict `enabledModels`, or instruct the agent to suggest/perform model switching (spec acceptance criterion 1).
- `grep -rn "deepseek"` over living surfaces must return only: websearch backend (`skills/websearch/`, `DEEPSEEK_API_KEY` env checks), OCR-resolution test fixtures, and historical records (`adr/`, `docs/`, `CHANGELOG.md`) (criterion 2).
- Footer structure is unchanged: `Implemented-by:` → `Tested-by:` → `Signed-off-by:` (ADR-0064); doc examples use neutral placeholders (criterion 5).
- The user's `~/.pi/agent/settings.json`, `models.json`, `models-store.json` are never read or written by this implementation.
- Never read credential files (`auth.json`, `~/.opencodereview/config.json`, etc.).
- Every new/edited `.sh` file keeps its RCS header `# $KYAULabs: <name> kyau@aura.kyaulabs <date> -0700 Exp $` and vim modeline.
- Signed commits (`git commit -S`) with three footers: `Implemented-by: deepseek-v4-flash`, `Tested-by: deepseek-v4-flash`, `Signed-off-by: kyau <kyau@kyau.net>` (resolved values; verify with `resolve-ocr-model.sh` / `resolve-identity.sh`).
- `/check` green at the end (php-cs-fixer, stylelint, eslint, Pest ≥ 80%, Shell suite).

---

### Task 1: Model-agnosticism contract test (Red)

**Files:**
- Create: `tests/Shell/model_agnostic_test.sh` (chmod +x)

**Interfaces:**
- Produces: the living-surface scan + banned-pattern assertions that Tasks 2–7 drive to green. Later tasks re-run `bash tests/Shell/model_agnostic_test.sh` and expect the banned-surface count to shrink to zero.

- [x] **Step 1: Write the failing test**

```bash
#!/usr/bin/env bash
# $KYAULabs: model_agnostic_test.sh kyau@aura.kyaulabs 2026/08/15 -0700 Exp $




# model_agnostic_test.sh — contract test for the model-agnostic harness
# (ADR-0067). Asserts no living harness surface names, pins, restricts, or
# prescribes a model or thinking level. Exempt: historical records (adr/,
# docs/, CHANGELOG.md, NOTICE), tests/ (OCR fixtures are arbitrary test data),
# and the websearch skill's DeepSeek backend (functional tool dependency).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

# Banned tokens: model-prescription surfaces. "DeepSeek API" (websearch
# backend) and DEEPSEEK_API_KEY (its env contract) are NOT banned.
PATTERNS='deepseek-v4|deepseek/deepseek|defaultModel|defaultProvider|defaultThinkingLevel|enabledModels|judge model|primary model'

# ── 1. models.json must not exist ───────────────────────────────────────────
if [ -e "$REPO_ROOT/models.json" ]; then
	fail "models.json still exists — the primary/judge display overrides must be deleted (ADR-0067)"
else
	pass "models.json absent"
fi

# ── 2. Living surfaces carry no model prescription ──────────────────────────
mapfile -t FILES < <(
	find "$REPO_ROOT/.pi" "$REPO_ROOT/packages/prism-core" \
		-type f \( -name '*.md' -o -name '*.sh' -o -name '*.json' -o -name '*.ts' \) \
		-not -path '*/skills/websearch/*' 2>/dev/null
	printf '%s\n' \
		"$REPO_ROOT/settings.json" \
		"$REPO_ROOT/README.md" \
		"$REPO_ROOT/CODING_HARNESS.md" \
		"$REPO_ROOT/CONTRIBUTING.md" \
		"$REPO_ROOT/.github/PULL_REQUEST_TEMPLATE.md"
)

VIOLATIONS=0
for f in "${FILES[@]}"; do
	[ -f "$f" ] || continue
	if grep -HnEi "$PATTERNS" "$f" >/dev/null 2>&1; then
		VIOLATIONS=$((VIOLATIONS + 1))
		while IFS= read -r line; do
			fail "prescription in $f: $line"
		done < <(grep -HnEi "$PATTERNS" "$f" 2>/dev/null | head -5)
	fi
done

if [ "$VIOLATIONS" -gt 0 ]; then
	fail "$VIOLATIONS file(s) still carry model prescription"
else
	pass "no model prescription in living surfaces"
fi

print_summary "model_agnostic"




# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [x] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/model_agnostic_test.sh`
Expected: FAIL — matches in `AGENTS.md`, `README.md`, `CODING_HARNESS.md`, `CONTRIBUTING.md`, `prompts/setup.md`, `prompts/doctor.md`, `scripts/validate-harness.sh`, `scripts/install-global.sh`, `scripts/resolve-ocr-model.sh`, the four skills, `conventional-commits`, `settings.json`, `.pi/settings.json`, and `models.json` exists. This is the Red proving the sweep is needed.

- [x] **Step 3: chmod +x**

```bash
chmod +x tests/Shell/model_agnostic_test.sh
```

- [x] **Step 4: Commit**

```bash
git add tests/Shell/model_agnostic_test.sh
git commit -S -m $'test(harness): add model-agnosticism contract test\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 2: Config sweep — drop model/thinking pins, delete models.json

**Files:**
- Modify: `.pi/settings.json`
- Modify: `settings.json`
- Delete: `models.json` (via `git rm`)

**Interfaces:**
- Consumes: none. Produces: config surfaces free of the four banned keys; `models.json` absent (Task 1 assertion 1 goes green).

- [x] **Step 1: Edit `.pi/settings.json`**

Remove `"defaultProvider": "deepseek"`, `"defaultModel": "deepseek-v4-flash"`, `"defaultThinkingLevel": "medium"`, and `"enabledModels": [...]`. Result:

```json
{
  "skills": ["../packages/prism-core/skills", "../packages/prism-php-web/skills"],
  "prompts": ["../packages/prism-core/prompts", "../packages/prism-php-web/prompts"],
  "extensions": ["../packages/prism-core/extensions"]
}
```

- [x] **Step 2: Edit `settings.json`**

Remove the same four keys. Result:

```json
{
  "compaction": { "enabled": true, "reserveTokens": 16384, "keepRecentTokens": 20000 },
  "retry": { "enabled": true, "maxRetries": 3 },
  "enableSkillCommands": true
}
```

- [x] **Step 3: Delete `models.json`**

```bash
git rm models.json
```

- [x] **Step 4: Run the contract test (partial green)**

Run: `bash tests/Shell/model_agnostic_test.sh`
Expected: assertion 1 (models.json absent) PASS; file-scan FAILs now only for docs/skills/prompts/scripts — no FAIL mentions `settings.json` or `.pi/`.

- [x] **Step 5: Commit**

```bash
git add .pi/settings.json settings.json
git commit -S -m $'feat(config): drop model and thinking pins from pi settings\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 3: AGENTS.md model strategy → human-owned statement

**Files:**
- Modify: `packages/prism-core/AGENTS.md`

**Interfaces:**
- Produces: the canonical "Model strategy" text Tasks 4–7 mirror in skills and repo docs.

- [x] **Step 1: Replace the "Model strategy" section**

Old text:

```markdown
## Model strategy

- **Primary:** `deepseek/deepseek-v4-flash` — the default for all pipeline
  work (brainstorm, plan, TDD, implement, verify).
- **Judge:** `deepseek/deepseek-v4-pro` — cycle to it with **Ctrl+P** for
  review/audit work (`code-review`, `spec-review`, `test-audit`,
  `architect`); those skills suggest the switch. Cycle back with Ctrl+P.
- **Thinking:** raise/lower the thinking level with **Shift+Tab**.

There is **no automatic model tiering** (ADR-0057): the agent runs on the
primary unless the human (or the agent, by suggesting it) manually Ctrl+P's
to the judge.
```

New text:

```markdown
## Model strategy

Model and thinking selection is entirely the human's (ADR-0067). Pi gives
full control at any time: **Ctrl+P** cycles models, **Shift+Tab** sets the
thinking level. The harness never prescribes, names, restricts, or suggests a
model. Sessions start on pi's own defaults; run `/setup` to write your own
preferred provider, default model, Ctrl+P pool, and thinking level to your pi
config — every question is skippable and the write is consent-gated.
```

- [x] **Step 2: Git Workflow bullet — model-selection sentence**

Old:

```markdown
- Model selection is single-model with manual cycling — see **Model strategy**
  below (ADR-0057). There is no manifest/env tier layer.
```

New:

```markdown
- Model and thinking selection is entirely the human's — see **Model
  strategy** below (ADR-0067). There is no manifest/env tier layer.
```

- [x] **Step 3: Git Workflow bullet — footer example neutralization**

Old:

```markdown
  `Signed-off-by:` (user) footers, in pipeline order `Implemented-by` →
  `Tested-by` → `Signed-off-by` (ADR-0064). Each model footer is the model
  ID segment after the last `/` (e.g. `deepseek-v4-flash`, `deepseek-v4-pro`).
```

New:

```markdown
  `Signed-off-by:` (user) footers, in pipeline order `Implemented-by` →
  `Tested-by` → `Signed-off-by` (ADR-0064). Each model footer is the bare
  model ID segment after the last `/` (e.g. `provider/model-id` → `model-id`).
```

- [x] **Step 4: Skills table — drop the three judge-suggestion notes**

Old (three rows):

```markdown
| `code-review` | Reviewing staged changes before push (suggest Ctrl+P to the judge model) |
| `spec-review` | Read-only review that checks requirement coverage against the branch's spec (suggest Ctrl+P to the judge model) |
| `test-audit` | Auditing an existing test suite for quality (suggest Ctrl+P to the judge model) |
```

New (same rows, suffix removed):

```markdown
| `code-review` | Reviewing staged changes before push |
| `spec-review` | Read-only review that checks requirement coverage against the branch's spec |
| `test-audit` | Auditing an existing test suite for quality |
```

- [x] **Step 5: Run the contract test**

Run: `bash tests/Shell/model_agnostic_test.sh`
Expected: no FAIL lines for `AGENTS.md`.

- [x] **Step 6: Commit**

```bash
git add packages/prism-core/AGENTS.md
git commit -S -m $'feat(harness): make AGENTS.md model-agnostic\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 4: Skills — remove model-switch suggestions, neutralize footer examples

**Files:**
- Modify: `packages/prism-core/skills/architect/SKILL.md`
- Modify: `packages/prism-core/skills/code-review/SKILL.md`
- Modify: `packages/prism-core/skills/spec-review/SKILL.md`
- Modify: `packages/prism-core/skills/test-audit/SKILL.md`
- Modify: `packages/prism-core/skills/conventional-commits/SKILL.md`

**Interfaces:**
- Consumes: Task 3's canonical statement (skills no longer suggest models). Produces: skill surfaces free of `deepseek-v4-pro` and `deepseek-v4-flash`.

- [x] **Step 1: Remove the judge-cycle paragraph from the four review skills**

In each of `architect`, `code-review`, `spec-review`, `test-audit` SKILL.md, delete the following paragraph (it sits near the top, after the frontmatter):

```markdown
For the strongest cross-model review, suggest that the human cycle to
`deepseek-v4-pro` with Ctrl+P before continuing. Proceed on the current model
if they decline.
```

If the exact wording differs slightly in a file, remove the sentence(s) mentioning `deepseek-v4-pro` with Ctrl+P and keep the surrounding prose coherent.

- [x] **Step 2: Neutralize `conventional-commits/SKILL.md` — Required Footers example**

Old:

```markdown
- **`Implemented-by:`** — the model pi is using (the active session model).
  Use the model ID segment after the last `/` (for example,
  `deepseek/deepseek-v4-flash` → `deepseek-v4-flash`).
```

New:

```markdown
- **`Implemented-by:`** — the model pi is using (the active session model).
  Use the bare model ID segment after the last `/` (for example,
  `provider/model-id` → `model-id`).
```

- [x] **Step 3: Neutralize `conventional-commits/SKILL.md` — example footers**

Replace every `Implemented-by: deepseek-v4-flash` with `Implemented-by: <active-model-id>` and every `Tested-by: deepseek-v4-pro` with `Tested-by: <ocr-model-id>` throughout the Examples section (three blocks shown in the current file; sweep the whole file).

- [x] **Step 4: Run the contract test**

Run: `bash tests/Shell/model_agnostic_test.sh`
Expected: no FAIL lines under `skills/`.

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/skills/architect/SKILL.md packages/prism-core/skills/code-review/SKILL.md packages/prism-core/skills/spec-review/SKILL.md packages/prism-core/skills/test-audit/SKILL.md packages/prism-core/skills/conventional-commits/SKILL.md
git commit -S -m $'feat(skills): remove model-switch suggestions and neutralize examples\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 5: Prompts and scripts — user-driven setup step, generic doctor and checks

**Files:**
- Modify: `packages/prism-core/prompts/setup.md`
- Modify: `packages/prism-core/prompts/doctor.md`
- Modify: `packages/prism-core/scripts/validate-harness.sh`
- Modify: `packages/prism-core/scripts/install-global.sh`
- Modify: `packages/prism-core/scripts/resolve-ocr-model.sh`

**Interfaces:**
- Consumes: Task 3's canonical statement. Produces: `/setup`'s new optional model-preference step (the user-facing "way to setup defaults and providers for Ctrl+P"); doctor/validator no longer require any model.

- [x] **Step 1: Replace `setup.md` section 4**

Old text (whole section):

```markdown
## 4. DeepSeek model access

Verify that pi knows both scoped model IDs without exposing credentials:

```bash
pi --list-models deepseek-v4-flash
pi --list-models deepseek-v4-pro
```

The expected strategy is:

- primary: `deepseek/deepseek-v4-flash`
- review/audit judge: `deepseek/deepseek-v4-pro` via Ctrl+P
- thinking level: Shift+Tab

If authentication is not configured, instruct the user to run
`/login deepseek` themselves or export `DEEPSEEK_API_KEY` in their shell.
Do not ask them to paste the key and do not write it to a project file.
```

New text:

```markdown
## 4. Optional: your model preferences

The harness is model-agnostic (ADR-0067): it never selects, prescribes, or
restricts models or thinking levels. Model and thinking control is yours at
any time — **Ctrl+P** cycles models, **Shift+Tab** sets the thinking level.
This step optionally writes *your* choices as session defaults to
`~/.pi/agent/settings.json`. Every question is skippable; declining any
question leaves the user's pi configuration untouched.

Ask, one question at a time:

1. Provider — list pi's built-in providers as facts (e.g. `deepseek`); no
   recommendation. Skippable.
2. Default model — the user names a model ID; validate with
   `pi --list-models <id>`; if unknown, list the catalogue and let them
   pick. Skippable.
3. Ctrl+P pool — "Do you want to restrict which models Ctrl+P cycles
   through?" Default answer: no restriction (every model usable). If yes,
   collect model IDs and validate each. Skippable.
4. Thinking level — one of pi's levels (`off`, `minimal`, `low`, `medium`,
   `high`, `xhigh`, `max`) or skip to leave pi's own default. Skippable.

Then one consent gate:

```text
Write these to ~/.pi/agent/settings.json? (yes/no)
```

Accept only `yes`. On approval, merge exactly the four keys
(`defaultProvider`, `defaultModel`, `defaultThinkingLevel`, `enabledModels`)
into the existing file with Node.js (a core floor, per doctor):

```bash
node -e 'const fs=require("fs");const p=process.argv[1];const o=JSON.parse(fs.readFileSync(p,"utf8"));Object.assign(o,JSON.parse(process.argv[2]));fs.writeFileSync(p,JSON.stringify(o,null,2)+"\n")' "$HOME/.pi/agent/settings.json" '<merged-json>'
```

Never delete or alter other keys, never create or touch `models.json`, and
never read credential files. Any reply other than `yes` leaves the file
untouched.

If authentication is not configured, instruct the user to run `/login`
themselves or export the provider's API key in their shell. Do not ask them
to paste a key and do not write it to a project file.
```

- [x] **Step 2: Replace `doctor.md` section 1**

Old text:

```markdown
## 1. pi and models

```bash
set -o pipefail
pi --version 2>/dev/null || echo "NOT_FOUND"
pi --list-models deepseek-v4-flash 2>/dev/null || echo "NOT_FOUND"
pi --list-models deepseek-v4-pro 2>/dev/null || echo "NOT_FOUND"
```

PASS requires pi to run and both `deepseek/deepseek-v4-flash` and
`deepseek/deepseek-v4-pro` to appear in the model catalogue. Catalogue
presence does not prove authentication. Never inspect the auth store; if a
live request later reports an auth error, direct the user to `/login deepseek`.
```

New text:

```markdown
## 1. pi runtime

```bash
set -o pipefail
pi --version 2>/dev/null || echo "NOT_FOUND"
```

PASS requires pi to run. The harness prescribes no models (ADR-0067); model
availability and authentication are user-managed. Never inspect the auth
store; if a live request later reports an auth error, direct the user to
`/login` for their provider.
```

- [x] **Step 3: Neutralize `validate-harness.sh`**

Old (extension-import validation loop):

```bash
		--no-extensions -e "$extension_entry" --list-models deepseek-v4-flash \
```

New:

```bash
		--no-extensions -e "$extension_entry" --list-models \
```

- [x] **Step 4: Neutralize `install-global.sh` post-install hint**

Old:

```bash
  • Authenticate the model: /login deepseek  (or export DEEPSEEK_API_KEY).
```

New:

```bash
  • Authenticate your provider: /login <provider>  (or export its API key).
```

- [x] **Step 5: Neutralize `resolve-ocr-model.sh` comment example**

Old:

```bash
# Output: bare model id on stdout (e.g. "deepseek-v4-flash")
```

New:

```bash
# Output: bare model id on stdout (bare ID segment after the last "/")
```

- [x] **Step 6: Run the contract test**

Run: `bash tests/Shell/model_agnostic_test.sh`
Expected: no FAIL lines under `prompts/` or `scripts/`.

- [x] **Step 7: Verify the validator still runs**

Run: `bash packages/prism-core/scripts/validate-harness.sh`
Expected: completes without error (the extension-import loop works with the model filter removed).

- [x] **Step 8: Commit**

```bash
git add packages/prism-core/prompts/setup.md packages/prism-core/prompts/doctor.md packages/prism-core/scripts/validate-harness.sh packages/prism-core/scripts/install-global.sh packages/prism-core/scripts/resolve-ocr-model.sh
git commit -S -m $'feat(prompts): add user-driven model setup step, generic doctor checks\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 6: Repo docs — neutralize model references

**Files:**
- Modify: `README.md` (root)
- Modify: `packages/prism-core/README.md`
- Modify: `CODING_HARNESS.md`
- Modify: `CONTRIBUTING.md`
- Modify: `.github/PULL_REQUEST_TEMPLATE.md`

**Interfaces:**
- Consumes: Task 3's canonical statement. Produces: doc surfaces free of model prescription; `/setup` pointer present.

- [x] **Step 1: `README.md` (root) — auth snippet + default-model sentence**

Old:

```markdown
   ```bash
   pi            # then /login  → select DeepSeek
   # or: export DEEPSEEK_API_KEY=sk-...
   ```

   Default model `deepseek-v4-flash`; cycle to `deepseek-v4-pro` for
   review/audit with **Ctrl+P** (see [Model strategy](#model-strategy),
   ADR-0057).
```

New:

```markdown
   ```bash
   pi            # then /login → select your provider
   ```

   Model and thinking selection is yours at any time — **Ctrl+P** cycles
   models, **Shift+Tab** sets thinking (see [Model strategy](#model-strategy),
   ADR-0067).
```

- [x] **Step 2: `README.md` (root) — pipeline step 8**

Old: `8. **Review** — load the `code-review` skill before push (suggest Ctrl+P to the judge model).`
New: `8. **Review** — load the `code-review` skill before push.`

- [x] **Step 3: `README.md` (root) — trade-off sentence**

Old: `and **automatic model tiering is gone** (cycle manually — see [Model strategy](#model-strategy)).`
New: `and **the harness prescribes no models** — model and thinking are yours to set at any time (see [Model strategy](#model-strategy)).`

- [x] **Step 4: `README.md` (root) — conversion-table row**

Old: `| `.envrc` / direnv / `prism.jsonc` / six-tier models | **deleted** — single primary model + manual Ctrl+P cycling (ADR-0057) |`
New: `| `.envrc` / direnv / `prism.jsonc` / six-tier models | **deleted** — model-agnostic; selection is the human's (ADR-0067) |`

- [x] **Step 5: `README.md` (root) — Model strategy section**

Old:

```markdown
### Model strategy

There is **no manifest/env tier layer** (ADR-0057). One primary model, one
judge, manual cycling:

| Role | Model | When |
| --- | --- | --- |
| Primary | `deepseek/deepseek-v4-flash` | default for all pipeline work |
| Judge | `deepseek/deepseek-v4-pro` | cycle with **Ctrl+P** for `code-review` / `spec-review` / `test-audit` / `architect` (those skills suggest the switch) |

- **Thinking:** raise/lower with **Shift+Tab**.
- **Auth:** `/login deepseek` or `export DEEPSEEK_API_KEY`.
- **Scoped cycling:** `enabledModels: ["deepseek-v4-flash", "deepseek-v4-pro"]`
  (set in `settings.json` / [`.pi/settings.json`](.pi/settings.json)).
```

New:

```markdown
### Model strategy

There is **no manifest/env tier layer** (ADR-0067). The harness prescribes,
names, restricts, and suggests no model:

- **Model:** cycle with **Ctrl+P** at any time.
- **Thinking:** raise/lower with **Shift+Tab**.
- **Auth:** `/login` for your provider or export the provider's API key.
- **Session defaults:** run `/setup` to write your preferred provider,
  default model, Ctrl+P pool, and thinking level to your pi config — every
  question is skippable and the write is consent-gated.
```

- [x] **Step 6: `packages/prism-core/README.md` — post-install sentence**

Old: `Authenticate the model\nwith `/login`; the default model is `deepseek-v4-flash`, and **Ctrl+P** cycles\nto `deepseek-v4-pro` for review.`
New: `Authenticate with `/login`\nfor your provider. Model and thinking selection is yours at any time —\n**Ctrl+P** cycles models, **Shift+Tab** sets thinking; the harness prescribes\nnothing (ADR-0067). Run `/setup` to write your own session defaults.`

- [x] **Step 7: `CODING_HARNESS.md` — orientation paragraph**

Old: `the\nsix-tier model system collapsed to **one primary model + manual Ctrl+P\ncycling** (ADR-0057).`
New: `the\nsix-tier model system collapsed to **no prescribed model at all** — model and\nthinking selection is yours at any time (ADR-0067).`

- [x] **Step 8: `CODING_HARNESS.md` — conversion-table row**

Old: `| `.envrc` / direnv / `prism.jsonc` / six-tier models | **deleted** — single primary model + manual Ctrl+P cycling (ADR-0057) |`
New: `| `.envrc` / direnv / `prism.jsonc` / six-tier models | **deleted** — model-agnostic; selection is the human's (ADR-0067) |`

- [x] **Step 9: `CODING_HARNESS.md` — trade-off bullet**

Old:

```markdown
- **Automatic model tiering is gone.** Review/audit run on the primary model
  unless the human (or the agent, by suggesting it) manually Ctrl+P's to the
  judge. The `code-review`/`spec-review`/`test-audit` skills include a one-line
  prompt to suggest the switch.
```

New:

```markdown
- **Model and thinking selection is the human's.** The harness prescribes
  nothing (ADR-0067): no primary/judge roles, no suggestions, no
  restrictions. Ctrl+P cycles models and Shift+Tab sets thinking at any time.
```

- [x] **Step 10: `CODING_HARNESS.md` — Model strategy section**

Old:

```markdown
## Model strategy

There is **no manifest/env tier layer** (ADR-0057). One primary model, one
judge, manual cycling:

| Role | Model | When |
| --- | --- | --- |
| Primary | `deepseek/deepseek-v4-flash` | default for all pipeline work |
| Judge | `deepseek/deepseek-v4-pro` | cycle with **Ctrl+P** for `code-review` / `spec-review` / `test-audit` / `architect` |

- **Thinking:** raise/lower with **Shift+Tab**.
- **Auth:** `/login deepseek` or `export DEEPSEEK_API_KEY`.
- **Scoped cycling:** `enabledModels: ["deepseek-v4-flash", "deepseek-v4-pro"]`
  in `settings.json` / `.pi/settings.json`.
```

New:

```markdown
## Model strategy

There is **no manifest/env tier layer** (ADR-0067). The harness prescribes,
names, restricts, and suggests no model:

- **Model:** cycle with **Ctrl+P** at any time.
- **Thinking:** raise/lower with **Shift+Tab**.
- **Auth:** `/login` for your provider or export the provider's API key.
- **Session defaults:** run `/setup` to write your preferred provider,
  default model, Ctrl+P pool, and thinking level to your pi config — every
  question is skippable and the write is consent-gated.
```

- [x] **Step 11: `CONTRIBUTING.md` — footer paragraph**

Old:

```markdown
Under the single-agent, single-primary-model design (ADR-0057) the
`Implemented-by:` footer is the session model in use. `Tested-by:` is the
model open-code-review is configured to review with (resolved via
`resolve-ocr-model.sh`). Each value is the bare model id (e.g.
`deepseek-v4-flash`, `deepseek-v4-pro`).
```

New:

```markdown
`Implemented-by:` is the session model in use; `Tested-by:` is the model
open-code-review is configured to review with (resolved via
`resolve-ocr-model.sh`). Each value is the bare model ID segment after the
last `/` (e.g. `provider/model-id` → `model-id`). The harness prescribes no
models (ADR-0067).
```

- [x] **Step 12: `.github/PULL_REQUEST_TEMPLATE.md` — example checklist line**

Old: `  - [ ] `pi --list-models deepseek-v4-flash` — primary model is available`
New: `  - [ ] `pi --list-models` — model catalogue lists your providers`

- [x] **Step 13: Run the contract test**

Run: `bash tests/Shell/model_agnostic_test.sh`
Expected: **all PASS** — the sweep is green.

- [x] **Step 14: Commit**

```bash
git add README.md packages/prism-core/README.md CODING_HARNESS.md CONTRIBUTING.md .github/PULL_REQUEST_TEMPLATE.md
git commit -S -m $'docs(harness): neutralize model references in repo docs\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 7: ADR-0067, supersede ADR-0057, update CONTEXT.md

**Files:**
- Create: `adr/0067-model-agnostic-harness-user-driven-model-config.md`
- Modify: `adr/0057-single-model-manual-cycling-manifest-deleted.md`
- Modify: `CONTEXT.md`

**Interfaces:**
- Consumes: everything above. Produces: the durable record; ADR-0057 marked Superseded; CONTEXT.md's Pi-era list current.

- [x] **Step 1: Write ADR-0067**

```markdown
# 0067. Model-Agnostic Harness; User-Driven Model Configuration

Date: 2026-08-15

## Status

Accepted

Supersedes the model-selection clauses of ADR-0057 (single primary model +
judge with manual Ctrl+P cycling) and the primary/judge context description
in ADR-0064 (its footer structure is unchanged). Depends on ADR-0055
(single-agent philosophy) and ADR-0064 (three-footers).

## Context

ADR-0057 prescribed a single primary model (`deepseek/deepseek-v4-flash`)
with one judge (`deepseek/deepseek-v4-pro`) reachable via manual Ctrl+P
cycling. The prescription propagated across the harness: `settings.json`
templates pinned `defaultProvider`, `defaultModel`, `defaultThinkingLevel`,
and restricted the Ctrl+P pool via `enabledModels`; `models.json` labeled the
two models "prism primary"/"prism judge"; `AGENTS.md`, four skills, `/setup`,
`/doctor`, the READMEs, `CODING_HARNESS.md`, `CONTRIBUTING.md`, and the PR
template told the human and the agent which model to run for which phase and
instructed the agent to suggest switching to the judge.

The operator wants the harness to stop selecting models and thinking
variants entirely. pi's native power is that model and thinking level can be
set at any time (Ctrl+P cycles models, Shift+Tab sets thinking); any residual
pin, restriction, or suggestion in the harness violates that.

## Decision

1. **Full model-agnosticism.** The harness ships no model or thinking
   preference: no `defaultProvider` / `defaultModel` / `defaultThinkingLevel`
   / `enabledModels` pins in templates, no `models.json` display overrides,
   no "primary"/"judge" framing, no agent-suggested model cycling, no
   model-presence requirements in `/doctor` or `validate-harness.sh`.
   Sessions start on pi's own built-in defaults.
2. **Commit footers stay, as passive recording.** `Implemented-by:` (the
   active session model) and `Tested-by:` (the OCR review model via
   `resolve-ocr-model.sh`) are unchanged in structure (ADR-0064). They record
   whatever model the user happened to use; they select nothing. Doc examples
   use neutral placeholders.
3. **`/setup` gains a user-driven model-preference step.** One question at a
   time, each skippable: provider (pi's catalogue presented as facts, no
   recommendation), default model (validated via `pi --list-models`),
   optional Ctrl+P pool restriction (default: no restriction), thinking
   level. A single consent gate merges exactly the user's answers into
   `~/.pi/agent/settings.json`; credential files are never read.
4. **User config boundary.** The harness never writes or prescribes the
   user's `~/.pi/agent/settings.json`, `models.json`, or `models-store.json`;
   `/setup` with explicit consent is the only writer.

## Consequences

- **Easier:** no model-specific content to maintain in config, docs, skills,
  or prompts; the harness is provider-agnostic; `/doctor` no longer depends
  on any model's catalogue presence.
- **Accepted trade-offs:** fresh sessions start on pi's own defaults rather
  than a harness-chosen model; review/audit no longer get a harness-suggested
  stronger-model switch — the human owns that choice entirely, at any time.
- **History preserved:** commit footers keep recording the session and OCR
  models; ADR-0057 remains as a superseded record of the pi-migration model
  policy.

## Alternatives Considered

- **Keep defaults but drop restrictions and prescription.** Rejected: any
  residual pin or naming is exactly the selection behavior the operator
  rejected; pi's own defaults handle session start.
- **Drop the commit footers.** Rejected: footers record rather than select,
  and the git history serves as the development and evaluation log; removing
  attribution buys nothing in selection freedom.
- **Docs-only guidance instead of a `/setup` step.** Rejected: the operator
  explicitly asked for a setup *way* for default models and providers, not a
  document.
```

- [x] **Step 2: Mark ADR-0057 superseded**

Edit `adr/0057-single-model-manual-cycling-manifest-deleted.md`: change

```markdown
## Status

Accepted
```

to

```markdown
## Status

Superseded by ADR-0067

Retained as historical context; its model-selection clauses (single primary
model + judge, manual cycling prescription) are replaced by ADR-0067. The
manifest/env-layer retirement it records remains in effect.
```

- [x] **Step 3: Update CONTEXT.md Pi-era list**

In `CONTEXT.md` "Pi-era decisions", change

```markdown
- `adr/0057-single-model-manual-cycling-manifest-deleted.md` — use Pi-native model settings and manual cycling; retire the Prism manifest.
```

to

```markdown
- `adr/0057-single-model-manual-cycling-manifest-deleted.md` — superseded by ADR-0067; retained as historical context.
```

and add after the last Pi-era entry (verify whether 0064/0065/0066 entries are present; add 0064–0066 if missing for accuracy):

```markdown
- `adr/0067-model-agnostic-harness-user-driven-model-config.md` — the harness selects no model or thinking level; `/setup` writes only the user's choices; commit footers record passively.
```

- [x] **Step 4: Run the contract test (still green)**

Run: `bash tests/Shell/model_agnostic_test.sh`
Expected: all PASS (ADR/CONTEXT files are outside the scan set, but confirm nothing regressed).

- [x] **Step 5: Commit**

```bash
git add adr/0067-model-agnostic-harness-user-driven-model-config.md adr/0057-single-model-manual-cycling-manifest-deleted.md CONTEXT.md
git commit -S -m $'docs(adr): adopt model-agnostic harness (ADR-0067)\n\nSupersedes the model-selection clauses of ADR-0057; commit footers remain\npassive recording under ADR-0064.\n\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [x] **Step 1: Contract test**

Run: `bash tests/Shell/model_agnostic_test.sh`
Expected: all PASS.

- [x] **Step 2: Full Shell suite**

```bash
tests=( tests/Shell/*_test.sh )
for t in "${tests[@]}"; do echo "== $t"; bash "$t" || echo "FAILED: $t"; done
```

Expected: every suite PASSes (mirrors CI step `Shell regression tests`). Note: `validate-harness_test.sh` and `install_global_toolchain_test.sh` must pass with the validator change; `resolve-ocr-model_test.sh` is untouched and must stay green.

- [x] **Step 3: Validator**

Run: `bash packages/prism-core/scripts/validate-harness.sh`
Expected: exit 0, no errors.

- [x] **Step 4: /check**

Run the adapter stack gate: `/check` (php-cs-fixer + stylelint + eslint + Pest coverage ≥ 80%).
Expected: green. This is a docs/config sweep; no PHP behavior changed, but the gate must pass on the changed files.

- [x] **Step 5: Spec acceptance walk-through**

- Criterion 1 (no living surface prescribes): `bash tests/Shell/model_agnostic_test.sh` green.
- Criterion 2 (grep over living surfaces): `grep -rn "deepseek" packages/prism-core README.md CODING_HARNESS.md CONTRIBUTING.md .github/PULL_REQUEST_TEMPLATE.md settings.json .pi 2>/dev/null | grep -vi "DEEPSEEK_API_KEY\|websearch"` returns only `skills/websearch/` hits.
- Criterion 3 (/setup step): `grep -n "Optional: your model preferences" packages/prism-core/prompts/setup.md`.
- Criterion 4 (AGENTS.md human-owned statement): `grep -n "entirely the human's" packages/prism-core/AGENTS.md`.
- Criterion 5 (footer structure unchanged): `git diff --stat` shows no `.github/hooks/` changes; `grep -rn "Implemented-by" packages/prism-core/skills/conventional-commits/SKILL.md` shows `<active-model-id>` placeholders.
- Criterion 6 (ADR-0067 adopted, 0057 superseded): `grep -n "Superseded by ADR-0067" adr/0057-single-model-manual-cycling-manifest-deleted.md` and `head -3 adr/0067-*.md`.
- Criterion 7 (/check green): Step 4 result.
