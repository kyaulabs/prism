# 0036. Safety Hook Fail-Closed Posture on Block Rules

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-21

## Status

Accepted

## Context

ADR-0023 established a `pre-tool-use.ts` safety hook with a fail-open posture:
`classifyCommand` never throws, and the hook handler catches classifier
exceptions and defaults to PASS. The rationale was that a buggy safety hook
must never brick all `bash` tool calls across the harness.

Issue #178 finding #6 demonstrated that this posture provides false confidence.
Six bypass classes (quote-obfuscated `rm`, `bash -c` wrapping, `git` global
options, bundled flags, `find -delete`, and `xargs` piped input) were trivially
exploitable because the classifiers used naive `command.split(/\s+/)`
tokenization. A classifier that cannot analyze a command it was asked to
evaluate must refuse the command — not silently pass it. The fail-open posture
is appropriate for infrastructure errors (e.g. disk full), not for incomplete
or bypassed analysis.

## Decision

`classifyCommand` now fails **closed**: any exception thrown during
classification (including the inner `classifyCommandImpl`) is caught by a thin
wrapper in `classifyCommand` and returns a BLOCK finding. The empty-command
short-circuit (`""` → PASS) is preserved — an empty command string has nothing
to evaluate and is not an error.

The outer hook handler (`tool.execute.before`) also fails closed: if
`classifyCommand` itself throws (e.g. an unexpected runtime error not caught by
the inner wrapper), the handler throws an error that aborts the tool call,
rather than silently returning.

Both locations surface a clear reason string referencing #178 and ADR-0036.

## Consequences

- **Positive:** A buggy or incomplete classifier now blocks the command it
  cannot evaluate, rather than silently passing it. This closes the #178
  finding #6 vulnerability class.
- **Negative:** If a future code change introduces an exception in the
  classifier (e.g. a null-pointer from a refactor), ALL bash commands will
  be BLOCKED until the bug is fixed. This is the trade-off for security:
  a blocked-but-legitimate command is recoverable (the human can run it
  manually); a silently-passed destructive command is not.
- **Mitigation:** `classifyCommand` remains a pure, side-effect-free function
  tested extensively through its public interface (tokenizer, rm, git, find
  detectors). The robust test suite at `tests/Plugin/pre-tool-use*.test.ts`
  is the primary defense against regressions.
- **Known limitation (tokenizer):** The tokenizer is intentionally minimal
  (whitespace + single/double quote spans). Full POSIX shell parsing (`$()`,
  heredocs, braces) is out of scope for v2. Deep nesting tests use `command`
  chaining rather than `bash -c` with escaped quotes to test the depth cap,
  as the minimal tokenizer cannot correctly re-tokenize multi-level escaped
  quote strings. A future v3 could integrate a real shell parser.
- **Supersedes** the fail-open clause of ADR-0023 (Documented in ADR-0023
  Status section).

## Related

- ADR-0023: safety hook — original fail-open decision, now partially superseded.
- Issue #178: safety hook bypass hardening (6 bypass classes + fail-closed).
- `tests/Plugin/fail_closed_contract.test.ts` — contract test asserting ADR-0036
  existence + Accepted status.
