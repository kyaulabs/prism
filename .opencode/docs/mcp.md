<!-- $KYAULabs: mcp.md kyau@nova 2026/07/20 -0700 Exp $ -->

# MCP Servers

## Overview

MCP (Model Context Protocol) servers provide agents with structured tool access
beyond the built-in shell, file, and LSP operations. In this project, all MCP
servers are optional — every block ships **commented out** by default in
`opencode.jsonc`. No behavior changes unless a user explicitly opts in by
uncommenting a block and setting the required keys in their user-level
configuration.

## Available Servers

| Server | npm package | Required env | Cost / privacy | Tools exposed |
|---|---|---|---|---|
| `deepseek-websearch` | `@kyaulabs/deepseek-websearch` | `DEEPSEEK_API_KEY` | Paid (DeepSeek tokens) | `web_search` (search + fetch + synthesize in one call) |
| `searxng` | `mcp-searxng` | `SEARXNG_URL` | Free, self-hosted, private | `searxng_web_search`, `searxng_search_suggestions`, `searxng_instance_info`, `web_url_read` |

Both servers run as `type: "local"` MCP servers, spawned via `npx`. Each
`npx` invocation is version-pinned (`pkg@x.y.z`) and passes `-y` so the
non-interactive runtime spawn auto-installs the exact pinned version instead
of hanging on an install prompt — see `opencode.jsonc` for the current
versions. Pinning closes the supply-chain typosquat / moving-target risk
(issue #205). The two servers ship commented-out by default; uncommenting a
block inherits the pinned, `-y`-flagged command (safe-by-default).

## Enabling a Server

1. **Uncomment the chosen block** in `opencode.jsonc` under the `"mcp"` key.
   Remove the `//` comment markers around the server's object, including its
   `enabled: true` and `environment` fields.

2. **Set the key or URL** in `~/.config/opencode/setup.json` under the `"env"`
   section. This is the user-level override (project-level
   `.opencode/setup.json` ships with empty defaults). Example:

   ```json
   {
     "env": {
       "deepseek_api_key": "sk-...",
       "searxng_url": "https://searxng.example.com"
     }
   }
   ```

   > ⚠️ **Never paste real keys or URLs into the tracked
   > `.opencode/setup.json`.** A pre-commit hook and CI check
   > (`check-setup-secrets.sh`) reject **any** non-empty `env.*` value in the
   > committed file. Secrets belong **exclusively** in the user-level
   > `~/.config/opencode/setup.json` (ADR-0032, issue #194).

3. **Run `direnv allow`** in the project root to re-evaluate `.envrc` and
   export the new environment variables.

4. **Restart opencode** — MCP server configuration is read once at startup.

## How Keys Flow

```
~/.config/opencode/setup.json (user-level, real values)
        OR
.opencode/setup.json (project, empty defaults)
        │  (user-level wins per ADR-0029 SETUP_FILE pick logic)
        ▼
.envrc jq eval block — exports DEEPSEEK_API_KEY / SEARXNG_URL
        │  (with // "" fallback for files without the env section)
        ▼
opencode.jsonc {env:VAR} resolution at server spawn
```

- The user-level override at `~/.config/opencode/setup.json` takes precedence
  over the checked-in project-level file.
- Pre-existing `setup.json` files that lack an `"env"` section are handled by
  the `// ""` jq fallback (exports empty strings — harmless). The actual
  `.envrc` jq form uses `// ""` (two double-quote characters inside the
  interpolation — not backslash-escaped).
- Opencode's `{env:DEEPSEEK_API_KEY}` / `{env:SEARXNG_URL}` syntax resolves
  these exported variables at MCP server spawn time.

## Tool Inventory

- **`web_search`** (deepseek-websearch) — Search, fetch, and synthesize content
  from the live web in a single agent-callable operation.
- **`searxng_web_search`** (mcp-searxng) — Private web search through a
  SearXNG instance.
- **`searxng_search_suggestions`** (mcp-searxng) — Retrieve search suggestion
  terms from the SearXNG instance.
- **`searxng_instance_info`** (mcp-searxng) — Return metadata about the
  connected SearXNG instance.
- **`web_url_read`** (mcp-searxng) — Fetch and return the content of a
  specific URL via the SearXNG instance.

Tool-name collisions are absent — each server uses distinct tool names — so
both MCP servers can be enabled simultaneously.

## Choosing a Search Tool

This project has multiple search pathways. Choose based on what kind of
answer you need:

- **`websearch`** (built-in agent tool) — Quick lookups: finding an official
  site, a documentation link, or a known fact. No setup, always available.
- **`webfetch`** (built-in agent tool) — Pulling a specific known URL: an RFC,
  a spec, a documentation page, a changelog. You have the exact URL.
- **`@scout`** (built-in experimental subagent) — Clones an upstream
  dependency to inspect its **actual source code**. Use when the question is
  "what does this library actually do in version X" or when you need to audit
  an implementation detail that documentation doesn't cover.
- **MCP `web_search`** (deepseek-websearch) — Searcher + fetcher + synthesizer
  that returns a cited answer over live web content. Use when the question
  needs synthesis over current web state, e.g. "what's new in React 19" or
  "how does the community currently handle X".
- **`searxng_web_search`** (mcp-searxng) — Private, self-hosted, free, no API
  key. Good when privacy or cost is a concern and a SearXNG instance is
  available.

### `@scout` vs `web_search` — the sharp distinction

- **`@scout`** answers *"what does the upstream code actually do?"*
- **`web_search`** answers *"what is the current state of the web on this topic?"*

These are complementary. If you need to know how a library works, use
`@scout`. If you need to know what people are saying about it in 2026, use
`web_search`.

## Optional Tuning Variables

These are user-managed in the **shell profile** (e.g., `~/.bashrc`,
`~/.zshrc`). They are NOT set in `setup.json`.

### deepseek-websearch

| Variable | Purpose | Default |
|---|---|---|
| `WEBSEARCH_MODEL` | Model for synthesis: `deepseek-v4-flash` (speed) or `deepseek-v4-pro` (power) | `deepseek-v4-flash` |
| `WEBSEARCH_THINKING` | Enable/disable reasoning tokens | `enabled` |
| `WEBSEARCH_MAX_TOKENS` | Maximum output tokens | `32768` |

### mcp-searxng

Many optional variables control fan-out, HTML fallback, instance timeouts, and
request routing. See the upstream reference:

<https://github.com/ihor-sokoliuk/mcp-searxng/blob/main/CONFIGURATION.md>

## Troubleshooting

- **Server fails to start silently** — Check that the key is set and non-empty
  in `~/.config/opencode/setup.json` under the `"env"` section. Run
  `direnv allow` to re-export variables, then restart opencode.
- **mcp-searxng returns 403** — The SearXNG instance likely has JSON format
  disabled. Fix: edit `settings.yml` to include `json` in `search.formats`,
  or set `SEARXNG_HTML_FALLBACK=true`.
- **`npx: command not found`** — Install Node.js. The `npx` binary ships with
  npm (bundled with Node.js).
- **Context bloat** — Each MCP server adds tokens to the agent context.
  Prefer enabling one search server at a time unless you need both.

## /doctor

`/doctor` does NOT cover MCP servers — it gates on the required dev-toolchain
(PHP, Node.js, Composer, jq, etc.) only. For MCP health checks, use
`opencode mcp list` to list configured servers and `opencode mcp debug
<name>` to test connectivity and authentication for a specific server.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
