# Spec: Slim Commit Footers to Implemented-by / Tested-by / Signed-off-by

**Date:** 2026-08-14
**Status:** Approved

## Problem Statement

Every non-merge, non-revert commit currently requires four attribution
trailers: `Authored-by:`, `Implemented-by:`, `Tested-by:`, and
`Signed-off-by:` (ADR-0031, ADR-0040). The `Authored-by:` trailer was
introduced in the opencode era to attribute the planning model separately
from the implementation model. Under the pi single-model, manual-cycling
design (ADR-0057) the planning and implementation attribution have converged
— the same session model plans and implements — so `Authored-by:` and
`Implemented-by:` routinely carry the same value and add traceability
overhead without separation.

The `Tested-by:` trailer is also mis-sourced. It is defined as "the active
review model — `deepseek-v4-pro` if cycled for review, else the primary",
which conflates the review model with the session model and requires the
operator to remember which model they cycled to. Meanwhile, the harness's
actual external review tool — Open Code Review (`ocr`,
`@alibaba-group/open-code-review`) — has its own configured model, recorded
in `~/.opencodereview/config.json`. The commit metadata should record the
model the review tool actually uses, not a remembered session state.

## Solution

1. Reduce the required commit trailer set from four to three:
   `Implemented-by:`, `Tested-by:`, and `Signed-off-by:`.
   `Authored-by:` is dropped entirely — no replacement.
2. Re-source `Tested-by:` from OCR's configuration: the value is the model
   OCR is configured to review with, resolved by a new first-party resolver
   script `packages/prism-core/scripts/resolve-ocr-model.sh` that reads
   **only** the top-level `model` key from `~/.opencodereview/config.json`.
3. `Implemented-by:` remains the model pi is using — the session model
   (`PI_MODEL`, bare segment after the last `/`).
4. `Signed-off-by:` is unchanged — resolved via
   `packages/prism-core/scripts/resolve-identity.sh`.
5. Enforced footer order: `Fixes:`/`Refs:` → `Implemented-by:` →
   `Tested-by:` → `Signed-off-by:`.

## Goals

- Slim commit attribution to the three trailers that carry distinct signal.
- Make `Tested-by:` mechanically resolve to the model OCR actually uses,
  eliminating the remember-the-cycle source.
- Keep the credential deny floor intact: the agent never reads
  `~/.opencodereview/config.json`; the resolver emits only the model value
  and can never emit the API key.

## Non-Goals

- No change to merge/revert trailer exemption (auto-generated messages).
- No change to `Signed-off-by:` resolution.
- No change to the Aurora submodule's own commitlint config (separate repo).
- No change to other commitlint rules (`type-enum`, `header-max-length`,
  `issue-ref-convention` semantics beyond the anchor rename).
- No dynamic per-commit footer re-sourcing (explicitly rejected in
  ADR-0040); `Tested-by:` is applied uniformly on every commit, including
  docs-only commits, matching the existing fixed-source convention.

## Design

### 1. Resolver script: `packages/prism-core/scripts/resolve-ocr-model.sh`

Mirrors `resolve-identity.sh` in shape and failure posture.

**Behavior:**

- Default config path: `~/.opencodereview/config.json`.
- Override: `PRISM_OCR_CONFIG` environment variable (test seam; tests use a
  synthetic canary fixture, never the real config).
- Parse: Node.js `JSON.parse` on the file contents. Node ≥22 is guaranteed
  by the package toolchain (`engines`), so no `jq` dependency.
- Extraction: read **only** the top-level `model` key.
- Output: the bare model-id segment after the last `/` (e.g.
  `deepseek/deepseek-v4-flash` → `deepseek-v4-flash`), matching the
  ADR-0040 footer convention.
- Never emit: the raw file, `providers.*`, `api_key`, or any other field.
  Node stderr is discarded on failure — no stack traces, no file content.
- Fail closed (exit 3, like `resolve-identity.sh`) when:
  - the config file does not exist or is not a regular file;
  - the file cannot be parsed as JSON;
  - the top-level `model` key is missing, not a string, or empty.

**Security posture (canonical):**

1. The safety extension deny floor (`~/.opencodereview/`, class
   `review-config`) remains in force — the agent cannot `read`/`grep`/`cat`
   the config directly.
2. The script is the sole channel between the config and the agent, and it
   is extraction-only: stdout carries exactly the bare model id.
3. Every error path is silent-output, non-zero-exit.
4. A canary test asserts the script's output never contains the fixture's
   redacted key string; any future regression that leaks the key fails CI.

### 2. Commitlint config: `packages/prism-core/config/commitlint.config.cjs`

- `trailers-exist` required list:
  `['Authored-by:', 'Implemented-by:', 'Tested-by:', 'Signed-off-by:']`
  → `['Implemented-by:', 'Tested-by:', 'Signed-off-by:']`.
- `issue-ref-convention`: the anchor for "`Fixes:`/`Refs:` must precede the
  first model trailer" moves from `Authored-by:` to `Implemented-by:`.
  Rename the `AUTHORED_BY_RE` constant accordingly (e.g.
  `IMPLEMENTED_BY_RE`); violation messages updated to name
  `Implemented-by:`.

### 3. Docs

- `packages/prism-core/AGENTS.md` — footer bullet (lines ~157–166, 174–175):
  three trailers; `Tested-by:` sourced via
  `bash packages/prism-core/scripts/resolve-ocr-model.sh`.
- `packages/prism-core/skills/conventional-commits/SKILL.md` — "Required
  Footers" section, all examples, enforcement note.
- `packages/prism-core/skills/tdd/SKILL.md`,
  `packages/prism-core/skills/writing-plans/SKILL.md`,
  `packages/prism-core/skills/resolve-merge-conflicts/SKILL.md` — footer
  mentions.
- `README.md` — footer token list, examples, ADR-0040 note.
- `CONTRIBUTING.md` — trailers list.
- `CONTEXT.md` — "four commit-attribution footers" reference updated.

### 4. Prompts

- `packages/prism-core/prompts/pr.md` — synthetic PR-title validation
  trailers: remove `Authored-by:`; source `Tested-by:` from
  `resolve-ocr-model.sh` (fail closed with a clear message if it exits 3).
- `packages/prism-core/prompts/release.md` — release-commit message: same
  change.
- `.github/hooks/commit-msg` — the `$'...'` example block in the
  backslash-n error message: drop `Authored-by:`.

### 5. Tests

- **New** `tests/Shell/resolve-ocr-model_test.sh` + canary fixture
  `tests/Shell/fixtures/ocr-config.json`:
  - valid config → bare model id on stdout;
  - missing config file → exit 3, no stdout;
  - malformed JSON → exit 3, no stdout;
  - missing `model` key → exit 3, no stdout;
  - `model` not a string / empty → exit 3, no stdout;
  - provider-prefixed model (`deepseek/deepseek-v4-flash`) → bare segment;
  - canary assertion: output never contains the fixture's `api_key` value.
- `tests/Shell/commit-msg_test.sh` — 18 `Authored-by:` fixtures: remove the
  trailer, keep the rest.
- `tests/Shell/commit_template_footer_test.sh` — footer-presence
  assertions.
- `tests/Shell/release_workflow_test.sh` — release-cmd footer checks.
- `tests/Shell/pr_command_test.sh` — title-validation trailer assertions.

### 6. ADR

New ADR (next number, `0064`): "Slim commit-attribution footers to
Implemented-by / Tested-by / Signed-off-by; source Tested-by from OCR
config". Supersedes the footer clauses of ADR-0031 and ADR-0040 where they
conflict. ADR-0010's ordering rule survives, re-anchored to
`Implemented-by:`.

## Edge Cases

- OCR config missing/malformed at commit time → `resolve-ocr-model.sh`
  exits 3; prompts (pr.md, release.md) halt with a message pointing at
  `ocr config model`. Consistent with OCR being a mandatory NO-GO toolchain
  prerequisite (ADR-0063).
- Config present but `model` empty or non-string → treated as missing,
  exit 3.
- Provider-prefixed model id → normalized to bare segment (ADR-0040).
- `PI_MODEL` unset in pr.md/release.md → fail-closed handling unchanged
  from today.

## Verification

- Resolver shell tests green, including the canary no-key-leak assertion.
- Existing `commit-msg`, `commit_template_footer`, `release_workflow`, and
  `pr_command` Shell suites green with updated fixtures.
- `/check` passes (prism repo's PHP adapter gate applies to this checkout).
- `code-review` before push.

## Cross-References

- ADR-0031 (referenced, footer clauses superseded) — model rebalance +
  footer rename.
- ADR-0040 (referenced, footer clauses superseded) — `Implemented-by:`
  addition.
- ADR-0010 (referenced, preserved) — issue-closing keyword + ordering.
- ADR-0057 (context) — single-model manual-cycling design.
- ADR-0063 (context) — OCR as mandatory external prerequisite.
- ADR-0047 / ADR-0056 (security context) — sensitive-path deny floor.
