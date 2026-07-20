---
name: graphify
description: Use when exploring codebase structure, call paths, or symbol relationships via Graphify's knowledge graph — especially when graphify-out/graph.json exists. Provides query, path, and explain commands for deterministic code-graph traversal.
---

Graphify turns the codebase into a navigable knowledge graph. When a graph
exists at `graphify-out/graph.json`, prefer it over manual `glob`/`grep`/`read`
for structural and relational queries.

## When to use

- A caller asks "what calls X", "where is Y defined", "trace the data flow
  through Z" — structural/relational questions
- `graphify-out/graph.json` exists (check with `test -f
  graphify-out/graph.json`)
- You need scoped context rather than whole-file reads

## When NOT to use

- `graphify-out/graph.json` is absent — fall back to `glob`/`grep`/`read`
- The caller asks about a specific file's contents — just `read` it
- Graphify is not installed (`which graphify` fails) — fall back silently
- The question is about prose content not represented in the AST (skills,
  ADRs, docs) — unless semantic extraction was run

## Installation

Graphify is a Python tool. The PyPI package name has a double-y quirk:

```bash
uv tool install graphifyy        # preferred
# or: pip install graphifyy
```

Requires Python 3.10+. Verify with `graphify --version`.

## Commands

### Query (BFS traversal — broad context)

```bash
graphify query "how does EvalCase validation work?"
```

Returns a scoped subgraph of relevant nodes and edges. Use for
"what does X connect to" questions.

### Query (DFS — trace a specific path)

```bash
graphify query "how does EvalCase validation work?" --dfs
```

Use when tracing a specific call chain or data flow.

### Path (shortest hop between two concepts)

```bash
graphify path "EvalCase" "Runner"
```

Returns the shortest path connecting two nodes. Use for "how does X
relate to Y" questions.

### Explain (deep inspection of one node)

```bash
graphify explain "EvalCase"
```

Returns plain-language description of a single node. Use when the caller
asks "what is X" or needs detail on one symbol.

### Build and update

Graph building is the user's job — run `/graph build` or
`/graph update`. Do NOT rebuild the graph yourself during exploration.
If you suspect the graph is stale, note it in your answer; the user can
rebuild. The `--no-viz` flag skips HTML visualization generation (default
for non-interactive use where only `graph.json` matters).

## Graceful degradation

If `graphify-out/graph.json` does not exist, OR `graphify` is not installed,
OR a query returns nothing relevant — fall back to your normal
`glob`/`grep`/`read` + LSP workflow. Do not error; do not ask the user to
install anything. Note the fallback in your answer if the caller asked a
structural question that a graph would answer better.

## Cost notes

- AST extraction (code files: PHP, JS, shell) is **free** — no LLM, no API
  key. This covers most structural queries.
- Semantic extraction (docs, ADRs, prose) uses Gemini if
  `GEMINI_API_KEY`/`GOOGLE_API_KEY` is set, otherwise the host LLM. This is
  opt-in; the default is AST-only.

## Full build pipeline reference

The commands above cover exploration queries. For the full build pipeline
(manifest, detect, AST + semantic extraction, cluster, label, export), see
`reference/upstream-pipeline.md` — the vendored upstream skill. Humans
building or rebuilding the graph should consult that reference.

## Phase 2 note

The `--mcp` flag starts an MCP stdio server for agent access. This is
documented for awareness but NOT wired in Phase 1. Phase 2 (see
`docs/specs/2026-07-20-graphify-hybrid-deferred-spec.md`) will add MCP
server config to `opencode.jsonc` with per-agent permission gating,
replacing the bash-invocation path with structured MCP tools.

## Cross-refs

- `/graph` command — human-driven build/query/path/explain entry point
- `@explore` agent — uses this skill via its prompt directive
- `CONTEXT.md` glossary — terms: `graphify`, `knowledge graph`, `graphify-out/`
- ADR-0031 §3a — the Graphify clause that anticipated this integration
- Phase 1 spec — `docs/specs/2026-07-20-graphify-skill-driven-spec.md`

## Gotchas

- *Package name is `graphifyy` (double-y)* — the singular PyPI name was
  taken. The CLI binary and Python import are both `graphify` (single-y).
  Installation fails silently if you `pip install graphify` (wrong package).
- *Graph staleness* — the graph reflects the codebase at build time. If
  files changed since the last `/graph build`, results may reference
  deleted symbols or miss new ones. Note suspected staleness in your
  answer.
- *Markdown-heavy corpus* — Prism's codebase is mostly markdown (skills,
  ADRs, docs). AST extraction covers PHP/JS/shell; prose queries need
  semantic extraction. If a query returns thin results, the content may be
  in docs that semantic extraction didn't process.
- *Do not rebuild during exploration* — building takes time and may prompt
  for an API key. Note the need and let the user rebuild via `/graph
  build`.
