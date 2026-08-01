<!-- $KYAULabs: mcp.md kyau@nova 2026/07/20 -0700 Exp $ -->

# MCP Servers

## Overview

MCP (Model Context Protocol) servers provide agents with structured tool access
beyond the built-in shell, file, and LSP operations. In this project, all MCP
servers are optional — `opencode.jsonc` carries permanent disabled definitions
with `enabled: false`. No behavior changes unless a user explicitly opts in via
the Prism manifest and the required prerequisites are met. Enablement is
composed from the resolved project + user manifest into
`OPENCODE_CONFIG_CONTENT` at env0 time (ADR-0045).

## Quota Plugin

The `@slkiser/opencode-quota` package (pinned at 4.0.1) is installed but not
loaded by default. It is toggled via `plugins.opencode_quota` in the user
Prism manifest only — the project manifest always tracks `false`. Opt-in is
controlled by `/setup` and composed into the `OPENCODE_CONFIG_CONTENT` plugin
array; it never touches unrelated plugin entries.

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
(issue #205). The two servers are permanently defined with `enabled: false`;
enablement happens through composed `OPENCODE_CONFIG_CONTENT`, not by editing
`opencode.jsonc`.

## Enabling a Server

Enablement has two layers: **requested** (what you asked for) and **active**
(what actually runs). A server is active only when BOTH conditions hold:

1. The Boolean preference is `true` in the resolved Prism manifest.
2. The matching prerequisite is non-empty in the resolved env (key or URL).

A requested server with a missing prerequisite remains inactive — the
preference signal is `true` but effective enablement stays `false`.

### Option A — Interactive (/setup)

Run `/setup` in the Build tab. After model/variant configuration, `/setup`
asks three one-at-a-time prompts:

- `Enable deepseek-websearch MCP? [y/N]`
- `Enable SearXNG MCP? [y/N]`
- `Enable @slkiser/opencode-quota? [y/N]`

Answers are written to the user Prism manifest
(`~/.config/opencode/prism.jsonc`) as Booleans. `/setup` reports requested
versus active MCP state and reminds you to set prerequisite environment
values if any requested server is missing its key or URL.

### Option B — Direct manifest edit

Edit `~/.config/opencode/prism.jsonc` directly. Set Boolean preferences:

```jsonc
{
  "mcp": {
    "deepseek_websearch": true,
    "searxng": true
  },
  "plugins": {
    "opencode_quota": true
  }
}
```

### Set the prerequisite (key or URL)

In `~/.config/opencode/prism.jsonc`, under the `"env"` section, set the
required key or URL:

```jsonc
{
  "env": {
    "deepseek_api_key": "sk-...",
    "searxng_url": "https://searxng.example.com"
  }
}
```

> ⚠️ **Never paste real keys or URLs into the tracked
> `prism.jsonc`.** A pre-commit hook and CI check
> (`check-setup-secrets.sh`) reject **any** non-empty `env.*` value in the
> committed file. Secrets belong **exclusively** in the user-level
> `~/.config/opencode/prism.jsonc` (ADR-0032, issue #194).

### Activate

Run `direnv allow` in the project root to re-evaluate `.envrc` and export
the new environment variables. Then **restart OpenCode** — MCP server
configuration is read once at startup.

## How Keys Flow

```
~/.config/opencode/prism.jsonc (user-level, real values)
        OR
prism.jsonc (project, empty defaults)
        │  (user-level wins via recursive field-by-field overlay; ADR-0043)
        ▼
.envrc prism_manifest.php env0 block — exports DEEPSEEK_API_KEY / SEARXNG_URL
        │  + exports requested-preference diagnostics and composed
        │    OPENCODE_CONFIG_CONTENT (the nineteen NUL-delimited pairs)
        ▼
opencode.jsonc {env:VAR} resolution at server spawn
        +
OPENCODE_CONFIG_CONTENT overrides MCP enabled leaves and quota membership
```

- The user-level override at `~/.config/opencode/prism.jsonc` takes precedence
  over the checked-in project-level file (ADR-0043 recursive overlay).
- `prism_manifest.php env0` composes `OPENCODE_CONFIG_CONTENT` from the
  resolved manifest, overriding only the two MCP `enabled` leaves and the
  quota plugin entry; all unrelated inline config keys and plugin entries are
  preserved.
- Opencode's `{env:DEEPSEEK_API_KEY}` / `{env:SEARXNG_URL}` syntax resolves
  these exported variables at MCP server spawn time.

## Requested vs. Active

The `OPENCODE_MCP_DEEPSEEK_WEBSEARCH` and `OPENCODE_MCP_SEARXNG` environment
variables reflect your **requested** preference (the Boolean from the
manifest). The actual **active** state is in the composed
`OPENCODE_CONFIG_CONTENT` — a requested `true` with an empty or missing
prerequisite results in `enabled: false` in the inline config. The
`OPENCODE_PLUGIN_OPENCODE_QUOTA` variable reflects quota plugin membership.

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
`~/.zshrc`). They are NOT set in the Prism manifest.

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

- **Server fails to start silently** — Check that the preference is `true`
  and the prerequisite key or URL is set to a non-empty value in
  `~/.config/opencode/prism.jsonc` under the `"env"` section. Run
  `direnv allow` to re-export variables, then restart OpenCode.
- **Requested but not active** — If `/setup` reports a server as requested
  but inactive, the prerequisite (key or URL) is missing or empty. Set it
  under `"env"` in the user manifest, run `direnv allow`, and restart.
- **mcp-searxng returns 403** — The SearXNG instance likely has JSON format
  disabled. Fix: edit `settings.yml` to include `json` in `search.formats`,
  or set `SEARXNG_HTML_FALLBACK=true`.
- **`npx: command not found`** — Install Node.js. The `npx` binary ships with
  npm (bundled with Node.js).
- **Context bloat** — Each MCP server adds tokens to the agent context.
  Prefer enabling one search server at a time unless you need both.

## /doctor

`/doctor` does NOT cover MCP servers — it gates on the required dev-toolchain
(PHP, Node.js, Composer, etc.) only. For MCP health checks, use
`opencode mcp list` to list configured servers and `opencode mcp debug
<name>` to test connectivity and authentication for a specific server.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
