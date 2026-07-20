# Graphify Skill-Driven Integration (Phase 1) — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the `@tdd`
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Make `@explore` Graphify-first when a knowledge graph exists, falling
back to `glob`/`grep`/`read` when it doesn't — shipped as a vendored skill +
command + prompt tweak.

**Architecture:** Three user-facing surfaces (concise skill, `/graphify`
command, `@explore` prompt) wired together by a `.gitignore` entry and
`CONTEXT.md` glossary. The concise skill is `@explore`'s daily reference; a
`reference/upstream-pipeline.md` file holds the full build pipeline for when
humans need it. Three eval cases define the behavioral spec that Phase 2 must
not regress against.

**Tech Stack:** Markdown (skill, command, docs), JSON (eval cases,
opencode.jsonc), gitignore. No PHP, no JS, no SCSS. Pre-commit hook validates
skill frontmatter only.

**Spec:** `docs/specs/2026-07-20-graphify-skill-driven-spec.md`

## Global constraints

- Every new source file starts with an RCS-style header and ends with a vim
  modeline — see `rcs-header` skill. Exempt: `vendor/`, `node_modules/`,
  `aurora/`, generated `cdn/` files, and JSON files (eval cases).
- Conventional Commits with signed commits (`git commit -S`) and
  `Authored-by:`/`Tested-by:`/`Signed-off-by:` footers on every commit.
- Use the `$'...\n...'` ANSI-C quoting form for commit messages — never
  multiple `-m` flags.
- `Authored-by:` resolves to `glm-5.2`; `Tested-by:` resolves to
  `deepseek-v4-pro`; `Signed-off-by:` via
  `bash .github/scripts/resolve-identity.sh`.
- Branch: `feat/kyau-27d6-graphify-skill-driven`
- Indentation: 4-space for JSON/JSONC, 2-space for YAML frontmatter.

---

## File structure

```
.opencode/
├── skills/
│   └── graphify/                    ← NEW
│       ├── SKILL.md                 ← Concise query-focused (~90 lines)
│       └── reference/
│           └── upstream-pipeline.md ← Full build pipeline (vendored from upstream)
├── commands/
│   └── graphify.md                  ← NEW — human-driven build/query/path/explain
└── evals/
    └── smoke/
        ├── explore-uses-graph-when-present.json       ← NEW
        ├── explore-falls-back-when-graph-absent.json   ← NEW
        └── explore-handles-missing-graphify-binary.json ← NEW
```

Files to modify:

```
opencode.jsonc               ← Add prompt field to explore block (lines 112-119)
.gitignore                   ← Add graphify-out/ section
CONTEXT.md                   ← Add 3 glossary terms + Delegates entry
CODING_HARNESS.md            ← Update @explore row (line 115)
AGENTS.md                    ← Add graphify to Skills table + /graphify to Commands table
README.md                    ← Update @explore row (line 279)
```

---

## Task 1: Eval cases (behavioral specification — "Red")

**Files:**
- Create: `.opencode/evals/smoke/explore-uses-graph-when-present.json`
- Create: `.opencode/evals/smoke/explore-falls-back-when-graph-absent.json`
- Create: `.opencode/evals/smoke/explore-handles-missing-graphify-binary.json`

**Interfaces:**
- Consumes: `.opencode/evals/schema.json` (validation schema)
- Produces: 3 eval cases that define the behavioral spec for `@explore`'s
  Graphify integration. These become the Phase 2 re-validation baseline.

- [ ] **Step 1: Create `explore-uses-graph-when-present.json`**

```json
{
    "name": "explore-uses-graph-when-present",
    "description": "Verify @explore prefers graphify query when a knowledge graph exists at graphify-out/graph.json.",
    "agent": "@explore",
    "input": "Where is EvalCase validated in the codebase? Look for validation logic.",
    "expected_behavior": [
        "Agent checks for graphify-out/graph.json before falling back to glob/grep",
        "Agent invokes graphify query via bash when graph exists",
        "Agent cites scoped subgraph results in its answer",
        "Agent does not rebuild the graph itself"
    ],
    "pass_criteria": "manual inspection required",
    "tags": ["smoke", "explore", "graphify"]
}
```

- [ ] **Step 2: Create `explore-falls-back-when-graph-absent.json`**

```json
{
    "name": "explore-falls-back-when-graph-absent",
    "description": "Verify @explore falls back to glob/grep/read when no knowledge graph exists.",
    "agent": "@explore",
    "input": "Where is EvalCase validated in the codebase?",
    "expected_behavior": [
        "Agent checks for graphify-out/graph.json and finds it absent",
        "Agent does not attempt to invoke graphify query",
        "Agent falls back to glob/grep/read workflow",
        "Agent provides a correct answer despite no graph"
    ],
    "pass_criteria": "manual inspection required",
    "tags": ["smoke", "explore", "graphify"]
}
```

- [ ] **Step 3: Create `explore-handles-missing-graphify-binary.json`**

```json
{
    "name": "explore-handles-missing-graphify-binary",
    "description": "Verify @explore degrades gracefully when graphify is not installed.",
    "agent": "@explore",
    "input": "Where is EvalCase validated in the codebase?",
    "expected_behavior": [
        "Agent detects graphify binary is absent (which command fails)",
        "Agent does not crash or emit error spam",
        "Agent falls back to glob/grep/read workflow silently",
        "Agent provides a correct answer despite missing tool"
    ],
    "pass_criteria": "manual inspection required",
    "tags": ["smoke", "explore", "graphify"]
}
```

- [ ] **Step 4: Validate against schema**

For each new case, verify the JSON is valid and fields match the schema
(`name` matches `^[a-z][a-z0-9-]*$`, `agent` matches `^@?[a-z][a-z0-9_-]*$`,
`pass_criteria` is in the enum, no `expected_string` since criteria is
`"manual inspection required"`).

- [ ] **Step 5: Commit**

```bash
git add .opencode/evals/smoke/explore-uses-graph-when-present.json .opencode/evals/smoke/explore-falls-back-when-graph-absent.json .opencode/evals/smoke/explore-handles-missing-graphify-binary.json
git commit -S -m $'test(eval): add graphify behavioral spec for @explore\n\nThree eval cases defining the expected behavior of @explore with\nGraphify integration:\n- uses-graph-when-present: prefers graphify query\n- falls-back-when-graph-absent: degrades to glob/grep/read\n- handles-missing-graphify-binary: graceful failure\n\nThese become the Phase 2 re-validation baseline.\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 2: Graphify skill (concise + full reference)

**Files:**
- Create: `.opencode/skills/graphify/SKILL.md`
- Create: `.opencode/skills/graphify/reference/upstream-pipeline.md`

**Interfaces:**
- Consumes: upstream `graphify/skill-opencode.md` from
  [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)
- Produces: the skill that `@explore`'s prompt (Task 4) references; the
  `/graphify` command (Task 3) cross-links to.

- [ ] **Step 1: Create the concise `SKILL.md`**

See Task 2 content in the plan presented to the user (conversation history).
The skill is ~90 lines covering: frontmatter, when to use/not use,
installation (double-y quirk), commands (query BFS/DFS, path, explain),
build/update note, graceful degradation, cost notes, cross-refs, gotchas.

- [ ] **Step 2: Create `reference/upstream-pipeline.md`**

Copy the full content of the upstream `graphify/skill-opencode.md` from
https://github.com/Graphify-Labs/graphify/blob/master/graphify/skill-opencode.md
verbatim. Prepend a reference header noting the source URL and vendoring date.
Append vim modeline.

- [ ] **Step 3: Verify pre-commit hook passes**

```bash
bash .github/scripts/check-skill-frontmatter.sh .opencode/skills/graphify/SKILL.md
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add .opencode/skills/graphify/SKILL.md .opencode/skills/graphify/reference/upstream-pipeline.md
git commit -S -m $'feat(skills): add graphify skill for code-graph exploration\n\nConcise query-focused skill (~90 lines) for @explore daily use, plus\na full reference/upstream-pipeline.md vendoring the upstream build\npipeline documentation. Covers query/path/explain commands, graceful\ndegradation, and cost notes.\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 3: `/graphify` command

**Files:**
- Create: `.opencode/commands/graphify.md`

**Interfaces:**
- Consumes: the graphify CLI (`graphify` binary, user-installed)
- Produces: the human-driven entry point for building/querying the knowledge
  graph.

- [ ] **Step 1: Create the command file**

See Task 3 content in the plan presented to the user. The command has 6 modes
(build, query, path, explain, update, status), pre-flight checks, and
mode-specific dispatch logic.

- [ ] **Step 2: Commit**

```bash
git add .opencode/commands/graphify.md
git commit -S -m $'feat(commands): add /graphify command for graph management\n\nHuman-driven entry point with six modes: build (default), query, path,\nexplain, update, status. Pre-flight checks for graphify installation.\nQuery/path/explain modes verify graph exists before dispatching.\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 4: `@explore` prompt + `.gitignore` + `CONTEXT.md`

**Files:**
- Modify: `opencode.jsonc` (explore block, lines 112-119 — add `prompt` field)
- Modify: `.gitignore` (add graphify-out/ section after prototypes block)
- Modify: `CONTEXT.md` (Domain Glossary table + System Boundaries → Delegates)

**Interfaces:**
- Consumes: the `graphify` skill (Task 2) and `/graphify` command (Task 3)
- Produces: the wired integration — `@explore` now has the graphify-first
  directive.

- [ ] **Step 1: Add `prompt` field to `@explore` in `opencode.jsonc`**

Add a `"prompt"` field after `"permission"` in the explore block. The prompt
contains the graphify-first protocol: check for graphify-out/graph.json,
prefer graphify query, fall back to glob/grep/read.

- [ ] **Step 2: Add `graphify-out/` to `.gitignore`**

After the prototypes block, add:
```gitignore
# Graphify knowledge graph build artifacts (see .opencode/skills/graphify/)
graphify-out/
```

- [ ] **Step 3: Add glossary terms to `CONTEXT.md`**

Add 3 terms (graphify, knowledge graph, graphify-out/) to the Domain Glossary
table after the `design agent` row. Add Graphify entry to System Boundaries →
Delegates after the LLM providers entry.

- [ ] **Step 4: Verify JSON validity of `opencode.jsonc`**

- [ ] **Step 5: Commit**

```bash
git add opencode.jsonc .gitignore CONTEXT.md
git commit -S -m $'feat(explore): wire @explore to prefer Graphify when graph exists\n\nAdd prompt field to explore agent with graphify-first protocol:\ncheck for graphify-out/graph.json, prefer graphify query, fall back to\nglob/grep/read. Add graphify-out/ to .gitignore. Add graphify,\nknowledge graph, and graphify-out/ glossary terms to CONTEXT.md plus\nGraphify entry to System Boundaries Delegates.\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 5: Documentation cross-refs

**Files:**
- Modify: `AGENTS.md` (Skills Available table — add graphify row; Commands
  table — add /graphify row)
- Modify: `CODING_HARNESS.md` (Built-in subagents table — update @explore row,
  line 115)
- Modify: `README.md` (Built-in subagents table — update @explore row,
  line 279)

**Interfaces:**
- Consumes: the skill (Task 2), command (Task 3), and prompt change (Task 4)
- Produces: accurate documentation reflecting the new integration.

- [ ] **Step 1: Update `AGENTS.md` Skills Available table**

Add row: `| \`graphify\` | Exploring codebase structure, call paths, or symbol relationships via Graphify's knowledge graph — especially when \`graphify-out/graph.json\` exists |`

- [ ] **Step 2: Update `AGENTS.md` Commands table**

Add row: `| \`/graphify\` | Build, query, and manage the Graphify knowledge graph (modes: build, query, path, explain, update, status) |`

- [ ] **Step 3: Update `CODING_HARNESS.md` @explore row**

Change to: `| **Explore** | Read-only codebase exploration — file patterns, keyword search; Graphify-first when \`graphify-out/graph.json\` exists (see \`.opencode/skills/graphify/\`) |`

- [ ] **Step 4: Update `README.md` @explore row**

Change to: `| \`@explore\` | Read-only codebase exploration — file patterns, keyword search; Graphify-first when a knowledge graph exists |`

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md CODING_HARNESS.md README.md
git commit -S -m $'docs: cross-ref graphify skill and command in harness docs\n\nAdd graphify skill to AGENTS.md Skills table, /graphify to Commands\ntable. Update @explore description in CODING_HARNESS.md and README.md\nto note Graphify-first behavior when a knowledge graph exists.\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Self-review

**Spec coverage:** All 7 components from spec §3.1-§3.7 covered across 5 tasks.
§4 boundaries (no MCP, no tier change, no hook, no ADR) respected — none
appear. Zero PHP files touched (§5.3).

**Ordering:** Task 1 (evals) defines behavior. Task 2 (skill) before Task 3
(command) — command references skill. Task 4 (wiring) after both exist. Task 5
(docs) last. Dependencies satisfied.
