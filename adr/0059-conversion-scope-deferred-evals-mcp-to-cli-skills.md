# 0059. Conversion Scope — Verbatim-First Port, Deferred Evals, CLI Skills

Date: 2026-08-12

## Status

Accepted

Depends on ADR-0055, ADR-0058.

## Context

Philosophy B (ADR-0055) and the package split (ADR-0058) are settled, but the
conversion still has a long tail of "what about X" items: the eval suite, the
opencode-only machinery, the frozen ADR history, the MCP servers, and how
literally to port skill prose. Each needs a scoping decision so the conversion
plan stays bounded.

## Decision

- **Verbatim-first skill port.** Ported prose is copied from source with only
  the de-opencode-ification edits applied; no stylistic rewrites. This keeps
  the harness faithful to its ADR-justified design and preserves attribution.
- **Defer the eval suite.** `.opencode/evals/` was built around the opencode
  judge sub-agent and opencode's session API. Under pi (no sub-agents) it
  needs rework against pi's `--mode json` / `--mode rpc` / SDK; a fresh spec
  is written when started. Recorded as deferred work, not executed.
- **Drop opencode-only machinery.** `opencode.jsonc`, `tui.jsonc`,
  `opencode-quota`, `migrate-setup.sh`, `setup-write-*-config.sh`, and
  `PrismOpenCodeConfig.php` have no pi equivalent and are deleted.
- **Freeze the 54 opencode-era ADRs in place.** Records 0001–0054 are
  bannered as opencode-era historical context; new pi-era ADRs continue the
  numbering from 0055.
- **Port MCP servers to CLI-shell skills.** `deepseek-websearch` and
  `searxng` become `websearch` / `searxng` skills that shell out to a bundled
  CLI or `curl` — pi's "No MCP — build CLI tools with READMEs" philosophy.

## Consequences

- **Easier:** a bounded, faithful conversion; ADR history is preserved without
  rewriting; the MCP dependency is removed in favor of plain shell skills.
- **Harder:** the eval gap means no automated harness regression tests until
  the eval suite is reworked (deferred); the MCP→CLI skills must handle auth
  (`DEEPSEEK_API_KEY`, `SEARXNG_URL`) clearly and never log keys.
- **Follow-up:** Stages 1–6 execute the port; Stage 7 records the deferred
  work (evals, additional language adapters, optional publish).

## Alternatives Considered

- **Rewrite-for-style port.** Rejected: it drifts the harness from its
  ADR-justified design and obscures attribution provenance.
- **Port the eval suite as-is.** Rejected: it is structurally bound to
  opencode sub-agents and the session API and would not run under pi.
- **Keep MCP servers as MCP.** Rejected: pi deliberately has no MCP; keeping
  MCP would require a bridge pi does not provide.
- **Renumber or rewrite the frozen ADRs.** Rejected: ADRs are immutable —
  supersede, don't edit (per `adr/README.md`). Banners preserve history.
