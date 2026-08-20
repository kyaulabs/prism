# Spec: Prism Tool Execution Timeout Override

**Date:** 2026-08-19
**Status:** Approved design; awaiting written-spec review

## Problem Statement

`prism-tool run` enforces each declared tool's bounded execution timeout. OCR currently defaults to 600,000 ms, so a valid long-running review can be terminated by the launcher even when Pi's outer Bash timeout is longer. Callers have no explicit launcher-owned way to raise the limit for one invocation.

## Solution

Add an optional `--timeout-ms=NNN` control to `prism-tool run`. The control belongs to the launcher and therefore appears after the declared tool ID but before the `--` separator:

```bash
prism-tool run ocr --code-egress-approved=yes --timeout-ms=900000 -- review --audience agent --format json
```

The override applies consistently to every declared command tool. Existing invocations remain unchanged and retain their current effective defaults. The override may only keep or raise the selected tool's effective default and may never exceed the hard 900,000 ms (15-minute) ceiling.

## Requirements

1. `parseRun` accepts at most one control matching `--timeout-ms=NNN` in the launcher-control region between `TOOL_ID` and `--`.
2. `NNN` is an unprefixed decimal integer with no sign, fraction, exponent, whitespace, or leading zero.
3. The override is valid only when it is greater than or equal to the selected tool's effective default and less than or equal to 900,000 ms.
4. A component's declared `executionTimeoutMs` remains its effective default. Components without that field retain the process runner's 30,000 ms default.
5. Invalid, duplicate, below-default, and above-ceiling overrides fail with usage status before the declared subprocess executes.
6. A valid override is passed to the existing bounded process runner without entering the child process argument array or environment.
7. OCR connectivity and code-egress approvals remain unchanged and independent of timeout selection.
8. The toolchain contract may declare defaults up to the same 900,000 ms hard ceiling; no existing default is raised by this change.
9. No environment-variable timeout override is introduced.

## Testing

- Extend launcher parsing and execution tests for the new control.
- Prove an invocation without the control still receives the existing component/process default.
- Prove exact default and 900,000 ms values are accepted and propagated.
- Prove malformed, duplicate, below-default, and above-ceiling controls return usage failure before subprocess execution.
- Prove launcher controls are not forwarded to the declared tool.
- Retain existing OCR egress-approval and argument-policy tests.

## Out of Scope

- Raising OCR's default timeout.
- Allowing execution beyond 15 minutes.
- Adding timeout configuration through environment variables or project files.
- Changing subprocess output limits, readiness probes, connectivity checks, or OCR's own per-file review timeout.
- Changing Pi's Bash tool timeout.
