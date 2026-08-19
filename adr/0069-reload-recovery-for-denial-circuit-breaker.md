# 0069. Reload Recovery for the Denial Circuit Breaker

Date: 2026-08-18

## Status

Accepted

Supersedes only the recovery mechanism in ADR-0068. The threshold of three
blocked bash calls within the last ten bash calls remains unchanged.

## Context

ADR-0068 requires `/new` after the denial circuit breaker trips. That command
replaces the conversation session, forcing users to abandon or reconstruct
active work after false positives or legitimate mistakes.

Pi 0.84.2 provides `/reload`. Its documented lifecycle emits
`session_shutdown`, reloads extensions, and emits `session_start` with reason
`reload` while preserving the current conversation. The safety extension
already clears all breaker state during `session_shutdown`, so `/reload`
provides the same user-controlled fail-closed reset without replacing the
session.

The blank-line enforcement verification exposed the operational cost: a
single-quoted conflict-marker regular expression contained `<<<`, which the
quote-insensitive classifier mistook for a here-string. Repeated diagnostic
attempts reached the threshold and instructed the user to discard another
session.

## Decision

The circuit breaker remains tripped until the current agent run ends or the
user explicitly runs `/reload`. Breaker messages direct the user to `/reload`
and explain that the current conversation is preserved.

Reload remains a human-invoked Pi command rather than an agent tool. It tears
down the active extension instance before loading a fresh instance, so stale
breaker state cannot survive the reset. The threshold, sliding window,
redaction, sensitive-path deny floor, and fail-closed classifier behavior do
not change.

## Consequences

**Positive:**
- Users recover from a trip without creating a new conversation session.
- Recovery uses Pi's documented extension lifecycle and the safety
  extension's existing `session_shutdown` cleanup.
- An agent cannot silently reset its own breaker through a tool call.

**Negative:**
- Reload also refreshes other configured Pi resources, not only breaker state.
- A user can deliberately reset the breaker and retry denied commands, as they
  could previously by starting `/new`.

**Neutral:**
- `/new` still resets the breaker because it also tears down the extension,
  but it is no longer the recommended recovery path.
- ADR-0068 remains authoritative for window and threshold semantics.

## Alternatives Considered

- **Keep `/new` as the only documented recovery.** Rejected: it discards
  conversational continuity without improving the user-controlled security
  boundary.
- **Add an agent-callable reset tool.** Rejected: an agent caught in a denial
  loop must not be able to clear its own breaker.
- **Reset automatically after a timeout.** Rejected: elapsed time is not a
  trustworthy signal that the denial loop has ended.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
