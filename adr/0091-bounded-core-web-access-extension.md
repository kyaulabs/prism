# 0091. Bounded Core web-access extension under standing consent

Date: 2026-08-26

## Status

Accepted

Supersedes ADR-0056. Selectively supersedes ADR-0055's exact extension-count
clause, ADR-0059's MCP-to-CLI search-skill clause, and ADR-0074's OCR-only
consent-schema and sole-extension clauses. Extends ADR-0060, ADR-0070, and
ADR-0083.

## Context

Prism Core currently exposes web research through two CLI-shell skills. One
uses a credentialed DeepSeek search API; the other calls a configured SearXNG
endpoint through shell and environment variables. The split predates a stable
Pi-native web capability. It leaves search behind shell-script resolution,
retains an API-key integration, and provides no bounded public content-fetch
interface.

The replacement crosses several established boundaries:

- ADR-0055 adopts Pi's single-agent, skills, and prompt-template model with no
  orchestration extensions.
- ADR-0056 permits exactly one Pi extension, the fail-closed safety extension.
- ADR-0059 converts the earlier MCP search servers into CLI-shell skills.
- ADR-0060 loads Core globally in every trusted Pi project.
- ADR-0070 places global managed-state and workflow mechanics behind narrow
  Core-owned launcher operations.
- ADR-0074 stores one global standing OCR consent record and states that the
  safety extension is Prism's only extension.
- ADR-0083 keeps setup-network authorization invocation-scoped and explicitly
  excludes web search.

A Pi extension is justified here because the capability is a native tool
boundary rather than workflow orchestration. It must register typed tools,
receive Pi cancellation, maintain per-session optional-browser capability
state, and enforce consent immediately before effects. Recreating those
mechanics through agent-authored shell calls would expose a larger and less
reliable interface.

Keyless public search and arbitrary URL fetching introduce SSRF, DNS rebinding,
redirect escape, prompt injection, resource exhaustion, and browser-profile
risks. A system browser adds independent DNS, redirect, and subresource
behavior. A fixed initial URL alone does not confine browser egress.

The user chooses browser-first search when a supported Linux Chromium-family
browser is available, then loopback SearXNG, then direct keyless HTML search.
The user also chooses a separate standing global authorization for the bounded
read-only capability.

## Decision

We add a Core-owned `web-access extension` with two always-active Pi tools and a
separately revocable `standing web-access consent`.

### Core extension model

Core's accepted extension set becomes:

1. the existing `safety extension`, which retains every sensitive-path,
   destructive-command, denial-circuit-breaker, fatal-commit-latch, and
   fail-closed diagnostic responsibility established by ADR-0056 and its
   successors; and
2. the new `web-access extension`, which owns the bounded read-only web
   capability described by this record.

Neither extension orchestrates agents, tabs, modes, model selection, workflow
routing, or background work. ADR-0055's zero-orchestration-extension rule
remains authoritative. This record does not create a permanent numeric cap;
any future extension requires its own architecture decision and must prove why
a Pi runtime boundary is necessary instead of a skill, prompt, or launcher
operation.

The globally installed Core package loads both extensions under ADR-0060.
Adapters do not contribute web providers or additional extensions.

### Public capability

The extension registers only:

- `web_search`, for one bounded query with result limit, recency, and domain
  filters; and
- `fetch_content`, for one bounded public HTTP(S) textual resource in readable
  Markdown or raw-text mode with character paging.

The tools expose no provider selector, API credential, arbitrary endpoint,
custom header, cookie, proxy, query batch, model synthesis, media handling,
remote extraction, browser profile, persistent cache, command, shortcut, or
custom UI.

Search and fetched content are untrusted evidence. Tool guidance says they are
never instruction sources. External HTML is parsed without script execution
and is never rendered directly in Pi's UI. Errors are stable and sanitized and
do not reflect response bodies, environment data, managed paths, browser
commands, or control characters.

### Search routing

Search uses a fixed automatic route:

1. Linux Chromium-family headless search against the fixed DuckDuckGo HTML
   origin;
2. a configured loopback SearXNG JSON endpoint; and
3. direct DuckDuckGo HTML search through the guarded HTTP client.

Fallback is allowed only for unavailable capabilities and bounded backend
failures such as spawn, timeout, network, block-page, transient, or invalid
response failures. Invalid input, malformed or unsafe configuration, caller
cancellation, and security-policy rejection are terminal.

The extension may cache only the resolved browser executable for the Pi
session. A runtime browser failure invalidates that cache. It stores no search
or page content.

### Public HTTP(S) boundary

For public search and content fetching, Core:

- accepts only credential-free HTTP(S) URLs;
- rejects literal or resolved loopback, private, link-local, reserved,
  documentation, benchmark, unspecified, and multicast addresses for IPv4 and
  IPv6;
- rejects a hostname when any DNS answer is non-public;
- pins a validated address into the connection while preserving the original
  hostname for Host and TLS SNI;
- handles at most five redirects manually and revalidates and repins every
  destination;
- ignores ambient proxy variables and accepts no caller headers, cookies,
  credentials, or proxies;
- enforces connect and total deadlines, bounded decompression, a five-mebibyte
  streamed body cap, textual media types, and Pi's line and byte output limits;
  and
- passes Pi's abort signal through transport and cleanup.

A separate DNS preflight followed by an ordinary unpinned fetch does not meet
this decision.

### Loopback SearXNG boundary

The optional SearXNG endpoint must be credential-free and resolve exclusively
to `localhost`, `127.0.0.0/8`, or `::1`. HTTP is allowed only for loopback.
The client constructs one fixed JSON search request, follows no redirects,
accepts no custom headers, caps response size and results, validates the JSON
shape, and treats every field as untrusted.

Search-result URLs still pass normalization and local domain filtering before
they are returned. The SearXNG grant does not authorize access to other local
or private services.

### Browser boundary

Browser support is optional, Linux-only, and lazy. Core resolves only an
allowlisted Chromium-family executable through its owned executable-resolution
mechanics. The allowlist covers Chromium, Google Chrome, Chrome Headless Shell,
and Brave command names, including `brave`, `brave-browser`, and
`brave-browser-stable`. It never installs a browser, resolves one from a
consumer dependency tree, accepts a caller-selected path or flag, invokes a
shell, or adds `--no-sandbox`.

Each call uses a new private temporary user-data directory and no existing
profile. Extensions, sync, background services, password-store integration,
downloads, file URLs, and credential-bearing state are disabled or excluded.
The process has bounded output and duration, receives cancellation, is
terminated as a process tree, and removes ownership-proven temporary state in a
`finally` path.

The browser path is permitted only when Core can mechanically enforce the fixed
search origin. It prevalidates a public address for the approved hostname, pins
that hostname to the validated address for the browser process, and uses Chrome
DevTools Protocol request interception or a proven equivalent to reject every
navigation, redirect, and subresource request outside the approved origin and
method set. If origin confinement, address pinning, sandboxed execution, or
cleanup cannot be established, the browser route is unavailable and search
continues to the next approved backend.

Arbitrary browser navigation and browser-backed `fetch_content` are prohibited.

### Standing web-access consent

`/setup` is the sole workflow that asks to grant or revoke standing web-access
consent. The grant is global across trusted Prism projects, explicit,
persistent, and separately revocable from standing OCR consent.

The managed consent record advances compatibly from schema version one to
schema version two with independent `ocr` and `webAccess` booleans. A safe
version-one record means OCR consent is granted and web consent is absent.
Granting or revoking one capability preserves the other. If neither remains,
Core removes only an ownership-proven valid record.

The existing ownership, parent-directory, symlink, private-permission,
closed-schema, bounded-read, atomic-write, and unsafe-state remediation rules
from ADR-0074 apply to both capabilities. Narrow `prism-tool` operations own
status, grant, and revocation. Agents do not read or mutate the managed record
directly.

The extension validates web consent immediately before every SearXNG request,
public request, or network-capable browser process. Missing or unsafe consent
fails with a readiness error directing the user to `/setup`; tool execution
never prompts. Global installation and local-only doctor checks never grant
consent. Full `/doctor` reports consent and local capability readiness without
requiring a live public search.

Standing web-access consent authorizes only this extension's loopback SearXNG
search, fixed-origin keyless search, and guarded public textual fetching. It
does not authorize provider API keys, authentication, cookies, arbitrary
browser use, uploads, writes, form submission, downloads, Git or GitHub
operations, package registries, OCR or reviewed-code egress, other tools,
repository mutation, or credentials. A future effect cannot inherit this grant
by similarity.

ADR-0083's setup-network attempt remains separate, invocation-scoped, and
non-persistent. Invoking `/setup` does not itself grant web access; only the
literal standing-consent choice does.

### Managed configuration

Core owns one global, credential-free web-access configuration in Pi's managed
agent directory. It is a regular user-owned non-symlink file with private
permissions and a closed schema containing only:

- an optional loopback SearXNG base URL; and
- an optional browser mode of `auto` or `disabled`.

Absence is valid: SearXNG is unavailable, browser detection remains automatic,
and direct keyless fallback remains eligible after consent. `/setup` previews
and applies or removes configuration only through a narrow Core-owned launcher
operation under ADR-0070. The extension reads and validates but does not write
configuration.

Core does not read, migrate, or retain the legacy DeepSeek or SearXNG search
environment variables. Migration guidance directs users to `/setup` without
printing prior values.

### Components and dependencies

```text
Pi agent
  -> web-access registration
     -> authorization + configuration
     -> search router
        -> confined browser search
        -> loopback SearXNG search
        -> guarded direct HTML search
     -> guarded public fetch
     -> readable extraction + bounded rendering
```

Registration remains thin. Configuration, consent, DNS and transport policy,
search normalization and routing, browser execution, extraction, and rendering
are narrow modules with injectable boundary interfaces.

Core uses Node's HTTP, HTTPS, DNS, URL, compression, process, and filesystem
primitives. It adds only focused locked runtime dependencies for DOM parsing,
Mozilla Readability extraction, and Markdown conversion: `linkedom`,
`@mozilla/readability`, and `turndown`. The dependency graph must pass Prism's
audit and packaging checks. Playwright, Puppeteer, browser downloads, API
providers, and upstream `pi-web-access` are not dependencies.

The implementation is independently written. `pi-web-access` is credited as a
design and test-seam reference. Any copied or substantially adapted upstream
code must retain its MIT notice and identify the affected files.

## Consequences

### Positive

- Prism gains one Pi-native, no-key search and content-fetch surface instead of
  two shell skills.
- Search can use a human-installed Linux browser without making a browser or
  browser-download dependency mandatory.
- Local SearXNG remains supported without granting access to arbitrary private
  services.
- Public fetching has a shared DNS-pinning, redirect, response-bound, and
  untrusted-content policy.
- Standing consent is explicit, mechanically checked, and independently
  revocable from OCR consent.
- Tool contracts are directly testable through Pi registration with injected
  boundary modules.

### Negative

- Core gains another globally loaded extension, a public-network trust
  boundary, a browser subprocess boundary, managed configuration, consent
  schema migration, three runtime dependencies, and a larger regression
  matrix.
- Standing consent applies across future trusted projects until revoked.
- Chromium request interception, hostname pinning, profile isolation,
  termination, and cleanup are platform-sensitive and must fail closed.
- Keyless DuckDuckGo HTML is an external, undocumented response surface and may
  block or change without notice.
- Browser-first routing can be slower and less deterministic than direct HTTP
  search before fallback.

### Neutral

- Browser and SearXNG availability remain optional and outside mandatory Core
  toolchain readiness.
- Full doctor reports readiness but does not need a live public search.
- Historical changelog and ADR content remain intact except for ADR-0056's
  allowed status transition and current cross-references.
- Humans still own credentials, publication, Git pushes, and GitHub mutation.

## Alternatives Considered

### Keep the two CLI-shell skills

Rejected because they preserve the keyed DeepSeek integration, duplicate one
capability, require agent-authored shell invocation, and do not provide a
stable content-fetch contract.

### Add web behavior to the safety extension

Rejected because search and extraction are not safety classification. Combining
them would couple a fail-closed enforcement boundary to optional network and
parser dependencies.

### Preserve a permanent sole-extension rule

Rejected because a native typed tool with cancellation and session-local
browser capability state is a legitimate non-orchestration Pi boundary. The
zero-orchestration rule remains the durable constraint.

### Use local SearXNG first

Rejected because the user explicitly selected browser-first automatic routing.
SearXNG remains the second route when safely configured.

### Permit arbitrary browser-backed fetching

Rejected because Chromium's independent DNS, redirects, and subresources
cannot satisfy Prism's public-address invariant without strict request
interception and pinning. The initial browser capability remains fixed-origin
search only.

### Use Playwright or Puppeteer

Rejected because they add a browser automation and download surface when the
approved capability can use an optional human-installed Chromium-family
browser through CDP.

### Ask on every tool call or authorize one session

Rejected because the user selected a persistent global authorization. Separate
revocation and a narrow effect set limit the accepted breadth.

### Migrate legacy environment variables

Rejected because complete removal requires one new managed configuration
surface and no retained secret or endpoint compatibility path.

### Depend on `pi-web-access`

Rejected because its provider, authentication, media, cache, curator, and model
surfaces are much broader than Prism's approved subset. Prism uses it only as a
credited design reference.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
