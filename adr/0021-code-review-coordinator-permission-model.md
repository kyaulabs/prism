# 0021. Code Review Coordinator Permission-Model Carve-Out

Date: 2026-07-16

## Status

Accepted

## Context

ADR-0006 ("Read-Only Agent Permission Contract") locked `@code-review` to
`edit: deny` + `bash: "*": deny` + `webfetch: deny` + `task: deny`. Its
purpose (Issue #58) was to prevent read-only agents from mutating the
filesystem or git state.

Issue #137 requires `@code-review` to become a **coordinator** that
dispatches four parallel review axes: **ocr** (inline), **@standards-review**
(Fowler 12-smell baseline), **@spec-review** (requirement coverage), and
**@semgrep** (SAST). This requires relaxing `task: deny` to allow dispatching
these three read-only review sub-agents.

## Decision

Relax `@code-review`'s frontmatter: `task: deny` → scoped `task: allow` for
exactly three named sub-agents:

```yaml
task:
  "*": deny
  "standards-review": allow
  "spec-review": allow
  "semgrep": allow
```

The coordinator retains `edit: deny` — it cannot write files. It only
delegates to other **read-only** review sub-agents that themselves carry
`edit: deny` + `task: deny`. The mutation-prevention intent of ADR-0006
is preserved; only the isolation intent (no nested dispatch) is relaxed,
and only to read-only targets.

The harness validator (`validate-harness.sh`) is unaffected — it enforces
`edit: deny` and bash catch-all deny on read-only agents, but does **not**
check the `task:` permission key.

## Consequences

- `@code-review`'s description must retain a read-only keyword ("does not
  auto-fix" / "reports only") so the validator's read-only-keyword detection
  remains active and continues to check `edit: deny` + bash deny.
- Two new sub-agents (`@standards-review`, `@spec-review`) must carry
  `task: deny` to prevent unbounded nested dispatch.
- The `@semgrep` agent already carries `task: deny`.
- If opencode ever adds a `task:` validator check, ADR-0006 would need a
  formal amendment clause. Until then, the scoped carve-out is the
  lowest-risk path.

## Alternatives Considered

- **Full `task: allow`** → rejected. Unscoped dispatch exposes the
  coordinator to arbitrary sub-agent invocation, violating ADR-0006's
  mutation-prevention intent.
- **Keep single-axis (no coordinator)** → rejected. Issue #137 mandates
  multi-axis review with parallel dispatch for faster feedback loops.
- **Move coordinator logic to a new agent** → rejected. `@code-review` is
  the established review step in the pipeline; a separate coordinator adds
  indirection without benefit.
