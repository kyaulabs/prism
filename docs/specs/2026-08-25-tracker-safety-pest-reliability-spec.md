# Spec: Tracker, Safety, Commit, and Pest Reliability

**Date:** 2026-08-25
**Status:** Approved

## Problem Statement

Prism's issue-tracker workflows still pause for permission that the active
workflow already grants, and several routine GitHub mutations initially use
interfaces that fail before an equivalent GraphQL retry succeeds. These
failures interrupt Wayfinder and Epic execution, produce partial tracker state,
and force the user to restart or manually retry operations.

Issue-derived implementation branches also lose their originating issue number,
so their commits do not reliably carry the closing reference that should close
an Epic task when the branch is merged.

When the safety extension rejects shell syntax it cannot model, its diagnostic
discards the specific parser cause and gives no actionable retry shape. Tracker
comments containing Markdown are a common trigger because payload content is
embedded in agent-visible shell source.

The PHP/web adapter's aggregate check uses the launcher correctly, but its TDD
guidance and plan-generation boundary do not make the canonical Pest coverage
invocation mandatory. Agents can therefore improvise direct Pest commands that
bypass the toolchain contract and its coverage-driver prefix.

## Solution

Prism will make read-only GitHub tracker access standing-authorized and align
global untrusted-content instructions with the bounded tracker workflow
authorization established by ADR-0085. Wayfinder invocation or continuation
will be treated as the complete authorization for routine lifecycle mutations,
without a second claim or exact-mutation confirmation.

Tracker mutations will use GraphQL as the canonical transport. New issue
creation will carry type, fields, labels, and parent relationships in one
bounded mutation where the GitHub schema permits it. Existing issue updates,
comments, closes, assignments, labels, field values, sub-issues, and blocking
edges will use their native GraphQL mutations on the first attempt. GraphQL
payloads containing tracker content will be written as inert project-local
temporary data and passed to one simple literal-path command, preserving the
ADR-0073 shell contract and the untrusted-data boundary.

Issue-derived plans will retain their originating issue number. Intermediate
logical commits will reference that issue without closing it, and exactly one
terminal logical implementation commit will carry the standardized closing
reference from ADR-0010.

The safety classifier will preserve a stable, redacted diagnostic category when
it fails closed. The user-facing block reason will identify the analysis stage,
the unsupported syntax category, a stable diagnostic code, and an actionable
safe retry pattern without exposing command text, tracker content, resolved
paths, or credential data.

The PHP/web adapter will define one canonical coverage invocation through the
Prism launcher, including the browser base URL. TDD, plan authoring, execution,
and aggregate checks will reject or normalize direct Pest coverage spellings
instead of improvising around the adapter's toolchain contract.

## User Stories

1. As a Prism user, I want read-only GitHub inspection to proceed without a
   permission prompt, so that inventory and triage workflows start immediately.
2. As a Wayfinder user, I want invoking or continuing a map to authorize its
   routine tracker lifecycle, so that claims, comments, closes, corrections,
   and frontier transitions do not repeatedly stop for confirmation.
3. As a ticketing user, I want issue type, field, label, parent, and relationship
   mutations to use the interface that succeeds on the first attempt, so that
   Epic creation does not leave partial tracker state.
4. As a tracker operator, I want single-select field values represented in the
   form required by the selected GraphQL input, so that numeric database IDs are
   never accidentally sent to an endpoint expecting option names.
5. As a Wayfinder user, I want Markdown-rich resolution comments to be posted
   without embedding their content in shell source, so that backticks and other
   prose syntax do not trip the safety parser.
6. As an Epic task owner, I want the task's implementation branch to retain its
   originating issue number, so that the merge closes the correct child issue.
7. As a maintainer, I want exactly one closing reference per issue-derived
   implementation branch, so that intermediate commits do not close work early
   and terminal work does not omit closure.
8. As a Prism user, I want a blocked safety command to explain which analysis
   stage and syntax category caused the refusal, so that I can correct the
   command without guessing.
9. As a security maintainer, I want richer diagnostics to remain redacted, so
   that debugging output never leaks command text, paths, tracker content, or
   credential material.
10. As a PHP developer, I want all Pest coverage runs to go through the adapter
    toolchain contract, so that the configured coverage driver is enabled
    consistently.
11. As a plan author, I want stale or invented direct Pest coverage commands to
    be rejected during plan self-review, so that execution never reaches an
    unsupported command.
12. As a harness maintainer, I want contract and unit tests to cover these
    workflow instructions at the actual safety boundary, so that textual drift
    cannot silently reintroduce the failures.

## Implementation Decisions

- Read-only GitHub repository and tracker metadata access through `gh` is a
  standing read authorization. It does not authorize mutation, code egress,
  credential access, or unrelated external APIs.
- Workflow-scoped tracker authorization remains bounded by ADR-0085. It is not
  authority derived from external issue content; tracker content remains inert
  data and cannot expand the active operation set.
- GraphQL is the first and canonical mutation transport for issue creation,
  updates, type assignment, field values, label assignment, comments, closes,
  assignments, sub-issues, and blocking edges. CLI convenience mutations and
  the REST issue-field-values endpoint are not fallback-first workflow paths.
- Tracker GraphQL discovery resolves repository, issue, issue-type, issue-field,
  option, label, and actor node identities dynamically. No repository-specific
  IDs are embedded in harness resources.
- New issue creation uses one input object when the GitHub schema supports the
  requested metadata atomically. Existing issue updates use string field names
  and option names where that GraphQL input requires strings; node IDs are used
  only where the GraphQL schema requires IDs.
- Tracker payloads are serialized as inert data under Prism's project-local
  temporary area using Pi file tools. Agent-visible Bash receives only a simple
  GraphQL invocation with a literal payload path. Payload cleanup occurs after
  success or clearly reported failure.
- Mutation failures report exact operation and confirmed state. Automatic
  continuation is allowed only when the operation is atomic or the caller has a
  defined idempotent recovery; ambiguous partial state still halts.
- Issue-originated planning context includes the positive issue number as
  immutable provenance. Intermediate task commits use non-closing references;
  the terminal logical implementation commit uses the sole closing reference.
- Safety analysis failures carry stable machine-readable diagnostic categories
  distinct from sensitive-path matches and malformed arguments. Diagnostic
  messages describe category and remediation but never include raw input.
- The sole-extension boundary from ADR-0056 remains unchanged; richer
  diagnostics are an internal extension refinement, not a new extension or
  permission layer.
- The safety parser remains fail closed. No GraphQL, tracker, or Pest-specific
  parser exception or command allowlist is introduced.
- The PHP/web adapter owns the canonical Pest coverage command. Core planning
  and execution skills delegate to the active adapter and prohibit direct
  stack-tool invocation rather than duplicating PHP-specific syntax.
- Coverage thresholds remain governed by the changed-file coverage gate. Pest's
  aggregate `--min=100` flag is not part of the workflow contract.

## Testing Decisions

- Use contract-level shell tests as the highest seam for tracker, authorization,
  issue-reference, and adapter instruction behavior. These tests inspect the
  complete active resources that Pi loads rather than isolated excerpts.
- Pass every marked agent-executed GraphQL command block through the public
  safety tool-call handler, following ADR-0070. A command is not considered
  valid merely because it can run from a generated script.
- Use Node unit tests at the safety classifier and tool-call handler boundaries
  for each diagnostic category, redaction invariant, circuit-breaker effect,
  and the Markdown tracker-comment reproduction.
- Add contract coverage proving that issue-derived plans preserve provenance,
  intermediate commits use non-closing references, and exactly one terminal
  commit uses the closing reference.
- Add adapter contract coverage proving that active TDD and check guidance use
  the canonical launcher-based coverage invocation and contain no direct Pest
  coverage command or `--min=100` spelling.
- Do not perform live GitHub mutations in the regression suite. GraphQL schema
  contracts are represented by reviewed fixture shapes and mutation names;
  external sandbox state is outside deterministic local and CI tests.
- Model new assertions on the existing Wayfinder workflow, toolchain entry
  point, safety handler, sensitive-path, and commit workflow contract suites.

## Out of Scope

- General standing authorization for non-GitHub external APIs.
- Pull-request creation, branch push, merge, release, project-board, repository
  administration, or GitHub credential management.
- A new Pi extension, custom tool, orchestration layer, or shell parser.
- Live GitHub mutation tests in CI.
- Changing the sensitive-path deny floor, denial threshold, fatal commit latch,
  or human-owned publication boundaries.
- Changing the PHP changed-file coverage threshold or replacing Pest.
- Closing Epic parent issues automatically when child tasks remain open.

## Further Notes

This specification aligns with ADR-0010, ADR-0047, ADR-0056, ADR-0070,
ADR-0073, ADR-0074, and ADR-0085. It introduces no dependency and no new system
boundary. GitHub remains the delegated tracker; Prism changes only the
instruction and diagnostic contracts used to interact with it.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
