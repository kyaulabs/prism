# Graphify @explore Integration Debug — Implementation Plan

> **For agentic workers:** This plan is **investigation-first**. Phases 0–1 run
> under the `@debug` agent (6-phase loop: feedback → reproduce → hypothesize →
> instrument → fix → post-mortem). Only if a fix is confirmed does Phase 2
> switch to `@tdd` (Red → Green → Refactor). Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Determine why the `@explore` agent never invokes `graphify query`
(it always falls back to glob/grep/read), and re-establish a functional
Phase 1 so the Phase 2 gate can be scored against real data.

**Architecture:** Graphify works when run by hand via `/graph`; the defect is
in the `@explore` Graphify-first protocol (`.opencode/agents/explore.md`
L34–44), which is advisory and never triggers. This plan reproduces the
failure under controlled conditions, isolates the root cause, and routes to a
minimal TDD fix only if the cause is a prompt/protocol issue. If the cause is
extraction quality, it triggers the Phase 2 §2.4 abort path instead.

**Spec:** `docs/specs/2026-07-20-graphify-skill-driven-spec.md` (Phase 1),
`docs/specs/2026-07-20-graphify-hybrid-deferred-spec.md` (Phase 2, deferred).

**Related ADRs:** ADR-0031 §3a (explore tier revisit trigger), ADR-0033
(Graphify cost lever), ADR-0034 (`graphify_*` forward-looking grant).

## Evidence snapshot (2026-07-26)

| Fact | Source |
|---|---|
| `graphify-out/graph.json` is ABSENT on this machine | filesystem (gitignored; repo redone, never rebuilt) |
| Graphify works standalone (builds + queries by hand) | user report (2026-07-26) |
| `@explore` "never used it" — always falls back to glob/grep | user report (2026-07-26) |
| 3 smoke evals use `pass_criteria: "manual inspection required"` | `.opencode/evals/smoke/explore-*.json` |
| `.opencode/evals/results/`: 223 files, ZERO PASS verdicts | filesystem |
| No before/after token data captured anywhere | repo-wide search |
| Phase 2 gate (spec §2) unscoreable — no valid Phase 1 data | analysis |

## Phase 0–1 Results (executed 2026-07-26) → §2.4 ABORT

The environment was unblocked (graphify 0.9.27 installed, graph built: 1283
nodes / 1782 edges) and the protocol was tested empirically. Outcome: **the
`@explore` integration is aborted** (ADR-0038). Findings that drove it:

- **Protocol works.** With the graph present, `@explore` *does* invoke
  `graphify query`, judges the result insufficient, and falls back to
  glob/grep. The user's "never used it" was because the graph was absent most
  of the week + invisible-when-invoked (poor results → fallback).
- **No cross-file/reverse-call extraction.** `aurora/tests/Unit/AuroraTest.php`
  is in the graph (degree 1, only its TestCase import) despite calling
  `htmlHeader()` 14 times. Zero call edges. `htmlHeader` degree 2 (class + 1
  outgoing call). The AST layer captures definitions + intra-class/intra-file
  calls, NOT inter-file call sites or reverse callers.
- **NL query layer imprecise.** `graphify query "<NL>"` floods results with
  whole neighborhoods and unrelated files. `graphify explain <node>` is
  reliable, but `@explore`'s entry point is NL (it doesn't know node names
  a priori), so it must use `query`.
- **`--mode deep` did not help.** +19 edges graph-wide (~$0.14); no
  reverse-call edges; no precision gain.
- **LSP overlap confirmed.** `findReferences` on `htmlHeader` returns all 12
  cross-file call sites (exact lines) in one call; Graphify returns 0. LSP is
  already wired into `@explore` (`lsp: allow`) and is strictly superior for
  the structural queries Graphify cannot answer.

**Resolution:** revert the `@explore` Graphify-first protocol (done); remove
the 3 obsolete smoke evals (done); mark the Phase 2 spec as Aborted (done);
record the decision in ADR-0038 (done); update `CONTEXT.md` glossary +
boundaries (done). `/graph` and the vendored skill stay manual-only.

## Global constraints

- Do NOT touch the Graphify MCP server, the `@explore` model/variant/
  temperature, or ADR-0031 §3a — all Phase 2 scope.
- Do NOT rebuild the graph from within `@explore` (the protocol explicitly
  forbids this; it's the user's job via `/graph build`).
- `@debug` may create repro tests/harnesses/instrumentation, but must NOT
  edit the production `@explore` prompt — that routes through `@tdd`.
- Stay within the existing `@explore` bash allowlist: `graphify query*`,
  `graphify path*`, `graphify explain*`, `test -f*`.

---

## Phase 0 — Reproduce (under `@debug`)

**Files read/verified:**
- `.opencode/agents/explore.md` (the protocol, L29–44)
- `.opencode/skills/graphify/SKILL.md` (install + usage)
- `graphify-out/graph.json` (must exist after Step 0.2)

- [ ] **Step 0.1: Confirm graphify binary**
  Run: `graphify --version`
  Expected: a version string `>= 0.9.27`.
  If "command not found": install via `uv tool install 'graphifyy>=0.9.27'`
  (per `.opencode/skills/graphify/SKILL.md` L36), then re-check.

- [ ] **Step 0.2: Build the graph**
  Run: `/graph build` (or `graphify build` per SKILL.md)
  Expected: `graphify-out/graph.json` created, non-trivial size (~858 KB per
  ADR-0033).
  Verify: `test -f graphify-out/graph.json && du -h graphify-out/graph.json`
  If the build fails or yields an empty/tiny graph → STOP; report as a
  separate defect (extraction/build issue).

- [ ] **Step 0.3: Reproduce on queries (graph present)**
  For each query below, dispatch `@explore` (or run its prompt in isolation)
  and record in a findings table: ran `test -f`? (Y/N), ran `graphify query`?
  (Y/N), query result (relevant/empty/garbage), final answer source
  (graph/glob-grep/LSP), approx tokens.

  | # | Query | Expected Graphify fit |
  |---|---|---|
  | Q1 | "Which files call `htmlHeader()`?" | Structural — should fire |
  | Q2 | "What does `aurora.inc.php` include or require?" | Structural — should fire |
  | Q3 | "Trace the call path from a public page entry to the SQL handler." | Relational — should fire |
  | Q4 | "What does ADR-0031 §3a say about the explore tier?" | Prose/markdown — may legitimately skip |

- [ ] **Step 0.4: Gate — does the bug reproduce with the graph present?**
  - Q1–Q3 fired `graphify query` → **bug does NOT reproduce**; earlier "not
    working" was the absent graph → skip to Phase 3.
  - Q1–Q3 skipped to glob/grep → **bug confirmed** → continue to Phase 1.

## Phase 1 — Hypothesize & instrument (under `@debug`)

- [ ] **Step 1.1: Rank hypotheses against evidence**
  1. Soft "structural query" discretion too permissive — agent self-classifies
     most queries as non-structural and skips (most likely).
  2. Agent skips the `test -f` check entirely — pure non-compliance.
  3. `graphify query` runs but returns nothing relevant — extraction-quality
     gap on Prism's corpus (Phase 2 §2.4 abort signal if true).
  4. Bash permission pattern `graphify query*` doesn't match the actual
     invocation — silent deny → fallback.
  5. Model (DeepSeek-Pro @ JUDGE/medium) doesn't follow advisory prompt
     instructions reliably.

- [ ] **Step 1.2: Instrument to disambiguate**
  Add minimal logging/telemetry (e.g., a wrapper or verbose dispatch) that
  records per-call: whether `test -f` ran, whether `graphify query` ran, the
  raw query output, and token usage. Re-run Q1–Q3.

- [ ] **Step 1.3: Deliver findings report**
  Produce: confirmed root cause(s), ranked; proposed minimal protocol change
  (e.g., make `test -f` mandatory; flip Graphify to default-on with explicit
  opt-out; tighten the "structural" definition); per-call token data (seeds
  Phase 2 §2.1 gate).
  **Do NOT edit the production prompt** — return for routing to `@tdd`.

## Decision tree

| Phase 0–1 finding | Next action |
|---|---|
| @explore fires Graphify when graph present | No bug → **Phase 3** (real evaluation period) |
| Skips; cause is prompt/discretion (1, 2, 5) | → **Phase 2** (`@tdd` fix) |
| Skips; cause is extraction quality (3) | **Phase 2 §2.4 abort signal** — pause; reconsider manual-only `/graph` exit |
| Skips; cause is permission pattern (4) | Trivial config fix in `opencode.jsonc` `@explore` permission block |

## Phase 2 — Fix (conditional, under `@tdd`)

Only entered if Phase 1 names a prompt/protocol cause. A separate
`writing-plans` session produces the exact TDD tasks once the root cause and
fix approach are confirmed — this plan deliberately does NOT fabricate fix
code for an unknown root cause (no placeholders).

Likely fix surface (to be detailed post-investigation):
- Harden `.opencode/agents/explore.md` Graphify-first protocol (mandatory
  check; default-on / explicit opt-out; tighter "structural" definition).
- Tighten `.opencode/evals/smoke/explore-uses-graph-when-present.json` from
  `"manual inspection required"` to an assertable criterion.
- Gate: 3 smoke evals pass; `/check` clean; `@code-review` clean.

## Phase 3 — Real evaluation period

- Use `@explore` with Graphify live for the intended duration (Phase 2 spec
  §2.2: ≥2 weeks or equivalent dispatch volume).
- Capture before/after token data (graph present vs. controlled fallback)
  for the §2.1 ≥20% reduction criterion.

## Phase 4 — Score the Phase 2 gate

- Evaluate against `docs/specs/2026-07-20-graphify-hybrid-deferred-spec.md` §2
  (quantitative + qualitative + architectural).
- If go: invoke ADR-0031 §3a revisit trigger in a new Phase 2 ADR; flip the
  deferred spec's Status to `Approved (design phase)`.
- If no-go: document in the deferred spec's Status line; consider the
  manual-only `/graph` exit.

## Out of scope

- `@architect` run (change is confined to `@explore` prompt + one eval; not
  cross-cutting).
- Phase 2 MCP server, tier downgrade, post-commit auto-rebuild hook — blocked
  until Phase 0–3 produce real data.
- ADR-0031 §3a edit — its revisit trigger is a Phase 2 ADR task, not a
  pre-gate step.
