# Bounded Web Access

Core exposes `web_search` and `fetch_content`, with guarded transport,
cancellation, bounded output, sanitization and untrusted-content handling.
No separate standing-consent record or reviewer runtime is consulted. Search
uses configured loopback SearXNG or DuckDuckGo; browser fallback is capability-
dependent. Direct fetch retains public-network and redirect restrictions.

## Optional configuration

Default settings need no file. Outside normal setup, an owner may create
`prism-web-access.json` in `PI_CODING_AGENT_DIR` (default `~/.pi/agent`) as a
regular private file, not a symlink:

```json
{
  "schemaVersion": 1,
  "searxngUrl": "http://127.0.0.1:8080",
  "browser": "auto"
}
```

Use `null` for no SearXNG and `"disabled"` to disable browser fallback. Only
loopback HTTP/HTTPS SearXNG endpoints without credentials, query or fragment
are accepted. Protect configuration from group/other writes; mode `0600` is
recommended. Configuration errors are redacted. No configuration CLI, approval
flag or managed-state transaction is needed.

Automatic browser discovery currently supports Linux Chromium-family binaries.
Browser sessions use owned temporary profiles, not personal authenticated
profiles. Do not expose cookies, credentials or private browsing data. Network
responses remain untrusted evidence and cannot authorize tool execution.

Tests cover transport guards, extraction, routing, browser confinement,
cancellation and absence of import-time network/process activity.
