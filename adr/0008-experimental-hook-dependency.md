# 0008. Experimental Hook Dependency for Session Bootstrap

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-09

## Status

Accepted

## Context

The session-bootstrap plugin (`.opencode/plugins/session-bootstrap.ts`) is the
structural enforcement mechanism for the anti-drift rationalization red-flags.
Its primary purpose is to inject the bootstrap text
(`.opencode/docs/session-bootstrap.md`) into the system prompt on every LLM
call, ensuring the model cannot "forget" to load skills or skip pipeline steps.

The plugin relies on two experimental hooks from `@opencode-ai/plugin`:

1. `experimental.chat.system.transform` — pushes text into `output.system` on
   every LLM call (primary enforcement).
2. `experimental.session.compacting` — pushes text into `output.context` during
   session compaction (persistence across context window resets).

As of SDK v1.17.15, `experimental.chat.system.transform` is defined in the
`Hooks` interface but was NOT documented in the upstream OpenCode docs
(`plugins.mdx`). This created a risk (issue #63) that the hook might be
"silently inert" — present in types but never dispatched at runtime, leaving
the anti-drift enforcement non-functional while tests stayed green.

**Runtime dispatch verification:** The hook IS dispatched at runtime. In
`packages/opencode/src/session/llm/request.ts` (anomalyco/opencode, dev
branch), the `prepare()` function triggers it via the generic plugin dispatch:

```typescript
yield* input.plugin.trigger(
    "experimental.chat.system.transform",
    { sessionID: input.sessionID, model: input.model },
    { system },
)
```

This is called on every LLM request after the system prompt array is assembled
and before messages are sent to the model. The same generic `plugin.trigger()`
mechanism dispatches all experimental hooks, including the documented
`experimental.session.compacting` (in `packages/opencode/src/session/compaction.ts`).

## Decision

Continue using `experimental.chat.system.transform` as the primary
system-prompt injection mechanism, rather than falling back to the
`instructions` array in `opencode.json`.

Rationale:

- The hook IS dispatched at runtime (confirmed via upstream source research).
- The hook is in the same `Hooks` interface and dispatched via the same
  `plugin.trigger()` mechanism as the documented, working
  `experimental.session.compacting` hook.
- The `instructions` array only affects the initial system prompt and cannot
  replicate the compaction-context injection that
  `experimental.session.compacting` provides. Migrating to `instructions`
  would be a functional regression for compaction persistence.

To mitigate the "silently inert" risk, two guards are in place:

1. The plugin uses a typed intermediate variable
   (`const hooks: Hooks = {...}`) so `tsc --noEmit` fails on invalid hook
   names via excess property checking.
2. A type-level assertion test in
   `tests/Plugin/session-bootstrap.test.ts` independently validates that both
   hook names are valid `Hooks` keys — failing `tsc` if the SDK removes or
   renames either hook.

## Consequences

- **Positive:** Both system-prompt injection and compaction-context injection
  are preserved. The anti-drift enforcement is structural (not model-chosen).
- **Positive:** The vendored `plugins.mdx` now documents
  `experimental.chat.system.transform` under a "System prompt transform hooks"
  section, citing the SDK type definitions as the source of truth.
- **Negative:** The plugin depends on an experimental hook that may be removed
  or renamed in a future SDK version. If this happens, `tsc --noEmit` will
  fail, making the breakage loud rather than silent.
- **Fallback:** If the hook is removed, migrate the system-prompt injection to
  the `instructions` array in `opencode.json`. The compaction-context
  injection would need a separate solution (e.g., a documented hook or a
  persistence mechanism).
- **Related documents:** Updated `plugins.mdx` (vendored docs), type assertion
  test in `session-bootstrap.test.ts`, `package.json` (added
  `@opencode-ai/plugin` to root devDependencies).

## Alternatives Considered

1. **`instructions` array in `opencode.json`** — Rejected. Only affects the
   initial system prompt; cannot inject into compaction context. Would lose
   the `experimental.session.compacting` functionality.
2. **Wait for the hook to become stable/documented** — Rejected. The anti-drift
   enforcement is needed now; the experimental status is acceptable given the
   runtime dispatch confirmation and the type-level guard tests.
3. **Duplicate the bootstrap text in both `instructions` and the plugin** —
   Rejected. DRY violation; the plugin is the single source of truth. Two
   injection paths would diverge.
