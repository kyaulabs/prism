---
name: writing-skills
description: Use when authoring Prism skills, prompts or bundled references. Covers precise metadata, portable paths, provenance and native discovery.
derived-from: anthropics/skills (MIT, © Anthropic); glebis/claude-skills (MIT, © Gleb)
---

# Authoring resources

Give a skill information that improves a specific task, not another copy of Core
policy. Keep language/framework/tooling conventions in modules and general
techniques in Core. Native Pi owns resource discovery, sessions and host features;
do not add routing, catalogue or orchestration layers.

Start `SKILL.md` at byte zero with YAML `---`, a directory-matching `name` and a
trigger-oriented `description` (maximum 1024 characters). Names use 1–64 lowercase
letters, digits and hyphens, without leading/trailing/consecutive hyphens.
Preserve `derived-from` credits and applicable notices. Use only supported
frontmatter; read `pi-docs` before changing host integrations.

Prompts are thin Markdown entry points named by slash command. Give them accurate
`description` and `argument-hint` metadata. Use native `$ARGUMENTS`, positional
arguments or defaults; expansion is not shell escaping. Prompt expansion does
not rebase repository-relative paths, so let the relevant skill resolve bundled
detail from its discovered directory.

Use relative Markdown links from the skill directory for shipped references,
scripts and assets. Label monorepo-only contribution paths explicitly. Do not
assume a consumer is running from the Prism checkout. Keep optional detail in
references and read it only when relevant.

Choose structure to fit the task; no mandatory section count or empty Gotchas.
Verify metadata, package manifests, packed discovery, path resolution and callers.
For Prism maintenance, resources live under `packages/<package>/skills`,
`prompts` and `docs`; run `bash packages/prism-core/scripts/validate-harness.sh`
and relevant package/host tests. These are contribution paths, not consumer
working-directory assumptions.
