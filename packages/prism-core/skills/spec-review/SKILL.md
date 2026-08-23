---
name: spec-review
description: Use for a read-only requirement-coverage review. Finds the spec for the current branch and reports whether each acceptance criterion is covered by the diff. Reports findings and never auto-fixes.
---

Perform a **spec review**. Check whether the current diff covers the
acceptance criteria defined in the relevant spec file. This complements the
`code-review` tooling, structural, and security axes with distinct
requirement-traceability analysis.

## Spec discovery

1. Resolve the current branch name (`git branch --show-current`).
2. Extract the `<description>` segment from the branch name. Branch pattern:
   `<type>/<username>-<hash>-<description>` (e.g.
   `feat/kyau-e27316-code-review-coordinator` → description is
   `code-review-coordinator`). `hotfix/` and `release/` branches follow their own
   patterns; see ADR-0028.
3. fuzzy-match the description against `docs/specs/*.md` filenames:
   - Strip the `YYYY-MM-DD-` date prefix from each spec filename.
   - Strip the `-spec` suffix if present.
   - Compare the cleaned stem against the branch description (case-insensitive,
     hyphen-insensitive substring match).
4. If exactly one match is found, proceed to requirement coverage analysis.
5. If zero matches or multiple matches, produce the completed informational
   outcome `COMPLETE_NO_SPEC`: "no spec found — requirement-coverage completed
   without a matched spec." This is not a failed or skipped axis.

## Requirement coverage analysis (when a spec is found)

1. Read the matched spec file.
2. Extract the acceptance criteria — look for numbered lists under a heading
   like "Acceptance Criteria" or "Requirements", or bullet points prefixed
   with `AC #`.
3. For each criterion:
   - Inspect the diff (files changed, functions added/modified).
   - Classify as:
     - **Covered** — the diff includes code that fulfills this criterion.
     - **Omitted** — the criterion has no corresponding code in the diff.
     - **Deliberately-omitted** — the criterion is marked as out-of-scope in
       the spec or a plan (e.g., "not in scope for this PR").
4. Report findings grouped by file/section, with the criterion text and its
   classification.

## Output format

```
## Spec Review — Requirement Coverage

Spec: docs/specs/<matched-file>.md

### Covered
- AC #1: <criterion text>
- AC #3: <criterion text>

### Omitted
- AC #2: <criterion text>
  → No corresponding implementation found in the diff.

### Deliberately-omitted
- AC #4: <criterion text>
  → Noted as out-of-scope in the spec.

### Summary
3 of 4 criteria covered (75%). 1 omitted, 0 deliberately-omitted.
```

## Rules

- Never auto-apply fixes. Report and stop.
- If the diff is empty, report: "Empty diff — requirement coverage not
  applicable."
- Report only against the diff — do not audit the entire codebase.
- If no spec is found, that is NOT an error. Report it and move on.

## Gotchas

- *Treating no matching spec as a failure* — report it as informational and
  leave the axis incomplete; do not invent requirements.
- *Auditing the whole repository* — classify only what the selected diff
  proves about the matched spec.
