# 0012. Configurable Model Variables via {env:VAR} Substitution

Date: 2026-07-10

## Status

Proposed

## Context

GitHub issue #111 proposed refactoring the coding harness to support
user-defined model variables, allowing developers to configure their
preferred AI models for core agent roles without editing project files.

The harness currently hard-codes model IDs in two locations:

1. **`opencode.json`** — top-level `model` field (inherited by `build`) plus
   explicit `model` fields on `plan`, `judge`, `general`, `explore`,
   `compaction`, `title`, and `summary`.
2. **`.opencode/agents/*.md`** — frontmatter `model:` fields on all 8 custom
   subagent definitions (`tdd`, `architect`, `code-review`, `debug`,
   `docs-writer`, `resolve-merge-conflicts`, `semgrep`, `test-audit`).

The agents naturally group into three tiers:

| Tier | Model (current hard-code) | Agents |
|---|---|---|
| Primary | `deepseek/deepseek-v4-pro` | build, tdd, architect, code-review, debug, resolve-merge-conflicts, test-audit, general, explore |
| Planner | `openrouter/z-ai/glm-5.2` | plan, judge |
| Utility | `deepseek/deepseek-v4-flash` | compaction, title, summary, docs-writer, semgrep |

The issue's original proposal (`${variable.path}` syntax, custom
`~/.opencode/setup.json`, custom variable resolution logic) was investigated
against the vendored opencode docs (v0.59.0+) and found infeasible:

- **`${variable.path}` syntax does not exist.** OpenCode uses `{env:VAR_NAME}`
  (no `$` prefix) and `{file:path}` for config substitution.
- **`~/.opencode/setup.json` is not a recognized config path.** The global
  config is `~/.config/opencode/opencode.json`.
- **Config merge is key-level.** Project config (`opencode.json`) overrides
  global config (`~/.config/opencode/opencode.json`) for conflicting keys.
  Removing explicit `model:` from project config would let global config
  override, but loses per-agent tier differentiation.

Key constraint: **backward compatibility** — a fresh clone must work without
any setup step beyond what's already required.

## Decision

Use opencode's native `{env:VAR}` substitution to replace hard-coded model
strings with environment variable references across three tiers:

- `{env:OPENCODE_MODEL_PRIMARY}` — high-capability model (build, tdd,
  architect, code-review, debug, resolve-merge-conflicts, test-audit, general,
  explore)
- `{env:OPENCODE_MODEL_PLANNER}` — reasoning-optimized model (plan, judge)
- `{env:OPENCODE_MODEL_UTILITY}` — cost-efficient model (compaction, title,
  summary, docs-writer, semgrep)

Default values ship in a committed `.opencode/models.default.env`:

```sh
export OPENCODE_MODEL_PRIMARY="deepseek/deepseek-v4-pro"
export OPENCODE_MODEL_PLANNER="openrouter/z-ai/glm-5.2"
export OPENCODE_MODEL_UTILITY="deepseek/deepseek-v4-flash"
```

A committed `.envrc` (direnv) sources the defaults on directory entry,
with an optional user-override file at `~/.config/opencode/models.env`:

```sh
source .opencode/models.default.env
if [ -f ~/.config/opencode/models.env ]; then
    source ~/.config/opencode/models.env
fi
```

Users without direnv can `source .opencode/models.default.env` manually
or add it to their shell profile.

**`variant` and `temperature` remain as literals** in `opencode.json` and
agent `.md` frontmatter. The `{env:VAR}` mechanism returns strings;
temperature is a numeric type. More importantly, variant and temperature
are behavior-tuning parameters (see ADR-0011), not model-selection
parameters. Making the model configurable is sufficient — users who need
variant/temperature overrides can use `OPENCODE_CONFIG_CONTENT` as a
global override.

**Agent `.md` frontmatter uses quoted `{env:VAR}` values.** Curly braces
in `{env:VAR_NAME}` would be interpreted as YAML flow mapping syntax in
unquoted frontmatter fields. The values must be quoted:
`model: "{env:OPENCODE_MODEL_PRIMARY}"`.

**The `/setup` command** is enhanced to interactively configure models,
writing user choices to `~/.config/opencode/models.env` and recording
them in the `.opencode/setup.json` manifest.

**Harness tests** (`tests/Unit/Harness/ModelConfigTest.php`) enforce
invariants: no hard-coded model IDs remain in config; all `model:` fields
use `{env:VAR}` syntax; env var names are consistent between defaults and
config; the `.envrc` and `.opencode/models.default.env` files exist.

**No custom resolution logic** is implemented. OpenCode resolves
`{env:VAR}` references at config-load time. No pre-processor, wrapper
script, or build step is required.

## Consequences

### Positive

- **Decoupled model assignment.** Users change models by editing env vars
  or running `/setup` — no project file edits, no merge conflicts when
  pulling upstream changes.
- **Native opencode feature.** No custom code, no dependency on future
  opencode releases, no config file generation step. The `{env:VAR}`
  mechanism is documented and tested by the opencode team.
- **Backward compatible.** A fresh clone works immediately with direnv
  (`direnv allow` after clone) or manual sourcing of defaults.
- **Consistent test enforcement.** Harness tests prevent drift — if
  someone hard-codes a model ID in `opencode.json`, the test suite fails.
- **Three-tier simplicity.** Three env vars cover 16 agents. Adding a
  fourth model is a deliberate design change, not accidental drift.

### Negative

- **Bootstrapping UX regression (MEDIUM).** Previously, `composer install
  && npm install` was sufficient to launch opencode. Now, users must also
  (a) have direnv installed and run `direnv allow`, or (b) `source
  .opencode/models.default.env` before launching opencode. The README and
  harness docs prominently document this step.
- **Tier rigidity.** Users cannot assign different models to agents
  within the same tier (e.g., `@tdd` vs `@architect` on different
  models). This is an acceptable simplification for the initial release;
  per-agent model configuration can be added later via additional env
  vars or a more granular scheme.
- **`Plan-by:`/`Acked-by:` footer derivation.** The `@tdd` agent prompt
  extracts the model name from the config for commit footer derivation
  ("segment after the last `/`"). With `{env:VAR}` references, the
  resolved model name depends on the runtime environment. The footer
  derivation logic may need updating; this is a known limitation
  documented here for a follow-up issue.

### Neutral

- **Merge semantics unchanged.** The `{env:VAR}` substitution only
  affects the resolved value of the `model` field. Config merge behavior
  (global → project → inline) is unaffected.
- **direnv is optional.** The committed defaults ensure the harness works
  without direnv; manual sourcing is the fallback.

## Alternatives Considered

### Custom variable resolution (`${variable.path}` + pre-processor script)

**Rejected.** OpenCode does not support `${}` syntax. A pre-processor
would introduce a build step, make `opencode.json` a generated file
(breaking the "edit directly" convention), and require custom code to
maintain. The issue's proposal for `~/.opencode/setup.json` targets a
non-existent config path.

### `{file:path}` substitution with committed model files

**Rejected.** While `{file:path}` would work on fresh clone (files are
committed), it requires per-project file edits for customization. Users
could symlink to global files, but this is less ergonomic than env vars
(which can be sourced per-shell, per-project, or globally via direnv).

### Remove explicit `model:` fields, use top-level inheritance only

**Rejected.** This would lose three-tier differentiation. All agents would
inherit the same model, eliminating the distinction between primary,
planner, and utility models that the harness was designed around.

### Keep hard-coded defaults, use `OPENCODE_CONFIG_CONTENT` for overrides

**Rejected.** This preserves backward compatibility but pushes all
customization into a single env var with inline JSON. It's fragile
(quoting issues, no validation), doesn't integrate with `/setup`, and
doesn't address the root goal of decoupling model selection from the
project config.

### Cross-reference

- **ADR-0011 (Plan Agent Complexity Assessment):** This ADR makes the plan
  agent's `model` field configurable (`{env:OPENCODE_MODEL_PLANNER}`),
  but the `variant: high` and `temperature: 0.1` remain literal — the
  design foundation of ADR-0011 (variant/temperature as behavior tuning,
  not model selection) is preserved.
