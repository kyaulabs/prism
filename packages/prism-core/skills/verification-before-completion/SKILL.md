---
name: verification-before-completion
description: Use before reporting completion. Check the requested behavior, run relevant tests and lint, and distinguish actual results from unavailable or skipped checks.
derived-from: obra/superpowers (MIT, © Jesse Vincent)
---

# Verification Before Completion

Report what was demonstrated, not what is expected to work.

1. Compare the changes with the requested outcome. For a bug, rerun the original
   reproduction and regression test. Inspect relevant integration points.
2. Run focused tests and the broader applicable suite. Check module/project
   coverage requirements where relevant. Discover commands from project files
   and module guidance; an absent module is not a reason to stop code inspection.
3. Run applicable lint, formatting and asset checks. Note new dependencies and
   ensure their manifests/lockfiles agree. Missing unrelated tools do not block.
4. Inspect the diff for unintended edits and temporary debug artifacts. Follow
   project source conventions and preserve unrelated work.
5. Inspect staged paths before content and use available redacted secret scanning.
   Never read credential blobs or print matches. Do not claim perfect secret detection.
6. Report commands, outcomes and important limitations concisely. Distinguish
   PASS, FAIL, not applicable and not run. Never report unavailable checks as green.

Reuse fresh results for unchanged code; rerun checks affected by later edits.
Do not require a clean unrelated working tree, global tool readiness, receipts,
or a second identical check just because another workflow calls this skill.

## Cross-refs

`tdd` supplies regression evidence; `code-review` examines non-trivial completed
work; `conventional-commits` commits verified logical changes.

## Gotchas

- A user's decision to skip a check changes scope, not its result.
- A passing focused test does not prove deployment, integration or all requirements.
- If verification fails, investigate the cause rather than repeating blindly.
