# OCR removal implementation

Approved scope: `docs/specs/2026-09-02-prism-review-authority-cutover-spec.md`.

The user explicitly approved proceeding locally despite installed reviewer doctor returning `RUNTIME_READINESS_FAILED`. Installed authority verification and final review remain pending. No installation, provider changes, push, or GitHub mutation is authorized.

- [x] Derive both ordinary commit model trailers from validated `PI_MODEL`.
- [x] Remove the external tool and connectivity contract; keep Semgrep.
- [x] Replace legacy review dispatch and PR acceptance with version-two evidence.
- [x] Retain legacy consent as read-only input; publish web-only schema three with explicit migration approval.
- [x] Remove obsolete scripts, fixtures, and current workflow references; preserve historical ADRs and changelog.
- [x] Update regression tests and run local verification.
- [x] Prepare verified changes for the atomic cutover commit; report installed review as pending.

## Approved review-policy follow-up

After the removal commit, the user approved two automatic review attempts per
active task, followed by fresh approval for each later attempt. ADR-0112 and
`packages/prism-core/docs/review-attempt-policy.md` own the amendment. Failures
count; local checks, valid receipt reuse, repairs, and continuation do not reset
the budget. Review remains mandatory and the installed-authority checkpoint
below remains pending. The coordinator instructions and workflow contract tests
are updated together; no runtime consent service or new dependency was added.
Verification passed: all seven affected shell contract suites, focused Node
cutover/package tests, the harness validator, and staged Markdown lint.

## Local evidence

- Full Node suite: 1,303 tests passed. The subsequently added post-review managed-health regression and focused cutover/PR suite also pass (28 tests).
- Shell workflow suites pass, including the validator mutation suite (18 assertions); that slow suite was rerun successfully with a sufficient timeout.
- Harness validator, staged Markdown lint, pre-commit hooks, and whitespace checks pass.
- No new dependencies or lockfile package entries. Historical ADRs, dated research snapshots, migration parsing, and credential-path protection intentionally remain; none grants review authority or runs the retired tool.

## Commit blocker diagnosed after reload

The installed launcher's preliminary pre-commit proof inherited the generic
30-second subprocess timeout. Reproduction returned `ETIMEDOUT` at 30,010 ms,
although the hook passed when allowed to finish. The checkout now gives the
proof the same bounded 300,000 ms timeout as Git commit. The regression failed
before the fix and all 27 commit-command tests pass afterward. The real hook
passed in 32,875 ms with the corrected timeout. The human refreshed the global
launchers; `prism-tool` now selects this checkout and local doctor passes with
Semgrep as its only external prerequisite.

No agent changed global packages, credentials, consent, or model configuration.
The checkout launcher can create ordinary commits but is not an external stable
review authority. Installed deterministic `/check`, immutable criteria capture,
authoritative review, and PR preparation remain pending the human-owned package
readiness checkpoint. This plan and the approved spec remain available for that
checkpoint.
