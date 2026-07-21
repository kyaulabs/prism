# Optional MCP Servers & Unified Key-Flow Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Tasks 1, 2, 4, 5
> route to `@tdd`; Task 3 routes to `@docs-writer`. Steps use checkbox
> (`- [ ]`) syntax for tracking. This is a config + docs change with no
> production code, so the cycle per task is **Edit → Verify structurally →
> Commit** (not Red/Green/Refactor).
> **Spec:** `docs/specs/2026-07-20-mcp-servers-and-key-flow-spec.md`
> **Branch:** `feat/kyau-ba98-mcp-servers-key-flow`

**Goal:** Add two optional commented-out MCP servers to `opencode.jsonc` and a unified key-flow (`setup.json` `env` → `.envrc` → `{env:VAR}`) where `DEEPSEEK_API_KEY` serves both the deepseek-websearch MCP and Graphify's native `--backend deepseek`.

**Architecture:** MCP server definitions live commented-out in `opencode.jsonc` (already JSONC). Keys flow through the ADR-0029 chain: `setup.json` new `env` section → `.envrc` `jq` export with `// ""` fallback → opencode `{env:VAR}` resolution. **No `setup_version` bump** (ADR-0030 jq-fallback alignment). User-level `~/.config/opencode/setup.json` keeps secrets out of committed files.

## Global constraints

- `setup_version` stays at **4** (no bump — ADR-0030).
- Every commit: Conventional Commits format with `Authored-by: glm-5.2`, `Tested-by: deepseek-v4-pro`, `Signed-off-by: kyau <git@kyaulabs.com>` (resolved via `bash .github/scripts/resolve-identity.sh`). Single `-m` with `$'...\n...'` quoting.
- Never edit `cdn/css/*.min.css`, `cdn/javascript/*.min.js`, or `aurora/`.
- New Markdown docs in `.opencode/docs/` get the RCS header + vim modeline matching `lsp.md`.
- Commit footer identity confirmed via `resolve-identity.sh`: `kyau <git@kyaulabs.com>`.

## File map

| File | Task | Agent |
|---|---|---|
| `opencode.jsonc` | 1 | @tdd |
| `.opencode/setup.json` | 1 | @tdd |
| `.envrc` | 1 | @tdd |
| `.opencode/commands/setup.md` | 2 | @tdd |
| `.opencode/docs/mcp.md` | 3 | @docs-writer |
| `adr/0032-mcp-server-onboarding.md` | 4 | @tdd |
| `CONTEXT.md` | 4 | @tdd |
| `.opencode/skills/graphify/SKILL.md` | 5 | @tdd |
| `AGENTS.md` | 5 | @tdd |

---

## Task 1: Core plumbing — opencode.jsonc + setup.json + .envrc (@tdd)

**Files:**
- Modify: `opencode.jsonc` (insert `mcp` key between `lsp` and `agent`, ~line 38–39)
- Modify: `.opencode/setup.json` (add `env` section after `experimental`)
- Modify: `.envrc` (add 2 jq eval lines + 1 export line)

- [ ] **Step 1:** Add the `mcp` key to `opencode.jsonc` — insert immediately after the `lsp` block's closing `},` and before `"agent": {`:

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

- [ ] **Step 2:** Add the `env` section to `.opencode/setup.json`. Current file ends with the `experimental` block. Add `,` after its closing brace, then:

```json
  "env": {
    "deepseek_api_key": "",
    "searxng_url": ""
  }
}
```

- [ ] **Step 3:** In `.envrc` jq eval block, the last line is `"OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=\(.experimental.background_subagents|@sh)"` (no trailing comma). Change to add comma + two new lines:

```bash
        "OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=\(.experimental.background_subagents|@sh)",
        "DEEPSEEK_API_KEY=\(.env.deepseek_api_key // \"\"|@sh)",
        "SEARXNG_URL=\(.env.searxng_url // \"\"|@sh)"
```

Then after the existing `export OPENCODE_EXPERIMENTAL_LSP_TOOL ...` line, add:

```bash
    export DEEPSEEK_API_KEY SEARXNG_URL
```

- [ ] **Step 4:** Verify — `jq . .opencode/setup.json >/dev/null` succeeds; `setup_version` still 4; `env.deepseek_api_key` empty string; `.envrc` has both exports; `opencode.jsonc` has exactly one `"mcp"` key.
- [ ] **Step 5:** Verify `// ""` fallback — `jq -r '"DEEPSEEK_API_KEY=\(.env.deepseek_api_key // \"\"|@sh)"' .opencode/setup.json` outputs `DEEPSEEK_API_KEY=''` with no error.
- [ ] **Step 6:** Commit:

```bash
git add opencode.jsonc .opencode/setup.json .envrc
git commit -S -m $'feat(mcp): add commented-out MCP servers and env key-flow\n\nAdd mcp key to opencode.jsonc with deepseek-websearch and mcp-searxng\nboth commented out (opt-in). Add env section to setup.json (deepseek_api_key,\nsearxng_url, empty defaults). Export both via .envrc jq with // "" fallback\nfor backward compat. No setup_version bump (ADR-0030 jq-fallback pattern).\nDEEPSEEK_API_KEY serves both the MCP server and Graphify --backend deepseek.\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 2: /setup command integration (@tdd)

**Files:** Modify `.opencode/commands/setup.md` (§8 manifest schema + §9 report one-liner)

- [ ] **Step 1:** In §8 manifest JSON example, the current ending is the `experimental` block. Add `,` + `env` block (same shape as Task 1; `setup_version` stays 4).
- [ ] **Step 2:** In §9 (Report), append to the reminder bullet list:

```markdown
- Optional integrations: enable MCP web-search servers (deepseek-websearch, mcp-searxng) by uncommenting their blocks in `opencode.jsonc`; the same `DEEPSEEK_API_KEY` also powers Graphify's `--backend deepseek`. Set keys in `~/.config/opencode/setup.json` (`env` section). See `.opencode/docs/mcp.md`.
```

- [ ] **Step 3:** Verify — `deepseek_api_key` present in setup.md; `MCP web-search servers` one-liner present.
- [ ] **Step 4:** Commit:

```bash
git add .opencode/commands/setup.md
git commit -S -m $'feat(setup): wire env section into /setup manifest and report\n\n§8 manifest schema gains the env block (empty defaults, setup_version\nstays 4). §9 report gains a one-liner pointing users to mcp.md for\noptional MCP server + Graphify DEEPSEEK_API_KEY setup.\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 3: mcp.md documentation (@docs-writer)

**Files:** Create `.opencode/docs/mcp.md` (mirrors `.opencode/docs/lsp.md`)

- [ ] **Step 1:** Create `.opencode/docs/mcp.md` per rcs-header skill (`<!-- $KYAULabs: mcp.md ... -->` header + `<!-- vim: ... -->` modeline). Sections (spec §3.6 is the blueprint; the tables below are inlined):

1. **Overview** — optional; commented out; no behavior change unless opted in.
2. **Available servers** — table: deepseek-websearch (`DEEPSEEK_API_KEY`, paid, `web_search`); mcp-searxng (`SEARXNG_URL`, free/private, `searxng_web_search`/`searxng_search_suggestions`/`searxng_instance_info`/`web_url_read`).
3. **Enabling a server** — uncomment in opencode.jsonc → set key in `~/.config/opencode/setup.json` (`env` section) → `direnv allow` → restart. User-level override JSON example.
4. **How keys flow** — diagram: setup.json `env` → .envrc jq export (`// ""` fallback) → `{env:VAR}`. User-level wins (ADR-0029).
5. **Tool inventory** — the §2 table.
6. **Choosing a search tool** — `websearch` (quick lookups), `webfetch` (known URL), `@scout` (clones upstream dep for source inspection — "what does the code do"), MCP `web_search` (synthesis over live web — "current state of the web"), searxng (private/free/no key). No name collisions → both run simultaneously.
7. **Graphify + `DEEPSEEK_API_KEY`** — native `--backend deepseek` reads `DEEPSEEK_API_KEY` directly (no extra install). 8-backend reference table (`--backend` | env key | extra): gemini (`GEMINI_API_KEY`/`GOOGLE_API_KEY`, `graphifyy[gemini]`), kimi (`MOONSHOT_API_KEY`, built-in), claude (`ANTHROPIC_API_KEY`, `graphifyy[anthropic]`), openai (`OPENAI_API_KEY`+`OPENAI_BASE_URL`+`OPENAI_MODEL`, `graphifyy[openai]`), **deepseek** (`DEEPSEEK_API_KEY`, **built-in**), azure (`AZURE_OPENAI_API_KEY`+`AZURE_OPENAI_ENDPOINT`, `graphifyy[openai]`), bedrock (AWS IAM, `graphifyy[bedrock]`), ollama (`OLLAMA_BASE_URL`, `graphifyy[ollama]`). Auto-detect priority: Gemini→Kimi→Claude→OpenAI→DeepSeek→Azure→Bedrock→Ollama. Caveat: keys only for headless `graphify extract`; IDE skill provides model. Note vendored SKILL.md is stale (breadcrumb at its top); refresh deferred (ADR-0032).
8. **Optional tuning vars** — deepseek-websearch: `WEBSEARCH_MODEL`/`WEBSEARCH_THINKING`/`WEBSEARCH_MAX_TOKENS`. mcp-searxng: link https://github.com/ihor-sokoliuk/mcp-searxng/blob/main/CONFIGURATION.md (`SEARXNG_FANOUT`, `SEARXNG_HTML_FALLBACK`, etc.). User-managed in shell profile, NOT setup.json.
9. **Troubleshooting** — empty key; mcp-searxng 403 JSON-format (enable `json` in SearXNG settings.yml `search.formats`, or `SEARXNG_HTML_FALLBACK=true`); `npx` not found; context-bloat caveat.
10. **/doctor note** — does NOT cover MCP; use `opencode mcp list` / `opencode mcp debug <name>`.

- [ ] **Step 2:** Verify — file exists; RCS header line 1; vim modeline last line; `DEEPSEEK_API_KEY` present; `@scout` present.
- [ ] **Step 3:** Commit:

```bash
git add .opencode/docs/mcp.md
git commit -S -m $'docs(mcp): add MCP servers documentation\n\nNew .opencode/docs/mcp.md mirroring lsp.md structure: available servers,\nenabling steps, key-flow diagram, tool inventory, choosing-a-search-tool\n(incl @scout vs web_search distinction), Graphify DEEPSEEK_API_KEY\nshared-key section with 8-backend reference, optional tuning vars,\ntroubleshooting, and /doctor note. RCS header + vim modeline per rcs-header\nskill.\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 4: ADR-0032 + CONTEXT.md (@tdd)

**Files:** Create `adr/0032-mcp-server-onboarding.md`; Modify `CONTEXT.md`

- [ ] **Step 1:** Create `adr/0032-mcp-server-onboarding.md` (Nygard format per `adr/0000-template.md`). Status: Accepted. Status section opens with "Amends ADR-0029 (adds `env` key; same jq + .envrc chain). Follows ADR-0030 jq-fallback-over-schema-bump precedent." Context: two optional MCP servers + Graphify DEEPSEEK_API_KEY reuse; need opt-in pattern keeping secrets out of committed files. Decision: (1) servers commented in opencode.jsonc; (2) keys via setup.json env → .envrc with `// ""` fallback; (3) no setup_version bump (ADR-0030); (4) /setup doesn't interview for env; (5) /doctor not extended; (6) setup.json stays JSON. Consequences: positive (consistent, secrets uncommitted, one canonical key, no migration maintenance); neutral (direnv allow needed, two-place lookup mitigated by mcp.md); negative (relies on npx; user-level v4 files never auto-migrated — `// ""` covers them). Alternatives Considered: setup.json→setup.jsonc (rejected: breaks jq); schema-bump v5 (rejected: ADR-0030 precedent + breaks migrate_setup_test.sh); manage all tuning vars in setup.json (rejected: YAGNI); /doctor MCP checks (rejected: muddies gate); [openai]-pointed-at-DeepSeek as primary (rejected: native deepseek cleaner). Flagged follow-up: vendored Graphify skill stale, refresh is separate spec.

- [ ] **Step 2:** Add "MCP server" glossary row to CONTEXT.md `## Domain Glossary` table (after `graphify` row):

```markdown
| MCP server | Optional Model Context Protocol server registered under the `mcp` key in `opencode.jsonc`. All servers ship commented-out (opt-in). Keys flow via `setup.json` `env` section → `.envrc` → `{env:VAR}`. `DEEPSEEK_API_KEY` serves both the `deepseek-websearch` MCP and Graphify's native `--backend deepseek`. See `.opencode/docs/mcp.md` and ADR-0032. |
```

- [ ] **Step 3:** Refresh the `setup.json` glossary row — append "and optional integration-key (`env`)" after "experimental flag" and change "See ADR-0029." to "See ADR-0029, ADR-0032."

- [ ] **Step 4:** In CONTEXT.md `## Architectural Decisions` list, after the ADR-0030 entry, add **two** entries (backfills missing ADR-0031 + adds ADR-0032):

```markdown
- `adr/0031-model-rebalance-and-footer-rename.md` — z.ai Pro plan rebalance (GLM-5.2 max for plan/code/design, DeepSeek-Pro for cross-model review) + commit footer rename (Authored-by/Tested-by); supersedes ADR-0014, amends ADR-0010
- `adr/0032-mcp-server-onboarding.md` — Optional MCP servers (commented-out in `opencode.jsonc`) + unified `env` key-flow via `setup.json`/`.envrc` (no version bump; ADR-0030 jq-fallback pattern); amends ADR-0029
```

- [ ] **Step 5:** Verify — ADR-0032 exists; "Amends ADR-0029" present; "ADR-0030" cross-ref present; CONTEXT.md has `| MCP server |` row + ADR-0032 listed + ADR-0031 listed.
- [ ] **Step 6:** Commit:

```bash
git add adr/0032-mcp-server-onboarding.md CONTEXT.md
git commit -S -m $'docs(adr): add ADR-0032 MCP server onboarding pattern\n\nRecords the decision: servers commented-out in opencode.jsonc, keys via\nsetup.json env section -> .envrc (no version bump, ADR-0030 jq-fallback\npattern), /doctor untouched, setup.json stays JSON. Amends ADR-0029.\nAlternatives section rejects setup.jsonc migration, schema-bump, /doctor\nchecks. Flags vendored Graphify skill staleness as a follow-up.\n\nCONTEXT.md gains an MCP server glossary row, a refreshed setup.json row,\nthe ADR-0032 entry, and backfills the missing ADR-0031 list entry.\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 5: Routing pointers — Graphify breadcrumb + AGENTS.md (@tdd)

**Files:** Modify `.opencode/skills/graphify/SKILL.md`; Modify `AGENTS.md`

- [ ] **Step 1:** Add breadcrumb to `.opencode/skills/graphify/SKILL.md`. **Correction:** this file has NO RCS header — it opens with YAML frontmatter (lines 1–4: `---`/`name: graphify`/`description: ...`/`---`). Insert immediately after line 4's closing `---`:

```markdown

> ⚠ The backend list below is stale (Gemini-only). For the accurate 8-backend
> reference and `DEEPSEEK_API_KEY` reuse, see `.opencode/docs/mcp.md` §7.
```

- [ ] **Step 2:** Add "MCP Servers" subsection to `AGENTS.md` immediately after the "Experimental OpenCode Features" section:

```markdown
## MCP Servers

Optional, opt-in. Two MCP servers are defined commented-out under the `mcp`
key in `opencode.jsonc` (deepseek-websearch, mcp-searxng). Keys flow via
`setup.json`'s `env` section → `.envrc` → `{env:VAR}`; `DEEPSEEK_API_KEY`
serves both the deepseek-websearch MCP and Graphify's native `--backend
deepseek`. Full setup guide, backend reference, and troubleshooting:
`.opencode/docs/mcp.md`. Decision record: ADR-0032.
```

- [ ] **Step 3:** Verify — `stale (Gemini-only)` present in SKILL.md; `## MCP Servers` present in AGENTS.md; AGENTS.md points to mcp.md.
- [ ] **Step 4:** Commit:

```bash
git add .opencode/skills/graphify/SKILL.md AGENTS.md
git commit -S -m $'docs(mcp): add routing pointers to mcp.md\n\ngraphify SKILL.md gains a one-line stale-routing breadcrumb after its YAML\nfrontmatter (the vendored backend list is Gemini-only; points readers to the\naccurate 8-backend reference in mcp.md §7). AGENTS.md gains an MCP Servers\nsubsection adjacent to Experimental OpenCode Features. Neither is a content\nrefresh of the stale skill (deferred per ADR-0032).\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Final verification (after all 5 tasks)

- [ ] `bash tests/Shell/migrate_setup_test.sh` — green (no migration step added)
- [ ] `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/ArchTest.php` — passes
- [ ] `/check` — pre-push gate green
- [ ] Manual smoke test (if key available) — uncomment searxng block, set searxng_url, direnv allow, restart opencode, confirm server starts; re-comment after
