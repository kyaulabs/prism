# Spec: Safety-Compatible Pull Request Preparation

**Date:** 2026-08-18
**Status:** Approved

## Problem Statement

Pull request preparation instructs the agent to execute inline shell blocks that use ordinary command substitution. The safety extension deliberately rejects command substitution that its flat tokenizer cannot model, so the required mechanical preflight is denied before execution and the workflow cannot produce pull request artifacts. The prompt workflow and safety policy therefore impose incompatible contracts.

The denial is reported as a sensitive-path failure even when the command references no sensitive path. Existing tests miss the incompatibility because they execute extracted blocks as scripts rather than passing the exact agent-visible command through the Pi tool-call safety boundary.

## Solution

Move the fixed pull request preflight and title-validation mechanics behind audited Prism toolchain operations. The agent invokes simple, substitution-free commands, while the operations perform their internal Git, readiness, identity, and validation work with fixed interfaces and inert arguments. Pull request preparation continues to generate and display artifacts only; it never pushes, opens a pull request, or mutates GitHub.

Keep the safety extension's fail-closed handling of unmodelable shell constructs intact. Do not add command-specific exceptions or expand the flat tokenizer into a partial shell parser.

## User Stories

1. As a Prism user, I want pull request preparation to complete without a false sensitive-path denial, so that a completed branch can reach human-run publication.
2. As a Prism user, I want the mechanical preflight to retain all branch, cleanliness, base-reference, commit-range, and net-diff checks, so that compatibility does not weaken readiness.
3. As a Prism user, I want title validation to retain toolchain readiness, attribution, identity, and commitlint checks, so that generated titles remain policy-compliant.
4. As a Prism maintainer, I want fixed pull request mechanics exposed through the existing toolchain boundary, so that prompts do not embed shell grammar the safety extension cannot model.
5. As a Prism maintainer, I want exact prompt commands tested through the public safety handler, so that future prompt and classifier changes cannot silently become incompatible.
6. As a security reviewer, I want destructive substitutions and sensitive-path reads to remain blocked, so that removing the workflow false positive does not weaken the deny floor.
7. As a downstream consumer, I want the operations to resolve from the installed Prism core as well as the source checkout, so that the workflow remains self-locating.
8. As a repository owner, I want generated repository evidence treated as inert data and GitHub mutation left to the human, so that the preparation boundary remains unchanged.

## Implementation Decisions

- Extend the existing Prism toolchain launcher with a pull request command family rather than adding another Pi extension.
- Provide one operation for mechanical preflight and one operation for title validation.
- Preserve the current preflight output fields and failure diagnostics as the stable interface consumed by the prompt workflow.
- Preserve title validation's file-based input and output boundary. Titles are read from a file, synthetic trailers are written only to the validation file, and payload text is never evaluated or embedded as shell source.
- Keep subprocess execution bounded and argument-array based. Repository-derived values are passed only as inert arguments.
- Keep local toolchain readiness mandatory before either operation proceeds.
- Change agent-executed marked blocks to substitution-free launcher invocations. Internal implementation details remain outside the agent-visible shell command.
- Keep pull request artifact generation, evidence interpretation, and final display in the prompt workflow.
- Do not weaken sensitive-path matching, destructive-command classification, circuit-breaker behavior, or redaction.
- Add no dependency and perform no network or GitHub mutation.

## Testing Decisions

- The primary public seam is the Pi safety handler receiving the exact marked command blocks extracted from pull request preparation. Every agent-executed marked block must pass this boundary without a denial.
- CLI integration tests execute the pull request operations against isolated Git fixtures and verify successful output, target-branch selection, and each existing fail-closed diagnostic.
- Title-validation integration tests verify valid titles, invalid titles, inert malicious-looking payload text, attribution resolution, and validation-file output.
- Existing safety tests remain the negative security seam for command substitution containing destructive operations or sensitive paths.
- Existing prompt-template tests remain the structural seam for marked-block extraction, template parity, preparation-only behavior, and absence of GitHub mutation.

## Out of Scope

- General support for arbitrary command substitution in agent-issued shell commands.
- Replacing the safety tokenizer with a complete POSIX or shell-specific parser.
- Creating, pushing, merging, or opening pull requests.
- Changing branch naming, attestation, review, coverage, or protected-branch policies.
- Adding a Pi extension or external dependency.
- Refactoring unrelated toolchain commands.

## Further Notes

This change aligns the pull request workflow with the safety extension, toolchain contract, self-locating script resolution, and fail-closed policies recorded by ADR-0036, ADR-0047, ADR-0056, ADR-0063, and ADR-0065. It also closes the test-seam gap that allowed a prompt command to remain mechanically valid while being impossible for Pi's agent tool boundary to execute.
