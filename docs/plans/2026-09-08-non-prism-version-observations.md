# Non-Prism version observations

Approved scope: remove runtime version blockers for every non-Prism tool,
language runtime, and Pi SDK. Pi is not exempt from this removal. Preserve
Prism package/protocol/receipt compatibility, dependency pins and lockfile
consistency, audits, provenance, required capabilities, and actual quality gates.

## Implementation

- Replace external-tool version comparisons with bounded best-effort metadata.
  Missing executables still fail. Unknown versions are null, never invented.
- Remove installed bundled-tool equality checks and PHP runtime numeric floors.
- Remove Pi SDK numeric compatibility checks; keep import/API/provenance checks.
- Remove native command version matching from adapter installed verification.
  Keep requested manifest/lock graph consistency, not reported-version parity.
- Make quality-command version probes best-effort and retain observed versions
  in validated receipts; unknown external-tool versions have an explicit null.
- Update tests, active instructions, and an ADR; verify against actual Pest's
  differing reported version without changing its installed package.

## Boundaries

No dependency installation, provider/model change, credential handling, audit
waiver, fake PASS, or automatic push/PR/merge is authorized. Earlier bootstrap
approval is not reusable after HEAD changes. The five diagnosed quality issues
remain separate; this work addresses the Pest reported-version blocker but does
not establish that its coverage tests pass.
