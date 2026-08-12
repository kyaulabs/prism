# 0053. Present-Subcommand Trust for the Prism Manifest CLI

Date: 2026-08-11

## Status

Accepted

## Context

Human-invoked `/setup` reports both requested and active states for optional
MCP integrations. Active state depends on whether the resolved user-tier
`env.deepseek_api_key` or `env.searxng_url` prerequisite is non-empty.

ADR-0047 requires `prism_manifest.php get` and `values0` to return the literal
`[redacted]` for every `env.*` path, including an empty value. This prevents
secret output but makes empty and populated prerequisites indistinguishable.
The `env0` operation retains the distinction by emitting values and is
therefore forbidden to agents. Reading storage directly would bypass the
manifest boundary and the trusted `/setup` exception.

A Boolean presence operation discloses one bit of metadata. It must never
emit a value, prefix, length, path, or value-derived diagnostic. Trusting the
operation by subcommand name alone would also make arbitrary invocation shapes
eligible for the prism-user-manifest exception.

## Decision

We add `present PROJECT USER_OR_DASH DOT_PATH` to the Prism manifest CLI. It
loads one resolved project/user snapshot and emits exactly `true` or `false`.
Absent/null, the empty string, and Boolean false emit `false`; a non-empty
string, Boolean true, and every number including numeric zero emit `true`.
Arrays and objects fail closed with exit 1 and empty stdout. Invalid arity
exits 2. Existing `get`/`values0` redaction and `env0` behavior do not change.

We add `present` to the setup trust set only for direct depth-0 argv shaped
exactly as `present PROJECT USER_OR_DASH env.*`. No option or assignment token
may appear between `prism_manifest.php` and `present`. The project argument
must be path-shaped; the user argument must be path-shaped or `-`; the dot
path must begin with `env.` and contain no `=` (assignment-free); no extra
argument is accepted. Every
other `present` shape is `untrusted-subcommand`. Existing `get` and `validate`
trust does not change, and `env0`, `values0`, and `decode` remain untrusted.

The broad `env.*` prefix is deliberate: future setup-managed integration
prerequisites can use the same one-bit operation without widening plugin code
for each new key. Exact arity, path-shaped operands, invocation depth, scalar
fail-closed behavior, and Boolean-only output bound that future-facing trust.

`/setup` uses `present` for MCP prerequisites, accepts only literal `true` or
`false`, and aborts before writing when the command fails or emits anything
else. It computes active state as requested state AND literal presence.

This decision partially supersedes only ADR-0047 §4 and ADR-0048 §2 where
they limit trusted Prism manifest operations to `get` and `validate`. Their
remaining sensitive-path and invocation-scope decisions stay in force.

## Consequences

- `/setup` accurately distinguishes empty and populated MCP prerequisites.
- Secret values never enter the model-facing command output or setup report.
- The presence operation deliberately exposes one Boolean bit for any scalar
  `env.*` path when invoked through the exact trusted setup shape.
- New setup-managed `env.*` prerequisites do not require another plugin trust
  change.
- The matcher, CLI, setup command, living security documentation, and canary
  tests must evolve together.
- OpenCode must restart before the plugin and command changes take effect.

## Alternatives Considered

### Trust `present` by subcommand name alone

Rejected because arbitrary argument shapes would receive the
prism-user-manifest exception.

### Allow only the two current MCP prerequisite paths

Rejected by the human decision maker in favor of broad `env.*` trust so future
setup-managed prerequisites do not require plugin changes. The exact argv
shape and one-bit output remain mandatory.

### Reuse `get`, `values0`, or `env0`

Rejected because `get` and `values0` intentionally conflate empty and set
`env.*` values as `[redacted]`, while `env0` emits secret-bearing values and is
forbidden to agents.

### Read the user manifest directly

Rejected because it bypasses the shared manifest validation/resolution
boundary and violates the sensitive-path deny floor.
