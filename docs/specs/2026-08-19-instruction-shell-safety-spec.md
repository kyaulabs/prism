# Spec: Instruction Shell Safety Compatibility

**Date:** 2026-08-19
**Status:** Approved

## Problem Statement

Prism's safety extension fails closed when a Bash tool call contains shell constructs that its flat classifier cannot model, including command substitution and ANSI-C quoting. Several packaged skills, prompt templates, and authoritative instruction documents still prescribe those constructs, so agents following Prism's own instructions can be blocked by Prism's safety policy.

The instruction surface also contains a parenthesized subshell command. Although that construct is not currently blocked by the classifier, it violates the stricter requirement that executable instruction examples use no subshells.

## Solution

Make the complete packaged instruction surface compatible with the safety extension and the stricter no-subshell rule. Shell procedures will be expressed as separate, simple commands. Values produced by one command will be retained as validated agent context, written to stable project-local temporary files, or rendered as literal placeholders in a later command instead of being captured through shell substitution.

Script and skill directory resolution will follow ADR-0073, which preserves ADR-0065's self-locating resolver architecture while superseding its inline invocation syntax: resolve first, then invoke the resulting literal path in a separate tool call. The safety extension's fail-closed behavior remains unchanged under ADR-0036 and ADR-0056.

Add a repository-wide regression seam that scans every packaged skill, prompt template, and authoritative instruction document. The seam will reject raw command-substitution syntax, raw ANSI-C quote syntax, and parenthesized subshell commands inside shell fences.

## User Stories

1. As a Prism user, I want every documented shell command to pass the active safety extension, so that following a skill or prompt does not trigger a denial.
2. As an agent, I want command-output capture described as explicit multi-step work, so that I do not improvise blocked shell substitutions.
3. As a maintainer, I want one global regression seam, so that newly added skills and prompts cannot reintroduce unsupported shell syntax.
4. As a downstream package consumer, I want script resolution to continue working both inside the Prism checkout and from installed packages.
5. As a security maintainer, I want the extension's fail-closed classifier left intact, so that instruction compatibility does not weaken enforcement.
6. As a search-skill user, I want bundled search helpers to retain their current runtime behavior, because their internal shell implementation is outside the instruction-layer classifier boundary.

## Implementation Decisions

- Modify all packaged skills, prompt templates, and authoritative instruction documents that contain prohibited instruction-layer shell syntax.
- Treat raw command substitution and raw ANSI-C quoting as forbidden throughout the scanned Markdown surface, including comments and prose examples, because the classifier examines Bash tool-call text before ordinary shell evaluation.
- Treat a command beginning with a parenthesized group inside a shell fence as a forbidden subshell instruction.
- Resolve launcher-owned directories in one command and use a literal resolved path in a later command.
- Replace shell-captured repository, branch, version, path, title, and identifier values with direct command output retained as validated agent context, stable project-local files, or explicit literal placeholders.
- Preserve existing workflow gates, validation rules, mutation approvals, untrusted-data boundaries, and output requirements.
- Do not change the safety extension classifier or its policy.
- Do not refactor bundled shell-helper internals; invoking those helpers by literal path remains inside the supported boundary.
- Use one repository-wide regression test rather than accumulating per-file assertions.

## Testing Decisions

- Add a Shell integration test over the public instruction surface.
- The test discovers packaged skill and prompt Markdown plus authoritative instruction documents and fails with file-and-line diagnostics for every prohibited construct.
- The test itself expresses search patterns without embedding the prohibited raw spellings.
- Run the new focused test red before editing the instruction surface and green afterward.
- Run existing shell tests that pin toolchain entrypoints, release behavior, pull-request preparation, ruleset setup, ticketing safety, and search-skill behavior.
- Run the full project gate after focused verification.

## Out of Scope

- Changing the safety extension's tokenizer, classifier, deny floor, or circuit breaker.
- Refactoring the internal implementation of bundled search helper scripts.
- Removing ordinary pipelines, shell variables, conditionals, loops, or functions that the classifier supports.
- Reworking unrelated command portability or toolchain contracts.
- Changing workflow semantics beyond the minimum restructuring needed to execute the same procedure safely.

## Further Notes

This cleanup follows the established pattern used by the existing safety-compatible conventional-commit and PHP check instructions: split compound capture into observable steps, retain validated values outside shell evaluation, and invoke literal paths. ADR-0036 governs fail-closed classification, ADR-0056 governs the sole safety extension, ADR-0065 retains the self-locating resolver architecture, and ADR-0073 governs safety-compatible instruction invocation.
