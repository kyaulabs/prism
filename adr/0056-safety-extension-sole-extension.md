# 0056. Safety Extension Is the Sole Extension

Date: 2026-08-12

## Status

Superseded by ADR-0091

Depends on ADR-0055. The safety extension's fail-closed invariant is inherited
from ADR-0036, and the consecutive-denial circuit breaker from ADR-0042.

## Context

The opencode harness shipped four TypeScript plugins: `sensitive-paths`,
`pre-tool-use` (the bash classifier), `denial-circuit-breaker`, and
`session-bootstrap`. Three of them are orchestration or bootstrapping
(`session-bootstrap` injected a system-prompt fragment; the classifiers were
woven through opencode's permission + part-status events). Under philosophy B
(ADR-0055) we carry zero orchestration extensions — but the safety classifier
is not orchestration: it is the documented pi security pattern
(`protected-paths.ts`, `permission-gate.ts` examples), and it encodes a
fail-closed guarantee the harness depends on (ADR-0036).

The question: do we keep any extension at all, and if so which, and how do we
port its event wiring to pi?

## Decision

We retain **exactly one extension — the safety gate** — in
`packages/prism-core/extensions/safety/`. It ports `sensitive-paths`,
`pre-tool-use` (the bash classifier), and `denial-circuit-breaker` verbatim
(the pure logic is unchanged) and wraps them in a single pi extension wired to
pi's `tool_call` event. `session-bootstrap` is **not** ported as an extension:
its system-prompt fragment becomes pi-native `APPEND_SYSTEM.md`
(`~/.pi/agent/APPEND_SYSTEM.md`), which pi appends to every turn
automatically.

The extension reads its `rm -rf` safe-zones from the active adapter's
`safe-dirs.json` (ADR-0058), so the safety boundary tracks the stack without a
second extension. The `OPENCODE_SENSITIVE_PATHS` env var is renamed to
`PRISM_SENSITIVE_PATHS` (both are read during a migration grace period).

**Simplification vs opencode:** in pi, returning `{ block: true, reason }`
from a `tool_call` handler is unambiguously a denial — no need to correlate
`message.part.updated` tool-part states with `tool.execute.after` (the
opencode ADR-0042 Probe-3 dance). The breaker trips at 3 consecutive blocked
bash calls and resets on any successful bash.

## Consequences

- **Easier:** one extension to maintain; the safety invariant is the only
  enforced contract — everything else is instruction-only (ADR-0055).
- **Harder:** the fail-closed guarantee must be preserved verbatim — the
  classifier throws (blocks) on any internal error, exactly as ADR-0036
  requires. pi `tool_call` blocker semantics must be confirmed to trip/reset
  correctly during the Stage 1 port; a deviation is recorded here if found.
- **Follow-up:** Stage 1 of the conversion plan ports the extension; the
  adapter safe-dirs contract is produced in Stage 4.

## Alternatives Considered

- **No extension at all (pure instruction-only safety).** Rejected: the
  fail-closed guarantee on destructive commands (`rm -rf`, `git commit -n`)
  and on sensitive paths (`~/.ssh`, `.env`) is load-bearing and must not rely
  on model compliance. This is the documented pi security pattern, not
  orchestration.
- **Keep `session-bootstrap` as an extension.** Rejected: pi's
  `APPEND_SYSTEM.md` mechanism does exactly what the plugin did with zero
  code.
- **Multiple safety extensions (one per concern).** Rejected: the three
  classifiers share state (the circuit breaker observes every denial) and
  belong in one process.
