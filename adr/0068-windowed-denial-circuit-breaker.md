# 0068. Windowed Denial Circuit Breaker

Date: 2026-08-17

## Status

Superseded by ADR-0069

Supersedes the circuit-breaker reset semantics of ADR-0042 (opencode-era,
as ported by ADR-0056): the pi-era breaker counts denials within a sliding
window of the last ten bash tool calls instead of resetting on any
successful command.

## Context

Issue #274 (opencode era) motivated a consecutive-denial breaker: an agent
denied a bash command retries with syntactic variations, burning turns
indefinitely. ADR-0042 fixed the consecutive case with reset-on-success —
any executed bash command cleared the count.

The 2026-08-16 external security audit (finding L-3) showed the
reset-on-success semantics defeat the loop-detection intent: an agent (or a
prompt-injected instruction) alternating one benign command (`true`) between
blocked attempts never reaches the three-in-a-row threshold, so the runaway
loop is never tripped. The harness's core safety posture is fail-closed
(ADR-0036); the breaker is the backstop for exactly this adversarial loop.

## Decision

1. **Windowed counting.** `DenialCircuitBreaker` keeps a per-session ring
   buffer of the last 10 bash call outcomes (denied/success). It trips when
   3 denials occur within the window. `observe(sid, denied)` keeps its
   `{ count, tripped, transitioned }` shape; `count` now means "denials in
   window".
2. **Successes age, they do not reset.** A successful bash call adds a
   success to the window; denials within the window persist until evicted
   by age. Evasion now requires 10+ benign bash calls between every pair of
   denials — a mostly-benign agent.
3. **Lifecycle unchanged.** `reset(sid)` on `agent_end` and `clearAll()` on
   session shutdown; the trip blocks every subsequent tool call until the
   user runs `/new` (fail closed, ADR-0036).
4. **Redaction preserved.** Escalation messages carry only identity and
   counts — never command text (ADR-0042 discipline).
5. **Threat-model documentation.** The window size (10) and threshold (3)
   are exported constants (`WINDOW_SIZE`, `DEFAULT_THRESHOLD`) and the
   policy is documented in the extension README.

## Consequences

**Positive:**
- The interleaving evasion is closed while preserving false-trip tolerance:
  3 denied commands within 10 bash calls is rare for legitimate work, and
  the window ages out over long healthy sessions.
- API shape of `DenialCircuitBreaker` is unchanged — only semantics.

**Negative:**
- A legitimate agent making 3 denied attempts within a 10-call span is
  stopped (the same false-trip risk ADR-0042 accepted at threshold 3, now
  spread over a window). Recovery is `/new`, unchanged.

**Neutral:**
- ADR-0042 remains a frozen opencode-era record; ADR-0056's port note
  remains historical. This ADR is the pi-era authority for breaker
  semantics.

## Alternatives Considered

- **Keep consecutive counting and document the limit.** Rejected: leaves
  the evasion the audit flagged as the thing to *decide*, not accept.
- **Reset only on `agent_end` (any 3 denials in a run trip).** Rejected:
  ADR-0042 explicitly avoided this shape — long legitimate runs with 3
  isolated denied attempts would hard-stop.
- **Decaying counter (multiply down on success).** Rejected: fiddly to
  tune; the ring-buffer window is simpler and directly expressible as
  "3 in the last 10".

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
