# 0032. Optional MCP Server Onboarding Pattern

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-20

## Status

Superseded

The JSONC/manifest replacement was delivered by ADR-0043. The
commented-block enablement mechanism was superseded by ADR-0045's
manifest-driven Boolean toggle preferences.

Amends ADR-0029 (adds the `env` key to the `setup.json` schema; same
`jq` + `.envrc` delivery chain and user-override-wins precedence). Follows
ADR-0030's jq-fallback-over-schema-bump precedent for additive
backward-compatible keys.

## Context

Two optional MCP servers (deepseek-websearch, mcp-searxng) provide web-search
tooling to agents. We need an opt-in onboarding pattern that (a) keeps the
servers disabled by default, (b) keeps API keys and secrets out of committed
files, and (c) reuses the ADR-0029 unified-config delivery chain rather than
inventing a new secrets mechanism. A secondary concern: Graphify's semantic
extraction reads `DEEPSEEK_API_KEY` via its native `--backend deepseek`, so
one key can serve two consumers — the pattern should make that dual-use
discoverable.

## Decision

1. **MCP server definitions live commented-out in `opencode.jsonc`** under a
   top-level `mcp` key (the standard opencode location, already JSONC).
   Commenting out is the enable mechanism.
2. **Keys flow through `setup.json`'s new optional `env` section → `.envrc`
   `jq` export → opencode `{env:VAR}` resolution.** The section carries
   exactly two keys: `deepseek_api_key` and `searxng_url`, defaulted to `""`
   in the committed project file. All optional tuning vars (`WEBSEARCH_MODEL`,
   `SEARXNG_FANOUT`, etc.) are user-managed out-of-band (shell profile), NOT
   in `setup.json`.
3. **No `setup_version` bump.** Per ADR-0030, an additive backward-compatible
   key is added via the `// ""` jq fallback, not a schema-version bump +
   migration script. The committed `setup.json` gets the `env` section edited
   in directly (self-documenting empty defaults); pre-existing files without
   it are covered by the fallback.
4. **`/setup` does NOT interview for `env` keys** — they are post-setup,
   user-managed. §8 writes the `env` block into the manifest (empty defaults);
   §9 prints a pointer to `mcp.md`.
5. **`/doctor` is NOT extended** — its contract is "required dev-toolchain
   only." MCP is optional; `mcp.md` points users to `opencode mcp list` /
   `opencode mcp debug <name>`.
6. **`setup.json` stays JSON (NOT migrated to `.jsonc`)** — `.envrc`, `/setup`,
   and `migrate-setup.sh` all parse it with `jq`, which cannot parse JSONC.

## Consequences

### Positive
- Consistent opt-in pattern; secrets never enter committed files (user-level
  `~/.config/opencode/setup.json` holds real values).
- **Empty-default contract enforced** — `check-setup-secrets.sh` (pre-commit +
  CI, issue #194) rejects any non-empty `env.*` value in the tracked
  `.opencode/setup.json`, mechanizing the "secrets never enter committed files"
  consequence above.
- Reuses the ADR-0029 delivery chain — no new mechanism.
- One canonical key (`DEEPSEEK_API_KEY`) serves both the deepseek-websearch
  MCP and Graphify's native backend.
- No migration-script maintenance burden (ADR-0030 jq-fallback pattern).

### Neutral
- Users must run `direnv allow` after setting keys.
- Two-place lookup: `opencode.jsonc` for server definitions, `setup.json` for
  keys. Mitigated by `mcp.md` cross-references.

### Negative
- Relies on `npx` fetching upstream packages at runtime.
- **User-level v4 setup files are never auto-migrated** — `migrate-setup.sh`
  only runs against `$PROJECT_SETUP` per `.envrc`; user files at
  `~/.config/opencode/setup.json` are user-managed (per ADR-0029) and the
  `// ""` fallback covers the absent-`env` case transparently.

## Alternatives Considered

### Migrate `setup.json` → `setup.jsonc`
Rejected. `.envrc`, `/setup`, and `migrate-setup.sh` all parse the file with
`jq`, which cannot parse JSONC. Renaming would break three consumers for the
benefit of two commented-out examples that already have a natural home in
`opencode.jsonc` (already JSONC) and `mcp.md`.

### Schema-bump to v5 + `migrate-setup.sh` v4→v5 step
Rejected. ADR-0030 established the jq-fallback-over-schema-bump precedent for
additive backward-compatible keys (`.models.design`). The `env` key is the
same shape; the `// ""` fallback is the entire backward-compat mechanism. A
bump would also have broken the existing `tests/Shell/migrate_setup_test.sh`
assertions for no functional benefit.

### Manage all Graphify/searxng tuning vars in `setup.json`
Rejected. YAGNI — those knobs (timeouts, fan-out, HTML fallback) are
rarely-tuned and user-specific; carrying them in `setup.json` adds schema
surface for almost no value. They live in `mcp.md` as a reference and are set
in the user's shell profile.

### `/doctor` MCP checks
Rejected. `/doctor`'s contract is the *required* dev-toolchain gate. Folding
optional-tool checks into a go/no-go signal muddies what users rely on.
`opencode mcp list` / `opencode mcp debug <name>` are purpose-built for MCP
health.

### The `[openai]`-pointed-at-DeepSeek path as primary
Rejected. Graphify's native `deepseek` backend reads `DEEPSEEK_API_KEY`
directly with no extra install and no `OPENAI_BASE_URL` override. The
`[openai]` path works but is strictly more indirect; documented in `mcp.md`
as an alternative.

## Flagged follow-up

The vendored Graphify skill (`.opencode/skills/graphify/SKILL.md` +
`reference/upstream-pipeline.md`) is stale — it documents Gemini only and
emphatically (now incorrectly) states "No other API keys are read."
Refreshing it to the 8-backend reality is a separate spec. This ADR's
`mcp.md` carries the accurate interim documentation, and a one-line routing
breadcrumb on `SKILL.md` sends readers there.
