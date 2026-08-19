# 0073. Safety-Compatible Instruction Shell Contract

Date: 2026-08-19

## Status

Accepted

Supersedes ADR-0065's inline command-substitution invocation clause. ADR-0065's self-locating resolver architecture remains in effect.

## Context

ADR-0065 established self-locating script resolution through `prism-tool resolve scripts|skills`, but prescribed an instruction-layer invocation that embeds the resolver in shell command substitution. The Pi safety extension receives complete Bash tool-call text before execution and, under ADR-0036, fails closed on shell constructs its flat tokenizer cannot model. Command substitution is therefore blocked even when the nested command is benign.

The same incompatibility remains across multiple skills, prompt templates, and authoritative instruction documents. These resources use command substitution to discover repository state, capture validated command output, resolve launcher-owned paths, and pass file content. One credential-protection example also uses ANSI-C quoting, and one release recipe uses a parenthesized subshell. Agents following these instructions can trigger the safety extension or must improvise an unreviewed workaround.

ADR-0070 moved fixed workflow mechanics beyond the classifier's supported subset into narrow launcher operations. Not every remaining capture requires a new launcher operation: many values can be emitted in one tool call, validated and retained as inert agent context, then rendered literally in a later call. The instruction layer needs one consistent contract covering both cases.

## Decision

We require the complete executable instruction surface to use only shell syntax supported by the safety extension and to avoid subshells.

1. Packaged skills, prompt templates, and authoritative instruction documents contain no raw command-substitution syntax or raw ANSI-C quote syntax in executable guidance, comments, or examples.
2. Shell fences contain no parenthesized subshell commands.
3. Launcher-owned directories are resolved in one tool call. A later tool call invokes the resulting literal path. This supersedes ADR-0065's one-line invocation spelling without changing resolver discovery, checkout preference, installed-package fallback, or validation ownership.
4. Repository-derived values are produced by direct commands and retained as validated inert agent context, written to stable project-local temporary files, or handled by an existing narrow launcher operation. They are not captured by shell substitution.
5. Fixed workflow mechanics that cannot be expressed safely as observable agent steps remain launcher-owned under ADR-0070. The safety classifier gains no parser exception or allowlist.
6. A repository-wide regression seam scans every packaged skill, prompt template, and authoritative instruction document. It reports exact file-and-line findings for prohibited raw syntax and parenthesized subshell commands in shell fences.
7. Bundled helper scripts remain outside this instruction-layer syntax contract. The safety extension classifies the literal script invocation, not the script's internal implementation. Runtime helper refactors require separate behavior specifications and tests.

## Consequences

- **Positive:** Prism's own executable instructions pass the same fail-closed safety boundary imposed on agents.
- **Positive:** Script resolution remains self-locating in source checkouts and installed packages while using observable, auditable steps.
- **Positive:** One global regression seam prevents drift across current and future packages.
- **Positive:** The safety extension remains conservative; no command-specific parsing exceptions or additional extension surface is introduced.
- **Negative:** Some workflows become more conversational and require agents to retain validated outputs between separate tool calls.
- **Negative:** Long compound shell blocks must be decomposed, and tests must preserve workflow semantics across those observable steps.
- **Neutral:** Bundled helper scripts may continue using richer shell syntax internally because only their literal invocation crosses the Pi tool-call boundary.

## Alternatives Considered

### Permit benign command substitution

Rejected. A flat tokenizer cannot prove arbitrary nested shell source benign, and exceptions would weaken ADR-0036's fail-closed posture.

### Keep ADR-0065's inline spelling and execute it through temporary scripts

Rejected. Hiding agent-visible shell source inside a generated script bypasses the public safety seam identified by ADR-0070.

### Add launcher operations for every captured value

Rejected. Narrow launcher operations remain appropriate for fixed multi-step mechanics, but ordinary observable commands can safely return inert output for validation and literal reuse without expanding the launcher API.

### Refactor all bundled shell helpers under the same change

Rejected. Their internal syntax is not classified by the extension when invoked by literal path, and changing their runtime control flow would expand this instruction-layer correction into unrelated behavior work.
