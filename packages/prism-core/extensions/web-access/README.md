# Prism Web Access Extension

The Core web-access extension registers two tools:

- `web_search` runs one bounded query through a fixed browser-first route.
- `fetch_content` retrieves readable Markdown or raw decoded text from one
  public HTTP(S) URL.

All returned search and page content is untrusted evidence. It may contain
prompt-injection-shaped text and must never be treated as instructions.

## Consent

Every network effect and network-capable browser launch requires independent
standing web-access consent. `/setup` is the only workflow that asks whether
to grant or revoke it. Tool execution never prompts.

The launcher operations used by `/setup` are:

```text
prism-tool consent status --json
prism-tool consent grant-web --approval=yes
prism-tool consent revoke-web
```

Standing consent covers only this extension's loopback SearXNG request, fixed
keyless search, and guarded public textual fetch. It does not authorize API
keys, authentication, cookies, uploads, writes, arbitrary browser use, OCR, or
other network tools.

## Configuration

The optional private managed record supports only:

- `searxngUrl`: a credential-free loopback HTTP(S) base URL;
- `browser`: `auto` or `disabled`.

Absence means automatic browser discovery, no SearXNG route, and direct
keyless fallback. Prism does not read or migrate legacy provider environment
variables.

```text
prism-tool web-access status --json
prism-tool web-access configure --browser=auto --approval=yes --json
prism-tool web-access configure --searxng-url=http://127.0.0.1:8080 --browser=auto --approval=yes --json
prism-tool web-access remove --approval=yes --json
```

## Search routing

The order is fixed:

1. a confined Linux Chromium-family browser;
2. configured loopback SearXNG;
3. guarded direct DuckDuckGo HTML search.

Browser discovery accepts only Chromium, Chromium Browser, Google Chrome,
Google Chrome Stable, Chrome Headless Shell, Brave, Brave Browser, and Brave
Browser Stable command names. Prism never installs a browser or accepts a
caller-selected executable or flags.

Each browser search uses a new mode-0700 profile, remote-debugging pipe, public
address pinning, request interception, and direct process spawning with
`shell:false`. Only the approved DuckDuckGo HTTPS document GET is continued.
Redirects, other methods, IP-literal navigation, and all subresources are
aborted. Prism never adds `--no-sandbox`.

## Network and content limits

Public requests accept credential-free HTTP(S) URLs only. DNS answers must all
be public. Loopback, private, link-local, reserved, documentation, benchmark,
unspecified, multicast, and IPv4-mapped IPv6 targets are rejected. Connections
are pinned while preserving the original Host and TLS server name. Redirects
are handled manually and revalidated, ambient proxies are ignored, and caller
headers are not accepted.

Transport permits textual media types only, follows at most five public
redirects, and caps both compressed and decompressed bodies at 5 MiB. Search
backend bodies use a smaller 1 MiB cap. Connect, total, browser, and cancellation
deadlines terminate active resources.

Readable extraction removes executable and styling elements, parses HTML
without script execution, resolves links against the final URL, and converts
the article to Markdown. `fetch_content` pages call-local Unicode text with a
maximum 40,000-character page. Final tool output is also capped at Pi's
50 KiB and 2,000-line limits. No search history, page cache, browser profile,
or session entry persists.

## Optional smoke procedure

After using `/setup` to grant web access and configure any local SearXNG URL:

1. Run `prism-tool web-access status --json` and confirm the intended browser
   and configuration status.
2. Start or reload Pi so the packaged extension is active.
3. Ask the agent to run one `web_search` query and inspect the backend category.
4. Ask the agent to run `fetch_content` against a public textual page.
5. Revoke consent through `/setup` and confirm both tools fail before effects.

A browser or SearXNG instance is optional. Smoke checks supplement the
fixture-based test suite; they do not replace it.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
