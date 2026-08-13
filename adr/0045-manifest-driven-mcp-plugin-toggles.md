# 0045. Manifest-Driven MCP and Quota Plugin Toggles

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-30

## Status

Accepted

Supersedes ADR-0032's commented-block enablement mechanism, extends
ADR-0043's schema-v5 Prism manifest boundary, and qualifies ADR-0040's
assumption that quota visibility is enabled by default.

## Context

Optional MCP and quota integration preferences are personal, but enabling an
MCP currently requires a tracked `opencode.jsonc` edit and quota currently
loads for every user. ADR-0043 provides project/user JSONC manifests and a
fail-closed PHP resolution boundary. OpenCode provides
`OPENCODE_CONFIG_CONTENT` as its highest-priority inline configuration source.

## Decision

We add optional Boolean `mcp.deepseek_websearch`, `mcp.searxng`, and
`plugins.opencode_quota` preferences to schema v5 (`setup_version: 5`).
Missing values and shipped project defaults are false. `/setup` writes answers
only to the user Prism manifest.

The Prism PHP boundary composes an inherited `OPENCODE_CONFIG_CONTENT` object,
preserving unrelated keys and plugin entries while replacing the two owned MCP
`enabled` leaves and adding or removing only `@slkiser/opencode-quota`.
Malformed or incompatible input fails closed. MCP activation additionally
requires its resolved key or URL; secrets remain in environment variables and
never enter inline JSON.

Tracked `opencode.jsonc` permanently defines both MCP servers with
`enabled: false` and omits a static quota plugin entry. Local enforcement
plugins remain convention-loaded and cannot be toggled.

## Consequences

- Personal choices no longer dirty tracked configuration.
- Quota changes from on-by-default to installed-but-not-loaded by default.
- Existing schema-v5 manifests need no migration; absent fields are false.
- Users run `direnv allow` and restart OpenCode after changing preferences.
- The PHP boundary owns composition and must preserve unrelated inline config.
- Tests require isolated resolved-config probes and may not start MCPs or use
  the network.

## Alternatives Considered

- Direct environment substitution into Boolean config fields was rejected
  because OpenCode environment substitution is string-oriented.
- A local quota delegation wrapper was rejected because it could lose the
  package's TUI extension.
- Loading quota permanently and only suppressing events was rejected because
  it does not toggle package loading.
- A schema-v6 migration was rejected because these optional fields do not
  change format, locations, or overlay semantics.
