---
name: finding-duplicate-functions
description: "Use when seeking semantic duplication in a codebase — functions that solve the same problem for different callers. Complements /improve-architecture's deletion test. Two-phase: classical extraction then LLM intent-clustering."
derived-from: obra/superpowers-lab (MIT, © Jesse Vincent)
---

# Finding Duplicate Functions

Detect semantic duplication — functions that solve the same problem but look
different enough to escape a simple token-diff. Duplicate intent is the inverse
of a shallow module: redundant depth, not insufficient depth. This skill
pairs with `/improve-architecture`'s deletion test to identify candidates for
extraction.

**Announce at start:** "I'm using the finding-duplicate-functions skill to scan
for semantic duplication."

## When to use

- During an `/improve-architecture` pass — duplicates are a deepening signal.
- When refactoring a module and noticing similar shape across functions.
- As a periodic hygiene pass on a module that has grown organically.

## Phase 1 — Classical extraction

Scan for functions with structurally similar bodies and similar signatures.
Use tools available to the agent — ripgrep for signature patterns, read files
for the implementations.

For each candidate pair, calculate:
- Same number of parameters, or a clear subset/superset relationship?
- Parameters of the same types (if typed)?
- Body structure — same sequence of operations but with different constants
  or different local variable names?
- Same return type or return shape?

**Output of Phase 1:** a list of candidate pairs with file:line references
and a similarity note (high/medium/low).

## Phase 2 — LLM intent-clustering

For each Phase 1 candidate pair rated medium or high, read both functions in
full and ask: **"Do these two functions solve the same problem for different
callers, or different problems that happen to look similar?"**

- **Same problem** → they share intent. One should be extracted into a shared
  helper; the callers differ only in the parameters they pass.
- **Different problems** → they share tokens but not intent. Leave them
  separate — extraction would couple unrelated things.
- **One is a superset** → the larger function duplicates the smaller one's
  logic plus extras. Extract the shared core; the larger function calls it.

## Deletion-test gate

Before proposing extraction, apply the deletion test from
`/improve-architecture`: if you deleted both functions and replaced them with
a shared helper, would complexity concentrate (good — the extraction is
deepening) or just move sideways (bad — you're rearranging tokens)?

- **Concentrates complexity** → the shared helper has fewer paths than the
  two originals combined. Propose extraction.
- **Moves complexity sideways** → the shared helper mirrors one of the
  originals with a flag parameter. Do NOT propose — this is false deduplication.

## Output format

```markdown
## Duplicate Detection — <module or directory>

### High-confidence duplicates

#### <function-a> / <function-b>
**Files:** `path/a.php:NN`, `path/b.php:MM`
**Shared intent:** [one-line description of the problem they both solve]
**Extraction proposal:** [signature of the shared helper]
**Deletion test:** concentrates complexity / moves sideways (skip)
**Callers:** N in file A, M in file B

### Candidates (medium — needs deeper reading)

- [list with file:line references]

### False positives (different intent, similar tokens)

- [list with one-line explanation of why they differ]
```

## Rules

- Only propose extraction when **both** phases agree — Phase 1 finds structural
  similarity AND Phase 2 confirms shared intent.
- The deletion test is a hard gate. If extraction does not concentrate
  complexity, do not propose it.
- Do not propose extraction for functions under 5 lines — the overhead of a
  helper exceeds the savings.
- Respect the existing architecture. If the codebase already has a helper
  collection pattern (e.g. a `helpers/` directory or a trait), use it.
- Read function bodies — do not rely on signatures alone.

## Cross-refs

- `/improve-architecture` command — the deletion test lives here; this skill
  is a companion scanner.
- `systems-design` skill — deep-modules heuristic and architecture vocabulary.
- `@explore` agent — use for the Phase 1 structural scan across many files.
- **design tab** — owns `brainstorming`; if an extraction candidate is large,
  hand the design there before implementing.

## Gotchas

- *False deduplication* — two functions that look alike but solve different
  problems. Extraction couples unrelated things and creates a shallow module
  with a flag parameter. Phase 2 intent-clustering prevents this.
- *Skipping the deletion test* — without it, every similar-looking pair looks
  like a win. The deletion test separates real deepening from token shuffling.
- *Proposing extraction for trivial functions* — a 3-line wrapper around a
  standard-library call is not duplication. Floor: 5 lines of project-specific
  logic.
