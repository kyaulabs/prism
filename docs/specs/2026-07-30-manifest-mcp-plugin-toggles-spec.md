# Spec: Manifest-Driven MCP and Quota Plugin Toggles

**Date:** 2026-07-30
**Status:** Approved

## Problem Statement

Prism currently requires a user to edit tracked OpenCode configuration to
enable either optional MCP server, while the quota plugin is loaded for every
user. Personal integration preferences therefore either dirty the repository
or cannot be expressed through the canonical Prism manifest.

The issue's original configuration assumptions predate ADR-0043. Prism now
uses a project Prism manifest and an optional user Prism manifest, resolved by
a dependency-free PHP JSONC boundary. The toggle design must extend that
model without reviving the legacy setup manifest, weakening fail-closed
validation, exposing secrets, or allowing a user preference to disable an
enforcement plugin.

## Solution

Add three Boolean preferences to the Prism manifest vocabulary: one for each
optional MCP server and one for the quota plugin. The project Prism manifest
ships all three preferences as `false`. Missing preferences also resolve to
`false`, preserving schema-v5 compatibility for existing project and user
Prism manifests.

The `/setup` interview asks whether to enable each integration and writes the
three answers only to the user Prism manifest. It never writes a personal
answer into the tracked project Prism manifest.

The resolved Prism manifest produces a deterministic inline OpenCode
configuration. That configuration owns only these surfaces:

- the enabled state of the `deepseek-websearch` MCP server;
- the enabled state of the `searxng` MCP server; and
- membership of the pinned quota package in the OpenCode plugin list.

Both MCP definitions remain permanently present and disabled in the tracked
OpenCode configuration. The inline configuration supplies real JSON Boolean
overrides. The quota package remains pinned and installed, but OpenCode loads
it only when its manifest preference is enabled.

Existing inline OpenCode configuration is treated as an input to composition,
not something Prism may silently discard. Unrelated properties and unrelated
plugin entries are preserved. Prism replaces its two owned MCP enabled leaves
and removes or adds only the quota package entry. Malformed or structurally
incompatible inline configuration fails closed.

An MCP preference becomes active only when its required integration value is
also non-empty in the resolved Prism manifest. A requested integration with a
missing key or URL remains disabled and is reported as such. Inline
configuration contains no secrets.

Local enforcement plugins remain convention-loaded and outside the toggle
surface. No Prism manifest field can disable them.

## User Stories

1. As a Prism user, I want `/setup` to ask about each optional integration so
   that I do not need to learn or edit OpenCode configuration syntax.
2. As a Prism user, I want my integration choices stored in my user Prism
   manifest so that the tracked project remains clean.
3. As a Prism user, I want all optional integrations disabled by default so
   that cloning Prism does not add tools, quota UI, or external processes I
   did not request.
4. As a Prism user, I want to enable deepseek web search without enabling
   SearXNG or the quota plugin so that each integration is independently
   controlled.
5. As a Prism user, I want to enable SearXNG without enabling deepseek web
   search or the quota plugin so that each integration is independently
   controlled.
6. As a Prism user, I want the quota package to retain its complete server and
   TUI behavior when enabled so that toggling does not replace it with a
   partial wrapper.
7. As a Prism user, I want an enabled MCP preference with a missing key or URL
   to remain inactive so that OpenCode does not start a predictably broken
   integration.
8. As a Prism user with an older schema-v5 manifest, I want missing toggle
   sections to resolve safely to `false` so that an additive feature does not
   force a migration.
9. As a Prism user with custom inline OpenCode configuration, I want unrelated
   settings and plugin entries preserved so that Prism changes only what it
   owns.
10. As a Prism maintainer, I want malformed manifests and malformed inline
    configuration to fail closed with redacted diagnostics so that invalid
    input never enables an integration.
11. As a Prism maintainer, I want enforcement plugins excluded from the
    manifest vocabulary so that untracked user preferences cannot disable
    safety controls.
12. As a Prism maintainer, I want the quota dependency to remain exactly
    pinned and lockfile-audited even though it is disabled by default so that
    enabling it remains deterministic.

## Implementation Decisions

- Extend schema v5 additively. The two new manifest sections are optional for
  validation compatibility; when present, their owned keys must be Booleans.
  The shipped project Prism manifest contains every key with a `false` value.
- The manifest resolution order remains project defaults overlaid field by
  field by the user Prism manifest. No migration or setup-version bump is
  introduced.
- `/setup` owns the three user preference paths. It asks three independent
  yes/no questions, defaults each answer to disabled, writes JSON Booleans,
  and preserves comments and unrelated fields through the existing Prism
  manifest patch boundary.
- Personal toggle answers are never passed to the project Prism manifest
  writer. Newly scaffolded project Prism manifests receive only the tracked
  all-off defaults.
- The resolved-manifest environment transport exposes normalized diagnostic
  values for the three preferences and a computed inline OpenCode
  configuration value.
- Inline OpenCode configuration composition starts from an existing value
  when one is present. The input must decode to an object. Prism preserves
  unrelated object members and plugin entries, writes both owned MCP enabled
  leaves on every evaluation, and adds or removes exactly the pinned quota
  package identifier.
- If an existing owned MCP node or plugin list has an incompatible type,
  composition fails instead of replacing unrelated data heuristically.
- The computed output is compact, deterministic JSON. When all integrations
  are off it remains valid JSON and explicitly carries disabled MCP leaves,
  preventing a previously enabled value from becoming sticky across a
  direnv reevaluation.
- The deepseek MCP enabled state is the conjunction of its Boolean preference
  and a non-empty resolved API key. The SearXNG enabled state is the
  conjunction of its Boolean preference and a non-empty resolved URL.
- Secrets continue through their existing environment variables. They are
  never copied into inline OpenCode configuration or diagnostics.
- The tracked OpenCode configuration permanently declares both pinned MCP
  commands with disabled states and no longer statically declares the quota
  plugin. OpenCode's documented configuration merge boundary applies the
  generated runtime override.
- The pinned quota dependency and lockfile remain unchanged. Disabled means
  "installed but not loaded by OpenCode," not "absent from disk."
- ADR-0045 records inline-configuration ownership, compatibility rules,
  prerequisite behavior, the all-off default, and the quota-default reversal.
  It supersedes ADR-0032's commented-block enablement mechanism and extends
  ADR-0043 without rewriting either accepted record.
- The `quota plugin` becomes a project glossary term. Existing Prism manifest
  and MCP server definitions are updated to reflect the new behavior.

## Testing Decisions

The primary seam is the public resolved-manifest environment boundary. Given
project and user Prism manifests plus optional pre-existing inline OpenCode
configuration, tests observe the NUL-delimited environment pairs and decode
the resulting inline JSON. This verifies validation, overlay, prerequisite
gating, composition, preservation, removal, deterministic output, and secret
non-disclosure without testing private helpers.

Additional seams are:

- the user Prism manifest writer, observed through its resulting JSONC, to
  prove that answers are Booleans, comments survive, and tracked project
  defaults are untouched;
- the `/setup` command contract, to prove that all three prompts exist and
  only the user writer receives their answers;
- an isolated OpenCode resolved-configuration probe, with no network access
  and no MCP process startup, to confirm that inline configuration merges the
  two MCP enabled leaves and quota package membership as documented;
- architecture and documentation assertions, to keep MCP blocks permanent,
  quota loading non-static, dependency pinning intact, and obsolete
  uncommenting instructions from returning.

Unit tests cover manifest validation, compatibility defaults, composition,
and deterministic JSON. Shell integration tests cover NUL transport, setup
writer behavior, idempotency, and clean tracked state. Existing harness tests
provide prior art for Prism manifest fixtures, setup command contracts,
documentation contracts, and plugin supply-chain assertions.

Automated tests must use fake non-secret prerequisite values, isolated home
and cache directories, and no network calls. They must not launch either MCP
server or install a package.

## Out of Scope

- Toggling local enforcement plugins.
- Adding, removing, or updating an MCP or quota dependency.
- Managing arbitrary third-party MCP servers or plugins through the Prism
  manifest.
- Storing API keys, URLs, or other secrets in inline OpenCode configuration.
- Replacing the Prism manifest reader, overlay algorithm, or JSONC patcher.
- Bumping the Prism manifest schema version or migrating schema-v5 files.
- Hot-reloading OpenCode after a preference change; users still run
  `direnv allow` and restart OpenCode.
- Making network-backed integration calls in the automated test suite.

## Further Notes

- ADR-0032 defines the original optional MCP onboarding and key-flow model;
  ADR-0045 supersedes its commented-block enablement mechanism.
- ADR-0043 defines the project Prism manifest, user Prism manifest, manifest
  resolution order, JSONC preservation, fail-closed validation, and narrow
  user-manifest write boundary extended by this feature.
- ADR-0040's quota-visibility assumption is qualified because quota reporting
  is now opt-in and disabled by default.
- ADR-0023, ADR-0036, and ADR-0042 continue to govern enforcement plugins,
  which remain outside this feature.
- Architect review verdict: GO-WITH-CONDITIONS.
- ADR-required: 0045.
