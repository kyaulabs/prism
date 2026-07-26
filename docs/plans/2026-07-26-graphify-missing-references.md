# Graphify Missing Reference Files — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor where tests apply.

**Goal:** Resolve issue #207 — make the vendored Graphify runbook operable by
vendoring the 3 retained reference files and trimming the 5 out-of-scope
sections, and add a harness check that catches unresolved skill reference paths
in the future.

**Architecture:** Hybrid resolution (per user decision 2026-07-26): vendor
`extraction-spec.md`, `query.md`, `update.md` — the 3 references covering
Phase-1-retained Graphify modes — as separate files under the existing
`reference/` dir; remove the 5 sections in `upstream-pipeline.md` that cite
pruned-mode references (`transcribe`, `exports`, `add-watch`, `hooks`,
`github-and-merge`); augment the existing `validate-harness.sh` with a
file-path-reference resolver and add a TDD test for it.

**Tech Stack:** Bash (validate-harness.sh), Markdown (docs), shell TDD
(tests/Shell/).

**Issue:** #207 · Type: Documentation · Priority: Medium · Effort: Low

## Global constraints

- Vendored reference files are upstream content — keep **verbatim** (no RCS
  header; they carry the upstream `# graphify reference:` heading, matching how
  `upstream-pipeline.md` was vendored on 2026-07-20). Markdown files are not
  subject to the RCS/strict-types arch tests, so verbatim vendoring is safe.
- `validate-harness.sh` follows existing conventions: `err()`/`warn()`/`ok()`
  helpers, `ERRORS`/`WARNINGS` counters, resolves repo root via
  `git rev-parse --show-toplevel` so it runs from any subdir.
- New tests follow `tests/Shell/validate-harness_test.sh` conventions:
  `setup_validator_env`, `git_init_test_repo`, `pass`/`fail`, synthetic temp
  fixtures (no real-tree mutation).
- Fetching the 3 upstream reference files requires network (curl GitHub raw).
  The user approved vendoring, which implies this fetch — confirm before
  running if the environment blocks egress.
- Commit footers (`Authored-by`/`Tested-by`/`Signed-off-by`) are resolved
  dynamically per AGENTS.md at commit time; the messages below are templates.
- `/check` gate must pass: php-cs-fixer/stylelint/eslint are no-ops on these
  file types; `pest --coverage` unchanged; the shell test runner covers the new
  tests.

---

### Task 1: Vendor the 3 retained Graphify reference files

**Files:**
- Create: `.opencode/skills/graphify/reference/references/extraction-spec.md`
- Create: `.opencode/skills/graphify/reference/references/query.md`
- Create: `.opencode/skills/graphify/reference/references/update.md`

**Interfaces:**
- Produces: 3 files that resolve the citations at `upstream-pipeline.md`
  lines ~228 & ~277 (extraction-spec), ~683 (query), ~671 (update).

**Source:** upstream `Graphify-Labs/graphify` at
`graphify/skills/opencode/references/` (confirmed via upstream
`pyproject.toml` package-data glob `skills/*/references/*.md`).

- [ ] **Step 1: Create the references subdirectory**

```bash
mkdir -p .opencode/skills/graphify/reference/references
```

- [ ] **Step 2: Fetch extraction-spec.md (the MANDATORY semantic-extraction prompt)**

```bash
curl -fsSL https://raw.githubusercontent.com/Graphify-Labs/graphify/master/graphify/skills/opencode/references/extraction-spec.md \
  -o .opencode/skills/graphify/reference/references/extraction-spec.md
```

- [ ] **Step 3: Fetch query.md (query/path/explain flows)**

```bash
curl -fsSL https://raw.githubusercontent.com/Graphify-Labs/graphify/master/graphify/skills/opencode/references/query.md \
  -o .opencode/skills/graphify/reference/references/query.md
```

- [ ] **Step 4: Fetch update.md (--update / --cluster-only flows)**

```bash
curl -fsSL https://raw.githubusercontent.com/Graphify-Labs/graphify/master/graphify/skills/opencode/references/update.md \
  -o .opencode/skills/graphify/reference/references/update.md
```

- [ ] **Step 5: Verify each file fetched (non-empty, correct heading)**

```bash
for f in extraction-spec query update; do
    printf '%s -> ' "$f"
    head -1 ".opencode/skills/graphify/reference/references/$f.md"
    test -s ".opencode/skills/graphify/reference/references/$f.md" || echo "EMPTY: $f"
done
```

Expected: each prints `# graphify reference: ...`; no `EMPTY:` line.

- [ ] **Step 6: Commit**

```bash
git add .opencode/skills/graphify/reference/references/
git commit -S -m $'docs(graphify): vendor retained reference files\n\nVendor extraction-spec.md, query.md, update.md from upstream\nGraphify-Labs/graphify so the runbook citations at upstream-pipeline.md\nlines ~228, ~277, ~671, ~683 resolve. Part of the #207 hybrid resolution\n(vendor retained, trim pruned).\n\nRefs: #207\nAuthored-by: glm-5.2\nTested-by: <agent.code-review.model>\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 2: Trim 5 pruned-reference sections from upstream-pipeline.md

**Files:**
- Modify: `.opencode/skills/graphify/reference/upstream-pipeline.md`

**Interfaces:**
- Removes citations of: `references/github-and-merge.md` (Step 0),
  `references/transcribe.md` (Step 2.5), `references/exports.md` (Steps 6b-8),
  `references/add-watch.md` (For /graphify add and --watch),
  `references/hooks.md` (For the commit hook...).

For each section, remove the body and replace the heading with a one-line
Phase-1-out-of-scope note (keeps the doc navigable and explains the gap rather
than leaving a silent hole).

- [ ] **Step 1: Replace "Step 0 - GitHub repos and multi-path merge" (~L72-74)**

Keep the heading, replace the body with:

```
### Step 0 - GitHub repos and multi-path merge (out of scope: Phase 1)

> Skipped — GitHub-URL clone and multi-repo merge are not Phase 1 use cases.
  A plain local path skips this step.
```

- [ ] **Step 2: Replace "Step 2.5 - Video and audio" (~L155-157)**

```
### Step 2.5 - Video and audio (out of scope: Phase 1)

> Skipped — Prism has no media corpus; transcription is not used.
```

- [ ] **Step 3: Replace "Steps 6b-8 - Wiki, Neo4j, FalkorDB, SVG, GraphML, MCP, benchmark" (~L543-545)**

```
### Steps 6b-8 - Wiki, Neo4j, FalkorDB, SVG, GraphML, MCP, benchmark (out of scope: Phase 1)

> Skipped — all export modes (`--wiki`, `--neo4j`, `--falkordb`, `--svg`,
  `--graphml`, `--mcp`, benchmark) are out of scope for Phase 1.
```

- [ ] **Step 4: Replace "## For /graphify add and --watch" (~L687-689)**

```
## For /graphify add and --watch (out of scope: Phase 1)

> Skipped — URL ingestion (`add`) and auto-rebuild (`--watch`) are deferred.
```

- [ ] **Step 5: Replace "## For the commit hook and native CLAUDE.md integration" (~L693-695)**

```
## For the commit hook and native CLAUDE.md integration (out of scope: Phase 1)

> Skipped — post-commit hook is deferred to Phase 2 (see
  docs/specs/2026-07-20-graphify-hybrid-deferred-spec.md §3.4).
```

- [ ] **Step 6: Verify no pruned-reference citations remain**

```bash
grep -nE 'references/(transcribe|exports|add-watch|hooks|github-and-merge)\.md' \
  .opencode/skills/graphify/reference/upstream-pipeline.md
```

Expected: no output (all 5 citations gone).

- [ ] **Step 7: Verify retained-reference citations still present**

```bash
grep -nE 'references/(extraction-spec|query|update)\.md' \
  .opencode/skills/graphify/reference/upstream-pipeline.md
```

Expected: 4 lines (extraction-spec ×2, query ×1, update ×1).

- [ ] **Step 8: Commit**

```bash
git add .opencode/skills/graphify/reference/upstream-pipeline.md
git commit -S -m $'docs(graphify): trim pruned-mode sections from runbook\n\nRemove sections citing transcribe.md, exports.md, add-watch.md, hooks.md,\nand github-and-merge.md — all cover Graphify modes pruned for Phase 1\n(per docs/specs/2026-07-20-graphify-skill-driven-spec.md §3.1). Each\nreplaced with a one-line out-of-scope note. Retained-reference citations\n(extraction-spec, query, update) are untouched.\n\nRefs: #207\nAuthored-by: glm-5.2\nTested-by: <agent.code-review.model>\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 3: Add skill reference-path resolution check to validate-harness.sh (TDD)

**Files:**
- Modify: `.github/scripts/validate-harness.sh` — add `check_skill_reference_paths`
  block + invocation, inserted after the existing cross-reference check
  (~L432) and before the AGENTS.md index check (~L434).
- Modify: `tests/Shell/validate-harness_test.sh` — append 2 tests before the
  Summary section (~L1981).

**Interfaces:**
- Consumes: existing `err()` / `ok()` helpers, `ERRORS` counter, `SKILLS_DIR`
  (already defined at L57 as `${HARNESS_DIR}/skills`).
- Produces: a check that ERRORs when a skill `.md` cites
  `references/<x>.md` or `reference/<x>.md` and the target does not resolve
  relative to the citing file's directory.

**Design:** Scan every `.md` under `SKILLS_DIR`. For each, grep for citations
matching `(references|reference)/<path>.md`. Resolve each relative to the
citing file's directory via a computed path + `[ -f ]` test (not `realpath`,
which is unreliable for existence checks across platforms). ERROR on miss.
This catches exactly the #207 defect class: a runbook citing a file that was
never vendored.

- [ ] **Step 1: Write the 2 failing tests (Red)**

Append to `tests/Shell/validate-harness_test.sh`, immediately before the
`# ── Summary ──` block (~L1981):

```bash
# ── Test 43: Skill citing a missing references/*.md file ERRORs (issue #207) ──

echo ""
echo "── Test 43: Skill missing-reference citation ERROR ──"
T43=$(mktemp -d)
register_temp_dir "$T43"
git_init_test_repo "$T43"
(
	cd "$T43"
	mkdir -p .opencode/skills/broken-skill
	setup_validator_env
	cat > .opencode/skills/broken-skill/SKILL.md <<'EOF'
---
name: broken-skill
description: A skill citing a reference that does not exist.
---
See `references/missing.md` for details.
EOF
	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?
	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "references/missing.md" && echo "$output" | grep -qF "broken-skill"; then
		pass "Caught skill citing missing references/*.md (issue #207)"
	else
		fail "Did not detect missing references/*.md citation"
	fi
)

# ── Test 44: Skill citing a present references/*.md file passes ──

echo "── Test 44: Skill present-reference citation passes ──"
T44=$(mktemp -d)
register_temp_dir "$T44"
git_init_test_repo "$T44"
(
	cd "$T44"
	mkdir -p .opencode/skills/good-skill/references
	setup_validator_env
	cat > .opencode/skills/good-skill/SKILL.md <<'EOF'
---
name: good-skill
description: A skill citing a reference that exists.
---
See `references/present.md` for details.
EOF
	cat > .opencode/skills/good-skill/references/present.md <<'EOF'
# present reference
EOF
	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true
	if echo "$output" | grep -F "good-skill" | grep -qF "references/present.md"; then
		fail "Present reference was falsely flagged"
	else
		pass "Present reference not flagged"
	fi
)
```

- [ ] **Step 2: Run the suite to confirm Test 43 fails (Red)**

```bash
bash tests/Shell/validate-harness_test.sh
```

Expected: Test 43 FAILs (no check exists → missing ref not caught, exit 0).
Test 44 passes trivially (nothing flagged). Tests 1-42 unaffected.

- [ ] **Step 3: Implement the check in validate-harness.sh (Green)**

Insert this block after the existing cross-reference `ok "...verified"` line
(~L432) and before the `# ── AGENTS.md index cross-check ──` comment (~L434):

```bash
# ── Skill reference-path resolution ───────────────────────────────────────────
# A skill .md may cite sibling reference files as `references/<name>.md` or
# `reference/<name>.md`. An unresolved citation is an operability defect — an
# agent following the skill cannot load the cited file (issue #207).
echo "── Checking skill reference paths ──"
SKILLREF_COUNT=0
SKILLREF_ERRORS_BEFORE=$ERRORS

while IFS= read -r file; do
	[ -z "$file" ] && continue
	file_dir=$(dirname "$file")
	# Match citations: references/foo.md or reference/foo.md (path may nest).
	while IFS= read -r cited; do
		[ -z "$cited" ] && continue
		target="${file_dir}/${cited}"
		if [ -f "$target" ]; then
			SKILLREF_COUNT=$((SKILLREF_COUNT + 1))
		else
			err "${file}: cited reference '${cited}' does not resolve (expected at ${target})"
		fi
	done < <(grep -oE '(references|reference)/[A-Za-z0-9_./-]+\.md' "$file" 2>/dev/null || true)
done < <(find "${SKILLS_DIR}" -name '*.md' ! -path '*/node_modules/*' 2>/dev/null)

if [ "$ERRORS" -eq "$SKILLREF_ERRORS_BEFORE" ]; then
	ok "${SKILLREF_COUNT} skill reference(s) resolved"
fi
```

- [ ] **Step 4: Run the suite to confirm Tests 43 & 44 pass (Green)**

```bash
bash tests/Shell/validate-harness_test.sh
```

Expected: Test 43 PASS (missing ref → ERROR, exit non-zero, message names the
file + citation); Test 44 PASS (present ref not flagged). Tests 1-42 still
pass (no regression).

- [ ] **Step 5: Refactor** — review the inserted block for style consistency
  with neighboring checks (indentation is tabs; helper usage matches). No
  behavior change expected.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh
git commit -S -m $'feat(harness): check skill reference paths resolve\n\nAdd a skill reference-path resolver to validate-harness.sh — scans skill\nmarkdown for references/*.md and reference/*.md citations and ERRORs when\na target does not resolve relative to the citing file. Catches the #207\ndefect class (a runbook citing never-vendored files). Adds Tests 43-44\n(missing-ref ERRORs, present-ref passes).\n\nFixes: #207\nAuthored-by: glm-5.2\nTested-by: <agent.code-review.model>\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 4: Verify the full fix and run /check

- [ ] **Step 1: Run validate-harness.sh on the real (now-fixed) tree**

```bash
bash .github/scripts/validate-harness.sh
```

Expected: exit 0; prints `OK: N skill reference(s) resolved` with N ≥ 3 (the 3
newly-vendored graphify references resolve); no ERROR line mentions any
graphify reference path.

- [ ] **Step 2: Run the shell test suite**

```bash
bash tests/Shell/validate-harness_test.sh
```

Expected: all 44 tests pass.

- [ ] **Step 3: Run the pre-push gate**

```bash
# /check  (php-cs-fixer + stylelint + eslint + pest --coverage)
php -d pcov.enabled=1 vendor/bin/pest --coverage
```

Expected: clean (no PHP/SCSS/JS changed; coverage gate unaffected).

- [ ] **Step 4: Recommend `@code-review` before push** (separate manual gate).

---

## Self-review

1. **Issue coverage:**
   - AC#1 "Every references/*.md path cited resolves, or the citing text is
     removed" → Task 1 (vendor 3 retained → resolve) + Task 2 (remove 5
     pruned citations). ✓
   - AC#2 "validate-harness.sh checks cross-referenced skill paths resolve"
     → Task 3. ✓
2. **Placeholder scan:** No TBD/TODO. Fetch URLs are concrete and pinned to
   `master` (matches the existing vendoring). Test code and implementation
   code are complete. Commit messages carry full footer templates.
3. **Type consistency:** `SKILLREF_COUNT` / `SKILLREF_ERRORS_BEFORE` match the
   existing `CROSSREF_COUNT` / `INDEX_ERRORS_BEFORE` naming pattern; uses the
   existing `err()` / `ok()` helpers and `SKILLS_DIR`.
4. **Scope discipline:** The Usage block at the top of `upstream-pipeline.md`
   still lists pruned modes (`--obsidian`, `--neo4j`, etc.). Trimming that is
   broader than #207's acceptance criteria (which target the missing
   *reference files*) and is intentionally left out of scope.
