<!-- 
  This template helps you structure your PR description.
  Replace the placeholder text (in angle brackets like <...>) 
  with your own details. Comments like this one are hidden 
  from the final PR description.
-->

## 📋 Summary

<!--
  Briefly describe what this PR does and why.
  Aim for 2–5 sentences that capture the essence of the change.
  Example:
  "Three intertwined changes that together eliminate documentary-only conventions
  in the harness and replace them with mechanical enforcement + runtime resolution:
  1. Git Flow branch naming is now enforced...
  2. Signed-off-by is now resolved dynamically...
  3. Three config files consolidated into prism.jsonc..."
-->

## 📦 Changes by Phase

<!--
  Group your changes logically, often by feature area or phase.
  List new files, modified files, deleted files, and tests per group.
  Use bullet points or subheadings. Example structure:
  ### Phase A — Branch naming enforcement
  - New: `script.sh`, `test.sh`
  - Modified: `hook`, `docs`
  - Tests: `suite` (X cases)
-->

## 📜 ADRs

<!--
  List any Architecture Decision Records that are new, amended, or superseded.
  Use a table or bullet list. Example:
  | ADR | Action |
  |-----|--------|
  | 0028 (new) | Git Flow branch naming — Accepted |
  | 0007 | Partially superseded by 0029 |
-->

## ✅ Verification

<!--
  Summarize how you validated the changes. 
  Include results from automated checks (linters, tests, coverage) 
  and any manual verification steps.
  Example:
  | Gate | Result |
  |------|--------|
  | /check PHP CS Fixer | PASS |
  | Pest --coverage | 290 passed / 1 environmental fail |
  | @code-review | GO |
-->

## 🏗️ Architect Conditions (if applicable)

<!--
  If this PR was pre‑validated by an architect (e.g., via @architect),
  list each condition and how it was addressed.
  Example:
  1. ✅ jq dependency: graceful degradation + /doctor check
  2. ✅ v1→v4 schema migration: idempotent migrate script
  Leave blank or delete this section if not applicable.
-->

## 📝 Commits (<# total>)

<!--
  Optionally list the commit SHAs and subjects, or just mention the count.
  Example:
  Atomic, conventional‑commits‑formatted, signed.
  Total: 17 commits (list them if helpful)
-->

## 🧪 Test Plan

<!--
  Provide a clear, step‑by‑step list of commands or actions 
  a reviewer can run to verify your changes work as expected.
  Use bullet points with code blocks if needed.
  Example:
  - [ ] `pi --list-models deepseek-v4-flash` — primary model is available
  - [ ] `bash packages/prism-core/scripts/new-branch.sh feat test-branch` — creates correct branch
  - [ ] `bash packages/prism-core/scripts/validate-branch-name.sh feat/your-name-hash-desc` — exit 0
  - [ ] `bash packages/prism-core/scripts/resolve-identity.sh` — prints your identity
-->
