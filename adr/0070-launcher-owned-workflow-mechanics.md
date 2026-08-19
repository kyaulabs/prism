# 0070. Launcher-Owned Workflow Mechanics

Date: 2026-08-18

## Status

Accepted

Depends on ADR-0036, ADR-0047, ADR-0056, ADR-0063, and ADR-0065.

## Context

Prism prompt templates sometimes require agents to execute fixed multi-step
shell mechanics. Pull request preparation includes command substitution for
branch discovery, repository-state checks, identity resolution, and title
validation. Pi presents the complete command string to the safety extension's
`tool_call` handler before Bash executes it.

The safety extension deliberately fails closed on shell grammar its flat
tokenizer cannot model. Allowing arbitrary command substitution would reopen
destructive-command and sensitive-path bypasses, while command-specific parser
exceptions have repeatedly produced false positives and new bypass surfaces.
As a result, the pull request prompt and the safety boundary became
incompatible: the required preflight was blocked before execution even though
it referenced no sensitive path.

Existing prompt tests did not catch the conflict because they extracted the
inline block to a script and invoked that script. The safety extension saw
only the script path, not the agent-visible shell source.

## Decision

Fixed workflow mechanics that require shell grammar outside the safety
classifier's supported subset are owned by the existing `prism-tool` launcher.
The launcher exposes narrow operations with stable arguments, bounded
subprocess execution, sanitized diagnostics, and explicit output contracts.
Prompt templates invoke those operations with substitution-free commands.

Pull request preparation adopts this boundary for mechanical preflight and
title validation. The operations preserve the existing readiness, branch,
clean-tree, base-reference, commit-range, attribution, identity, and
commitlint requirements. Repository-derived values remain inert data and are
never evaluated as shell source.

The safety extension remains fail closed. This decision adds no command
allowlist, parser exception, second extension, or external dependency.

Prompt contracts that contain agent-executed marked blocks are tested at the
actual Pi boundary: the exact extracted command is passed through the public
safety tool-call handler. Functional tests of the launcher operation remain a
separate seam; executing an extracted block as a script is not sufficient
proof of safety compatibility.

## Consequences

- **Positive:** pull request preparation can execute through Pi without
  weakening sensitive-path or destructive-command enforcement.
- **Positive:** fixed workflow mechanics gain a stable, self-locating
  interface shared by source checkouts and installed consumers.
- **Positive:** prompt/safety incompatibility becomes a mechanically tested
  contract.
- **Negative:** the launcher owns additional workflow-specific operations and
  their compatibility surface.
- **Negative:** changes to preflight or title policy must update launcher,
  prompt, and integration tests together.
- **Neutral:** artifact interpretation and display remain agent-owned; GitHub
  publication remains human-run.

## Alternatives Considered

### Allow benign command substitution in the safety classifier

Rejected. A flat tokenizer cannot prove arbitrary substitution safe, and a
broad exception would restore known destructive-command and credential-path
bypasses.

### Add command-specific substitution exceptions

Rejected. Git and shell spelling variants make an allowlist brittle, and
recent exception rounds demonstrated that partial shell parsing creates an
unbounded maintenance and security surface.

### Execute extracted prompt blocks as temporary scripts

Rejected as the public workflow contract. It hides shell source from the
safety boundary, depends on scratch-file lifecycle, and reproduces the exact
test seam that failed to detect this regression.

### Add another Pi extension or custom tool

Rejected by ADR-0056. The existing launcher already owns deterministic,
self-locating toolchain operations without expanding Pi's extension surface.
