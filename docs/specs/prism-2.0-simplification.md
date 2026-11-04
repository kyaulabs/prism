# Prism 2.0 simplification implementation

Release note: the owner subsequently selected **1.2.1** instead of the provisional
2.0.0 version. This completed implementation report retains its original version
label as history; see [1.2.1 migration](../migration-1.2.1.md) for release guidance.

## Scope and starting point

Implemented the owner-supplied simplification handoff on
`feat/kyau-40ce10-manual-refactor`, starting at `ace0834b`. The four existing
worktree edits were the owner's starting changes, not a patch to reapply.
The shortened TDD semantics survive, with byte-zero YAML frontmatter and the
handoff's narrow explicit experiment exception.

Core now owns shared policy. Retained skills own task techniques; modules own
language/tooling knowledge. Core exposes 18 skills/13 prompts, PHP/web 13/3 and
C++ 4/1. The three manifests prepare coordinated 2.0.0 packages. No registry
publication or new runtime machinery is part of this implementation.

See [migration](../migration-1.2.1.md) for the resource-name map and consumer filters.
Installer, context ownership, source reconciliation and both extension
implementations remain unchanged. Historical ADRs, completed plans and previous
release sections remain history. Moved source credits survive in skill metadata,
the architecture reference and NOTICE.

## Verification

- Red: updated packed-resource expectations failed on all three old skill sets
  for the expected extra/renamed resources before migration.
- Green: packed-resource and native-continuity checks passed after migration.
- `bash packages/prism-core/scripts/validate-harness.sh`: 52 resources, zero errors.
- `npm run typecheck`: passed.
- `npm run test:node`: 256 tests, 255 passed, zero failed, one skipped. This command
  includes real Pi host integration, packed discovery/coexistence, filters/reload,
  context migration/reconciliation, installation, secret guard/recovery and bounded
  web-access suites. Native Clang fixtures ran successfully. The optional locked
  Conan lane skipped because `PRISM_CPP_CONAN=1` and Conan were not provided;
  dedicated required native CI remains authoritative for that lane.
- `bash tests/Shell/run-all.sh`: passed.
- Packed-resource tests launched from `/tmp`: passed, including all package skill
  and prompt sets, byte-zero frontmatter and shipped skill-link resolution.
- Markdown lint and `git diff --check`: passed after correcting reference spacing.

No separate host run was needed locally because the full Node command includes
it. PHP/frontend source behavior did not change; local PHP/browser/style checks
were not repeated for prose/resource edits. Required remote CI gates still apply.

## Contract inspection, not model evaluation

The handoff's eight scenarios were inspected statically against the shared policy,
retained skills and prompts:

1. Scoped inspection and focused checks replace whole-repository/onboarding chains.
2. Analysis, review and planning preserve read-only scope unless implementation or
   tracker mutation is separately authorized.
3. TDD requires the intended behavioral Red; prose does not manufacture Red.
4. Only an explicit isolated disposable experiment uses recorded evidence;
   production promotion requires normal TDD.
5. Standing delivery authority is reused; installing Core or reading an issue
   does not grant remote permissions.
6. Cleanup requires task ownership, confirmed merge and no additional work, with
   protected and unrelated branches preserved.
7. Missing context/modules lead to native project inspection, not a setup gate.
8. Review feedback is verified; missing evidence is never reported as passing.

These are instruction-contract findings, not measured model success rates or an
executed eight-scenario model benchmark. Runtime tests establish only their tested
host, packaging and protection behavior, not universal behavioral equivalence.

## Review

Same-session milestone review compared the changed resource surface, current
callers, packed tests and handoff requirements. Corrections included stale debug
review timing, PHP commit-authorization wording, Markdown spacing and explicit
PHP prompt-set expectations. Affected checks were repeated. This is not an
independent review; repository PR approval and post-creation current-head Test Plan
execution remain separate delivery requirements.
