# 0087. Structured redacted safety diagnostics

Date: 2026-08-25

## Status

Accepted

Extends ADR-0036, ADR-0047, ADR-0056, and ADR-0073. It supersedes only
ADR-0047's requirement that every sensitive-operand analysis failure surface
the same constant reason. The prohibition on exposing command text, paths,
tracker content, credential content, arguments, output, or metadata remains.

## Context

The safety extension fails closed when its flat shell tokenizer cannot prove a
command safe. This is intentional and load-bearing. Unsupported constructs
include command and process substitution, backticks, ANSI-C quoting,
here-strings, recursive evaluators, unsafe arithmetic contexts, variable
command positions, excessive wrapper depth, and untrusted setup subcommands.

The sensitive-operand classifier currently collapses every one of these causes
to a match containing only the class `unresolvable`. The tool-call handler can
therefore report only that the command could not be analyzed. Users cannot tell
which parser stage rejected the command or how to express the same safe intent.
Tracker comment workflows are a frequent example: Markdown backticks embedded
in a shell heredoc are seen as possible command substitution, but the message
does not identify backticks or recommend moving the payload out of shell
source.

ADR-0047 chose a constant generic reason to prevent credential leakage. More
actionable diagnostics are compatible with that security goal if they report
only classifier-owned categories and static remediation text, never raw input.
Pi's `tool_call` blocker accepts an arbitrary reason string, so no runtime or
extension-topology change is required.

## Decision

Safety analysis returns structured diagnostic metadata for fail-closed analysis
classes. Each diagnostic contains only classifier-owned values:

- a stable machine-readable code;
- the analysis stage;
- the unsupported syntax or evaluation category;
- a static safe-retry recommendation; and
- optionally a non-content character offset when it improves localization.

The initial diagnostic categories cover:

- command substitution;
- backtick substitution;
- ANSI-C quoting;
- process substitution;
- here-string syntax;
- recursive evaluator builtins;
- recursive or identifier-based arithmetic evaluation;
- unsafe indexed parameter or assignment evaluation;
- variable command position;
- wrapper-depth exhaustion;
- untrusted setup subcommand execution; and
- internal classifier failure.

The user-facing denial reason retains the leading fail-closed statement and ADR
reference, then adds the stable code, stage, category, and safe retry. It never
includes the command, token, payload, title, body, comment, label, path,
resolved path, environment value, session identity, or subprocess output.
Sensitive-path matches continue to use their redacted policy reason rather than
naming the matched path class.

The diagnostic structure is shared by the sensitive-operand classifier and the
destructive-command classifier where they detect the same unsupported shell
construct. Classification remains pure and fail closed. No parser exception,
allowlist, shell execution, command normalization, or automatic rewrite is
introduced.

Static retry recommendations prefer observable safe steps from ADR-0073:
write inert payloads with Pi file tools, retain validated output as agent
context, invoke a literal script or payload path in a later command, or split a
compound capture into separate calls. Fixed mechanics outside the supported
shell subset remain launcher-owned under ADR-0070.

The denial circuit breaker behavior is unchanged. Every blocked Bash call still
feeds the window, and the trip escalation remains redacted to counts and
identity as required by ADR-0042, ADR-0068, and ADR-0069.

## Consequences

**Positive:**

- Users receive an actionable reason instead of guessing among unrelated shell
  restrictions.
- Stable codes make regressions and support reports searchable without logging
  sensitive input.
- Tracker payload and other Markdown-heavy workflows can recommend the correct
  file-based retry pattern directly.
- The fail-closed and sole-extension invariants remain intact.

**Negative:**

- The classifier must preserve cause information through more internal layers.
- Diagnostic categories become a compatibility surface that requires tests and
  deliberate additions.
- Static hints cannot guarantee the user's intended command is safe; they only
  describe supported expression patterns.

**Neutral:**

- Legitimate commands using unsupported shell grammar remain blocked.
- Circuit-breaker thresholds, recovery, and fatal commit behavior do not
  change.
- No new dependency, parser, extension, or credential surface is introduced.

## Alternatives Considered

### Echo the rejected command or token

Rejected. Raw shell input may contain credentials, sensitive paths, tracker
content, or prompt-injected data and violates ADR-0047 redaction.

### Keep one generic unresolvable reason

Rejected. It preserves security but makes legitimate recovery needlessly
opaque and directly causes repeated blocked retries.

### Parse the complete POSIX shell grammar

Rejected. It expands the security surface and contradicts ADR-0036 and
ADR-0073's conservative supported-subset strategy.

### Add tracker-specific safety exceptions

Rejected. Workflow-specific exceptions weaken the shared boundary. Tracker
payloads must move out of shell source instead.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
