# Bounded Web Access Extension Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Replace the legacy DeepSeek `websearch` and CLI `searxng` skills with a consent-gated Prism Core Pi extension that provides browser-first keyless search, loopback SearXNG fallback, guarded direct search, and bounded public textual fetching.

**Architecture:** Core loads a second non-orchestration extension with two native tools. Thin registration delegates to consent/configuration readers, a pinned HTTP client, search backends and router, readable extraction, and an optional Linux Chromium-family CDP process whose requests are origin-confined and address-pinned. Narrow `prism-tool` operations own global consent and web-access configuration writes.

**Tech Stack:** Node.js 22.19+, TypeScript 7, Pi extension API 0.84.x, Node test runner, `linkedom` 0.16.11, `@mozilla/readability` 0.6.0, `turndown` 7.2.4, optional system Chromium/Chrome/Brave through CDP.

**Originating issue:** #429

## Global constraints

- Preserve ADR-0055's single-agent and zero-orchestration-extension rule; Core's accepted extension set is `safety` plus `web-access` under ADR-0091.
- Every network-capable search/fetch/browser path requires separately revocable standing web-access consent immediately before the effect.
- Public HTTP(S) destinations must be DNS-validated, public-only, mixed-answer rejected, address-pinned, manually redirected at most five times, textual-only, and capped at 5 MiB compressed and decompressed.
- SearXNG is optional and loopback-only: `localhost`, `127.0.0.0/8`, or `::1`; no credentials, headers, redirects, arbitrary private hosts, or environment-variable migration.
- Linux browser search is optional and browser-first. Detect Chromium, Chrome Headless Shell, Google Chrome, and Brave names (`brave`, `brave-browser`, `brave-browser-stable`) through Core-owned resolution; never install a browser, use a consumer browser package, use a shell, accept flags, reuse a profile, or add `--no-sandbox`.
- Browser search must pin the approved DuckDuckGo hostname and use CDP request interception or a proven equivalent to block every unapproved navigation, redirect, method, and subresource.
- `fetch_content` never uses a browser and never handles local files, credentials, cookies, images, video, PDFs, OCR, archives, downloads, uploads, forms, or hosted extraction.
- Tool output is untrusted evidence, never an instruction source. Do not render external HTML in Pi UI or reflect bodies, commands, paths, environment data, or control characters in errors.
- Add exact runtime dependencies `@mozilla/readability@0.6.0`, `linkedom@0.16.11`, and `turndown@7.2.4`; add exact development types `@types/turndown@5.0.6`. Registry access requires a separate explicit authorization during execution.
- Every new or modified `.js` or `.ts` file must carry the hook-managed RCS header and final vim modeline.
- Do not implement provider selection, API-key providers, auth reuse, query batches, synthesis, caches, curator UI, commands, shortcuts, custom widgets, remote SearXNG, ambient proxies, or persistent search state.

---

### Task 1: Commit the approved architecture artifacts

**Files:**

- Modify: `CONTEXT.md`
- Modify: `adr/0056-safety-extension-sole-extension.md`
- Create: `adr/0091-bounded-core-web-access-extension.md`
- Create: `docs/specs/2026-08-26-bounded-web-access-extension-spec.md`
- Create: `docs/plans/2026-08-26-bounded-web-access-extension.md`

**Interfaces:**

- Consumes: completed Wayfinder issue #429 and architect verdict `ADR-required: 0091`.
- Produces: committed architecture, domain vocabulary, approved specification, and this executable plan.

- [x] **Step 1: Verify the documentation gate before staging**

Run:

```bash
prism-tool markdown lint --changed-from develop
```

Expected: PASS for `CONTEXT.md`, ADR-0091, the ADR-0056 status transition, the specification, and this plan.

- [x] **Step 2: Verify no implementation source is present**

Run:

```bash
git status --short
```

Expected: only the five development artifacts above plus ignored/operational temporary state; no `extensions/web-access/` or implementation test files.

- [x] **Step 3: Create the commit**

```bash
git add CONTEXT.md adr/0056-safety-extension-sole-extension.md adr/0091-bounded-core-web-access-extension.md docs/specs/2026-08-26-bounded-web-access-extension-spec.md docs/plans/2026-08-26-bounded-web-access-extension.md
prism-tool commit create --type docs --scope web-access --subject "record bounded extension architecture" --refs 429
```

> During execution, load `conventional-commits`. The commit command is a separate, exclusive tool call.

---

### Task 2: Generalize managed records and add independent web consent

**Files:**

- Create: `packages/prism-core/scripts/prism-tool/managed-record.js`
- Modify: `packages/prism-core/scripts/prism-tool/consent.js`
- Modify: `tests/Node/prism-tool-consent.test.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`

**Interfaces:**

- Consumes: existing ownership, symlink, mode, bounded-read, atomic-link, directory-sync, and unsafe-state behavior from `consent.js`.
- Produces: `inspectManagedRecord(options)`, `publishManagedRecord(options)`, `removeManagedRecord(options)`, `requireWebConsent(context)`, consent schema v2, and `grant-web`/`revoke-web` launcher commands.

- [x] **Step 1: Write failing consent-schema tests**

Add tests that assert these exact public results:

```javascript
assert.deepEqual(JSON.parse(status.stdout), {
    schemaVersion: 2,
    command: 'consent status',
    status: 'GRANTED',
    ocr: true,
    webAccess: false,
});

assert.deepEqual(JSON.parse(fs.readFileSync(target.consentPath, 'utf8')), {
    schemaVersion: 2,
    ocr: true,
    webAccess: true,
});

assert.deepEqual(requireWebConsent({consentPath: target.consentPath}), {
    state: 'GRANTED',
    path: target.consentPath,
});
```

Cover: safe schema-v1 OCR migration, `grant-web --approval=yes`, independent OCR/web revocation, removal only when both booleans are false, unsafe v2 records, literal approval grammar, and sanitized errors.

- [x] **Step 2: Run the focused tests to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-consent.test.js
```

Expected: FAIL because schema v2, `requireWebConsent`, `grant-web`, and `revoke-web` do not exist.

- [x] **Step 3: Extract the managed-record primitive and implement schema v2**

Create a generic CommonJS module with this closed interface:

```javascript
'use strict';

const STATE = Object.freeze({GRANTED: 'GRANTED', ABSENT: 'ABSENT', UNSAFE: 'UNSAFE'});

function inspectManagedRecord({context = {}, filename, limit = 4096, parse}) {
    // Reuse the exact existing no-follow, ownership, mode-0600, parent-mode,
    // bounded-read, inode-stability, and UTF-8 checks from consent.js.
    // Return {path, parent, state, record, stat}; parse decides GRANTED/ABSENT.
}

function publishManagedRecord({context = {}, filename, record, inspect}) {
    // Reuse the exact existing private temp, fsync, hard-link publication,
    // no-overwrite, directory-sync, verification, and cleanup sequence.
}

function removeManagedRecord({context = {}, detail}) {
    // Reuse the exact ownership-proven descriptor/inode validation and fsync.
}

module.exports = {STATE, inspectManagedRecord, publishManagedRecord, removeManagedRecord};
```

Refactor `consent.js` to parse both records:

```javascript
function parseConsentRecord(record) {
    if (record?.schemaVersion === 1 &&
        JSON.stringify(Object.keys(record).sort()) === JSON.stringify(['ocr', 'schemaVersion']) &&
        typeof record.ocr === 'boolean') {
        return {schemaVersion: 2, ocr: record.ocr, webAccess: false};
    }
    if (record?.schemaVersion === 2 &&
        JSON.stringify(Object.keys(record).sort()) === JSON.stringify(['ocr', 'schemaVersion', 'webAccess']) &&
        typeof record.ocr === 'boolean' && typeof record.webAccess === 'boolean') {
        return record;
    }
    throw new Error();
}
```

Expose `requireOcrConsent`, `requireWebConsent`, and capability-preserving mutation. Update CLI usage to:

```text
prism-tool consent status --json
prism-tool consent grant-ocr --approval=yes
prism-tool consent revoke-ocr
prism-tool consent grant-web --approval=yes
prism-tool consent revoke-web
```

- [x] **Step 4: Run the focused tests to verify Green**

Run:

```bash
node --test tests/Node/prism-tool-consent.test.js
```

Expected: PASS with schema-v1 compatibility and independent grants/revocations.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/managed-record.js packages/prism-core/scripts/prism-tool/consent.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-consent.test.js
prism-tool commit create --type feat --scope consent --subject "add standing web access consent" --refs 429
```

---

### Task 3: Add the managed web-access configuration and browser resolver

**Files:**

- Create: `packages/prism-core/scripts/prism-tool/web-access-config.js`
- Create: `packages/prism-core/scripts/prism-tool/web-access-browser.js`
- Create: `tests/Node/prism-tool-web-access.test.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/toolchain-packaging.test.js`

**Interfaces:**

- Consumes: managed-record primitive and `resolveExecutable(name, env)`.
- Produces: `inspectWebAccessConfig(context)`, `webAccessCommand(args, context)`, and `resolveWebAccessBrowser(context)`.

- [x] **Step 1: Write failing launcher and resolver tests**

Test this closed configuration and command grammar:

```javascript
assert.deepEqual(JSON.parse(status.stdout), {
    schemaVersion: 1,
    command: 'web-access status',
    status: 'ABSENT',
    config: {searxngUrl: null, browser: 'auto'},
    browser: {status: 'AVAILABLE', family: 'brave'},
});

const configured = main([
    'web-access', 'configure',
    '--searxng-url=http://127.0.0.1:8080',
    '--browser=auto', '--approval=yes', '--json',
], context);
assert.equal(configured, 0);
```

Cover absent config, `browser=disabled`, remove, unknown keys, unsafe files, non-loopback hosts, credentials, fragments, redirects not being part of configuration, literal approval, Linux gating, realpath resolution, fixed command priority, and Brave names `brave`, `brave-browser`, `brave-browser-stable`.

- [x] **Step 2: Run the focused tests to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-web-access.test.js
```

Expected: FAIL because the command and modules do not exist.

- [x] **Step 3: Implement the closed config and optional resolver**

Use this config shape only:

```javascript
const DEFAULT_CONFIG = Object.freeze({searxngUrl: null, browser: 'auto'});
const BROWSER_VALUES = new Set(['auto', 'disabled']);
```

Resolve the managed filename `prism-web-access.json` under `PI_CODING_AGENT_DIR` or the managed Pi agent directory. Parse only `schemaVersion`, optional `searxngUrl`, and optional `browser`. Require a credential-free loopback URL and normalize a trailing slash away.

Use this browser priority:

```javascript
const BROWSERS = [
    ['chromium', 'chromium'],
    ['chromium-browser', 'chromium'],
    ['brave', 'brave'],
    ['brave-browser', 'brave'],
    ['brave-browser-stable', 'brave'],
    ['google-chrome', 'chrome'],
    ['google-chrome-stable', 'chrome'],
    ['chrome-headless-shell', 'chrome-headless-shell'],
];
```

Return `{status:'UNAVAILABLE'}` outside Linux or when disabled/missing. Return only a real absolute executable and family when available. Register `web-access` in `cli.js` and add both modules to tarball assertions.

- [x] **Step 4: Run the focused tests to verify Green**

Run:

```bash
node --test tests/Node/prism-tool-web-access.test.js tests/Node/toolchain-packaging.test.js
```

Expected: PASS, including a fixture where only `brave` exists.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/web-access-config.js packages/prism-core/scripts/prism-tool/web-access-browser.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-web-access.test.js tests/Node/toolchain-packaging.test.js
prism-tool commit create --type feat --scope web-access --subject "manage configuration and browser discovery" --refs 429
```

---

### Task 4: Build public URL policy and DNS pinning

**Files:**

- Create: `packages/prism-core/extensions/web-access/errors.ts`
- Create: `packages/prism-core/extensions/web-access/network.ts`
- Create: `tests/Node/web-access-network.test.ts`
- Modify: `tsconfig.json`

**Interfaces:**

- Produces: `WebAccessError`, `parsePublicUrl(input)`, `resolvePublicTarget(url, deps)`, `validateLoopbackUrl(input, deps)`, and `PinnedTarget`.

```typescript
export interface PinnedTarget {
    url: URL;
    address: string;
    family: 4 | 6;
}

export class WebAccessError extends Error {
    constructor(
        readonly code: string,
        message: string,
        readonly fallbackEligible = false,
    ) { super(message); }
}
```

- [x] **Step 1: Write failing policy tests**

Cover public IPv4/IPv6, `localhost`, every blocked IPv4/IPv6 class from ADR-0091, IPv4-mapped IPv6, mixed public/private answers, empty answers, credentials, fragments, non-HTTP(S), IDN normalization, loopback-only SearXNG, and AbortSignal propagation.

```typescript
await assert.rejects(
    () => resolvePublicTarget(new URL("https://mixed.example/"), {
        lookup: async () => [
            {address: "93.184.216.34", family: 4},
            {address: "127.0.0.1", family: 4},
        ],
    }),
    (error: WebAccessError) => error.code === "WEB_ACCESS_TARGET_BLOCKED",
);
```

- [x] **Step 2: Run the focused tests to verify Red**

Run:

```bash
node --test tests/Node/web-access-network.test.ts
```

Expected: FAIL because the policy module is missing.

- [x] **Step 3: Implement the policy with Node `net.BlockList`**

Build immutable IPv4 and IPv6 block lists. Reject any literal or resolved address matched by the lists. Use `dns.promises.lookup(hostname, {all:true, verbatim:true, signal})` through an injected lookup seam. Reject mixed answers rather than selecting a public one. For public URLs, choose the first validated address and return the original normalized URL plus address/family. For loopback URLs, require every answer to be loopback and allow HTTP only there.

Add `packages/prism-core/extensions/web-access/**/*.ts` to `tsconfig.json`.

- [x] **Step 4: Run tests and type-check**

Run:

```bash
node --test tests/Node/web-access-network.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/extensions/web-access/errors.ts packages/prism-core/extensions/web-access/network.ts tests/Node/web-access-network.test.ts tsconfig.json
prism-tool commit create --type feat --scope web-access --subject "enforce public and loopback URL policy" --refs 429
```

---

### Task 5: Implement the bounded pinned HTTP client

**Files:**

- Create: `packages/prism-core/extensions/web-access/http.ts`
- Create: `tests/Node/web-access-http.test.ts`

**Interfaces:**

- Consumes: `resolvePublicTarget`, `validateLoopbackUrl`, `WebAccessError`.
- Produces: `requestPublicText(url, options)`, `requestLoopbackJson(url, options)`, and `TextResponse`.

```typescript
export interface TextResponse {
    finalUrl: string;
    status: number;
    contentType: string;
    body: string;
}
```

- [x] **Step 1: Write failing transport tests**

Use injected request and resolver seams to assert: the original hostname remains in request options, custom `lookup` returns the pinned address, TLS `servername` remains the original host, redirects are manual and revalidated, origin changes drop metadata, proxy environment is ignored, gzip/br/deflate decoding is bounded, compressed and decompressed caps are independent, textual MIME types pass, binary MIME types fail, connect/total timeout and cancellation destroy the request, and errors contain no body/path/command data.

- [x] **Step 2: Run the focused tests to verify Red**

Run:

```bash
node --test tests/Node/web-access-http.test.ts
```

Expected: FAIL because the HTTP client is missing.

- [x] **Step 3: Implement the pinned client**

Use `node:http` and `node:https` request functions, not global `fetch()`. Build request options with the original hostname and a custom `lookup` callback that returns only the validated address/family. Set `servername` for HTTPS. Set `redirect: manual` behavior in code by handling 301, 302, 303, 307, and 308 responses and recursing at most five times through a fresh policy resolution.

Collect at most 5 MiB compressed bytes. Decode `gzip`, `deflate`, or `br` with Node zlib and `maxOutputLength` 5 MiB. Accept `text/*`, `application/json`, `application/xml`, `application/xhtml+xml`, and `application/*+json`/`*+xml`. Decode UTF-8 and reject malformed text. Do not read proxy variables or accept request headers from callers.

- [x] **Step 4: Run tests and type-check**

Run:

```bash
node --test tests/Node/web-access-http.test.ts tests/Node/web-access-network.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/extensions/web-access/http.ts tests/Node/web-access-http.test.ts
prism-tool commit create --type feat --scope web-access --subject "add pinned bounded HTTP transport" --refs 429
```

---

### Task 6: Add readable extraction and paged fetch behavior

**Files:**

- Modify: `packages/prism-core/package.json`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `package-lock.json`
- Create: `packages/prism-core/extensions/web-access/extract.ts`
- Create: `packages/prism-core/extensions/web-access/fetch.ts`
- Create: `tests/Node/web-access-fetch.test.ts`
- Modify: `packages/prism-core/NOTICE`

**Interfaces:**

- Consumes: `requestPublicText`.
- Produces: `extractReadable(response)`, `fetchContent(params, deps)`, and `FetchContentResult`.

```typescript
export interface FetchContentResult {
    finalUrl: string;
    status: number;
    contentType: string;
    title?: string;
    content: string;
    offset: number;
    nextOffset?: number;
    truncated: boolean;
}
```

- [x] **Step 1: Write failing extraction and paging tests**

Fixture HTML with navigation, script, article, title, links, and prompt-injection-shaped text. Assert readable mode returns Markdown article content without script execution or raw HTML. Assert raw mode returns textual body. Assert offset/limit paging, next offset, empty tail, malformed HTML handling, title extraction, and stable sanitized errors.

- [x] **Step 2: Run the focused tests to verify Red**

Run:

```bash
node --test tests/Node/web-access-fetch.test.ts
```

Expected: FAIL because extraction modules and dependencies are missing.

- [x] **Step 3: Obtain explicit registry authorization and add exact dependencies**

After the human explicitly authorizes this registry attempt, run:

```bash
pnpm add --filter @kyaulabs/prism-core --save-exact @mozilla/readability@0.6.0 linkedom@0.16.11 turndown@7.2.4
pnpm add --workspace-root --save-dev --save-exact @types/turndown@5.0.6
npm install --package-lock-only --ignore-scripts
```

Expected: Core runtime dependencies and both committed npm lock surfaces update; no lifecycle scripts run.

> Execution note: this checkout's `pnpm-workspace.yaml` has no package globs, so
> the approved filtered command matched no projects. After a second explicit
> authorization, the same exact dependencies were added to Core and the root
> test manifest, followed by root `pnpm install --ignore-scripts` and npm's
> lockfile-only update.

- [x] **Step 4: Implement extraction and fetch paging**

Use `parseHTML`, `Readability`, and `TurndownService`. Remove scripts/styles before Readability. Resolve links against the final URL. Slice extracted Unicode text by validated character offset and a maximum limit below Pi's 50 KiB tool ceiling. Keep the full extracted value only in call-local memory and return no cache identifier or path.

Credit `pi-web-access` as a design reference and add licenses for the three runtime dependencies to NOTICE. Do not list upstream files as copied unless implementation actually adapts source.

- [x] **Step 5: Run tests, audit, and create the commit**

Run:

```bash
node --test tests/Node/web-access-fetch.test.ts tests/Node/web-access-http.test.ts
npm audit --package-lock-only --json
pnpm audit --json
npx tsc --noEmit
```

Expected: tests and type-check PASS; both audits report no advisory.

```bash
git add packages/prism-core/package.json package.json pnpm-lock.yaml package-lock.json packages/prism-core/extensions/web-access/extract.ts packages/prism-core/extensions/web-access/fetch.ts tests/Node/web-access-fetch.test.ts packages/prism-core/NOTICE
prism-tool commit create --type feat --scope web-access --subject "extract bounded readable content" --refs 429
```

---

### Task 7: Implement DuckDuckGo and loopback SearXNG search

**Files:**

- Create: `packages/prism-core/extensions/web-access/search-types.ts`
- Create: `packages/prism-core/extensions/web-access/search-filters.ts`
- Create: `packages/prism-core/extensions/web-access/duckduckgo.ts`
- Create: `packages/prism-core/extensions/web-access/searxng.ts`
- Create: `tests/Node/web-access-search.test.ts`

**Interfaces:**

- Produces: `SearchParams`, `SearchResult`, `searchDuckDuckGoDirect`, `parseDuckDuckGoHtml`, `searchSearxng`, and `filterResults`.

```typescript
export interface SearchParams {
    query: string;
    limit: number;
    recency?: "day" | "week" | "month" | "year";
    domains: string[];
}

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}
```

- [x] **Step 1: Write failing backend tests**

Use inert HTML and JSON fixtures. Assert query limits, recency mapping, include/exclude hostname semantics, redirect-link decoding, malformed/block-page detection, result deduplication, HTTP(S)-only URLs, local post-filtering, SearXNG `/search` JSON construction, no redirects, byte/result caps, and untrusted snippets preserved as text.

- [x] **Step 2: Run the focused tests to verify Red**

Run:

```bash
node --test tests/Node/web-access-search.test.ts
```

Expected: FAIL because the search modules are missing.

- [x] **Step 3: Implement normalized backends**

Use the fixed origin `https://html.duckduckgo.com`. Build one query with validated recency/domain terms and parse `.result` entries through `linkedom`. Detect challenge/block pages by missing result structure plus known challenge markers; throw a fallback-eligible backend error.

For SearXNG, append only `/search`, `q`, `format=json`, bounded `time_range`, and result language/safesearch defaults selected by the implementation. Use `requestLoopbackJson` with redirects disabled. Normalize, deduplicate, and locally filter all URLs.

- [x] **Step 4: Run tests and type-check**

Run:

```bash
node --test tests/Node/web-access-search.test.ts tests/Node/web-access-http.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/extensions/web-access/search-types.ts packages/prism-core/extensions/web-access/search-filters.ts packages/prism-core/extensions/web-access/duckduckgo.ts packages/prism-core/extensions/web-access/searxng.ts tests/Node/web-access-search.test.ts
prism-tool commit create --type feat --scope web-access --subject "add keyless and loopback search backends" --refs 429
```

---

### Task 8: Add confined Chromium-family browser search

**Files:**

- Create: `packages/prism-core/extensions/web-access/cdp.ts`
- Create: `packages/prism-core/extensions/web-access/browser.ts`
- Create: `tests/Node/web-access-browser.test.ts`

**Interfaces:**

- Consumes: `resolveWebAccessBrowser`, public DNS policy, DuckDuckGo parser, and `SearchParams`.
- Produces: `CdpPipe`, `searchWithBrowser(params, deps)`, and session-local `BrowserCapabilityCache`.

- [x] **Step 1: Write failing browser tests**

Use a fake spawned process with fd3/fd4 null-delimited CDP messages. Assert:

- Linux-only allowlisted executable use, including a `brave` fixture;
- direct spawn with `shell:false`, absolute path, no `--no-sandbox`, and a fresh mode-0700 profile;
- `--remote-debugging-pipe`, fixed hostname pinning, and no caller flags;
- CDP interception continues only the approved HTTPS DuckDuckGo document GET;
- redirects, methods, IP literals, and subresources are failed before network continuation;
- DOM extraction occurs only after load;
- timeout/cancellation closes the browser, kills the process tree, and removes the owned profile;
- runtime failure invalidates cached capability; and
- unavailable confinement becomes fallback-eligible rather than weakening flags.

- [x] **Step 2: Run the focused tests to verify Red**

Run:

```bash
node --test tests/Node/web-access-browser.test.ts
```

Expected: FAIL because CDP and browser modules are missing.

- [x] **Step 3: Implement the validated prototype pattern**

Implement a null-delimited CDP pipe over child descriptors 3 and 4. Support `Browser.getVersion`, `Target.createTarget`, `Target.attachToTarget(flatten:true)`, `Page.enable`, `Fetch.enable`, `Page.navigate`, `Runtime.evaluate`, and `Browser.close`. Track pending IDs, session IDs, load completion, deadline, abort, and bounded stderr without reflecting it to tool errors.

Spawn with the fixed isolation flags proven by the prototype and a `--host-resolver-rules` mapping from `html.duckduckgo.com` to the already validated public address. Continue only same-origin document GET requests; fail everything else with `Aborted`. Parse returned DOM through the shared DuckDuckGo parser. Always terminate and clean up in `finally`.

- [x] **Step 4: Run tests and type-check**

Run:

```bash
node --test tests/Node/web-access-browser.test.ts tests/Node/web-access-search.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/extensions/web-access/cdp.ts packages/prism-core/extensions/web-access/browser.ts tests/Node/web-access-browser.test.ts
prism-tool commit create --type feat --scope web-access --subject "confine browser based keyless search" --refs 429
```

---

### Task 9: Add browser-first routing and consent/config adapters

**Files:**

- Create: `packages/prism-core/extensions/web-access/authorization.ts`
- Create: `packages/prism-core/extensions/web-access/config.ts`
- Create: `packages/prism-core/extensions/web-access/router.ts`
- Create: `tests/Node/web-access-router.test.ts`

**Interfaces:**

- Consumes: launcher-owned consent/config/browser modules and the three search backends.
- Produces: `requireStandingWebAccess()`, `loadWebAccessConfig()`, and `searchWeb(params, deps)`.

- [x] **Step 1: Write failing route tests**

Assert consent is checked immediately before each possible effect. Assert fixed order browser → configured SearXNG → direct DuckDuckGo. Assert missing browser and approved backend failures fall through; invalid input/configuration, cancellation, consent failure, and security rejection stop. Assert aggregate errors name only `browser`, `searxng`, and `direct` categories.

- [x] **Step 2: Run the focused tests to verify Red**

Run:

```bash
node --test tests/Node/web-access-router.test.ts
```

Expected: FAIL because adapters and router are missing.

- [x] **Step 3: Implement adapters and route classification**

Use `createRequire(import.meta.url)` only inside the small adapters to import the packaged CommonJS launcher modules. Convert their closed results into typed extension values. Do not expose managed paths or record contents.

Implement route attempts as named functions returning results or typed `WebAccessError`. Re-run the consent gate before each backend effect so consent revoked between fallbacks stops the chain. Cache only browser capability, never consent/config/search/page content.

- [x] **Step 4: Run tests and type-check**

Run:

```bash
node --test tests/Node/web-access-router.test.ts tests/Node/web-access-browser.test.ts tests/Node/prism-tool-web-access.test.js
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/extensions/web-access/authorization.ts packages/prism-core/extensions/web-access/config.ts packages/prism-core/extensions/web-access/router.ts tests/Node/web-access-router.test.ts
prism-tool commit create --type feat --scope web-access --subject "route consent gated browser first search" --refs 429
```

---

### Task 10: Register the Pi tools and bound output

**Files:**

- Create: `packages/prism-core/extensions/web-access/index.ts`
- Create: `packages/prism-core/extensions/web-access/README.md`
- Create: `tests/Node/web-access-extension.test.ts`
- Modify: `tests/Node/toolchain-packaging.test.js`

**Interfaces:**

- Consumes: `searchWeb`, `fetchContent`, Pi `Type`, `StringEnum`, `truncateHead`, `DEFAULT_MAX_BYTES`, and `DEFAULT_MAX_LINES`.
- Produces: registered `web_search` and `fetch_content` tools.

- [x] **Step 1: Write failing registration tests**

Fixture `registerTool` and execute both captured definitions. Assert exact names, labels, prompt snippets/guidelines, schema bounds, AbortSignal flow, progress updates, success details, `isError` behavior through thrown errors, no load-time process/timer/socket activity, and final 50 KiB/2000-line truncation.

- [x] **Step 2: Run the focused tests to verify Red**

Run:

```bash
node --test tests/Node/web-access-extension.test.ts
```

Expected: FAIL because the extension entry point is missing.

- [x] **Step 3: Implement thin synchronous registration**

Register `web_search` with query, limit 1–10, `StringEnum` recency, and bounded domain array. Register `fetch_content` with HTTP(S) URL, `StringEnum(["readable","raw"])`, non-negative offset, and bounded limit. Name each tool in every prompt guideline. Return text plus structured details; do not add custom UI, commands, shortcuts, session entries, or persistent files.

Document configuration, consent, browser allowlist including Brave, routing, SSRF limits, content limits, setup commands, and optional smoke procedure in the extension README.

- [x] **Step 4: Run registration and package tests**

Run:

```bash
node --test tests/Node/web-access-extension.test.ts tests/Node/toolchain-packaging.test.js
npx tsc --noEmit
```

Expected: PASS and tarball includes every web-access module and README.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/extensions/web-access/index.ts packages/prism-core/extensions/web-access/README.md tests/Node/web-access-extension.test.ts tests/Node/toolchain-packaging.test.js
prism-tool commit create --type feat --scope web-access --subject "register bounded search and fetch tools" --refs 429
```

---

### Task 11: Replace live legacy search surfaces and setup/doctor contracts

**Files:**

- Delete: `packages/prism-core/skills/websearch/SKILL.md`
- Delete: `packages/prism-core/skills/websearch/search.sh`
- Delete: `packages/prism-core/skills/searxng/SKILL.md`
- Delete: `packages/prism-core/skills/searxng/search.sh`
- Delete: `packages/prism-core/skills/lib/search_common.sh`
- Delete: `tests/Shell/search_skills_test.sh`
- Modify: `packages/prism-core/AGENTS.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `CODING_HARNESS.md`
- Modify: `packages/prism-core/README.md`
- Modify: `packages/prism-core/extensions/safety/README.md`
- Modify: `packages/prism-core/extensions/safety/index.ts`
- Modify: `packages/prism-core/skills/pi-docs/SKILL.md`
- Modify: `packages/prism-core/skills/writing-skills/SKILL.md`
- Modify: `packages/prism-core/skills/wayfinder/SKILL.md`
- Modify: `packages/prism-core/skills/research-background/SKILL.md`
- Modify: `packages/prism-core/skills/writing-plans/SKILL.md`
- Modify: `packages/prism-core/prompts/research.md`
- Modify: `packages/prism-core/prompts/setup.md`
- Modify: `packages/prism-core/prompts/doctor.md`
- Modify: `packages/prism-core/docs/research.md`
- Modify: `tests/Shell/model_agnostic_test.sh`
- Modify: `tests/Shell/toolchain_entrypoints_test.sh`
- Modify: `tests/Node/toolchain-packaging.test.js`

**Interfaces:**

- Consumes: live extension, launcher consent/config/status commands, ADR-0091.
- Produces: one maintained web-access contract with no live DeepSeek search or CLI SearXNG path.

- [x] **Step 1: Write failing live-surface contract assertions**

Extend shell/package tests to require:

```text
prism-tool consent grant-web --approval=yes
prism-tool consent revoke-web
prism-tool web-access status --json
web_search
fetch_content
standing web-access consent
```

Add negative assertions for `DEEPSEEK_API_KEY`, `WEBSEARCH_`, `SEARXNG_URL`, `SEARXNG_`, `skills/websearch`, `skills/searxng`, and the “sole extension” claim across maintained live surfaces. Keep historical ADR and changelog paths excluded.

- [x] **Step 2: Run focused contracts to verify Red**

Run:

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
bash tests/Shell/model_agnostic_test.sh
node --test tests/Node/toolchain-packaging.test.js
```

Expected: FAIL on legacy references and missing new setup/doctor contracts.

- [x] **Step 3: Rewrite setup and doctor**

In `/setup`, retain one-question-at-a-time behavior. Inspect combined consent status, manage OCR and web grants independently, and explain the exact web scope before the web question. Replace optional environment checks with `prism-tool web-access status --json`; offer loopback SearXNG URL and browser `auto|disabled`, preview the closed config, then call the narrow configure/remove operation only after literal approval.

In `/doctor`, report web consent, validated config, and optional browser family/status without performing a live public search. Missing web consent or optional browser/SearXNG is not mandatory Core toolchain failure; unsafe managed state is NO-GO for web access and is reported distinctly.

- [x] **Step 4: Remove legacy files and rewrite all live prose**

Delete the five legacy implementation files and shell suite. Replace skill-loading instructions with direct use of `web_search` and `fetch_content`. Replace sole-extension prose with the safety/web-access non-orchestration rule. Update NOTICE so old derived-file entries disappear and current dependency/design-reference attribution remains. Remove the model-agnostic DeepSeek-search exemption.

- [x] **Step 5: Run contracts and create the terminal implementation commit**

Run:

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
bash tests/Shell/model_agnostic_test.sh
node --test tests/Node/toolchain-packaging.test.js
```

Expected: PASS.

```bash
git add -A packages/prism-core/skills/websearch packages/prism-core/skills/searxng packages/prism-core/skills/lib/search_common.sh tests/Shell/search_skills_test.sh packages/prism-core/AGENTS.md AGENTS.md README.md CODING_HARNESS.md packages/prism-core/README.md packages/prism-core/extensions/safety packages/prism-core/skills/pi-docs packages/prism-core/skills/writing-skills packages/prism-core/skills/wayfinder packages/prism-core/skills/research-background packages/prism-core/skills/writing-plans packages/prism-core/prompts/research.md packages/prism-core/prompts/setup.md packages/prism-core/prompts/doctor.md packages/prism-core/docs/research.md packages/prism-core/NOTICE tests/Shell/model_agnostic_test.sh tests/Shell/toolchain_entrypoints_test.sh tests/Node/toolchain-packaging.test.js
prism-tool commit create --type refactor --scope web-access --subject "replace legacy search integrations" --fixes 429
```

---

### Task 12: Verify the complete migration

**Files:**

- Modify only if a failing verification exposes a spec defect; otherwise none.

**Interfaces:**

- Consumes: all prior tasks.
- Produces: evidence that the branch satisfies the spec before finalization.

- [ ] **Step 1: Run the complete Node suite**

Run:

```bash
npm run test:node
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript and shell suites**

Run:

```bash
npx tsc --noEmit
composer test:shell
```

Expected: PASS.

- [ ] **Step 3: Audit locked dependencies**

Run:

```bash
npm audit --package-lock-only --json
pnpm audit --json
```

Expected: no advisory at any severity.

- [ ] **Step 4: Scan for forbidden live traces**

Run:

```bash
rg -n 'DEEPSEEK_API_KEY|WEBSEARCH_|SEARXNG_URL|SEARXNG_|skills/websearch|skills/searxng|sole extension|only Pi extension' packages/prism-core README.md CODING_HARNESS.md CONTEXT.md AGENTS.md tests --glob '!packages/prism-core/CHANGELOG.md' --glob '!adr/**' --glob '!docs/specs/**' --glob '!docs/plans/**'
```

Expected: no legacy search or stale sole-extension matches; any unrelated historical or model fixture is explicitly inspected rather than deleted automatically.

- [ ] **Step 5: Run the project gate and hand off to finalization**

Run:

```text
/check
```

Expected: full project gate PASS. Then load `verification-before-completion` and `finishing-a-development-branch`; do not push.

## Self-review

- Spec coverage: Tasks 2–3 cover consent/configuration; 4–6 cover guarded fetching and extraction; 7–9 cover search and browser-first routing; 10 covers Pi tools and packaging; 11 covers complete legacy removal and live docs; 12 covers all acceptance criteria.
- Placeholder scan: no TBD/TODO/future implementation placeholders remain.
- Type consistency: `SearchParams`, `SearchResult`, `PinnedTarget`, `TextResponse`, and `FetchContentResult` have one canonical definition and named consumers.
- Issue-reference count: Tasks 1–10 use `--refs 429`; Task 11 alone uses `--fixes 429`; verification creates no commit.
- Adapter command audit: the final project gate is `/check`; the existing PHP adapter owns its internal Pest, lint, and coverage commands.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
