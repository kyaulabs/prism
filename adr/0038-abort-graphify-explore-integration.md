# 0038. Abort Graphify @explore Integration (Phase 2)

Date: 2026-07-26

## Status

Accepted

## Context

Phase 1 of the Graphify integration (PR #173 + hardening #207/#208) shipped a
skill-driven surface: a vendored `graphify` skill, the `/graph` command, a
Graphify-first protocol wired into the `@explore` subagent prompt, three smoke
evals, and `CONTEXT.md` glossary entries. Phase 2 (MCP server + tier downgrade
+ post-commit rebuild hook) was deferred and explicitly gated on Phase 1
delivering measurable value (Phase 2 spec §2: ≥20% token reduction on
structural queries, or measurable quality improvement).

After a week of intended production use, the user reported Graphify "was not
working at all" — specifically that `@explore` "never used it." An empirical
investigation (`docs/plans/2026-07-26-graphify-explore-integration-debug.md`)
rebuilt the graph (`graphify-out/graph.json`, 1283 nodes / 1782 edges) and
tested the integration under controlled conditions. Findings:

1. **The `@explore` protocol works correctly.** When the graph is present,
   `@explore` does invoke `graphify query`, judges the result, and falls back
   to glob/grep when the result is insufficient. The user's "never used it"
   perception was because (a) the graph was absent most of the week, and (b)
   even when invoked, Graphify's contribution was invisible — results were too
   poor to use, so the final answer always came from the fallback.

2. **Graphify does not extract cross-file call-site edges.** Decisive proof:
   `aurora/tests/Unit/AuroraTest.php` is in the graph (degree 1 — only its
   `TestCase` import) despite calling `htmlHeader()` 14 times. Zero
   `AuroraTest → htmlHeader` call edges exist. `htmlHeader` itself has degree 2
   (its class + one outgoing call). The AST layer captures definitions, intra-
   class structure, imports, and intra-file calls — but not inter-file call
   relationships or reverse "called-by" edges.

3. **The natural-language query layer is imprecise.** `graphify query "<NL>"`
   matches keywords loosely and floods results with whole neighborhoods and
   unrelated files (e.g. `tsconfig.json`, `composer.json`, unrelated ADRs).
   The relevant nodes are often present in the graph; the query just cannot
   surface them cleanly. `graphify explain <node>`, by contrast, is reliable.

4. **`--mode deep` did not help.** A deep rebuild (+19 edges graph-wide, ~$0.14
   of DeepSeek credit) added no reverse-call edges and did not improve query
   precision.

5. **LSP already owns the lane Graphify cannot fill.** `@explore` has
   `lsp: allow` (AGENTS.md). `findReferences` on `htmlHeader` returns all 12
   cross-file call sites in `AuroraTest.php` with exact locations — in one
   tool call, no graph build — where Graphify returns zero. LSP is strictly
   superior for the cross-file structural queries that are `@explore`'s
   primary structural use case.

Net: Graphify adds tokens (the graph check + query + parsing the output into
`@explore`'s context) and delivers no quality gain, then `@explore` falls back
anyway. This is the exact definition of the Phase 2 §2.4 abort signal
("Graphify adds tokens without improving quality"), and the §2.1 quantitative
gate (≥20% token *reduction*) fails in the wrong direction.

## Decision

We abort the Graphify→`@explore` integration. Specifically:

- **Revert** the Graphify-first protocol from `.opencode/agents/explore.md`,
  including its `graphify query/path/explain` and `test -f` bash permissions.
  `@explore` returns to its glob/grep/read + LSP workflow.
- **Remove** the three obsolete smoke evals under `.opencode/evals/smoke/`
  that asserted Graphify-invocation behavior.
- **Mark Phase 2 as Aborted** in
  `docs/specs/2026-07-20-graphify-hybrid-deferred-spec.md` (this decision
  record is the documented reason the spec's Status line requires).
- **Keep `/graph` and the vendored `graphify` skill as manual-only tools.**
  `graphify explain` and (with caveats) `graphify path` retain genuine value
  for a human exploring single-node neighborhoods and concept communities
  across docs + code. The skill, command, and ADR-0034's forward-looking
  `graphify_*` permission grant (inert today) remain unchanged.
- **Do not** invoke ADR-0031 §3a's revisit trigger — Phase 2 did not land, so
  there is no `@explore` tier change to reconsider.

This is a current-version sufficiency finding, not a permanent verdict: the
blockers (cross-file/reverse-call extraction; NL query precision) are
potentially addressable upstream. If a future `graphifyy` release closes those
gaps, the integration can be re-evaluated.

## Consequences

**Positive**

- `@explore` stops paying a per-dispatch context-token tax for zero value,
  directly serving ADR-0033's DeepSeek cost-reduction goal.
- Structural "who calls X" / "what uses X" queries continue to be served by
  LSP (Intelephense), which is already wired and strictly more accurate.
- `/graph` remains available for manual concept/neighborhood exploration.

**Negative**

- Sunk cost: Phase 1 (5 commits + 2 hardening PRs) and the deferred Phase 2
  spec did not pay off as an `@explore` integration.
- Semantic/concept navigation across the docs+code corpus is no longer
  reachable from `@explore`'s default flow (only via manual `/graph`).

**Neutral**

- ADR-0034's `graphify_*` grant stays as a documented inert no-op.
- The `graphify-out/` directory remains gitignored; a fresh `/graph build` is
  still required on each clone if manual use is desired.

**Follow-up (not blocking)**

- Consider an `@explore` prompt-tuning pass that prefers LSP
  `findReferences`/`callHierarchy` for structural "who/where" queries over
  grep — the earlier dispatch showed `@explore` falling back to grep rather
  than LSP. That is an independent improvement and does not depend on this
  ADR.

## Alternatives Considered

- **Ship Phase 2 MCP server anyway.** Rejected — the MCP server is a transport
  change (CLI → structured tool), not an extraction change. It would expose
  the same `graphify_query`/`path`/`explain` over the same deficit graph.
  Cannot fix query precision or missing reverse-call edges.

- **`--mode deep` rebuild before deciding.** Tried — added +19 edges graph-
  wide, no reverse-call edges, no precision improvement. Did not change the
  verdict.

- **Narrow the integration to query types Graphify handles (`explain`/`path`).**
  Rejected — `@explore`'s entry point is a natural-language question and it
  does not know exact node names a priori, so it must use the `query` (NL)
  interface, which is the imprecise layer. `explain`/`path` suit a human
  driving `/graph`, not `@explore`'s workflow.

- **Keep the protocol as a harmless future-proof fallback.** Rejected —
  "harmless" was disproven: it adds recurring context-token overhead for zero
  value, and even future Graphify improvements would not change the corpus-
  fit mismatch for `@explore`'s NL query pattern. Re-wiring later (if ever
  warranted) is a one-line prompt edit; the skill and evals (in git history)
  remain recoverable.
