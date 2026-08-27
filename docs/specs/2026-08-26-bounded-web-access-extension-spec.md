# Spec: Bounded Core web-access extension

**Date:** 2026-08-26
**Status:** Draft

## Problem Statement

Prism Core exposes web research through two legacy CLI-shell skills. One sends queries to the DeepSeek search API and requires a provider credential. The other shells out to a configured SearXNG endpoint whose location and policy are controlled through environment variables. Both require the agent to resolve and invoke shell scripts rather than using Pi-native tools.

This surface conflicts with Prism's current direction. It retains a keyed search dependency, splits one capability across two skills, leaves content fetching outside a stable tool contract, and cannot safely add optional browser-assisted search without more shell orchestration. Live setup, doctor, research, documentation, attribution, and test surfaces still describe these integrations.

Prism needs a Core-owned replacement that works without API keys, supports a loopback SearXNG instance, can prefer an installed headless browser on Linux, fetches public textual content, and enforces explicit consent and network boundaries before external effects occur.

## Solution

Add a separate, globally loaded `web-access extension` to Prism Core. It registers two always-active Pi tools:

- `web_search` performs one keyless search and returns normalized source results.
- `fetch_content` retrieves one public HTTP(S) resource and returns bounded readable Markdown or bounded raw text.

Search routing is automatic and browser-first. On Linux, the extension first attempts fixed-origin DuckDuckGo HTML search through an allowlisted system Chromium-family executable. A fallback-eligible browser failure moves to a configured loopback SearXNG JSON endpoint. A fallback-eligible SearXNG failure moves to direct DuckDuckGo HTML search through Prism's guarded HTTP client. Invalid input, invalid configuration, caller cancellation, and security-policy failures stop immediately instead of falling through.

Content fetching never uses the browser. It uses a DNS-pinned HTTP(S) client that rejects private and reserved destinations, revalidates every redirect, ignores ambient proxies, accepts textual media only, and enforces time, redirect, decompression, response-size, line, and byte limits.

Every network-capable path requires `standing web-access consent`. `/setup` is the only workflow that grants or revokes this global capability. The grant covers only the extension's exact read-only operations and does not transfer to other tools, providers, credentials, mutations, or network effects.

The legacy DeepSeek and CLI SearXNG skills, their shared shell helper, and their shell test suite are removed. Live research, setup, doctor, instruction, package, and attribution surfaces are rewritten for the extension. Historical changelog entries and ADR content remain as history, apart from the permitted status transition for the superseded sole-extension decision.

## User Stories

1. As a Prism user, I want web search without an API key, so that research works without a paid or credentialed provider.
2. As a Linux user with a supported Chromium-family browser, including Brave, installed, I want Prism to use a disposable headless browser first, so that keyless search can use a browser-capable path without Playwright or Puppeteer.
3. As a user without a supported browser, I want search to fall back automatically, so that browser availability is optional.
4. As a user running local SearXNG, I want Prism to use only my loopback endpoint as the second search route, so that no arbitrary private service is reachable through configuration.
5. As a user without local SearXNG, I want direct keyless HTML search to remain available, so that the extension has a no-key final route.
6. As a researcher, I want search results normalized to titles, URLs, and snippets, so that I can compare sources without provider-specific output.
7. As a researcher, I want recency and domain filters, so that I can narrow a search without provider selection or query batches.
8. As a researcher, I want to fetch a public page as readable Markdown, so that I can inspect source material through a bounded Pi tool.
9. As a researcher, I want raw mode for textual responses, so that JSON, XML, plain text, and similar resources can be inspected without HTML extraction.
10. As a researcher, I want paged content output, so that large pages do not flood the model context or require persistent content caches.
11. As a security-conscious user, I want private, loopback, link-local, reserved, multicast, and mixed-address public fetch targets rejected, so that a supplied URL cannot become SSRF.
12. As a security-conscious user, I want redirect destinations revalidated and DNS connections pinned, so that redirects and rebinding cannot escape the public-network policy.
13. As a security-conscious user, I want browser runs isolated from existing profiles, cookies, extensions, downloads, and password stores, so that web search cannot access browser credentials.
14. As a user, I want browser and HTTP processes to stop on cancellation or timeout, so that an interrupted tool call leaves no orphaned work.
15. As a Prism operator, I want a separate standing consent for web access, so that I can authorize this bounded global capability without broadening OCR or setup-network consent.
16. As a Prism operator, I want web consent to be independently revocable, so that removing it does not revoke standing OCR consent.
17. As a Prism operator with an existing OCR consent record, I want that record to remain valid after upgrade, so that the schema migration does not silently revoke OCR.
18. As a Prism operator, I want a small managed configuration for local SearXNG and browser opt-out, so that no environment secrets or broad provider configuration are needed.
19. As a Prism maintainer, I want the extension split into narrow modules with injectable system boundaries, so that DNS, HTTP, browser, consent, configuration, extraction, and routing behavior can be tested without live network access.
20. As a Prism maintainer, I want the old search skills and tests removed, so that there is one live web-access contract rather than parallel legacy paths.
21. As a Prism maintainer, I want package and NOTICE metadata to cover the new modules and dependencies, so that installed tarballs and attribution remain complete.
22. As a Prism maintainer, I want fetched material labeled and handled as untrusted evidence, so that page text cannot become an instruction source.

## Implementation Decisions

### Architecture and records

ADR-0091 records the bounded Core web-access extension under standing consent. It supersedes ADR-0056 while retaining the safety extension's existing fail-closed responsibilities. Prism Core's accepted extension set becomes the safety extension and the web-access extension. Neither is an orchestration extension, so ADR-0055's single-agent and zero-orchestration philosophy remains intact. This does not create another permanent numeric cap: a future extension requires its own architecture decision and must justify a Pi runtime boundary.

ADR-0091 also replaces ADR-0059's live MCP-to-CLI search-skill decision, extends ADR-0060's global Core package model, and updates the conflicting extension-count and OCR-only consent assumptions in ADR-0074. ADR-0083's invocation-scoped setup-network authorization remains separate and continues to exclude web search.

`CONTEXT.md` gains the terms `web-access extension` and `standing web-access consent`. Its Core ownership, consent boundary, system boundary, invariant, non-goal, and architectural-decision sections describe two non-orchestration Core extensions and the exact web consent scope.

### Public tool contract

`web_search` accepts:

- one non-empty query;
- an optional result limit from one through ten;
- optional recency of day, week, month, or year; and
- an optional bounded domain list in which plain hostnames include and a leading minus sign excludes.

The tool does not accept provider names, API credentials, custom endpoints, arbitrary headers, query batches, answer-synthesis options, content-fetch fan-out, or persistent state controls. It returns the backend category and normalized results containing only title, public HTTP(S) URL, and snippet. Domain rules are enforced locally against normalized result hosts even when encoded into a backend query.

`fetch_content` accepts:

- one public HTTP(S) URL;
- optional mode `readable` or `raw`, defaulting to readable;
- an optional non-negative character offset; and
- an optional character limit capped below Pi's tool-output ceiling.

It returns the final validated URL, HTTP status, textual content type, title when available, bounded content, truncation state, and the next offset when more extracted text is available. It does not accept local paths, URL batches, credentials, cookies, headers, provider selection, remote extraction, media options, answer prompts, or cache identifiers.

Both tools pass Pi's abort signal through every asynchronous boundary, use stable sanitized failures, and keep external data out of error messages. Search and fetched content are explicitly described as untrusted evidence in their tool guidance.

### Search routing

The routing order is fixed:

1. a Linux-only disposable Chromium-family browser against the fixed DuckDuckGo HTML origin;
2. a configured loopback SearXNG JSON endpoint; and
3. direct DuckDuckGo HTML retrieval through the guarded HTTP client.

Browser discovery is lazy, uses Core-owned executable resolution, and is limited to an allowlist covering Chromium, Google Chrome, Chrome Headless Shell, and Brave command names. Brave detection includes `brave`, `brave-browser`, and `brave-browser-stable`. The resolved executable may be cached for the Pi session, but a runtime failure invalidates the cache. Prism never downloads a browser, resolves one from a consumer dependency tree, or accepts a caller-selected executable or flags.

Missing browser capability, unsupported headless mode, spawn failure, timeout, non-zero exit, network failure, block or captcha response, and unparseable search HTML permit fallback. SearXNG network, transient, and invalid-response failures permit direct-search fallback. Invalid input, malformed or unsafe configuration, caller cancellation, and security-policy rejection are terminal. When every eligible backend fails, the tool reports a sanitized aggregate error containing backend categories only.

Recency and domain filters are translated into the fixed backend request forms where supported and are always reinforced by local result filtering. Results with invalid, non-HTTP(S), or policy-disallowed URLs are discarded.

### Browser boundary

The browser runs only on Linux and only for the fixed search origin. Prism spawns the absolute allowlisted executable directly with an argument array and shell execution disabled. It never uses `--no-sandbox`.

Each invocation receives a new private temporary user-data directory. Headless and incognito operation disables extensions, sync, background services, default-browser integration, downloads, and existing profile state. The process receives no caller-controlled flags, browser profile, cookies, custom headers, file URL, or credential material. Output and duration are bounded. Cancellation, timeout, and completion terminate the process tree and remove ownership-proven temporary state in `finally` cleanup.

Before launch, Prism validates a public address for the approved search hostname and pins that hostname to the validated address for the browser process. Chrome DevTools Protocol request interception, or a proven equivalent, rejects every navigation, redirect, method, and subresource request outside the approved origin and request set. If address pinning, origin confinement, sandboxed execution, or cleanup cannot be established, the browser route is unavailable and search continues to the next backend.

Arbitrary browser navigation and browser-backed `fetch_content` are excluded because unconstrained Chromium DNS and subresource behavior does not satisfy the approved public-address pinning invariant.

### SearXNG boundary

The optional SearXNG base URL must be credential-free and resolve only to `localhost`, an address in `127.0.0.0/8`, or `::1`. HTTP is allowed only on loopback. HTTPS remains loopback-only. Userinfo, fragments, custom headers, redirects, non-HTTP(S) schemes, arbitrary private hosts, and mixed DNS results are rejected.

Prism constructs only the fixed JSON search request from validated tool values. It caps response bytes and result count, validates the response shape, accepts only HTTP(S) result URLs, and treats every field as untrusted.

### Public HTTP(S) boundary

Before connecting, Prism normalizes the hostname and resolves all addresses. Literal or resolved loopback, private, link-local, reserved, documentation, benchmark, unspecified, and multicast ranges are rejected for IPv4 and IPv6. A hostname with any non-public answer is rejected rather than selecting only a public answer.

The validated address is pinned into the HTTP(S) connection while preserving the original hostname for Host and TLS SNI. Redirects are handled manually, capped at five, and passed through the full validation and pinning sequence on every hop. Request metadata is not carried across origins. Ambient proxy variables are ignored, and caller-supplied proxies, headers, cookies, or credentials are unsupported.

The client enforces connect and total deadlines, bounded decompression, a five-mebibyte streamed response cap, and a textual media-type allowlist. Unsupported media, oversized compressed or decompressed bodies, malformed encodings, incomplete responses, and unsafe redirects fail closed. Raw mode remains textual.

### Content extraction and output

HTML is parsed in-process without script execution. Readable mode uses Mozilla Readability semantics and converts the extracted document to Markdown. Raw mode returns decoded textual response content without HTML rendering. External HTML is never rendered in Pi's UI.

Extracted content is sliced in memory by character offset and limit. The extension does not persist page bodies, search history, caches, browser profiles, or session entries. Final output also passes Pi's standard line and byte truncation helpers so metadata and content remain inside the tool-result contract.

### Consent and managed state

The global consent record advances from schema version one to schema version two with independent `ocr` and `webAccess` booleans. Safe version-one records are read as OCR consent granted and web consent absent. Granting or revoking either capability preserves the other; when neither remains granted, Prism removes the ownership-proven record.

`/setup` is the only workflow that asks to grant or revoke standing web-access consent. The launcher exposes narrow grant, revoke, and status operations. Global installation and local-only doctor checks never grant consent. Full doctor reports web consent and local capability readiness without requiring a live public search.

The extension validates consent immediately before any SearXNG request, public request, or network-capable browser process. Missing or unsafe consent returns a readiness error directing the user to `/setup`. Tool execution never prompts, so TUI, RPC, JSON, and print modes behave consistently.

Standing web-access consent authorizes only loopback SearXNG search, fixed-origin keyless search, and guarded public textual fetching through this extension. It does not authorize API-key providers, authentication, cookies, arbitrary browser use, uploads, writes, form submissions, package access, Git or GitHub activity, OCR, reviewed-code egress, other tools, or repository mutation.

The web-access configuration is a separate private, user-owned, non-symlink global record with a closed schema. It contains an optional loopback SearXNG URL and an optional browser mode of `auto` or `disabled`. Absence is valid and means browser auto-detection plus direct keyless fallback, with no SearXNG route. `/setup` uses a narrow launcher operation to preview, apply, or remove this configuration.

Prism does not read or migrate legacy DeepSeek or SearXNG environment variables. Migration guidance directs users to `/setup` and the new managed configuration without printing old values.

### Dependencies and provenance

Use Node's HTTP, HTTPS, DNS, URL, compression, process, and filesystem primitives for guarded transport and browser execution. Add only the focused runtime packages needed for readable HTML extraction and Markdown conversion: `linkedom`, `@mozilla/readability`, and `turndown`. Lock and audit all additions.

The implementation is independently written. `pi-web-access` remains a design and test-seam reference, not a runtime or source dependency. The architecture record and NOTICE credit the upstream project. Any later copied or substantially adapted code must retain its MIT notice and identify the affected files.

### Legacy removal and live documentation

Remove both legacy search skills, their shell entry points, the shared search helper used only by them, and the legacy shell test suite after equivalent extension tests exist. Remove DeepSeek search key handling, legacy SearXNG environment handling, cross-skill fallback prose, and model-agnostic exemptions that existed only for the old search backend.

Rewrite live research, background research, Wayfinder, writing-plan, setup, doctor, Core instruction, harness, package README, research guide, safety-extension, Pi-docs, writing-skills, NOTICE, and package-contract surfaces for the native tools and two-extension rule. Preserve generated changelog history, frozen OpenCode-era ADRs, and unrelated DeepSeek model or OCR fixtures.

## Testing Decisions

The main acceptance seam is the registered Pi tool boundary. Tests fixture the extension API, capture the registered tool definitions, execute them with injected boundaries, and assert public output, progress, cancellation, and error behavior. No live network service or installed browser is required for the deterministic suite.

The managed-state seam is the public launcher command boundary. Tests use isolated homes or injected paths and assert schema-one compatibility, independent grants and revocations, atomic private writes, unsafe-state refusal, configuration validation, preview/application behavior, and status output.

Focused module tests cover behavior that cannot be diagnosed well only through full tool calls:

- DNS classification, mixed answers, hostname normalization, connection pinning, TLS hostname preservation, redirect revalidation, proxy exclusion, decompression bounds, textual media types, timeouts, and cancellation;
- loopback-only SearXNG configuration, request construction, no redirects, malformed JSON, result normalization, recency, domain filtering, and response bounds;
- browser discovery allowlists, Linux gating, direct spawn arguments, temporary-profile permissions, profile isolation, cleanup, cancellation, timeout, block-page detection, parser failure, and fallback classification;
- browser-first routing, SearXNG fallback, direct fallback, terminal failures, aggregate sanitized errors, and browser-cache invalidation;
- readable extraction, raw text, title handling, offset paging, output truncation, unsupported content, and prompt-injection-shaped fixtures treated as inert content; and
- closed configuration schemas, symlink/ownership/permission failures, consent checks immediately before effects, and no environment-variable fallback.

Package tests assert that the extension, its README, and runtime dependencies ship in the Core tarball. TypeScript compilation covers the new modules. The deleted shell-search suite is replaced by Node tests. Existing consent, setup, doctor, installer, model-agnostic, documentation, safety lifecycle, package lock, and tarball tests are updated rather than bypassed.

An optional Linux smoke procedure may run against a human-installed Chromium and a local SearXNG instance after standing consent is granted. Smoke results do not replace deterministic tests and do not make a browser or SearXNG mandatory for installation.

## Acceptance Criteria

1. Core loads both the unchanged safety extension and the new web-access extension, with no orchestration extension added.
2. `web_search` and `fetch_content` are registered with the approved bounded schemas and untrusted-content guidance.
3. Every network or network-capable browser effect fails before execution when standing web-access consent is absent or unsafe.
4. Existing safe OCR consent records remain valid after the consent schema upgrade, and web consent can be granted or revoked without changing OCR consent.
5. `/setup` is the sole consent grant/revocation workflow and can manage the closed web-access configuration through a narrow launcher operation.
6. Browser-first search works through deterministic fixtures and falls back only for the approved browser failure classes.
7. A configured loopback SearXNG route is second, follows no redirects, and cannot be configured for arbitrary private or public hosts.
8. Direct DuckDuckGo HTML search is the final route and uses the guarded pinned transport.
9. Invalid input, invalid configuration, cancellation, and security-policy failures never trigger backend fallback.
10. `fetch_content` rejects private and reserved targets, mixed DNS answers, unsafe redirects, credentials, proxies, unsupported media, oversized responses, and arbitrary browser navigation.
11. Readable mode returns bounded Markdown, raw mode returns bounded textual content, and offset paging exposes further extracted text without persistent page storage.
12. Browser execution never reuses a profile, reads cookies or password stores, accepts arbitrary flags, uses a shell, adds `--no-sandbox`, leaves temporary state, or survives cancellation and timeout.
13. Search and page output cannot inject raw HTML into Pi UI, and errors do not reflect page bodies, local paths, commands, environment data, or control characters.
14. No API-key provider, authenticated path, hosted extraction service, model synthesis, media/PDF/OCR path, curator, cache, cloning, or custom provider surface is introduced.
15. The legacy search skills, shell scripts, shared helper, environment configuration, tests, live documentation, and NOTICE entries are removed or replaced as specified.
16. ADR-0091 and `CONTEXT.md` describe the two-extension architecture, standing web consent, network boundary, and retained zero-orchestration invariant.
17. New runtime dependencies are locked, audited, packaged, documented, and attributed.
18. The relevant Node, shell, TypeScript, package, lint, and full project checks pass.

## Out of Scope

- API-key or subscription search providers.
- Reusing Pi model/provider authentication.
- Hosted MCP search, hosted extraction, or arbitrary provider proxies.
- Authentication, cookies, browser-profile access, custom headers, or credential-bearing SearXNG instances.
- Arbitrary browser navigation or browser-backed content fetching.
- Provider selection, provider arrays, search fan-out, or query batches.
- Query rewriting, source checking, answer synthesis, page-grounded answers, or model-generated summaries.
- Persistent search history, result caches, content stores, session entries, curator UI, commands, shortcuts, or custom widgets.
- Local files, GitHub cloning or specialized GitHub rendering, images, video, YouTube, PDFs, OCR, archives, downloads, uploads, or form submission.
- Browser installation, Playwright, Puppeteer, or mandatory browser readiness.
- Remote or non-loopback SearXNG endpoints.
- Ambient or credentialed proxy support.
- Rewriting historical changelog entries, frozen OpenCode-era ADRs, or unrelated DeepSeek model and OCR fixtures.

## Further Notes

The design is modeled on the keyless/local subset of Nico Bailon's `pi-web-access`, reviewed as untrusted reference material. Prism deliberately keeps a smaller interface and a stricter trust boundary.

A throwaway Linux integration prototype using Brave Browser 151 confirmed that Chromium's remote-debugging pipe can intercept requests, allow one approved document request, block a cross-origin subresource, extract the resulting DOM, and use a disposable profile without `--no-sandbox`. The prototype was deleted after this result was captured.

The completed Wayfinder map and child decisions are recorded in GitHub issue #429. The next architecture gate should verify ADR-0091 coverage and return the required `ADR-required:` line before ticketing or implementation planning.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
