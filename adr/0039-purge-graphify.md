# 0039. Purge Graphify Entirely

Date: 2026-07-26

## Status

Accepted

Supersedes the manual-only `/graph` retention in ADR-0038.

## Context

ADR-0038 aborted the Graphify→`@explore` integration but deliberately retained
`/graph` and the vendored `graphify` skill as manual-only tools, on the
rationale that `graphify explain`/`path` retained some value for a human
driver. On review, the user directed a full purge: Graphify proved useless
even as a manual tool, because:

- The structural queries a human would most want ("who calls X", "where is X
  used") are exactly the cross-file/reverse-call queries Graphify does not
  extract (ADR-0038, AuroraTest proof).
- LSP (`findReferences`, `callHierarchy`) answers those queries accurately in
  one call with no graph build — and is already wired into every code-navigating
  agent. There is no manual query Graphify answers that LSP does not answer
  better.
- The remaining Graphify surface (`explain` single-node, community clustering)
  overlaps with `grep`/`read`/LSP for daily use, and carried real maintenance
  cost: a vendored skill + reference docs (which themselves required two
  hardening PRs, #207/#208, including a `--break-system-packages` supply-chain
  fix), a command, a `chat`-agent permission grant, glossary terms, and doc
  references across `AGENTS.md`, `CONTEXT.md`, `CODING_HARNESS.md`, and
  `README.md`.

Net: the manual-only retention preserved surface area and dead configuration
for no demonstrated value.

## Decision

We remove Graphify entirely. Specifically:

- **Delete** the `/graph` command (`.opencode/commands/graph.md`).
- **Delete** the vendored `graphify` skill directory
  (`.opencode/skills/graphify/` — `SKILL.md` + `reference/`).
- **Uninstall** the `graphifyy` Python package (removes the `graphify` and
  `graphify-mcp` binaries). The `graphify-out/` local build artifacts are
  gitignored and untracked; the agent's safety hook blocks recursive deletion,
  so local cleanup (`rm -rf graphify-out`) is handed off to the user.
- **Remove** the `chat` agent's forward-looking `graphify_*: allow` permission
  grant from `opencode.jsonc` (and the two Graphify mentions in the chat
  prompt).
- **Remove** the `graphify`, `knowledge graph`, and `graphify-out/` glossary
  terms from `CONTEXT.md`, and the Graphify entry from System Boundaries.
- **Scrub** Graphify references from `AGENTS.md` (MCP section, skills table,
  `@explore` description, commands table), `CODING_HARNESS.md`, `README.md`,
  and `.gitignore` (drop the `graphify-out/` entry).

**Retained (deliberately):**

- The `validate-harness.sh` `--break-system-packages` guard (ADR-0036 fail-closed
  posture). It is generic — it scans *all* `.opencode/**` markdown code blocks
  for the PEP-668 override regardless of package — and remains valuable. Its
  test fixtures happen to use `graphifyy` as the example package; they still
  exercise the generic guard correctly and are left as-is.
- LSP as the structural-navigation tool for `@explore` (and the other seven
  `lsp: allow` agents). `findReferences`/`callHierarchy` answer cross-file
  structural queries that Graphify could not.
- The `ExploreAgentTest.php` guard test (added with ADR-0038) that asserts
  `@explore` carries no Graphify carve-out/protocol — it remains meaningful as
  a re-introduction guard.
- The historical record: ADR-0031 §3a, ADR-0032, ADR-0033, ADR-0034 bodies are
  left unchanged per the `adr` skill's no-edit rule, as are the merged
  Graphify plan/spec documents under `docs/`. They document past work; ADR-0038
  + this record document the reversal.

## Consequences

**Positive**

- No dead configuration or vestigial skill/command surface to maintain.
- No forward-looking permission grant (`graphify_*`) implying capability that
  does not exist.
- Smaller cognitive load: the harness has one structural-navigation story
  (LSP), not two.

**Negative**

- If a future `graphifyy` release closes the cross-file/reverse-call extraction
  gap AND improves NL query precision, re-introducing it would require
  restoring the skill, command, and wiring from git history. (Low cost; the
  diff is recoverable and the decision trail is in ADR-0038 + this record.)

**Neutral**

- ADR-0031 §3a's "Graphify revisit trigger" is now permanently moot (Phase 2
  will never land). The clause is left in place as historical record rather
  than editing an Accepted ADR.

## Alternatives Considered

- **Keep manual-only `/graph` (ADR-0038's stance).** Rejected — the user judged
  Graphify useless even manually, since every useful manual query is better
  served by LSP, and the retained surface carried maintenance cost (including
  the supply-chain hardening that #208 had to fix).

- **Narrow Graphify to `explain`/`path` only.** Rejected — no demonstrated
  value over LSP/`grep`/`read`, and retaining any surface keeps the maintenance
  burden (skill, command, permission, docs) for a tool that delivers none.
