# Graphify Skill-Driven Integration Spec (Phase 1)

> **Date:** 2026-07-20
> **Status:** Approved (design phase)
> **Target repo:** `kyaulabs/prism` (branch off `develop`)
> **Related:** ADR-0031 (model rebalance — Graphify clause in §3a),
> `docs/specs/2026-07-20-graphify-hybrid-deferred-spec.md` (Phase 2,
> gated on this spec's success)
> **Upstream:** https://github.com/Graphify-Labs/graphify

---

## 1. Goal

Make `@explore` **Graphify-first** when a knowledge graph exists, falling back
to the current `glob`/`grep`/`read` pattern when it does not. Graphify
replaces LLM file-reading with deterministic graph traversal for codebase
exploration questions — fewer tokens per query, better-scoped answers, and an
auditable trail of which nodes and edges informed a conclusion.

This is **Phase 1** of a two-phase integration. Phase 1 ships the cheapest
viable surface (vendored skill + command + prompt tweak) so we can *measure*
Graphify's value before committing to MCP plumbing, tier downgrades, or
auto-rebuild hooks. Phase 2 (deferred; see sibling spec) is gated on Phase 1's
eval results.

### 1.1 Why skill-driven and not MCP (the rejected alternative)

Graphify ships `skill-opencode.md` as its integration surface; `--mcp` is one
export mode among many. The skill-driven approach matches upstream's intended
pattern. MCP would be the right *destination* but the wrong *first step* — it
commits Prism to server lifecycle management, a Python hard-dependency, and a
new permission surface before we have data showing Graphify earns its keep.
The skill-driven path is reversible in a single revert; MCP is not.

### 1.2 Fulfillment of ADR-0031's revisit trigger

ADR-0031 §3a states: *"When Graphify integration lands, re-evaluate whether
explore should move further down (UTILITY/Flash) or be replaced by a
Graphify-native agent."* This spec is what "lands" means — Phase 1 puts the
tool in `@explore`'s hands. The tier re-evaluation is Phase 2.

---

## 2. Context

### 2.1 What Graphify is

[Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) is a
deterministic code-graph intelligence layer. From its architecture and
`skill-opencode.md`:

- Builds a codebase knowledge graph using 36 tree-sitter grammars (PHP is
  supported — `test_php_type_resolution.py` exists upstream) and Leiden
  community detection
- AST extraction is deterministic and free (no LLM, no API key for code-only
  corpora); semantic extraction is optional (Gemini if
  `GEMINI_API_KEY`/`GOOGLE_API_KEY` set, otherwise the host LLM)
- Three core commands answer every exploration question pattern:
  - `graphify query "<question>"` — BFS traversal returning a scoped subgraph
  - `graphify query "<question>" --dfs` — DFS traversal tracing a specific path
  - `graphify path "<nodeA>" "<nodeB>"` — shortest-hop path between concepts
  - `graphify explain "<node>"` — plain-language inspection of a specific node
- Outputs land in `graphify-out/` (graph.json, GRAPH_REPORT.md, optional HTML
  viz, cost tracker, manifest for incremental updates)
- Incremental rebuild via `graphify --update` re-extracts only changed files

### 2.2 Package naming quirk

The PyPI package is **`graphifyy`** (double-y) — the singular name was taken.
The CLI binary and Python import are both `graphify`. Installation:

```bash
uv tool install graphifyy        # preferred
# or: pip install graphifyy
```

This quirk must be documented in the vendored skill to prevent install
confusion.

### 2.3 Prism-specific wrinkle

Prism's "codebase" is the harness itself — mostly markdown skills, ADRs, JSON
config, PHP test files, and shell scripts. Graphify's free AST pass covers
PHP/JS/shell; the prose knowledge (skills, ADRs, `CONTEXT.md`) needs the
optional semantic layer. This shapes the value proposition:

- **Code queries** ("where is `EvalCase` validated?", "what calls
  `resolve-identity.sh`?") — AST delivers, no API key needed
- **Prose/domain queries** ("what does the design agent own?", "how does the
  brainstorming flow connect to the plan tab?") — semantic extraction needed;
  either set `GEMINI_API_KEY` or accept the host-LLM fallback

Phase 1 accepts this split. Eval cases (§5) cover both query shapes so we
learn where Graphify excels and where it doesn't.

### 2.4 Current `@explore` state

`@explore` is defined inline in `opencode.jsonc` (lines 112–119) with model,
variant, temperature, and `lsp: allow`. **It has no `prompt` field** — it
inherits opencode's default explorer behavior (glob/grep/read with LSP
augmentation). Phase 1 adds the `prompt` field for the first time.

---

## 3. Components

### 3.1 Vendored Graphify skill — `.opencode/skills/graphify/SKILL.md`

Adapted from upstream `graphify/skill-opencode.md`. Prism-specific
adaptations:

- Frontmatter per the `writing-skills` conventions (name, description)
- **Pruning** — drop modes Prism will not use in Phase 1:
  - `--obsidian`, `--wiki` (vault exports — out of scope)
  - `--neo4j`, `--falkordb`, `--neo4j-push`, `--falkordb-push` (graph DB
    exports — out of scope)
  - `--svg`, `--graphml` (alternate viz formats — out of scope)
  - Video/audio transcription (`--whisper-model`) — Prism has no media corpus
  - `graphify add <url>` (URL ingestion) — out of scope for v1
  - `--watch` (auto-rebuild) — deferred to Phase 2's hook discussion
- **Retention** — keep: build, query (BFS + DFS), path, explain, `--update`,
  `--no-viz` (default for non-interactive use), `--mcp` (documented but not
  wired in Phase 1; flagged as Phase 2)
- **Additions** — Prism-specific sections:
  - "Installation" — the `graphifyy` double-y quirk, Python 3.10+ floor
  - "Graceful degradation" — what `@explore` does when graphify is absent or
    `graphify-out/graph.json` doesn't exist (fall back to glob/grep/read)
  - "Cost notes" — AST is free; semantic extraction costs tokens (Gemini or
    host LLM). Prism's default is AST-only for Phase 1
  - Cross-ref to `CONTEXT.md` glossary entries (§3.5)

### 3.2 `/graphify` command — `.opencode/commands/graphify.md`

Frontmatter: `agent: build` (invokes `bash` to call the graphify CLI; the
build agent is the appropriate primary-agent host). The command is the
human-driven entry point — it does NOT replace `@explore`'s in-flow usage,
which is governed by the skill + prompt update (§3.3).

Modes (auto-detected from `$ARGUMENTS`):

| Mode | Trigger | Action |
|---|---|---|
| `build` (default) | `/graphify`, `/graphify build`, `/graphify <path>` | Run full pipeline; produce `graphify-out/graph.json` |
| `query` | `/graphify query "<question>"` | Run `graphify query` against existing graph |
| `path` | `/graphify path "<nodeA>" "<nodeB>"` | Shortest-path query |
| `explain` | `/graphify explain "<node>"` | Node inspection |
| `update` | `/graphify update` | Incremental rebuild via `graphify --update` |
| `status` | `/graphify status` | Report graph freshness (mtime, node/edge count, last build cost) |

Pre-flight: detect graphify installation (`which graphify`); if absent, print
install instructions and stop. Detect `graphify-out/graph.json` for
query/path/explain modes; if absent, tell the user to run `/graphify build`
first.

### 3.3 `@explore` prompt update — `opencode.jsonc`

Add a `prompt` field to the `explore` agent block (lines 112–119). Draft
directive (final wording owned by the plan/implementation phase):

```text
You are the @explore agent for a KYAULabs PHP project. Your job is focused
codebase exploration — answer the caller's question with the minimum scoped
context needed.

## Graphify-first protocol

Before falling back to glob/grep/read:

1. Check whether `graphify-out/graph.json` exists (one `bash` call: 
   `test -f graphify-out/graph.json`).
2. If it exists AND the caller's question is a structural/relational query
   (callers, definitions, data flow, "what uses X", "where is Y"), run
   `graphify query "<rephrased question>"` via `bash` and treat the scoped
   subgraph as your primary source.
3. If the query returns nothing relevant, OR `graphify-out/graph.json` is
   absent, OR graphify is not installed, fall back to your normal
   glob/grep/read + LSP workflow.

Do NOT rebuild the graph yourself — that is the user's job via `/graphify
build`. If the graph is stale, note it in your answer and proceed with what
exists; the user can rebuild if needed.

`AGENTS.md` is loaded every session — do not restate its rules.
```

Model, variant, temperature, and `lsp: allow` are **unchanged** — `@explore`
stays on JUDGE tier per ADR-0031. Phase 2 may move it to UTILITY.

### 3.4 `.gitignore` entry

Add a new section after the eval suite artifacts block:

```gitignore
# Graphify knowledge graph build artifacts (see .opencode/skills/graphify/)
graphify-out/
```

`graphify-out/` is fully rebuildable from source — no part of it belongs in
git. The graph is a derived artifact, like `vendor/` or `cdn/css/*.min.css`.

### 3.5 `CONTEXT.md` glossary additions

Add three terms to the Domain Glossary table, in the neighborhood of `scout`
and `background subagent` (they describe external tool boundaries):

| Term | Definition |
| --- | --- |
| `graphify` | External Python tool ([Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)) that builds a codebase knowledge graph via tree-sitter AST + Leiden clustering. PyPI package is `graphifyy` (double-y). Opt-in; not a Prism hard-dependency. `@explore` prefers it when a graph exists. See ADR-0031 §3a. |
| `knowledge graph` | The build output at `graphify-out/graph.json` — nodes (symbols, files, concepts) and edges (calls, imports, semantic relationships). Consumed by `@explore` via `graphify query/path/explain`. Gitignored; rebuildable from source. |
| `graphify-out/` | Build artifact directory for Graphify outputs (`graph.json`, `GRAPH_REPORT.md`, cost tracker, manifest). Gitignored. Lives at repo root. |

Also update the **System Boundaries → Delegates** section to add Graphify as
an external tool boundary alongside Semgrep, git-cliff, etc.

### 3.6 Documentation cross-refs

- `AGENTS.md` — no change required in Phase 1 (the `@explore` row in the
  Agents table stays accurate; graphify-first is a behavior detail owned by
  the skill + prompt, not a stack change)
- `.opencode/docs/model-configuration.md` — already documents `explore`'s
  tier with the ADR-0031 "pre-Graphify bridge" note; no change needed
- `CODING_HARNESS.md` — update the `@explore` description (line 119 area) to
  note graphify-first behavior when a graph exists
- `README.md` — add Graphify to the "Delegates" or "External tools" section
  if one exists; otherwise skip (not user-facing in Phase 1)

### 3.7 Eval cases — `.opencode/evals/smoke/`

Three new smoke cases measuring `@explore` behavior. These become the
**baseline for Phase 2's re-validation gate** — Phase 2 must show no
regression against this baseline.

| Case file | Scenario | Expected behavior |
|---|---|---|
| `explore-uses-graph-when-present.json` | Graph exists; caller asks "where is EvalCase validated?" | `@explore` invokes `graphify query` (observable in bash transcript); answer cites scoped subgraph |
| `explore-falls-back-when-graph-absent.json` | No `graphify-out/`; same question | `@explore` uses glob/grep/read (no graphify invocation); answer still correct |
| `explore-handles-missing-graphify-binary.json` | Graphify not installed; graph directory absent | `@explore` degrades gracefully; no error spam; clear fallback to direct reads |

Cases follow the existing `.opencode/evals/schema.json` shape. `passCriteria`
is `'manual inspection required'` for v1 (behavioral confirmation); may
tighten to `'output contains expected string'` once patterns stabilize.

---

## 4. Boundaries (explicitly out of scope for Phase 1)

| Deferred to | Item | Why deferred |
|---|---|---|
| Phase 2 | MCP server config in `opencode.jsonc` | Operational commitment premature without eval data |
| Phase 2 | `@explore` tier downgrade (JUDGE → UTILITY) | ADR-0031 says re-evaluate *after* integration lands with data |
| Phase 2 | Post-commit auto-rebuild hook | Build cadence solution belongs with the cadence problem |
| Phase 2 | ADR for the integration decision | Covered by ADR-0031 §3a in Phase 1; supersion ADR lands with Phase 2 |
| Never (v1) | Semantic extraction config (Gemini API key wiring) | AST-only is sufficient for code queries; prose queries use host-LLM fallback |
| Never (v1) | Graphify installation automation | User installs manually; documented in skill |
| Never (v1) | Obsidian vault, Neo4j, FalkorDB, SVG/GraphML exports | No use case in Prism |

---

## 5. Testing & evaluation

### 5.1 Manual validation (pre-merge)

1. Install graphify: `uv tool install graphifyy`
2. Build graph on Prism repo: `/graphify build`
3. Confirm `graphify-out/graph.json` exists with non-trivial node count
4. Run sample queries:
   - `/graphify query "where is EvalCase validated?"`
   - `/graphify path "EvalCase" "Runner"`
   - `/graphify explain "EvalCase"`
5. Dispatch `@explore "where is EvalCase validated?"` and observe whether it
   invokes `graphify query` in its bash transcript
6. Remove `graphify-out/`, repeat the `@explore` dispatch, confirm it falls
   back to glob/grep/read with no error

### 5.2 Eval suite

Run the three new eval cases (§3.7) plus the existing smoke suite to confirm
no regression:

```bash
php .opencode/evals/bin/run.php .opencode/evals/smoke/explore-*.json
```

### 5.3 Harness test coverage

Phase 1 makes **no PHP code changes** — all changes are config, markdown, and
JSON. The existing harness test suite
(`tests/Unit/Harness/ArchTest.php`, `RcsHeaderConventionTest.php`,
`ModelConfigTest.php`) must still pass unchanged. No new harness tests are
required in Phase 1 (the eval cases cover behavioral validation).

### 5.4 `/check` gate

Pre-push gate must pass on changed files. Phase 1 changes are
markdown/JSON/shell — `php-cs-fixer` is a no-op, `stylelint`/`eslint` are
no-ops, `pest --coverage` is unchanged. The gate runs clean by construction.

---

## 6. Acceptance criteria

Phase 1 is complete when ALL of the following hold:

- [ ] `.opencode/skills/graphify/SKILL.md` exists, follows `writing-skills`
      conventions, and documents installation + graceful degradation
- [ ] `.opencode/commands/graphify.md` exists and supports build/query/path/
      explain/update/status modes
- [ ] `opencode.jsonc` `explore` block has a `prompt` field with the
      graphify-first directive; model/variant/temperature unchanged
- [ ] `.gitignore` excludes `graphify-out/`
- [ ] `CONTEXT.md` has the three new glossary terms + System Boundaries
      update
- [ ] `CODING_HARNESS.md` `@explore` description updated
- [ ] Three eval cases exist in `.opencode/evals/smoke/`
- [ ] Manual validation (§5.1) completed and documented in the PR description
- [ ] Eval suite (§5.2) passes — cases either pass, or failures are
      documented as Phase 2 abort signals
- [ ] Existing harness test suite passes unchanged
- [ ] `/check` passes on changed files

**Phase 2 trigger signal:** eval data from §5.2 shows `@explore` consumes
meaningfully fewer tokens OR returns better-scoped answers with the graph
present. If neither, abort Phase 2 and iterate on Phase 1 (or accept that
Graphify doesn't fit Prism's markdown-heavy corpus).

---

## 7. Dependencies

| Dependency | Type | Notes |
|---|---|---|
| `graphifyy` (PyPI) | User-installed Python package | Opt-in; `uv tool install graphifyy` or `pip install graphifyy` |
| Python 3.10+ | System runtime | Graphify's minimum version |
| No new Composer deps | — | Phase 1 touches no PHP dependencies |
| No new npm deps | — | Phase 1 touches no JS dependencies |

Graphify is **not** added to `composer.json`, `package.json`, or any Prism
lockfile. It is a user-space tool, documented but not enforced. This is
consistent with how Prism treats Semgrep, git-cliff, and other external
tools per `CONTEXT.md` System Boundaries → Delegates.

---

## 8. Future work (Phase 2 pointer)

**Sibling spec:** `docs/specs/2026-07-20-graphify-hybrid-deferred-spec.md`

Phase 2 is gated on Phase 1's eval results. It adds:

- MCP server config (structured tool access)
- `@explore` tier downgrade JUDGE → UTILITY (per ADR-0031 revisit trigger)
- Post-commit incremental rebuild hook
- `ModelConfigTest.php` guard updates
- ADR superseding the skill-driven approach (while retaining the skill as
  fallback)

Do not start Phase 2 without re-validating the gate criteria in the sibling
spec's §2.

---

## 9. Rollback plan

Phase 1 is fully additive — all changes are new files or appended content.
Rollback is a single-revert operation:

1. `git revert <phase-1-merge-commit>` — removes all six components
2. `@explore` returns to its prompt-less default behavior
3. `graphify-out/` (if present locally) is unaffected — it's gitignored and
      rebuildable
4. No data loss, no migration, no schema changes

If partial rollback is needed (e.g., keep the skill but revert the prompt),
each component is independently revertible since they touch separate files.
