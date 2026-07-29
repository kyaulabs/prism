# 0042. Consecutive-Denial Circuit Breaker

Date: 2026-07-28

## Status

Proposed

Moves to `Accepted` once the Task 2 integration (detection mechanism locked by
the probe-2 observability run) is verified in a live session. References
ADR-0006 (read-only agent permission contract — the agents this protects),
ADR-0023 + ADR-0036 (safety-hook family and fail-closed posture this extends).
Does not supersede any ADR.

## Context

Issue #274: an agent (e.g. `@explore`) denied a bash command retries with
syntactic variations of the same intent (`gh issue view 274`, then
`gh issue view 274 --json body`, then `bash -c "gh issue view 274"`, …),
burning model turns indefinitely — presenting as a harness hang requiring
manual termination.

Three forces converge:

1. **Upstream `doom_loop` misses variations.** OpenCode's built-in
   `doom_loop` permission is "triggered when the same tool call repeats 3
   times with **identical input**" (`permissions.mdx:164`) and only injects a
   recovery **prompt** (default `"ask"`), never a hard stop. Variation-retries
   use a different input string each time, so `doom_loop` never fires.
2. **No harness-level counter exists.** Both existing plugins
   (`pre-tool-use.ts`, `session-bootstrap.ts`) are stateless; there is no
   consecutive-denial tracking anywhere in the harness.
3. **The denial signal is awkwardly placed.** The H2 observability probe
   established that `tool.execute.before` **does** fire for config-denied
   bash commands (with `command` + `callID` + `sessionID`, but **no**
   denied/allowed field), while `permission.ask` does **not** fire for
   config-deny. So the breaker must attach at `tool.execute.before` and
   infer denial from a secondary outcome signal rather than a denied flag.

## Decision

### 1. Add a pure `DenialCircuitBreaker` state machine

`.opencode/plugins/denial-circuit-breaker.ts` exports a `DenialCircuitBreaker`
class: threshold 3 (matches `doom_loop`), per-`sessionID` isolation,
reset-on-success. `observe(sessionID, denied)` increments on denial, resets to
zero on success, and returns `true` once the count reaches threshold. It is
detection-agnostic — `denied` is fed by the integration layer — so the
deterministic core is unit-tested in isolation (7 cases at
`tests/Plugin/denial_circuit_breaker.test.ts`).

### 2. Attach at `tool.execute.before`; escalate via `session.abort`

A Plugin wires the breaker to `tool.execute.before` (bash): on each call, if
the per-session count has reached threshold, it escalates —
`client.session.abort({ path: { id: sessionID } })` plus a diagnostic
`client.app.log` naming the agent, denial count, and last command — then
`throw`s (fail-closed per ADR-0036, ensuring the current call does not proceed
even if the abort is asynchronous).

### 3. Detection mechanism (pending probe-2; two options under evaluation)

`tool.execute.before` carries no outcome, so the integration must determine
`denied` from a secondary signal. Two options are under evaluation; probe-2
locks the choice:

- **Option 4a — event-stream failure counting (primary):** count
  `session.next.tool.failed` (bash) as a denial and reset on
  `session.next.tool.success` (bash). Uses the runtime's own outcomes — zero
  permission-logic drift. Viable iff denied commands emit a `tool.failed`
  event (or `tool.called` with `provider.executed:false`).
- **Option 3a — before/after callID reconciliation (fallback):** a bash
  `callID` seen at `tool.execute.before` but never followed by
  `tool.execute.after` (before the next bash `before`) is a denial. Sound
  under OpenCode's sequential tool-call semantics (the model awaits each
  result before emitting the next call).

Both degrade safely (false negatives = the status quo, never false
positives).

### 4. Scope

Issue #274 only. The `plan` agent's `"doom_loop": "allow"`
(`opencode.jsonc:101`) is a separate latent misconfiguration — and moot for
the bash-denial scenario, since `plan` carries `bash: "deny"` and never runs
bash directly. It is explicitly **not** touched here; it is tracked as a
follow-up.

## Consequences

**Positive:**
- Bounded consecutive-denial escalation stops the variation-retry hang class.
- Strict superset of `doom_loop`: catches syntactic variations that
  identical-input keying misses.
- Zero permission-logic drift — detection uses the runtime's own outcomes
  (Option 4a) or structural absence (Option 3a), never a re-implementation of
  OpenCode's wildcard / last-rule-wins / agent-global-merge matching.

**Negative:**
- The integration layer has **no deterministic unit seam** (a live
  permission-resolution + agent-retry loop is not unit-testable). It relies
  on manual verification plus the event-firing contract confirmed by probe-2.
  If a future OpenCode version changes event emission for denied commands,
  detection could go blind — but it degrades safely to false negatives, never
  false positives.
- `session.abort` is a hard stop of the entire agent invocation. Legitimate
  but repeated failures (e.g. a flaky command) would abort a session at
  threshold 3. Mitigation: the threshold is tuned to `doom_loop`'s 3, and
  reset-on-success means a single working command clears the count.

**Neutral:**
- Read-only agents (ADR-0006) are the primary beneficiaries; unrestricted
  agents (`"*": "allow"`) rarely trip the breaker because their bash calls
  succeed and reset the count.

## Alternatives Considered

- **Replicate OpenCode's permission matching in the plugin (classify denial
  at `tool.execute.before`):** Rejected. It duplicates wildcard +
  last-rule-wins + agent/global merge logic — drift-prone and fragile,
  violating the "mechanically robust" requirement — and requires resolving
  the agent from `sessionID` (an async `client.session.get` inside the hook).
- **Prompt-level instruction ("stop after N denials"):** Rejected as the
  primary fix. Prose is not mechanically enforceable; the issue requires
  enforcement. Retained as a possible complement, not a substitute.
- **Route restricted agents' bash catch-all through `"ask"` + plugin
  auto-deny (the original "Path B"):** Rejected after probe-1. Unnecessary —
  `tool.execute.before` already fires for config-denied commands — and it
  would weaken defense-in-depth (fail-open-to-prompt if the plugin fails to
  load).
- **Fix the `plan` agent's `doom_loop:"allow"` as part of this work:**
  Rejected for scope. It is moot for the bash-denial scenario (`plan` denies
  all bash) and is tracked as a separate follow-up.

## Cross-references

- ADR-0006 (referenced — read-only agent permission contract; the agents this
  breaker protects)
- ADR-0023 (referenced — `pre-tool-use.ts` safety hook; the plugin family
  this joins)
- ADR-0036 (referenced — fail-closed posture; the escalation `throw` inherits
  it)
- Issue #274 (consecutive-bash-denial circuit breaker)
- Upstream `doom_loop` (`permissions.mdx:164` — the identical-input guard this
  strictly supersedes for the variation-retry class)

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
