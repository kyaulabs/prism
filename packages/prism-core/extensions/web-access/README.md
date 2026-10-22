# Bounded Web Access

Core exposes `web_search` and `fetch_content`, with guarded transport,
cancellation, bounded output, sanitization and untrusted-content handling.
No separate standing-consent record or reviewer runtime is consulted. Search
tries an isolated browser first when available, then configured loopback
SearXNG, then direct DuckDuckGo. Direct fetch retains public-network, DNS-pinning
and redirect restrictions. Pi's native MCP support is not itself a public-web
search backend.

## Structured values (Pi 1.4)

Both tools retain direct exposure and readable untrusted-evidence output.
TypeBox parameter/output schemas use the host's `typebox` peer. Successful
results include `structuredContent`, which native Codemode receives instead of
human-formatted text. `details` holds UI metadata, not the script return value.
Both tools have `readOnlyHint: true` and `openWorldHint: true`; they do not invoke
other Pi tools or replace native discovery.

| Tool | Structured contract |
| --- | --- |
| `web_search` | `{ backend: "browser" \| "searxng" \| "direct", results: [{ title, url, snippet }], resultCount, truncated }` |
| `fetch_content` | `{ finalUrl, status, contentType, title?, text, offset, nextOffset?, truncated }` |

Search returns at most the requested limit (default 5, maximum 10). Titles are
at most 256 Unicode characters, snippets 2000, and URLs 8192. Overlong URLs are
omitted, not clipped into different URLs. `resultCount` is the returned record
count. `truncated` indicates dropped/shortened output, not a backend's estimate
of all possible search results.

Fetch returns at most 40,000 source characters per page (default 20,000). Titles
are capped at 512 characters and content types at 256. Control characters are
removed in both representations; metadata and search whitespace are normalized.
Readable content and serialized structured data are **each** bounded to 50 KiB;
readable output also stays within 2000 lines. No hidden HTML, transport
configuration, diagnostics, or unbounded second copy is returned. Raw mode is
explicit decoded textual content, not hidden readable-mode HTML.

Fetch offsets count Unicode characters in the extracted/raw source *before*
control-character removal. `nextOffset` advances only past the source prefix
actually returned, including when the byte/line budget shortens a page. Re-fetch
with that offset and the same URL/mode; changing pages upstream can of course
change the source. Oversized/invalid metadata fails rather than overflowing.

```js
const page = await tools.fetch_content({url: "https://example.com/", mode: "raw"});
text(page.text);
if (page.nextOffset !== undefined) text({nextOffset: page.nextOffset});
```

Transport/security failures remain sanitized **thrown errors**, not structured
error unions. Native Codemode rejects these calls; use `Promise.allSettled()` to
keep successful siblings. A successful schema-backed result is not a guarantee
that the retrieved evidence is safe or correct.

Native script aborts/deadlines cancel pending HTTP requests and browser work,
close CDP pipes and remove owned profiles. Cancellation is terminal, including
when it races a fallback-eligible failure: it must not start another backend.
Independent calls do not share request/profile state. Pi owns worker queuing,
parallel scheduling, and deadlines; Prism adds no dispatcher or worker limit.

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
