# 0064. Slim Commit Footers; `Tested-by` Sourced from OCR Config

Date: 2026-08-14

## Status

Accepted

Supersedes the footer clauses of ADR-0031 and ADR-0040 (both opencode-era
records, already superseded where moot by ADR-0057 for the pi harness).
Amends ADR-0010's ordering rule (anchor moves from `Authored-by:` to
`Implemented-by:`). Depends on ADR-0029 (identity resolution), ADR-0047 /
ADR-0056 (sensitive-path deny floor), ADR-0057 (single-model manual
cycling), ADR-0063 (OCR as mandatory external prerequisite).

## Context

The pi harness (ADR-0057) runs a single primary model
(`deepseek/deepseek-v4-flash`) with one judge (`deepseek/deepseek-v4-pro`)
reachable via manual Ctrl+P cycling. Under this design the planning and
implementation attribution converge: the same session model plans and
implements, so `Authored-by:` (the planning model, ADR-0031/0040) routinely
duplicates `Implemented-by:`. The four-footer set carries attribution
overhead without separation.

`Tested-by:` is also mis-sourced. It is defined as "the active review model —
the judge if cycled for review, else the primary", which conflates review
attribution with remembered session state. Meanwhile the harness's external
review tool, Open Code Review (`ocr`, `@alibaba-group/open-code-review`), is
a mandatory external core prerequisite (ADR-0063) with its own configured
LLM model recorded in `~/.opencodereview/config.json` (top-level `model`
key). Commit metadata should record the model the review tool actually uses,
not a remembered session cycle.

`~/.opencodereview/config.json` is a credential-bearing path on the
immutable deny floor (ADR-0047: class `review-config`; the file holds the
provider API key). Any resolution mechanism must extract exactly one
non-secret value and never expose the key to the agent.

## Decision

### 1. Three required footers

Every non-merge, non-revert commit must include, in order:

`Implemented-by:` → `Tested-by:` → `Signed-off-by:`

- `Implemented-by:` — the model pi is using (the active session model; bare
  ID segment after the last `/`).
- `Tested-by:` — the model open-code-review is configured with, resolved by
  the first-party script `packages/prism-core/scripts/resolve-ocr-model.sh`
  (bare ID segment after the last `/`).
- `Signed-off-by:` — the human user, resolved via
  `packages/prism-core/scripts/resolve-identity.sh` (ADR-0029).

`Authored-by:` is removed. Issue references (`Fixes:`/`Refs:`) sit at the
top of the footer block, immediately above `Implemented-by:` (ADR-0010
ordering preserved, anchor re-pointed). Each model footer is the model ID
segment after the last `/` (e.g. `deepseek/deepseek-v4-flash` →
`deepseek-v4-flash`).

### 2. `resolve-ocr-model.sh` — redaction-safe single-key resolver

The script mirrors `resolve-identity.sh` in shape and failure posture:

- Reads `~/.opencodereview/config.json` (override: `PRISM_OCR_CONFIG` env
  var — the test seam; production always uses the default path).
- Parses with Node `JSON.parse` (Node ≥22 guaranteed by the package
  toolchain; no jq dependency).
- Extracts ONLY the top-level `model` key; validates it against
  `[A-Za-z0-9._/-]+`; prints the bare segment after the last `/`.
- Never prints the raw file, `providers.*`, `api_key`, or any other field.
  Node stderr is discarded so stack traces and file content cannot leak.
- Fails closed (exit 3, empty stdout) when: config missing / not a regular
  file, JSON unparseable, `model` missing/empty/invalid. Error messages are
  generic; they never include file contents or the API key.
- The deny floor is unchanged: the agent may never read
  `~/.opencodereview/` directly; the script is the sole sanctioned channel
  and its stdout is exactly one non-secret value.

### 3. Enforcement

`commitlint.config.cjs` `trailers-exist` requires
`['Implemented-by:', 'Tested-by:', 'Signed-off-by:']`. The
`issue-ref-convention` rule re-anchors on `Implemented-by:` (constant
renamed `AUTHORED_BY_RE` → `IMPLEMENTED_BY_RE`). Merge/revert exemption
unchanged.

## Consequences

**Positive:**
- Attribution slims to three trailers carrying distinct signal; `Authored-by:`
  duplication disappears.
- `Tested-by:` mechanically resolves to the model OCR actually reviews with —
  no remembered-cycle source, no conflation with the session model.
- The API key stays on the deny floor; the resolver emits one non-secret
  value and is canary-tested against key leakage.
- Fail-closed resolution matches OCR's mandatory NO-GO status (ADR-0063): a
  missing/malformed OCR config halts footer resolution with a clear message
  pointing at `ocr config model`, rather than fabricating a value.

**Negative:**
- `Tested-by:` is fixed-source uniform (like the previous footers): a
  docs-only commit carries OCR's configured model even though no OCR review
  ran — the same fixed-source imprecision the harness already accepted
  (ADR-0031/0040). Dynamic per-commit re-sourcing remains out of scope.
- Commit-msg-hook-adjacent flows (pr.md title validation, release.md) now
  depend on OCR config presence; they fail closed with a clear message when
  it is absent.
- The resolver is outside the harness-layer guarantee for its internal read
  (ADR-0047 residual risk: helper script whose operand is the script, not
  the credential) — mitigated by single-key extraction, stderr discard,
  fail-closed output, and the canary leakage test.

**Neutral:**
- ADR-0010's ordering rule survives re-anchored.
- Aurora submodule's own commitlint config is untouched (separate repo).

## Alternatives Considered

- **Documented fixed convention** ("Tested-by: the model OCR is configured
  with, operator-maintained"): rejected by the operator — no mechanical
  source; drift risk between OCR config and docs.
- **Env var mirroring OCR config** (e.g. `PRISM_OCR_MODEL`): rejected — new
  config surface and a sync burden; the harness just retired the
  `OPENCODE_MODEL_*` vars (ADR-0057).
- **Read OCR config via the agent directly**: rejected — violates the
  immutable deny floor (ADR-0047).
- **Dynamic per-commit footer re-sourcing**: rejected in ADR-0040; retained
  fixed-source for consistency.

## Cross-references

- ADR-0031, ADR-0040 (footer clauses superseded; opencode-era)
- ADR-0010 (preserved; ordering anchor re-pointed)
- ADR-0029 (Signed-off-by resolution)
- ADR-0047, ADR-0056 (deny floor, residual-risk model)
- ADR-0057 (single-model manual cycling)
- ADR-0063 (OCR mandatory external prerequisite)
- Spec: `docs/specs/2026-08-14-commit-footer-slim-spec.md`

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
