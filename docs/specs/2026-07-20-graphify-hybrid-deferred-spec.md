# Graphify Hybrid Integration Spec (Phase 2 — Deferred)

> **Date:** 2026-07-20
> **Status:** Deferred (gated on Phase 1 success)
> **Target repo:** `kyaulabs/prism` (branch off `develop` when activated)
> **Gates on:** `docs/specs/2026-07-20-graphify-skill-driven-spec.md` (Phase 1
> must be in production with eval data before Phase 2 starts)
> **Related:** ADR-0031 (model rebalance — §3a revisit trigger),
> ADR-0006 (read-only agent permission contract),
> ADR-0024 (experimental subagent dependencies — MCP precedent)
> **Upstream:** https://github.com/Graphify-Labs/graphify

---

## 1. Goal

Migrate `@explore` from skill-driven CLI invocation (Phase 1) to a
**Graphify-native architecture**: MCP server for structured tool access,
tier downgrade per ADR-0031's revisit trigger, and a post-commit hook to keep
the graph fresh. Phase 2 fulfills the second half of ADR-0031 §3a's
revisit trigger: *"re-evaluate whether explore should move further down
(UTILITY/Flash) or be replaced by a Graphify-native agent."*

This spec is **written up front** (per user request, 2026-07-20) so that
Phase 2 is ticketable via `/tickets docs/specs/2026-07-20-graphify-hybrid-deferred-spec.md`
without re-brainstorming, once Phase 1's gate criteria are met. It is parked
and must not be activated prematurely.

### 1.1 What "Graphify-native" means here

In Phase 1, `@explore` invokes Graphify through the `bash` tool (spawning a
process, parsing text output). In Phase 2, `@explore` invokes Graphify
through MCP tools (`graphify_query`, `graphify_path`, `graphify_explain`) —
structured input/output contracts, auditable tool calls, and
permission-gated access. The LLM's job shifts from "format a bash command and
parse output" to "call a typed tool and synthesize the result."

The tier downgrade (JUDGE → UTILITY) follows because Graphify absorbs the
reasoning-heavy exploration work. DeepSeek-Flash @ `medium` is sufficient
for synthesizing structured graph output — spending DeepSeek-Pro @ `medium`
behind a tool that was designed to *reduce* reasoning burns tokens against
the tool's own design intent (per ADR-0031 §3a).

---

## 2. Re-validation gate — MUST confirm before starting Phase 2

Before ANY Phase 2 work begins (branch creation, plan writing, ticket
slicing), re-validate ALL of the following against Phase 1's actual
production data. **If any criterion fails, abort Phase 2** and either
iterate on Phase 1 or pivot.

### 2.1 Quantitative gate

| Criterion | Measurement | Pass threshold |
|---|---|---|
| Token reduction | `@explore` token consumption per query, with vs without graph | ≥20% reduction on structural queries, OR |
| Answer quality | Qualitative scoring of `@explore` answers (rubric TBD at Phase 2 kickoff) | Measurable improvement, no regressions |
| Eval suite | Phase 1 eval cases (§3.7 of Phase 1 spec) | All pass; failures are documented and resolved |

### 2.2 Qualitative gate

- [ ] Graphify extraction quality is acceptable on Prism's markdown-heavy
      codebase. Specifically: prose/domain queries (skills, ADRs,
      `CONTEXT.md` content) either work via AST + host-LLM semantic
      extraction, OR the gap is documented and accepted
- [ ] Build cadence solution identified — manual `/graph build` is too
      painful for daily use; the post-commit hook is justified by observed
      staleness, not hypothetical staleness
- [ ] Graphify version is stable enough that the MCP contract won't shift
      under us mid-implementation (check upstream CHANGELOG + semver)
- [ ] Phase 1 has been in production use for ≥2 weeks (or equivalent
      volume of `@explore` dispatches) — long enough to surface edge cases

### 2.3 Architectural gate

- [ ] ADR-0031 §3a's revisit trigger is **explicitly invoked** in the Phase 2
      ADR (§3.6 below): "Graphify integration has landed; we are now
      re-evaluating `explore`'s tier per the documented trigger"
- [ ] No conflicting architectural decisions have landed since Phase 1 (e.g.,
      a new agent that depends on `@explore` being on JUDGE tier)

### 2.4 Abort signals

Abort Phase 2 (and document why in this spec's Status line) if:

- Phase 1 eval data shows Graphify adds tokens without improving quality
- Graphify's MCP server is unstable or undocumented upstream
- A newer Graphify version has breaking changes that reshape the integration
- Prism's codebase has shifted such that the markdown-heavy wrinkle (Phase 1
  spec §2.3) is now the dominant query pattern and semantic extraction is
  required but unavailable

---

## 3. Components (deltas from Phase 1)

Phase 2 builds on Phase 1's foundation. The Phase 1 skill, command, and
gitignore entry **stay** — Phase 2 adds the MCP plumbing, tier downgrade,
and auto-rebuild hook around them.

### 3.1 MCP server config — `opencode.jsonc`

Add a top-level `mcp` block (Prism's first MCP server — see ADR-0024 for
experimental-feature precedent):

```jsonc
"mcp": {
  "graphify": {
    "type": "local",
    "command": ["graphify", "--mcp"],
    "enabled": true
  }
}
```

**Enabled flag strategy:** ship with `"enabled": false` initially in the
first Phase 2 commit, flip to `true` in a separate commit after manual
validation. This makes the MCP addition auditable and revertible
independently of the config landing.

**Permission gating** (per ADR-0006 read-only contract + ADR-0021 scoped
carve-out pattern):

| Agent | `graphify_*` permission | Rationale |
|---|---|---|
| `explore` | `allow` | Primary consumer; MCP tools replace its bash invocations |
| `architect` | `allow` | Architectural review benefits from graph queries |
| `debug` | `allow` | Bug investigation benefits from call-path queries |
| `build`, `tdd` | `ask` | May query during implementation; prompt user first |
| `plan`, `from-issue`, `consult`, `design` | `deny` (inherited) | These delegate to `@explore`; direct access bypasses the synthesis layer |
| All other read-only agents | `deny` (inherited) | Out of scope |

The `graphify_*` wildcard pattern matches all tools the MCP server exposes
(per `.opencode/skills/opencode-docs/docs/mcp-servers.mdx`).

### 3.2 `@explore` tier downgrade — `opencode.jsonc` + `ModelConfigTest.php`

Change the `explore` block in `opencode.jsonc`:

| Field | Phase 1 (current) | Phase 2 |
|---|---|---|
| `model` | `{env:OPENCODE_MODEL_JUDGE}` | `{env:OPENCODE_MODEL_UTILITY}` |
| `variant` | `{env:OPENCODE_VARIANT_JUDGE}` | `{env:OPENCODE_VARIANT_UTILITY}` |
| `temperature` | `0.1` | `0.1` (unchanged — synthesis wants determinism) |

Update `tests/Unit/Harness/ModelConfigTest.php`:

- The existing test at line 326 (`it('explore code-review standards-review
  spec-review test-audit use JUDGE tier')`) must split — `explore` leaves
  the JUDGE group; the other four stay
- Add a new test: `it('explore uses UTILITY tier post-Graphify')` asserting
  `explore.model === '{env:OPENCODE_MODEL_UTILITY}'`

**Commit footer sourcing implication:** ADR-0031 §5 sources `Tested-by:`
from `agent.code-review.model` (JUDGE). Phase 2 does not change that
sourcing — `explore` leaving JUDGE does not affect `code-review`'s tier.
However, the *meaning* of `Tested-by:` narrows: `explore` is no longer in
the verification pipeline per the §7 semantic extension. This is a
documentation update, not a sourcing change.

### 3.3 `@explore` prompt migration — `opencode.jsonc`

Update the `explore.prompt` field (added in Phase 1) to prefer MCP tools
over bash invocation:

```text
You are the @explore agent for a KYAULabs PHP project. Your job is focused
codebase exploration — answer the caller's question with the minimum scoped
context needed.

## Graphify-first protocol (MCP)

Before falling back to glob/grep/read:

1. If the `graphify_query` MCP tool is available, call it with the caller's
   question rephrased as a graph query.
2. Treat the returned scoped subgraph as your primary source. Use
   `graphify_path` for shortest-path questions, `graphify_explain` for
   single-node deep inspection.
3. If MCP tools are unavailable (server down, not configured), fall back to
   the Phase 1 bash path: `graphify query "<question>"` via `bash`. The
   skill at `.opencode/skills/graphify/SKILL.md` documents this path.
4. If `graphify-out/graph.json` is also absent, fall back to your normal
   glob/grep/read + LSP workflow.

Do NOT rebuild the graph yourself — the post-commit hook keeps it fresh. If
you suspect staleness, note it in your answer; the user can run
`/graph update` manually if needed.

`AGENTS.md` is loaded every session — do not restate its rules.
```

### 3.4 Post-commit hook — `.github/hooks/post-commit`

New hook for incremental graph rebuild. Constraints:

- **Must not block the commit** — failure is warn-only, never non-zero exit
- **Must be fast** — target <5s wall-clock; if `graphify --update` exceeds
  that, warn and skip (the next `/graph update` will catch up)
- **Must handle missing prerequisites gracefully** — if `graphify` is not
  installed or `graphify-out/graph.json` doesn't exist, exit 0 silently
  (the hook is opt-in via having built a graph at least once)
- **Must use incremental mode** — `graphify --update`, never a full rebuild

Skeleton:

```bash
#!/usr/bin/env bash
# post-commit: incremental Graphify knowledge graph rebuild
# See: docs/specs/2026-07-20-graphify-hybrid-deferred-spec.md §3.4

set -u

# Silent no-op if graphify isn't installed or no graph exists
command -v graphify >/dev/null 2>&1 || exit 0
[ -f "graphify-out/graph.json" ] || exit 0

# Rebuild incrementally; never block the commit
timeout 5 graphify --update >/dev/null 2>&1 || \
    echo "graphify: incremental rebuild skipped (timeout or error)" >&2

exit 0
```

Register in `.github/scripts/install-hooks.sh` (the existing hook installer).

### 3.5 `/build-graph` command (or `/graph` extension)

Phase 1's `/graph` command already has `build` and `update` modes. Phase
2 has two options:

- **Option A (preferred):** keep `/graph` as the single entry point; the
  post-commit hook calls `graphify --update` directly (no command
  indirection). `/graph update` remains the manual catch-up command.
- **Option B:** add a separate `/build-graph` command for explicit rebuild
  workflows (CI, fresh-clone setup).

Default to Option A unless Phase 2 implementation reveals a need for
separation. Document the choice in the Phase 2 ADR (§3.6).

### 3.6 ADR — `adr/00NN-graphify-native-explore.md`

New ADR (number assigned at implementation time — check `adr/` for next
slot). Status: `Accepted` when Phase 2 lands.

**Required content:**

- **Context:** Phase 1 (skill-driven) landed on `<date>`; eval data showed
  `<results>`; ADR-0031 §3a revisit trigger is now invoked
- **Decision:** (1) Add Graphify MCP server with per-agent permission
  gating; (2) downgrade `explore` JUDGE → UTILITY; (3) add post-commit
  incremental rebuild hook; (4) retain Phase 1 skill as fallback path
- **Supersedes:** Nothing directly. ADR-0031 §3a anticipated this; the new
  ADR fulfills the revisit trigger
- **Related:** Phase 1 spec, Phase 2 spec, ADR-0031, ADR-0006 (permission
  contract), ADR-0024 (experimental precedent for new tool surfaces)
- **Revisit trigger:** If Graphify upstream abandons MCP support, or if
  Prism shifts away from a code-graph exploration model

### 3.7 CONTEXT.md updates

- Update the `graphify` glossary entry to reflect MCP integration (the
  Phase 1 entry describes CLI-only; Phase 2 adds MCP as primary surface)
- Add `graphify_query`, `graphify_path`, `graphify_explain` MCP tools to
  the **System Boundaries → Boundary interfaces** section (mockable MCP
  surfaces)
- Update **System Boundaries → Delegates** to note Graphify is now
  wired via MCP, not just CLI

### 3.8 Phase 1 skill retention

`.opencode/skills/graphify/SKILL.md` stays. Its purpose shifts:

- **Phase 1:** primary integration surface (bash-driven)
- **Phase 2:** fallback path when MCP is unavailable + human-driven
  `/graph` command reference

Add a note to the skill's header: *"Primary integration is the MCP server
(see ADR-00NN). This skill documents the CLI fallback path and the
human-driven `/graph` command."*

---

## 4. Migration sequence

Each step is its own atomic commit, independently revertible. Order matters
— later steps depend on earlier ones being live.

| Step | Commit | Revertibility |
|---|---|---|
| 1 | Add MCP server config with `enabled: false` + permission gates | Trivial revert (config-only) |
| 2 | Manual validation: flip `enabled: true`, test MCP tools work | Revert step 2 only if MCP unstable |
| 3 | Update `@explore.prompt` to prefer MCP tools (keep bash fallback) | Prompt-only revert |
| 4 | Downgrade `@explore` tier JUDGE → UTILITY in `opencode.jsonc` | Config revert; high-value-separate-commit |
| 5 | Update `ModelConfigTest.php` guards (split + new test) | Test-only revert |
| 6 | Add post-commit hook + register in `install-hooks.sh` | Remove hook file + revert installer line |
| 7 | Update `CONTEXT.md` glossary + boundaries | Prose revert |
| 8 | Write and commit Phase 2 ADR; status Accepted | ADR status can flip to Superseded if rolled back |

**If step 4 (tier downgrade) regresses quality:** revert just that commit.
`@explore` returns to JUDGE while keeping MCP access. This is the most
likely partial-rollback scenario — the tier decision is the highest-stakes
bet in Phase 2.

**If step 6 (post-commit hook) adds friction:** disable the hook via
`chmod -x` or revert step 6. The hook is the most user-facing change; it
must not block commits even if Graphify is broken.

---

## 5. Acceptance criteria

Phase 2 is complete when ALL of the following hold:

- [ ] MCP server config in `opencode.jsonc` with `enabled: true`
- [ ] Permission gates per §3.1 table enforced and tested
- [ ] `@explore` runs on UTILITY tier (`{env:OPENCODE_MODEL_UTILITY}`)
- [ ] `ModelConfigTest.php` updated: `explore` removed from JUDGE group
      test; new `explore` UTILITY tier test added
- [ ] `@explore.prompt` prefers MCP tools; bash fallback documented
- [ ] Post-commit hook exists, registered, and never blocks commits
- [ ] Phase 2 ADR committed with status Accepted
- [ ] `CONTEXT.md` glossary + boundaries updated
- [ ] Phase 1 eval cases re-run — no regression vs Phase 1 baseline
- [ ] Manual validation: dispatch `@explore` with graph present; observe
      MCP tool calls in transcript (not bash invocations)
- [ ] `/check` passes on all changed files

---

## 6. Rollback plan

Phase 2 is more entangled than Phase 1 but still revertible in layers:

### 6.1 Full rollback (back to Phase 1)

1. Set MCP `enabled: false` (or remove the `mcp` block)
2. Restore `@explore` to JUDGE tier
3. Restore `ModelConfigTest.php` (git revert the test commit)
4. Disable post-commit hook (`chmod -x .github/hooks/post-commit`)
5. Restore `@explore.prompt` to Phase 1 wording (bash-first)
6. Phase 1 skill + `/graph` command remain — `@explore` falls back to
   bash invocation automatically

Phase 1 functionality is fully preserved. The graph itself is unaffected
(it's gitignored and rebuildable).

### 6.2 Partial rollback scenarios

| Scenario | Action |
|---|---|
| MCP server unstable | Disable `enabled` flag only; `@explore` uses bash path (Phase 1 behavior) |
| Tier downgrade regressed quality | Revert tier commit only; MCP + hook stay live |
| Post-commit hook blocking commits | `chmod -x` the hook; investigate separately |
| Graphify upstream breaking change | Pin Graphify version; evaluate migration path before any revert |

---

## 7. ADR plan

| Field | Value |
|---|---|
| Number | Next available slot in `adr/` at Phase 2 start |
| Filename | `adr/00NN-graphify-native-explore.md` |
| Title | Graphify-native explore agent (MCP + tier downgrade + auto-rebuild) |
| Status | Accepted (when Phase 2 lands) |
| Decided | `<date Phase 2 lands>` |
| Supersedes | Nothing directly |
| Related | ADR-0031 (revisit trigger fulfilled), Phase 1 spec, Phase 2 spec, ADR-0006 (permission contract), ADR-0024 (experimental tool precedent) |

The ADR documents the four architectural shifts (MCP addition, tier
downgrade, hook addition, skill role change) as a single coherent decision
since they only make sense together.

---

## 8. What does NOT change in Phase 2

To prevent scope creep, the following are **explicitly out of scope** even
in Phase 2:

- **No new agents** — Phase 2 does not add a "Graphify-native agent" that
  replaces `@explore` (ADR-0031 mentioned this as an option; we reject it
  because `@explore`'s integration with the Plan agent's delegation
  pattern is too valuable to disrupt)
- **No semantic extraction config** — Gemini API key handling remains
  out of scope; AST + host-LLM fallback stays the default
- **No Graphify version pinning** — unless upstream breaks compatibility;
  in that case, pin in the ADR's Revisit trigger
- **No CI integration** — the post-commit hook runs locally; CI does not
  build or query the graph
- **No replacement of LSP** — Graphify and Intelephense serve different
  purposes; both remain available to `@explore`

---

## 9. Activation checklist

When ready to start Phase 2, the user/agent should:

1. Re-run Phase 1 eval cases; confirm gate criteria in §2 are met
2. Update this spec's Status line from `Deferred` to `Approved (design
   phase)` with the activation date
3. Create the feature branch:
   `bash .github/scripts/new-branch.sh feat graphify-hybrid-phase2`
4. Proceed to the `plan` tab for implementation planning off this spec
5. Use `/tickets docs/specs/2026-07-20-graphify-hybrid-deferred-spec.md` to
   decompose into an epic + vertical-slice task issues

If §2 gate criteria are NOT met, do not activate. Instead, either iterate
on Phase 1 (open issues for specific shortcomings) or document why Phase 2
is being abandoned in this spec's Status line.
