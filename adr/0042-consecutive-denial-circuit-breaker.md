# 0042. Consecutive-Denial Circuit Breaker

Date: 2026-07-28

## Status

Accepted

Verified by Probe-3 (2026-07-28): a six-case runtime observability study
confirmed that `message.part.updated` `state.status: "error"` plus the absence
of a matching `tool.execute.after` reliably identifies all non-execution
outcomes (config-deny, safety-hook block, ask rejection). Normal execution —
including nonzero exit codes — always produces `completed` + `after`, so the
structural predicate does not false-positive on execution failures. References
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
3. **The denial signal is structural, not explicit.** Probe-3 established
   that a config-denied bash command emits `tool.execute.before` and a
   `message.part.updated` with `state.status: "error"`, but produces **no**
   `tool.execute.after` and **no** `permission.ask` hook fire. The
   `ToolState` discriminated union has no `"denied"` variant — denied,
   blocked, and rejected commands all collapse to `status: "error"`. The
   breaker must therefore infer denial from the structural predicate rather
   than reading an explicit denied flag.

## Decision

### 1. Add a `DenialCircuitBreaker` state machine with latched escalation

`.opencode/plugins/denial-circuit-breaker.ts` exports a `DenialCircuitBreaker`
class: threshold 3 (matches `doom_loop`), per-`sessionID` isolation,
reset-on-success. `observe(sessionID, denied)` increments on denial, resets to
zero on success, and returns a `DenialObservation` with `count`, `tripped`,
and a one-shot `transitioned` flag (true only when the count moves from 2 to
3). The `transitioned` flag ensures escalation fires exactly once per trip.
Supporting methods: `count(sessionID)` (diagnostic), `isTripped(sessionID)`
(pure query), `reset(sessionID)` (explicit reset), `clearAll()` (lifecycle
cleanup).

### 2. Add a `DenialOutcomeTracker` for correlated call tracking

A `DenialOutcomeTracker` correlates `message.part.updated` tool-part events
and `tool.execute.after` hooks by `(sessionID, callID)`. It feeds
`DenialCircuitBreaker.observe()` when a tracked bash call reaches
`state.status: "error"` with no prior matching `after`. A matching bash
`after` (including nonzero exit or ask-approval) settles the call and resets
the session. Non-bash outcomes are ignored. The tracker supports multiple
outstanding calls per session and a bounded settled-call cache for duplicate
suppression.

### 3. Detection mechanism — before/after callID reconciliation (locked by Probe-3)

**Option 3a — structural outcome inference (confirmed).** The detection
predicate is:

```text
tracked bash ToolPart
+ matching message.part.updated state.status == "error"
+ no matching tool.execute.after observed
= denial event
```

Probe-3 confirmed this predicate across six runtime cases (see Evidence
below). The `error` + no-`after` signature covers config-deny, safety-hook
block, and ask rejection — all non-execution outcomes that the breaker should
count identically. Normal execution, including nonzero exit codes, always
reaches `completed` + `after`, so it resets the streak.

**Option 4a — event-stream failure counting — eliminated.** The plugin
`event` hook receives v1 events only; `session.next.tool.*` v2 events are not
observable. Option 4a is non-viable.

**Config-deny vs safety-block indistinguishability is intentional.** Both
produce byte-identical event sequences (`pending → running → error`, no
`after`, no permission events). The breaker counts both identically — they are
both denials from the agent's perspective.

Freeform error-string matching against `state.error`, exception messages,
command text, output, metadata, or permission prose is **prohibited**. The
detection is purely structural.

### 4. Escalation — abort + diagnostic + tripped guard

On the **third** terminal `error`+no-`after` outcome (the trip transition),
the integration layer:

1. Latches the session as tripped (before any async side effect).
2. Emits a best-effort redacted diagnostic via `client.app.log` — payload
   contains only: service, event category, `sessionID`, `callID`, tool
   (`"bash"`), count, and threshold. **Never** command text, args, output,
   title, metadata, resources, or error messages.
3. Awaits `client.session.abort({ path: { id: sessionID } })`. Abort must
   return `{ data: true, error: undefined }`. Abort rejection, `error`, or
   `data !== true` throws a sanitized failure while leaving the trip latched.
4. Logging failure does not prevent abort; abort failure does not suppress the
   tripped guard.

The third call has already failed to execute — it cannot be retroactively
blocked. The **tripped guard** in `tool.execute.before` throws on any
subsequent tool call (the fourth and beyond) while the session is tripped,
blocking queued continuations. This guard runs before the existing safety
classifier so it does not depend on cross-plugin ordering.

### 5. Reset and lifecycle cleanup

- A matching bash `tool.execute.after` (exit 0, nonzero exit, or ask-approved)
  resets the session counter to zero and settles the pending call.
- Non-bash success does **not** reset the bash-denial streak.
- `clearSession(sessionID)` and `clearAll()` remove counts, pending calls,
  settled-call IDs, and tripped state. Called on `session.idle`,
  `session.deleted`, and plugin `dispose`.

### 6. Scope

Issue #274 only. The `plan` agent's `"doom_loop": "allow"`
(`opencode.jsonc:101`) is a separate latent misconfiguration — and moot for
the bash-denial scenario, since `plan` carries `bash: "deny"` and never runs
bash directly. It is explicitly **not** touched here; it is tracked as a
follow-up.

## Evidence — Probe-3 six-case correlation matrix

| Case | Condition | Final `state.status` | `tool.execute.before` | `tool.execute.after` | Permission events | Denial? |
|:---:|---|:---:|:---:|:---:|---|:---:|
| 1 | Allowed + exit 0 | `completed` | Yes | Yes | No | No |
| 2 | Config-denied (`@explore`) | `error` | Yes | **No** | No | **Yes** |
| 3 | Allowed + nonzero exit | `completed` | Yes | Yes | No | No |
| 4 | Safety-hook block | `error` | Yes | **No** | No | **Yes** |
| 5 | Ask approved | `completed` | Yes | Yes | `asked`+`replied` (`once`) | No |
| 6 | Ask rejected | `error` | Yes | **No** | `asked`+`replied` (`reject`) | **Yes** |

Key findings: (a) `error` + no-`after` reliably identifies all non-execution
outcomes; (b) nonzero exit produces `completed` + `after` (not `error`); (c)
`permission.ask` hook never fires in any scenario; (d) v2
`session.next.tool.*` events are not observable through the plugin event hook;
(e) cancellation/timeout/spawn-failure scenarios were not tested — they count
as denials only if they satisfy the structural predicate.

## Consequences

**Positive:**
- Bounded consecutive-denial escalation stops the variation-retry hang class
  for the bash-denial scenario that `doom_loop` misses.
- Zero permission-logic drift — detection uses structural outcome correlation,
  never a re-implementation of OpenCode's wildcard / last-rule-wins /
  agent-global-merge matching.

**Negative:**
- The third call cannot be retroactively blocked — it has already failed to
  execute by the time its `error` status is observed. The tripped guard
  blocks the fourth and subsequent calls.
- `session.abort` is a hard stop of the entire agent invocation. Legitimate
  but repeated non-execution outcomes (e.g. a flaky spawn) would abort a
  session at threshold 3. Mitigation: the threshold is tuned to
  `doom_loop`'s 3, and reset-on-success means a single working bash command
  clears the count.
- Cancellation/timeout/spawn-failure scenarios were not tested in Probe-3. If
  a future OpenCode version emits `error` status for non-denial scenarios,
  detection could count them — though the threshold-3 + reset-on-success
  design keeps this low-risk.
- The integration layer's deterministic tests cover the state machine,
  tracker correlation, and hook wiring with mocked clients. Live verification
  confirms the runtime event contract but is not itself unit-testable.

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
  auto-deny (the original "Path B"):** Rejected. Probe-3 confirmed
  `permission.ask` hook never fires in any scenario (not just config-deny) —
  so this approach cannot observe denials either, and it would weaken
  defense-in-depth (fail-open-to-prompt if the plugin fails to load).
- **Event-stream failure counting (Option 4a — `session.next.tool.failed`):**
  Eliminated by Probe-3. The plugin `event` hook receives v1 events only;
  v2 `session.next.tool.*` events are not observable.
- **Fix the `plan` agent's `doom_loop:"allow"` as part of this work:**
  Rejected for scope. It is moot for the bash-denial scenario (`plan` denies
  all bash) and is tracked as a separate follow-up.

## Cross-references

- ADR-0006 (referenced — read-only agent permission contract; the agents this
  breaker protects)
- ADR-0023 (referenced — `pre-tool-use.ts` safety hook; the plugin family
  this joins)
- ADR-0036 (referenced — fail-closed posture; the escalation `throw` and
  tripped guard inherit it)
- Issue #274 (consecutive-bash-denial circuit breaker)
- Upstream `doom_loop` (`permissions.mdx:164` — the identical-input guard this
  extends for the bash-denial variation-retry class)
- Upstream feature request: a `"denied"` variant on `ToolState` (distinct
  from `"error"`) to make the denial signal authoritative rather than
  structural

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
