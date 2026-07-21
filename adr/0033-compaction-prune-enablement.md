# $KYAULabs: 0033-compaction-prune-enablement.md kyau@nova 2026/07/20 -0700 Exp $

# 0033. Compaction Prune Enablement for Cache-Read Cost Reduction

Date: 2026-07-20

## Status

Accepted.

Empirical verification in progress (see Consequences — Negative). Does not
supersede any ADR. Amends the cost model underlying ADR-0031 and ADR-0014
without changing their model/variant assignments.

## Context

ADR-0031's governing philosophy was *"maximize token usage on real work —
the abundant GLM quota is better spent on higher-quality exploration and
planning than hoarded."* It was justified by a data point: 68M tokens used
in a week = 41% of a ~166M weekly z.ai Pro quota, leaving ~98M unused. On
that basis, ADR-0031 bumped PLANNER and DESIGN variants to `max` and moved
six agents onto DeepSeek-V4-Pro for cross-model review diversity.

After applying ADR-0031, the user observed **~25% of the weekly z.ai quota
consumed in a single day** — a roughly 4× increase in burn rate. Diagnostic
analysis of the local OpenCode session store (`~/.local/share/opencode/
opencode.db`, ~804 MB SQLite) revealed that the actual token economics
differ materially from ADR-0031's assumptions.

### Finding 1 — cache_read dominates the footprint

The `session` table tracks `tokens_input`, `tokens_cache_read`,
`tokens_output`, and `tokens_reasoning` independently. Across every model
and variant, **cache_read is 10–17× the input token count**, and reasoning
is <1% of cache_read:

| Model + variant (48h) | Sessions | input | cache_read | reasoning | cache_read : input |
|---|---|---|---|---|---|
| glm-5.2 @ high | 19 | 3.76M | **64.7M** | 0.49M | **17.2×** |
| glm-5.2 @ default | 5 | 1.72M | 16.7M | 0.10M | 9.7× |
| glm-5.2 @ max | 7 | 1.41M | 13.5M | 0.14M | 9.6× |
| deepseek-v4-pro @ high | 65 | 3.97M | 62.9M | 0.35M | 15.8× |

The cached prefix (AGENTS.md + conventions.md + CONTEXT.md + loaded skills
+ accumulated tool output from earlier turns) is re-read on **every turn of
every session**. For GLM `high`, that averages **~3.4M cache_read per
session**.

### Finding 2 — the 25%/day reconciles only if z.ai counts cache_read

GLM processed ~102M tokens (input + cache_read) in 48h ≈ **~51M/day**.
Against the ~166M weekly quota, that is **~31%/day** — matching the user's
"25% in one day" observation. The arithmetic only works if z.ai counts
cached tokens against the plan quota (typical for flat-rate plans; the
cached prefix is still served even if discounted). If z.ai excluded
cache_read, the burn would be ~3%/day and the panic inexplicable. This
inference is strong but unconfirmed against the dashboard (see Follow-ups).

### Finding 3 — variant is a second-order lever for cost

Reasoning tokens — the only thing the `variant` dial controls — are <1% of
the footprint (GLM: 0.73M reasoning vs 94.9M cache_read in 48h). The user's
A/B testing of `default`/`high`/`max` variants could not slow the burn
because **variant does not touch cache_read**. ADR-0031 §2's variant bumps
and ADR-0014's DeepSeek-variant-collapse concern are both real, but they
govern a cost component that is noise-level next to cache_read.

### Finding 4 — two problems conflated

| Problem | Driver | All-time |
|---|---|---|
| GLM (z.ai) quota burn | cache_read on long PRIMARY sessions | 9.2M tokens / **$0.01** |
| DeepSeek dollar cost | JUDGE-tier session volume | 26.1M tokens / **$13.04** |

Per-agent (all-time): `build` is the per-session giant (83 sessions,
~286K tokens each); `explore` is the highest-frequency agent (**171
sessions**, 5.4M tokens). DeepSeek-V4-Pro carries 71% of all token volume
and ~99% of all dollar cost — ADR-0031's "maximize GLM" move killed GLM
dollar cost but redirected a massive analysis volume onto DeepSeek-Pro.

## Decision

1. **Enable `compaction.prune: true`** (from `false`). Pruning drops stale
   tool outputs from context during compaction → less to cache-read on
   subsequent turns → directly cuts the dominant cost driver. This is the
   single highest-impact config lever available. Committed in `9ada68d` on
   `perf/kyau-6da1-compaction-prune-enable`. Reversible by revert.

2. **Recognize `variant` as a quality dial, not a cost dial.** ADR-0031's
   tier assignments stand; future cost decisions use cache_read as the
   primary metric, not variant or raw token counts. Variant reduction
   remains worthwhile for quality/latency tuning (via `setup.json`) but is
   not the answer to quota burn.

3. **Name the remaining context-economization levers as follow-ups** (see
   Consequences — Neutral), to be pursued based on prune's observed effect.

## Consequences

**Positive:**
- Prune directly targets cache_read, the dominant cost component. Even a
  modest reduction in re-cached tool output multiplies across every
  subsequent turn of every session.
- Reversible: single-line config; `git revert 9ada68d` if ineffective or
  harmful.
- The observation doubles as a test of whether `prune` is still functional
  on OpenCode 1.18.4 — the analyst's "V2 reserved/non-functional" concern
  is resolved empirically. If cache_read is unchanged after a full day of
  normal work, prune is a no-op on this build and this ADR's primary
  decision is void.
- The diagnostic method (token-aggregation query against `opencode.db`) is
  reusable and is recorded in the commit body for future cost analyses.
- Corrects the cost model: future model/variant decisions can reason about
  cost on the correct axis (cache_read), not the assumed axis (variant).

**Negative:**
- **Empirical verification pending.** The z.ai quota unit (whether it
  counts cache_read) is inferred from arithmetic, not confirmed against the
  dashboard. If z.ai does NOT count cache_read, the 25%/day has a different
  cause and prune will underperform the projection.
- **Stale tool output loss.** Pruning drops old tool results from context.
  A later turn that needs to reference a pruned result loses it. For long
  debugging or refactor sessions this could hurt agent output quality.
  Mitigation: `/handoff` + fresh sessions for genuinely long work; the
  `compaction.auto` and `compaction.reserved` fields are unchanged and
  still bound compaction behavior.
- If prune proves non-functional on 1.18.4, the ADR records the attempt
  and must be deprecated in favor of a different lever (Follow-up 4 or 5).

**Neutral:**
- ADR-0031's and ADR-0014's tier assignments and variant values stand
  unchanged. This ADR amends the cost model, not the model assignment.
- `compaction.auto` (true) and `compaction.reserved` (20000) unchanged.

**Named follow-ups** (deferred to separate cycles, prioritized by
projected impact on cache_read / dollar cost):

1. **Behavioral context discipline** — proactive `/compact <hint>` before
   context balloons; route context-heavy exploration through subagents so
   only the conclusion returns; `/handoff` instead of pushing long
   sessions. Already documented in `.opencode/docs/context-management.md`;
   the gap is consistent early use, not missing guidance. Highest-impact
   behavioral lever; zero config cost.
2. **Graphify activation for `explore`** — `explore` fired 171× (highest-
   volume agent). The graph exists locally (`graphify-out/graph.json`,
   858 KB); the `@explore` Graphify-first protocol is already wired.
   Operationalizing fresh-clone `/graph build` + a `/graph update` cadence
   cuts per-call context. Biggest DeepSeek-dollar lever.
3. **Session fan-out review** — batch `@code-review` per-PR instead of
   per-task; question whether every `@explore` dispatch is necessary.
   Workflow discipline, not config.
4. **Trim cached-instructions footprint** — AGENTS.md and conventions.md
   are loaded into every session and re-cached every turn. A smaller
   footprint multiplies savings across all sessions. Trades off agent
   guidance quality; deserves its own analysis and is structurally
   sensitive (AGENTS.md is the authoritative stack reference).
5. **Thinking-disable on UTILITY micro-tasks** (original analysis Point 1)
   — disable `thinking` on `title`/`summary`. Trivial impact: UTILITY is
   1.28M tokens / $0.09 all-time. Deferred indefinitely. Resolves a side
   finding: ADR-0011 §Context.4's claim that "thinking is provider-level,
   not agent-level" is contradicted by the current OpenCode docs
   (`agents.mdx` §Additional confirms agent-level options passthrough with
   provider-override semantics). ADR-0011's claim needs formal correction
   when this follow-up is revisited; not in scope here.

## Alternatives Considered

1. **Variant reduction as primary lever** (pull GLM `max`→`medium`,
   JUDGE `high`→`medium`) — rejected as primary. Finding 3 shows reasoning
   tokens are <1% of the footprint; variant-tuning cannot move cache_read.
   Retained as a secondary quality/latency tweak via `setup.json` (user's
   personal override domain, not repo config).
2. **Defer prune (status quo)** — rejected. The user initially deferred
   prune on the original analysis ("behavior unclear on 1.18.4"). Findings
   1–2 reframed it as the highest-impact lever. The change's reversibility
   justified flipping it as an experiment rather than holding for full
   certainty.
3. **Trim AGENTS.md / instructions footprint** — deferred (Follow-up 4),
   not rejected. The cached prefix is re-read every session, so a smaller
   AGENTS.md would compound savings across every session — potentially
   higher-impact than prune. But it trades off agent guidance and is
   structurally sensitive; it deserves its own brainstorming cycle rather
   than being folded into this one.
4. **Behavioral-only (no config change)** — rejected as sole approach.
   Proactive compaction, subagent routing, and `/handoff` compound with
   prune, they do not substitute for it. Retained as complementary
   Follow-up 1.
5. **Supersede ADR-0031 entirely** — rejected. ADR-0031's tier assignments
   are not the problem; the cost model that justified its variant bumps
   was. This ADR amends the cost model in place and leaves ADR-0031's
   structure intact, preserving the cross-model review invariant and the
   `{env:VAR}` tier architecture.

## Cross-references

- ADR-0031 (model rebalance) — cost model amended here; tier assignments
  and footer convention stand.
- ADR-0014 (model default rebalancing) — DeepSeek variant-collapse finding
  stands but is now understood as second-order for cost.
- ADR-0011 (plan agent complexity) — its "thinking is provider-level, not
  agent-level" claim is contradicted by current OpenCode docs; flagged for
  formal correction when Follow-up 5 is revisited. Not resolved by this
  ADR.
- `.opencode/docs/context-management.md` — behavioral compaction guidance
  (Follow-up 1).
- `.opencode/docs/model-configuration.md` — variant documentation (now
  understood as a quality dial, second-order for cost).
- Commit `9ada68d` on `perf/kyau-6da1-compaction-prune-enable` — the
  one-line config flip this ADR records.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et :-->
