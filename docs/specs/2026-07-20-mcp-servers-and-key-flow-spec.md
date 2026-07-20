# Optional MCP Servers & Unified Key-Flow Spec

> **Date:** 2026-07-20
> **Status:** Approved (design phase; architect-reviewed)
> **Target repo:** `kyaulabs/prism` (branch off `develop`)
> **Related:** ADR-0024 (experimental feature delivery), ADR-0029 (unified
> `setup.json` config — amended by ADR-0032), ADR-0030 (jq-fallback-over-
> schema-bump precedent — followed), ADR-0031 (Graphify clause)
> **Will produce:** ADR-0032 (Optional MCP Server Onboarding Pattern; amends
> ADR-0029)
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
- **No `setup_version` bump (adopt ADR-0030's jq-fallback pattern)** — ADR-0030
  set the precedent that an additive, backward-compatible key (`.models.design`)
  is added via the `// fallback` jq pattern, NOT a schema-version bump + migration
  script. The new `env` key is the same shape (additive, backward-compatible;
  the `// ""` fallback handles pre-existing files without it). So `setup_version`
  stays at 4; the committed `setup.json` gets the `env` section edited in
  directly (self-documenting empty defaults), and no `migrate-setup.sh` change is
  needed. ADR-0032 records this as an explicit alignment with ADR-0030. (The
  schema-bump alternative was considered and rejected — see ADR-0032 §Alternatives.)
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

### 3.2 `.opencode/setup.json` — new `env` section (no version bump)

Add a new top-level `env` section (generic name — carries keys for MCP *and*
Graphify). **`setup_version` stays at 4** — per ADR-0030, an additive,
backward-compatible key is added via the `// fallback` jq pattern, not a
schema bump. The committed file gets the `env` section edited in directly;
pre-existing files without it are handled by the `// ""` fallback in `.envrc`
(§3.3).

**Committed project default** (always empty values — `/setup` never prompts
for these):

```json
{
  "setup_version": 4,
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

Add two lines to the existing `jq` eval block (lines 43–57) and add the two
vars to the existing `export` statement. The `// ""` fallback ensures files
without the `env` section (pre-existing project files, or user-level files
from before this change) export empty strings instead of erroring:

```bash
    "DEEPSEEK_API_KEY=\(.env.deepseek_api_key // \"\"|@sh)",
    "SEARXNG_URL=\(.env.searxng_url // \"\"|@sh)",
```

```bash
export DEEPSEEK_API_KEY SEARXNG_URL
```

**No other `.envrc` change.** The migration-trigger threshold stays at `< 4`
(ADR-0030 alignment — no schema bump, no migration step). The `// ""` fallback
is the entire backward-compatibility mechanism.

### 3.4 `.github/scripts/migrate-setup.sh` — no change

No migration step is added. Per ADR-0030's jq-fallback-over-schema-bump
precedent, the `env` key is additive and backward-compatible; the `// ""`
fallback in `.envrc` handles every existing file (project or user-level)
without a migration script. This avoids breaking the existing
`tests/Shell/migrate_setup_test.sh` assertions (which would otherwise need
rewriting for a v4→v5 step).

### 3.5 `.opencode/commands/setup.md` — two edits

1. **§8** (Save manifest) — the schema example gains the `env` block (always
   empty defaults). `setup_version` stays at 4 (no bump per §3.2):

   ```json
   "env": {
     "deepseek_api_key": "",
     "searxng_url": ""
   }
   ```

2. **§9** (Report) — add a static informational one-liner to every run's
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
   `websearch` (quick lookups, official-site discovery), built-in `webfetch`
   (pulling a known URL), `@scout` (clones an upstream dep to inspect its
   actual source — right when the answer needs *source-code inspection* of a
   library/framework), MCP `web_search` (synthesized answer with citations —
   right when the answer needs *synthesis over live web content*), searxng
   `searxng_web_search` (private, self-hosted, free, no key). The `@scout` vs
   MCP `web_search` distinction is the sharpest: scout answers "what does the
   upstream code actually do", `web_search` answers "what is the current state
   of the web on this topic". Note tool-name collisions are absent (each server
   uses distinct names) so both can run simultaneously.
7. **Graphify + `DEEPSEEK_API_KEY`** — the shared-key subsection. Documents
   that the native `--backend deepseek` reads `DEEPSEEK_API_KEY` directly (no
   extra install). The 8-backend reference table (env key → `--backend` flag →
   extra). Auto-detect priority (Gemini → Kimi → Claude → OpenAI → DeepSeek →
   Azure → Bedrock → Ollama). The caveat: keys only needed for **headless
   `graphify extract`**; inside the `/graphify` skill the IDE session provides
   the model. Cross-ref the deferred vendored-skill refresh (§5) and note the
   routing breadcrumb on `SKILL.md` (§3.8) that points back here.
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
- **Supersedes / Amends:** Amends ADR-0029 (adds the `env` key to the
  `setup.json` schema; same `jq`+`.envrc` delivery chain and user-override-wins
  precedence). Follows ADR-0030's jq-fallback-over-schema-bump precedent for
  additive backward-compatible keys.
- **Context:** two optional MCP servers + Graphify's `DEEPSEEK_API_KEY`
  reuse; need an opt-in onboarding pattern that keeps secrets out of committed
  files and reuses the ADR-0029 delivery chain.
- **Decision:** the points from §1.1 above (servers commented in
  `opencode.jsonc`; keys via `setup.json` `env` → `.envrc` with `// ""`
  fallback; **no `setup_version` bump** — ADR-0030 alignment; `/setup` doesn't
  interview for `env`; `/doctor` not extended; `setup.json` stays JSON).
- **Consequences:** positive (consistent pattern, secrets uncommitted, reuses
  ADR-0029, one canonical key, no migration-script maintenance burden);
  neutral (`direnv allow` needed after setting keys; two-place lookup —
  `opencode.jsonc` for defs, `setup.json` for keys — mitigated by `mcp.md`
  cross-refs); negative (relies on `npx` fetching upstream packages).
  **User-level v4 setup files are never auto-migrated** — `migrate-setup.sh`
  only runs against `$PROJECT_SETUP` per `.envrc`; user files at
  `~/.config/opencode/setup.json` are user-managed (per ADR-0029) and the
  `// ""` fallback covers the absent-`env` case transparently.
- **Alternatives considered:** `setup.json` → `setup.jsonc` (rejected: breaks
  `jq`); **schema-bump to v5 + `migrate-setup.sh` v4→v5 step** (rejected:
  ADR-0030 established the jq-fallback-over-schema-bump precedent for additive
  backward-compatible keys; the `// ""` fallback is the entire
  backward-compat mechanism, and bumping would have broken the existing
  `tests/Shell/migrate_setup_test.sh` assertions); manage all Graphify/searxng
  tuning vars in `setup.json` (rejected: YAGNI); `/doctor` MCP checks
  (rejected: muddies required-toolchain gate); the `[openai]`-pointed-at-DeepSeek
  path as primary (rejected: native `deepseek` backend is cleaner; documented
  as alternative).
- **Flagged follow-up:** the vendored Graphify skill (`SKILL.md` +
  `upstream-pipeline.md`) is stale (Gemini-only); its multi-backend refresh is
  a separate spec. This spec adds a one-line routing breadcrumb at the top of
  `SKILL.md` (§3.8) so readers landing there are sent to accurate data — that
  breadcrumb is not a refresh.

### 3.8 `.opencode/skills/graphify/SKILL.md` — stale-routing breadcrumb

Add a **one-line breadcrumb** immediately below the existing RCS header:

```markdown
> ⚠ The backend list below is stale (Gemini-only). For the accurate 8-backend
> reference and `DEEPSEEK_API_KEY` reuse, see `.opencode/docs/mcp.md` §7.
```

This is **not** the deferred skill refresh (§5) — it is a routing breadcrumb
that sends a reader landing on the stale skill to the accurate interim data
in `mcp.md`. One line, no content rewrite.

### 3.9 `AGENTS.md` — new subsection

Add an **"MCP Servers"** subsection adjacent to "Experimental OpenCode
Features" (the LSP/scout/background-flags section). One short paragraph:
MCP servers are optional, commented out in `opencode.jsonc`, keys flow via
`setup.json` `env` + `.envrc`, full guide in `.opencode/docs/mcp.md`.

### 3.10 `/doctor` — untouched

No changes. Rationale recorded in ADR-0032 and `mcp.md` §10.

---

## 4. Files touched

| File | Change |
|---|---|
| `opencode.jsonc` | New `mcp` key (commented out), inserted between `lsp` and `agent` |
| `.opencode/setup.json` | New `env` section (empty defaults). `setup_version` stays at 4 (ADR-0030 alignment) |
| `.envrc` | Two `jq` eval lines + add two vars to the existing `export`. No threshold change |
| `.opencode/commands/setup.md` | §8 manifest schema gains `env` block; §9 one-liner. No version-gate change |
| `.opencode/docs/mcp.md` | **New file** (mirrors `lsp.md`) |
| `adr/0032-optional-mcp-server-onboarding.md` | **New ADR** (amends ADR-0029; follows ADR-0030) |
| `.opencode/skills/graphify/SKILL.md` | One-line stale-routing breadcrumb (not a refresh) |
| `AGENTS.md` | New "MCP Servers" subsection |
| `CONTEXT.md` | New "MCP server" glossary row; refresh `setup.json` row; add ADR-0032 to architectural-decisions list |
| `.github/scripts/migrate-setup.sh` | **Untouched** (no migration — ADR-0030 jq-fallback pattern) |
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
interim Graphify documentation, and §3.8 adds a one-line routing breadcrumb to
the stale `SKILL.md` so readers landing there are sent to the accurate data.

---

## 6. Testing & verification

This is a **config-plumbing + documentation** change with no PHP/JS/SCSS
production code. Verification is largely structural:

1. **`opencode.jsonc` valid JSONC** — the file parses (comments stripped) as
   valid JSON. The `mcp` key is present with both server blocks commented out.
2. **`setup.json` valid JSON** — `jq .opencode/setup.json` succeeds;
   `setup_version` is still 4 (unchanged); `env` section present with two
   empty-string keys.
3. **`.envrc` exports** — after `direnv allow`, `echo $DEEPSEEK_API_KEY` and
   `echo $SEARXNG_URL` are set (empty by default, populated when user-level
   override exists).
4. **`// ""` fallback** — a `setup.json` without an `env` section (e.g. a
   pre-existing user-level file) does NOT break `.envrc`; both vars export as
   empty strings.
5. **`/setup` manifest** — after running `/setup`, the written `setup.json`
   includes the `env` block with empty defaults (and `setup_version` stays 4),
   regardless of whether the user set keys.
6. **`mcp.md`** — renders; all internal links resolve; RCS header + vim
   modeline present.
7. **ADR-0032** — Nygard format; status Accepted; "Supersedes / Amends" lists
   ADR-0029; follows `adr/README.md` numbering (next number is 0032).
8. **Graphify breadcrumb** — `.opencode/skills/graphify/SKILL.md` has the
   one-line stale-routing pointer immediately below its RCS header.
9. **Arch tests** — `tests/Unit/Harness/ArchTest.php` still passes (no new PHP
   files, so strict-types/debug-function vacuity guards are unaffected).
10. **`migrate_setup_test.sh` still green** — the existing shell test is
    untouched and still passes (no v4→v5 migration step was added).
11. **`/check`** — php-cs-fixer + stylelint + eslint + pest all green (no
    source code changed, but the gate runs regardless).

No new Pest tests are required — there is no production code with behavior to
test, and no migration script was added.

---

## 7. Acceptance criteria

- [ ] `opencode.jsonc` has a top-level `mcp` key between `lsp` and `agent`
      with both servers commented out per the verified local-MCP schema.
- [ ] `.opencode/setup.json` has an `env` section with `deepseek_api_key: ""`
      and `searxng_url: ""`. `setup_version` is still 4 (no bump — ADR-0030
      alignment).
- [ ] `.envrc` exports `DEEPSEEK_API_KEY` and `SEARXNG_URL` via `jq` with
      `// ""` fallback. The migration-trigger threshold stays `< 4` (unchanged).
- [ ] `migrate-setup.sh` is unchanged (no v4→v5 step).
- [ ] `/setup` §8 manifest schema includes the `env` block; §9 has the
      MCP+Graphify pointer one-liner. No §1 version-gate change. `/setup` does
      not interview for or overwrite `env`.
- [ ] `.opencode/docs/mcp.md` exists, mirrors `lsp.md` structure, documents
      both servers + the Graphify `DEEPSEEK_API_KEY` shared-key story + the
      8-backend reference + the choosing-a-search-tool guidance (incl. the
      `@scout` vs `web_search` distinction) + the `/doctor` note.
- [ ] `adr/0032-optional-mcp-server-onboarding.md` exists in Nygard format;
      its "Supersedes / Amends" lists ADR-0029; its Alternatives record the
      rejected schema-bump and cite ADR-0030 as the jq-fallback precedent
      followed; it flags the Graphify-skill-staleness follow-up.
- [ ] `.opencode/skills/graphify/SKILL.md` has the one-line stale-routing
      breadcrumb immediately below its RCS header.
- [ ] `AGENTS.md` has an "MCP Servers" subsection pointing to `mcp.md`.
- [ ] `CONTEXT.md` has a new "MCP server" glossary row, a refreshed
      `setup.json` row mentioning the `env` section, and ADR-0032 in its
      architectural-decisions list.
- [ ] `/doctor` is unchanged.
- [ ] `tests/Shell/migrate_setup_test.sh` is unchanged and still green.
- [ ] `/check` passes.
- [ ] A user can uncomment a server block, set a key in
      `~/.config/opencode/setup.json`, run `direnv allow`, restart opencode,
      and the server starts (manually verified at least once per server, or
      documented as unverified if no key is available — prefer searxng for
      verification since it is free/self-hostable).

---

## 8. Rollout

Single feature branch, single PR. No migration at all — the `// ""` fallback
in `.envrc` means every existing clone (project or user-level `setup.json`)
keeps working with zero action; the committed project file simply gains the
`env` section with empty defaults. Users who want to enable a server follow
the `mcp.md` guide; everyone else notices nothing.

**Architect review:** complete (GO-WITH-CONDITIONS → conditions folded in:
ADR-0030 alignment adopted, ADR-0029 amend recorded, CONTEXT.md added,
Graphify breadcrumb added, scout/web_search distinction sharpened). Clear for
the **plan** tab.
