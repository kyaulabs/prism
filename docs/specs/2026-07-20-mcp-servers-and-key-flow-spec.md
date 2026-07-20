# Optional MCP Servers & Unified Key-Flow Spec

> **Date:** 2026-07-20
> **Status:** Approved (design phase)
> **Target repo:** `kyaulabs/prism` (branch off `develop`)
> **Related:** ADR-0024 (experimental feature delivery), ADR-0029 (unified
> `setup.json` config), ADR-0031 (Graphify clause)
> **Will produce:** ADR-0032 (Optional MCP Server Onboarding Pattern)
> **Upstream:**
> - https://github.com/kyaulabs/deepseek-websearch-mcp
> - https://github.com/ihor-sokoliuk/mcp-searxng
> - https://github.com/Graphify-Labs/graphify (Environment variables section)

---

## 1. Goal

Add two **optional, commented-out** MCP servers to the coding harness and
establish a **unified key-flow** so a single canonical secret
(`DEEPSEEK_API_KEY`) powers both the deepseek-websearch MCP server **and**
Graphify's semantic-extraction backend. Keep every server opt-in: nothing is
enabled, no key is required, and no behavior changes for users who ignore the
feature.

### 1.1 Why this shape (the rejected alternatives)

- **MCP servers commented out in `opencode.jsonc`** — `opencode.jsonc` is
  already JSONC (comments are native) and is the standard opencode location for
  the `mcp` key per the vendored `mcp-servers.mdx`. Commenting out is the
  enable mechanism; `enabled: true` inside each block means "on once
  uncommented."
- **Keys flow through `setup.json` → `.envrc` → `{env:VAR}`** — reuses the
  ADR-0029 unified-config delivery chain rather than inventing a new secrets
  mechanism. The user-level override (`~/.config/opencode/setup.json`) keeps
  secrets out of committed files.
- **`setup.json` stays JSON (NOT migrated to `.jsonc`)** — `.envrc`, `/setup`,
  and `migrate-setup.sh` all parse it with `jq`, which cannot parse JSONC.
  Renaming would break three consumers for the benefit of two commented
  examples. Commented examples live in `opencode.jsonc` (already JSONC) and
  `mcp.md` instead.
- **`/doctor` not extended** — its contract is "all *required* dev-toolchain
  tools." MCP is optional; folding optional checks into a go/no-go gate muddies
  the signal. `mcp.md` points users to opencode's purpose-built `opencode mcp
  list` / `opencode mcp debug <name>` instead.

### 1.2 The shared-key insight

`DEEPSEEK_API_KEY` is the **one canonical secret** across this design. Per
Graphify's README (Environment variables section), the native `--backend
deepseek` reads `DEEPSEEK_API_KEY` directly — no extra install, no
`OPENAI_BASE_URL` override. So a single exported key serves:

1. **deepseek-websearch MCP** — via `{env:DEEPSEEK_API_KEY}` in `opencode.jsonc`
2. **Graphify semantic extraction** — via the exported env var when running
   `graphify extract --backend deepseek` (headless) or when the `/graphify`
   skill dispatches semantic extraction

`SEARXNG_URL` is the only other key carried (mcp-searxng's single required
var; it is a URL, not a secret). All other Graphify/MCP tuning vars
(`WEBSEARCH_MODEL`, `SEARXNG_FANOUT`, `OPENAI_BASE_URL`, etc.) are
out-of-band — user-managed in their shell profile, not in `setup.json`.

---

## 2. Context

### 2.1 The two MCP servers

| Server | npm package | Required env | Cost / privacy | Tools exposed |
|---|---|---|---|---|
| `deepseek-websearch` | `@kyaulabs/deepseek-websearch` | `DEEPSEEK_API_KEY` | Paid (DeepSeek tokens) | `web_search` (search + fetch + synthesize in one call) |
| `searxng` | `mcp-searxng` | `SEARXNG_URL` | Free, self-hosted, private | `searxng_web_search`, `searxng_search_suggestions`, `searxng_instance_info`, `web_url_read` |

Both run as `type: "local"` MCP servers spawned via `npx`. Both are
commented out by default.

### 2.2 Graphify's relevance

Graphify's semantic extraction (docs, PDFs, images — *not* code, which is
free AST) supports 8 backends. The native `deepseek` backend reads
`DEEPSEEK_API_KEY` with no extra install. Auto-detect priority when multiple
keys are set: Gemini → Kimi → Claude → OpenAI → DeepSeek → Azure → Bedrock →
Ollama. These env vars only matter for **headless `graphify extract`**; inside
the `/graphify` skill the IDE session provides the model.

**Note:** The vendored `.opencode/skills/graphify/SKILL.md` and
`reference/upstream-pipeline.md` are stale — they document Gemini only and
emphatically (and now incorrectly) state "No other API keys are read."
Refreshing those to the multi-backend reality is **deferred** to a separate
spec (see §5). This spec's `mcp.md` carries the accurate Graphify backend
documentation in the interim.

### 2.3 opencode local-MCP schema (verified)

From the vendored `.opencode/skills/opencode-docs/docs/mcp-servers.mdx`, the
authoritative shape for a local MCP server:

| Option | Type | Required | Notes |
|---|---|---|---|
| `type` | String | Y | Must be `"local"` |
| `command` | Array | Y | Command + args to spawn the server |
| `environment` | Object | | Env vars passed to the server process |
| `enabled` | Boolean | | Enable on startup |
| `timeout` | Number | | ms for fetching tools (default 5000) |
| `cwd` | String | | Working directory |

`{env:VAR_NAME}` is opencode's runtime env-resolution syntax inside
`environment` values.

---

## 3. Design

### 3.1 `opencode.jsonc` — new `mcp` key

Insert a new top-level `mcp` key **between `lsp` and `agent`** (logical
grouping with other tooling integration). Both servers fully commented out:

```jsonc
  "mcp": {
    // ── Optional MCP servers (commented out by default) ────────────────────
    // To enable: uncomment a block, set its key/URL in
    // ~/.config/opencode/setup.json (env.deepseek_api_key / env.searxng_url),
    // run `direnv allow`, restart opencode. Full guide: .opencode/docs/mcp.md

    // deepseek-websearch — server-side web search via DeepSeek's
    // web_search_20250305 tool (search + fetch + synthesize in one call).
    // Requires DEEPSEEK_API_KEY (paid). The same key also powers Graphify's
    // native --backend deepseek. Upstream: kyaulabs/deepseek-websearch-mcp
    // "deepseek-websearch": {
    //   "type": "local",
    //   "command": ["npx", "@kyaulabs/deepseek-websearch"],
    //   "enabled": true,
    //   "environment": { "DEEPSEEK_API_KEY": "{env:DEEPSEEK_API_KEY}" }
    // },

    // mcp-searxng — private web search via a SearXNG instance (self-hosted,
    // free, no API key). Requires SEARXNG_URL. Optional tuning vars
    // (SEARXNG_FANOUT, SEARXNG_HTML_FALLBACK, ...) documented in mcp.md.
    // Upstream: ihor-sokoliuk/mcp-searxng
    // "searxng": {
    //   "type": "local",
    //   "command": ["npx", "mcp-searxng"],
    //   "enabled": true,
    //   "environment": { "SEARXNG_URL": "{env:SEARXNG_URL}" }
    // }
  },
```

### 3.2 `.opencode/setup.json` — new `env` section + version bump

Add a new top-level `env` section (generic name — carries keys for MCP *and*
Graphify). Bump `setup_version` 4 → 5.

**Committed project default** (always empty values — `/setup` never prompts
for these):

```json
{
  "setup_version": 5,
  "configured": true,
  "timestamp": "...",
  "app": "prism",
  "domain": "kyaulabs",
  "repo": "kyaulabs/prism",
  "signed_off_by_name": "kyau",
  "signed_off_by_email": "git@kyaulabs.com",
  "accent": "sky-blue",
  "scaffold_mode": "skip",
  "project_folder": null,
  "models": { "...": "..." },
  "variants": { "...": "..." },
  "experimental": { "...": "..." },
  "env": {
    "deepseek_api_key": "",
    "searxng_url": ""
  }
}
```

**User-level override** (`~/.config/opencode/setup.json` — not committed; user
adds real values here):

```json
{
  "env": {
    "deepseek_api_key": "sk-...",
    "searxng_url": "https://searxng.example.com"
  }
}
```

The user-level file wins via the existing `SETUP_FILE` pick logic in `.envrc`
(line 33–38: user file checked first). `/setup` does not interview for, write,
or overwrite the `env` section — it is user-managed.

### 3.3 `.envrc` — export the two keys

Add two lines to the existing `jq` eval block (lines 43–57) and two `export`
statements. The `// ""` fallback ensures pre-v5 files without the `env`
section export empty strings instead of erroring:

```bash
    "DEEPSEEK_API_KEY=\(.env.deepseek_api_key // \"\"|@sh)",
    "SEARXNG_URL=\(.env.searxng_url // \"\"|@sh)",
```

```bash
export DEEPSEEK_API_KEY SEARXNG_URL
```

Also bump the migration-trigger threshold from `< 4` to `< 5` (line 28) so v4
files get backfilled to v5 on direnv entry:

```bash
   [ "$(jq -r '.setup_version // 0' "$PROJECT_SETUP" 2>/dev/null)" -lt 5 ] 2>/dev/null; then
```

### 3.4 `.github/scripts/migrate-setup.sh` — v4→v5 step

Add an idempotent v4→v5 migration step (mirroring the existing v1→v4 steps):

- **Gate:** `setup_version < 5`
- **Action:** set `setup_version = 5`; add `env: {deepseek_api_key: "",
  searxng_url: ""}` **only if `env` is absent** (preserve any user values
  already present)
- Idempotent: re-running on a v5 file is a no-op
- Atomic write (temp file + rename) matching the existing pattern

Reference jq (implementer to adapt to the script's existing structure):

```bash
jq '.setup_version = 5 | (if has("env") then . else .env = {deepseek_api_key: "", searxng_url: ""} end)'
```

### 3.5 `.opencode/commands/setup.md` — three edits

1. **§1** — add a version-gate line mirroring the existing pattern:
   > If `setup_version` is `< 5`, run `bash .github/scripts/migrate-setup.sh .opencode/setup.json` before reading values. The migration is idempotent.

2. **§8** (Save manifest) — the schema example gains `setup_version: 5` and the
   `env` block (always empty defaults):

   ```json
   "env": {
     "deepseek_api_key": "",
     "searxng_url": ""
   }
   ```

3. **§9** (Report) — add a static informational one-liner to every run's
   reminders:
   > Optional integrations: enable MCP web-search servers (deepseek-websearch, mcp-searxng) by uncommenting their blocks in `opencode.jsonc`; the same `DEEPSEEK_API_KEY` also powers Graphify's `--backend deepseek`. Set keys in `~/.config/opencode/setup.json` (`env` section). See `.opencode/docs/mcp.md`.

`/setup` does **not** interview for `env` values and does **not** overwrite a
user's existing `env` section on re-runs.

### 3.6 `.opencode/docs/mcp.md` — new docs file (mirrors `lsp.md`)

RCS header + vim modeline (matches `lsp.md` sibling). Sections:

1. **Overview** — MCP servers are optional; all commented out by default; no
   behavior change unless a user opts in.
2. **Available servers** — the table from §2.1 of this spec.
3. **Enabling a server** — (1) uncomment the block in `opencode.jsonc`, (2) set
   the key in `~/.config/opencode/setup.json` (`env` section), (3) `direnv
   allow`, (4) restart opencode.
4. **How keys flow** — the ADR-0029 chain diagram: `setup.json` `env` →
   `.envrc` `jq` export → `{env:VAR}` resolution in `opencode.jsonc`. Note
   user-level override wins.
5. **Tool inventory** — what each server exposes (table from §2.1).
6. **Choosing a search tool** — the overlap callout. When to use: built-in
   `websearch` (quick lookups), built-in `webfetch` (known URL),
   `@scout` (clone + inspect upstream source), MCP `web_search` (synthesized
   answer with citations), searxng `searxng_web_search` (private, self-hosted,
   free). Note tool-name collisions are absent (each server uses distinct
   names) so both can run simultaneously.
7. **Graphify + `DEEPSEEK_API_KEY`** — the shared-key subsection. Documents
   that the native `--backend deepseek` reads `DEEPSEEK_API_KEY` directly (no
   extra install). The 8-backend reference table (env key → `--backend` flag →
   extra). The caveat: keys only needed for **headless `graphify extract`**;
   inside the `/graphify` skill the IDE session provides the model. Cross-ref
   the deferred vendored-skill refresh.
8. **Optional tuning vars** — deepseek-websearch's `WEBSEARCH_MODEL`
   (`deepseek-v4-flash` / `deepseek-v4-pro`), `WEBSEARCH_THINKING`,
   `WEBSEARCH_MAX_TOKENS`; link mcp-searxng's upstream `CONFIGURATION.md` for
   its many vars (`SEARXNG_FANOUT`, `SEARXNG_HTML_FALLBACK`, etc.). State these
   are user-managed out-of-band (shell profile), NOT in `setup.json`.
9. **Troubleshooting** — empty key (server fails to start / silent),
   mcp-searxng 403 JSON-format (fix: enable `json` in SearXNG
   `settings.yml` or set `SEARXNG_HTML_FALLBACK`), `npx` not found, the
   context-bloat caveat from `mcp-servers.mdx`.
10. **`/doctor` note** — states `/doctor` does NOT cover MCP (optional
    tooling); points to `opencode mcp list` and `opencode mcp debug <name>`.

### 3.7 `adr/0032-optional-mcp-server-onboarding.md` — new ADR

Nygard format (matches `adr/` house style). Records:

- **Status:** Accepted
- **Context:** two optional MCP servers + Graphify's `DEEPSEEK_API_KEY`
  reuse; need an opt-in onboarding pattern that keeps secrets out of committed
  files and reuses the ADR-0029 delivery chain.
- **Decision:** the 9 points from §1.1 above (servers commented in
  `opencode.jsonc`; keys via `setup.json` `env` → `.envrc`; `setup_version`
  4→5; `/setup` doesn't interview; `/doctor` not extended; `setup.json` stays
  JSON).
- **Consequences:** positive (consistent pattern, secrets uncommitted, reuses
  ADR-0029, one canonical key); neutral (`direnv allow` needed after setting
  keys; two-place lookup — `opencode.jsonc` for defs, `setup.json` for keys —
  mitigated by `mcp.md` cross-refs); negative (relies on `npx` fetching
  upstream packages; user-level v4 files need migration or rely on `// ""`
  fallback).
- **Alternatives considered:** `setup.json` → `setup.jsonc` (rejected: breaks
  `jq`); manage all Graphify/searxng tuning vars in `setup.json` (rejected:
  YAGNI); `/doctor` MCP checks (rejected: muddies required-toolchain gate);
  the `[openai]`-pointed-at-DeepSeek path as primary (rejected: native
  `deepseek` backend is cleaner; documented as alternative).
- **Flagged follow-up:** the vendored Graphify skill (`SKILL.md` +
  `upstream-pipeline.md`) is stale (Gemini-only); its multi-backend refresh is
  a separate spec.

### 3.8 `AGENTS.md` — new subsection

Add an **"MCP Servers"** subsection adjacent to "Experimental OpenCode
Features" (the LSP/scout/background-flags section). One short paragraph:
MCP servers are optional, commented out in `opencode.jsonc`, keys flow via
`setup.json` `env` + `.envrc`, full guide in `.opencode/docs/mcp.md`.

### 3.9 `/doctor` — untouched

No changes. Rationale recorded in ADR-0032 and `mcp.md` §10.

---

## 4. Files touched

| File | Change |
|---|---|
| `opencode.jsonc` | New `mcp` key (commented out), inserted between `lsp` and `agent` |
| `.opencode/setup.json` | New `env` section; `setup_version` 4→5 |
| `.envrc` | Two `jq` eval lines + two `export`s; migration threshold `< 4` → `< 5` |
| `.github/scripts/migrate-setup.sh` | New v4→v5 idempotent backfill step |
| `.opencode/commands/setup.md` | §1 version-gate; §8 manifest schema; §9 one-liner |
| `.opencode/docs/mcp.md` | **New file** (mirrors `lsp.md`) |
| `adr/0032-optional-mcp-server-onboarding.md` | **New ADR** |
| `AGENTS.md` | New "MCP Servers" subsection |
| `.github/scripts/doctor.md` | **Untouched** (rationale in ADR-0032) |

---

## 5. Scope boundary — what is deferred

The **vendored Graphify skill refresh** (`.opencode/skills/graphify/SKILL.md`
+ `reference/upstream-pipeline.md`) is **out of scope** for this spec. Those
files are Gemini-only and state "No other API keys are read," which is now
incorrect. Refreshing them to the 8-backend reality is a distinct doc-accuracy
concern that deserves its own grilling round (which backends to surface
prominently, how to restructure the semantic-extraction dispatch logic, etc.).
ADR-0032 flags this as a follow-up. This spec's `mcp.md` carries the accurate
interim Graphify documentation.

---

## 6. Testing & verification

This is a **config-plumbing + documentation** change with no PHP/JS/SCSS
production code. Verification is largely structural:

1. **`opencode.jsonc` valid JSONC** — the file parses (comments stripped) as
   valid JSON. The `mcp` key is present with both server blocks commented out.
2. **`setup.json` valid JSON** — `jq .opencode/setup.json` succeeds;
   `setup_version` is 5; `env` section present with two empty-string keys.
3. **`.envrc` exports** — after `direnv allow`, `echo $DEEPSEEK_API_KEY` and
   `echo $SEARXNG_URL` are set (empty by default, populated when user-level
   override exists).
4. **Migration idempotent** — running `migrate-setup.sh` on a v4 file produces
   a v5 file with `env`; running it again on the v5 file is a no-op; running
   on a v5 file that already has user `env` values preserves them.
5. **Pre-v5 `.envrc` fallback** — a v4 `setup.json` (no `env` section) does
   NOT break `.envrc` (the `// ""` fallback exports empty strings).
6. **`/setup` manifest** — after running `/setup`, the written `setup.json`
   includes `setup_version: 5` and the `env` block with empty defaults,
   regardless of whether the user set keys.
7. **`mcp.md`** — renders; all internal links resolve; RCS header + vim
   modeline present.
8. **ADR-0032** — Nygard format; status Accepted; follows `adr/README.md`
   numbering (next number is 0032).
9. **Arch tests** — `tests/Unit/Harness/ArchTest.php` still passes (no new PHP
   files, so strict-types/debug-function vacuity guards are unaffected).
10. **`/check`** — php-cs-fixer + stylelint + eslint + pest all green (no
    source code changed, but the gate runs regardless).

No new Pest tests are required — there is no production code with behavior to
test. If the implementer adds a shell test for the migration script's
idempotence, it lives in `tests/Shell/`.

---

## 7. Acceptance criteria

- [ ] `opencode.jsonc` has a top-level `mcp` key between `lsp` and `agent`
      with both servers commented out per the verified local-MCP schema.
- [ ] `.opencode/setup.json` has `setup_version: 5` and an `env` section with
      `deepseek_api_key: ""` and `searxng_url: ""`.
- [ ] `.envrc` exports `DEEPSEEK_API_KEY` and `SEARXNG_URL` via `jq` with
      `// ""` fallback; the migration-trigger threshold is `< 5`.
- [ ] `migrate-setup.sh` has an idempotent v4→v5 step that backfills `env`
      only when absent and preserves existing user values.
- [ ] `/setup` §1 has the `< 5` version-gate; §8 manifest schema includes
      `env`; §9 has the MCP+Graphify pointer one-liner. `/setup` does not
      interview for or overwrite `env`.
- [ ] `.opencode/docs/mcp.md` exists, mirrors `lsp.md` structure, documents
      both servers + the Graphify `DEEPSEEK_API_KEY` shared-key story + the
      8-backend reference + the choosing-a-search-tool guidance + the
      `/doctor` note.
- [ ] `adr/0032-optional-mcp-server-onboarding.md` exists in Nygard format
      and records the decision + flagged Graphify-skill-staleness follow-up.
- [ ] `AGENTS.md` has an "MCP Servers" subsection pointing to `mcp.md`.
- [ ] `/doctor` is unchanged.
- [ ] `/check` passes.
- [ ] A user can uncomment a server block, set a key in
      `~/.config/opencode/setup.json`, run `direnv allow`, restart opencode,
      and the server starts (manually verified at least once per server, or
      documented as unverified if no key is available during implementation).

---

## 8. Rollout

Single feature branch, single PR. No migration drama — the `// ""` fallback
means existing clones keep working even before users run
`migrate-setup.sh`/`/setup`. Users who want to enable a server follow the
`mcp.md` guide; everyone else notices nothing.

**Suggested next step after spec approval:** an `@architect` pass — this is
cross-cutting config plumbing across `.envrc` + `setup.json` + `/setup` +
`opencode.jsonc`, and an architect review before the plan tab is warranted per
AGENTS.md. Then the `plan` tab for implementation planning.
