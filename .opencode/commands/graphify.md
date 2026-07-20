---
description: "Build, query, and manage the Graphify knowledge graph. Modes: build (default), query, path, explain, update, status. Requires the graphifyy Python package (see .opencode/skills/graphify/SKILL.md)."
agent: build
---

Manage the Graphify knowledge graph for the current repository. Detects the
mode from `$ARGUMENTS` and dispatches to the appropriate `graphify` CLI
command.

## Pre-flight

Check whether graphify is installed:

```bash
command -v graphify >/dev/null 2>&1 || {
    echo "graphify is not installed."
    echo ""
    echo "Install:"
    echo "  uv tool install graphifyy   # preferred"
    echo "  pip install graphifyy       # alternative"
    echo ""
    echo "The PyPI package is 'graphifyy' (double-y). See:"
    echo "  .opencode/skills/graphify/SKILL.md"
    exit 1
}
```

## Mode detection

Parse the first argument from `$ARGUMENTS` (or `$1`):

| `$1` | Mode | Action |
| --- | --- | --- |
| *(empty)*, `build` | **build** | Full pipeline: `graphify .` |
| `update` | **update** | Incremental: `graphify --update` |
| `query` | **query** | `graphify query "$REST"` (BFS by default; `--dfs` if arg present) |
| `path` | **path** | `graphify path "$2" "$3"` |
| `explain` | **explain** | `graphify explain "$2"` |
| `status` | **status** | Report graph freshness (see below) |
| `--help`, `-h` | **help** | Print this usage section and stop |

For `query`, `path`, `explain`: verify `graphify-out/graph.json` exists first.
If absent, print: "No graph found. Run `/graphify build` first." and stop.

## Build mode

Run the full Graphify pipeline on the current directory:

```bash
graphify .
```

This produces `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`, and
optional HTML visualization. The `graphify-out/` directory is gitignored.

For deeper extraction (richer INFERRED edges):

```bash
graphify . --mode deep
```

For incremental rebuild (re-extract only changed files):

```bash
graphify --update
```

## Query mode

Requires `graphify-out/graph.json`. Usage:

```
/graphify query <question>
/graphify query <question> --dfs
/graphify query <question> --budget 1500
```

Run:

```bash
test -f graphify-out/graph.json || { echo "No graph. Run /graphify build first."; exit 1; }
graphify query "$REST"
```

## Path mode

Shortest path between two concepts:

```
/graphify path EvalCase Runner
```

Run:

```bash
test -f graphify-out/graph.json || { echo "No graph. Run /graphify build first."; exit 1; }
graphify path "$2" "$3"
```

## Explain mode

Deep inspection of a single node:

```
/graphify explain EvalCase
```

Run:

```bash
test -f graphify-out/graph.json || { echo "No graph. Run /graphify build first."; exit 1; }
graphify explain "$2"
```

## Status mode

Report graph freshness without modifying anything:

```bash
if [ ! -f graphify-out/graph.json ]; then
    echo "No graph exists. Run /graphify build to create one."
    exit 0
fi

NODES=$(python3 -c "import json; print(len(json.load(open('graphify-out/graph.json'))['nodes']))" 2>/dev/null || echo "?")
EDGES=$(python3 -c "import json; print(len(json.load(open('graphify-out/graph.json'))['edges']))" 2>/dev/null || echo "?")
MTIME=$(stat -c '%y' graphify-out/graph.json 2>/dev/null || stat -f '%Sm' graphify-out/graph.json 2>/dev/null || echo "unknown")

echo "Graph status:"
echo "  Nodes:     $NODES"
echo "  Edges:     $EDGES"
echo "  Built:     $MTIME"
```

## Rules

- Never `git add` anything in `graphify-out/` — it is gitignored.
- Build mode may take 30+ seconds on large repositories. Warn the user.
- Query/path/explain require a pre-built graph. Check before invoking.
- If `graphify` returns an error, surface it verbatim — do not interpret.
- For the full build pipeline reference (manifest, detect, AST + semantic
  extraction, cluster, label, export), see
  `.opencode/skills/graphify/reference/upstream-pipeline.md`.

Arguments: $ARGUMENTS
