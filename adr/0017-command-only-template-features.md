# 0017. Command-Only Template Features: $ARGUMENTS and Shell Injection

Date: 2026-07-13

## Status

Accepted

## Context

Issue #97 identified that three agent files (`architect.md`, `debug.md`,
`tdd.md`) use `$ARGUMENTS` and one (`test-audit.md`) uses `` !`command` ``
shell injection. Both features are documented as command-only in the vendored
opencode docs (`commands.mdx`).

Source code analysis of `sst/opencode` (dev branch) confirms: template
processing (`$ARGUMENTS`, positional params `$1`–`$N`, `` !`command` ``
shell injection, `@file` references) happens exclusively in
`SessionPrompt.command()` (`session/prompt.ts` lines 1358–1481). Agent system
prompts are assembled statically by `session/system.ts` with zero template
processing. When `$ARGUMENTS` appears in an agent prompt, it renders as the
literal string `$ARGUMENTS`. When `` !`command` `` appears, it renders as
literal text and the command is never executed.

Conversely, four commands (`research.md`, `plan-to-issues.md`, `security.md`,
`teach.md`) that accept user arguments lacked `$ARGUMENTS` slots. opencode's
fallback (`prompt.ts` lines 1393–1395) appends arguments to the template, but
this prevents contextual argument placement.

## Decision

1. Agent files must not use `$ARGUMENTS` or `` !`command` `` — both are
   command-only features.
2. Agents reference "the invocation message" for their task context, since the
   task arrives as a separate user message at runtime.
3. Commands that accept arguments use explicit `$ARGUMENTS` placement rather
   than relying on the append fallback.
4. An architecture test (`tests/Unit/Harness/ArchTest.php`) enforces
   constraint 1 by scanning agent files for the forbidden patterns.

## Consequences

**Positive:**
- Agent system prompts are clean — no literal placeholder text leaking into
  the LLM context window.
- test-audit runs the coverage command itself (it already has bash permission
  for `pest --coverage`), ensuring fresh output every invocation.
- Commands have explicit, documented argument placement.
- The arch test prevents future regression.

**Negative:**
- Agent authors must remember that `$ARGUMENTS` doesn't work in agents
  (mitigated by the arch test + writing-skills Gotcha entry).
- Commands with `$ARGUMENTS` receive empty strings when invoked without
  arguments (mitigated by conditional language in each command template).

**Neutral:**
- This is specific to the opencode runtime; other agent frameworks may handle
  prompt substitution differently.

## Alternatives Considered

1. **Create a `/test-audit` command that pre-computes coverage output.**
   Rejected — adds indirection. test-audit already has bash permission for
   pest, so it can self-serve by running the command itself.

2. **Leave commands without `$ARGUMENTS` (rely on append fallback).**
   Rejected — the fallback works but prevents contextual argument placement,
   making command templates less clear and harder to maintain.

3. **Wait for opencode to add agent-level template processing.**
   Rejected — the separation is a deliberate design choice in opencode's
   architecture (commands are user-invoked with argument parsing; agents
   receive a task message). It is unlikely to change.
