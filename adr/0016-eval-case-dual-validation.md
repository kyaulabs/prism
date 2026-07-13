# $KYAULabs: 0016-eval-case-dual-validation.md kyau@nova 2026/07/12 -0700 Exp $

# 0016. Eval Case Dual Validation: schema.json Canonical, validate() Hand-Rolled Mirror Guarded by Parity Test

Date: 2026-07-12

## Status

Accepted

## Context

`schema.json` (JSON Schema draft 2020-12) defines the canonical shape of an
eval case but was enforced by nothing — zero code references to it anywhere in
the project. `EvalCase::validate()` is a hand-rolled duplicate whose docblock
falsely claims to validate "against the schema." The two have diverged in both
directions (issue #89):

- `validate()` skips `name`/`agent` pattern checks and array item-type checks
  that `schema.json` requires.
- `validate()` adds a reverse-mismatch lint rule (reject `expected_string` when
  `pass_criteria` ≠ `"output contains expected string"`) that `schema.json`
  lacked.

Additionally, the eval CLI (`run-eval.php`) spawns inside disposable git
worktrees (`EvalRunner.php` `Runner::createWorktree()`) that may lack a
populated `vendor/`, making a runtime JSON-schema validator dependency fragile.

## Decision

`schema.json` is the single source of truth. `validate()` remains hand-rolled
(no runtime dependency → worktree-safe) but is reconciled to exactly mirror the
schema's constraints. A Pest parity test (`EvalCaseSchemaParityTest`) guards
against future drift: adding a constraint requires a matching `validate()`
update in the same commit or CI fails. `opis/json-schema` is added to
`require-dev` only, backing two tests: (1) a conformance test validating every
`evals/smoke/*.json` against `schema.json`; (2) the parity test fixture
battery. The reverse-mismatch lint rule (reject `expected_string` when
`pass_criteria` ≠ `"output contains expected string"`) is incorporated into
`schema.json` via an `else: { not: { required: ["expected_string"] } }` branch
so both sources agree. The `validate()` docblock is corrected to accurately
describe the method. `run-suite.php`'s separate discovery parse path is
deferred as a follow-up issue (out of scope for #89).

## Consequences

### Positive

- `schema.json` is now CI-enforced and is the canonical reference for any eval
  case author.
- Drift between the two validation sources is detected by the parity test on
  every CI run.
- No runtime dependency added to the eval CLI — `run-eval.php` and
  `run-suite.php` remain autoload-free inside disposable worktrees.

### Negative

- Two implementations must be kept in sync (`schema.json` + `validate()`).
  Adding a constraint is a two-file change.
- The parity test must be updated when either source changes.

### Neutral

- `opis/json-schema` exists only in `require-dev`; it is never loaded at eval
  runtime.

## Alternatives Considered

### Make `validate()` schema-driven at runtime via opis

Rejected: couples `run-eval.php` to `vendor/` availability inside disposable
git worktrees. A worktree without `composer install` would crash the eval CLI.

### Hand-rolled mini schema validator in PHP

Rejected: reinvents the JSON Schema draft 2020-12 spec; would itself drift
from `schema.json`; defers the problem rather than solving it.

### npm `ajv` validator

Rejected: introduces a second toolchain (Node.js) for a PHP-first subsystem;
tests would live outside Pest/CI's PHP pipeline.


// vim: ft=markdown sts=4 sw=4 ts=4 et :
