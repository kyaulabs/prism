---
description: Interactive project configurator. Interviews for app name, domain, repo, Signed-off-by identity, and accent color, then rewrites template defaults (<app>, <domain>, kyau <git@kyaulabs.com>, kyaulabs/template) across the harness. Idempotent — re-runnable to update values. Offers an optional scaffold step (clone an existing template via gh, or init a new subfolder) for spinning up standalone projects.
agent: build
---

Replace template defaults (`<app>`, `<domain>`, `kyau <git@kyaulabs.com>`,
`kyaulabs/template`) across the harness with real project values. Patches the
answers into the dual-path prism manifests (`prism.jsonc` project tier +
`~/.config/opencode/prism.jsonc` user tier, ADR-0043) for idempotent re-runs.

## 1. Migrate, then read the existing manifest

**Auto-migrate on entry (ADR-0043).** Before reading any value, run the
idempotent dual-path migration so both manifests are at schema v5:

```bash
bash .github/scripts/migrate-setup.sh
```

If this exits non-zero, STOP — a migration conflict must be resolved before
/setup proceeds. Never read or write the legacy `.opencode/setup.json` or
`~/.config/opencode/setup.json` directly: the migration renames both to their
`prism.jsonc` successors. The legacy files are deprecated and removed by the
migration once their verified v5 replacement is in place.

After migration, resolve the manifest paths and read current values through
the prism manifest CLI (`prism_manifest.php`), never the legacy files and
never raw file parsing:

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
PROJECT="$REPO_ROOT/prism.jsonc"
USER="$HOME/.config/opencode/prism.jsonc"
USER_ARG="-"
[ -f "$USER" ] && USER_ARG="$USER"
```

Read the current project defaults to pre-fill the interview (re-run mode —
old-value → new-value substitution):

```bash
APP=$(php .github/scripts/prism_manifest.php get "$PROJECT" "$USER_ARG" app)
DOMAIN=$(php .github/scripts/prism_manifest.php get "$PROJECT" "$USER_ARG" domain)
REPO=$(php .github/scripts/prism_manifest.php get "$PROJECT" "$USER_ARG" repo)
CONFIGURED=$(php .github/scripts/prism_manifest.php get "$PROJECT" "$USER_ARG" configured)
```

If `CONFIGURED` is empty or `false`, enter first-run mode (placeholder →
value substitution). Otherwise enter re-run mode.

Before §2.5, run `bash .github/scripts/setup-scaffold.sh should-prompt "$PROJECT"`.
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

Read the current defaults from the resolved prism manifests through the CLI
(never read the manifests with a JSON tool directly):

```bash
OPENCODE_MODEL_PRIMARY=$(php .github/scripts/prism_manifest.php get "$PROJECT" "$USER_ARG" models.primary)
OPENCODE_MODEL_PLANNER=$(php .github/scripts/prism_manifest.php get "$PROJECT" "$USER_ARG" models.planner)
OPENCODE_MODEL_DESIGN=$(php .github/scripts/prism_manifest.php get "$PROJECT" "$USER_ARG" models.design)
OPENCODE_MODEL_JUDGE=$(php .github/scripts/prism_manifest.php get "$PROJECT" "$USER_ARG" models.judge)
OPENCODE_MODEL_UTILITY=$(php .github/scripts/prism_manifest.php get "$PROJECT" "$USER_ARG" models.utility)
OPENCODE_VARIANT_PRIMARY=$(php .github/scripts/prism_manifest.php get "$PROJECT" "$USER_ARG" variants.primary)
OPENCODE_VARIANT_PLANNER=$(php .github/scripts/prism_manifest.php get "$PROJECT" "$USER_ARG" variants.planner)
OPENCODE_VARIANT_DESIGN=$(php .github/scripts/prism_manifest.php get "$PROJECT" "$USER_ARG" variants.design)
OPENCODE_VARIANT_JUDGE=$(php .github/scripts/prism_manifest.php get "$PROJECT" "$USER_ARG" variants.judge)
OPENCODE_VARIANT_UTILITY=$(php .github/scripts/prism_manifest.php get "$PROJECT" "$USER_ARG" variants.utility)
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
│ Primary  │ zai-coding-plan/glm-5.2         │ max     │ Code generation, TDD, debug, resolve, general      │
│ Planner  │ openai/gpt-5.6-sol              │ xhigh   │ Planning, decomposition, architect, consult        │
│ Design   │ openai/gpt-5.6-sol              │ xhigh   │ Brainstorming, design, spec workflow               │
│ Judge    │ deepseek/deepseek-v4-pro        │ medium  │ Cross-model review, audit, eval, explore           │
│ Utility  │ deepseek/deepseek-v4-flash      │ medium  │ Compaction, titles, summaries, docs, scan          │
└──────────┴─────────────────────────────────┴─────────┴────────────────────────────────────────────────────┘
```

Prompt for each tier one at a time. Press Enter at any prompt to accept
the default shown in brackets.

**Model prompts (5 tiers):**

1. **Primary** model [zai-coding-plan/glm-5.2] — the main coding engine.
   Used by: build, tdd, debug, resolve-merge-conflicts, general.
2. **Planner** model [openai/gpt-5.6-sol] — reasoning/planning
   engine (ChatGPT-Plus OAuth). Used by: plan, from-issue, architect, consult.
3. **Design** model [openai/gpt-5.6-sol] — brainstorming/design
   workflow engine (ChatGPT-Plus OAuth). Used by: design.
4. **Judge** model [deepseek/deepseek-v4-pro] — evaluation engine for
   read-only assessment. Used by: code-review, standards-review, spec-review, test-audit, judge, explore.
5. **Utility** model [deepseek/deepseek-v4-flash] — cost-efficient engine
   for routine tasks. Used by: compaction, title, summary, docs-writer, semgrep.

**Variant prompts (5 tiers):**

5. **Primary** variant [max] — variant for PRIMARY-tier agents.
   Common values: max, high, medium, low.
   (see .opencode/docs/model-configuration.md to confirm supported variants for your model)
6. **Planner** variant [xhigh] — variant for PLANNER agents (OpenAI/GPT-5.6 Sol).
   Common values: xhigh, high, medium, low.
   (see .opencode/docs/model-configuration.md to confirm supported variants for your model)
7. **Design** variant [xhigh] — variant for design agent (OpenAI/GPT-5.6 Sol).
   Common values: xhigh, high, medium, low.
   (see .opencode/docs/model-configuration.md to confirm supported variants for your model)
8. **Judge** variant [medium] — variant for judge agent.
   Common values: medium, high, max, low.
   (see .opencode/docs/model-configuration.md to confirm supported variants for your model)
9. **Utility** variant [medium] — variant for UTILITY-tier agents.
   Common values: medium, high, max, low.
   (see .opencode/docs/model-configuration.md to confirm supported variants for your model)

If the user pressed Enter for all ten prompts (accepted all defaults), skip
the write step — the committed `prism.jsonc` already provides defaults.
Instruct the user:

> Using default models and variants from `prism.jsonc`.
> If NOT using direnv, add this to your shell profile:
>   source .envrc

If the user changed any model or variant, patch the user manifest
(`~/.config/opencode/prism.jsonc`) in place via the writer at mode 0600:

```bash
SIGNED_OFF_BY_NAME="$SIGNED_OFF_BY_NAME" \
SIGNED_OFF_BY_EMAIL="$SIGNED_OFF_BY_EMAIL" \
OPENCODE_MODEL_PRIMARY="$OPENCODE_MODEL_PRIMARY" \
OPENCODE_MODEL_PLANNER="$OPENCODE_MODEL_PLANNER" \
OPENCODE_MODEL_DESIGN="$OPENCODE_MODEL_DESIGN" \
OPENCODE_MODEL_JUDGE="$OPENCODE_MODEL_JUDGE" \
OPENCODE_MODEL_UTILITY="$OPENCODE_MODEL_UTILITY" \
OPENCODE_VARIANT_PRIMARY="$OPENCODE_VARIANT_PRIMARY" \
OPENCODE_VARIANT_PLANNER="$OPENCODE_VARIANT_PLANNER" \
OPENCODE_VARIANT_DESIGN="$OPENCODE_VARIANT_DESIGN" \
OPENCODE_VARIANT_JUDGE="$OPENCODE_VARIANT_JUDGE" \
OPENCODE_VARIANT_UTILITY="$OPENCODE_VARIANT_UTILITY" \
bash .github/scripts/setup-write-user-config.sh
```

The script patches the user-scoped fields (identity, models, variants) into
`~/.config/opencode/prism.jsonc` through the prism manifest CLI `patch`
command (comment-preserving span patching), preserving unrelated keys such as
`env.deepseek_api_key` and `env.searxng_url` (#187). It writes atomically at
mode 0600, creates the parent directory, and refuses to clobber on a missing
value or a corrupt existing file.

After writing, instruct:

> Model and variant preferences written to `~/.config/opencode/prism.jsonc`.
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
flow from the committed `prism.jsonc` and are spliced into sed
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

## 8. Patch manifests (in place, comment-preserving)

**Warn before writing.** Before patching anything, show the user the exact
target paths and state what will change:

> About to patch owned fields in place:
>   project manifest: `prism.jsonc`
>   user manifest:    `~/.config/opencode/prism.jsonc`
> Only the /setup-owned fields (identity, app/domain/repo, accent, models,
> variants, scaffold bookkeeping) change. Comments and unknown fields are
> preserved byte-for-byte (ADR-0043 span patching). Secrets are never touched.

**Patch, do not regenerate.** Never write a wholesale JSON object over either
manifest. Both writers patch owned fields in place through the prism manifest
CLI `patch` command, which delegates to `PrismJsoncDocument::withValues()` so
only the specified value spans change.

Export the interview values into the env vars the writers read, then invoke
the writers. The bookkeeping fields (`scaffold_mode`, `project_folder`,
`setup_version`) are PROJECT-ONLY — never apply a user-overlay value for them.

### Scaffold contract (parent vs target)

The project manifest is patched in **parent** or **target** mode depending on
whether this run configured the template in place or scaffolded a subfolder:

- **skip mode** — patch the root `prism.jsonc` (`parent`) with every interview
  value, `scaffold_mode: "skip"`, and `project_folder: null`.
- **clone / new mode** — the root `prism.jsonc` records the actual decision
  (`parent`: the chosen `scaffold_mode` + `project_folder`). After the
  quality-surface copy lands, patch the TARGET's `prism.jsonc` (`target`) with
  the interview values plus `scaffold_mode: "skip"` and `project_folder: null`.
  The target never embeds its parent's filesystem path.

The user manifest is machine-global (`~/.config/opencode/prism.jsonc`); it is
never copied into a scaffold target.

### Project manifest — `setup-write-project-config.sh`

Patch the project manifest (mode 0644) with the interview values and the
mode-appropriate bookkeeping:

```bash
SETUP_APP="$APP" SETUP_DOMAIN="$DOMAIN" SETUP_REPO="$REPO" \
SETUP_ACCENT="$accent" \
SIGNED_OFF_BY_NAME="$name" SIGNED_OFF_BY_EMAIL="$email" \
OPENCODE_MODEL_PRIMARY="$OPENCODE_MODEL_PRIMARY" \
OPENCODE_MODEL_PLANNER="$OPENCODE_MODEL_PLANNER" \
OPENCODE_MODEL_DESIGN="$OPENCODE_MODEL_DESIGN" \
OPENCODE_MODEL_JUDGE="$OPENCODE_MODEL_JUDGE" \
OPENCODE_MODEL_UTILITY="$OPENCODE_MODEL_UTILITY" \
OPENCODE_VARIANT_PRIMARY="$OPENCODE_VARIANT_PRIMARY" \
OPENCODE_VARIANT_PLANNER="$OPENCODE_VARIANT_PLANNER" \
OPENCODE_VARIANT_DESIGN="$OPENCODE_VARIANT_DESIGN" \
OPENCODE_VARIANT_JUDGE="$OPENCODE_VARIANT_JUDGE" \
OPENCODE_VARIANT_UTILITY="$OPENCODE_VARIANT_UTILITY" \
SETUP_SCAFFOLD_MODE="$scaffold_mode" \
SETUP_PROJECT_FOLDER="$project_folder" \
bash .github/scripts/setup-write-project-config.sh "$PROJECT" parent
```

For a scaffolded target, run the same writer in `target` mode against the
target's `prism.jsonc`. Reuse the same interview env vars as the `parent`
call above, but omit `SETUP_SCAFFOLD_MODE`/`SETUP_PROJECT_FOLDER` — target
mode always writes `skip`/`null`:

```bash
# (same SETUP_*/SIGNED_*/OPENCODE_* interview env vars as the parent call)
bash .github/scripts/setup-write-project-config.sh "$REPO_ROOT/$project_folder/prism.jsonc" target
```

The user manifest was already patched in §3 (if any model/variant changed)
via `setup-write-user-config.sh` at mode 0600.

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
- Optional integrations: enable MCP web-search servers (deepseek-websearch, mcp-searxng) by uncommenting their blocks in `opencode.jsonc`. Set keys in `~/.config/opencode/prism.jsonc` (`env` section). See `.opencode/docs/mcp.md`.

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
