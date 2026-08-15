# Spec: Model-Agnostic Harness; User-Driven Model Configuration

Date: 2026-08-15
Status: Approved (design), pending user review of this written spec

## Problem

The pi harness (ADR-0057) prescribes models and thinking levels for the user:
`.pi/settings.json` and the `settings.json` template pin `defaultProvider`,
`defaultModel`, `defaultThinkingLevel`, and restrict Ctrl+P cycling via
`enabledModels`; `models.json` labels two DeepSeek models "prism primary" /
"prism judge"; `AGENTS.md`, four skills, `/setup`, `/doctor`, the READMEs,
`CODING_HARNESS.md`, `CONTRIBUTING.md`, and the PR template tell the agent and
the human which model to run for which phase and instruct the agent to suggest
switching to a "judge" model.

The user wants the harness to stop selecting models and thinking variants
entirely. The power of pi is that model and thinking level can be set at any
time (Ctrl+P cycles models, Shift+Tab sets thinking); the harness must not
pre-select, restrict, prescribe, or suggest either.

## Decisions

1. **Full model-agnosticism.** The harness ships no model or thinking
   preference: no `defaultProvider` / `defaultModel` / `defaultThinkingLevel`
   / `enabledModels` pins in templates, no `models.json` display-name
   overrides, no "primary"/"judge" framing, no agent-suggested model cycling,
   no model-presence requirements in `/doctor` or `validate-harness.sh`.
   Sessions start on pi's own built-in defaults; the user sets model and
   thinking at any time with Ctrl+P / Shift+Tab.
2. **Commit footers stay, as passive recording.** `Implemented-by:` (the
   active session model) and `Tested-by:` (the OCR review model, via
   `resolve-ocr-model.sh`) remain structurally unchanged (ADR-0064). They
   record whatever model the user happened to use; they select nothing. All
   model names in docs and examples become neutral placeholders.
3. **`/setup` gains a user-driven model-preference step.** Replaces the
   current "DeepSeek model access" section. One question at a time, each
   skippable: provider (pi's catalogue presented as facts, no
   recommendation), default model (validated via `pi --list-models`),
   optional Ctrl+P pool restriction (`enabledModels`; default: no
   restriction), thinking level. A single consent gate writes exactly the
   user's answers to `~/.pi/agent/settings.json`; no other writes; credential
   files are never read. Auth guidance (`/login <provider>` or provider env
   var) is unchanged and user-managed.
4. **User config boundary.** The harness never writes or prescribes the
   user's `~/.pi/agent/settings.json`, `models.json`, or `models-store.json`;
   `/setup` with explicit consent is the only writer.
5. **New ADR-0067.** "Model-Agnostic Harness; User-Driven Model
   Configuration", superseding the model-strategy clauses of ADR-0057 and the
   stale primary/judge context clauses of ADR-0064 (footer structure
   unchanged). Historical ADRs and records stay as frozen archives.

## File-by-file changes

### Deleted

- `models.json` (root) — exists only to label two DeepSeek models
  "prism primary"/"prism judge".

### Config (remove the four model keys; keep everything else)

- `.pi/settings.json` (repo dogfooding: keeps skills/prompts/extensions disk
  paths, drops `defaultProvider`, `defaultModel`, `defaultThinkingLevel`,
  `enabledModels`).
- `settings.json` (root consumer template: keeps `compaction`, `retry`,
  `enableSkillCommands`; drops the same four keys).

### Living harness docs (rewrite or neutralize)

- `packages/prism-core/AGENTS.md` — "Model strategy" section replaced with a
  short statement: model and thinking selection is entirely the human's
  (Ctrl+P cycles, Shift+Tab sets thinking, at any time); the harness never
  prescribes, names, restricts, or suggests a model; session defaults come
  from `/setup`. Git Workflow section: footer wording loses the
  `deepseek-v4-*` examples and the "single-model with manual cycling
  (ADR-0057)" line; skills table drops the three "(suggest Ctrl+P to the
  judge model)" notes.
- `packages/prism-core/README.md`, `README.md` (root), `CODING_HARNESS.md` —
  model-strategy sections rewritten to the model-agnostic statement plus the
  `/setup` pointer; conversion-table rows naming the primary/judge models
  become historical-only references.
- `CONTRIBUTING.md` — footer example neutralized.
- `.github/PULL_REQUEST_TEMPLATE.md` — `pi --list-models deepseek-v4-flash`
  checklist item removed.
- `packages/prism-core/scripts/install-global.sh` — post-install auth
  guidance genericized (no model name).
- `packages/prism-core/scripts/resolve-ocr-model.sh` — comment example
  neutralized; mechanism unchanged.
- `packages/prism-core/prompts/doctor.md` — drops the requirement that
  `deepseek-v4-flash`/`deepseek-v4-pro` exist in the catalogue; doctor
  verifies pi runs and the user's configured provider authenticates
  (generic).
- `packages/prism-core/scripts/validate-harness.sh` — drops the
  `--list-models deepseek-v4-flash` check.

### Skills (remove prescription; neutralize examples)

- `architect/SKILL.md`, `code-review/SKILL.md`, `spec-review/SKILL.md`,
  `test-audit/SKILL.md` — remove the "cycle to `deepseek-v4-pro` with Ctrl+P
  before continuing" instruction lines (no suggestion at all).
- `conventional-commits/SKILL.md` — footer examples become
  `Implemented-by: <active-model-id>` / `Tested-by: <ocr-model-id>`.

### Records (add)

- `adr/0067-model-agnostic-harness-user-driven-model-config.md` — new ADR as
  described in Decision 5.

### Untouched

- Historical records: `adr/` (all existing), `docs/plans/`, `docs/specs/`,
  `docs/follow-ups/`, `CHANGELOG.md`, `NOTICE`.
- `packages/prism-core/skills/websearch/` — the DeepSeek API is that skill's
  search backend (a functional tool dependency, not agent-model selection).
- `tests/Shell/resolve-ocr-model_test.sh` + `fixtures/ocr-config.json` — they
  test the OCR model-resolution mechanism; fixture values are arbitrary test
  data, not prescription.
- Commit footer structure, `.github/hooks/*`, `install-global.sh` deployment
  mechanics (AGENTS.md content flows through it unchanged), the safety
  extension, `CONTEXT.md`.
- The user's `~/.pi/agent/settings.json`, `models.json`, `models-store.json`.

## `/setup` step detail (new section replacing "4. DeepSeek model access")

Title: "Optional: your model preferences". One question at a time, each
skippable:

1. Provider — list pi's built-in providers as facts; no recommendation.
2. Default model — user names an ID; validate with `pi --list-models <id>`;
   if unknown, offer the catalogue.
3. Ctrl+P pool — "Do you want to restrict which models Ctrl+P cycles through?"
   Default: no restriction. If yes, collect model IDs, validated as above.
4. Thinking level — one of pi's levels; skip leaves pi's own default.

Then one consent gate: "Write these to `~/.pi/agent/settings.json`?
(yes/no)". Only a literal `yes` writes; the write merges only the four keys
(`defaultProvider`, `defaultModel`, `defaultThinkingLevel`, `enabledModels`)
into the existing file, never deleting other keys. Declining or skipping
leaves the user config untouched and the harness ships nothing.

## Verification

- Full `/check` gate (php-cs-fixer, stylelint, eslint, Pest ≥ 80% line
  coverage) plus the Shell test suite after implementation.
- `architect` skill runs after this spec, before planning: go/no-go plus the
  `ADR-required:` line (expected `ADR-required: yes` — ADR-0067 is part of
  this design).
- Acceptance criteria:

1. No living harness file names a model as default/recommended/primary/judge,
   pins a default model or thinking level, restricts `enabledModels`, or
   instructs the agent to suggest or perform model switching.
2. `grep -rn "deepseek"` over living surfaces returns only: the websearch
   backend, the OCR-resolution test fixtures, and historical records
   (`adr/`, `docs/plans/`, `docs/specs/`, `docs/follow-ups/`,
   `CHANGELOG.md`).
3. `/setup` offers the optional model-preference step; writes only user
   answers; consent-gated; never reads credential files.
4. AGENTS.md states model/thinking selection is human-owned and points to
   `/setup` for session defaults.
5. Footer structure unchanged; docs use neutral examples.
6. ADR-0067 adopted; ADR-0057 marked superseded (kept as record).
7. `/check` green; Shell tests green.

## Non-goals

- Removing the footer structure or `resolve-ocr-model.sh` mechanics.
- Touching the user's personal pi config outside `/setup` consent.
- Changing the websearch skill's backend.
- Rewriting historical records.

---

# Amendment: Pest Coverage-Driver Silent-Failure Fix

Date: 2026-08-15 (amendment to this spec, same branch)

## Problem

Local Pest runs exit rc=1 with **zero test output** whenever the coverage
driver is unavailable. `phpunit.xml` declares a coverage report; with no
driver, Pest 5.1.1/PHPUnit 13.3 abort before running any tests, printing only
`WARN No code coverage driver available that supports line coverage`. No
diagnostics, no remediation hint — an undebuggable gate failure.

## Root cause (established by the debug loop)

- The only coverage driver on this machine is pcov, loaded via
  `/etc/php/conf.d/pcov.ini` with `pcov.enabled = 0`.
- The system deliberately disables pcov by default: it adds per-request
  overhead to the web server, so **pcov will never be enabled by default**
  (operator constraint).
- With the driver disabled, the coverage-requested abort fires before any
  test runs. CI is unaffected (`setup-php` with `coverage: pcov` enables the
  driver there).
- Feedback loop: `prism-tool run pest -- --coverage --testsuite=Unit` → rc=1
  silent (red); `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/EnvBoolTest.php`
  → 14 passed rc=0 (green).

## Decisions

1. **System config stays untouched.** `pcov.enabled = 0` remains the system
   default; the harness provides the driver **per invocation via the command
   line** (`-d pcov.enabled=1`).
2. **Launcher-level injection (single seam).** The toolchain contract's
   command-component schema gains an optional `argvPrefix` field — a
   string-array of argv tokens prepended to the executable invocation. The
   adapter's `pest` component declares `"argvPrefix": ["php", "-d",
   "pcov.enabled=1"]`. Every harness pest invocation — `/check-php` §4,
   `tdd-php`, `pest-browser`, and CI (`prism-tool run pest`) — inherits the
   fix through the one spawn seam in `runDeclaredTool`. The `-d` override is
   a no-op where pcov is already enabled (CI) and harmless where pcov is
   absent but xdebug is present.
3. **Loud diagnostic for the no-driver case.** `/check-php` §4 gains a
   coverage-driver preflight: if neither `pcov` nor `xdebug` is loaded, FAIL
   with an actionable remediation line (install pcov / enable xdebug) instead
   of pest's silent rc=1. pcov loaded-but-disabled is NOT a failure — the
   launcher injects the enable flag.
4. **Regression guard.** A Shell contract test asserts the static contract
   (adapter toolchain `argvPrefix` declaration; validator acceptance) and runs
   a dynamic coverage smoke (`prism-tool run pest -- --coverage
   --testsuite=Unit`) when a driver module exists — red before this fix on a
   pcov-disabled machine, green after.

## File-by-file changes

- Modify: `packages/prism-core/scripts/prism-tool/contract.js` — add
  `argvPrefix` to `COMPONENT_KEYS`; validate it in `validateComponent` as a
  string array of safe tokens (no spaces or shell metacharacters); library
  components must not declare it.
- Modify: `packages/prism-core/scripts/prism-tool/cli.js` — in
  `runDeclaredTool`, prepend `component.argvPrefix` to the spawn argv:
  `[...(component.argvPrefix ?? []), executable, ...toolArgs]`.
- Modify: `packages/prism-php-web/toolchain.json` — `pest` component gains
  `"argvPrefix": ["php", "-d", "pcov.enabled=1"]`.
- Modify: `packages/prism-php-web/prompts/check-php.md` — §4 coverage-driver
  preflight (loud failure with remediation when neither pcov nor xdebug is
  loaded).
- Create: `tests/Shell/toolchain_argv_prefix_test.sh` — static contract
  assertions + dynamic coverage smoke.

## Verification

- Feedback loop red→green: `prism-tool run pest -- --coverage --testsuite=Unit`
  (rc=1 silent → rc=0 with test output) on this machine where pcov is
  disabled system-wide.
- `bash packages/prism-core/scripts/validate-harness.sh` passes with the new
  schema field.
- Full Shell suite green (including the new contract test and
  `validate-harness_test.sh`).
- `/check` green (php-cs-fixer, stylelint, eslint, validator, contract test).

## Acceptance criteria (amendment)

1. `prism-tool run pest` spawns pest with the injected
   `-d pcov.enabled=1`; coverage runs green locally despite
   `pcov.enabled = 0` in system config.
2. No system PHP configuration file is modified by the harness or this
   branch.
3. `/check-php` reports a loud, actionable failure when no coverage driver
   exists (neither pcov nor xdebug loaded), instead of a silent rc=1.
4. The contract validator accepts `argvPrefix` and still rejects unknown
   keys; `validate-harness.sh` passes.
5. Shell suite and `/check` green on this branch.
