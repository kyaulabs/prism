---
description: Interactive project configurator. Interviews for app name, domain, repo, Signed-off-by identity, and accent color, then rewrites template defaults (<app>, <domain>, kyau <git@kyaulabs.com>, kyaulabs/template) across the harness. Idempotent — re-runnable to update values. Offers an optional scaffold step (clone an existing template via gh, or init a new subfolder) for spinning up standalone projects.
agent: build
---

Replace template defaults (`<app>`, `<domain>`, `kyau <git@kyaulabs.com>`,
`kyaulabs/template`) across the harness with real project values. Stores the
answers in `.opencode/setup.json` for idempotent re-runs.

## 1. Check for existing manifest

If `.opencode/setup.json` exists, read it to pre-fill the interview with
current values and enter re-run mode (old-value → new-value substitution).
If `setup_version` is absent or `< 2`, treat variant fields as unset —
prompt for them as new values using defaults from `.opencode/setup.json`
models/variants sections (auto-migrated from v1 schema by `migrate-setup.sh`
on direnv entry — see ADR-0029).
If `setup_version` is absent or `< 3`, the scaffold prompt (§2.5) fires.
If absent, enter first-run mode (placeholder → value substitution).
If `setup_version` is `< 4`, run `bash .github/scripts/migrate-setup.sh .opencode/setup.json`
before reading values. The migration is idempotent.

Before §2.5, run `bash .github/scripts/setup-scaffold.sh should-prompt`.
If it exits non-zero (short-circuit), skip §2.5 — the project was already
scaffolded and the recorded `project_folder` still exists. If it exits 0,
proceed with §2.5.

## 2. Interview

Ask one question at a time. Only re-ask if the answer is empty.

1. **App name** — the public webroot directory name (e.g. `myapp`). Replaces
   `<app>` in the harness. Used in `<app>.<domain>` for the full URL.
2. **Domain** — the production domain (e.g. `example.com`). Replaces `<domain>`.
   The full site URL is `<app>.<domain>`.
3. **GitHub org/repo** — replaces `kyaulabs/template` (e.g. `myorg/myapp`).
   Used in `cliff.toml`, `composer.json`, `package.json`, and README.
4. **Signed-off-by name** — committer name for the DCO footer (e.g. `kyau` or
   your name). Replaces `kyau <git@kyaulabs.com>` in Signed-off-by contexts.
   Must not be empty.
5. **Signed-off-by email** — email for the DCO footer. Replaces
   `git@kyaulabs.com` (bare email). Used in Signed-off-by, CODE_OF_CONDUCT,
   and SECURITY. The abuse contact `git+abuse@kyaulabs.com` in
   CODE_OF_CONDUCT.md becomes `abuse@{domain}`.
6. **Accent color** — `sky-blue` or `light-purple`. Toggles the default
   design tokens in `cdn/sass/_tokens.scss`. See the `frontend-design` skill.

When the user selects an accent color, show the palette:

- **sky-blue:** accent `#38bdf8`, soft `#87ceeb`, hover `#0ea5e9`
- **light-purple:** accent `#a78bfa`, soft `#c4b5fd`, hover `#8b5cf6`

## 2.5. Scaffold (clone / new / skip)

If §1's short-circuit check returns "skip," go directly to §3.

Otherwise, present the scaffold prompt:

> The `/setup` command can scaffold a standalone project subfolder with a
> portable quality surface (git hooks, CI, linters, shell-test harness).
> Choose a mode:
> 1. **skip** — configure the template in place (no scaffold)
> 2. **clone** an existing quality-surface template
> 3. **new** — init a fresh subfolder from the template's quality surface

Prompt for the mode. Default to **skip** if the user presses Enter.

**clone** — ask for the owner/repo of an existing quality-surface template
(e.g. `kyaulabs/template`), then a target directory name. Run:

```bash
bash .github/scripts/setup-scaffold.sh clone <owner/repo> <target>
```

The clone subcommand requires `gh` (GitHub CLI) on `PATH` and authenticated
(`gh auth login`). Missing or unauthenticated `gh` causes an exit-2 error.

**new** — ask for a target directory name (a subfolder). Run:

```bash
bash .github/scripts/setup-scaffold.sh new <target>
```

This creates the directory, runs `git init`, and copies every quality-surface
file from the manifest into the target directory.

Both `clone` and `new` enforce a no-overwrite guard (AC-2): if the target
already exists, the script halts with a clear error. The user must pick a
different name or remove the existing target first.

Record the answers as `scaffold_mode` (`skip`, `clone`, or `new`) and
`project_folder` (the target path, or `null` for `skip`) for the manifest
(§8).

## 3. Model and variant configuration

Read the current defaults from `.opencode/setup.json`:

```bash
OPENCODE_MODEL_PRIMARY=$(jq -r '.models.primary' .opencode/setup.json)
OPENCODE_MODEL_PLANNER=$(jq -r '.models.planner' .opencode/setup.json)
OPENCODE_MODEL_DESIGN=$(jq -r '.models.design // .models.planner' .opencode/setup.json)
OPENCODE_MODEL_JUDGE=$(jq -r '.models.judge' .opencode/setup.json)
OPENCODE_MODEL_UTILITY=$(jq -r '.models.utility' .opencode/setup.json)
OPENCODE_VARIANT_PRIMARY=$(jq -r '.variants.primary' .opencode/setup.json)
OPENCODE_VARIANT_PLANNER=$(jq -r '.variants.planner' .opencode/setup.json)
OPENCODE_VARIANT_DESIGN=$(jq -r '.variants.design // .variants.planner' .opencode/setup.json)
OPENCODE_VARIANT_JUDGE=$(jq -r '.variants.judge' .opencode/setup.json)
OPENCODE_VARIANT_UTILITY=$(jq -r '.variants.utility' .opencode/setup.json)
echo "Primary  model:   $OPENCODE_MODEL_PRIMARY    variant: $OPENCODE_VARIANT_PRIMARY"
echo "Planner  model:   $OPENCODE_MODEL_PLANNER    variant: $OPENCODE_VARIANT_PLANNER"
echo "Design   model:   $OPENCODE_MODEL_DESIGN     variant: $OPENCODE_VARIANT_DESIGN"
echo "Judge    model:   $OPENCODE_MODEL_JUDGE      variant: $OPENCODE_VARIANT_JUDGE"
echo "Utility  model:   $OPENCODE_MODEL_UTILITY    variant: $OPENCODE_VARIANT_UTILITY"
```

Present a summary table:

```text
Model & Variant Configuration
┌──────────┬─────────────────────────────────┬─────────┬────────────────────────────────────────────────────┐
│ Tier     │ Default Model                   │ Variant │ Description                                        │
├──────────┼─────────────────────────────────┼─────────┼────────────────────────────────────────────────────┤
│ Primary  │ deepseek/deepseek-v4-pro        │ max     │ Code generation, TDD, arch, CR, debug, resolve      │
│ Planner  │ openrouter/z-ai/glm-5.2         │ high    │ Planning (plan agent only)                          │
│ Design   │ openrouter/z-ai/glm-5.2         │ high    │ Brainstorming/design workflow (design agent only)   │
│ Judge    │ openrouter/z-ai/glm-5.2         │ medium  │ Read-only evaluation (judge agent only)             │
│ Utility  │ deepseek/deepseek-v4-flash      │ medium  │ Compaction, titles, docs, scanning                  │
└──────────┴─────────────────────────────────┴─────────┴────────────────────────────────────────────────────┘
```

Prompt for each tier one at a time. Press Enter at any prompt to accept
the default shown in brackets.

**Model prompts (5 tiers):**

1. **Primary** model [deepseek/deepseek-v4-pro] — the main coding engine.
   Used by: build, tdd, architect, code-review, debug, resolve-merge-conflicts,
   test-audit, general, explore.
2. **Planner** model [openrouter/z-ai/glm-5.2] — reasoning/planning
   engine. Used by: plan.
3. **Design** model [openrouter/z-ai/glm-5.2] — brainstorming/design
   workflow engine. Used by: design.
4. **Judge** model [openrouter/z-ai/glm-5.2] — evaluation engine for
   read-only assessment. Used by: judge.
5. **Utility** model [deepseek/deepseek-v4-flash] — cost-efficient engine
   for routine tasks. Used by: compaction, title, summary, docs-writer, semgrep.

**Variant prompts (5 tiers):**

5. **Primary** variant [max] — variant for PRIMARY-tier agents.
   Common values: max, high, medium, low.
   (see .opencode/docs/model-configuration.md to confirm supported variants for your model)
6. **Planner** variant [high] — variant for plan agent.
   Common values: high, max, medium, low.
   (see .opencode/docs/model-configuration.md to confirm supported variants for your model)
7. **Design** variant [high] — variant for design agent.
   Common values: high, max, medium, low.
   (see .opencode/docs/model-configuration.md to confirm supported variants for your model)
8. **Judge** variant [medium] — variant for judge agent.
   Common values: medium, high, max, low.
   (see .opencode/docs/model-configuration.md to confirm supported variants for your model)
9. **Utility** variant [medium] — variant for UTILITY-tier agents.
   Common values: medium, high, max, low.
   (see .opencode/docs/model-configuration.md to confirm supported variants for your model)

If the user pressed Enter for all ten prompts (accepted all defaults), skip
the write step — the committed `.opencode/setup.json` already provides
defaults. Instruct the user:

> Using default models and variants from `.opencode/setup.json`.
> If NOT using direnv, add this to your shell profile:
>   source .envrc

If the user changed any model or variant, write `~/.config/opencode/setup.json`:

```bash
mkdir -p ~/.config/opencode
jq -n \
  --arg p "$OPENCODE_MODEL_PRIMARY" --arg pl "$OPENCODE_MODEL_PLANNER" \
  --arg d "$OPENCODE_MODEL_DESIGN" --arg j "$OPENCODE_MODEL_JUDGE" \
  --arg u "$OPENCODE_MODEL_UTILITY" \
  --arg pv "$OPENCODE_VARIANT_PRIMARY" --arg plv "$OPENCODE_VARIANT_PLANNER" \
  --arg dv "$OPENCODE_VARIANT_DESIGN" --arg jv "$OPENCODE_VARIANT_JUDGE" \
  --arg uv "$OPENCODE_VARIANT_UTILITY" \
  --arg name "$SIGNED_OFF_BY_NAME" --arg email "$SIGNED_OFF_BY_EMAIL" \
  '{
    signed_off_by_name: $name,
    signed_off_by_email: $email,
    models: {primary: $p, planner: $pl, design: $d, judge: $j, utility: $u},
    variants: {primary: $pv, planner: $plv, design: $dv, judge: $jv, utility: $uv}
  }' > ~/.config/opencode/setup.json
```

After writing, instruct:

> Model and variant preferences written to `~/.config/opencode/setup.json`.
> If using direnv, run `direnv allow` to reload.
> If NOT using direnv, add this to your shell profile:
>   `source .envrc`

Record the model and variant choices (whether defaults or user-specified)
for the manifest (section 8).

## 4. Build the token map

Construct the find/replace pairs in order. Identity tokens
(`kyau <git@kyaulabs.com>` and `git@kyaulabs.com`) are resolved at runtime
by `resolve-identity.sh` and are no longer substituted by this script.

| # | Find (literal default) | Replace with |
|---|------------------------|-------------|
| 1 | `git+abuse@kyaulabs.com` | `abuse@{domain}` |
| 2 | `kyaulabs/template` | `{org}/{repo}` |
| 3 | `<app>` | `{app}` |
| 4 | `<domain>` | `{domain}` |
| 5 | `<username>` | `{name}` (auto-detected from git config)

In **re-run mode**, use the values from the existing manifest as the find
strings instead of the literal defaults. For example, if a prior run set app
to `myapp`, the find string for token #3 is `myapp`, not `<app>`.

**Validate manifest values before use (issue #181, AC-3).** Manifest values
flow from the committed `.opencode/setup.json` and are spliced into sed
programs, so they are untrusted. Before constructing any find/replace pair in
re-run mode, validate the four manifest values with the same rules the
substitution script enforces:

```bash
bash .github/scripts/setup-substitute.sh --validate-only "{app}" "{domain}" "{org}" "{repo}"
```

If this exits non-zero, STOP: a manifest value contains a forbidden character
(`|`, `&`, `\`, quotes, backtick, or whitespace). Do not proceed with the
sweep; report the rejected value to the user and ask how to correct the
manifest.

## 5. Verify

Print the interview answers as a table:

```text
Token                        Current               New
---------------------------  ---------------------  ---------------------
<app>                        <app>                  myapp
<domain>                     <domain>               example.com
kyaulabs/template            kyaulabs/template      myorg/myapp
kyau <git@kyaulabs.com>      kyau <git@kyaulabs...> kyau <kyau@example.com>
git@kyaulabs.com             git@kyaulabs.com       kyau@example.com
git+abuse@kyaulabs.com       git+abuse@kyaulabs.com abuse@example.com
<username>                   <username>             kyau
accent                       sky-blue (active)      light-purple

Files to sweep (20 files; aurora/ excluded):
  AGENTS.md, CONTRIBUTING.md, .env.example, README.md, CODE_OF_CONDUCT.md,
  SECURITY.md, cliff.toml, composer.json, package.json,
  .opencode/commands/deploy.md, .opencode/commands/prime.md,
  .opencode/agents/debug.md, .opencode/agents/tdd.md,
  .opencode/skills/aurora-page/SKILL.md, .opencode/skills/database/SKILL.md,
  .opencode/skills/conventional-commits/SKILL.md,
  .opencode/skills/writing-plans/SKILL.md,
  .opencode/skills/finishing-a-development-branch/SKILL.md,
  .opencode/docs/build-pipeline.md, cdn/sass/_tokens.scss
```

Ask: "Proceed with rewrites? (y/n)"

## 6. Apply

For each file in the sweep list:

1. Skip if the file does not exist (some may not apply to every project).
2. Run the substitution script.

   When `scaffold_mode` is `clone` or `new` (i.e. a `project_folder` was
   recorded this run), pass `--target-dir "$project_folder"` so substitution
   lands in the scaffolded subfolder:

   ```bash
   bash .github/scripts/setup-substitute.sh --target-dir "$project_folder" <file> "{app}" "{domain}" "{org}" "{repo}"
   ```

   When `scaffold_mode` is `skip` (or absent — legacy first-run), omit
   `--target-dir` entirely (existing in-place behavior):

   ```bash
   bash .github/scripts/setup-substitute.sh <file> "{app}" "{domain}" "{org}" "{repo}"
   ```

   Replace `{app}`, `{domain}`, `{org}`, `{repo}` with the actual interview
   values. Identity tokens (`{name}`, `{email}`) are resolved at runtime by
   `resolve-identity.sh` and are no longer passed to this script. The script
   applies all 5 token substitutions (see token map above). It exits non-zero
   if the file does not exist — skip missing files before calling it. The
   script is the single source of truth for substitution logic.

3. For `cdn/sass/_tokens.scss` only: apply the accent toggle (see below).

**Accent toggle** (`cdn/sass/_tokens.scss`):

The file has two accent palettes as comment-toggle lines. For each accent
choice, ensure the correct lines are uncommented and the other is commented.

For **sky-blue:**
- `--accent: #38bdf8;` — uncommented (ensure no leading `// `)
- `--accent-soft: #87ceeb;` — uncommented
- `// --accent: #a78bfa;` — commented
- `// --accent-soft: #c4b5fd;` — commented
- `--accent-hover: #0ea5e9;` — uncommented, value `#0ea5e9`

For **light-purple:**
- `// --accent: #38bdf8;` — commented
- `// --accent-soft: #87ceeb;` — commented
- `--accent: #a78bfa;` — uncommented
- `--accent-soft: #c4b5fd;` — uncommented
- `--accent-hover: #8b5cf6;` — uncommented, value `#8b5cf6`

Use the Edit tool for the accent toggle — it is a small targeted change.

## 7. Verify sweep

After the sweep, confirm no old identity strings remain (excluding
LICENSE and NOTICE, which are legal/attribution and must not be swept):

```bash
grep -rnF 'kyau <git@kyaulabs.com>' . \
  --exclude-dir=.git --exclude-dir=aurora --exclude-dir=vendor \
  --exclude-dir=node_modules --exclude-dir=cdn/css \
  --exclude-dir=cdn/javascript \
  --exclude=LICENSE --exclude=NOTICE
```

This must return zero matches. If any matches are found, the sweep was
incomplete — re-run the substitution script on the reported files.

Also verify the abuse contact was replaced:

```bash
grep -rnF 'git+abuse@kyaulabs.com' . \
  --exclude-dir=.git --exclude-dir=aurora --exclude-dir=vendor \
  --exclude-dir=node_modules
```

This must also return zero matches.

## 8. Save manifest

Write `.opencode/setup.json`:

```json
{
  "setup_version": 4,
  "setup_date": "<ISO 8601 timestamp>",
  "configured": true,
  "app": "<app>",
  "domain": "<domain>",
  "repo": "<org>/<repo>",
  "signed_off_by_name": "<name>",
  "signed_off_by_email": "<email>",
  "accent": "<sky-blue | light-purple>",
  "scaffold_mode": "<skip | clone | new>",
  "project_folder": "<path-or-null>",
  "models": {
    "primary": "<primary model ID>",
    "planner": "<planner model ID>",
    "design": "<design model ID>",
    "judge": "<judge model ID>",
    "utility": "<utility model ID>"
  },
  "variants": {
    "primary": "<primary variant>",
    "planner": "<planner variant>",
    "design": "<design variant>",
    "judge": "<judge variant>",
    "utility": "<utility variant>"
  },
  "experimental": {
    "lsp_tool": true,
    "scout": true,
    "background_subagents": false
  },
  "env": {
    "deepseek_api_key": "",
    "searxng_url": ""
  }
}
```

## 9. Report

```text
File                                    Replacements
--------------------------------------  ------------
AGENTS.md                               8
CONTRIBUTING.md                         2
.env.example                            2
README.md                               12
CODE_OF_CONDUCT.md                      1
SECURITY.md                             1
cliff.toml                              2
composer.json                           1
package.json                            1
.opencode/commands/deploy.md            8
.opencode/commands/prime.md             2
.opencode/agents/debug.md               6
.opencode/agents/tdd.md                 1
.opencode/skills/aurora-page/SKILL.md   4
.opencode/skills/database/SKILL.md      3
.opencode/skills/conventional-commits/SKILL.md  4
.opencode/skills/writing-plans/SKILL.md  1
.opencode/skills/finishing-a-development-branch/SKILL.md  1
.opencode/docs/build-pipeline.md        1
cdn/sass/_tokens.scss                   accent: light-purple
--------------------------------------  ------------
TOTAL                                   61 replacements across 20 files
```

Remind the user:

- Review changes with `git diff`.
- Run `direnv allow` if using direnv (or `source .envrc`
  for manual sourcing).
- Run `/prime` if `CONTEXT.md` needs domain content (glossary, entities).
- The aurora/ submodule was NOT touched — it maintains its own copy of
  harness files.
- Re-run `/setup` to change values; the manifest enables idempotent updates.
- Optional integrations: enable MCP web-search servers (deepseek-websearch, mcp-searxng) by uncommenting their blocks in `opencode.jsonc`; the same `DEEPSEEK_API_KEY` also powers Graphify's `--backend deepseek`. Set keys in `~/.config/opencode/setup.json` (`env` section). See `.opencode/docs/mcp.md`.

## Rules

- Never touch the `aurora/` directory — it is a git submodule with its own
  copies of AGENTS.md, CODE_OF_CONDUCT.md, SECURITY.md.
- Never touch `.semgrep/kyaulabs.yml` or semgrep rule names (`kyaulabs-*`) —
  these are rule identifiers, not placeholders.
- Never touch `kyaulabs/aarch`, `kyaulabs/aurora`, `kyaulabs-bot` — these are
  real external resource references.
- LICENSE and NOTICE must NOT be swept — they are legal/attribution files.
- Identity tokens (`kyau <git@kyaulabs.com>`, `git@kyaulabs.com`) are resolved
  at runtime by `resolve-identity.sh` — `setup-substitute.sh` no longer
  handles them.
- Skip missing files silently (the script exits non-zero on missing files;
  check existence before calling it).
- After successful rewrites, print the report and run the verification grep
  (section 6). Do not commit or push anything.
