---
description: Interactive project configurator. Interviews for app name, domain, repo, Signed-off-by identity, and accent color, then rewrites <app>/<domain>/[EMAIL] placeholders across the harness. Idempotent — re-runnable to update values.
agent: build
---

Replace template placeholders (`<app>`, `<domain>`, `[EMAIL]`, `kyaulabs/template`,
`kyau <[EMAIL]>`) across the harness with real project values. Stores the
answers in `.opencode/setup.json` for idempotent re-runs.

## 1. Check for existing manifest

If `.opencode/setup.json` exists, read it to pre-fill the interview with
current values and enter re-run mode (old-value → new-value substitution).
If absent, enter first-run mode (placeholder → value substitution).

## 2. Interview

Ask one question at a time. Only re-ask if the answer is empty.

1. **App name** — the public webroot directory name (e.g. `myapp`). Replaces
   `<app>` in the harness. Used in `<app>.<domain>` for the full URL.
2. **Domain** — the production domain (e.g. `example.com`). Replaces `<domain>`.
   The full site URL is `<app>.<domain>`.
3. **GitHub org/repo** — replaces `kyaulabs/template` (e.g. `myorg/myapp`).
   Used in `cliff.toml`, `composer.json`, `package.json`, and README.
4. **Signed-off-by name** — committer name for the DCO footer (e.g. `kyau` or
   your name). Replaces `kyau` in Signed-off-by contexts. Must not be empty.
5. **Signed-off-by email** — email for the DCO footer. Replaces `[EMAIL]`.
   Used in Signed-off-by, CODE_OF_CONDUCT, and SECURITY.
6. **Accent color** — `sky-blue` or `light-purple`. Toggles the default
   design tokens in `cdn/sass/_tokens.scss`. See the `frontend-design` skill.

When the user selects an accent color, show the palette:

- **sky-blue:** accent `#38bdf8`, soft `#87ceeb`, hover `#0ea5e9`
- **light-purple:** accent `#a78bfa`, soft `#c4b5fd`, hover `#8b5cf6`

## 3. Build the token map

Construct the find/replace pairs in order (longest match first to avoid
substring collisions):

| # | Find (exact string) | Replace with |
|---|---|---|
| 1 | `kyau <[EMAIL]>` | `{name} <{email}>` |
| 2 | `kyaulabs/template` | `{org}/{repo}` |
| 3 | `<app>` | `{app}` |
| 4 | `<domain>` | `{domain}` |
| 5 | `<username>` | `{name}` |
| 6 | `[EMAIL]` | `{email}` |

Token #1 must precede #6 — if `[EMAIL]` fires first, `kyau <[EMAIL]>` won't
match.

In **re-run mode**, use the values from the existing manifest as the find
strings instead of the literal placeholder tokens. For example, if a prior run
set app to `myapp`, the find string for token #3 is `myapp`, not `<app>`.

## 4. Verify

Print the interview answers as a table:

```text
Token                        Current               New
---------------------------  ---------------------  ---------------------
<app>                        <app>                  myapp
<domain>                     <domain>               example.com
kyaulabs/template            kyaulabs/template      myorg/myapp
kyau <[EMAIL]>               kyau <[EMAIL]>         kyau <kyau@example.com>
[EMAIL]                      [EMAIL]                kyau@example.com
<username>                   <username>             kyau
accent                       sky-blue (active)      light-purple

Files to sweep (19 files; aurora/ excluded):
  AGENTS.md, .env.example, README.md, CODE_OF_CONDUCT.md, SECURITY.md,
  cliff.toml, composer.json, package.json,
  .opencode/commands/deploy.md, .opencode/commands/prime.md,
  .opencode/agents/debug.md, .opencode/agents/tdd.md,
  .opencode/skills/aurora-page/SKILL.md, .opencode/skills/database/SKILL.md,
  .opencode/skills/conventional-commits/SKILL.md,
  .opencode/skills/writing-plans/SKILL.md,
  .opencode/skills/finishing-a-development-branch/SKILL.md,
  .opencode/docs/build-pipeline.md, cdn/sass/_tokens.scss
```

Ask: "Proceed with rewrites? (y/n)"

## 5. Apply

For each file in the sweep list:

1. Skip if the file does not exist (some may not apply to every project).
2. Read the file.
3. Apply token map substitutions in order (tokens #1 through #6 — always apply
   #1 before #6 to preserve the `kyau <[EMAIL]>` composite match).
4. For `cdn/sass/_tokens.scss` only: apply the accent toggle (see below).
5. Write the file back.
6. Count per-file replacements.

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
For the token substitutions, use Edit with `replaceAll` for each token or
`sed -i` when Edit would require many calls.

**Use `sed` for bulk token substitution:**

```bash
# Token #1 (longest composite first)
sed -i "s|kyau <[EMAIL]>|{name} <{email}>|g" <file>
# Token #2
sed -i "s|kyaulabs/template|{org}/{repo}|g" <file>
# Token #3
sed -i 's|<app>|{app}|g' <file>
# Token #4
sed -i 's|<domain>|{domain}|g' <file>
# Token #5
sed -i 's|<username>|{name}|g' <file>
# Token #6 (after token #1 has already consumed the composite matches)
sed -i 's|\[EMAIL\]|{email}|g' <file>
```

Replace `{name}`, `{email}`, `{app}`, `{domain}`, `{org}`, `{repo}` with the
actual interview values.

## 6. Save manifest

Write `.opencode/setup.json`:

```json
{
  "setup_version": 1,
  "setup_date": "<ISO 8601 timestamp>",
  "app": "<app>",
  "domain": "<domain>",
  "repo": "<org>/<repo>",
  "signed_off_by_name": "<name>",
  "signed_off_by_email": "<email>",
  "accent": "<sky-blue | light-purple>"
}
```

## 7. Report

```text
File                                    Replacements
--------------------------------------  ------------
AGENTS.md                               8
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
TOTAL                                   59 replacements across 19 files
```

Remind the user:

- Review changes with `git diff`.
- Run `/prime` if `CONTEXT.md` needs domain content (glossary, entities).
- The aurora/ submodule was NOT touched — it maintains its own copy of
  harness files.
- Re-run `/setup` to change values; the manifest enables idempotent updates.

## Rules

- Never touch the `aurora/` directory — it is a git submodule with its own
  copies of AGENTS.md, CODE_OF_CONDUCT.md, SECURITY.md.
- Never touch `.semgrep/kyaulabs.yml` or semgrep rule names (`kyaulabs-*`) —
  these are rule identifiers, not placeholders.
- Never touch `kyaulabs/aarch`, `kyaulabs/aurora`, `kyaulabs-bot` — these are
  real external resource references.
- Apply token #1 (`kyau <[EMAIL]>`) before token #6 (`[EMAIL]`) — the
  composite match must fire before the substring.
- Skip missing files silently — not all projects will have every file in the
  sweep list.
- After successful rewrites, print the report. Do not commit or push anything.
- If a file contains no matches for any token, skip it (do not write it back
  unchanged — the Edit/sed approach inherently leaves it alone).
